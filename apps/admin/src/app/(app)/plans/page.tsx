'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useEffect, useState } from 'react';
import type { PlanDto } from '@oryx/shared';
import { CURRENCIES, DEFAULT_CURRENCY, MODULES } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SectionHeader,
  Skeleton,
} from '@/components/ui';

function PlansPageInner() {
  const { t, locale } = useUi();
  const plans = useAsync(() => api.listPlans(), []);
  const [editing, setEditing] = useState<PlanDto | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5" data-testid="plans-page">
      <SectionHeader
        title={t('plans.title')}
        subtitle={t('plans.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void plans.reload()}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-plan">
              <Icon name="plus" size={16} />
              {t('plans.new')}
            </Button>
          </>
        }
      />

      <p
        className="m-0 flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <span className="oryx-gold mt-[2px]">
          <Icon name="info" size={15} />
        </span>
        <span className="oryx-muted">{t('plans.note')}</span>
      </p>

      {plans.error ? <ErrorBanner message={plans.error} onRetry={plans.reload} retryLabel={t('common.retry')} /> : null}

      <div className="grid gap-4 lg:grid-cols-3" data-testid="plans-grid">
        {plans.loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={330} />)
          : (plans.data ?? []).map((p) => (
              <Card key={p.id} className="flex flex-col p-5" data-testid={`plan-card-${p.code}`}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="oryx-panel-title m-0">{locale === 'ar' ? p.nameAr : p.nameEn}</p>
                    <p className="oryx-faint m-0 font-mono text-[11px]">{p.code}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={p.isActive ? 'success' : 'neutral'}>
                      {p.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                    {p.isPublic ? <Badge tone="gold">{t('plans.public')}</Badge> : null}
                  </div>
                </div>

                <p className="oryx-muted m-0 mb-4 min-h-[40px] text-[12.5px]">
                  {locale === 'ar' ? p.descriptionAr : p.descriptionEn}
                </p>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
                  >
                    <p className="oryx-faint m-0 text-[10.5px] uppercase tracking-wide">{t('plans.monthly')}</p>
                    <p className="m-0 text-[19px] font-extrabold tabular-nums">
                      {p.monthlyPrice.toLocaleString()}
                      <span className="oryx-muted ms-1 text-[11.5px] font-semibold">{p.currency}</span>
                    </p>
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}
                  >
                    <p className="oryx-faint m-0 text-[10.5px] uppercase tracking-wide">{t('plans.annual')}</p>
                    <p className="m-0 text-[19px] font-extrabold tabular-nums">
                      {p.annualPrice.toLocaleString()}
                      <span className="oryx-muted ms-1 text-[11.5px] font-semibold">{p.currency}</span>
                    </p>
                  </div>
                </div>

                <dl className="m-0 mb-4 grid grid-cols-2 gap-y-1 text-[12px]">
                  <Limit label={t('plans.maxBranches')} value={p.maxBranches} />
                  <Limit label={t('plans.maxUsers')} value={p.maxUsers} />
                  <Limit label={t('plans.storage')} value={p.storageMb} />
                  <Limit label={t('plans.apiCalls')} value={p.apiRequestsPerMonth} />
                  <Limit label={t('plans.trial')} value={p.trialDays} raw />
                </dl>

                <div className="mb-4">
                  <p className="oryx-label mb-1">
                    {t('plans.includedModules')} ({p.modules.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {p.modules.slice(0, 8).map((m) => (
                      <span key={m.moduleKey} className="oryx-badge oryx-badge--neutral text-[10px]">
                        {locale === 'ar' ? m.nameAr : m.nameEn}
                      </span>
                    ))}
                    {p.modules.length > 8 ? (
                      <span className="oryx-badge oryx-badge--gold text-[10px]">+{p.modules.length - 8}</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                  <Badge tone="neutral">
                    {p.subscriberCount ?? 0} {t('plans.subscribers')}
                  </Badge>
                  <Button size="sm" onClick={() => setEditing(p)} data-testid={`edit-plan-${p.code}`}>
                    {t('common.edit')}
                  </Button>
                </div>
              </Card>
            ))}
      </div>

      {!plans.loading && (plans.data?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
        </Card>
      ) : null}

      <PlanEditor
        open={creating || Boolean(editing)}
        plan={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await plans.reload();
        }}
      />
    </div>
  );
}

function Limit({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  const { t } = useUi();
  return (
    <div className="flex items-center justify-between gap-2 pe-3">
      <dt className="oryx-faint">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums">
        {value === -1 && !raw ? t('plans.unlimited') : value}
      </dd>
    </div>
  );
}

function PlanEditor({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: PlanDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    descriptionEn: '',
    descriptionAr: '',
    monthlyPrice: 0,
    annualPrice: 0,
    currency: DEFAULT_CURRENCY,
    trialDays: 14,
    maxCompanies: 1,
    maxBranches: 1,
    maxUsers: 5,
    storageMb: 1024,
    apiRequestsPerMonth: 10000,
    isPublic: true,
    isActive: true,
    modules: [] as string[],
  });

  // Load the plan (or reset for create) whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (plan) {
      setForm({
        code: plan.code,
        nameEn: plan.nameEn,
        nameAr: plan.nameAr,
        descriptionEn: plan.descriptionEn,
        descriptionAr: plan.descriptionAr,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        currency: plan.currency,
        trialDays: plan.trialDays,
        maxCompanies: plan.maxCompanies,
        maxBranches: plan.maxBranches,
        maxUsers: plan.maxUsers,
        storageMb: plan.storageMb,
        apiRequestsPerMonth: plan.apiRequestsPerMonth,
        isPublic: plan.isPublic,
        isActive: plan.isActive,
        modules: plan.modules.map((m) => m.moduleKey),
      });
    } else {
      setForm({
        code: '',
        nameEn: '',
        nameAr: '',
        descriptionEn: '',
        descriptionAr: '',
        monthlyPrice: 0,
        annualPrice: 0,
        currency: DEFAULT_CURRENCY,
        trialDays: 14,
        maxCompanies: 1,
        maxBranches: 1,
        maxUsers: 5,
        storageMb: 1024,
        apiRequestsPerMonth: 10000,
        isPublic: true,
        isActive: true,
        modules: ['dashboard', 'company_management', 'branch_management', 'users_permissions'],
      });
    }
  }, [open, plan]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        descriptionEn: form.descriptionEn,
        descriptionAr: form.descriptionAr,
        monthlyPrice: Number(form.monthlyPrice),
        annualPrice: Number(form.annualPrice),
        currency: form.currency,
        trialDays: Number(form.trialDays),
        maxCompanies: Number(form.maxCompanies),
        maxBranches: Number(form.maxBranches),
        maxUsers: Number(form.maxUsers),
        storageMb: Number(form.storageMb),
        apiRequestsPerMonth: Number(form.apiRequestsPerMonth),
        isPublic: form.isPublic,
        isActive: form.isActive,
        modules: form.modules,
      };
      if (plan) {
        await api.updatePlan(plan.id, payload);
      } else {
        await api.createPlan({ ...payload, code: form.code });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={plan ? t('plans.editTitle') : t('plans.createTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || form.modules.length === 0 || !form.nameEn || !form.nameAr || (!plan && !form.code)}
            onClick={submit}
            data-testid="save-plan"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="plan-error"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {!plan ? (
          <Field label={t('common.code')} required hint="lowercase, digits, dash">
            <input
              className="oryx-input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
              data-testid="plan-code"
            />
          </Field>
        ) : null}
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="plan-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="plan-name-ar"
          />
        </Field>
        <Field label={`${t('cms.body')} (EN)`}>
          <input
            className="oryx-input"
            value={form.descriptionEn}
            onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
            data-testid="plan-desc-en"
          />
        </Field>
        <Field label={`${t('cms.body')} (AR)`}>
          <input
            className="oryx-input"
            value={form.descriptionAr}
            onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
            data-testid="plan-desc-ar"
          />
        </Field>
        <Field label={`${t('plans.monthly')}`} required>
          <input
            className="oryx-input"
            type="number"
            min={0}
            value={form.monthlyPrice}
            onChange={(e) => setForm({ ...form, monthlyPrice: Number(e.target.value) })}
            data-testid="plan-monthly"
          />
        </Field>
        <Field label={`${t('plans.annual')}`} required>
          <input
            className="oryx-input"
            type="number"
            min={0}
            value={form.annualPrice}
            onChange={(e) => setForm({ ...form, annualPrice: Number(e.target.value) })}
            data-testid="plan-annual"
          />
        </Field>
        <Field label={t('plans.currency')}>
          <select
            className="oryx-input"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('plans.trial')}>
          <input
            className="oryx-input"
            type="number"
            min={0}
            value={form.trialDays}
            onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('plans.maxBranches')} hint="-1 = unlimited">
          <input
            className="oryx-input"
            type="number"
            value={form.maxBranches}
            onChange={(e) => setForm({ ...form, maxBranches: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('plans.maxUsers')} hint="-1 = unlimited">
          <input
            className="oryx-input"
            type="number"
            value={form.maxUsers}
            onChange={(e) => setForm({ ...form, maxUsers: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('plans.storage')}>
          <input
            className="oryx-input"
            type="number"
            value={form.storageMb}
            onChange={(e) => setForm({ ...form, storageMb: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('plans.apiCalls')}>
          <input
            className="oryx-input"
            type="number"
            value={form.apiRequestsPerMonth}
            onChange={(e) => setForm({ ...form, apiRequestsPerMonth: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-[12.5px] font-semibold">
          <input
            type="checkbox"
            className="oryx-checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          {t('common.active')}
        </label>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold">
          <input
            type="checkbox"
            className="oryx-checkbox"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
          />
          {t('plans.public')}
        </label>
      </div>

      <hr className="oryx-divider my-4" />
      <p className="oryx-label mb-2">
        {t('plans.includedModules')} ({form.modules.length}/{MODULES.length})
      </p>
      <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto pe-1">
        {MODULES.map((m) => (
          <label
            key={m.key}
            className="flex items-start gap-2 rounded-lg px-2 py-1.5"
            style={{
              background: form.modules.includes(m.key)
                ? 'color-mix(in srgb, var(--gold) 10%, transparent)'
                : 'transparent',
            }}
          >
            <input
              type="checkbox"
              className="oryx-checkbox mt-1"
              checked={form.modules.includes(m.key)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...form.modules, m.key]
                  : form.modules.filter((k) => k !== m.key);
                setForm({ ...form, modules: next });
              }}
              data-testid={`plan-module-${m.key}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold">{locale === 'ar' ? m.nameAr : m.nameEn}</span>
              <span className="oryx-faint block font-mono text-[10.5px]">
                {m.key} · {m.status}
              </span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.plan.manage', 'platform.subscription.manage']}>
      <PlansPageInner />
    </PermissionGate>
  );
}
