'use client';

import { useCallback, useEffect, useState } from 'react';
import { type TaxRateDto, type TaxScope } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Badge, Button, ErrorBanner, Field, Modal, Skeleton, TableShell } from '@/components/ui';
import { Icon } from '@/components/icons';

/**
 * The tenant's tax list.
 *
 * Authoring needs `company.settings.update`; the panel is only rendered to a
 * principal that holds it (the settings page gates it), and every write is
 * re-checked server-side. A rate is entered as a whole percentage and stored in
 * basis points, so the boundary conversion happens once, here.
 */
export function TaxRatesPanel() {
  const { t, locale } = useUi();
  const { companyId, can } = useAuth();
  const canEdit = can('company.settings.update');

  const [items, setItems] = useState<TaxRateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaxRateDto | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.taxes({ companyId, includeInactive: 'true' });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (tax: TaxRateDto) => {
    try {
      await api.setTaxActive(tax.id, !tax.isActive);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const remove = async (tax: TaxRateDto) => {
    if (!window.confirm(t('tax.confirmDelete'))) return;
    try {
      await api.deleteTax(tax.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="tax-rates-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="oryx-muted m-0 text-[12px]">{t('tax.hint')}</p>
        {canEdit ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            data-testid="new-tax"
          >
            <Icon name="plus" size={15} />
            {t('tax.new')}
          </Button>
        ) : null}
      </div>

      {error ? <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} /> : null}

      {loading ? (
        <Skeleton height={90} />
      ) : items.length === 0 ? (
        <p className="oryx-faint m-0 text-[12.5px]">{t('tax.empty')}</p>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('tax.rate')}</th>
              <th>{t('tax.scope')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tax) => (
              <tr key={tax.id} data-testid={`tax-row-${tax.code}`}>
                <td className="font-mono text-[12px]">{tax.code}</td>
                <td className="text-[12.5px]">
                  {locale === 'ar' ? tax.nameAr : tax.nameEn}
                  {tax.isDefault ? (
                    <Badge tone="gold">{t('tax.default')}</Badge>
                  ) : null}
                </td>
                <td className="tabular-nums text-[12.5px] font-semibold">{tax.rateBp / 100}%</td>
                <td className="text-[12px]">{t(`tax.scope.${tax.scope}` as const)}</td>
                <td>
                  <Badge tone={tax.isActive ? 'success' : 'neutral'}>
                    {tax.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    {canEdit ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t('common.edit')} ${tax.code}`}
                          onClick={() => {
                            setEditing(tax);
                            setOpen(true);
                          }}
                          data-testid={`edit-tax-${tax.code}`}
                        >
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${tax.isActive ? t('common.deactivate') : t('common.activate')} ${tax.code}`}
                          onClick={() => void toggle(tax)}
                          data-testid={`toggle-tax-${tax.code}`}
                        >
                          <Icon name={tax.isActive ? 'close' : 'check'} size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${t('common.delete')} ${tax.code}`}
                          onClick={() => void remove(tax)}
                          data-testid={`delete-tax-${tax.code}`}
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {companyId ? (
        <TaxModal
          open={open}
          companyId={companyId}
          tax={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function TaxModal({
  open,
  companyId,
  tax,
  onClose,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  tax: TaxRateDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
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
      scope: tax?.scope ?? 'BOTH',
      applicationLevel: tax?.applicationLevel ?? 'LINE',
      pricesIncludeTax: tax?.pricesIncludeTax ?? false,
      isDefault: tax?.isDefault ?? false,
    });
  }, [open, tax]);

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
      if (tax) {
        await api.updateTax(tax.id, body);
      } else {
        await api.createTax({ ...body, code: form.code });
      }
      await onSaved();
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
