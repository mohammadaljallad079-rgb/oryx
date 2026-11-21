'use client';

import { useState, type ReactNode } from 'react';
import { useUi } from '@/lib/ui-context';
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
 * The create dialog for a two-name catalogue (code + English name + Arabic
 * name) such as a lead source or department. Extracted so the same form backs
 * both the compact `InlineCatalogButton` and an `EntityPicker`'s inline create.
 */
export function CatalogModal({
  open,
  label,
  onCreate,
  onClose,
  onSaved,
}: {
  open: boolean;
  label: string;
  onCreate: (code: string, nameEn: string, nameAr: string) => Promise<unknown>;
  onClose: () => void;
  /** Report the created id so a picker can select the new record. */
  onSaved?: (createdId: string) => void | Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = (await onCreate(form.code, form.nameEn, form.nameAr)) as
        | { id?: string }
        | undefined;
      setForm({ code: '', nameEn: '', nameAr: '' });
      await onSaved?.(created?.id ?? '');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`${t('common.create')} — ${label}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
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
  );
}

