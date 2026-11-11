import { Injectable } from '@nestjs/common';

import { DEFAULT_CURRENCY } from '@oryx/shared';
import type {
  EcosystemBreakdown,
  EcosystemMetric,
  EcosystemOverviewResponse,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';

/**
 * The platform ecosystem overview.
 *
 * Every figure is a real aggregate over the database and is **platform-scoped**:
 * it counts across every tenant, which is exactly the capability a Super Admin
 * holds and a company administrator does not. The route that serves this is
 * guarded by `platform.ecosystem.read` and `@PlatformOnly()`, so a tenant
 * principal can never reach it.
 *
 * Money is summed in minor units. The currency is the platform's market
 * currency; a mixed-currency deployment would need a conversion step the launch
 * market does not have, and inventing one here would misstate the totals.
 */
@Injectable()
export class EcosystemService {
  constructor(private readonly prisma: PrismaService) {}

  private metric(
    key: string,
    labelEn: string,
    labelAr: string,
    value: number,
    opts: { amountMinor?: number | null; currency?: string | null } = {},
  ): EcosystemMetric {
    return {
      key,
      labelEn,
      labelAr,
      value,
      amountMinor: opts.amountMinor ?? null,
      currency: opts.currency ?? null,
    };
  }

  /** Group an arbitrary `groupBy` result into the shared breakdown shape. */
  private breakdown(
    rows: Array<{ _count: { _all: number } } & Record<string, unknown>>,
    keyField: string,
  ): EcosystemBreakdown[] {
    return rows.map((row) => ({
      key: String(row[keyField]),
      count: row._count._all,
    }));
  }

  async build(): Promise<EcosystemOverviewResponse> {
    const now = new Date();
    // The trend window is the trailing twelve months, which is what a monthly
    // revenue chart reads naturally.
    const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const [
      customerCount,
      providerCount,
      pendingProviderCount,
      productCount,
      serviceCount,
      orderCount,
      bookingCount,
      succeededPaymentAgg,
      refundCount,
      activePromotionCount,
      pendingApprovalCount,
      inspectionCount,
      notificationCount,
      providerStatus,
      orderStatus,
      bookingStatus,
      paidIntents,
    ] = await Promise.all([
      this.prisma.customerAccount.count(),
      this.prisma.marketplaceProvider.count(),
      this.prisma.marketplaceProvider.count({ where: { status: 'PENDING' } }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.providerServiceListing.count({ where: { isActive: true } }),
      this.prisma.customerOrder.count(),
      this.prisma.bookingSlot.count(),
      this.prisma.paymentIntent.aggregate({
        where: { status: 'SUCCEEDED' },
        _sum: { amountMinor: true },
      }),
      this.prisma.refund.count({ where: { status: { in: ['APPROVED', 'PROCESSED'] } } }),
      this.prisma.providerOffer.count({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      }),
      this.prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.inspectionBooking.count(),
      this.prisma.notificationDelivery.count(),
      this.prisma.marketplaceProvider.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.customerOrder.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.bookingSlot.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.paymentIntent.findMany({
        where: { status: 'SUCCEEDED', succeededAt: { gte: trendStart } },
        select: { amountMinor: true, succeededAt: true },
      }),
    ]);

    const revenueMinor = Number(succeededPaymentAgg._sum.amountMinor ?? 0);

    // Bucket the succeeded intents by calendar month. A month with no payments
    // is present as zero rather than absent, so the chart has an unbroken axis.
    const buckets = new Map<string, number>();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
      buckets.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, 0);
    }
    for (const intent of paidIntents) {
      if (!intent.succeededAt) continue;
      const d = intent.succeededAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, (buckets.get(key) ?? 0) + intent.amountMinor);
    }
    const revenueTrend = [...buckets.entries()].map(([period, amountMinor]) => ({
      period,
      amountMinor,
    }));

    const currency = DEFAULT_CURRENCY;

    return {
      generatedAt: now.toISOString(),
      currency,
      metrics: {
        customers: this.metric('customers', 'Customers', 'العملاء', customerCount),
        providers: this.metric('providers', 'Providers', 'مزودو الخدمة', providerCount),
        pendingProviders: this.metric('pendingProviders', 'Pending providers', 'مزودون قيد المراجعة', pendingProviderCount),
        products: this.metric('products', 'Active products', 'المنتجات النشطة', productCount),
        services: this.metric('services', 'Active services', 'الخدمات النشطة', serviceCount),
        orders: this.metric('orders', 'Orders', 'الطلبات', orderCount),
        bookings: this.metric('bookings', 'Bookings', 'الحجوزات', bookingCount),
        revenueMinor: this.metric('revenueMinor', 'Collected revenue', 'الإيرادات المحصّلة', revenueMinor, {
          amountMinor: revenueMinor,
          currency,
        }),
        paymentsSucceeded: this.metric('paymentsSucceeded', 'Payments collected', 'المدفوعات المحصّلة', paidIntents.length),
        refunds: this.metric('refunds', 'Refunds', 'المبالغ المستردة', refundCount),
        activePromotions: this.metric('activePromotions', 'Active promotions', 'العروض النشطة', activePromotionCount),
        pendingApprovals: this.metric('pendingApprovals', 'Pending approvals', 'الموافقات المعلّقة', pendingApprovalCount),
        inspections: this.metric('inspections', 'SENSAGE inspections', 'فحوصات سينساج', inspectionCount),
        notifications: this.metric('notifications', 'Notifications sent', 'الإشعارات المرسلة', notificationCount),
      },
      providerStatus: this.breakdown(providerStatus as never, 'status'),
      orderStatus: this.breakdown(orderStatus as never, 'status'),
      bookingStatus: this.breakdown(bookingStatus as never, 'status'),
      revenueTrend,
      noticeEn:
        'These figures aggregate every tenant on the platform. Revenue counts only payment intents a provider confirmed as succeeded; it is not a forecast.',
      noticeAr:
        'تجمع هذه الأرقام جميع الشركات على المنصة. الإيرادات تحتسب فقط عمليات الدفع التي أكّدها المزوّد بنجاح، وهي ليست توقعاً.',
    };
  }
}
