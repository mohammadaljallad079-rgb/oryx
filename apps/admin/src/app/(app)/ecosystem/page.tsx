'use client';

import { PermissionGate } from '@/components/permission-gate';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, ErrorBanner, SectionHeader, Skeleton } from '@/components/ui';
import { MiniBarChart, MiniLineChart } from '@/components/charts';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';
import { money } from '@/lib/erp-format';
import type { EcosystemMetric } from '@oryx/shared';

/**
 * Ecosystem Overview — the Super Admin's platform-wide control surface.
 *
 * Every figure is a real aggregate over the platform database returned by
 * `GET /platform/ecosystem`. The route is `@PlatformOnly()`, so a company
 * principal cannot reach it; the permission gate below only decides whether the
 * page renders, never whether the data is authorised.
 */
function EcosystemPageInner() {
  const { t, locale } = useUi();
  const overview = useAsync(() => api.ecosystem(), []);
  const data = overview.data;

  const label = (m: EcosystemMetric) => (locale === 'ar' ? m.labelAr : m.labelEn);
  const metricValue = (key: keyof NonNullable<typeof data>['metrics']) => {
    const metric = data?.metrics[key];
    if (!metric) return '—';
    if (metric.amountMinor !== null && metric.amountMinor !== undefined) {
      return money(metric.amountMinor, metric.currency ?? data?.currency);
    }
    return metric.value.toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-US');
  };

  const metricKeys: Array<keyof NonNullable<typeof data>['metrics']> = [
    'customers',
    'providers',
    'pendingProviders',
    'products',
    'services',
    'orders',
    'bookings',
    'paymentsSucceeded',
    'refunds',
    'activePromotions',
    'pendingApprovals',
    'inspections',
  ];

  const metricIcon: Record<string, string> = {
    customers: 'users',
    providers: 'store',
    pendingProviders: 'clipboardCheck',
    products: 'package',
    services: 'wrench',
    orders: 'cart',
    bookings: 'calendar',
    paymentsSucceeded: 'creditCard',
    refunds: 'scroll',
    activePromotions: 'tag',
    pendingApprovals: 'clipboardCheck',
    inspections: 'car',
  };

  const trend = (data?.revenueTrend ?? []).map((p) => ({
    label: p.period.slice(5),
    value: p.amountMinor,
  }));

  const breakdown = (rows: Array<{ key: string; count: number }>) =>
    rows.map((r) => ({ label: r.key, value: r.count }));

  return (
    <div className="flex flex-col gap-5" data-testid="ecosystem-page">
      <SectionHeader
        title={t('eco.title')}
        subtitle={t('eco.subtitle')}
        actions={
          data ? (
            <Badge tone="gold">
              {t('eco.generated')}{' '}
              {new Date(data.generatedAt).toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-GB')}
            </Badge>
          ) : null
        }
      />

      {overview.error ? (
        <ErrorBanner message={overview.error} onRetry={() => void overview.reload()} retryLabel={t('common.retry')} />
      ) : null}

      <Card className="flex items-start gap-3 p-4" flat>
        <span style={{ color: 'var(--gold)' }}>
          <Icon name="info" size={18} />
        </span>
        <p className="oryx-muted m-0 text-[12.5px]">{t('eco.notice')}</p>
      </Card>

      {/* Headline revenue */}
      <section className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0" data-testid="eco-headline">
        <Card className="flex flex-col justify-between p-5">
          <span className="oryx-kpi-label">{t('eco.metric.revenueMinor')}</span>
          {overview.loading ? (
            <Skeleton height={34} width="70%" />
          ) : (
            <span className="oryx-kpi-value">{metricValue('revenueMinor')}</span>
          )}
          <span className="oryx-faint text-[11.5px]">{data?.currency ?? '—'}</span>
        </Card>
        <Card className="p-5 lg:col-span-2" data-testid="eco-trend">
          <p className="oryx-panel-title m-0">{t('eco.revenueTrend')}</p>
          {overview.loading ? (
            <Skeleton height={170} />
          ) : trend.length === 0 ? (
            <EmptyState title={t('eco.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniLineChart data={trend} height={170} />
          )}
        </Card>
      </section>

      {/* Metric grid */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0" data-testid="eco-metrics">
        {overview.loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton height={12} width="55%" />
                <div className="mt-3">
                  <Skeleton height={26} width="40%" />
                </div>
              </Card>
            ))
          : metricKeys.map((key) => {
              const metric = data?.metrics[key];
              if (!metric) return null;
              return (
                <Card key={key} className="flex items-start gap-3 p-4" data-testid={`eco-metric-${key}`}>
                  <span
                    className="grid h-10 w-10 flex-none place-items-center rounded-xl"
                    style={{
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--gold)',
                    }}
                  >
                    <Icon name={metricIcon[key] ?? 'gauge'} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="oryx-muted oryx-kpi-label block text-[11.5px] font-semibold uppercase tracking-wide">
                      {label(metric)}
                    </span>
                    <span className="oryx-kpi-value block truncate">{metricValue(key)}</span>
                  </span>
                </Card>
              );
            })}
      </section>

      {/* Breakdowns */}
      <section className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-5" data-testid="eco-provider-status">
          <p className="oryx-panel-title m-0">{t('eco.providerStatus')}</p>
          {overview.loading ? (
            <Skeleton height={170} />
          ) : (data?.providerStatus.length ?? 0) === 0 ? (
            <EmptyState title={t('eco.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniBarChart data={breakdown(data!.providerStatus)} height={170} />
          )}
        </Card>
        <Card className="p-5" data-testid="eco-order-status">
          <p className="oryx-panel-title m-0">{t('eco.orderStatus')}</p>
          {overview.loading ? (
            <Skeleton height={170} />
          ) : (data?.orderStatus.length ?? 0) === 0 ? (
            <EmptyState title={t('eco.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniBarChart data={breakdown(data!.orderStatus)} height={170} />
          )}
        </Card>
        <Card className="p-5" data-testid="eco-booking-status">
          <p className="oryx-panel-title m-0">{t('eco.bookingStatus')}</p>
          {overview.loading ? (
            <Skeleton height={170} />
          ) : (data?.bookingStatus.length ?? 0) === 0 ? (
            <EmptyState title={t('eco.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniBarChart data={breakdown(data!.bookingStatus)} height={170} />
          )}
        </Card>
      </section>
    </div>
  );
}

export default function EcosystemPage() {
  return (
    <PermissionGate anyOf={['platform.ecosystem.read']}>
      <EcosystemPageInner />
    </PermissionGate>
  );
}
