'use client';

import { PermissionGate } from '@/components/permission-gate';
import type { AppVersionDto, FeatureFlagDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Badge, Card, EmptyState, SectionHeader, Skeleton, TableShell } from '@/components/ui';

function ApplicationCmsPageInner() {
  const { t, locale } = useUi();
  const flags = useAsync(() => api.featureFlags(), []);
  const versions = useAsync(() => api.appVersions(), []);
  const categories = useAsync(() => api.serviceCategories(), []);
  const templates = useAsync(() => api.notificationTemplates(), []);

  return (
    <div className="flex flex-col gap-5" data-testid="application-page">
      <SectionHeader title={t('app.title')} subtitle={t('app.subtitle')} />

      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[12.5px]"
        style={{
          borderColor: 'color-mix(in srgb, var(--warning) 38%, transparent)',
          background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
        }}
      >
        <span className="oryx-muted">{t('app.notImplemented')}</span>
      </div>

      <Card data-testid="feature-flags">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <p className="oryx-panel-title m-0">{t('app.flags')}</p>
          <Badge tone="neutral">{flags.data?.length ?? 0}</Badge>
        </div>
        {flags.loading ? (
          <div className="p-4">
            <Skeleton height={90} />
          </div>
        ) : (flags.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('app.audience')}</th>
                <th>{t('app.rollout')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {flags.data!.map((f: FeatureFlagDto) => (
                <tr key={f.id}>
                  <td className="font-mono text-[11.5px]">{f.key}</td>
                  <td className="font-semibold">{locale === 'ar' ? f.nameAr : f.nameEn}</td>
                  <td>{f.audience}</td>
                  <td className="tabular-nums">{f.rolloutPercentage}%</td>
                  <td>
                    <Badge tone={f.enabled ? 'success' : 'neutral'}>
                      {f.enabled ? t('app.enabled') : t('app.disabled')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card data-testid="app-versions">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <p className="oryx-panel-title m-0">{t('app.versions')}</p>
          <Badge tone="neutral">{versions.data?.length ?? 0}</Badge>
        </div>
        {versions.loading ? (
          <div className="p-4">
            <Skeleton height={80} />
          </div>
        ) : (versions.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('app.platform')}</th>
                <th>{t('app.version')}</th>
                <th>{t('app.build')}</th>
                <th>{t('app.minSupported')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {versions.data!.map((v: AppVersionDto) => (
                <tr key={v.id}>
                  <td>
                    <Badge tone="info">{v.platform}</Badge>
                  </td>
                  <td className="font-mono text-[12px]">{v.version}</td>
                  <td className="font-mono text-[12px]">{v.buildNumber}</td>
                  <td className="font-mono text-[12px]">{v.minSupportedVersion}</td>
                  <td>
                    <Badge tone={v.isActive ? 'success' : 'neutral'}>
                      {v.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="service-categories">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="oryx-panel-title m-0">
              {locale === 'ar' ? 'تصنيفات الخدمات' : 'Service categories'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {(categories.data ?? []).map((c, i) => (
              <span key={String(c.key ?? i)} className="oryx-badge oryx-badge--neutral">
                {String(locale === 'ar' ? c.nameAr : c.nameEn)}
                <span className="oryx-faint ms-1 text-[10px]">{String(c.domain)}</span>
              </span>
            ))}
            {(categories.data?.length ?? 0) === 0 ? <EmptyState title={t('common.empty')} /> : null}
          </div>
        </Card>

        <Card data-testid="notification-templates">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="oryx-panel-title m-0">
              {locale === 'ar' ? 'قوالب الإشعارات' : 'Notification templates'}
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4">
            {(templates.data ?? []).map((tp, i) => (
              <div key={String(tp.id ?? i)} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="font-mono">{String(tp.key)}</span>
                <div className="flex gap-1">
                  <Badge tone="neutral">{String(tp.locale).toUpperCase()}</Badge>
                  <Badge tone="info">{String(tp.channel)}</Badge>
                </div>
              </div>
            ))}
            {(templates.data?.length ?? 0) === 0 ? <EmptyState title={t('common.empty')} /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.cms.manage', 'platform.api.manage']}>
      <ApplicationCmsPageInner />
    </PermissionGate>
  );
}
