import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { currencyScale } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  AccountingPostingService,
  SYSTEM_ROLES,
  type SystemRole,
  type Tx,
} from '../common/accounting-posting.service';
import { ERROR_CODES, badRequest, conflict, notFound } from '../common/errors';
import {
  BankTransferGateway,
  BenefitPayGateway,
  CardTerminalGateway,
  CashGateway,
  OnlineCardGateway,
  type PaymentGateway,
} from './payment-gateways';

export interface CreateIntentInput {
  companyId: string;
  branchId?: string | null;
  customerId?: string | null;
  customerAccountId?: string | null;
  targetType: 'SALES_INVOICE' | 'BOOKING' | 'SERVICE_REQUEST' | 'SETTLEMENT';
  targetId: string;
  amountMinor: number;
  currency?: string;
  provider: string;
  description?: string;
  idempotencyKey: string;
  createdById?: string | null;
  returnUrl?: string;
}

export interface WebhookResult {
  accepted: boolean;
  /** `true` when this event had already been processed. */
  duplicate: boolean;
  detail: string;
}

/** Which ledger account the money side of a payment lands in. */
const CASH_PROVIDERS = new Set(['CASH', 'CARD_TERMINAL']);

/**
 * Payment intents, verified confirmations, refunds, webhooks and reconciliation.
 *
 * ## Idempotency
 *
 * Two independent keys protect against double charges:
 *
 *  - `PaymentIntent(companyId, idempotencyKey)` — a retried *client* request
 *    returns the original intent instead of creating a second one.
 *  - `PaymentWebhookEvent(provider, eventId)` — a gateway that redelivers the
 *    same event cannot settle an intent twice.
 *
 * ## Honesty about gateways
 *
 * An intent is only marked `SUCCEEDED` when a gateway reports the charge
 * authorised, or when an operator confirms a manual method. A gateway without
 * credentials returns `authorised: false`, so the intent stays unfulfilled and
 * the platform never reports money it did not collect.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly gateways: Map<string, PaymentGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly cash: CashGateway,
    private readonly bankTransfer: BankTransferGateway,
    private readonly cardTerminal: CardTerminalGateway,
    private readonly benefitPay: BenefitPayGateway,
    private readonly onlineCard: OnlineCardGateway,
  ) {
    this.gateways = new Map<string, PaymentGateway>(
      [this.cash, this.bankTransfer, this.cardTerminal, this.benefitPay, this.onlineCard].map(
        (gateway) => [gateway.provider, gateway],
      ),
    );
  }

  /** Which payment providers can actually transact on this deployment. */
  providerStatus() {
    return [...this.gateways.values()].map((gateway) => ({
      provider: gateway.provider,
      mode: gateway.mode,
      configured: gateway.isConfigured(),
    }));
  }

  private gatewayFor(provider: string): PaymentGateway {
    const gateway = this.gateways.get(provider);
    if (!gateway) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown payment provider "${provider}".`,
      );
    }
    return gateway;
  }

  // ------------------------------------------------------------------ intents

  /**
   * Create a payment intent.
   *
   * The intent row is written first, then the gateway is asked to authorise. If
   * the gateway declines, the intent is retained as `FAILED` rather than
   * deleted, so an operator can see the attempt.
   */
  async createIntent(input: CreateIntentInput) {
    if (input.amountMinor <= 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A payment amount must be positive.');
    }

    // Idempotency: a repeated request returns the original intent untouched.
    const existing = await this.prisma.paymentIntent.findFirst({
      where: { companyId: input.companyId, idempotencyKey: input.idempotencyKey },
      include: { transactions: true, refunds: true },
    });
    if (existing) return existing;

    const gateway = this.gatewayFor(input.provider);
    const currency = input.currency ?? 'BHD';
    const intentNumber = await this.nextIntentNumber(input.companyId);

    const intent = await this.prisma.paymentIntent.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId ?? null,
        customerId: input.customerId ?? null,
        customerAccountId: input.customerAccountId ?? null,
        intentNumber,
        targetType: input.targetType,
        targetId: input.targetId,
        amountMinor: input.amountMinor,
        currency,
        currencyScale: currencyScale(currency),
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
        description: input.description ?? null,
        status: 'REQUIRES_METHOD',
        expiresAt: new Date(Date.now() + 30 * 60_000),
        createdById: input.createdById ?? null,
      },
    });

    const result = await gateway.createIntent({
      amountMinor: input.amountMinor,
      currency,
      reference: intentNumber,
      description: input.description,
      returnUrl: input.returnUrl,
    });

    if (result.authorised) {
      return this.settleIntent(intent.id, {
        providerReference: result.providerReference ?? intentNumber,
        raw: result.raw,
      });
    }

    // A redirect gateway returns an action URL and waits for the customer.
    if (result.actionUrl) {
      return this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'REQUIRES_ACTION', providerReference: result.providerReference ?? null },
      });
    }

    // Not authorised and no further action: the attempt is recorded as failed
    // with the gateway's own reason, which is what makes a misconfigured
    // provider visible instead of silently "pending".
    return this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'FAILED',
        failedReason: result.failureReason ?? 'The payment provider did not authorise the charge.',
      },
    });
  }

  /**
   * Mark an intent paid and write the ledger entry.
   *
   * The journal is `Dr Cash/Bank, Cr Accounts receivable` for a customer
   * payment: the receivable the invoice created is being cleared. It is posted
   * inside a transaction with the status change, so a settlement can never exist
   * without its accounting entry.
   *
   * Posting is keyed by `sourceId: paymentIntent:<id>`, so a webhook redelivery
   * that reaches this method cannot double-post.
   */
  private async settleIntent(
    intentId: string,
    confirmation: { providerReference: string; raw?: unknown },
  ) {
    return this.posting.withTransaction(async (tx) => {
      const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
      if (!intent) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payment intent not found.');
      if (intent.status === 'SUCCEEDED') {
        return tx.paymentIntent.findUniqueOrThrow({
          where: { id: intentId },
          include: { transactions: true },
        });
      }

      await tx.paymentTransaction.create({
        data: {
          companyId: intent.companyId,
          intentId: intent.id,
          transactionType: 'CHARGE',
          status: 'SUCCEEDED',
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          currencyScale: intent.currencyScale,
          provider: intent.provider,
          providerReference: confirmation.providerReference,
          rawPayload: (confirmation.raw ?? undefined) as never,
          processedAt: new Date(),
        },
      });

      // Only a customer payment clears a receivable. A provider settlement is
      // money we pay out, which is handled by the marketplace service.
      if (intent.targetType !== 'SETTLEMENT') {
        const moneyRole: SystemRole = CASH_PROVIDERS.has(intent.provider)
          ? SYSTEM_ROLES.CASH
          : SYSTEM_ROLES.BANK;
        const moneyAccount = await this.posting.systemAccount(tx, intent.companyId, moneyRole);
        const arAccount = await this.posting.systemAccount(
          tx,
          intent.companyId,
          SYSTEM_ROLES.AR_CONTROL,
        );

        await this.posting.postJournal(tx, {
          companyId: intent.companyId,
          branchId: intent.branchId,
          entryDate: new Date(),
          memo: `Payment received — ${intent.intentNumber}`,
          sourceType: 'PAYMENT',
          sourceId: `paymentIntent:${intent.id}`,
          actorUserId: intent.createdById ?? 'system',
          lines: [
            { accountId: moneyAccount, debit: intent.amountMinor },
            { accountId: arAccount, credit: intent.amountMinor },
          ],
        });
      }

      return tx.paymentIntent.update({
        where: { id: intentId },
        data: {
          status: 'SUCCEEDED',
          succeededAt: new Date(),
          providerReference: confirmation.providerReference,
          failedReason: null,
        },
        include: { transactions: true },
      });
    });
  }

  /**
   * Confirm a manual payment (bank transfer, cheque) once funds are seen.
   *
   * This is an operator action with an audit record naming them, because the
   * platform has no way to verify the bank credited the account.
   */
  async confirmManualIntent(intentId: string, providerReference: string, actorUserId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payment intent not found.');
    if (intent.status === 'SUCCEEDED') {
      throw conflict(ERROR_CODES.PAYMENT_ALREADY_SUCCEEDED, 'This payment is already settled.');
    }
    if (['CANCELLED', 'EXPIRED'].includes(intent.status)) {
      throw conflict(ERROR_CODES.PAYMENT_STATE, `A ${intent.status} intent cannot be confirmed.`);
    }

    const settled = await this.settleIntent(intentId, { providerReference });

    await this.audit.record({
      actorUserId,
      companyId: intent.companyId,
      action: 'payment.manual_confirmed',
      targetType: 'PAYMENT_INTENT',
      targetId: intent.id,
      summary: `Manually confirmed ${intent.provider} payment ${intent.intentNumber} (${providerReference}).`,
    });

    return settled;
  }

  async cancelIntent(intentId: string, reason: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payment intent not found.');
    if (intent.status === 'SUCCEEDED') {
      throw conflict(ERROR_CODES.PAYMENT_ALREADY_SUCCEEDED, 'A settled payment cannot be cancelled.');
    }
    return this.prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: 'CANCELLED', failedReason: reason },
    });
  }

  // ----------------------------------------------------------------- webhooks

  /**
   * Ingest a gateway webhook.
   *
   * Steps, in order:
   *  1. Verify the HMAC signature against the raw body. An unsigned or
   *     mis-signed payload is recorded with `signatureValid: false` and rejected
   *     — never processed.
   *  2. Deduplicate on `(provider, eventId)`. A redelivery returns
   *     `duplicate: true` and changes nothing.
   *  3. Only then apply the state change.
   *
   * The raw body must be the exact bytes received, so signature verification
   * happens before any JSON parsing changes them.
   */
  async handleWebhook(input: {
    provider: string;
    rawBody: Buffer;
    signature: string | undefined;
    eventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<WebhookResult> {
    const payloadHash = createHmac('sha256', 'oryx-payload').update(input.rawBody).digest('hex');
    const signatureValid = this.verifySignature(input.provider, input.rawBody, input.signature);

    const existing = await this.prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: input.provider, eventId: input.eventId } },
    });
    if (existing) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: existing.id },
        data: { attempts: { increment: 1 } },
      });
      return { accepted: true, duplicate: true, detail: 'This event was already processed.' };
    }

    const event = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType,
        signatureValid,
        payloadHash,
        payload: (input.payload ?? undefined) as never,
        attempts: 1,
      },
    });

    if (!signatureValid) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          processResult: 'REJECTED_SIGNATURE',
          error: 'The webhook signature did not match. The event was not processed.',
          processedAt: new Date(),
        },
      });
      return {
        accepted: false,
        duplicate: false,
        detail: 'Signature verification failed; the event was recorded but not processed.',
      };
    }

    try {
      const detail = await this.applyWebhook(input.provider, input.eventType, input.payload);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { processResult: 'APPLIED', processedAt: new Date() },
      });
      return { accepted: true, duplicate: false, detail };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook failure.';
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { processResult: 'FAILED', error: message, processedAt: new Date() },
      });
      this.logger.error(`Webhook ${input.provider}/${input.eventId} failed: ${message}`);
      throw error;
    }
  }

  /**
   * Verify a webhook signature.
   *
   * The secret is per provider. A provider with no configured secret cannot have
   * its webhooks trusted, so verification fails closed rather than accepting
   * anything.
   */
  private verifySignature(provider: string, rawBody: Buffer, signature?: string): boolean {
    const secretKey = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_WEBHOOK_SECRET`;
    const secret = this.config.get<string>(secretKey);
    if (!secret) {
      this.logger.warn(`No webhook secret configured (${secretKey}); rejecting the event.`);
      return false;
    }
    if (!signature) return false;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    // Accept an optional `sha256=` prefix, which several gateways send.
    const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Apply a verified webhook.
   *
   * Only the events this platform understands are acted on; anything else is
   * recorded and acknowledged so the gateway does not retry it forever.
   */
  private async applyWebhook(
    provider: string,
    eventType: string,
    payload: unknown,
  ): Promise<string> {
    const data = (payload ?? {}) as {
      intentNumber?: string;
      intentId?: string;
      providerReference?: string;
      amountMinor?: number;
      reason?: string;
    };

    if (eventType === 'payment.succeeded' || eventType === 'payment.captured') {
      const intent = await this.findIntentForWebhook(data);
      if (!intent) return 'No matching intent; the event was recorded only.';
      if (intent.status === 'SUCCEEDED') return 'The intent was already settled.';
      await this.settleIntent(intent.id, {
        providerReference: data.providerReference ?? intent.intentNumber,
        raw: payload,
      });
      return `Settled intent ${intent.intentNumber}.`;
    }

    if (eventType === 'payment.failed') {
      const intent = await this.findIntentForWebhook(data);
      if (!intent) return 'No matching intent; the event was recorded only.';
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failedReason: data.reason ?? 'The provider reported a failure.' },
      });
      return `Marked intent ${intent.intentNumber} failed.`;
    }

    if (eventType === 'refund.succeeded' || eventType === 'refund.processed') {
      await this.prisma.refund.updateMany({
        where: { providerReference: data.providerReference ?? undefined, status: 'APPROVED' },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return 'Marked the refund processed.';
    }

    return `Event type "${eventType}" is not handled; it was recorded for audit.`;
  }

  private async findIntentForWebhook(data: { intentNumber?: string; intentId?: string }) {
    if (data.intentId) {
      return this.prisma.paymentIntent.findUnique({ where: { id: data.intentId } });
    }
    if (data.intentNumber) {
      return this.prisma.paymentIntent.findFirst({ where: { intentNumber: data.intentNumber } });
    }
    return null;
  }

  // ------------------------------------------------------------------ refunds

  /**
   * Request a refund.
   *
   * A refund is a request first and money second: it is created `REQUESTED` and
   * only reaches the gateway once approved. This keeps a support agent from
   * moving money on their own.
   */
  async requestRefund(input: {
    intentId: string;
    amountMinor: number;
    reason: string;
    requestedById: string;
  }) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: input.intentId },
      include: { refunds: true },
    });
    if (!intent) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payment intent not found.');
    if (intent.status !== 'SUCCEEDED') {
      throw conflict(
        ERROR_CODES.PAYMENT_STATE,
        'Only a settled payment can be refunded.',
      );
    }

    const alreadyRefunded = intent.refunds
      .filter((r) => r.status !== 'REJECTED')
      .reduce((sum, r) => sum + r.amountMinor, 0);

    if (alreadyRefunded + input.amountMinor > intent.amountMinor) {
      throw badRequest(
        ERROR_CODES.OVER_ALLOCATION,
        'The refund would exceed the amount collected.',
      );
    }

    const refundNumber = await this.nextRefundNumber(intent.companyId);
    return this.prisma.refund.create({
      data: {
        companyId: intent.companyId,
        intentId: intent.id,
        customerAccountId: intent.customerAccountId,
        refundNumber,
        amountMinor: input.amountMinor,
        currency: intent.currency,
        currencyScale: intent.currencyScale,
        reason: input.reason,
        status: 'REQUESTED',
        requestedById: input.requestedById,
      },
    });
  }

  /**
   * Approve and process a refund.
   *
   * The gateway is asked to reverse the charge, and the ledger entry mirrors the
   * original settlement: `Dr Accounts receivable, Cr Cash/Bank`. The refund is
   * only `PROCESSED` when the gateway confirms it.
   */
  async approveRefund(refundId: string, approvedById: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { intent: true },
    });
    if (!refund) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Refund not found.');
    if (refund.status !== 'REQUESTED') {
      throw conflict(ERROR_CODES.PAYMENT_STATE, `A ${refund.status} refund cannot be approved.`);
    }

    const gateway = this.gatewayFor(refund.intent.provider);
    const result = await gateway.refund({
      providerReference: refund.intent.providerReference ?? refund.intent.intentNumber,
      amountMinor: refund.amountMinor,
      reason: refund.reason,
    });

    if (!result.refunded) {
      return this.prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'APPROVED',
          approvedById,
          failureReason: result.failureReason ?? 'The provider did not process the refund.',
        },
      });
    }

    return this.posting.withTransaction(async (tx) => {
      const journalEntryId = await this.postRefundJournal(tx, refund);

      await tx.paymentTransaction.create({
        data: {
          companyId: refund.companyId,
          intentId: refund.intentId,
          transactionType: 'REFUND',
          status: 'SUCCEEDED',
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          currencyScale: refund.currencyScale,
          provider: refund.intent.provider,
          providerReference: result.providerReference ?? null,
          processedAt: new Date(),
        },
      });

      return tx.refund.update({
        where: { id: refundId },
        data: {
          status: 'PROCESSED',
          approvedById,
          processedAt: new Date(),
          providerReference: result.providerReference ?? null,
          journalEntryId,
          failureReason: null,
        },
      });
    });
  }

  /**
   * Post the reversing entry for a refund.
   *
   * The source key is `refund:<id>`, so approving the same refund twice cannot
   * write two journals.
   */
  private async postRefundJournal(
    tx: Tx,
    refund: { id: string; companyId: string; amountMinor: number; intentId: string },
  ): Promise<string | null> {
    const intent = await tx.paymentIntent.findUnique({ where: { id: refund.intentId } });
    if (!intent || intent.targetType === 'SETTLEMENT') return null;

    const moneyRole: SystemRole = CASH_PROVIDERS.has(intent.provider)
      ? SYSTEM_ROLES.CASH
      : SYSTEM_ROLES.BANK;
    const moneyAccount = await this.posting.systemAccount(tx, refund.companyId, moneyRole);
    const arAccount = await this.posting.systemAccount(
      tx,
      refund.companyId,
      SYSTEM_ROLES.AR_CONTROL,
    );

    const journal = await this.posting.postJournal(tx, {
      companyId: refund.companyId,
      entryDate: new Date(),
      memo: `Refund — ${intent.intentNumber}`,
      sourceType: 'REFUND',
      sourceId: `refund:${refund.id}`,
      actorUserId: 'system',
      lines: [
        { accountId: arAccount, debit: refund.amountMinor },
        { accountId: moneyAccount, credit: refund.amountMinor },
      ],
    });
    return journal.id;
  }

  // ----------------------------------------------------------- reconciliation

  /**
   * Reconcile one provider for one business day.
   *
   * Internal totals are summed from our own `PaymentTransaction` rows; the
   * external totals are supplied by the operator from the provider's statement,
   * because the platform has no statement API. A non-zero variance is the whole
   * point of the record: it is what an accountant investigates.
   */
  async reconcile(input: {
    companyId: string;
    provider: string;
    businessDate: Date;
    externalCount: number;
    externalMinor: number;
    notes?: string;
    actorUserId: string;
  }) {
    const dayStart = new Date(
      Date.UTC(
        input.businessDate.getUTCFullYear(),
        input.businessDate.getUTCMonth(),
        input.businessDate.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const internal = await this.prisma.paymentTransaction.aggregate({
      where: {
        companyId: input.companyId,
        provider: input.provider,
        status: 'SUCCEEDED',
        processedAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { _all: true },
      _sum: { amountMinor: true },
    });

    const internalCount = internal._count._all;
    const internalMinor = internal._sum.amountMinor ?? 0;
    const varianceMinor = internalMinor - input.externalMinor;

    const record = await this.prisma.paymentReconciliation.upsert({
      where: {
        companyId_provider_businessDate: {
          companyId: input.companyId,
          provider: input.provider,
          businessDate: dayStart,
        },
      },
      create: {
        companyId: input.companyId,
        provider: input.provider,
        businessDate: dayStart,
        internalCount,
        internalMinor,
        externalCount: input.externalCount,
        externalMinor: input.externalMinor,
        varianceMinor,
        matched: varianceMinor === 0 && internalCount === input.externalCount,
        notes: input.notes ?? null,
        createdById: input.actorUserId,
      },
      update: {
        internalCount,
        internalMinor,
        externalCount: input.externalCount,
        externalMinor: input.externalMinor,
        varianceMinor,
        matched: varianceMinor === 0 && internalCount === input.externalCount,
        notes: input.notes ?? null,
      },
    });

    if (!record.matched) {
      await this.audit.record({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        action: 'payment.reconciliation_break',
        targetType: 'PAYMENT_RECONCILIATION',
        targetId: record.id,
        summary: `Reconciliation break for ${input.provider} on ${dayStart.toISOString().slice(0, 10)}: variance ${varianceMinor}.`,
      });
    }

    return record;
  }

  async listReconciliations(companyId: string, onlyUnmatched = false) {
    return this.prisma.paymentReconciliation.findMany({
      where: { companyId, ...(onlyUnmatched ? { matched: false } : {}) },
      orderBy: { businessDate: 'desc' },
    });
  }

  // ------------------------------------------------------------------ queries

  /** Paginated payment intents for the staff payments console. */
  async listIntents(
    companyId: string,
    params: { page: number; pageSize: number; targetType?: string; status?: string },
  ) {
    const where = {
      companyId,
      ...(params.targetType ? { targetType: params.targetType as never } : {}),
      ...(params.status ? { status: params.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          intentNumber: true,
          targetType: true,
          targetId: true,
          amountMinor: true,
          currency: true,
          currencyScale: true,
          status: true,
          provider: true,
          description: true,
          succeededAt: true,
          createdAt: true,
          refunds: { select: { id: true, refundNumber: true, amountMinor: true, status: true } },
        },
      }),
      this.prisma.paymentIntent.count({ where }),
    ]);
    return { items, total };
  }

  async getIntent(companyId: string, intentId: string) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { id: intentId, companyId },
      include: {
        transactions: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!intent) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payment intent not found.');
    return intent;
  }

  /** Payment history for one customer account, for the website and app. */
  async customerPaymentHistory(
    customerAccountId: string,
    params: { page: number; pageSize: number },
  ) {
    const where = { customerAccountId };
    const [items, total] = await Promise.all([
      this.prisma.paymentIntent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          intentNumber: true,
          targetType: true,
          targetId: true,
          amountMinor: true,
          currency: true,
          currencyScale: true,
          status: true,
          provider: true,
          description: true,
          succeededAt: true,
          createdAt: true,
          refunds: { select: { id: true, refundNumber: true, amountMinor: true, status: true } },
        },
      }),
      this.prisma.paymentIntent.count({ where }),
    ]);
    return { items, total };
  }

  // ------------------------------------------------------------------ helpers

  private async nextIntentNumber(companyId: string): Promise<string> {
    const count = await this.prisma.paymentIntent.count({ where: { companyId } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `PI-${String(count + 1 + attempt).padStart(6, '0')}`;
      const clash = await this.prisma.paymentIntent.findFirst({
        where: { companyId, intentNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `PI-${Date.now().toString(36).toUpperCase()}`;
  }

  private async nextRefundNumber(companyId: string): Promise<string> {
    const count = await this.prisma.refund.count({ where: { companyId } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `RF-${String(count + 1 + attempt).padStart(6, '0')}`;
      const clash = await this.prisma.refund.findFirst({
        where: { companyId, refundNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `RF-${Date.now().toString(36).toUpperCase()}`;
  }
}
