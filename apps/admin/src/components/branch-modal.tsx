'use client';

import { useState } from 'react';
import type { BranchDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { errorMessageKey } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { Button, Field, Modal } from '@/components/ui';

/**
 * The company branch create form, shared by the Branches screen and the
 * company-scope selector in the top bar.
 *
 * A branch is created through the same `POST /companies/:id/branches` call
 * either way, so an inline "+ Add new" from the scope selector produces the
 * same validated record the standalone screen does — including the plan-limit
 * rejection, which is surfaced in the active language.
 */
export function CreateBranchModal({
  open,
  companyId,
  onClose,
  onCreated,
  onSaved,
  hasModule,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onCreated: (created: BranchDto) => Promise<void> | void;
  /** Called with the new branch so an inline picker can select it. */
  onSaved?: (created: BranchDto) => void;
  hasModule: boolean;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emptyForm = { code: '', nameEn: '', nameAr: '', city: '', countryCode: 'BH', addressLine: '', phone: '', timezone: 'Asia/Bahrain' };
  const [form, setForm] = useState(emptyForm);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createBranch(companyId, {
        code: form.code.toUpperCase(),
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        city: form.city || undefined,
        countryCode: form.countryCode || undefined,
        addressLine: form.addressLine || undefined,
        phone: form.phone || undefined,
        timezone: form.timezone || undefined,
      });
      await onCreated(created);
      onSaved?.(created);
      setForm(emptyForm);
      onClose();
    } catch (err) {
      // Localise the failure so the plan-limit rejection reads naturally in
      // both Arabic and English rather than leaking the raw API message.
      const key = errorMessageKey(err);
      setError(key === 'common.error' ? (err instanceof Error ? err.message : t('common.error')) : t(key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('branches.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.code || !form.nameEn || !form.nameAr}
            onClick={submit}
            data-testid="create-branch-submit"
          >
            {busy ? t('common.loading') : t('common.create')}
          </Button>
        </>
      }
    >
      {!hasModule ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{
            color: 'var(--warning)',
            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
          }}
        >
          {t('error.moduleNotLicensed')}
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="branch-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input
            className="oryx-input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            data-testid="branch-code"
          />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="branch-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="branch-name-ar"
          />
        </Field>
        <Field label={t('common.city')}>
          <input
            className="oryx-input"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            data-testid="branch-city"
          />
        </Field>
        <Field label={t('branches.phone')}>
          <input
            className="oryx-input"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            data-testid="branch-phone"
          />
        </Field>
        <Field label={t('branches.addressLine')}>
          <input
            className="oryx-input"
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            data-testid="branch-address"
          />
        </Field>
        <Field label={t('branches.country')}>
          <input
            className="oryx-input"
            value={form.countryCode}
            maxLength={2}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
            data-testid="branch-country"
          />
        </Field>
        <Field label={t('branches.timezone')}>
          <input
            className="oryx-input"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            data-testid="branch-timezone"
          />
        </Field>
      </div>
    </Modal>
  );
}
