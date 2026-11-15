'use client';

import { useState } from 'react';
import type { PipelineDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button, ErrorBanner, Field, Modal } from '@/components/ui';

/**
 * Create a CRM pipeline. The API seeds a conventional stage set (New →
 * Qualified → Proposal → Won / Lost) on creation, so a pipeline made from the
 * opportunity form is immediately usable and can be refined on the CRM screen.
 */
export function PipelineModal({
  open,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
  onSaved?: (saved: PipelineDto) => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.createPipeline({ code: form.code, nameEn: form.nameEn, nameAr: form.nameAr });
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
      title={t('erp.crm.newPipeline')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.code || !form.nameEn || !form.nameAr} onClick={submit} data-testid="save-pipeline">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="pipeline-code" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="pipeline-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="pipeline-name-ar" />
        </Field>
      </div>
    </Modal>
  );
}
