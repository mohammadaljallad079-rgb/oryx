'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button, ErrorBanner, Field, Modal } from '@/components/ui';
import type { VehicleDto } from '@oryx/shared';

interface VehicleFormState {
  customerId: string;
  vin: string;
  plateNumber: string;
  make: string;
  model: string;
  modelYear: string;
  color: string;
  mileage: string;
  registrationExpiresAt: string;
  notes: string;
}

const empty = (customerId = ''): VehicleFormState => ({
  customerId,
  vin: '',
  plateNumber: '',
  make: '',
  model: '',
  modelYear: String(new Date().getFullYear()),
  color: '',
  mileage: '0',
  registrationExpiresAt: '',
  notes: '',
});

/**
 * The full vehicle form, used by the vehicles page and by any picker that needs
 * to register a vehicle without leaving the current form. It posts the same
 * payload the standalone form does, so validation and permissions match.
 */
export function VehicleFormModal({
  open,
  customerId,
  vehicleId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Pre-selects the owner; required to create a vehicle. */
  customerId?: string | null;
  /** When set, the form loads and updates that vehicle. */
  vehicleId?: string | null;
  onClose: () => void;
  onSaved: (vehicle: VehicleDto) => void;
}) {
  const { t } = useUi();
  const [form, setForm] = useState<VehicleFormState>(() => empty(customerId ?? ''));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(vehicleId ?? null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!vehicleId) {
      setForm(empty(customerId ?? ''));
      setExistingId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api
      .vehicle(vehicleId)
      .then((v) => {
        if (cancelled) return;
        const rec = v as unknown as VehicleDto;
        setForm({
          customerId: rec.customerId,
          vin: rec.vin,
          plateNumber: rec.plateNumber ?? '',
          make: rec.make,
          model: rec.model,
          modelYear: String(rec.modelYear),
          color: rec.color ?? '',
          mileage: String(rec.mileage),
          registrationExpiresAt: rec.registrationExpiresAt ? rec.registrationExpiresAt.slice(0, 10) : '',
          notes: '',
        });
        setExistingId(rec.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('common.error')))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicleId, customerId]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        customerId: form.customerId,
        vin: form.vin,
        plateNumber: form.plateNumber || undefined,
        make: form.make,
        model: form.model,
        modelYear: Number(form.modelYear) || new Date().getFullYear(),
        color: form.color || undefined,
        mileage: Number(form.mileage) || 0,
        registrationExpiresAt: form.registrationExpiresAt || undefined,
        notes: form.notes || undefined,
      };
      const saved = existingId ? await api.updateVehicle(existingId, payload) : await api.createVehicle(payload);
      onSaved(saved as VehicleDto);
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
      title={existingId ? t('vehicles.edit') : t('vehicles.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || loading || !form.customerId || !form.vin || !form.make || !form.model}
            onClick={submit}
            data-testid="save-vehicle"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <div className="mb-3"><ErrorBanner message={error} /></div> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.automotive.vin')} required>
          <input className="oryx-input" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} data-testid="vehicle-vin" />
        </Field>
        <Field label={t('erp.automotive.plateNumber')}>
          <input className="oryx-input" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
        </Field>
        <Field label={t('erp.automotive.make')} required>
          <input className="oryx-input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} data-testid="vehicle-make" />
        </Field>
        <Field label={t('erp.automotive.model')} required>
          <input className="oryx-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="vehicle-model" />
        </Field>
        <Field label={t('erp.automotive.modelYear')} required>
          <input className="oryx-input" value={form.modelYear} onChange={(e) => setForm({ ...form, modelYear: e.target.value })} />
        </Field>
        <Field label={t('erp.automotive.color')}>
          <input className="oryx-input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </Field>
        <Field label={t('erp.automotive.odometer')}>
          <input className="oryx-input" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
        </Field>
        <Field label={t('vehicles.registrationExpiresAt')}>
          <input type="date" className="oryx-input" value={form.registrationExpiresAt} onChange={(e) => setForm({ ...form, registrationExpiresAt: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
