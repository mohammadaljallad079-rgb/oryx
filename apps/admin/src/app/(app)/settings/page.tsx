'use client';

import { useCallback, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { toMinorInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SectionHeader, Skeleton } from '@/components/ui';
import {
  SETTING_NAMESPACES,
  defaultSettingsFor,
  type CompanySettingRevisionDto,
  type SettingNamespace,
} from '@oryx/shared';

type Entitlements = Awaited<ReturnType<typeof api.entitlements>>;

type FieldKind = 'text' | 'number' | 'percent' | 'money' | 'boolean' | 'select' | 'textarea';

interface FieldSpec {
  key: string;
  kind: FieldKind;
  options?: string[];
}

/**
 * Per-namespace field metadata.
 *
 * Only presentation lives here: which control a value gets and how it is shown.
 * The set of keys, their types, bounds and defaults come from
 * `@oryx/shared/settings.ts`, so the form cannot offer a field the API would
 * reject and cannot miss a field the API stores. List-valued fields (branches,
 * exemptions) are preserved untouched from the stored value.
 */
const FIELDS: Record<SettingNamespace, FieldSpec[]> = {
  GENERAL: [
    { key: 'companyNameEn', kind: 'text' },
    { key: 'companyNameAr', kind: 'text' },
    { key: 'tradeName', kind: 'text' },
    { key: 'logoUrl', kind: 'text' },
    { key: 'contactEmail', kind: 'text' },
    { key: 'contactPhone', kind: 'text' },
    { key: 'website', kind: 'text' },
    { key: 'addressLine', kind: 'text' },
    { key: 'city', kind: 'text' },
    { key: 'countryCode', kind: 'text' },
    { key: 'crNumber', kind: 'text' },
    { key: 'taxNumber', kind: 'text' },
    { key: 'currency', kind: 'text' },
    { key: 'timezone', kind: 'text' },
    { key: 'locale', kind: 'select', options: ['ar', 'en'] },
    { key: 'dateFormat', kind: 'select', options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] },
    { key: 'numberFormat', kind: 'select', options: ['1,234.56', '1.234,56', '1 234,56'] },
  ],
  INVOICING: [
    { key: 'numberPrefix', kind: 'text' },
    { key: 'numberPadding', kind: 'number' },
    { key: 'template', kind: 'select', options: ['STANDARD', 'COMPACT', 'DETAILED'] },
    { key: 'headerText', kind: 'textarea' },
    { key: 'footerText', kind: 'textarea' },
    { key: 'showLogo', kind: 'boolean' },
    { key: 'showTaxNumber', kind: 'boolean' },
    { key: 'showSignature', kind: 'boolean' },
    { key: 'showBankDetails', kind: 'boolean' },
    { key: 'bankDetails', kind: 'textarea' },
    { key: 'paperSize', kind: 'select', options: ['A4', 'A5', 'LETTER'] },
    { key: 'pdfIncludeStamp', kind: 'boolean' },
    { key: 'pdfIncludeTerms', kind: 'boolean' },
    { key: 'termsText', kind: 'textarea' },
  ],
  ACCOUNTING: [
    { key: 'fiscalYearStartMonth', kind: 'number' },
    { key: 'defaultReceivableAccountId', kind: 'text' },
    { key: 'defaultPayableAccountId', kind: 'text' },
    { key: 'defaultCashAccountId', kind: 'text' },
    { key: 'defaultSalesAccountId', kind: 'text' },
    { key: 'defaultVatAccountId', kind: 'text' },
    { key: 'roundingMode', kind: 'select', options: ['HALF_UP', 'HALF_EVEN', 'FLOOR'] },
    { key: 'currencyPrecision', kind: 'number' },
    { key: 'allowManualJournals', kind: 'boolean' },
    { key: 'requireBalancedJournals', kind: 'boolean' },
  ],
  TAX: [
    { key: 'vatEnabled', kind: 'boolean' },
    { key: 'vatRateBp', kind: 'percent' },
    { key: 'pricesIncludeTax', kind: 'boolean' },
    { key: 'taxNumber', kind: 'text' },
    { key: 'calculationMethod', kind: 'select', options: ['LINE', 'DOCUMENT'] },
  ],
  HR: [
    { key: 'workdayStart', kind: 'text' },
    { key: 'workdayEnd', kind: 'text' },
    { key: 'annualLeaveDays', kind: 'number' },
    { key: 'attendanceGraceMinutes', kind: 'number' },
    { key: 'payrollDayOfMonth', kind: 'number' },
    { key: 'requireLeaveApproval', kind: 'boolean' },
  ],
  INVENTORY: [
    { key: 'defaultWarehouseId', kind: 'text' },
    { key: 'valuationMethod', kind: 'select', options: ['MOVING_AVERAGE', 'FIFO'] },
    { key: 'lowStockThreshold', kind: 'number' },
    { key: 'negativeStockAllowed', kind: 'boolean' },
    { key: 'purchaseOrderPrefix', kind: 'text' },
    { key: 'reorderPoint', kind: 'number' },
  ],
  SALES: [
    { key: 'defaultPaymentTermsDays', kind: 'number' },
    { key: 'defaultCreditLimitMinor', kind: 'money' },
    { key: 'allowDiscounts', kind: 'boolean' },
    { key: 'maxDiscountPercentBp', kind: 'percent' },
    { key: 'quoteValidityDays', kind: 'number' },
    { key: 'invoiceNumberPrefix', kind: 'text' },
    { key: 'defaultTaxRateBp', kind: 'percent' },
  ],
  MAINTENANCE: [
    { key: 'jobNumberPrefix', kind: 'text' },
    { key: 'defaultLaborRateMinor', kind: 'money' },
    { key: 'partsMarkupPercentBp', kind: 'percent' },
    { key: 'vatEnabled', kind: 'boolean' },
    { key: 'defaultTaxRateBp', kind: 'percent' },
    { key: 'requireEstimateApproval', kind: 'boolean' },
  ],
  DOCUMENTS: [
    { key: 'logoUrl', kind: 'text' },
    { key: 'headerText', kind: 'textarea' },
    { key: 'footerText', kind: 'textarea' },
    { key: 'contactInfo', kind: 'textarea' },
    { key: 'stampUrl', kind: 'text' },
    { key: 'signatureUrl', kind: 'text' },
    { key: 'paperSize', kind: 'select', options: ['A4', 'A5', 'LETTER'] },
    { key: 'showStamp', kind: 'boolean' },
    { key: 'showSignature', kind: 'boolean' },
  ],
};

