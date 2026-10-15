'use client';

import Link from 'next/link';
import { getModule } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/icons';
import { Badge, Card, SectionHeader } from '@/components/ui';

/**
 * Route for an ERP module whose workflow is not implemented in Execution 01.
 *
 * The route exists and is permission-protected, but it explicitly states that
 * nothing is built and shows no fabricated data — per the execution rules.
 */
export function PlannedModulePage({ moduleKey }: { moduleKey: string }) {
  const { t, locale } = useUi();
  const { hasModule } = useAuth();
  const definition = getModule(moduleKey);

  if (!definition) {
    return <SectionHeader title={t('common.error')} />;
  }

  const licensed = hasModule(moduleKey);

  return (
    <div className="flex flex-col gap-5" data-testid={`planned-${moduleKey}`}>
      <SectionHeader
        title={locale === 'ar' ? definition.nameAr : definition.nameEn}
        subtitle={locale === 'ar' ? definition.descriptionAr : definition.descriptionEn}
        actions={
          <div className="flex gap-2">
            <Badge tone="warning">{t('modules.planned')}</Badge>
            <Badge tone={licensed ? 'success' : 'neutral'}>
              {licensed ? t('modules.licensed') : t('modules.notLicensed')}
            </Badge>
          </div>
        }
      />

      <Card className="p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <span
            className="grid h-12 w-12 flex-none place-items-center rounded-xl"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', color: 'var(--gold)' }}
          >
            <Icon name="info" size={22} />
          </span>
          <div>
            <p className="oryx-panel-title m-0">{t('planned.title')}</p>
            <p className="oryx-muted mt-1 mb-3 max-w-[78ch] text-[13px]" data-testid="planned-notice">
              {t('planned.body')}
            </p>
            <dl className="m-0 grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="oryx-faint">{t('planned.phase')}:</dt>
                <dd className="m-0 font-semibold">{definition.deliveryPhase}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="oryx-faint">{t('modules.group')}:</dt>
                <dd className="m-0 font-semibold">{definition.group}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="oryx-faint">Read permission:</dt>
                <dd className="m-0 font-mono text-[11.5px]">{definition.readPermission}</dd>
              </div>
              {definition.writePermission ? (
                <div className="flex gap-2">
                  <dt className="oryx-faint">Write permission:</dt>
                  <dd className="m-0 font-mono text-[11.5px]">{definition.writePermission}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <p className="oryx-panel-title m-0 mb-2">{t('dash.modules')}</p>
        <p className="oryx-muted m-0 mb-4 text-[12.5px]">
          {locale === 'ar'
            ? 'الوحدات المنجزة فعلياً في التنفيذ الأول:'
            : 'Modules genuinely implemented in Execution 01:'}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/dashboard', label: t('nav.dashboard') },
            { href: '/companies', label: t('nav.companies') },
            { href: '/branches', label: t('nav.branches') },
            { href: '/users', label: t('nav.users') },
            { href: '/roles', label: t('nav.roles') },
            { href: '/subscriptions', label: t('nav.subscriptions') },
            { href: '/settings', label: t('nav.settings') },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="oryx-btn oryx-btn--sm">
              {l.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
