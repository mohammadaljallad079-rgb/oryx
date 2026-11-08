'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, ErrorBanner, Field, SectionHeader, Skeleton } from '@/components/ui';
import type { InspectionType } from '@oryx/shared';

type VehicleMode = 'existing' | 'new';

interface CardFields {
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  color: string | null;
  vin: string | null;
}

const SECTIONS: InspectionType[] = ['PAINT', 'CHASSIS', 'COMPREHENSIVE'];

/**
 * Vehicle inspection intake.
 *
 * The vehicle can be an existing record or a new one whose details are read
 * from a photo of the registration card (Arabic + English). The card reader
 * only ever *suggests* values: every field stays editable and the ones the
 * reader could not read are flagged for a human to fill in.
 */
export default function NewInspectionPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const canManage = can('erp.inspection.booking.manage');
  const canManageVehicle = can('erp.vehicle.manage');

  const customers = useAsync(() => api.salesCustomers(), []);

  const [customerId, setCustomerId] = useState('');
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>('new');
  const [existingVehicleId, setExistingVehicleId] = useState('');
  const [vehicle, setVehicle] = useState({ plateNumber: '', make: '', model: '', modelYear: '', color: '', vin: '', mileage: '' });
  const [sections, setSections] = useState<InspectionType[]>(['PAINT']);
  const [scheduledAt, setScheduledAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [saveDraft, setSaveDraft] = useState(false);

  const [reading, setReading] = useState(false);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [rawText, setRawText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ bookingNumber: string } | null>(null);

  const vehicles = useAsync(
    () => (customerId ? api.vehicles({ customerId, page: 1 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 0 })),
    [customerId],
  );

  const selectedCustomer = useMemo(
    () => (customers.data?.items ?? []).find((c) => c.id === customerId) ?? null,
    [customers.data, customerId],
  );

  const applyFields = (fields: CardFields) => {
    setVehicle((v) => ({
      plateNumber: fields.plateNumber ?? v.plateNumber,
      make: fields.make ?? v.make,
      model: fields.model ?? v.model,
      modelYear: fields.modelYear != null ? String(fields.modelYear) : v.modelYear,
      color: fields.color ?? v.color,
      vin: fields.vin ?? v.vin,
      mileage: v.mileage,
    }));
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setOcrError(null);
    setUncertain([]);
    setRawText('');
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setReading(true);
    try {
      const result = await api.readVehicleCard(file);
      applyFields(result.fields);
      setUncertain(result.uncertain);
      setRawText(result.rawText);
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleSection = (section: InspectionType) => {
    setSections((current) => (current.includes(section) ? current.filter((s) => s !== section) : [...current, section]));
  };

  const isUncertain = (key: keyof CardFields) => uncertain.includes(key);

  const canSubmit =
    canManage &&
    !!customerId &&
    sections.length > 0 &&
    (vehicleMode === 'existing' ? !!existingVehicleId : !!vehicle.make && !!vehicle.model && !!vehicle.modelYear) &&
    !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let vehicleId = existingVehicleId;
      if (vehicleMode === 'new') {
        const created = await api.createVehicle({
          customerId,
          vin: vehicle.vin ? vehicle.vin.toUpperCase() : undefined,
          plateNumber: vehicle.plateNumber || undefined,
          make: vehicle.make,
          model: vehicle.model,
          modelYear: Number(vehicle.modelYear),
          color: vehicle.color || undefined,
          mileage: Number(vehicle.mileage) || 0,
        });
        vehicleId = created.id;
      }
      const inspection = await api.createInspection({
        customerId,
        vehicleId,
        inspectionTypes: sections,
        scheduledAt: new Date(scheduledAt).toISOString(),
        odometer: odometer ? Number(odometer) : undefined,
        notes: notes || undefined,
        saveDraft,
      });
      setDone({ bookingNumber: inspection.bookingNumber });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <ErrorBanner message={t('common.forbidden')} />
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-4 p-6" data-testid="inspection-created">
          <Badge tone="success">{t('common.saved')}</Badge>
          <p className="m-0 text-[15px] font-bold">{done.bookingNumber}</p>
          <p className="oryx-faint m-0 text-[12.5px]">{t('erp.automotive.intakeCreatedHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/automotive/inspections" className="oryx-btn oryx-btn--primary oryx-btn--sm">
              {t('erp.automotive.inspectionBookings')}
            </Link>
            <Button size="sm" onClick={() => setDone(null)}>
              {t('erp.automotive.newInspection')}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="new-inspection-page">
      <SectionHeader
        title={t('erp.automotive.newInspection')}
        subtitle={t('erp.automotive.intakeSubtitle')}
        actions={
          <Link href="/automotive/inspections" className="oryx-btn oryx-btn--ghost oryx-btn--sm">
            {t('common.back')}
          </Link>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.sales.customer')}</p>
        </div>
        <div className="p-4">
          {customers.loading ? (
            <Skeleton height={38} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('erp.sales.customer')} required>
                <select
                  className="oryx-select"
                  value={customerId}
                  onChange={(e) => { setCustomerId(e.target.value); setExistingVehicleId(''); }}
                  data-testid="intake-customer"
                >
                  <option value="">—</option>
                  {(customers.data?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.nameEn}</option>
                  ))}
                </select>
              </Field>
              {selectedCustomer ? (
                <div className="flex items-end">
                  <p className="oryx-faint m-0 text-[12px]">
                    {selectedCustomer.nameAr} · {selectedCustomer.phone ?? '—'}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.automotive.vehicle')}</p>
          <div className="flex gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={vehicleMode === 'existing'}
              className={`oryx-btn oryx-btn--sm ${vehicleMode === 'existing' ? 'oryx-btn--primary' : ''}`}
              onClick={() => setVehicleMode('existing')}
              data-testid="intake-mode-existing"
            >
              {t('erp.automotive.intakeExisting')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vehicleMode === 'new'}
              className={`oryx-btn oryx-btn--sm ${vehicleMode === 'new' ? 'oryx-btn--primary' : ''}`}
              onClick={() => setVehicleMode('new')}
              data-testid="intake-mode-new"
            >
              {t('erp.automotive.intakeNew')}
            </button>
          </div>
        </div>

        <div className="p-4">
          {vehicleMode === 'existing' ? (
            vehicles.loading ? <Skeleton height={38} /> : (
              <Field label={t('erp.automotive.vehicle')} required>
                <select
                  className="oryx-select"
                  value={existingVehicleId}
                  onChange={(e) => setExistingVehicleId(e.target.value)}
                  disabled={!customerId}
                  data-testid="intake-existing-vehicle"
                >
                  <option value="">—</option>
                  {(vehicles.data?.items ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber ? `${v.plateNumber} · ` : ''}{v.make} {v.model} ({v.modelYear}){v.vin ? ` · ${v.vin}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {canManageVehicle ? (
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="m-0 text-[13px] font-bold">{t('erp.automotive.intakeScan')}</p>
                      <p className="oryx-faint m-0 mt-1 text-[11.5px]">{t('erp.automotive.intakeScanHint')}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={reading}
                      onClick={() => fileRef.current?.click()}
                      data-testid="intake-scan-card"
                    >
                      <Icon name="car" size={15} />
                      {reading ? t('erp.automotive.intakeReading') : t('erp.automotive.intakeChooseImage')}
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => void onPickImage(e.target.files?.[0])}
                      data-testid="intake-card-file"
                    />
                  </div>
                  {ocrError ? <div className="mt-3"><ErrorBanner message={ocrError} /></div> : null}
                  {imageUrl ? (
                    <div className="mt-3 flex flex-wrap gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="" className="max-h-[220px] rounded-[var(--radius)] border border-[var(--border)] object-contain" />
                      {rawText ? (
                        <details className="min-w-[200px] flex-1">
                          <summary className="oryx-faint cursor-pointer text-[11.5px]">{t('erp.automotive.intakeRaw')}</summary>
                          <pre className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap text-[11px]">{rawText}</pre>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                  {uncertain.length > 0 ? (
                    <p className="oryx-attention mt-3 mb-0 text-[11.5px]" data-testid="intake-uncertain">
                      {t('erp.automotive.intakeUncertain')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('erp.automotive.plate')} hint={isUncertain('plateNumber') ? t('erp.automotive.intakeReview') : undefined}>
                  <input className={`oryx-input ${isUncertain('plateNumber') ? 'oryx-input--attention' : ''}`} value={vehicle.plateNumber} onChange={(e) => setVehicle({ ...vehicle, plateNumber: e.target.value })} data-testid="intake-plate" />
                </Field>
                <Field label={t('erp.automotive.make')} required hint={isUncertain('make') ? t('erp.automotive.intakeReview') : undefined}>
                  <input className={`oryx-input ${isUncertain('make') ? 'oryx-input--attention' : ''}`} value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} data-testid="intake-make" />
                </Field>
                <Field label={t('erp.automotive.model')} required hint={isUncertain('model') ? t('erp.automotive.intakeReview') : undefined}>
                  <input className={`oryx-input ${isUncertain('model') ? 'oryx-input--attention' : ''}`} value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} data-testid="intake-model" />
                </Field>
                <Field label={t('erp.automotive.modelYear')} required hint={isUncertain('modelYear') ? t('erp.automotive.intakeReview') : undefined}>
                  <input className={`oryx-input ${isUncertain('modelYear') ? 'oryx-input--attention' : ''}`} value={vehicle.modelYear} onChange={(e) => setVehicle({ ...vehicle, modelYear: e.target.value })} inputMode="numeric" data-testid="intake-year" />
                </Field>
                <Field label={t('erp.automotive.color')} hint={isUncertain('color') ? t('erp.automotive.intakeReview') : undefined}>
                  <input className={`oryx-input ${isUncertain('color') ? 'oryx-input--attention' : ''}`} value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} data-testid="intake-color" />
                </Field>
                <Field label={t('erp.automotive.mileage')}>
                  <input className="oryx-input" value={vehicle.mileage} onChange={(e) => setVehicle({ ...vehicle, mileage: e.target.value })} inputMode="numeric" data-testid="intake-mileage" />
                </Field>
                <Field label={t('erp.automotive.vin')} hint={isUncertain('vin') ? t('erp.automotive.intakeReview') : t('erp.automotive.vinOptionalHint')}>
                  <input className={`oryx-input ${isUncertain('vin') ? 'oryx-input--attention' : ''}`} value={vehicle.vin} onChange={(e) => setVehicle({ ...vehicle, vin: e.target.value.toUpperCase() })} maxLength={17} data-testid="intake-vin" />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.automotive.inspectionTypes')}</p>
        </div>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-3">
            {SECTIONS.map((section) => (
              <label key={section} className="flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={sections.includes(section)}
                  onChange={() => toggleSection(section)}
                  data-testid={`intake-section-${section}`}
                />
                {t(`erp.automotive.type${section}`)}
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('erp.automotive.scheduledAt')}>
              <input type="datetime-local" className="oryx-input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} data-testid="intake-scheduled" />
            </Field>
            <Field label={t('erp.automotive.odometer')}>
              <input className="oryx-input" value={odometer} onChange={(e) => setOdometer(e.target.value)} inputMode="numeric" data-testid="intake-odometer" />
            </Field>
            <Field label={t('common.notes')}>
              <input className="oryx-input" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="intake-notes" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={saveDraft} onChange={(e) => setSaveDraft(e.target.checked)} data-testid="intake-save-draft" />
            {t('erp.automotive.intakeSaveDraft')}
            <span className="oryx-faint text-[11.5px]">— {t('erp.automotive.intakeDraftHint')}</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-4">
          <Link href="/automotive/inspections" className="oryx-btn oryx-btn--sm">{t('common.cancel')}</Link>
          <Button variant="primary" disabled={!canSubmit} onClick={submit} data-testid="intake-save">
            {busy ? t('common.loading') : saveDraft ? t('erp.automotive.intakeSaveDraft') : t('common.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
