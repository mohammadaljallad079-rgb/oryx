'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { DEFAULT_CURRENCY } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';

export function Card({
  children,
  className,
  title,
  subtitle,
  actions,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={clsx('oryx-card', className)}>
      {(title || actions) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            {title && <h2 className="oryx-card-title">{title}</h2>}
            {subtitle && <p className="oryx-muted" style={{ margin: 0 }}>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'default',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'oryx-btn',
        variant === 'primary' && 'oryx-btn-primary',
        variant === 'ghost' && 'oryx-btn-ghost',
        variant === 'danger' && 'oryx-btn-danger',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="oryx-field">
      <span className="oryx-label">{label}</span>
      {children}
      {hint && (
        <span className="oryx-muted" style={{ display: 'block', marginTop: 4 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'oryx-badge-success',
  COMPLETED: 'oryx-badge-success',
  SUCCEEDED: 'oryx-badge-success',
  ACTIVE: 'oryx-badge-success',
  PAID: 'oryx-badge-success',
  PUBLISHED: 'oryx-badge-success',
  PENDING: 'oryx-badge-warning',
  HELD: 'oryx-badge-warning',
  NEW: 'oryx-badge-info',
  ASSIGNED: 'oryx-badge-info',
  IN_PROGRESS: 'oryx-badge-info',
  DRAFT: 'oryx-badge-info',
  CANCELLED: 'oryx-badge-danger',
  FAILED: 'oryx-badge-danger',
  REJECTED: 'oryx-badge-danger',
  REFUNDED: 'oryx-badge-danger',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('oryx-badge', STATUS_TONE[status])}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return <div className={clsx('oryx-alert', tone === 'success' && 'oryx-alert-success')}>{children}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="oryx-empty">{message}</div>;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useUi();
  return <div className="oryx-empty">{label ?? t('common.loading')}</div>;
}

/** Render a monetary minor-unit amount in the currency's own scale. */
export function Money({ minor, currency = DEFAULT_CURRENCY, scale = 3 }: { minor: number; currency?: string; scale?: number }) {
  const value = minor / 10 ** scale;
  const formatted = value.toLocaleString('en-BH', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  return (
    <span dir="ltr">
      {formatted} {currency}
    </span>
  );
}

export function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="oryx-stars" aria-label={`${rating} / 5`}>
      {'★'.repeat(rounded)}
      {'☆'.repeat(Math.max(0, 5 - rounded))}
    </span>
  );
}

export function formatDate(value: string, locale: 'ar' | 'en'): string {
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDay(value: string, locale: 'ar' | 'en'): string {
  return new Date(value).toLocaleDateString(locale === 'ar' ? 'ar-BH' : 'en-GB', {
    dateStyle: 'medium',
  });
}
