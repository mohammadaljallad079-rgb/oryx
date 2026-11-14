'use client';

import Link from 'next/link';
import { tileImageUrl, type ModuleDashboardResponse } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui';
import { MiniBarChart } from '@/components/charts';

/**
 * The banner and tiles that head every module page.
 *
 * It renders the uniform `ModuleDashboardResponse` the API computes from the
 * module's own tables, so each module shows its own statistics, shortcuts and
 * activity — the component is shared, the numbers are not.
 */
export function ModuleBanner({
  data,
  loading,
  moduleKey,
}: {
  data: ModuleDashboardResponse | null;
  loading?: boolean;
  moduleKey: string;
}) {
  const { t, locale } = useUi();

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4" data-testid={`module-banner-${moduleKey}`}>
        <Skeleton height={150} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={86} />
          ))}
        </div>
      </div>
    );
  }

  const name = locale === 'ar' ? data.nameAr : data.nameEn;
  const description = locale === 'ar' ? data.descriptionAr : data.descriptionEn;

  return (
    <div className="flex flex-col gap-4" data-testid={`module-banner-${moduleKey}`}>
      <section className="oryx-hero oryx-hero--module">
        <div className="oryx-hero__media" style={{ backgroundImage: `url(${tileImageUrl(data.tileImage)})` }} />
        <div className="oryx-hero__scrim" />
        <div className="relative flex w-full flex-wrap items-end justify-between gap-5 p-6">
          <div className="max-w-[56ch]">
            <div className="flex items-center gap-2">
              <span className="oryx-monogram" aria-hidden="true">O</span>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: 'var(--gold-soft)' }}>
                ORYX · {data.nameEn}
              </p>
            </div>
            <h1 className="m-0 mt-2 text-[26px] font-extrabold leading-tight">{name}</h1>
            <p className="m-0 mt-2 max-w-[54ch] text-[13px] text-white/80">{description}</p>
          </div>
          {data.shortcuts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="module-shortcuts">
              {data.shortcuts.map((s) => (
                <Link key={s.key} href={s.route} className="oryx-btn oryx-btn--primary oryx-btn--sm">
                  <Icon name={s.icon} size={15} />
                  {locale === 'ar' ? s.labelAr : s.labelEn}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {data.kpis.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="module-kpis">
          {data.kpis.map((k) => (
            <Card key={k.key} className="flex items-center gap-3 p-4">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', color: 'var(--gold)' }}
              >
                <Icon name={k.icon} size={18} />
              </span>
              <div className="min-w-0">
                <p className="oryx-faint m-0 truncate text-[11.5px] font-semibold uppercase tracking-wide">
                  {locale === 'ar' ? k.labelAr : k.labelEn}
                </p>
                <p className="m-0 truncate text-[19px] font-extrabold tabular-nums">{k.value}</p>
                {k.hint ? <p className="oryx-faint m-0 truncate text-[11px]">{k.hint}</p> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="oryx-panel-title m-0 mb-3">{t('erp.module.statistics')}</p>
          {data.stats.length === 0 ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.stats.map((s) => (
                <div key={s.key} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="oryx-muted m-0 text-[11.5px] font-semibold">{locale === 'ar' ? s.labelAr : s.labelEn}</p>
                  <p className="m-0 mt-1 text-[17px] font-extrabold tabular-nums">
                    {s.format === 'money'
                      ? `${s.value.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')} ${s.currency ?? 'SAR'}`
                      : s.value.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="oryx-panel-title m-0 mb-3">{t('erp.module.activity')}</p>
          {data.recentActivity.length === 0 ? (
            <p className="oryx-muted m-0 text-[12.5px]">{t('erp.module.noActivity')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="module-activity">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 border-b border-[var(--border-soft)] pb-2 last:border-0">
                  <Badge tone={a.tone === 'neutral' ? 'neutral' : a.tone}>{a.subtitle ?? '•'}</Badge>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[12.5px] font-semibold">{a.title}</p>
                    <p className="oryx-faint m-0 text-[11px]">{a.at.slice(0, 16).replace('T', ' ')}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.series.length > 0 ? (
        <Card className="p-4">
          <p className="oryx-panel-title m-0 mb-3">{locale === 'ar' ? data.seriesTitleAr : data.seriesTitleEn}</p>
          <MiniBarChart data={data.series} />
        </Card>
      ) : null}
    </div>
  );
}
