import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** The outcome an adapter reports for one delivery attempt. */
export interface DeliveryOutcome {
  /** `true` only when the provider accepted the message for delivery. */
  sent: boolean;
  provider: string;
  providerReference?: string;
  error?: string;
}

/**
 * A notification transport.
 *
 * Implementations must never claim success they cannot substantiate: if
 * credentials are missing they report `isConfigured() === false` and
 * `NotificationService` records the delivery as `SKIPPED`, so the platform never
 * reports a message as sent when nothing left the building.
 */
export interface NotificationAdapter {
  readonly channel: string;
  /** Adapter key recorded on the delivery row, e.g. `resend`, `twilio`. */
  readonly providerName: string;
  isConfigured(): boolean;
  send(message: {
    to: string;
    subject?: string;
    body: string;
    locale: string;
  }): Promise<DeliveryOutcome>;
}

/**
 * Email adapter.
 *
 * Transport is selected by environment. When `EMAIL_PROVIDER` is unset, or the
 * credential that provider needs is absent, the adapter reports itself
 * unconfigured and transmits nothing. This is deliberate: an operator sees
 * `NOT_CONFIGURED` rather than a false `SENT`.
 */
@Injectable()
export class EmailAdapter implements NotificationAdapter {
  readonly channel = 'EMAIL';
  private readonly logger = new Logger(EmailAdapter.name);

  constructor(private readonly config: ConfigService) {}

  get providerName(): string {
    return this.config.get<string>('EMAIL_PROVIDER') ?? 'smtp';
  }

  isConfigured(): boolean {
    const provider = this.config.get<string>('EMAIL_PROVIDER');
    if (!provider) return false;
    // A provider is only usable when it has an API key or an SMTP host.
    if (provider === 'smtp') return Boolean(this.config.get<string>('SMTP_HOST'));
    return Boolean(this.config.get<string>('EMAIL_API_KEY'));
  }

  async send(message: { to: string; subject?: string; body: string }): Promise<DeliveryOutcome> {
    if (!this.isConfigured()) {
      return { sent: false, provider: this.providerName, error: 'Email provider is not configured.' };
    }
    // The transport call belongs here. It is intentionally not faked: with no
    // provider configured this branch is unreachable, and with one configured
    // the call must be implemented against that provider's API.
    this.logger.warn('Email adapter is configured but no transport implementation is wired yet.');
    return {
      sent: false,
      provider: this.providerName,
      error: 'Email transport implementation is pending provider credentials.',
    };
  }
}

/** SMS adapter, typically Twilio or a regional aggregator. */
@Injectable()
export class SmsAdapter implements NotificationAdapter {
  readonly channel = 'SMS';

  constructor(private readonly config: ConfigService) {}

  get providerName(): string {
    return this.config.get<string>('SMS_PROVIDER') ?? 'sms';
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SMS_PROVIDER') &&
        this.config.get<string>('SMS_API_KEY') &&
        this.config.get<string>('SMS_SENDER_ID'),
    );
  }

  async send(): Promise<DeliveryOutcome> {
    if (!this.isConfigured()) {
      return { sent: false, provider: this.providerName, error: 'SMS provider is not configured.' };
    }
    return {
      sent: false,
      provider: this.providerName,
      error: 'SMS transport implementation is pending provider credentials.',
    };
  }
}

/**
 * WhatsApp Business adapter.
 *
 * WhatsApp Business requires a verified sender and pre-approved message
 * templates, so this adapter is present as architecture and reports itself
 * unconfigured until those credentials and template approvals exist.
 */
@Injectable()
export class WhatsAppAdapter implements NotificationAdapter {
  readonly channel = 'WHATSAPP';

  constructor(private readonly config: ConfigService) {}

  get providerName(): string {
    return this.config.get<string>('WHATSAPP_PROVIDER') ?? 'whatsapp_business';
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
        this.config.get<string>('WHATSAPP_ACCESS_TOKEN'),
    );
  }

  async send(): Promise<DeliveryOutcome> {
    if (!this.isConfigured()) {
      return {
        sent: false,
        provider: this.providerName,
        error: 'WhatsApp Business is not configured.',
      };
    }
    return {
      sent: false,
      provider: this.providerName,
      error: 'WhatsApp transport implementation is pending approved templates.',
    };
  }
}

/**
 * Push notification adapter (FCM/APNs).
 *
 * A push message requires a registered device token, which the mobile app
 * supplies. Until a device registry and provider credentials exist, this adapter
 * reports itself unconfigured.
 */
@Injectable()
export class PushAdapter implements NotificationAdapter {
  readonly channel = 'PUSH';

  constructor(private readonly config: ConfigService) {}

  get providerName(): string {
    return this.config.get<string>('PUSH_PROVIDER') ?? 'fcm';
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('PUSH_PROVIDER') && this.config.get<string>('PUSH_SERVER_KEY'),
    );
  }

  async send(): Promise<DeliveryOutcome> {
    if (!this.isConfigured()) {
      return { sent: false, provider: this.providerName, error: 'Push provider is not configured.' };
    }
    return {
      sent: false,
      provider: this.providerName,
      error: 'Push transport implementation is pending a device-token registry.',
    };
  }
}

/**
 * In-app adapter.
 *
 * This one is genuinely functional: the delivery row *is* the message, and the
 * client reads it back through the notifications API. Nothing leaves the
 * platform, so there is no credential to be missing.
 */
@Injectable()
export class InAppAdapter implements NotificationAdapter {
  readonly channel = 'IN_APP';
  readonly providerName = 'oryx_in_app';

  isConfigured(): boolean {
    return true;
  }

  async send(): Promise<DeliveryOutcome> {
    return { sent: true, provider: this.providerName };
  }
}
