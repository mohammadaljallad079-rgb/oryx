import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Result of asking a gateway to authorise or capture an intent. */
export interface GatewayResult {
  /** `true` only when the gateway confirmed the charge. */
  authorised: boolean;
  /** The gateway's own reference, when it returned one. */
  providerReference?: string;
  /**
   * Present when the customer must be redirected or challenged to finish, e.g.
   * a hosted checkout URL. The intent moves to `REQUIRES_ACTION`.
   */
  actionUrl?: string;
  /** Raw gateway payload, retained as dispute and reconciliation evidence. */
  raw?: unknown;
  failureReason?: string;
}

export interface RefundResult {
  refunded: boolean;
  providerReference?: string;
  failureReason?: string;
}

/**
 * A payment gateway.
 *
 * ## The honesty rule
 *
 * `isConfigured()` gates every network call. An adapter with no credentials
 * never pretends to have charged a card: it returns `authorised: false` with a
 * reason, and the caller records the intent as unfulfilled. The platform must
 * never report money as collected that a gateway never confirmed.
 */
export interface PaymentGateway {
  readonly provider: string;
  isConfigured(): boolean;
  /** Whether this gateway settles immediately (cash, terminal) or asynchronously. */
  readonly mode: 'IMMEDIATE' | 'REDIRECT' | 'MANUAL';
  createIntent(input: {
    amountMinor: number;
    currency: string;
    reference: string;
    description?: string;
    returnUrl?: string;
  }): Promise<GatewayResult>;
  capture(input: { providerReference: string; amountMinor: number }): Promise<GatewayResult>;
  refund(input: {
    providerReference: string;
    amountMinor: number;
    reason: string;
  }): Promise<RefundResult>;
}

/**
 * Cash and card-terminal payments recorded by staff at the counter.
 *
 * This is not a gateway call: the money changed hands physically and the record
 * is the receipt. It is therefore always "configured", and the confirmation is
 * the operator's own action, which the audit trail attributes to them.
 */
@Injectable()
export class CashGateway implements PaymentGateway {
  readonly provider = 'CASH';
  readonly mode = 'IMMEDIATE' as const;

  isConfigured(): boolean {
    return true;
  }

  async createIntent(input: { reference: string }): Promise<GatewayResult> {
    return { authorised: true, providerReference: `CASH-${input.reference}` };
  }

  async capture(input: { providerReference: string }): Promise<GatewayResult> {
    return { authorised: true, providerReference: input.providerReference };
  }

  async refund(input: { providerReference: string }): Promise<RefundResult> {
    return { refunded: true, providerReference: `CASH-REFUND-${input.providerReference}` };
  }
}

/**
 * Bank transfer.
 *
 * The customer pays outside the platform and an operator records the transfer
 * reference. Confirmation is manual by definition, so `createIntent` leaves the
 * intent awaiting confirmation rather than reporting an authorised charge.
 */
@Injectable()
export class BankTransferGateway implements PaymentGateway {
  readonly provider = 'BANK_TRANSFER';
  readonly mode = 'MANUAL' as const;

  isConfigured(): boolean {
    return true;
  }

  async createIntent(): Promise<GatewayResult> {
    return {
      authorised: false,
      failureReason:
        'Bank transfers are confirmed by an operator once the funds are received; the intent awaits confirmation.',
    };
  }

  async capture(input: { providerReference: string }): Promise<GatewayResult> {
    return { authorised: true, providerReference: input.providerReference };
  }

  async refund(input: { providerReference: string }): Promise<RefundResult> {
    return { refunded: true, providerReference: `BT-REFUND-${input.providerReference}` };
  }
}

/**
 * Card terminal (POS machine).
 *
 * Same shape as cash: the charge happens on the terminal and the operator
 * records the terminal's authorisation code. No network integration is implied.
 */
@Injectable()
export class CardTerminalGateway implements PaymentGateway {
  readonly provider = 'CARD_TERMINAL';
  readonly mode = 'IMMEDIATE' as const;

  isConfigured(): boolean {
    return true;
  }

  async createIntent(input: { reference: string }): Promise<GatewayResult> {
    return { authorised: true, providerReference: `TERM-${input.reference}` };
  }

  async capture(input: { providerReference: string }): Promise<GatewayResult> {
    return { authorised: true, providerReference: input.providerReference };
  }

  async refund(input: { providerReference: string }): Promise<RefundResult> {
    return { refunded: true, providerReference: `TERM-REFUND-${input.providerReference}` };
  }
}

/**
 * BenefitPay (Bahrain) online payment adapter.
 *
 * ## Status: architecture only — not operational
 *
 * BenefitPay requires a merchant agreement with the Bank of Bahrain and Kuwait
 * and production credentials (`BENEFITPAY_MERCHANT_ID`, `BENEFITPAY_API_KEY`,
 * `BENEFITPAY_API_SECRET`, plus the gateway base URL). None of those are in the
 * repository, and this adapter does not contain a speculative wire format.
 *
 * Until credentials exist this adapter reports itself unconfigured and every
 * intent it is asked to create is recorded as unfulfilled. **No claim is made
 * that BenefitPay is live.** When the credentials arrive, `createIntent` must be
 * implemented against the bank's published API and covered by a test that
 * exercises a real sandbox transaction before the provider is enabled.
 */
@Injectable()
export class BenefitPayGateway implements PaymentGateway {
  readonly provider = 'BENEFITPAY';
  readonly mode = 'REDIRECT' as const;
  private readonly logger = new Logger(BenefitPayGateway.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('BENEFITPAY_MERCHANT_ID') &&
        this.config.get<string>('BENEFITPAY_API_KEY') &&
        this.config.get<string>('BENEFITPAY_API_SECRET') &&
        this.config.get<string>('BENEFITPAY_BASE_URL'),
    );
  }

  async createIntent(): Promise<GatewayResult> {
    if (!this.isConfigured()) {
      return {
        authorised: false,
        failureReason:
          'BenefitPay is not configured: merchant credentials are absent. No transaction was created.',
      };
    }
    // Reached only with real credentials. The bank's API call belongs here and
    // must be validated against its sandbox before this provider is enabled.
    this.logger.error(
      'BenefitPay credentials are present but the gateway integration is not implemented.',
    );
    return {
      authorised: false,
      failureReason:
        'BenefitPay credentials are present but the gateway integration has not been implemented yet.',
    };
  }

  async capture(): Promise<GatewayResult> {
    return { authorised: false, failureReason: 'BenefitPay capture is not implemented.' };
  }

  async refund(): Promise<RefundResult> {
    return { refunded: false, failureReason: 'BenefitPay refunds are not implemented.' };
  }
}

/**
 * Generic online card gateway placeholder for providers added later.
 *
 * Present so a new provider is a configuration and an adapter implementation,
 * not a change to the payment service.
 */
@Injectable()
export class OnlineCardGateway implements PaymentGateway {
  readonly provider = 'CARD_ONLINE';
  readonly mode = 'REDIRECT' as const;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CARD_GATEWAY_PROVIDER') &&
        this.config.get<string>('CARD_GATEWAY_API_KEY'),
    );
  }

  async createIntent(): Promise<GatewayResult> {
    return {
      authorised: false,
      failureReason: 'No online card gateway is configured for this deployment.',
    };
  }

  async capture(): Promise<GatewayResult> {
    return { authorised: false, failureReason: 'No online card gateway is configured.' };
  }

  async refund(): Promise<RefundResult> {
    return { refunded: false, failureReason: 'No online card gateway is configured.' };
  }
}
