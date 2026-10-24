'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_CURRENCY, type DashboardResponse } from '@oryx/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, ErrorBanner, Skeleton } from '@/components/ui';
import { MiniBarChart, MiniDonut } from '@/components/charts';

/**
 * لوحة المعلومات — the statistics and analytics surface.
 *
 * Every KPI, chart and activity feed lives here so the homepage can stay a
 * banner plus the system modules. The data comes from the same DB-backed
 * `/dashboard` endpoint the homepage used to call.
 */
export default function DashboardOverviewPage() {
  const { t, locale } = useUi();
  const { companyId, branchId } = useAuth();
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
    currency: k?.currency ?? DEFAULT_CURRENCY,
    maximumFractionDigits: 0,
  });

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold">{t('dash.title')}</h1>
          <p className="oryx-muted m-0 text-[12.5px]">{t('dash.subtitle')}</p>
        </div>
        {data?.scope.isPlatformScope ? (
          <Badge tone="gold">{t('context.allCompanies')}</Badge>
        ) : data?.scope.companyNameEn ? (
          <Badge tone="gold">{data.scope.companyNameEn}</Badge>
        ) : null}
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
          Array.from({ length: 8 }).map((_, i) => (
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
        <Card className="p-5 lg:col-span-2" data-testid="module-adoption">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="oryx-panel-title m-0">{t('dash.moduleAdoption')}</p>
              <p className="oryx-faint m-0 text-[11.5px]">{t('dash.moduleAdoptionHint')}</p>
            </div>
            <Badge tone="gold">{data?.kpis.modulesLicensed ?? 0}</Badge>
          </div>
          {loading ? (
            <Skeleton height={160} />
          ) : (data?.moduleAdoption.length ?? 0) === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            // Each row is a module with a licensed/not-licensed indicator; the
            // API reports these as 0/1 flags, so a chart would be misleading.
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
              {data!.moduleAdoption.map((m) => {
                const licensed = m.value === 1;
                return (
                  <li key={m.label} className="flex items-center gap-2 text-[12.5px]">
                    <span
                      className="grid h-5 w-5 flex-none place-items-center rounded-md"
                      style={{
                        background: licensed
                          ? 'color-mix(in srgb, var(--success) 20%, transparent)'
                          : 'var(--surface-raised)',
                        color: licensed ? 'var(--success)' : 'var(--text-faint)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Icon name={licensed ? 'check' : 'close'} size={12} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    <span className="oryx-faint text-[11px]">
                      {licensed ? t('modules.available') : t('modules.notLicensed')}
                    </span>
                  </li>
                );
              })}
            </ul>
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
        <span className="oryx-muted oryx-kpi-label block text-[11.5px] font-semibold uppercase tracking-wide">{label}</span>
        <span className="oryx-kpi-value block truncate">{value}</span>
        {sub ? <span className="oryx-faint block text-[11.5px]">{sub}</span> : null}
      </span>
    </Card>
  );
}
