'use client';

import { useEffect, useState } from 'react';
import { type TaxRateDto, type TaxScope } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Button, ErrorBanner, Field, Modal, type SearchableOption } from '@/components/ui';
import { EntityPicker } from '@/components/inline-create';

/**
 * The company tax form, shared by the settings tax list and the tax pickers on
 * sales and purchasing lines.
 *
 * A rate is entered as a whole percentage and stored in basis points, so the
 * boundary conversion happens once, here. The same `POST/PATCH /tax` call runs
 * either way, so an inline "+ Add new" produces the same validated record the
 * settings screen does. Authoring needs `company.settings.update`; the caller
 * only offers the inline create when the principal holds it, and the API
 * re-checks it.
 */
export function TaxModal({
  open,
  companyId,
  tax,
  defaultScope,
  onClose,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  /** When given, the form edits this rate instead of creating a new one. */
  tax?: TaxRateDto | null;
  /** Preselects the side a newly created rate applies to (sales/purchases line). */
  defaultScope?: TaxScope;
  onClose: () => void;
  onSaved: (saved: TaxRateDto) => Promise<void> | void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    ratePercent: '15',
    scope: 'BOTH' as TaxScope,
    applicationLevel: 'LINE' as 'LINE' | 'TOTAL',
    pricesIncludeTax: false,
    isDefault: false,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: tax?.code ?? '',
      nameEn: tax?.nameEn ?? '',
      nameAr: tax?.nameAr ?? '',
      ratePercent: tax ? String(tax.rateBp / 100) : '15',
      scope: tax?.scope ?? defaultScope ?? 'BOTH',
      applicationLevel: tax?.applicationLevel ?? 'LINE',
      pricesIncludeTax: tax?.pricesIncludeTax ?? false,
      isDefault: tax?.isDefault ?? false,
    });
  }, [open, tax, defaultScope]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const rateBp = Math.round((Number(form.ratePercent) || 0) * 100);
    try {
      const body = {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        rateBp,
        scope: form.scope,
        applicationLevel: form.applicationLevel,
        pricesIncludeTax: form.pricesIncludeTax,
        isDefault: form.isDefault,
      };
      const saved = tax
        ? await api.updateTax(tax.id, body)
        : await api.createTax({ ...body, code: form.code });
      await onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const rateInvalid = (() => {
    const value = Number(form.ratePercent);
    return form.ratePercent.trim() === '' || Number.isNaN(value) || value < 0 || value > 100;
  })();

  return (
    <Modal
      open={open}
      title={tax ? t('tax.edit') : t('tax.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr || (!tax && !form.code) || rateInvalid}
            onClick={submit}
            data-testid="save-tax"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input
            className="oryx-input"
            value={form.code}
            disabled={Boolean(tax)}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            data-testid="tax-code"
          />
        </Field>
        <Field label={t('tax.rate')} required hint={t('tax.rateHint')}>
          <input
            className="oryx-input"
            value={form.ratePercent}
            onChange={(e) => setForm({ ...form, ratePercent: e.target.value })}
            data-testid="tax-rate"
          />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="tax-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="tax-name-ar" />
        </Field>
        <Field label={t('tax.scope')}>
          <select
            className="oryx-select"
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value as TaxScope })}
            data-testid="tax-scope"
          >
            <option value="BOTH">{t('tax.scope.BOTH')}</option>
            <option value="SALES">{t('tax.scope.SALES')}</option>
            <option value="PURCHASES">{t('tax.scope.PURCHASES')}</option>
          </select>
        </Field>
        <Field label={t('tax.applicationLevel')} hint={t('tax.applicationLevelHint')}>
          <select
            className="oryx-select"
            value={form.applicationLevel}
            onChange={(e) => setForm({ ...form, applicationLevel: e.target.value as 'LINE' | 'TOTAL' })}
          >
            <option value="LINE">{t('tax.application.LINE')}</option>
            <option value="TOTAL">{t('tax.application.TOTAL')}</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={form.pricesIncludeTax} onChange={(e) => setForm({ ...form, pricesIncludeTax: e.target.checked })} />
          {t('tax.pricesIncludeTax')}
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} data-testid="tax-is-default" />
          {t('tax.setDefault')}
        </label>
      </div>
      <input type="hidden" value={companyId} readOnly />
    </Modal>
  );
}

/**
 * A saved-tax picker with an inline "+ Add new" that opens the same `TaxModal`
 * the settings screen uses.
 *
 * A line stores the rate in basis points, so the option `value` is the rate and
 * the option `label` is the display percentage the line parses back — matching
 * the shape `useTaxOptions` already builds. `scope` preselects the side a newly
 * created rate applies to. The create is only offered to a principal that holds
 * `company.settings.update`, the permission `POST /tax` requires; the API
 * re-checks it regardless.
 */
export function TaxPicker({
  value,
  options,
  onChange,
  onCreated,
  scope,
  placeholder = '%',
  emptyLabel,
  disabled,
  testId,
}: {
  value: string | null;
  options: SearchableOption[];
  onChange: (value: string | null) => void;
  /** Reload the option list after a create so the new rate appears. */
  onCreated?: () => Promise<unknown> | void;
  scope: TaxScope;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const { t } = useUi();
  const { companyId, can } = useAuth();
  const canEdit = can('company.settings.update');

  return (
    <EntityPicker
      value={value}
      options={options}
      onChange={onChange}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      disabled={disabled}
      testId={testId}
      createLabel={t('tax.new')}
      reloadOptions={onCreated}
      renderCreate={
        canEdit && companyId
          ? ({ onClose, onSaved }) => (
              <TaxModal
                open
                companyId={companyId}
                defaultScope={scope}
                onClose={onClose}
                onSaved={(saved) => void onSaved(String(saved.rateBp))}
              />
            )
          : undefined
      }
    />
  );
}
