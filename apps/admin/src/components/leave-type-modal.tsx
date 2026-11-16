'use client';

import { useState } from 'react';
import type { LeaveTypeDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button, ErrorBanner, Field, Modal } from '@/components/ui';

/**
 * Create an HR leave type. The same form the HR policy screen would use, so a
 * leave type added inline from the leave-request form is a real, configurable
 * record rather than a front-end-only label.
 */
export function LeaveTypeModal({
  open,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: LeaveTypeDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    annualEntitlementDays: '0',
    isPaid: true,
    requiresApproval: true,
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createLeaveType({
        code: form.code,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        annualEntitlementDays: Number(form.annualEntitlementDays) || 0,
        isPaid: form.isPaid,
        requiresApproval: form.requiresApproval,
      });
      await onCreated();
      onSaved?.(saved);
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
      title={t('erp.hr.newLeaveType')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.code || !form.nameEn || !form.nameAr} onClick={submit} data-testid="save-leave-type">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="leave-type-code" />
        </Field>
        <Field label={t('erp.hr.annualEntitlement')}>
          <input className="oryx-input" value={form.annualEntitlementDays} onChange={(e) => setForm({ ...form, annualEntitlementDays: e.target.value })} data-testid="leave-type-entitlement" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="leave-type-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="leave-type-name-ar" />
        </Field>
        <Field label={t('erp.hr.paid')}>
          <select className="oryx-select" value={form.isPaid ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isPaid: e.target.value === 'yes' })} data-testid="leave-type-paid">
            <option value="yes">{t('common.yes')}</option>
            <option value="no">{t('common.no')}</option>
          </select>
        </Field>
        <Field label={t('erp.hr.requiresApproval')}>
          <select className="oryx-select" value={form.requiresApproval ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, requiresApproval: e.target.value === 'yes' })} data-testid="leave-type-approval">
            <option value="yes">{t('common.yes')}</option>
            <option value="no">{t('common.no')}</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
