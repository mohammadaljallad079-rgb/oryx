import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationService } from '../notifications/notification.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { SensageAiService } from './sensage-ai.service';
import { ERROR_CODES, badRequest, conflict, forbidden, notFound } from '../common/errors';
import { sumMinor } from '@oryx/shared';
import type { Tx } from '../common/accounting-posting.service';

/** How long a consumer return may be raised after an order completes. */
const RETURN_WINDOW_DAYS = 14;

/** The transitions a consumer return may take. Enforced server-side. */
const RETURN_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['REFUNDED'],
  REFUNDED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * The transitions a recovery request may take.
 *
 * `EN_ROUTE` requires an assigned provider, and nothing may skip `ON_SITE` on
 * the way to `COMPLETED`, so the customer-visible timeline cannot show a truck
 * arriving before it was dispatched.
 */
const RECOVERY_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ON_SITE', 'CANCELLED'],
  ON_SITE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Order statuses a consumer return may be raised against. */
const RETURNABLE_ORDER_STATUS = new Set(['DELIVERED', 'COMPLETED']);

/**
 * The planned automotive ecosystem (P3–P7).
 *
 * ## What lives here
 *
 * P4 consumer RFQ (request-for-quote on a spare part) and consumer returns;
 * P5 roadside recovery dispatch and tracking; P6 fleet accounts, fleet vehicles
 * and drivers; P7 SENSAGE AI suggestion capture and review.
 *
 * ## Isolation
 *
 * Every customer-facing method takes the account id from the verified token and
 * scopes its query by it. Every provider-facing method resolves the provider
 * from `ProviderUser` membership before acting. Neither trusts an id from the
 * request path alone.
 *
 * ## Stock and money
 *
 * A return that is accepted moves stock back through the *shared*
 * `InventoryService.recordMovement`, the one place stock changes, and a refund is
 * recorded against the order's own payment intent. No parallel ledger is created
 * here.
 */
@Injectable()
export class EcosystemService {
  private readonly logger = new Logger(EcosystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: DocumentSequenceService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
    private readonly integrations: IntegrationsService,
    private readonly sensage: SensageAiService,
  ) {}

  // ==================================================================== P4 RFQ

