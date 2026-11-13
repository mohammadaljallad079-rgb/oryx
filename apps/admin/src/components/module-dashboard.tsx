'use client';

import Link from 'next/link';
import type { ModuleSummaryDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { BrandLogo } from '@/components/brand-logo';
import { Card, ErrorBanner, Skeleton, StatCard, StatGrid } from '@/components/ui';

/**
 * The shared module dashboard.
 *
 * Every figure comes from `GET /dashboard/modules/:key`, which aggregates the
 * module's own tables inside the caller's company scope. The banner carries the
 * ORYX lockup, the bilingual module name and description, the quick actions the
 * principal may actually perform, the KPI row, and the module's own audit feed.
 */
export function ModuleDashboard({
  moduleKey,
  testId,
}: {
  moduleKey: string;
  /** Legacy test id retained for the modules that had a dashboard before Execution 20. */
  testId?: string;
}) {
  const { t, locale } = useUi();
  const { companyId, branchId, can } = useAuth();
  const rootTestId = testId ?? `module-dashboard-${moduleKey}`;
  const summary = useAsync(
    () => api.moduleSummary(moduleKey, { companyId, branchId }),
    [moduleKey, companyId, branchId],
  );

  if (summary.loading) {
    return (
      <div className="flex flex-col gap-4" data-testid={rootTestId}>
        <Skeleton height={168} />
        <Skeleton height={88} />
        <Skeleton height={140} />
      </div>
    );
  }

  if (summary.error || !summary.data) {
    return (
      <ErrorBanner
        message={summary.error ?? t('common.error')}
        onRetry={summary.reload}
        retryLabel={t('common.retry')}
      />
    );
  }

  const d: ModuleSummaryDto = summary.data;
  const name = locale === 'ar' ? d.nameAr : d.nameEn;
  const description = locale === 'ar' ? d.descriptionAr : d.descriptionEn;
  const shortcuts = d.shortcuts.filter((s) => can(s.permission));
  const stats = d.stats;

  return (
    <div className="flex flex-col gap-4" data-testid={rootTestId}>
      {/* ------------------------------------------------------- banner */}
      <section className="oryx-module-hero" data-testid={`module-hero-${moduleKey}`}>
        <span className="oryx-module-hero__art" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/tiles/${d.tileImage}.svg`} alt="" />
        </span>
        <div className="oryx-module-hero__content">
          <span className="oryx-module-hero__lockup">
            <BrandLogo height={48} className="oryx-module-hero__logo" />
          </span>
          <div className="oryx-module-hero__identity">
            <p className="oryx-module-hero__eyebrow m-0">{d.scope.companyNameEn}</p>
            <h2 className="oryx-module-hero__title m-0" data-testid={`module-hero-title-${moduleKey}`}>
              {name}
            </h2>
            <p className="oryx-module-hero__body m-0">{description}</p>
          </div>
        </div>
      </section>

      {d.isDemoData ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[12.5px]"
          style={{
            borderColor: 'color-mix(in srgb, var(--warning) 38%, transparent)',
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          }}
        >
          <Icon name="info" size={16} />
          <strong>{t('dash.demoNotice')}</strong>
          <span className="oryx-muted">{t('dash.demoNoticeBody')}</span>
        </div>
      ) : null}

      {/* --------------------------------------------------- shortcuts */}
      {shortcuts.length > 0 ? (
        <section className="flex flex-col gap-2" data-testid={`module-shortcuts-${moduleKey}`}>
          <p className="oryx-panel-title m-0">{t('module.summary.shortcuts')}</p>
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Link
                key={`${s.route}-${s.labelEn}`}
                href={s.route}
                className="oryx-btn oryx-btn--sm oryx-btn--ghost oryx-shortcut"
              >
                <Icon name={s.icon} size={15} />
                {locale === 'ar' ? s.labelAr : s.labelEn}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------- stats */}
      {stats.length > 0 ? (
        <section className="flex flex-col gap-2" data-testid={`module-stats-${moduleKey}`}>
          <p className="oryx-panel-title m-0">{t('module.summary.statistics')}</p>
          <StatGrid>
            {stats.map((s) => (
              <StatCard
                key={s.key}
                icon={s.icon}
                tone={s.tone}
                label={locale === 'ar' ? s.labelAr : s.labelEn}
                value={
                  s.format === 'money'
                    ? money(s.value, s.currency ?? d.scope.currency)
                    : s.format === 'percent'
                      ? `${s.value}%`
                      : String(s.value)
                }
                data-testid={`module-stat-${moduleKey}-${s.key}`}
              />
            ))}
          </StatGrid>
        </section>
      ) : null}

      {/* ---------------------------------------------------- activity */}
      <Card data-testid={`module-activity-${moduleKey}`}>
        <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('module.summary.activity')}</p>
          <Icon name="activity" size={16} />
        </div>
        {d.activity.length === 0 ? (
          <p className="oryx-muted m-0 p-4 text-[12.5px]">{t('module.summary.noActivity')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {d.activity.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0"
                data-testid={`module-activity-row-${a.id}`}
              >
                <span className="flex items-center gap-2 text-[12.5px]">
                  <Icon name="activity" size={14} />
                  <span className="font-mono text-[11.5px]">{a.action}</span>
                  <span className="oryx-faint">{a.targetType}</span>
                </span>
                <span className="oryx-faint flex items-center gap-3 text-[11.5px]">
                  <span>{a.actorEmail ?? '—'}</span>
                  <span className="tabular-nums">{a.createdAt.slice(0, 16).replace('T', ' ')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
