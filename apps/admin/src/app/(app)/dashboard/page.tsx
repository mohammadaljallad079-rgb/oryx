'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tileImageUrl, type DashboardResponse } from '@oryx/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { BrandLogo } from '@/components/brand-logo';
import { ErrorBanner, Skeleton, StatCard, StatGrid } from '@/components/ui';

/**
 * Homepage — hero banner followed by وحدات النظام (the system modules).
 *
 * Deliberately contains no statistics: KPIs, charts and activity live in
 * لوحة المعلومات at /dashboard/overview. The module grid is still driven by the
 * DB-backed `/dashboard` endpoint so entitlement filtering is unchanged.
 */
export default function DashboardHomePage() {
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

  const scopeLabel = data?.scope.isPlatformScope
    ? t('context.allCompanies')
    : (locale === 'ar' ? data?.scope.companyNameAr : data?.scope.companyNameEn) ??
      data?.scope.companyNameEn;

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard">
      {error ? (
        <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} />
      ) : null}

      {/* ------------------------------------------------ hero banner */}
      <section className="oryx-hero" data-testid="dashboard-hero">
        <div className="oryx-hero__content">
          <span className="oryx-hero__lockup">
            <BrandLogo height={64} className="oryx-hero__logo" />
          </span>
          <div className="oryx-hero__identity">
            <p className="oryx-hero__eyebrow m-0">{scopeLabel ?? ''}</p>
            <h1 className="oryx-hero__title m-0">{t('dash.heroTitle')}</h1>
            <p className="oryx-hero__body m-0">{t('dash.heroBody')}</p>
          </div>
        </div>
      </section>

        {/* --------------------------------------------------- live KPIs */}
        {/* Real figures from `GET /dashboard` (company/branch scoped), so the
            homepage is not a bare banner. The deeper charts stay in لوحة المعلومات. */}
        <section data-testid="dashboard-kpis">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={84} />
              ))}
            </div>
          ) : (
            <StatGrid>
              <StatCard
                icon="building"
                tone="gold"
                label={t('dash.kpi.companies')}
                value={String(data?.kpis.companies ?? 0)}
                sub={`${data?.kpis.activeCompanies ?? 0} ${t('dash.kpi.activeCompanies')}`}
                data-testid="kpi-companies"
              />
              <StatCard
                icon="mapPin"
                label={t('dash.kpi.branches')}
                value={String(data?.kpis.branches ?? 0)}
                data-testid="kpi-branches"
              />
              <StatCard
                icon="users"
                label={t('dash.kpi.users')}
                value={String(data?.kpis.users ?? 0)}
                data-testid="kpi-users"
              />
              <StatCard
                icon="layers"
                tone="success"
                label={t('dash.kpi.modulesLicensed')}
                value={String(data?.kpis.modulesLicensed ?? 0)}
                sub={`${data?.kpis.planUtilisationPct ?? 0}% ${t('dash.kpi.planUtilisation')}`}
                data-testid="kpi-modules"
              />
            </StatGrid>
          )}
        </section>

        {/* ------------------------------------- system modules (وحدات النظام) */}
      <section data-testid="module-tiles">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="m-0 text-[17px] font-extrabold">{t('dash.modules')}</h2>
            <p className="oryx-muted m-0 text-[12.5px]">{t('dash.modulesHint')}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 [&>*]:min-w-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={142} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 [&>*]:min-w-0">
            {(data?.tiles ?? [])
              .filter((tile) => tile.isActive)
              .map((tile) => (
              <Link
                key={tile.moduleKey}
                href={tile.route}
                className={`oryx-tile ${tile.available ? '' : 'oryx-tile--planned'}`}
                data-testid={`tile-${tile.moduleKey}`}
              >
                {/* The approved artwork is a fixed plate and never changes with
                    the theme. Only the information band under it switches. */}
                <span
                  className="oryx-tile__media"
                  style={{ backgroundImage: `url(${tileImageUrl(tile.tileImage)})` }}
                >
                  <span className="oryx-tile__icon">
                    <Icon name={iconFor(tile.moduleKey, tile.icon)} size={24} />
                  </span>
                </span>
                <span className="oryx-tile__band">
                  <span className="oryx-tile__title">{locale === 'ar' ? tile.nameAr : tile.nameEn}</span>
                  <span className="oryx-tile__desc">
                    {locale === 'ar' ? tile.descriptionAr : tile.descriptionEn}
                  </span>
                  <span className="oryx-tile__meta">
                    <span className="oryx-tile__state">
                      {tile.available ? t('modules.available') : t('modules.planned')}
                    </span>
                    <Icon name="arrowForward" size={13} />
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

/**
 * The catalog stores kebab-case icon names, while the inline icon set is
 * camelCase. The catalog value is authoritative now that an operator can change
 * it, so it wins over the per-module fallback; anything unmapped falls back to
 * the gauge glyph rather than rendering nothing.
 */
const KEBAB_ICON_MAP: Record<string, string> = {
  'shopping-cart': 'cart',
  'bar-chart': 'barChart',
  'heart-handshake': 'heart',
  'clipboard-check': 'clipboardCheck',
  'map-pin': 'mapPin',
  'credit-card': 'creditCard',
  'sliders': 'sliders',
  'gauge': 'gauge',
};

function iconFor(moduleKey: string, catalogIcon?: string): string {
  if (catalogIcon) return KEBAB_ICON_MAP[catalogIcon] ?? catalogIcon;
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
    customer_portal: 'car',
    booking_engine: 'calendar',
    provider_portal: 'store',
    payments: 'creditCard',
  };
  return map[moduleKey] ?? 'gauge';
}
