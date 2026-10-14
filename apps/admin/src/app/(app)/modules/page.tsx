'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useState } from 'react';
import { MODULES } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, ErrorBanner, SectionHeader, Skeleton } from '@/components/ui';

function ModulesPageInner() {
  const { t, locale } = useUi();
  const { hasModule, isPlatform, companyId } = useAuth();
  const modules = useAsync(() => api.listModules(), [companyId]);
  const [group, setGroup] = useState('');

  const groups = [...new Set(MODULES.map((m) => m.group))];
  const filtered = (modules.data?.items ?? []).filter((m) => !group || m.group === group);

  return (
    <div className="flex flex-col gap-5" data-testid="modules-page">
      <SectionHeader
        title={t('modules.title')}
        subtitle={t('modules.subtitle')}
        actions={
          <Button size="sm" onClick={() => void modules.reload()}>
            <Icon name="search" size={15} />
            {t('common.refresh')}
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={group === '' ? 'primary' : 'default'} onClick={() => setGroup('')}>
            {t('common.all')}
          </Button>
          {groups.map((g) => (
            <Button key={g} size="sm" variant={group === g ? 'primary' : 'default'} onClick={() => setGroup(g)}>
              {g}
            </Button>
          ))}
        </div>
      </Card>

      {modules.error ? (
        <ErrorBanner message={modules.error} onRetry={modules.reload} retryLabel={t('common.retry')} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="modules-grid">
        {modules.loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={160} />)
          : filtered.map((m) => {
              const licensed = isPlatform && !companyId ? true : m.licensed;
              return (
                <Card key={m.id} className="p-5" data-testid={`module-card-${m.key}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span
                      className="grid h-10 w-10 place-items-center rounded-xl"
                      style={{
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--gold)',
                      }}
                    >
                      <Icon name="package" size={18} />
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={m.status === 'AVAILABLE' ? 'success' : 'warning'}>
                        {m.status === 'AVAILABLE' ? t('modules.available') : t('modules.planned')}
                      </Badge>
                      <Badge tone={licensed ? 'gold' : 'neutral'}>
                        {licensed ? t('modules.licensed') : t('modules.notLicensed')}
                      </Badge>
                    </div>
                  </div>

                  <p className="oryx-panel-title m-0">{locale === 'ar' ? m.nameAr : m.nameEn}</p>
                  <p className="oryx-muted m-0 mb-3 text-[12px]">
                    {locale === 'ar' ? m.descriptionAr : m.descriptionEn}
                  </p>

                  <dl className="m-0 grid gap-1 text-[11.5px]">
                    <div className="flex justify-between gap-2">
                      <dt className="oryx-faint">{t('modules.group')}</dt>
                      <dd className="m-0 font-semibold">{m.group}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="oryx-faint">{t('modules.phase')}</dt>
                      <dd className="m-0 font-semibold">{m.deliveryPhase}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="oryx-faint">read</dt>
                      <dd className="m-0 font-mono">{m.readPermission}</dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.module.manage']}>
      <ModulesPageInner />
    </PermissionGate>
  );
}
