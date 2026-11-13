'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export interface PickerOption {
  id: string;
  /** Primary line shown in the list and in the closed field. */
  label: string;
  /** Optional second line (code, phone, city). */
  sublabel?: string | null;
  /** Free-text fields the in-list search matches against. */
  keywords?: string | null;
  disabled?: boolean;
}

/** Props handed to the caller's create form so it renders as a modal. */
export interface QuickCreateRenderProps {
  open: boolean;
  onClose: () => void;
  /** The form calls this with the created record; the picker selects it. */
  onCreated: (record: { id: string; label?: string }) => void;
}

/**
 * A searchable dropdown that can create a record without leaving the form.
 *
 * The list is filtered locally as the user types (so the search responds on
 * every keystroke), and the "add new" action opens the caller's *real* create
 * form — the same component the standalone page uses — as a modal above the
 * current form. The form posts to the API, and the created record is selected
 * here immediately.
 *
 * This component owns no data and writes nothing itself: it is the caller that
 * supplies options and wires the create form, so the picker cannot diverge from
 * the module's own validation, permissions or save path.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  testId,
  disabled,
  clearable = true,
  labels,
  renderCreate,
  entityLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  options: PickerOption[];
  placeholder?: string;
  testId?: string;
  disabled?: boolean;
  clearable?: boolean;
  labels: { search: string; addNew: string; noResults: string };
  /** When omitted the "add new" action is hidden (no create permission). */
  renderCreate?: (props: QuickCreateRenderProps) => ReactNode;
  entityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.sublabel ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  const choose = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="oryx-picker" ref={containerRef}>
      <button
        type="button"
        className="oryx-input oryx-picker__control"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? 'oryx-picker__value' : 'oryx-picker__placeholder'}>
          {selected ? selected.label : placeholder ?? ''}
        </span>
        <Icon name="chevronDown" size={15} />
      </button>

      {open ? (
        <div className="oryx-picker__menu" role="listbox" data-testid={testId ? `${testId}-menu` : undefined}>
          <div className="oryx-picker__search">
            <Icon name="search" size={15} />
            <input
              autoFocus
              className="oryx-picker__search-input"
              value={query}
              placeholder={labels.search}
              onChange={(e) => setQuery(e.target.value)}
              data-testid={testId ? `${testId}-search` : undefined}
            />
            {clearable && value ? (
              <button type="button" className="oryx-picker__clear" onClick={() => choose('')} aria-label="Clear">
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </div>
          <div className="oryx-picker__list">
            {filtered.length === 0 ? (
              <p className="oryx-picker__empty">{labels.noResults}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  disabled={o.disabled}
                  className={`oryx-picker__option ${o.id === value ? 'is-selected' : ''}`}
                  onClick={() => choose(o.id)}
                  data-testid={testId ? `${testId}-option-${o.id}` : undefined}
                >
                  <span className="oryx-picker__option-label">{o.label}</span>
                  {o.sublabel ? <span className="oryx-picker__option-sub">{o.sublabel}</span> : null}
                </button>
              ))
            )}
          </div>
          {renderCreate ? (
            <button
              type="button"
              className="oryx-picker__add"
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
              data-testid={testId ? `${testId}-add` : undefined}
            >
              <Icon name="plus" size={15} />
              {labels.addNew}
              {entityLabel ? <span className="oryx-faint">· {entityLabel}</span> : null}
            </button>
          ) : null}
        </div>
      ) : null}

      {renderCreate
        ? renderCreate({
            open: creating,
            onClose: () => setCreating(false),
            onCreated: (record) => {
              setCreating(false);
              onChange(record.id);
            },
          })
        : null}
    </div>
  );
}