function toInput(spec: FieldSpec, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (spec.kind === 'boolean') return value ? 'yes' : 'no';
  if (spec.kind === 'percent') return String(Number(value) / 100);
  if (spec.kind === 'money') return (Number(value) / 100).toFixed(2);
  return String(value);
}

function fromInput(spec: FieldSpec, raw: string): unknown {
  if (spec.kind === 'boolean') return raw === 'yes';
  if (spec.kind === 'number') return raw === '' ? 0 : Math.round(Number(raw));
  if (spec.kind === 'percent') return Math.round((Number(raw) || 0) * 100);
  if (spec.kind === 'money') return toMinorInput(raw);
  return raw;
}

export default function SettingsPage() {
  const { t } = useUi();
  const { companyId, can, isPlatform } = useAuth();
  const [namespace, setNamespace] = useState<SettingNamespace>('GENERAL');
  const readOnly = !can('erp.settings.update');

  const all = useAsync(() => api.settings({ companyId: companyId ?? undefined }), [companyId]);
  const entitlements = useAsync(
    () => (companyId ? api.entitlements(companyId) : Promise.resolve(null)),
    [companyId],
  );

  return (
    <div className="flex flex-col gap-5" data-testid="settings-page">
      <SectionHeader title={t('settings.centerTitle')} subtitle={t('settings.centerSubtitle')} />

      {isPlatform && !companyId ? <ErrorBanner message={t('common.selectCompany')} /> : null}
      {all.error ? <ErrorBanner message={all.error} onRetry={all.reload} retryLabel={t('common.retry')} /> : null}

      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        <Card className="h-fit p-2" data-testid="settings-nav">
          <nav className="flex flex-col">
            {SETTING_NAMESPACES.map((ns) => (
              <button
                key={ns}
                type="button"
                className={`oryx-btn oryx-btn--ghost justify-start ${namespace === ns ? 'oryx-btn--primary' : ''}`}
                onClick={() => setNamespace(ns)}
                data-testid={`settings-tab-${ns}`}
              >
                <Icon name="sliders" size={15} />
                {t(`settings.namespace.${ns}`)}
              </button>
            ))}
          </nav>
        </Card>

        <div className="flex flex-col gap-4">
          {all.loading ? (
            <Card className="p-5">
              <Skeleton height={20} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} height={38} />
                ))}
              </div>
            </Card>
          ) : (
            <NamespacePanel
              key={`${namespace}:${companyId ?? 'platform'}`}
              namespace={namespace}
              value={(all.data?.settings[namespace] ?? defaultSettingsFor(namespace)) as unknown as Record<string, unknown>}
              companyId={companyId}
              readOnly={readOnly}
              onSaved={all.reload}
            />
          )}

          <ProfileCard />
          {companyId ? <EntitlementsCard state={entitlements} /> : null}
          <HistoryCard companyId={companyId} />
        </div>
      </div>
    </div>
  );
}