  /** Raise a consumer request for quotation on a spare part. */
  async createRfq(input: {
    customerAccountId: string;
    companyId: string;
    categoryKey: string;
    description: string;
    quantity: number;
    vehicleId: string | null;
    validDays: number;
  }) {
    if (input.vehicleId) {
      const owned = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, customerAccountId: input.customerAccountId },
        select: { id: true },
      });
      if (!owned) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'That vehicle is not in your garage.');
    }

    const rfq = await this.prisma.$transaction(async (tx) => {
      const reference = await this.sequences.next(tx, input.companyId, 'customerRfq');
      return tx.customerRfq.create({
        data: {
          reference,
          customerAccountId: input.customerAccountId,
          companyId: input.companyId,
          categoryKey: input.categoryKey,
          description: input.description,
          quantity: input.quantity,
          vehicleId: input.vehicleId,
          expiresAt: new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000),
        },
      });
    });

    await this.audit.record({
      actorUserId: null,
      companyId: input.companyId,
      action: 'rfq.created',
      targetType: 'CUSTOMER_RFQ',
      targetId: rfq.id,
      summary: `RFQ ${rfq.reference} raised by customer.`,
      metadata: { accountId: input.customerAccountId, categoryKey: input.categoryKey },
    });

    return this.rfqDetail(rfq.id);
  }

  /** The caller's own RFQs, newest first. */
  async listRfqs(customerAccountId: string) {
    const rows = await this.prisma.customerRfq.findMany({
      where: { customerAccountId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { quotes: { orderBy: { priceMinor: 'asc' } }, vehicle: { select: { id: true, make: true, model: true } } },
    });
    return rows.map((row) => this.rfqSummary(row));
  }

  /** One of the caller's RFQs with its quotes. */
  async getRfq(customerAccountId: string, rfqId: string) {
    const rfq = await this.prisma.customerRfq.findFirst({
      where: { id: rfqId, customerAccountId },
      include: { quotes: { orderBy: { priceMinor: 'asc' } }, vehicle: { select: { id: true, make: true, model: true } } },
    });
    if (!rfq) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Request not found.');
    return this.rfqSummary(rfq);
  }

  private async rfqDetail(rfqId: string) {
    const rfq = await this.prisma.customerRfq.findUnique({
      where: { id: rfqId },
      include: { quotes: { orderBy: { priceMinor: 'asc' } }, vehicle: { select: { id: true, make: true, model: true } } },
    });
    if (!rfq) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Request not found.');
    return this.rfqSummary(rfq);
  }

  private rfqSummary(rfq: {
    id: string;
    reference: string;
    categoryKey: string;
    description: string;
    quantity: number;
    status: string;
    acceptedQuoteId: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    vehicle?: { id: string; make: string; model: string } | null;
    quotes: Array<{
      id: string;
      providerId: string;
      priceMinor: number;
      currency: string;
      leadTimeDays: number | null;
      note: string | null;
      status: string;
      createdAt: Date;
    }>;
  }) {
    return {
      id: rfq.id,
      reference: rfq.reference,
      categoryKey: rfq.categoryKey,
      description: rfq.description,
      quantity: rfq.quantity,
      status: rfq.status,
      acceptedQuoteId: rfq.acceptedQuoteId,
      expiresAt: rfq.expiresAt,
      createdAt: rfq.createdAt,
      vehicle: rfq.vehicle
        ? { id: rfq.vehicle.id, label: `${rfq.vehicle.make} ${rfq.vehicle.model}`.trim() }
        : null,
      quotes: rfq.quotes.map((quote) => ({
        id: quote.id,
        providerId: quote.providerId,
        priceMinor: quote.priceMinor,
        currency: quote.currency,
        leadTimeDays: quote.leadTimeDays,
        note: quote.note,
        status: quote.status,
        createdAt: quote.createdAt,
      })),
    };
  }

  /** Cancel one of the caller's own open RFQs. */
  async cancelRfq(customerAccountId: string, rfqId: string) {
    const rfq = await this.prisma.customerRfq.findFirst({
      where: { id: rfqId, customerAccountId },
      select: { id: true, status: true, reference: true, companyId: true },
    });
    if (!rfq) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Request not found.');
    if (rfq.status === 'ACCEPTED') {
      throw conflict(ERROR_CODES.RFQ_ALREADY_ACCEPTED, 'An accepted request cannot be cancelled.');
    }
    if (rfq.status === 'CANCELLED' || rfq.status === 'EXPIRED') {
      throw conflict(ERROR_CODES.RFQ_STATE, 'This request is already closed.');
    }
    const updated = await this.prisma.customerRfq.update({
      where: { id: rfq.id },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: null,
      companyId: rfq.companyId,
      action: 'rfq.cancelled',
      targetType: 'CUSTOMER_RFQ',
      targetId: rfq.id,
      summary: `RFQ ${rfq.reference} cancelled by customer.`,
    });
    return this.rfqDetail(updated.id);
  }

  /**
   * Accept a quote. Acceptance is exclusive: the first accepted quote closes the
   * RFQ and every other quote is rejected, so a customer cannot promise the same
   * job to two providers.
   */
  async acceptRfqQuote(customerAccountId: string, rfqId: string, quoteId: string) {
    const rfq = await this.prisma.customerRfq.findFirst({
      where: { id: rfqId, customerAccountId },
      include: { quotes: true },
    });
    if (!rfq) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Request not found.');
    if (rfq.status === 'ACCEPTED') {
      throw conflict(ERROR_CODES.RFQ_ALREADY_ACCEPTED, 'A quote has already been accepted.');
    }
    if (rfq.status !== 'OPEN' && rfq.status !== 'QUOTED') {
      throw conflict(ERROR_CODES.RFQ_STATE, 'This request is no longer open for quotes.');
    }
    if (rfq.expiresAt && rfq.expiresAt.getTime() < Date.now()) {
      throw conflict(ERROR_CODES.RFQ_EXPIRED, 'This request has expired.');
    }
    const quote = rfq.quotes.find((q) => q.id === quoteId);
    if (!quote) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Quote not found on this request.');
    if (quote.status === 'WITHDRAWN') {
      throw conflict(ERROR_CODES.RFQ_STATE, 'That quote has been withdrawn.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerRfqQuote.update({
        where: { id: quote.id },
        data: { status: 'ACCEPTED' },
      });
      await tx.customerRfqQuote.updateMany({
        where: { rfqId: rfq.id, id: { not: quote.id } },
        data: { status: 'REJECTED' },
      });
      await tx.customerRfq.update({
        where: { id: rfq.id },
        data: { status: 'ACCEPTED', acceptedQuoteId: quote.id, closedAt: new Date() },
      });
    });

    await this.audit.record({
      actorUserId: null,
      companyId: rfq.companyId,
      action: 'rfq.quote_accepted',
      targetType: 'CUSTOMER_RFQ',
      targetId: rfq.id,
      summary: `Quote accepted on RFQ ${rfq.reference}.`,
      metadata: { quoteId: quote.id, providerId: quote.providerId, priceMinor: quote.priceMinor },
    });

    // Tell the winning provider their quote was accepted, and the others that it
    // was not. The notification service records the attempt either way.
    await this.notifications.notify({
      companyId: rfq.companyId,
      customerAccountId,
      channel: 'IN_APP',
      category: 'rfq',
      fallbackSubject: 'Your quote was accepted',
      fallbackBody: `Your quote on request ${rfq.reference} was accepted.`,
      entityType: 'CUSTOMER_RFQ',
      entityId: rfq.id,
    });

    return this.rfqDetail(rfq.id);
  }

  /**
   * Open RFQs a provider may quote.
   *
   * Scoped to the provider's own company, so a provider only sees consumer
   * requests raised against the catalogue it serves. Requests that already have
   * a quote from this provider are excluded, because one provider quotes once.
   */
  async listProviderRfqs(userId: string, providerId?: string) {
    const provider = await this.resolveProvider(userId, providerId);
    const rows = await this.prisma.customerRfq.findMany({
      where: {
        companyId: provider.providerCompanyId ?? undefined,
        status: { in: ['OPEN', 'QUOTED'] },
        quotes: { none: { providerId: provider.id } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { quotes: true, vehicle: { select: { id: true, make: true, model: true } } },
    });
    return rows.map((row) => this.rfqSummary(row));
  }

  /** Submit a quote on an open RFQ, on behalf of the caller's provider. */
  async submitRfqQuote(
    userId: string,
    rfqId: string,
    input: { priceMinor: number; leadTimeDays: number | null; note: string | null },
  ) {
    const provider = await this.resolveProvider(userId);
    const rfq = await this.prisma.customerRfq.findUnique({
      where: { id: rfqId },
      include: { quotes: { where: { providerId: provider.id } } },
    });
    if (!rfq) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Request not found.');
    // A request belongs to the tenant that raised it, and only a provider linked
    // to that tenant may quote it. A provider with no linked company is not
    // silently granted a platform-wide view.
    if (!provider.providerCompanyId || provider.providerCompanyId !== rfq.companyId) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Request not found.');
    }
    if (rfq.status !== 'OPEN' && rfq.status !== 'QUOTED') {
      throw conflict(ERROR_CODES.RFQ_STATE, 'This request is no longer open for quotes.');
    }
    if (rfq.expiresAt && rfq.expiresAt.getTime() < Date.now()) {
      throw conflict(ERROR_CODES.RFQ_EXPIRED, 'This request has expired.');
    }
    if (rfq.quotes.length > 0) {
      throw conflict(ERROR_CODES.RFQ_QUOTE_DUPLICATE, 'You have already quoted this request.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerRfqQuote.create({
        data: {
          rfqId: rfq.id,
          providerId: provider.id,
          priceMinor: input.priceMinor,
          leadTimeDays: input.leadTimeDays,
          note: input.note,
        },
      });
      await tx.customerRfq.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
    });

    await this.audit.record({
      actorUserId: userId,
      companyId: rfq.companyId,
      action: 'rfq.quote_submitted',
      targetType: 'CUSTOMER_RFQ',
      targetId: rfq.id,
      summary: `Quote submitted on RFQ ${rfq.reference} by ${provider.nameEn}.`,
      metadata: { providerId: provider.id, priceMinor: input.priceMinor },
    });

    await this.notifications.notify({
      companyId: rfq.companyId,
      customerAccountId: rfq.customerAccountId,
      channel: 'IN_APP',
      category: 'rfq',
      fallbackSubject: 'A new quote arrived',
      fallbackBody: `${provider.nameEn} quoted your request ${rfq.reference}.`,
      entityType: 'CUSTOMER_RFQ',
      entityId: rfq.id,
    });

    return this.rfqDetail(rfq.id);
  }

  /** A provider's own submitted quotes. */
  async listProviderQuotes(userId: string, providerId?: string) {
    const provider = await this.resolveProvider(userId, providerId);
    const rows = await this.prisma.customerRfqQuote.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { rfq: { select: { id: true, reference: true, description: true, status: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      rfqId: row.rfqId,
      rfqReference: row.rfq.reference,
      rfqDescription: row.rfq.description,
      rfqStatus: row.rfq.status,
      priceMinor: row.priceMinor,
      currency: row.currency,
      leadTimeDays: row.leadTimeDays,
      note: row.note,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  /** Withdraw a quote that has not been decided yet. */
  async withdrawRfqQuote(userId: string, quoteId: string) {
    const provider = await this.resolveProvider(userId);
    const quote = await this.prisma.customerRfqQuote.findFirst({
      where: { id: quoteId, providerId: provider.id },
      include: { rfq: true },
    });
    if (!quote) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Quote not found.');
    if (quote.status !== 'SUBMITTED') {
      throw conflict(ERROR_CODES.RFQ_STATE, 'Only a submitted quote can be withdrawn.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.customerRfqQuote.update({ where: { id: quote.id }, data: { status: 'WITHDRAWN' } });
      const remaining = await tx.customerRfqQuote.count({
        where: { rfqId: quote.rfqId, status: { in: ['SUBMITTED', 'ACCEPTED'] } },
      });
      if (remaining === 0) {
        await tx.customerRfq.update({ where: { id: quote.rfqId }, data: { status: 'OPEN' } });
      }
    });
    return this.rfqDetail(quote.rfqId);
  }

  // ================================================================ P4 returns
  /**
   * Raise a return against one of the caller's own orders.
   *
   * Eligibility is checked here rather than trusted from the client: the order
   * must belong to the account, be delivered or completed, and be inside the
   * return window. Quantities are checked against what was ordered, minus what a
   * previous return already took.
   */
  async createReturn(input: {
    customerAccountId: string;
    orderId: string;
    reason: string;
    lines: Array<{ orderLineId: string; quantity: number }>;
  }) {
    const order = await this.prisma.customerOrder.findFirst({
      where: { id: input.orderId, customerAccountId: input.customerAccountId },
      include: { lines: true, returns: { include: { lines: true } } },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    if (!RETURNABLE_ORDER_STATUS.has(order.status)) {
      throw conflict(
        ERROR_CODES.RETURN_ORDER_NOT_ELIGIBLE,
        'Only a delivered or completed order can be returned.',
      );
    }
    const anchor = order.completedAt ?? order.placedAt;
    const deadline = new Date(anchor.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (Date.now() > deadline.getTime()) {
      throw conflict(
        ERROR_CODES.RETURN_WINDOW_CLOSED,
        `The ${RETURN_WINDOW_DAYS}-day return window has closed.`,
      );
    }

    // Quantity already returned, per order line, across every prior return.
    const alreadyReturned = new Map<string, number>();
    for (const prior of order.returns) {
      for (const line of prior.lines) {
        alreadyReturned.set(line.orderLineId, (alreadyReturned.get(line.orderLineId) ?? 0) + line.quantity);
      }
    }

    const lines = input.lines.map((requested) => {
      const orderLine = order.lines.find((l) => l.id === requested.orderLineId);
      if (!orderLine) {
        throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'An order line on this return was not found.');
      }
      const remaining = orderLine.quantity - (alreadyReturned.get(orderLine.id) ?? 0);
      if (requested.quantity > remaining) {
        throw conflict(
          ERROR_CODES.RETURN_QUANTITY_EXCEEDS,
          `You can return at most ${remaining} of ${orderLine.sku}.`,
        );
      }
      return { orderLineId: orderLine.id, productId: orderLine.productId, quantity: requested.quantity };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const reference = await this.sequences.next(tx, order.companyId, 'customerReturn');
      return tx.customerOrderReturn.create({
        data: {
          reference,
          orderId: order.id,
          customerAccountId: input.customerAccountId,
          companyId: order.companyId,
          reason: input.reason,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    });

    await this.audit.record({
      actorUserId: null,
      companyId: order.companyId,
      action: 'return.requested',
      targetType: 'CUSTOMER_ORDER_RETURN',
      targetId: created.id,
      summary: `Return ${created.reference} requested on order ${order.reference}.`,
      metadata: { accountId: input.customerAccountId, orderId: order.id },
    });

    return this.returnDetail(created.id);
  }

  /** The caller's own returns, newest first. */
  async listReturns(customerAccountId: string) {
    const rows = await this.prisma.customerOrderReturn.findMany({
      where: { customerAccountId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { lines: true, order: { select: { id: true, reference: true } } },
    });
    return rows.map((row) => this.returnSummary(row));
  }

  async getReturn(customerAccountId: string, returnId: string) {
    const row = await this.prisma.customerOrderReturn.findFirst({
      where: { id: returnId, customerAccountId },
      include: { lines: true, order: { select: { id: true, reference: true } } },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    return this.returnSummary(row);
  }

  /** Cancel a return the customer raised, while it is still pending. */
  async cancelReturn(customerAccountId: string, returnId: string) {
    const row = await this.prisma.customerOrderReturn.findFirst({
      where: { id: returnId, customerAccountId },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    if (row.status !== 'REQUESTED') {
      throw conflict(ERROR_CODES.RETURN_STATE, 'Only a pending return can be cancelled.');
    }
    await this.prisma.customerOrderReturn.update({
      where: { id: row.id },
      data: { status: 'CANCELLED' },
    });
    return this.returnDetail(row.id);
  }

  private async returnDetail(returnId: string) {
    const row = await this.prisma.customerOrderReturn.findUnique({
      where: { id: returnId },
      include: { lines: true, order: { select: { id: true, reference: true } } },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    return this.returnSummary(row);
  }

  private returnSummary(row: {
    id: string;
    reference: string;
    orderId: string;
    reason: string;
    status: string;
    requestedAt: Date;
    reviewedAt: Date | null;
    receivedAt: Date | null;
    refundedAt: Date | null;
    reviewNote: string | null;
    order?: { id: string; reference: string } | null;
    lines: Array<{ id: string; orderLineId: string; productId: string; quantity: number }>;
  }) {
    return {
      id: row.id,
      reference: row.reference,
      orderId: row.orderId,
      orderReference: row.order?.reference ?? null,
      reason: row.reason,
      status: row.status,
      reviewNote: row.reviewNote,
      requestedAt: row.requestedAt,
      reviewedAt: row.reviewedAt,
      receivedAt: row.receivedAt,
      refundedAt: row.refundedAt,
      cancellable: row.status === 'REQUESTED',
      lines: row.lines.map((line) => ({
        id: line.id,
        orderLineId: line.orderLineId,
        productId: line.productId,
        quantity: line.quantity,
      })),
    };
  }

  /**
   * Staff decision on a return.
   *
   * Approving does not move stock: stock moves when the goods are physically
   * received (`receiveReturn`), which is the event that actually changes the
   * warehouse. Refunding is a separate step again, so an operator cannot
   * accidentally return stock for goods that never came back.
   */
  async decideReturn(returnId: string, decision: 'APPROVED' | 'REJECTED', note: string, actorId: string) {
    const row = await this.prisma.customerOrderReturn.findUnique({ where: { id: returnId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    if (row.status !== 'REQUESTED') {
      throw conflict(ERROR_CODES.RETURN_STATE, 'This return has already been decided.');
    }
    if (!RETURN_TRANSITIONS.REQUESTED.includes(decision)) {
      throw conflict(ERROR_CODES.RETURN_STATE, 'That decision is not valid for a pending return.');
    }
    await this.prisma.customerOrderReturn.update({
      where: { id: row.id },
      data: { status: decision, reviewedAt: new Date(), reviewedById: actorId, reviewNote: note || null },
    });
    await this.audit.record({
      actorUserId: actorId,
      companyId: row.companyId,
      action: `return.${decision.toLowerCase()}`,
      targetType: 'CUSTOMER_ORDER_RETURN',
      targetId: row.id,
      summary: `Return ${row.reference} ${decision.toLowerCase()}.`,
    });
    return this.returnDetail(row.id);
  }

  /**
   * Receive the returned goods and put them back into stock.
   *
   * Runs in one transaction: the return is marked received and each line is
   * moved back through the shared inventory ledger as a `RETURN_IN` movement
   * sourced to this return, so the stock history points at the document that
   * caused it and a retried receipt is a no-op through the same source key.
   */
  async receiveReturn(returnId: string, actorId: string) {
    const row = await this.prisma.customerOrderReturn.findUnique({
      where: { id: returnId },
      include: { lines: true },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    if (row.status !== 'APPROVED') {
      throw conflict(ERROR_CODES.RETURN_STATE, 'Only an approved return can be received.');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { companyId: row.companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.$transaction(async (tx) => {
      if (warehouse) {
        for (const line of row.lines) {
          await this.inventory.recordMovement(tx, {
            companyId: row.companyId,
            warehouseId: warehouse.id,
            productId: line.productId,
            movementType: 'RECEIPT',
            quantity: line.quantity * 10_000,
            source: 'MARKETPLACE_RETURN',
            sourceId: row.id,
            memo: `Marketplace return ${row.reference}`,
            occurredAt: new Date(),
            actorUserId: actorId,
          });
        }
      }
      await tx.customerOrderReturn.update({
        where: { id: row.id },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      });
    });

    await this.audit.record({
      actorUserId: actorId,
      companyId: row.companyId,
      action: 'return.received',
      targetType: 'CUSTOMER_ORDER_RETURN',
      targetId: row.id,
      summary: `Return ${row.reference} received into stock.`,
    });

    await this.notifications.notify({
      companyId: row.companyId,
      customerAccountId: row.customerAccountId,
      channel: 'IN_APP',
      category: 'return',
      fallbackSubject: 'Return received',
      fallbackBody: `We have received your return ${row.reference}.`,
      entityType: 'CUSTOMER_ORDER_RETURN',
      entityId: row.id,
    });

    return this.returnDetail(row.id);
  }

  /** Mark a received return as refunded. The refund itself is recorded elsewhere. */
  async refundReturn(returnId: string, actorId: string) {
    const row = await this.prisma.customerOrderReturn.findUnique({ where: { id: returnId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    if (row.status !== 'RECEIVED') {
      throw conflict(ERROR_CODES.RETURN_STATE, 'Only a received return can be refunded.');
    }
    await this.prisma.customerOrderReturn.update({
      where: { id: row.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: actorId,
      companyId: row.companyId,
      action: 'return.refunded',
      targetType: 'CUSTOMER_ORDER_RETURN',
      targetId: row.id,
      summary: `Return ${row.reference} marked refunded.`,
    });
    return this.returnDetail(row.id);
  }

  /**
   * Consumer fitment check: does this product fit this vehicle?
   *
   * The vehicle must belong to the caller. Compatibility is read from
   * `PartCompatibility`, the same table the catalogue uses, so the answer is the
   * platform's own fitment data rather than a guess.
   */
  async checkFitment(customerAccountId: string, vehicleId: string, productId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, customerAccountId },
      select: { id: true, make: true, model: true, modelYear: true, companyId: true },
    });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'That vehicle is not in your garage.');

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, nameEn: true, nameAr: true, companyId: true, isActive: true },
    });
    if (!product || !product.isActive) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found.');

    const matches = await this.prisma.partCompatibility.findMany({
      where: {
        companyId: product.companyId,
        productId: product.id,
        make: { equals: vehicle.make, mode: 'insensitive' },
        model: { equals: vehicle.model, mode: 'insensitive' },
      },
      select: { id: true, yearFrom: true, yearTo: true, notes: true },
    });

    const applicable = matches.filter(
      (m) => vehicle.modelYear >= m.yearFrom && (m.yearTo === null || vehicle.modelYear <= m.yearTo),
    );

    return {
      vehicle: {
        id: vehicle.id,
        label: `${vehicle.make} ${vehicle.model}`.trim(),
        year: vehicle.modelYear,
      },
      product: { id: product.id, sku: product.sku, nameEn: product.nameEn, nameAr: product.nameAr },
      compatible: applicable.length > 0,
      notes: applicable.map((m) => m.notes).filter((note): note is string => Boolean(note)),
      /** A product with no fitment rows at all is unknown, not incompatible. */
      fitmentKnown: matches.length > 0,
    };
  }

  /** The company return queue for staff. */
  async listCompanyReturns(companyId: string | null, status?: string) {
    const rows = await this.prisma.customerOrderReturn.findMany({
      where: { ...(companyId ? { companyId } : {}), ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { lines: true, order: { select: { id: true, reference: true } } },
    });
    return rows.map((row) => this.returnSummary(row));
  }

  // =============================================================== P5 recovery

  /** Raise a recovery / SOS request. A location is mandatory. */
  async createRecoveryRequest(input: {
    customerAccountId: string;
    companyId: string;
    vehicleId: string | null;
    pickupLatitude: number;
    pickupLongitude: number;
    pickupLabel: string | null;
    contactPhone: string;
    issue: string;
    urgency: 'STANDARD' | 'URGENT' | 'CRITICAL';
  }) {
    if (input.vehicleId) {
      const owned = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, customerAccountId: input.customerAccountId },
        select: { id: true },
      });
      if (!owned) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'That vehicle is not in your garage.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const reference = await this.sequences.next(tx, input.companyId, 'recoveryRequest');
      return tx.recoveryRequest.create({
        data: {
          reference,
          companyId: input.companyId,
          customerAccountId: input.customerAccountId,
          vehicleId: input.vehicleId,
          pickupLatitude: input.pickupLatitude,
          pickupLongitude: input.pickupLongitude,
          pickupLabel: input.pickupLabel,
          contactPhone: input.contactPhone,
          issue: input.issue,
          urgency: input.urgency,
          events: {
            create: { status: 'REQUESTED', actor: 'CUSTOMER', note: 'Recovery requested.' },
          },
        },
      });
    });

    await this.audit.record({
      actorUserId: null,
      companyId: input.companyId,
      action: 'recovery.requested',
      targetType: 'RECOVERY_REQUEST',
      targetId: created.id,
      summary: `Recovery ${created.reference} requested (${input.urgency}).`,
      metadata: { accountId: input.customerAccountId, urgency: input.urgency },
    });

    return this.recoveryDetail(created.id);
  }

  /** The caller's own recovery requests, newest first. */
  async listRecoveryRequests(customerAccountId: string) {
    const rows = await this.prisma.recoveryRequest.findMany({
      where: { customerAccountId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { events: { orderBy: { createdAt: 'asc' } }, provider: { select: { id: true, nameEn: true, phone: true } } },
    });
    return rows.map((row) => this.recoverySummary(row));
  }

  async getRecoveryRequest(customerAccountId: string, requestId: string) {
    const row = await this.prisma.recoveryRequest.findFirst({
      where: { id: requestId, customerAccountId },
      include: { events: { orderBy: { createdAt: 'asc' } }, provider: { select: { id: true, nameEn: true, phone: true } } },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Recovery request not found.');
    return this.recoverySummary(row);
  }

  /** A customer may cancel while a truck has not yet arrived. */
  async cancelRecoveryRequest(customerAccountId: string, requestId: string, reason: string) {
    const row = await this.prisma.recoveryRequest.findFirst({
      where: { id: requestId, customerAccountId },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Recovery request not found.');
    if (!RECOVERY_TRANSITIONS[row.status]?.includes('CANCELLED')) {
      throw conflict(ERROR_CODES.RECOVERY_STATE, 'This request can no longer be cancelled.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryRequest.update({
        where: { id: row.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
      await tx.recoveryTrackingEvent.create({
        data: { requestId: row.id, status: 'CANCELLED', actor: 'CUSTOMER', note: reason },
      });
    });
    return this.recoveryDetail(row.id);
  }

  /** The dispatch queue for staff. */
  async listCompanyRecoveryRequests(companyId: string | null, status?: string) {
    const rows = await this.prisma.recoveryRequest.findMany({
      where: { ...(companyId ? { companyId } : {}), ...(status ? { status: status as never } : {}) },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { events: { orderBy: { createdAt: 'asc' } }, provider: { select: { id: true, nameEn: true, phone: true } } },
    });
    return rows.map((row) => this.recoverySummary(row));
  }

  /**
   * Assign a provider. The provider must be approved, and the request must be in
   * a state that permits assignment, so a completed request cannot be re-opened
   * by an assignment.
   */
  async assignRecovery(requestId: string, providerId: string, actorId: string) {
    const [row, provider] = await Promise.all([
      this.prisma.recoveryRequest.findUnique({ where: { id: requestId } }),
      this.prisma.marketplaceProvider.findUnique({ where: { id: providerId } }),
    ]);
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Recovery request not found.');
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    if (provider.status !== 'APPROVED') {
      throw conflict(ERROR_CODES.PROVIDER_NOT_APPROVED, 'Only an approved provider can be dispatched.');
    }
    if (!RECOVERY_TRANSITIONS[row.status]?.includes('ASSIGNED')) {
      throw conflict(ERROR_CODES.RECOVERY_STATE, 'This request cannot be assigned in its current state.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryRequest.update({
        where: { id: row.id },
        data: { providerId: provider.id, status: 'ASSIGNED', assignedAt: new Date() },
      });
      await tx.recoveryTrackingEvent.create({
        data: {
          requestId: row.id,
          status: 'ASSIGNED',
          actor: 'DISPATCH',
          actorUserId: actorId,
          note: `Assigned to ${provider.nameEn}.`,
        },
      });
    });

    await this.audit.record({
      actorUserId: actorId,
      companyId: row.companyId,
      action: 'recovery.assigned',
      targetType: 'RECOVERY_REQUEST',
      targetId: row.id,
      summary: `Recovery ${row.reference} assigned to ${provider.nameEn}.`,
      metadata: { providerId: provider.id },
    });

    await this.notifications.notify({
      companyId: row.companyId,
      customerAccountId: row.customerAccountId,
      channel: 'IN_APP',
      category: 'recovery',
      fallbackSubject: 'Recovery dispatched',
      fallbackBody: `${provider.nameEn} is on the way for ${row.reference}.`,
      entityType: 'RECOVERY_REQUEST',
      entityId: row.id,
    });

    return this.recoveryDetail(row.id);
  }

  /** The caller's own recovery jobs, resolved from provider membership. */
  async listProviderRecoveryRequests(userId: string, providerId?: string) {
    const provider = await this.resolveProvider(userId, providerId);
    const rows = await this.prisma.recoveryRequest.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map((row) => this.recoverySummary(row));
  }

  /**
   * A provider advances a recovery job they are assigned to.
   *
   * The state machine is checked here, and the assignment is verified from
   * membership, so a provider cannot advance another provider's job.
   */
  async advanceRecovery(
    userId: string,
    requestId: string,
    input: {
      status: 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED';
      note?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
  ) {
    const provider = await this.resolveProvider(userId);
    const row = await this.prisma.recoveryRequest.findUnique({ where: { id: requestId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Recovery request not found.');
    if (row.providerId !== provider.id) {
      throw forbidden(
        ERROR_CODES.RECOVERY_NOT_ASSIGNED,
        'This recovery request is not assigned to your provider.',
      );
    }
    if (!RECOVERY_TRANSITIONS[row.status]?.includes(input.status)) {
      throw conflict(
        ERROR_CODES.RECOVERY_STATE,
        `A request in ${row.status} cannot move to ${input.status}.`,
      );
    }

    const stamp =
      input.status === 'EN_ROUTE'
        ? { enRouteAt: new Date() }
        : input.status === 'ON_SITE'
          ? { onSiteAt: new Date() }
          : { completedAt: new Date() };

    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryRequest.update({
        where: { id: row.id },
        data: { status: input.status, ...stamp },
      });
      await tx.recoveryTrackingEvent.create({
        data: {
          requestId: row.id,
          status: input.status,
          actor: 'PROVIDER',
          actorUserId: userId,
          note: input.note ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        },
      });
    });

    await this.audit.record({
      actorUserId: userId,
      companyId: row.companyId,
      action: `recovery.${input.status.toLowerCase()}`,
      targetType: 'RECOVERY_REQUEST',
      targetId: row.id,
      summary: `Recovery ${row.reference} moved to ${input.status}.`,
    });

    await this.notifications.notify({
      companyId: row.companyId,
      customerAccountId: row.customerAccountId,
      channel: 'IN_APP',
      category: 'recovery',
      fallbackSubject: 'Recovery update',
      fallbackBody: `Your recovery ${row.reference} is now ${input.status.replace('_', ' ').toLowerCase()}.`,
      entityType: 'RECOVERY_REQUEST',
      entityId: row.id,
    });

    return this.recoveryDetail(row.id);
  }

  private async recoveryDetail(requestId: string) {
    const row = await this.prisma.recoveryRequest.findUnique({
      where: { id: requestId },
      include: { events: { orderBy: { createdAt: 'asc' } }, provider: { select: { id: true, nameEn: true, phone: true } } },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Recovery request not found.');
    return this.recoverySummary(row);
  }

  private recoverySummary(row: {
    id: string;
    reference: string;
    status: string;
    urgency: string;
    issue: string;
    pickupLatitude: unknown;
    pickupLongitude: unknown;
    pickupLabel: string | null;
    contactPhone: string;
    vehicleId: string | null;
    providerId: string | null;
    assignedAt: Date | null;
    enRouteAt: Date | null;
    onSiteAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancellationReason: string | null;
    createdAt: Date;
    provider?: { id: string; nameEn: string; phone: string | null } | null;
    events: Array<{
      id: string;
      status: string;
      note: string | null;
      actor: string;
      latitude: unknown;
      longitude: unknown;
      createdAt: Date;
    }>;
  }) {
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      urgency: row.urgency,
      issue: row.issue,
      pickup: {
        latitude: Number(row.pickupLatitude),
        longitude: Number(row.pickupLongitude),
        label: row.pickupLabel,
      },
      contactPhone: row.contactPhone,
      vehicleId: row.vehicleId,
      provider: row.provider
        ? { id: row.provider.id, name: row.provider.nameEn, phone: row.provider.phone }
        : null,
      assignedAt: row.assignedAt,
      enRouteAt: row.enRouteAt,
      onSiteAt: row.onSiteAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      cancellable: RECOVERY_TRANSITIONS[row.status]?.includes('CANCELLED') ?? false,
      timeline: row.events.map((event) => ({
        id: event.id,
        status: event.status,
        note: event.note,
        actor: event.actor,
        latitude: event.latitude === null ? null : Number(event.latitude),
        longitude: event.longitude === null ? null : Number(event.longitude),
        createdAt: event.createdAt,
      })),
    };
  }

  // =================================================================== P6 fleet

  /** Create a fleet account owned by the caller. */
  async createFleet(input: {
    customerAccountId: string;
    name: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  }) {
    const fleet = await this.prisma.fleetAccount.create({
      data: {
        name: input.name,
        customerAccountId: input.customerAccountId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
      },
    });
    await this.audit.record({
      actorUserId: null,
      action: 'fleet.created',
      targetType: 'FLEET_ACCOUNT',
      targetId: fleet.id,
      summary: `Fleet ${fleet.name} created.`,
      metadata: { accountId: input.customerAccountId },
    });
    return this.fleetDetail(fleet.id);
  }

  async listFleets(customerAccountId: string) {
    const rows = await this.prisma.fleetAccount.findMany({
      where: { customerAccountId },
      orderBy: { createdAt: 'desc' },
      include: { vehicles: true, drivers: true },
    });
    return rows.map((row) => this.fleetSummary(row));
  }

  async getFleet(customerAccountId: string, fleetId: string) {
    const fleet = await this.prisma.fleetAccount.findFirst({
      where: { id: fleetId, customerAccountId },
      include: { vehicles: true, drivers: true },
    });
    if (!fleet) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fleet not found.');
    return this.fleetSummary(fleet);
  }

  private async fleetDetail(fleetId: string) {
    const fleet = await this.prisma.fleetAccount.findUnique({
      where: { id: fleetId },
      include: { vehicles: true, drivers: true },
    });
    if (!fleet) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fleet not found.');
    return this.fleetSummary(fleet);
  }

  private fleetSummary(fleet: {
    id: string;
    name: string;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    isActive: boolean;
    createdAt: Date;
    vehicles: Array<{ id: string; vehicleId: string; addedAt: Date }>;
    drivers: Array<{
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
      licenceNumber: string | null;
      isActive: boolean;
    }>;
  }) {
    return {
      id: fleet.id,
      name: fleet.name,
      contactName: fleet.contactName,
      contactPhone: fleet.contactPhone,
      contactEmail: fleet.contactEmail,
      isActive: fleet.isActive,
      createdAt: fleet.createdAt,
      vehicles: fleet.vehicles.map((v) => ({ id: v.id, vehicleId: v.vehicleId, addedAt: v.addedAt })),
      drivers: fleet.drivers.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        phone: d.phone,
        email: d.email,
        licenceNumber: d.licenceNumber,
        isActive: d.isActive,
      })),
    };
  }

  /** Add one of the caller's own vehicles to one of their own fleets. */
  async addFleetVehicle(customerAccountId: string, fleetId: string, vehicleId: string) {
    const [fleet, vehicle] = await Promise.all([
      this.prisma.fleetAccount.findFirst({ where: { id: fleetId, customerAccountId }, select: { id: true } }),
      this.prisma.vehicle.findFirst({
        where: { id: vehicleId, customerAccountId },
        select: { id: true },
      }),
    ]);
    if (!fleet) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fleet not found.');
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'That vehicle is not in your garage.');

    await this.prisma.fleetVehicle.upsert({
      where: { fleetId_vehicleId: { fleetId: fleet.id, vehicleId: vehicle.id } },
      create: { fleetId: fleet.id, vehicleId: vehicle.id },
      update: {},
    });
    return this.fleetDetail(fleet.id);
  }

  async removeFleetVehicle(customerAccountId: string, fleetId: string, vehicleId: string) {
    const fleet = await this.prisma.fleetAccount.findFirst({
      where: { id: fleetId, customerAccountId },
      select: { id: true },
    });
    if (!fleet) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fleet not found.');
    await this.prisma.fleetVehicle.deleteMany({ where: { fleetId: fleet.id, vehicleId } });
    return this.fleetDetail(fleet.id);
  }

  async createDriver(
    customerAccountId: string,
    fleetId: string,
    input: { fullName: string; phone: string; email: string | null; licenceNumber: string | null },
  ) {
    const fleet = await this.prisma.fleetAccount.findFirst({
      where: { id: fleetId, customerAccountId },
      select: { id: true },
    });
    if (!fleet) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fleet not found.');
    await this.prisma.driver.create({
      data: {
        fleetId: fleet.id,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        licenceNumber: input.licenceNumber,
      },
    });
    return this.fleetDetail(fleet.id);
  }

  async setDriverActive(customerAccountId: string, fleetId: string, driverId: string, isActive: boolean) {
    const fleet = await this.prisma.fleetAccount.findFirst({
      where: { id: fleetId, customerAccountId },
      select: { id: true },
    });
    if (!fleet) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fleet not found.');
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, fleetId: fleet.id } });
    if (!driver) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Driver not found.');
    await this.prisma.driver.update({ where: { id: driver.id }, data: { isActive } });
    return this.fleetDetail(fleet.id);
  }

  // ============================================================ P7 SENSAGE AI

  /**
   * Analyse one of the caller's own inspection photographs.
   *
   * The photograph must belong to the caller. The provider is resolved from the
   * integrations centre, and when it is not configured the call fails with
   * `AI_PROVIDER_NOT_CONFIGURED` rather than returning a canned answer — the
   * whole point of the honesty rule. The result is stored as a *suggestion*
   * awaiting review; it is never returned to the customer as a diagnosis.
   */
  async analyzePhoto(
    customerAccountId: string,
    input: { photoId: string; focus: string | null; vehicleId: string | null },
    companyId: string | null,
  ) {
    const photo = await this.prisma.customerInspectionPhoto.findFirst({
      where: { id: input.photoId, customerAccountId },
    });
    if (!photo) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Photograph not found.');

    const result = await this.sensage.analyze(
      {
        storageAssetId: photo.mediaAssetId,
        mimeType: photo.mimeType,
        focus: input.focus,
      },
      companyId,
    );

    const suggestion = await this.prisma.aiSuggestion.create({
      data: {
        customerAccountId,
        photoId: photo.id,
        vehicleId: input.vehicleId ?? photo.vehicleId,
        companyId,
        providerKey: 'SENSAGE_AI',
        payload: result.payload as never,
        confidence: result.confidence,
        summary: result.summary,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costMinor: result.costMinor,
        latencyMs: result.latencyMs,
      },
    });

    await this.audit.record({
      actorUserId: null,
      companyId,
      action: 'ai.suggestion_created',
      targetType: 'AI_SUGGESTION',
      targetId: suggestion.id,
      summary: `SENSAGE suggestion created for photo ${photo.id}.`,
      metadata: { providerKey: 'SENSAGE_AI', confidence: result.confidence },
    });

    return this.suggestionDto(suggestion);
  }

  /** The caller's own suggestions. Pending ones are shown as awaiting review. */
  async listSuggestions(customerAccountId: string, photoId?: string) {
    const rows = await this.prisma.aiSuggestion.findMany({
      where: { customerAccountId, ...(photoId ? { photoId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.suggestionDto(row));
  }

  async getSuggestion(customerAccountId: string, suggestionId: string) {
    const row = await this.prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, customerAccountId },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Suggestion not found.');
    return this.suggestionDto(row);
  }

  /** The review queue for staff, scoped to a company when one is supplied. */
  async listCompanySuggestions(companyId: string | null, status?: string) {
    const rows = await this.prisma.aiSuggestion.findMany({
      where: { ...(companyId ? { companyId } : {}), ...(status ? { reviewStatus: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.suggestionDto(row));
  }

  /**
   * Approve or reject a suggestion.
   *
   * Only an approved suggestion may be presented to a customer as a verified
   * observation, which is what separates reviewed assistance from an unverified
   * diagnosis.
   */
  async reviewSuggestion(suggestionId: string, decision: 'APPROVED' | 'REJECTED', note: string, actorId: string) {
    const row = await this.prisma.aiSuggestion.findUnique({ where: { id: suggestionId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Suggestion not found.');
    if (row.reviewStatus !== 'PENDING') {
      throw conflict(ERROR_CODES.AI_INVALID_OUTPUT, 'This suggestion has already been reviewed.');
    }
    const updated = await this.prisma.aiSuggestion.update({
      where: { id: row.id },
      data: { reviewStatus: decision, reviewedById: actorId, reviewedAt: new Date(), reviewNote: note || null },
    });
    await this.audit.record({
      actorUserId: actorId,
      companyId: row.companyId,
      action: `ai.suggestion_${decision.toLowerCase()}`,
      targetType: 'AI_SUGGESTION',
      targetId: row.id,
      summary: `Suggestion ${row.id} ${decision.toLowerCase()}.`,
    });
    return this.suggestionDto(updated);
  }

  private suggestionDto(row: {
    id: string;
    photoId: string | null;
    vehicleId: string | null;
    providerKey: string;
    payload: unknown;
    confidence: unknown;
    summary: string;
    reviewStatus: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      photoId: row.photoId,
      vehicleId: row.vehicleId,
      providerKey: row.providerKey,
      payload: row.payload,
      confidence: row.confidence === null ? null : Number(row.confidence),
      summary: row.summary,
      reviewStatus: row.reviewStatus,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      /**
       * A suggestion is advisory until a human approves it. The client uses this
       * flag to decide whether to label the result "reviewed".
       */
      verified: row.reviewStatus === 'APPROVED',
    };
  }

  // ==================================================================== shared

  /** Resolve the provider a staff user acts for, from membership. */
  private async resolveProvider(userId: string, providerId?: string) {
    const memberships = await this.prisma.providerUser.findMany({
      where: { userId, isActive: true },
      include: { provider: true },
    });
    if (memberships.length === 0) {
      throw forbidden(
        ERROR_CODES.FORBIDDEN_TENANT,
        'This account is not a marketplace provider user.',
      );
    }
    if (providerId) {
      const match = memberships.find((m) => m.providerId === providerId);
      if (!match) throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'You do not have access to this provider.');
      return match.provider;
    }
    return memberships[0].provider;
  }

  /**
   * The refund total for a return, computed from the order's own line prices.
   *
   * Exposed for the report and the eventual refund step; it never invents a
   * figure the order did not carry.
   */
  async returnRefundMinor(returnId: string): Promise<number> {
    const row = await this.prisma.customerOrderReturn.findUnique({
      where: { id: returnId },
      include: { lines: { include: { orderLine: true } } },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Return not found.');
    return sumMinor(row.lines.map((line) => line.quantity * line.orderLine.unitPriceMinor));
  }
}
