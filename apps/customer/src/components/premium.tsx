'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useUi } from '@/lib/ui-context';
import { assetUrl } from '@/lib/api';
import { Icon, type IconName } from '@/components/icons';

/**
 * Shared premium page furniture for the customer site.
 *
 * Every portal page opens with the same header rhythm and renders the same four
 * states — loading, empty, error and success — so the platform reads as one
 * product rather than a set of independently built screens.
 */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  art,
  backHref,
  backLabel,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  art?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="oryx-page-head">
      {art && (
        <span
          className="oryx-page-head__art"
          style={{ backgroundImage: `url(${assetUrl(art)})` }}
          aria-hidden
        />
      )}
      <div className="oryx-page-head__body">
        {backHref && (
          <Link href={backHref} className="oryx-page-head__back">
            <Icon name="arrow" size={14} />
            {backLabel}
          </Link>
        )}
        {eyebrow && <p className="oryx-eyebrow">{eyebrow}</p>}
        <h1 className="oryx-page-head__title">{title}</h1>
        {subtitle && <p className="oryx-page-head__subtitle">{subtitle}</p>}
        {actions && <div className="oryx-page-head__actions">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * The single state panel used for empty, error and success outcomes.
 *
 * A bare sentence in a dashed box was the old treatment; a medallion, a heading
 * and an optional action is what makes a dead end feel designed.
 */
export function StatePanel({
  tone = 'empty',
  icon,
  title,
  message,
  action,
  compact,
}: {
  tone?: 'empty' | 'error' | 'success' | 'info';
  icon?: IconName;
  title?: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const fallback: Record<string, IconName> = {
    empty: 'file',
    error: 'alert',
    success: 'check',
    info: 'bell',
  };
  return (
    <div className={clsx('oryx-state', `oryx-state--${tone}`, compact && 'oryx-state--compact')}>
      <span className="oryx-state__icon" aria-hidden>
        <Icon name={icon ?? fallback[tone]} size={22} />
      </span>
      {title && <p className="oryx-state__title">{title}</p>}
      {message && <p className="oryx-state__message">{message}</p>}
      {action && <div className="oryx-state__action">{action}</div>}
    </div>
  );
}

/** Skeleton placeholder that matches the shape of the content being fetched. */
export function LoadingPanel({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useUi();
  return (
    <div className="oryx-loading" role="status" aria-live="polite">
      <span className="oryx-sr-only">{label ?? t('common.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="oryx-skeleton" style={{ width: `${100 - index * 12}%` }} />
      ))}
    </div>
  );
}

/** Horizontal scroll container so wide tables never break the page layout. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="oryx-table-wrap">{children}</div>;
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('oryx-toolbar', className)}>{children}</div>;
}

/**
 * Centred shell for the unauthenticated screens.
 *
 * Sign-in, registration and password recovery share one visual frame so the
 * entry point to the platform reads as deliberately designed rather than as
 * four unrelated forms.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="oryx-auth">
      <div className="oryx-auth__glow" aria-hidden />
      <section className="oryx-auth__card">
        <span className="oryx-auth__mark" aria-hidden>
          ORYX
        </span>
        <h1 className="oryx-auth__title">{title}</h1>
        {subtitle && <p className="oryx-auth__subtitle">{subtitle}</p>}
        {children}
        {aside && <div className="oryx-auth__aside">{aside}</div>}
      </section>
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  href,
  linkLabel,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className="oryx-card oryx-kpi">
      <span className="oryx-kpi__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </span>
      <span className="oryx-muted">{label}</span>
      <p className="oryx-kpi__value">{value}</p>
      {href && (
        <Link href={href} className="oryx-link">
          {linkLabel}
          <Icon name="arrow" size={14} />
        </Link>
      )}
    </section>
  );
}
