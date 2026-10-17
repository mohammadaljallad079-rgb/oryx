'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tileImageUrl, type DashboardResponse } from '@oryx/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { BrandLogo } from '@/components/brand-logo';
import { ErrorBanner, Skeleton } from '@/components/ui';

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
        <div
          className="oryx-hero__media"
          style={{ backgroundImage: 'url(/tiles/banner-automotive.svg)' }}
        />
        <div className="oryx-hero__scrim" />
        <div className="oryx-hero__content">
          <BrandLogo height={34} className="oryx-hero__logo" />
          <div className="max-w-[56ch]">
            <p className="oryx-hero__eyebrow m-0">{scopeLabel ?? ''}</p>
            <h1 className="m-0 mt-2 text-[27px] font-extrabold leading-tight">{t('dash.heroTitle')}</h1>
            <p className="m-0 mt-2 max-w-[52ch] text-[13.5px] text-white/80">{t('dash.heroBody')}</p>
          </div>
        </div>
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
    customer_portal: 'car',
    booking_engine: 'calendar',
    provider_portal: 'store',
    payments: 'creditCard',
  };
  return map[moduleKey] ?? 'gauge';
}
