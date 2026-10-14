'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import { Card, SectionHeader } from '@/components/ui';

/**
 * Client-side permission gate for a whole screen.
 *
 * This is a usability guard, not a security boundary: the API independently
 * rejects the request. Its job is to avoid rendering controls a principal
 * cannot use (no fake buttons or dead links).
 */
export function PermissionGate({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const { canAny, isPlatform } = useAuth();
  const { t } = useUi();

  const allowed =
    canAny(...anyOf) ||
    // A platform principal reaches platform.* surfaces; map company.* codes.
    canAny(...anyOf.map((p) => p.replace(/^company\./, 'platform.company.')));

  if (allowed) return <>{children}</>;

  return (
    <div className="flex flex-col gap-5" data-testid="permission-denied">
      <SectionHeader title={t('error.forbidden')} />
      <Card className="p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <span
            className="grid h-12 w-12 flex-none place-items-center rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
              color: 'var(--danger)',
            }}
          >
            <Icon name="shield" size={22} />
          </span>
          <div>
            <p className="oryx-panel-title m-0">{t('error.forbidden')}</p>
            <p className="oryx-muted mt-1 mb-3 max-w-[70ch] text-[13px]">
              {isPlatform
                ? t('users.delegationNote')
                : 'This screen belongs to platform governance. Contact your platform administrator if you need access.'}
            </p>
            <Link href="/dashboard" className="oryx-btn oryx-btn--primary">
              <Icon name="gauge" size={16} />
              {t('nav.dashboard')}
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
