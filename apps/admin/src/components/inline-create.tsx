'use client';

import { useState, type ReactNode } from 'react';
import { useUi } from '@/lib/ui-context';
import { Icon } from '@/components/icons';
import {
  Button,
  ErrorBanner,
  Field,
  Modal,
  SearchableSelect,
  type SearchableOption,
} from '@/components/ui';

export type EntityOption = SearchableOption;

/** Arguments handed to a create form rendered inside an inline-create modal. */
export interface InlineCreateFormArgs {
  /** Close the dialog without selecting anything. */
  onClose: () => void;
  /**
   * Report a successful save. The picker reloads its options and, when an id is
   * given, selects the new record so the operator never has to pick it again.
   */
  onSaved: (createdId?: string) => void | Promise<void>;
}

/**
 * A searchable dropdown with an inline "+ Add new".
 *
 * The dropdown itself is `SearchableSelect`; the "+ Add new" entry opens
 * `renderCreate`, which must render the *same* full create form the standalone
 * screen uses, saving through the same API and the same validation. On success
 * the option list is reloaded and the new record is selected in place, so the
 * user never leaves the form they were filling in.
 */
export function EntityPicker({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  disabled,
  testId,
  createLabel,
  reloadOptions,
  renderCreate,
}: {
  value: string | null;
  options: EntityOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  testId?: string;
  createLabel?: string;
  /** Reload the option list after a create so the new record appears. */
  reloadOptions?: () => Promise<unknown> | void;
  /** Renders the full create form. Receives close/saved callbacks. */
  renderCreate?: (args: InlineCreateFormArgs) => ReactNode;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <SearchableSelect
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        disabled={disabled}
        testId={testId}
        createLabel={createLabel}
        onCreateNew={renderCreate ? () => setCreating(true) : undefined}
      />
      {creating && renderCreate
        ? renderCreate({
            onClose: () => setCreating(false),
            onSaved: async (createdId) => {
              await reloadOptions?.();
              if (createdId) onChange(createdId);
              setCreating(false);
            },
          })
        : null}
    </>
  );
}

/**
 * A compact "+" that opens a small create dialog for a two-name catalogue
 * (code + English name + Arabic name) such as a lead source, department or
 * product category. It performs a real create through `onCreate` and hands the
 * new id back so the caller can select it.
 */
export function InlineCatalogButton({
  label,
  onCreate,
  testId,
}: {
  label: string;
  onCreate: (code: string, nameEn: string, nameAr: string) => Promise<unknown>;
  testId?: string;
}) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(form.code, form.nameEn, form.nameAr);
      setForm({ code: '', nameEn: '', nameAr: '' });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`${t('common.create')} ${label}`}
        data-testid={testId ?? 'inline-create'}
      >
        <Icon name="plus" size={15} />
      </Button>
      <Modal
        open={open}
        title={`${t('common.create')} — ${label}`}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || !form.code || !form.nameEn || !form.nameAr}
              onClick={submit}
              data-testid="inline-create-save"
            >
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-3">
          <Field label={t('common.code')} required>
            <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="inline-create-code" />
          </Field>
          <Field label={`${t('common.name')} (EN)`} required>
            <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="inline-create-name-en" />
          </Field>
          <Field label={`${t('common.name')} (AR)`} required>
            <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="inline-create-name-ar" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
