'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tileImageUrl, type DashboardResponse } from '@oryx/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from '@/components/ui';
import { MiniBarChart, MiniDonut, MiniLineChart } from '@/components/charts';

export default function DashboardPage() {
  const { t, locale } = useUi();
  const { companyId, branchId, can } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.dashboard({ companyId, branchId });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, branchId]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} />
      </div>
    );
  }

  const k = data?.kpis;
  const currency = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: k?.currency ?? 'SAR',
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard">
      {/* Hero — automotive-led banner mirroring the approved reference. */}
      <section className="oryx-hero" data-testid="dashboard-hero">
        <div className="oryx-hero__media" style={{ backgroundImage: 'url(/tiles/hero-automotive.jpg)' }} />
        <div className="oryx-hero__scrim" />
        <div className="relative flex w-full flex-wrap items-end justify-between gap-5 p-6">
          <div className="max-w-[54ch]">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: 'var(--gold-soft)' }}>
              {data?.scope.isPlatformScope ? t('context.allCompanies') : data?.scope.companyNameEn}
            </p>
            <h1 className="m-0 mt-2 text-[26px] font-extrabold leading-tight">{t('dash.heroTitle')}</h1>
            <p className="m-0 mt-2 max-w-[52ch] text-[13px] text-white/80">{t('dash.heroBody')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {data?.scope.branchId ? (
              <span className="oryx-badge" style={{ background: 'rgba(0,15,30,.6)', borderColor: 'rgba(212,175,55,.5)', color: '#fff' }}>
                {t('context.branch')}: {data.scope.branchId.slice(0, 8)}
              </span>
            ) : null}
            {can('platform.company.read') || can('company.read') ? (
              <Link href="/companies" className="oryx-btn oryx-btn--primary">
                <Icon name="building" size={16} />
                {t('dash.heroCta')}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {data?.isDemoData ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[12.5px]"
          style={{
            borderColor: 'color-mix(in srgb, var(--warning) 38%, transparent)',
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          }}
          data-testid="demo-notice"
        >
          <Icon name="info" size={16} />
          <strong>{t('dash.demoNotice')}</strong>
          <span className="oryx-muted">{t('dash.demoNoticeBody')}</span>
        </div>
      ) : null}

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 [&>*]:min-w-0" data-testid="kpi-row">
        {loading || !k ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton height={12} width="55%" />
              <div className="mt-3">
                <Skeleton height={26} width="40%" />
              </div>
            </Card>
          ))
        ) : (
          <>
            <Kpi
              icon="building"
              label={t('dash.kpi.companies')}
              value={String(k.companies)}
              sub={`${k.activeCompanies} ${t('common.active')}`}
            />
            <Kpi icon="mapPin" label={t('dash.kpi.branches')} value={String(k.branches)} />
            <Kpi icon="users" label={t('dash.kpi.users')} value={String(k.users)} />
            <Kpi
              icon="creditCard"
              label={t('dash.kpi.activeSubscriptions')}
              value={String(k.activeSubscriptions)}
            />
            <Kpi
              icon="scroll"
              label={t('dash.kpi.mrr')}
              value={currency.format(k.monthlyRecurringRevenue)}
              sub={k.currency}
            />
            <Kpi icon="package" label={t('dash.kpi.modulesLicensed')} value={String(k.modulesLicensed)} />
            <Kpi
              icon="shield"
              label={t('dash.kpi.planUtilisation')}
              value={`${k.planUtilisationPct}%`}
            />
            <Kpi
              icon="lifeBuoy"
              label={t('dash.kpi.supportSessions')}
              value={String(k.openSupportSessions)}
            />
          </>
        )}
      </section>

      {/* Analytics */}
      <section className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-5 lg:col-span-2" data-testid="chart-branches">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="oryx-panel-title m-0">{t('dash.branchPerformance')}</p>
              <p className="oryx-faint m-0 text-[11.5px]">{t('dash.branchPerformanceHint')}</p>
            </div>
            <Badge tone="gold">{data?.branchPerformance.length ?? 0}</Badge>
          </div>
          {loading ? (
            <Skeleton height={190} />
          ) : (data?.branchPerformance.length ?? 0) === 0 ? (
            <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
          ) : (
            <MiniBarChart
              data={data!.branchPerformance}
              height={190}
              valueFormatter={(v) => String(v)}
            />
          )}
        </Card>

        <Card className="p-5" data-testid="chart-modules">
          <div className="mb-3">
            <p className="oryx-panel-title m-0">{t('dash.moduleAdoption')}</p>
            <p className="oryx-faint m-0 text-[11.5px]">{t('dash.moduleAdoptionHint')}</p>
          </div>
          {loading ? (
            <Skeleton height={190} />
          ) : (
            <MiniDonut
              value={data?.kpis.modulesLicensed ?? 0}
              total={17}
              height={190}
              label={t('dash.kpi.modulesLicensed')}
            />
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="p-5 lg:col-span-2">
          <p className="oryx-panel-title m-0 mb-3">{t('dash.moduleAdoptionHint')}</p>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <MiniLineChart
              data={(data?.moduleAdoption ?? []).map((p, i) => ({ label: String(i + 1), value: p.value }))}
              height={160}
            />
          )}
        </Card>

        <Card className="p-5" data-testid="recent-activity">
          <p className="oryx-panel-title m-0 mb-3">{t('dash.recentActivity')}</p>
          {loading ? (
            <Skeleton height={160} />
          ) : (data?.recentActivity.length ?? 0) === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data!.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-[12.5px]">
                  <span className="oryx-gold mt-1">
                    <Icon name="check" size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{a.action}</span>
                    <span className="oryx-faint block text-[11px]">
                      {a.actorEmail ?? 'system'} ·{' '}
                      {new Date(a.createdAt).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Image-led module tiles — the centrepiece of the approved design. */}
      <section data-testid="module-tiles">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="m-0 text-[17px] font-extrabold">{t('dash.modules')}</h2>
            <p className="oryx-muted m-0 text-[12.5px]">{t('dash.modulesHint')}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={186} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
            {(data?.tiles ?? []).map((tile) => (
              <Link
                key={tile.moduleKey}
                href={tile.route}
                className={`oryx-tile ${tile.available ? '' : 'oryx-tile--planned'}`}
                data-testid={`tile-${tile.moduleKey}`}
              >
                <span
                  className="oryx-tile__media"
                  style={{ backgroundImage: `url(${tileImageUrl(tile.tileImage)})` }}
                />
                <span className="oryx-tile__scrim" />
                <span className="oryx-tile__body">
                  <span className="flex items-start justify-between gap-2">
                    <span className="oryx-tile__icon">
                      <Icon name={iconFor(tile.moduleKey)} size={18} />
                    </span>
                    <span
                      className="oryx-badge"
                      style={{
                        background: 'rgba(0,15,30,.62)',
                        borderColor: tile.available ? 'rgba(62,207,142,.55)' : 'rgba(212,175,55,.45)',
                        color: tile.available ? 'var(--success)' : 'var(--gold-soft)',
                      }}
                    >
                      {tile.available ? t('modules.available') : t('modules.planned')}
                    </span>
                  </span>
                  <span className="oryx-tile__title">{locale === 'ar' ? tile.nameAr : tile.nameEn}</span>
                  <span className="oryx-tile__desc">
                    {locale === 'ar' ? tile.descriptionAr : tile.descriptionEn}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <Card className="flex items-start gap-3 p-4" data-testid={`kpi-${label}`}>
      <span
        className="grid h-10 w-10 flex-none place-items-center rounded-xl"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', color: 'var(--gold)' }}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="oryx-muted block text-[11.5px] font-semibold uppercase tracking-wide">{label}</span>
        <span className="oryx-kpi-value block truncate">{value}</span>
        {sub ? <span className="oryx-faint block text-[11.5px]">{sub}</span> : null}
      </span>
    </Card>
  );
}

function iconFor(moduleKey: string): string {
  const map: Record<string, string> = {
    dashboard: 'gauge',
    company_management: 'building',
    branch_management: 'mapPin',
    financial_accounting: 'calculator',
    sales_pos: 'cart',
    purchasing_procurement: 'truck',
    warehouses_inventory: 'warehouse',
    human_resources: 'users',
    crm: 'heart',
    operations: 'settings',
    automotive_inspections: 'clipboardCheck',
    automotive_maintenance: 'wrench',
    spare_parts: 'package',
    reports_analytics: 'barChart',
    users_permissions: 'shield',
    subscription_management: 'creditCard',
    settings: 'sliders',
  };
  return map[moduleKey] ?? 'gauge';
}
