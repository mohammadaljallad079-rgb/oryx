'use client';

import { useEffect, type ReactNode } from 'react';
import { Icon } from './icons';

export function Card({
  children,
  className = '',
  flat = false,
  ...rest
}: { children: ReactNode; className?: string; flat?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`oryx-card ${flat ? 'oryx-card--flat' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-[22px] font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="oryx-muted m-0 mt-1 max-w-[72ch] text-[13px]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  ...rest
}: {
  tone?: 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`oryx-badge oryx-badge--${tone}`} {...rest}>
      {children}
    </span>
  );
}

export function Button({
  variant = 'default',
  size,
  children,
  ...rest
}: {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = [
    'oryx-btn',
    variant === 'primary' ? 'oryx-btn--primary' : '',
    variant === 'ghost' ? 'oryx-btn--ghost' : '',
    variant === 'danger' ? 'oryx-btn--danger' : '',
    size === 'sm' ? 'oryx-btn--sm' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="oryx-label">
        {label}
        {required ? <span className="oryx-gold"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11.5px] font-semibold" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="oryx-faint mt-1 block text-[11.5px]">{hint}</span>
      ) : null}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="oryx-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="oryx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="m-0 text-[16px] font-bold">{title}</h2>
          <button
            type="button"
            className="oryx-btn oryx-btn--ghost oryx-btn--sm"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <div
        className="grid h-11 w-11 place-items-center rounded-xl border"
        style={{ borderColor: 'var(--border)', color: 'var(--gold)' }}
      >
        <Icon name="info" size={20} />
      </div>
      <p className="m-0 font-semibold">{title}</p>
      {hint ? <p className="oryx-muted m-0 max-w-[46ch] text-[12.5px]">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px]"
      style={{
        borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)',
        background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
        color: 'var(--danger)',
      }}
      role="alert"
    >
      <Icon name="alert" size={17} />
      <span className="font-semibold">{message}</span>
      {onRetry ? (
        <button type="button" className="oryx-btn oryx-btn--sm" onClick={onRetry}>
          {retryLabel ?? 'Retry'}
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="oryx-skeleton" style={{ height, width }} />;
}

export function TableShell({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // The scroll container is the shell itself rather than a bare wrapper: it
    // keeps the horizontal scrollbar inside the card and lets a narrow viewport
    // pan the table instead of clipping its rightmost columns. `role="region"`
    // plus a label keeps the scrollable area reachable by keyboard and
    // announced by a screen reader.
    <div
      className="oryx-table-scroll"
      data-testid="table-scroll"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="oryx-table">{children}</table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  labels: { previous: string; next: string; page: string; of: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-[12.5px]">
      <span className="oryx-muted">
        {labels.page} {page} {labels.of} {pages} — {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {labels.previous}
        </Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {labels.next}
        </Button>
      </div>
    </div>
  );
}

/** Status pill that maps domain status values to a tone + label key. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'ACTIVE' || status === 'PUBLISHED' || status === 'ACCEPTED'
      ? 'success'
      : status === 'TRIAL' || status === 'PENDING' || status === 'DRAFT' || status === 'PROVISIONING' || status === 'INVITED'
        ? 'warning'
        : status === 'SUSPENDED' || status === 'DISABLED' || status === 'PAST_DUE' || status === 'REVOKED'
          ? 'danger'
          : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * The one KPI tile the admin uses.
 *
 * A KPI row previously had three separate markups — a padded `Card`, a raw
 * flex row and an inline grid — with different paddings, icon sizes and label
 * sizes, so the same metric looked different on every screen. This is the only
 * tile now: one density, one label treatment, one value size.
 *
 * The tile is deliberately compact. The label sits above the value and the
 * whole tile stays under a fixed minimum height, so a row of eight reads as one
 * band rather than eight tall panels. `compact` drops the icon for dense grids.
 */
export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'default',
  compact = false,
  ...rest
}: {
  icon?: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'gold' | 'success' | 'danger';
  compact?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`oryx-stat-card oryx-stat-card--${tone}`} {...rest}>
      {icon && (
        <span className="oryx-stat-card__icon" aria-hidden>
          <Icon name={icon} size={compact ? 15 : 16} />
        </span>
      )}
      <span className="oryx-stat-card__body">
        <span className="oryx-stat-card__label">{label}</span>
        <span className="oryx-stat-card__value">{value}</span>
        {sub ? <span className="oryx-stat-card__sub">{sub}</span> : null}
      </span>
    </div>
  );
}

/**
 * The KPI row.
 *
 * Columns are driven by a minimum tile width, not a fixed count, so a row of
 * four on a wide screen becomes two on a tablet and one on a phone without a
 * breakpoint per screen.
 */
export function StatGrid({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`oryx-stat-grid ${className}`} {...rest}>
      {children}
    </div>
  );
}
