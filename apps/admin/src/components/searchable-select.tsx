'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';

export interface SearchableOption {
  value: string;
  label: string;
  /** Secondary text (e.g. a code) shown faintly next to the label. */
  hint?: string;
}

/**
 * A select with a search box and an optional "create" row.
 *
 * The document forms pick a customer, a product or a warehouse from lists that
 * grow past a plain `<select>`'s usefulness, so this control filters as the user
 * types and — where the caller is allowed to — offers to create a record from
 * the current query. It is a controlled component: the parent owns the value and
 * performs the create, so the same permissions that guard the rest of the form
 * guard this shortcut.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  searchPlaceholder,
  testId,
  disabled = false,
  allowCreate = false,
  createLabel,
  onCreate,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  /** Text shown when nothing is selected (e.g. an em dash). */
  emptyLabel?: string;
  searchPlaceholder?: string;
  testId?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  /** Template for the create row; `{q}` is replaced with the query. */
  createLabel?: string;
  onCreate?: (query: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  const trimmed = query.trim();
  const canCreate =
    allowCreate &&
    onCreate !== undefined &&
    trimmed.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  const choose = (next: string) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef} dir="inherit">
      <button
        type="button"
        className="oryx-select flex items-center justify-between gap-2 text-start"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={testId}
      >
        <span className={`truncate ${selected ? '' : 'oryx-faint'}`}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint ? <span className="oryx-faint"> — {selected.hint}</span> : null}
            </>
          ) : (
            emptyLabel ?? placeholder ?? '—'
          )}
        </span>
        <Icon name="chevronDown" size={14} />
      </button>

      {open ? (
        <div
          className="absolute z-30 mt-1 w-full rounded-[10px] border p-1 shadow-[var(--shadow-card)]"
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
        >
          <input
            ref={inputRef}
            className="oryx-input mb-1"
            value={query}
            placeholder={searchPlaceholder ?? placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[0]) choose(filtered[0].value);
                else if (canCreate) void handleCreate();
              }
            }}
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <div className="max-h-56 overflow-auto" role="listbox">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className="flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 text-start text-[12.5px] hover:bg-[var(--surface-hover)]"
                onClick={() => choose(o.value)}
                data-testid={testId ? `${testId}-option-${o.value}` : undefined}
              >
                <span className="truncate">{o.label}</span>
                {o.hint ? <span className="oryx-faint shrink-0 text-[11px]">{o.hint}</span> : null}
              </button>
            ))}
            {filtered.length === 0 && !canCreate ? (
              <p className="oryx-faint m-0 px-2 py-2 text-[12px]">—</p>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-start text-[12.5px] font-semibold hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--gold-deep)' }}
                onClick={() => void handleCreate()}
                data-testid={testId ? `${testId}-create` : undefined}
              >
                <Icon name="plus" size={14} />
                {(createLabel ?? 'Create "{q}"').replace('{q}', trimmed)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  async function handleCreate() {
    if (!onCreate) return;
    await onCreate(trimmed);
    setQuery('');
    setOpen(false);
  }
}
