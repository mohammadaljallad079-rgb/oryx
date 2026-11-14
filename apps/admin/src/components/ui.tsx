'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { useUi } from '@/lib/ui-context';

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

/**
 * Ids of the modals currently open, oldest first.
 *
 * A preview opened from inside another modal renders as a second modal, and
 * both listen on `window`. Without this stack a single Escape (or a click on
 * the inner backdrop, which bubbles to the outer one) closes the whole stack
 * instead of the one dialog the user is looking at.
 */
const openModals: symbol[] = [];

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'default',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `full` widens the dialog for a workspace such as the POS terminal,
   * `document` for the invoice/quotation form, which lays out two information
   * panels and a five-column item table to mirror the printed page, and `pos`
   * for a true edge-to-edge terminal that owns the whole viewport.
   */
  size?: 'default' | 'full' | 'document' | 'pos';
}) {
  const { t } = useUi();
  const idRef = useRef<symbol>(Symbol('oryx-modal'));
  const id = idRef.current;
  // The dialog is mounted at the depth it had when it opened, so a modal opened
  // from inside another (a preview from a form, a confirm from a list) always
  // paints above the one that spawned it instead of losing the paint race to a
  // sibling that happens to sit later in the DOM.
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (!open) return;
    openModals.push(id);
    setDepth(openModals.length);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the top-most modal reacts, so a nested preview closes alone.
      if (openModals[openModals.length - 1] !== id) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const at = openModals.indexOf(id);
      if (at !== -1) openModals.splice(at, 1);
    };
  }, [open, onClose, id]);

  if (!open) return null;
  // A portal lifts the dialog out of whatever scroll container or stacking
  // context it was declared in, so the backdrop always covers the whole
  // viewport and no ancestor `overflow`/`transform` can clip it.
  const tree = (
    <div
      className={`oryx-modal-backdrop${size === 'pos' ? ' oryx-modal-backdrop--pos' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ zIndex: 60 + depth * 5 }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`oryx-modal ${
          size === 'full'
            ? 'oryx-modal--full'
            : size === 'document'
              ? 'oryx-modal--document'
              : size === 'pos'
                ? 'oryx-modal--pos'
                : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between border-b border-[var(--border)] px-5 ${
            size === 'pos' ? 'flex-none py-3' : 'py-4'
          }`}
        >
          <h2 className="m-0 text-[16px] font-bold">{title}</h2>
          <button
            type="button"
            className="oryx-btn oryx-btn--ghost oryx-btn--sm"
            onClick={onClose}
            aria-label={t('common.closeLabel')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className={size === 'pos' ? 'flex min-h-0 flex-1 flex-col' : 'px-5 py-4'}>{children}</div>
        {footer ? (
          <div
            className={
              size === 'pos'
                ? 'flex flex-none flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3'
                : 'flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-4'
            }
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
  if (typeof document === 'undefined') return tree;
  return createPortal(tree, document.body);
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

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional secondary text shown under the label (a code, a phone number). */
  hint?: string;
  disabled?: boolean;
  /**
   * The record behind the option, when the caller needs more than the id after
   * a pick (a product's price and rate, a tax rate's basis points). The picker
   * passes it to `onSelectData` untouched.
   */
  data?: Record<string, unknown>;
}

/**
 * The fields an inline-create form collects. A picker over a free-text
 * catalogue (customers, suppliers, products, employees) needs code/name/name,
 * while a picker over a keyed lookup (a tax rate, a category) needs one value.
 * The caller supplies `onCreate` and the shape it wants rendered.
 */
export interface InlineCreateConfig {
  /** Field labels, in the order they are shown. */
  fields: Array<{ key: string; label: string; required?: boolean; placeholder?: string }>;
  /** Resolves the created record so the picker can select it. */
  onSubmit: (values: Record<string, string>) => Promise<{ value: string } | string | void>;
  /** Action label; defaults to the translated "Create". */
  actionLabel?: string;
}

/**
 * A filterable dropdown. Native `<select>` cannot be searched, and the
 * catalogues it is used against (companies, customers, accounts) are paginated,
 * so the options are supplied by the caller and filtered locally by label.
 *
 * When `create` is supplied the popover grows a "create" action that opens an
 * inline form and selects the record it returns, so an operator who needs a
 * customer that does not exist yet never leaves the invoice they are writing.
 */
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  disabled = false,
  testId,
  ariaLabel,
  create,
  onSearch,
  loading = false,
  onSelectData,
}: {
  value: string | null;
  options: SearchableOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Option shown for the "no selection" case; omit to make the field required. */
  emptyLabel?: string;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  create?: InlineCreateConfig;
  /**
   * Delegates filtering to the server. The catalogues are paginated (the API
   * returns the first 20 rows), so a client-side filter over `options` would
   * silently hide every record past the first page; supplying this hands the
   * typed query to the owner, which re-fetches and passes the matches back
   * through `options`.
   */
  onSearch?: (query: string) => void;
  /** Shows a busy state in the popover while a server search is in flight. */
  loading?: boolean;
  /** Receives the picked option's `data`, when the caller attached one. */
  onSelectData?: (data: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    // When the owner handles the query the list it passes back is already the
    // match set, so filtering again would only drop rows it deliberately kept.
    if (onSearch) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ? o.hint.toLowerCase().includes(q) : false),
    );
  }, [options, query, onSearch]);

  const pick = (next: string | null) => {
    onChange(next);
    const chosen = options.find((o) => o.value === next);
    if (chosen?.data) onSelectData?.(chosen.data);
    setOpen(false);
    setQuery('');
    // Drop any server-side filter so the next open shows the full catalogue and
    // the chosen record is present in the options the trigger labels itself from.
    onSearch?.('');
  };

  return (
    <div ref={rootRef} className="relative" data-testid={testId}>
      <button
        type="button"
        className="oryx-input flex w-full items-center justify-between gap-2 text-start"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? 'truncate' : 'oryx-faint truncate'}>
          {selected ? selected.label : placeholder ?? ''}
        </span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div
          className="oryx-popover absolute z-30 mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
          role="listbox"
        >
          <input
            autoFocus
            className="oryx-input mb-2"
            value={query}
            onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
            placeholder={placeholder}
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <div className="max-h-56 overflow-y-auto">
            {emptyLabel !== undefined ? (
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-start text-[12.5px] hover:bg-[var(--surface-2)]"
                onClick={() => pick(null)}
              >
                {emptyLabel}
              </button>
            ) : null}
            {loading ? (
              <p className="oryx-faint m-0 px-3 py-2 text-[12px]">…</p>
            ) : filtered.length === 0 ? (
              <p className="oryx-faint m-0 px-3 py-2 text-[12px]">—</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  disabled={o.disabled}
                  data-value={o.value}
                  className="block w-full rounded-lg px-3 py-2 text-start hover:bg-[var(--surface-2)] disabled:opacity-50"
                  onClick={() => pick(o.value)}
                >
                  <span className="block text-[12.5px] font-semibold">{o.label}</span>
                  {o.hint ? <span className="oryx-faint block text-[11px]">{o.hint}</span> : null}
                </button>
              ))
            )}
          </div>
          {create ? (
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-start text-[12.5px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-2)]"
              onClick={() => { setCreating(true); setOpen(false); }}
              data-testid={testId ? `${testId}-create` : undefined}
            >
              <Icon name="plus" size={14} />
              {create.actionLabel ?? 'Create'}
            </button>
          ) : null}
        </div>
      ) : null}
      {create ? (
        <InlineCreateForm
          open={creating}
          title={placeholder ?? ''}
          fields={create.fields}
          actionLabel={create.actionLabel}
          testId={testId}
          onSubmit={async (values) => {
            const created = await create.onSubmit(values);
            const next = typeof created === 'string' ? created : created?.value;
            if (next) onChange(next);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The inline-create dialog a `SearchableSelect` opens. It is deliberately
 * minimal: it renders one text input per field the caller declares and hands
 * the collected values back, so the picker's owner stays the only place that
 * knows which API call creates the record.
 */
function InlineCreateForm({
  open,
  title,
  fields,
  actionLabel,
  testId,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  fields: InlineCreateConfig['fields'];
  actionLabel?: string;
  testId?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({});
    setError(null);
  }, [open]);

  const missing = fields.some((f) => f.required !== false && !(values[f.key] ?? '').trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || missing} onClick={submit} data-testid={testId ? `${testId}-create-save` : undefined}>
            {busy ? '…' : (actionLabel ?? 'Save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required !== false}>
            <input
              className="oryx-input"
              placeholder={f.placeholder}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              data-testid={testId ? `${testId}-create-${f.key}` : undefined}
            />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
