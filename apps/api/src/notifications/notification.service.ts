import { Injectable, Logger } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ERROR_CODES, notFound } from '../common/errors';
import {
  EmailAdapter,
  InAppAdapter,
  PushAdapter,
  SmsAdapter,
  WhatsAppAdapter,
  type NotificationAdapter,
} from './notification-adapters';

export type NotificationChannelName = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

export interface NotifyInput {
  companyId?: string | null;
  customerAccountId?: string | null;
  userId?: string | null;
  channel: NotificationChannelName;
  category: string;
  /** Template key; when omitted the caller must supply `body`. */
  templateKey?: string;
  /** Interpolation values for the template. */
  variables?: Record<string, string | number>;
  /** Used when no template is supplied, or when no template matches. */
  fallbackSubject?: string;
  fallbackBody?: string;
  recipient?: string | null;
  locale?: 'ar' | 'en';
  entityType?: string | null;
  entityId?: string | null;
}

const MAX_ATTEMPTS = 3;
/** Backoff between retries, indexed by attempt count. */
const RETRY_DELAY_MINUTES = [5, 30, 120];

/**
 * Renders and delivers customer notifications across channels.
 *
 * ## What this service guarantees
 *
 * Every call records a `NotificationDelivery` row **before** it attempts to
 * transmit. The row carries a `providerState`, so the platform can always answer
 * "what did we tell this customer, and did it actually leave?" without trusting
 * a third party's dashboard.
 *
 * ## What it deliberately does not fake
 *
 * Only `IN_APP` is fully operational. Email, SMS, WhatsApp and push adapters are
 * real classes with real configuration checks, but with no credentials they
 * record `SKIPPED` / `NOT_CONFIGURED` instead of `SENT`. A delivery is marked
 * `SENT` only when an adapter reports the provider accepted it.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly adapters: Map<string, NotificationAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inApp: InAppAdapter,
    private readonly email: EmailAdapter,
    private readonly sms: SmsAdapter,
    private readonly whatsapp: WhatsAppAdapter,
    private readonly push: PushAdapter,
  ) {
    this.adapters = new Map<string, NotificationAdapter>(
      [this.inApp, this.email, this.sms, this.whatsapp, this.push].map((adapter) => [
        adapter.channel,
        adapter,
      ]),
    );
  }

  /** Report which channels can actually transmit, for the admin UI. */
  adapterStatus() {
    return [...this.adapters.values()].map((adapter) => ({
      channel: adapter.channel,
      provider: adapter.providerName,
      configured: adapter.isConfigured(),
    }));
  }

  /**
   * Interpolate `{{name}}` placeholders.
   *
   * An unknown placeholder is left intact rather than replaced with an empty
   * string, so a broken template is visible in the stored delivery instead of
   * silently sending a sentence with a hole in it.
   */
  private render(template: string, variables: Record<string, string | number> = {}): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
      key in variables ? String(variables[key]) : match,
    );
  }

  /**
   * Resolve the message body for a channel.
   *
   * Preference order: the requested locale, then Arabic, then any active row.
   * Arabic is the fallback because it is the platform default locale.
   */
  private async resolveTemplate(
    key: string,
    channel: NotificationChannelName,
    locale: 'ar' | 'en',
  ) {
    const candidates = locale === 'en' ? ['en', 'ar'] : ['ar', 'en'];
    for (const candidate of candidates) {
      const row = await this.prisma.notificationTemplate.findFirst({
        where: { key, channel, locale: candidate as Locale, isActive: true },
      });
      if (row) return row;
    }
    return null;
  }

  /**
   * Honour a customer's notification preferences.
   *
   * An absent row means "not configured" and is treated as enabled, because the
   * customer never asked to be excluded. Only an explicit `enabled: false`
   * suppresses a message.
   */
  private async isAllowed(
    accountId: string | null | undefined,
    channel: NotificationChannelName,
    category: string,
  ): Promise<boolean> {
    if (!accountId) return true;
    const row = await this.prisma.customerNotificationPreference.findUnique({
      where: {
        accountId_channel_category: { accountId, channel: channel as never, category },
      },
    });
    return row ? row.enabled : true;
  }

  /**
   * Queue and attempt a notification.
   *
   * Returns the delivery row. A suppressed or unconfigured send is still a row,
   * so the customer's notification centre and the operator's delivery log agree.
   */
  async notify(input: NotifyInput) {
    const locale = input.locale ?? 'ar';

    const allowed = await this.isAllowed(input.customerAccountId, input.channel, input.category);
    if (!allowed) {
      return this.prisma.notificationDelivery.create({
        data: {
          companyId: input.companyId ?? null,
          customerAccountId: input.customerAccountId ?? null,
          userId: input.userId ?? null,
          channel: input.channel as never,
          category: input.category,
          templateKey: input.templateKey ?? null,
          locale: locale as Locale,
          recipient: input.recipient ?? null,
          subject: input.fallbackSubject ?? null,
          body: input.fallbackBody ?? 'Suppressed by customer preference.',
          status: 'SKIPPED',
          providerState: 'NOT_CONFIGURED',
          error: 'Suppressed by customer notification preference.',
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        },
      });
    }

    let subject = input.fallbackSubject ?? null;
    let body = input.fallbackBody ?? '';

    if (input.templateKey) {
      const template = await this.resolveTemplate(input.templateKey, input.channel, locale);
      if (template) {
        subject = template.subject ? this.render(template.subject, input.variables) : subject;
        body = this.render(template.body, input.variables);
      } else if (!input.fallbackBody) {
        // No template and no fallback: record the gap rather than sending a
        // blank message.
        return this.prisma.notificationDelivery.create({
          data: {
            companyId: input.companyId ?? null,
            customerAccountId: input.customerAccountId ?? null,
            userId: input.userId ?? null,
            channel: input.channel as never,
            category: input.category,
            templateKey: input.templateKey,
            locale: locale as Locale,
            recipient: input.recipient ?? null,
            subject,
            body: '',
            status: 'FAILED',
            providerState: 'NOT_CONFIGURED',
            error: `No active template "${input.templateKey}" for channel ${input.channel} and locale ${locale}.`,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
          },
        });
      }
    }

    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        companyId: input.companyId ?? null,
        customerAccountId: input.customerAccountId ?? null,
        userId: input.userId ?? null,
        channel: input.channel as never,
        category: input.category,
        templateKey: input.templateKey ?? null,
        locale: locale as Locale,
        recipient: input.recipient ?? null,
        subject,
        body,
        status: 'QUEUED',
        providerState: 'PENDING',
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });

    return this.attempt(delivery.id);
  }

  /** Transmit one queued delivery and record the outcome. */
  async attempt(deliveryId: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Delivery not found.');
    if (['SENT', 'DELIVERED'].includes(delivery.status)) return delivery;

    const adapter = this.adapters.get(delivery.channel);
    if (!adapter) {
      return this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          providerState: 'NOT_CONFIGURED',
          attempts: { increment: 1 },
          error: `No adapter is registered for channel ${delivery.channel}.`,
        },
      });
    }

    const outcome = await adapter.send({
      to: delivery.recipient ?? '',
      subject: delivery.subject ?? undefined,
      body: delivery.body,
      locale: delivery.locale,
    });

    if (outcome.sent) {
      return this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SENT',
          providerState: 'CONFIGURED',
          provider: outcome.provider,
          providerReference: outcome.providerReference ?? null,
          attempts: { increment: 1 },
          sentAt: new Date(),
          error: null,
          nextAttemptAt: null,
        },
      });
    }

    const attempts = delivery.attempts + 1;
    const exhausted = attempts >= delivery.maxAttempts;
    // An unconfigured provider is not a transient failure: retrying would keep
    // failing, so it is recorded as SKIPPED and never retried automatically.
    const unconfigured = !adapter.isConfigured();

    const nextAttemptAt =
      unconfigured || exhausted
        ? null
        : new Date(
            Date.now() +
              (RETRY_DELAY_MINUTES[Math.min(attempts - 1, RETRY_DELAY_MINUTES.length - 1)] ?? 60) *
                60_000,
          );

    return this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: unconfigured ? 'SKIPPED' : 'FAILED',
        providerState: unconfigured ? 'NOT_CONFIGURED' : 'ERROR',
        provider: outcome.provider,
        attempts: { increment: 1 },
        error: outcome.error ?? 'Delivery failed.',
        nextAttemptAt,
      },
    });
  }

  /**
   * Retry deliveries whose backoff has elapsed.
   *
   * Rows in `SKIPPED` are excluded, because an unconfigured provider cannot be
   * fixed by retrying and would otherwise accumulate attempts forever.
   */
  async retryDue(limit = 100): Promise<number> {
    const due = await this.prisma.notificationDelivery.findMany({
      where: { status: 'FAILED', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const row of due) {
      await this.attempt(row.id);
    }
    return due.length;
  }

  // ------------------------------------------------------------- customer views

  /** The customer's in-app notification centre. */
  async listForCustomer(
    accountId: string,
    params: { page: number; pageSize: number; unreadOnly?: boolean },
  ) {
    const where = {
      customerAccountId: accountId,
      channel: 'IN_APP' as never,
      ...(params.unreadOnly ? { deliveredAt: null } : {}),
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          category: true,
          subject: true,
          body: true,
          entityType: true,
          entityId: true,
          deliveredAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notificationDelivery.count({ where }),
      this.prisma.notificationDelivery.count({
        where: { customerAccountId: accountId, channel: 'IN_APP' as never, deliveredAt: null },
      }),
    ]);
    return { items, total, unread };
  }

  /**
   * Mark in-app notifications as read.
   *
   * Scoped by `customerAccountId` so a customer cannot mark another customer's
   * notifications, even with a valid id.
   */
  async markRead(accountId: string, ids: string[]): Promise<number> {
    const result = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: { in: ids },
        customerAccountId: accountId,
        channel: 'IN_APP' as never,
        deliveredAt: null,
      },
      data: { deliveredAt: new Date(), status: 'DELIVERED' as never },
    });
    return result.count;
  }

  async markAllRead(accountId: string): Promise<number> {
    const result = await this.prisma.notificationDelivery.updateMany({
      where: { customerAccountId: accountId, channel: 'IN_APP' as never, deliveredAt: null },
      data: { deliveredAt: new Date(), status: 'DELIVERED' as never },
    });
    return result.count;
  }

  /** Operator view of what was actually delivered, per channel and state. */
  async deliveryReport(companyId: string, from: Date, to: Date) {
    const grouped = await this.prisma.notificationDelivery.groupBy({
      by: ['channel', 'status'],
      where: { companyId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    return grouped.map((row) => ({
      channel: row.channel,
      status: row.status,
      count: row._count._all,
    }));
  }
}
