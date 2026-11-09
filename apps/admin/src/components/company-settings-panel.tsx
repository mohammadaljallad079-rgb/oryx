'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CURRENCIES, type CompanyDto, type RoundingMode } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useDebounced } from '@/lib/hooks';
import { Badge, Button, ErrorBanner, Field, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';

/**
 * Company identity and finance defaults.
 *
 * The company is chosen from the principal's own context, not from a free-form
 * id: a company administrator is pinned to its tenant, and a platform principal
 * gets a searchable list of the companies it may act on. Both paths call the
 * same `PATCH /companies/:id`, which re-checks scope server-side, so the
 * selector narrows the choice but never grants access.
 *
 * `functionalCurrency` is deliberately tri-state. An empty selection sends
 * `null` ("follow the primary currency"); the currency itself is a separate
 * field, because a tenant that reports in USD while invoicing in BHD is a real
 * configuration, not a mistake to normalise away.
 */
export function CompanySettingsPanel() {
  const { t, locale } = useUi();
  const { isPlatform, companyId, can } = useAuth();
  const canEdit =
    can('platform.company.update') ||
    can('company.settings.update') ||
    can('company.update');

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [options, setOptions] = useState<CompanyDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    legalNameEn: '',
    industry: '',
    countryCode: '',
    taxNumber: '',
    notes: '',
    currency: '',
    functionalCurrency: '',
    defaultTaxPercent: '',
    roundingMode: 'NONE' as RoundingMode,
  });

  // A platform principal searches the catalogue; a company principal already
  // knows its own company, so it skips the list entirely.
  useEffect(() => {
    if (!isPlatform) {
      setSelectedId(companyId);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.listCompanies({ pageSize: 50, search: debounced || undefined });
        if (!cancelled) setOptions(res.items);
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPlatform, companyId, debounced]);

  // Default the platform selection to the shell's active company so the panel
  // matches the rest of the console instead of starting empty.
  useEffect(() => {
    if (isPlatform && companyId && !selectedId) setSelectedId(companyId);
  }, [isPlatform, companyId, selectedId]);

  const load = useCallback(async () => {
    if (!selectedId) {
      setCompany(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.getCompany(selectedId);
      setCompany(res);
      setForm({
        legalNameEn: res.legalNameEn ?? '',
        industry: res.industry ?? '',
        countryCode: res.countryCode ?? '',
        taxNumber: res.taxNumber ?? '',
        notes: res.notes ?? '',
        currency: res.currency,
        functionalCurrency: res.functionalCurrency ?? '',
        defaultTaxPercent: String((res.defaultTaxRateBp ?? 0) / 100),
        roundingMode: res.roundingMode ?? 'NONE',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [selectedId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const taxBp = useMemo(() => {
    const value = Number(form.defaultTaxPercent);
    if (form.defaultTaxPercent.trim() === '' || Number.isNaN(value)) return null;
    const bp = Math.round(value * 100);
    return bp >= 0 && bp <= 10000 ? bp : null;
  }, [form.defaultTaxPercent]);

  const taxInvalid = taxBp === null;

  async function save() {
    if (!company || taxInvalid) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateCompany(company.id, {
        legalNameEn: form.legalNameEn,
        industry: form.industry,
        countryCode: form.countryCode,
        taxNumber: form.taxNumber,
        notes: form.notes,
        currency: form.currency,
        functionalCurrency: form.functionalCurrency,
        defaultTaxRateBp: taxBp,
        roundingMode: form.roundingMode,
      });
      setCompany(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="company-settings">
      {isPlatform ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="oryx-label">{t('settings.companySearch')}</span>
            <input
              className="oryx-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('settings.companySearch')}
              data-testid="company-settings-search"
            />
          </label>
          <label className="min-w-[240px] flex-1">
            <span className="oryx-label">{t('settings.companySelect')}</span>
            <select
              className="oryx-select"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
              data-testid="company-settings-select"
            >
              <option value="">{t('settings.companySelect')}</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {locale === 'ar' ? c.nameAr : c.nameEn} — {c.code}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="oryx-muted m-0 text-[12px]" data-testid="company-settings-pinned">
          {t('settings.companyPinned')}
        </p>
      )}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}

      {saved ? (
        <p
          className="m-0 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold"
          style={{
            color: 'var(--success)',
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
          }}
          data-testid="company-settings-saved"
        >
          <Icon name="check" size={15} />
          {t('settings.companySaved')}
        </p>
      ) : null}

      {loading ? (
        <Skeleton height={220} />
      ) : !company ? (
        <p className="oryx-muted m-0 text-[12.5px]">{t('settings.companySelect')}</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={`${t('common.name')} (EN)`}>
              <input className="oryx-input" value={locale === 'ar' ? company.nameAr : company.nameEn} readOnly disabled />
            </Field>
            <Field label={t('settings.legalName')}>
              <input
                className="oryx-input"
                value={form.legalNameEn}
                onChange={(e) => setForm({ ...form, legalNameEn: e.target.value })}
                disabled={!canEdit}
                data-testid="company-legal-name"
              />
            </Field>
            <Field label={t('settings.industry')}>
              <input
                className="oryx-input"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                disabled={!canEdit}
                data-testid="company-industry"
              />
            </Field>
            <Field label={t('settings.country')}>
              <input
                className="oryx-input"
                maxLength={2}
                value={form.countryCode}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                disabled={!canEdit}
                data-testid="company-country"
              />
            </Field>
            <Field label={t('settings.taxNumber')}>
              <input
                className="oryx-input"
                value={form.taxNumber}
                onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                disabled={!canEdit}
                data-testid="company-tax-number"
              />
            </Field>
            <Field label={t('settings.notes')}>
              <input
                className="oryx-input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
          </div>

          <hr className="oryx-divider" />

          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t('settings.primaryCurrency')} hint={t('settings.primaryCurrencyHint')}>
              <select
                className="oryx-select"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                disabled={!canEdit}
                data-testid="company-currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {locale === 'ar' ? c.symbolAr : c.symbolEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('settings.functionalCurrency')} hint={t('settings.functionalCurrencyHint')}>
              <select
                className="oryx-select"
                value={form.functionalCurrency}
                onChange={(e) => setForm({ ...form, functionalCurrency: e.target.value })}
                disabled={!canEdit}
                data-testid="company-functional-currency"
              >
                <option value="">{t('settings.followPrimary')}</option>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {locale === 'ar' ? c.symbolAr : c.symbolEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`${t('settings.defaultTax')} (%)`}
              hint={t('settings.defaultTaxHint')}
              error={taxInvalid ? t('settings.taxInvalid') : undefined}
            >
              <input
                className="oryx-input"
                inputMode="decimal"
                value={form.defaultTaxPercent}
                onChange={(e) => setForm({ ...form, defaultTaxPercent: e.target.value })}
                disabled={!canEdit}
                data-testid="company-default-tax"
              />
            </Field>
            <Field label={t('settings.rounding')} hint={t('settings.roundingHint')}>
              <select
                className="oryx-select"
                value={form.roundingMode}
                onChange={(e) => setForm({ ...form, roundingMode: e.target.value as RoundingMode })}
                disabled={!canEdit}
                data-testid="company-rounding-mode"
              >
                <option value="NONE">{t('settings.roundingNone')}</option>
                <option value="NEAREST_WHOLE">{t('settings.roundingWhole')}</option>
                <option value="NEAREST_HALF">{t('settings.roundingHalf')}</option>
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={busy || !canEdit || taxInvalid}
              onClick={() => void save()}
              data-testid="company-settings-save"
            >
              {busy ? t('common.loading') : t('common.save')}
            </Button>
            {form.currency !== (form.functionalCurrency || form.currency) ? (
              <Badge tone="info">
                {form.currency} → {form.functionalCurrency}
              </Badge>
            ) : null}
            {!canEdit ? <span className="oryx-muted text-[12px]">{t('settings.noCompanyPermission')}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