function NamespacePanel({
  namespace,
  value,
  companyId,
  readOnly,
  onSaved,
}: {
  namespace: SettingNamespace;
  value: Record<string, unknown>;
  companyId: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const specs = FIELDS[namespace];
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(specs.map((f) => [f.key, toInput(f, value[f.key])])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = useMemo(
    () => specs.some((f) => draft[f.key] !== toInput(f, value[f.key])),
    [specs, draft, value],
  );

  const payload = useCallback(() => {
    // Start from the stored value so list-valued fields the form does not edit
    // (branches, exemptions) survive a save unchanged.
    const out: Record<string, unknown> = { ...value };
    for (const f of specs) out[f.key] = fromInput(f, draft[f.key] ?? '');
    return out;
  }, [specs, value, draft]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateSettingNamespace(namespace, payload(), { companyId: companyId ?? undefined });
      await onSaved();
      setNotice(t('settings.savedNamespace', { namespace: t(`settings.namespace.${namespace}`) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.resetSettingNamespace(namespace, { companyId: companyId ?? undefined });
      setDraft(Object.fromEntries(specs.map((f) => [f.key, toInput(f, res.value[f.key])])));
      await onSaved();
      setNotice(t('settings.reset', { namespace: t(`settings.namespace.${namespace}`) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5" data-testid={`settings-panel-${namespace}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="oryx-panel-title m-0">{t(`settings.namespace.${namespace}`)}</p>
          <p className="oryx-muted m-0 mt-1 text-[12.5px]">{t(`settings.namespaceHint.${namespace}`)}</p>
        </div>
        {readOnly ? <Badge tone="warning">{t('settings.readOnly')}</Badge> : null}
      </div>

      {error ? <div className="mb-3"><ErrorBanner message={error} /></div> : null}
      {notice ? (
        <p
          className="mb-3 flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}
          data-testid="settings-notice"
        >
          <Icon name="check" size={15} />
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {specs.map((f) => (
          <Field
            key={f.key}
            label={f.key}
            hint={f.kind === 'percent' ? '%' : f.kind === 'money' ? t('settings.moneyHint') : undefined}
          >
            {f.kind === 'boolean' ? (
              <select
                className="oryx-select"
                value={draft[f.key] ?? 'no'}
                disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                data-testid={`setting-${namespace}-${f.key}`}
              >
                <option value="yes">{t('common.yes')}</option>
                <option value="no">{t('common.no')}</option>
              </select>
            ) : f.kind === 'select' ? (
              <select
                className="oryx-select"
                value={draft[f.key] ?? ''}
                disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                data-testid={`setting-${namespace}-${f.key}`}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.kind === 'textarea' ? (
              <textarea
                className="oryx-textarea"
                value={draft[f.key] ?? ''}
                disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                data-testid={`setting-${namespace}-${f.key}`}
              />
            ) : (
              <input
                className="oryx-input"
                inputMode={f.kind === 'number' || f.kind === 'percent' || f.kind === 'money' ? 'decimal' : undefined}
                value={draft[f.key] ?? ''}
                disabled={readOnly}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                data-testid={`setting-${namespace}-${f.key}`}
              />
            )}
          </Field>
        ))}
      </div>

      {!readOnly ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy || !dirty} onClick={save} data-testid={`settings-save-${namespace}`}>
            <Icon name="check" size={15} />
            {busy ? t('common.loading') : t('common.save')}
          </Button>
          <Button disabled={busy} onClick={reset} data-testid={`settings-reset-${namespace}`}>
            {t('settings.resetNamespace')}
          </Button>
          {dirty ? <span className="oryx-faint text-[12px]">{t('settings.unsaved')}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

function ProfileCard() {
  const { t, locale, theme, setLocale, setTheme } = useUi();
  const { user, updatePreferences, refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ fullNameEn: user?.fullNameEn ?? '', fullNameAr: user?.fullNameAr ?? '' });

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await api.updateProfile(form);
      await updatePreferences({ preferredLocale: locale, preferredTheme: theme });
      await refreshSession();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5" data-testid="settings-preferences">
      <p className="oryx-panel-title m-0 mb-4">{t('settings.profile')}</p>
      {saved ? (
        <p
          className="mb-3 flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}
        >
          <Icon name="check" size={15} />
          {t('settings.saved')}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('auth.email')}>
          <input className="oryx-input" value={user?.email ?? ''} readOnly disabled />
        </Field>
        <Field label={`${t('common.name')} (EN)`}>
          <input
            className="oryx-input"
            value={form.fullNameEn}
            onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
            data-testid="settings-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`}>
          <input
            className="oryx-input"
            value={form.fullNameAr}
            onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
            data-testid="settings-name-ar"
          />
        </Field>
        <Field label={t('settings.theme')}>
          <select className="oryx-select" value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
            <option value="dark">{t('theme.dark')}</option>
            <option value="light">{t('theme.light')}</option>
          </select>
        </Field>
        <Field label={t('settings.locale')}>
          <select className="oryx-select" value={locale} onChange={(e) => setLocale(e.target.value as 'ar' | 'en')}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <Button variant="primary" disabled={busy} onClick={save} data-testid="save-profile">
          {busy ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

function EntitlementsCard({
  state,
}: {
  state: { data: Entitlements | null; loading: boolean; error: string | null; reload: () => Promise<void> };
}) {
  const { t } = useUi();
  return (
    <Card className="p-5" data-testid="settings-entitlements">
      <p className="oryx-panel-title m-0 mb-1">{t('subscriptions.licence')}</p>
      <p className="oryx-muted m-0 mb-4 text-[12px]">{t('dash.moduleAdoptionHint')}</p>
      {state.loading ? (
        <Skeleton height={90} />
      ) : state.error ? (
        <ErrorBanner message={state.error} onRetry={state.reload} retryLabel={t('common.retry')} />
      ) : !state.data ? (
        <EmptyState title={t('common.empty')} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={state.data.isActive ? 'success' : 'danger'}>{state.data.status ?? 'NONE'}</Badge>
            <Badge tone="gold">{state.data.planCode ?? t('companies.noPlan')}</Badge>
            <Badge tone="neutral">
              {state.data.usage.branches} / {state.data.limits.maxBranches}
            </Badge>
            <Badge tone="neutral">
              {state.data.usage.users} / {state.data.limits.maxUsers}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1">
            {state.data.licensedModules.map((m) => (
              <span key={m} className="oryx-badge oryx-badge--gold font-mono text-[10.5px]">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function HistoryCard({ companyId }: { companyId: string | null }) {
  const { t } = useUi();
  const history = useAsync(() => api.settingsHistory({ companyId: companyId ?? undefined }), [companyId]);

  return (
    <Card className="p-5" data-testid="settings-history">
      <p className="oryx-panel-title m-0 mb-4">{t('settings.history')}</p>
      {history.loading ? (
        <Skeleton height={28} />
      ) : (history.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('settings.historyEmpty')} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {history.data!.items.map((r: CompanySettingRevisionDto) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-2 text-[12.5px] last:border-0"
            >
              <span className="font-semibold">{t(`settings.namespace.${r.namespace}`)}</span>
              <span className="oryx-faint">{r.changedAt.slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
