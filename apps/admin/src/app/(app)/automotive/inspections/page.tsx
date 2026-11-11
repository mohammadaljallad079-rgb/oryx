'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync, useDebounced } from '@/lib/hooks';
import { money, toMinorInput } from '@/lib/erp-format';
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
  StatCard,
  StatGrid,
  StatusBadge,
  TableShell,
} from '@/components/ui';
import type { InspectionBookingDto, InspectionServiceDto, VehicleDto, VehicleDocumentDto, VehicleDocumentOcrResultDto, CustomerDto } from '@oryx/shared';
import { basisPointsOfMinor, INSPECTION_SECTION_SPECS, VEHICLE_DOCUMENT_CATEGORIES, type InspectionSectionKey } from '@oryx/shared';
import { useRouter } from 'next/navigation';
import { inspectionFieldLabelParts, INSPECTION_COVER_ROWS, INSPECTION_VEHICLE_INFO } from '@/lib/inspection-fields';

type Tab = 'jobs' | 'vehicles' | 'bookings' | 'services';

export default function InspectionsPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('jobs');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'jobs', label: t('inspection.jobs') },
    { key: 'vehicles', label: t('erp.automotive.vehicles') },
    { key: 'bookings', label: t('erp.automotive.inspectionBookings') },
    { key: 'services', label: t('erp.automotive.inspectionServices') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="inspections-page">
      <SectionHeader
        title={t('nav.automotive_inspections')}
        subtitle={t('erp.automotive.inspectionSubtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`inspections-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'jobs' ? <JobsTab canWrite={can('erp.inspection.write')} /> : null}
      {tab === 'vehicles' ? <VehiclesTab canManage={can('erp.vehicle.manage')} /> : null}
      {tab === 'bookings' ? (
        <BookingsTab
          canBook={can('erp.inspection.booking.manage')}
          canApprove={can('erp.inspection.report.approve')}
          canInvoice={can('erp.inspection.invoice')}
        />
      ) : null}
      {tab === 'services' ? <ServicesTab canManage={can('erp.inspection.service.manage')} /> : null}
    </div>
  );
}

/**
 * The structured inspection jobs (Execution Phase 2).
 *
 * This is the entry point to the interactive inspection: a job is created here
 * by choosing the customer, the vehicle and the inspection types, then opened in
 * the workspace where the sections are filled in.
 */
function JobsTab({ canWrite }: { canWrite: boolean }) {
  const { t, locale } = useUi();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounced = useDebounced(search);
  const list = useAsync(() => api.inspectionSessions({ search: debounced || undefined }), [debounced]);

  const remove = async (id: string) => {
    if (!window.confirm(t('inspection.deleteConfirm'))) return;
    setBusyId(id);
    try {
      await api.deleteInspectionSession(id);
      await list.reload();
    } catch (e) {
      window.alert(e instanceof ApiError && e.code === 'resource.conflict' ? t('inspection.deleteBlocked') : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="inspection-jobs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          className="oryx-input max-w-xs"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="inspection-job-search"
        />
        {canWrite ? (
          <Button variant="primary" onClick={() => setOpen(true)} data-testid="new-inspection-job">
            <Icon name="plus" size={14} />
            {t('inspection.newJob')}
          </Button>
        ) : null}
      </div>

      {list.loading ? <Skeleton height={180} /> : null}
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} retryLabel={t('common.retry')} /> : null}

      {list.data ? (
        list.data.items.length === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('inspection.noJobs')} />
        ) : (
          <TableShell label={t('inspection.jobs')}>
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('common.code')}</th>
                  <th>{t('inspection.customer')}</th>
                  <th>{t('inspection.selectVehicle')}</th>
                  <th>{t('inspection.selectTypes')}</th>
                  <th>{t('common.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((j) => (
                  <tr key={j.id} data-testid={`job-row-${j.id}`}>
                    <td className="font-semibold">{j.jobNumber}</td>
                    <td>{j.customerName}</td>
                    <td>
                      {j.make} {j.model} · {j.modelYear}
                      {j.plateNumber ? <span className="oryx-faint"> · {j.plateNumber}</span> : null}
                    </td>
                    <td className="oryx-faint text-[12px]">
                      {j.selectedAreas
                        .map((a) => {
                          const spec = INSPECTION_SECTION_SPECS.find((x) => x.key === a);
                          return spec ? (locale === 'ar' ? spec.labelAr : spec.labelEn) : a;
                        })
                        .join(' · ')}
                    </td>
                    <td>
                      <StatusBadge status={j.status} label={t(`inspection.status.${j.status}`)} />
                    </td>
                    <td className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => router.push(`/automotive/inspections/${j.id}`)} data-testid={`open-job-${j.id}`}>
                          {t('inspection.open')}
                        </Button>
                        {canWrite && j.status !== 'APPROVED' ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busyId === j.id}
                            onClick={() => void remove(j.id)}
                            data-testid={`delete-job-${j.id}`}
                          >
                            <Icon name="trash" size={14} />
                            {t('inspection.delete')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )
      ) : null}

      {open ? <NewJobModal onClose={() => setOpen(false)} onCreated={list.reload} /> : null}
    </div>
  );
}

/** The editable identification fields, mirroring the report's cover one for one. */
type JobIdentity = {
  customerName: string;
  contactNumber: string;
  plateNumber: string;
  make: string;
  model: string;
  modelYear: string;
  odometer: string;
  color: string;
  vin: string;
};

const EMPTY_IDENTITY: JobIdentity = {
  customerName: '',
  contactNumber: '',
  plateNumber: '',
  make: '',
  model: '',
  modelYear: '',
  odometer: '',
  color: '',
  vin: '',
};

/**
 * Create an inspection.
 *
 * The input screen mirrors the report's cover: it carries the same eleven
 * identification fields the issued document prints, under the same bilingual
 * labels, so what the operator enters is exactly what the report shows. The
 * vehicle list is filtered to the chosen customer's vehicles, because a vehicle
 * belongs to a customer and inspecting one customer's car under another's name
 * is a data-integrity error the server would reject anyway. The identification
 * fields are prefilled from the customer and the vehicle so the operator
 * confirms them rather than retyping them, and can correct any value before the
 * report is issued.
 */
function NewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [areas, setAreas] = useState<InspectionSectionKey[]>([]);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [identity, setIdentity] = useState<JobIdentity>(EMPTY_IDENTITY);
  const customers = useAsync(() => api.salesCustomers(), []);

  // The vehicle options are stored together with the customer they were loaded
  // for, and only used while that customer is still selected. Storing a bare
  // list would leave the previous customer's vehicles selectable for one render
  // after the customer changes — long enough to pick another customer's car and
  // have the server reject the job.
  const [vehicleSource, setVehicleSource] = useState<{ customerId: string; items: VehicleDto[] } | null>(
    null,
  );
  const loadVehicles = useCallback(
    async (forCustomer: string) => {
      try {
        const res = await api.vehicles({ customerId: forCustomer });
        setVehicleSource({ customerId: forCustomer, items: res.items ?? [] });
      } catch {
        setVehicleSource({ customerId: forCustomer, items: [] });
      }
    },
    [],
  );
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    api
      .vehicles({ customerId })
      .then((res) => {
        if (active) setVehicleSource({ customerId, items: res.items ?? [] });
      })
      .catch(() => {
        if (active) setVehicleSource({ customerId, items: [] });
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  const vehiclesLoading = Boolean(customerId) && vehicleSource?.customerId !== customerId;
  const vehicleOptions = vehicleSource?.customerId === customerId ? vehicleSource.items : [];
  const selectedCustomer = (customers.data?.items ?? []).find((c: CustomerDto) => c.id === customerId) ?? null;

  // Prefill the cover fields from the customer and the chosen vehicle, so the
  // report prints the same identification the picker showed without retyping.
  // A field the operator has already edited is never overwritten: the prefill
  // only supplies values the record carries.
  useEffect(() => {
    const v = vehicleOptions.find((x) => x.id === vehicleId);
    setIdentity((prev) => ({
      customerName: selectedCustomer?.nameEn || selectedCustomer?.nameAr || selectedCustomer?.code || prev.customerName,
      contactNumber: selectedCustomer?.phone ?? prev.contactNumber,
      plateNumber: v ? v.plateNumber ?? '' : prev.plateNumber,
      make: v?.make ?? prev.make,
      model: v?.model ?? prev.model,
      modelYear: v ? String(v.modelYear) : prev.modelYear,
      odometer: v ? String(v.mileage) : prev.odometer,
      color: v ? v.color ?? '' : prev.color,
      vin: v?.vin ?? prev.vin,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, vehicleSource, customerId]);

  const setField = (key: keyof JobIdentity, value: string) =>
    setIdentity((prev) => ({ ...prev, [key]: value }));

  const toggleArea = (key: InspectionSectionKey) =>
    setAreas((prev) => (prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]));

  const submit = async () => {
    if (!customerId || !vehicleId || areas.length === 0) {
      setError(t('inspection.selectTypesHint'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createInspectionSession({
        customerId,
        vehicleId,
        selectedAreas: areas,
        ...(identity.customerName.trim() ? { customerName: identity.customerName.trim() } : {}),
        ...(identity.contactNumber.trim() ? { contactNumber: identity.contactNumber.trim() } : {}),
        ...(identity.plateNumber.trim() ? { plateNumber: identity.plateNumber.trim() } : {}),
        ...(identity.make.trim() ? { make: identity.make.trim() } : {}),
        ...(identity.model.trim() ? { model: identity.model.trim() } : {}),
        ...(identity.modelYear.trim() ? { modelYear: Number(identity.modelYear) } : {}),
        ...(identity.odometer.trim() ? { odometer: Number(identity.odometer) } : {}),
        ...(identity.color.trim() ? { color: identity.color.trim() } : {}),
        ...(identity.vin.trim() ? { vin: identity.vin.trim() } : {}),
      });
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('inspection.newJobTitle')}
      onClose={onClose}
      size="document"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="create-inspection-job">
            {busy ? t('common.loading') : t('inspection.createJob')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="flex flex-col gap-3">
        <Field label={t('inspection.selectCustomer')} required>
          <select
            className="oryx-select"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setVehicleId('');
            }}
            data-testid="job-customer"
          >
            <option value="">{t('common.select')}</option>
            {(customers.data?.items ?? []).map((c: CustomerDto) => (
              <option key={c.id} value={c.id}>
                {c.nameEn || c.nameAr || c.code}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="oryx-label">{t('inspection.selectVehicle')}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!customerId}
              onClick={() => setAddVehicleOpen(true)}
              data-testid="job-add-vehicle"
            >
              <Icon name="plus" size={14} />
              {t('erp.automotive.newVehicle')}
            </Button>
          </div>
          <VehiclePicker
            vehicles={vehicleOptions}
            value={vehicleId}
            disabled={!customerId || vehiclesLoading}
            onSelect={setVehicleId}
            testId="job-vehicle"
          />
        </div>

        {/* The identification block, mirroring the report's cover table: the
            same navy title band, the same four-column cell rhythm and the same
            eleven fields the printed document carries, with VIN closing the
            table across two columns. Date & Time and Job No. are assigned by the
            system at creation, so they are shown as read-only mirror values the
            way the document renders them. */}
        <section className="oryx-doc-form__cover" data-testid="job-vehicle-identity">
          <div className="oryx-doc-form__cover-band">
            <span>
              {INSPECTION_VEHICLE_INFO.ar}
              <span className="ltr">{INSPECTION_VEHICLE_INFO.en}</span>
            </span>
            <span className="oryx-doc-form__cover-tag">{t('inspection.autoAssigned')}</span>
          </div>
          <div className="oryx-doc-form__cover-grid">
            {INSPECTION_COVER_ROWS.flat().map(({ key, span }) => {
              const label = inspectionFieldLabelParts(key);
              const wide = span === 2 ? ' oryx-doc-form__cover-cell--wide' : '';
              return (
                <div key={key} className={`oryx-doc-form__cover-cell${wide}`}>
                  <span className="oryx-doc-form__cover-label">
                    <span className="ltr">{label.en}</span>
                    <span className="var">{label.ar}</span>
                  </span>
                  {key === 'inspectedAt' ? (
                    <input className="oryx-input" value={new Date().toLocaleString()} readOnly disabled data-testid="job-inspected-at" />
                  ) : key === 'jobNumber' ? (
                    <input className="oryx-input" value="—" readOnly disabled data-testid="job-number" />
                  ) : (
                    <input
                      className={`oryx-input${key === 'vin' ? ' font-mono' : ''}`}
                      type={key === 'modelYear' || key === 'odometer' ? 'number' : undefined}
                      min={key === 'modelYear' || key === 'odometer' ? 0 : undefined}
                      value={identity[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      data-testid={`job-field-${key}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div>
          <span className="oryx-label">{t('inspection.selectTypes')}</span>
          <div className="grid gap-2 sm:grid-cols-2" data-testid="job-types">
            {INSPECTION_SECTION_SPECS.map((spec) => (
              <label
                key={spec.key}
                className={`oryx-job-type${areas.includes(spec.key) ? ' is-selected' : ''}`}
                data-testid={`job-type-${spec.key}`}
              >
                <input type="checkbox" checked={areas.includes(spec.key)} onChange={() => toggleArea(spec.key)} />
                <span>
                  <span className="block font-semibold">{locale === 'ar' ? spec.labelAr : spec.labelEn}</span>
                  <span className="oryx-faint block text-[11.5px]">{locale === 'ar' ? spec.summaryAr : spec.summaryEn}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="oryx-faint mt-1 text-[11.5px]">{t('inspection.selectTypesHint')}</p>
        </div>
      </div>

      <CreateVehicleModal
        open={addVehicleOpen}
        vehicle={null}
        customers={(customers.data?.items ?? []).map((c: CustomerDto) => ({ id: c.id, code: c.code, nameEn: c.nameEn || c.nameAr || c.code }))}
        defaultCustomerId={customerId}
        onClose={() => setAddVehicleOpen(false)}
        onSaved={async (created) => {
          if (!created) return;
          await loadVehicles(customerId);
          setVehicleId(created.id);
        }}
      />
    </Modal>
  );
}

function VehiclesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const [documentsFor, setDocumentsFor] = useState<VehicleDto | null>(null);
  const list = useAsync(() => api.vehicles({ search: search || undefined }), [search]);
  const customers = useAsync(() => api.salesCustomers(), []);

  const setStatus = async (row: VehicleDto, status: string) => {
    await api.updateVehicle(row.id, { status });
    await list.reload();
  };

  const removeVehicle = async (row: VehicleDto) => {
    if (!window.confirm(t('erp.automotive.confirmDeleteVehicle'))) return;
    setBusyId(row.id);
    try {
      await api.deleteVehicle(row.id);
      await list.reload();
    } catch (e) {
      window.alert(e instanceof ApiError && e.code === 'resource.conflict' ? t('erp.automotive.deleteVehicleBlocked') : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('erp.automotive.vinOrPlate')} data-testid="vehicle-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-vehicle">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newVehicle')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyVehicles')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.vin')}</th>
              <th>{t('erp.automotive.vehicle')}</th>
              <th>{t('erp.automotive.plate')}</th>
              <th>{t('erp.sales.customer')}</th>
              <th>{t('erp.automotive.mileage')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((v: VehicleDto) => (
              <tr key={v.id} data-testid={`vehicle-row-${v.vin}`}>
                <td className="font-mono text-[11.5px]">{v.vin}</td>
                <td className="text-[12.5px]">{v.make} {v.model} ({v.modelYear})</td>
                <td className="text-[12.5px]">{v.plateNumber ?? '—'}</td>
                <td className="text-[12.5px]">{v.customerNameEn ?? '—'}</td>
                <td className="tabular-nums text-[12.5px]">{v.mileage.toLocaleString()}</td>
                <td><StatusBadge status={v.status} label={v.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" onClick={() => setDocumentsFor(v)} data-testid={`vehicle-documents-${v.vin}`}>
                      <Icon name="folder" size={15} />
                      {t('erp.automotive.documents')}
                    </Button>
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" aria-label={`${t('common.edit')} ${v.vin}`} onClick={() => { setEditing(v); setOpen(true); }} data-testid={`vehicle-edit-${v.vin}`}>
                          <Icon name="edit" size={14} />
                        </Button>
                        <select
                          className="oryx-select"
                          value={v.status}
                          onChange={(ev) => void setStatus(v, ev.target.value)}
                          aria-label={`${t('erp.automotive.vehicleStatus')} ${v.vin}`}
                          data-testid={`vehicle-status-${v.vin}`}
                        >
                          {['ACTIVE', 'INACTIVE', 'SOLD'].map((s) => (
                            <option key={s} value={s}>{t(`erp.automotive.vehicleStatusValue.${s}` as const)}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === v.id}
                          aria-label={`${t('common.delete')} ${v.vin}`}
                          onClick={() => void removeVehicle(v)}
                          data-testid={`vehicle-delete-${v.vin}`}
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
      <CreateVehicleModal
        open={open}
        vehicle={editing}
        customers={customers.data?.items ?? []}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={list.reload}
      />
      <VehicleDocumentsModal vehicle={documentsFor} canManage={canManage} onClose={() => setDocumentsFor(null)} />
    </Card>
  );
}

function VehicleDocumentsModal({
  vehicle,
  canManage,
  onClose,
}: {
  vehicle: VehicleDto | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('registration');
  const [number, setNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [ocrSuggestions, setOcrSuggestions] = useState<VehicleDocumentOcrResultDto | null>(null);
  const vehicleId = vehicle?.id ?? null;
  const docs = useAsync(
    () => (vehicleId ? api.vehicleDocuments(vehicleId) : Promise.resolve(null)),
    [vehicleId],
  );

  useEffect(() => {
    if (!vehicle) return;
    setCategory('registration');
    setNumber('');
    setExpiresAt('');
    setFile(null);
    setError(null);
    setOcrNotice(null);
    setOcrSuggestions(null);
  }, [vehicle]);

  /**
   * Read the attached scan and offer its fields.
   *
   * The suggestion is written into the form fields so the operator can see and
   * correct it; it is not saved until they press save. Nothing about this call
   * creates a document.
   */
  const extract = async () => {
    if (!vehicleId || !file) return;
    setOcrBusy(true);
    setOcrNotice(null);
    setOcrSuggestions(null);
    try {
      const form = new FormData();
      form.append('category', category);
      form.append('file', file);
      const result = await api.extractVehicleDocument(vehicleId, form);
      setOcrSuggestions(result);
      if (!result.configured) {
        setOcrNotice(t('erp.automotive.ocrUnconfigured'));
        return;
      }
      if (result.fields.length === 0) {
        setOcrNotice(t('erp.automotive.ocrNoFields'));
        return;
      }
      const pick = (key: string) => result.fields.find((f) => f.key === key)?.value ?? '';
      const nextNumber = pick('number');
      const nextExpiry = pick('expiresAt');
      if (nextNumber) setNumber(nextNumber);
      if (nextExpiry) setExpiresAt(nextExpiry);
      setOcrNotice(t('erp.automotive.ocrReview'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setOcrBusy(false);
    }
  };

  const submit = async () => {
    if (!vehicleId) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('category', category);
      if (number) form.append('number', number);
      if (expiresAt) form.append('expiresAt', expiresAt);
      if (file) form.append('file', file);
      await api.addVehicleDocument(vehicleId, form);
      setNumber('');
      setExpiresAt('');
      setFile(null);
      await docs.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (documentId: string) => {
    if (!vehicleId) return;
    if (!window.confirm(t('erp.automotive.confirmRemoveDocument'))) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeVehicleDocument(vehicleId, documentId);
      await docs.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const categories = VEHICLE_DOCUMENT_CATEGORIES;
  // The stored category is a stable key, not a localized label, so a document
  // recorded in Arabic still reads correctly for an English operator. Known
  // keys are translated; anything else (a legacy or API-supplied value) is
  // shown verbatim rather than hidden.
  const categoryLabel = (value: string) =>
    (categories as readonly string[]).includes(value) ? t(`erp.automotive.docCategory.${value}`) : value;

  return (
    <Modal
      open={Boolean(vehicle)}
      title={`${t('erp.automotive.documents')}${vehicle ? ` — ${vehicle.make} ${vehicle.model} (${vehicle.vin})` : ''}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div className="flex flex-col gap-4" data-testid="vehicle-documents">
        {error ? <ErrorBanner message={error} /> : null}

        {canManage ? (
          <div className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-2">
            <Field label={t('erp.automotive.documentCategory')} required>
              <select className="oryx-select" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="document-category">
                {categories.map((c) => (
                  <option key={c} value={c}>{t(`erp.automotive.docCategory.${c}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('erp.automotive.documentNumber')}>
              <input className="oryx-input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={80} data-testid="document-number" />
            </Field>
            <Field label={t('erp.automotive.expiresAt')}>
              <input type="date" className="oryx-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} data-testid="document-expires" />
            </Field>
            <Field label={t('erp.automotive.documentScan')} hint={t('erp.automotive.documentScanHint')}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="oryx-input"
                disabled={busy || ocrBusy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="document-file"
              />
            </Field>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={busy || ocrBusy || !file} onClick={extract} data-testid="extract-document">
                <Icon name="sparkles" size={15} />
                {ocrBusy ? t('common.loading') : t('erp.automotive.ocrExtract')}
              </Button>
              {ocrNotice ? (
                <span className="oryx-muted text-[12px]" data-testid="ocr-notice">{ocrNotice}</span>
              ) : null}
            </div>
            {ocrSuggestions && ocrSuggestions.fields.length > 0 ? (
              <div className="sm:col-span-2 rounded-lg border border-[var(--border)] p-3" data-testid="ocr-suggestions">
                <p className="oryx-muted m-0 mb-2 text-[12px]">{t('erp.automotive.ocrSuggested')}</p>
                <ul className="m-0 list-none p-0 text-[12.5px]">
                  {ocrSuggestions.fields.map((f) => (
                    <li key={f.key} className="flex items-center justify-between gap-3 py-0.5">
                      <span>{t(`erp.automotive.ocrField.${f.key}`)}</span>
                      <span className="font-mono">{f.value}</span>
                      <span className="oryx-faint text-[11px]">
                        {f.confidence !== null ? `${Math.round(f.confidence * 100)}%` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={submit} data-testid="save-document">
                <Icon name="plus" size={15} />
                {busy ? t('common.loading') : t('erp.automotive.addDocument')}
              </Button>
            </div>
          </div>
        ) : null}

        {docs.loading ? (
          <Skeleton height={80} />
        ) : (docs.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyDocuments')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.automotive.documentCategory')}</th>
                <th>{t('erp.automotive.documentNumber')}</th>
                <th>{t('erp.automotive.expiresAt')}</th>
                <th>{t('erp.automotive.documentScan')}</th>
                {canManage ? <th>{t('common.actions')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {docs.data!.items.map((d: VehicleDocumentDto) => (
                <tr key={d.id} data-testid={`document-row-${d.id}`}>
                  <td className="text-[12.5px]">{categoryLabel(d.category)}</td>
                  <td className="font-mono text-[12px]">{d.number ?? '—'}</td>
                  <td className="text-[12.5px]">{d.expiresAt ? d.expiresAt.slice(0, 10) : '—'}</td>
                  <td className="text-[12.5px]">
                    {d.fileUrl ? (
                      <Button size="sm" variant="ghost" onClick={() => window.open(d.fileUrl!, '_blank', 'noopener')} data-testid={`view-document-${d.id}`}>
                        <Icon name="eye" size={15} />
                        {t('common.view')}
                      </Button>
                    ) : '—'}
                  </td>
                  {canManage ? (
                    <td>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(d.id)} data-testid={`remove-document-${d.id}`}>
                        {t('common.delete')}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>
    </Modal>
  );
}

/**
 * The vehicle picker: a searchable combobox over the selected customer's cars.
 *
 * A native `<select>` cannot be typed into, and an operator with dozens of
 * vehicles on file needs to filter by VIN, plate, make or model. The list is
 * filtered client-side from the already-loaded options, so no request is made
 * per keystroke. Selecting a vehicle calls `onSelect`, which the job form uses
 * to prefill the identification fields.
 */
function VehiclePicker({
  vehicles,
  value,
  disabled,
  onSelect,
  testId,
}: {
  vehicles: VehicleDto[];
  value: string;
  disabled?: boolean;
  onSelect: (vehicleId: string) => void;
  testId?: string;
}) {
  const { t } = useUi();
  const [query, setQuery] = useState('');
  const [openList, setOpenList] = useState(false);
  const selected = vehicles.find((v) => v.id === value) ?? null;

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? vehicles.filter((v) =>
        [v.vin, v.plateNumber ?? '', v.make, v.model, String(v.modelYear)]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : vehicles;

  const label = (v: VehicleDto) => `${v.make} ${v.model} · ${v.modelYear} · ${v.vin}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`;

  return (
    <div className="relative" data-testid={testId}>
      <input
        className="oryx-input"
        placeholder={selected ? label(selected) : t('erp.automotive.searchVehicle')}
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpenList(true); }}
        onFocus={() => setOpenList(true)}
        data-testid={testId ? `${testId}-input` : undefined}
      />
      {openList && !disabled ? (
        <div className="oryx-combo" role="listbox" data-testid={testId ? `${testId}-list` : undefined}>
          {matches.length === 0 ? (
            <div className="oryx-combo-empty">{t('erp.automotive.noVehicles')}</div>
          ) : (
            matches.slice(0, 50).map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={v.id === value}
                className={`oryx-combo-item${v.id === value ? ' is-selected' : ''}`}
                onClick={() => { onSelect(v.id); setQuery(''); setOpenList(false); }}
                data-testid={`vehicle-option-${v.vin}`}
              >
                <span className="block font-semibold">{v.make} {v.model} · {v.modelYear}</span>
                <span className="oryx-faint block text-[11.5px]">{v.vin}{v.plateNumber ? ` · ${v.plateNumber}` : ''}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function CreateVehicleModal({
  open,
  vehicle,
  customers,
  defaultCustomerId,
  onClose,
  onSaved,
}: {
  open: boolean;
  vehicle: VehicleDto | null;
  customers: Array<{ id: string; code: string; nameEn: string }>;
  /** Preselected customer when the modal is opened from an inspection form. */
  defaultCustomerId?: string;
  onClose: () => void;
  onSaved: (created?: VehicleDto) => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ customerId: '', vin: '', plateNumber: '', make: '', model: '', modelYear: '2024', mileage: '0', color: '', registrationExpiresAt: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPhoto(null);
    setPhotoPreview(null);
    setForm({
      customerId: vehicle?.customerId ?? defaultCustomerId ?? '',
      vin: vehicle?.vin ?? '',
      plateNumber: vehicle?.plateNumber ?? '',
      make: vehicle?.make ?? '',
      model: vehicle?.model ?? '',
      modelYear: String(vehicle?.modelYear ?? 2024),
      mileage: String(vehicle?.mileage ?? 0),
      color: vehicle?.color ?? '',
      registrationExpiresAt: vehicle?.registrationExpiresAt?.slice(0, 10) ?? '',
    });
  }, [open, vehicle, defaultCustomerId]);

  // The camera capture is offered as a file input with `capture`, which a phone
  // opens straight into the rear camera and a desktop turns into a file picker.
  // The preview is an object URL, revoked when the modal closes, so a large
  // photograph is never held twice in memory.
  useEffect(() => {
    if (!photo) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // A VIN is 17 characters excluding I, O and Q. The server enforces this too;
  // checking here gives the operator an immediate, specific message.
  const vinValid = /^[A-HJ-NPR-Z0-9]{11,17}$/.test(form.vin.toUpperCase());

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (vehicle) {
        await api.updateVehicle(vehicle.id, {
          plateNumber: form.plateNumber || undefined,
          make: form.make,
          model: form.model,
          modelYear: Number(form.modelYear),
          color: form.color || undefined,
          registrationExpiresAt: form.registrationExpiresAt || undefined,
        });
        if (photo) {
          const fd = new FormData();
          fd.append('category', 'vehicle-photo');
          fd.append('file', photo);
          await api.addVehicleDocument(vehicle.id, fd);
        }
        await onSaved();
      } else {
        const created = await api.createVehicle({
          customerId: form.customerId,
          vin: form.vin.toUpperCase(),
          plateNumber: form.plateNumber || undefined,
          make: form.make,
          model: form.model,
          modelYear: Number(form.modelYear),
          mileage: Number(form.mileage) || 0,
          color: form.color || undefined,
          registrationExpiresAt: form.registrationExpiresAt || undefined,
        });
        if (photo && created?.id) {
          const fd = new FormData();
          fd.append('category', 'vehicle-photo');
          fd.append('file', photo);
          await api.addVehicleDocument(created.id, fd);
        }
        await onSaved(created);
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={vehicle ? t('erp.automotive.editVehicle') : t('erp.automotive.newVehicle')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || (!vehicle && !form.customerId) || !vinValid || !form.make || !form.model} onClick={submit} data-testid="save-vehicle">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.customer')} required>
          <select className="oryx-select" value={form.customerId} disabled={Boolean(vehicle)} onChange={(e) => setForm({ ...form, customerId: e.target.value })} data-testid="vehicle-customer">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.vin')} required hint={vinValid ? t('erp.automotive.vinHint') : t('erp.automotive.vinInvalid')}>
          <input className={`oryx-input${form.vin && !vinValid ? ' oryx-input--invalid' : ''}`} value={form.vin} disabled={Boolean(vehicle)} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} maxLength={17} data-testid="vehicle-vin" />
        </Field>
        <Field label={t('erp.automotive.make')} required><input className="oryx-input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} data-testid="vehicle-make" /></Field>
        <Field label={t('erp.automotive.model')} required><input className="oryx-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="vehicle-model" /></Field>
        <Field label={t('erp.automotive.modelYear')} required><input className="oryx-input" value={form.modelYear} onChange={(e) => setForm({ ...form, modelYear: e.target.value })} data-testid="vehicle-year" /></Field>
        <Field label={t('erp.automotive.plate')}><input className="oryx-input" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} data-testid="vehicle-plate" /></Field>
        {!vehicle ? (
          <Field label={t('erp.automotive.mileage')}><input className="oryx-input" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} data-testid="vehicle-mileage" /></Field>
        ) : null}
        <Field label={t('erp.automotive.color')}><input className="oryx-input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} data-testid="vehicle-color" /></Field>
        <Field label={t('erp.automotive.registrationExpiresAt')}><input type="date" className="oryx-input" value={form.registrationExpiresAt} onChange={(e) => setForm({ ...form, registrationExpiresAt: e.target.value })} data-testid="vehicle-registration-expires" /></Field>
        <Field label={t('erp.automotive.vehiclePhoto')} hint={t('erp.automotive.vehiclePhotoHint')}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="oryx-input"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            data-testid="vehicle-photo"
          />
        </Field>
        {photoPreview ? (
          <div className="sm:col-span-2" data-testid="vehicle-photo-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt={t('erp.automotive.vehiclePhoto')} className="max-h-40 rounded-lg border border-[var(--border)] object-cover" />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function BookingsTab({ canBook, canApprove, canInvoice }: { canBook: boolean; canApprove: boolean; canInvoice: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.inspectionBookings(), []);
  const vehicles = useAsync(() => api.vehicles(), []);
  const services = useAsync(() => api.inspectionServices(), []);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const report = useAsync(() => (detail ? api.inspectionReport(detail) : Promise.resolve(null)), [detail]);

  const removeBooking = async (id: string) => {
    if (!window.confirm(t('erp.automotive.confirmDeleteBooking'))) return;
    setBusyId(id);
    try {
      await api.deleteInspectionBooking(id);
      if (detail === id) setDetail(null);
      await list.reload();
    } catch (e) {
      window.alert(e instanceof ApiError && e.code === 'resource.conflict' ? t('erp.automotive.deleteBookingBlocked') : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.inspectionBookings')}</p>
        {canBook ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-inspection-booking">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newBooking')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyBookings')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.bookingNumber')}</th>
              <th>{t('erp.automotive.vehicle')}</th>
              <th>{t('erp.automotive.service')}</th>
              <th>{t('erp.automotive.scheduledAt')}</th>
              <th>{t('erp.automotive.report')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((b: InspectionBookingDto) => (
              <tr key={b.id} data-testid={`booking-row-${b.bookingNumber}`}>
                <td className="font-mono text-[12px]">{b.bookingNumber}</td>
                <td className="text-[12.5px]">{b.make} {b.model} ({b.vin})</td>
                <td className="text-[12.5px]">{b.serviceNameEn}</td>
                <td className="text-[12.5px]">{b.scheduledAt.slice(0, 16).replace('T', ' ')}</td>
                <td>{b.reportStatus ? <Badge tone={b.reportStatus === 'APPROVED' ? 'success' : 'warning'}>{b.reportStatus}</Badge> : <span className="oryx-faint text-[11.5px]">—</span>}</td>
                <td><StatusBadge status={b.status} label={b.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDetail(b.id)} data-testid={`view-booking-${b.bookingNumber}`}>{t('common.details')}</Button>
                    {canApprove && b.reportStatus === 'DRAFT' ? (
                      <Button size="sm" variant="primary" data-testid={`approve-report-${b.bookingNumber}`} onClick={async () => { await api.decideInspectionReport(b.id, 'APPROVED'); await list.reload(); }}>
                        {t('erp.hr.approve')}
                      </Button>
                    ) : null}
                    {canInvoice && b.reportStatus === 'APPROVED' && !b.invoiceId ? (
                      <Button size="sm" data-testid={`invoice-inspection-${b.bookingNumber}`} onClick={async () => { await api.invoiceInspection(b.id); await list.reload(); }}>
                        {t('erp.automotive.invoice')}
                      </Button>
                    ) : b.invoiceId ? (
                      <span className="oryx-faint text-[11.5px]">{t('erp.automotive.invoiced')}</span>
                    ) : null}
                    {canBook && b.status !== 'COMPLETED' && b.status !== 'CANCELLED' && !b.reportStatus && !b.invoiceId ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === b.id}
                        aria-label={`${t('common.delete')} ${b.bookingNumber}`}
                        onClick={() => void removeBooking(b.id)}
                        data-testid={`delete-booking-${b.bookingNumber}`}
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {detail ? (
        <div className="border-t border-[var(--border)] p-4" data-testid="inspection-report">
          <div className="mb-3 flex items-center justify-between">
            <p className="oryx-panel-title m-0">{t('erp.automotive.report')}</p>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}><Icon name="close" size={14} /></Button>
          </div>
          {report.loading ? <Skeleton height={80} /> : (
            <StatGrid>
              <StatCard icon="clipboardCheck" label={t('erp.automotive.findings')} value={String((report.data?.findings as unknown[] | undefined)?.length ?? 0)} />
              <StatCard icon="alert" label={t('erp.automotive.defects')} value={String(report.data?.defects ?? 0)} />
              <StatCard tone="danger" icon="alert" label={t('erp.automotive.critical')} value={String(report.data?.critical ?? 0)} />
              {canBook && report.data?.report ? null : (
                <div className="flex items-end">
                  <Button size="sm" data-testid={`submit-report-${detail}`} onClick={async () => { await api.submitInspectionReport(detail); await report.reload(); }}>
                    {t('erp.automotive.submitReport')}
                  </Button>
                </div>
              )}
            </StatGrid>
          )}
        </div>
      ) : null}

      <CreateBookingModal open={open} vehicles={vehicles.data?.items ?? []} services={services.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateBookingModal({
  open,
  vehicles,
  services,
  onClose,
  onCreated,
}: {
  open: boolean;
  vehicles: Array<{ id: string; vin: string; make: string; model: string }>;
  services: Array<{ id: string; nameEn: string; priceMinor: number; taxPercentBp: number }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const { companyId } = useAuth();
  const branches = useAsync(() => (companyId ? api.listBranches(companyId, { pageSize: 100 }) : Promise.resolve(null)), [companyId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicleId: '',
    serviceId: '',
    scheduledAt: new Date().toISOString().slice(0, 16),
    branchId: '',
    odometer: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ vehicleId: '', serviceId: '', scheduledAt: new Date().toISOString().slice(0, 16), branchId: '', odometer: '', notes: '' });
  }, [open]);

  const service = services.find((s) => s.id === form.serviceId);
  const vatMinor = service ? basisPointsOfMinor(service.priceMinor, service.taxPercentBp) : 0;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createInspectionBooking({
        vehicleId: form.vehicleId,
        serviceId: form.serviceId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        ...(form.branchId ? { branchId: form.branchId } : {}),
        ...(form.odometer ? { odometer: Number(form.odometer) } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={t('erp.automotive.newBooking')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.vehicleId || !form.serviceId || !form.scheduledAt} onClick={submit} data-testid="save-booking">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.automotive.vehicle')} required>
          <select className="oryx-select" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} data-testid="booking-vehicle">
            <option value="">—</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vin} — {v.make} {v.model}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.service')} required>
          <select className="oryx-select" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} data-testid="booking-service">
            <option value="">—</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.scheduledAt')} required>
          <input type="datetime-local" className="oryx-input oryx-input--date" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} data-testid="booking-date" />
        </Field>
        <Field label={t('erp.automotive.branch')}>
          <select className="oryx-select" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} data-testid="booking-branch">
            <option value="">—</option>
            {(branches.data?.items ?? []).map((b) => <option key={b.id} value={b.id}>{b.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.odometer')}>
          <input type="number" min="0" className="oryx-input tabular-nums" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} data-testid="booking-odometer" />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="booking-notes" />
        </Field>
      </div>
      {service ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] p-3 text-sm" data-testid="booking-price-summary">
          <div className="flex justify-between gap-3"><span>{t('erp.automotive.basePrice')}</span><span className="tabular-nums">{money(service.priceMinor)}</span></div>
          <div className="mt-1 flex justify-between gap-3"><span>{t('erp.automotive.vatAmount')} ({(service.taxPercentBp / 100).toFixed(2)}%)</span><span className="tabular-nums">{money(vatMinor)}</span></div>
          <div className="mt-2 flex justify-between gap-3 border-t border-[var(--border)] pt-2 font-bold"><span>{t('erp.automotive.totalInclVat')}</span><span className="tabular-nums">{money(service.priceMinor + vatMinor)}</span></div>
        </div>
      ) : null}
    </Modal>
  );
}
function ServicesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.inspectionServices(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InspectionServiceDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const removeService = async (id: string) => {
    if (!window.confirm(t('erp.automotive.confirmDeleteService'))) return;
    setBusyId(id);
    try {
      await api.deleteInspectionService(id);
      await list.reload();
    } catch (e) {
      window.alert(e instanceof ApiError && e.code === 'resource.conflict' ? t('erp.automotive.deleteServiceBlocked') : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.inspectionServices')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-inspection-service">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newService')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyServices')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.serviceImage')}</th>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.automotive.basePrice')}</th>
              <th>{t('erp.inventory.taxRate')}</th>
              <th>{t('erp.automotive.vatAmount')}</th>
              <th>{t('erp.automotive.totalInclVat')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((s: InspectionServiceDto) => (
              <tr key={s.id} data-testid={`service-row-${s.code}`}>
                <td>
                  {s.imageUrl ? (
                    <img
                      src={api.resolveImage(s.imageUrl) ?? ''}
                      alt={s.nameEn}
                      className="h-10 w-10 rounded-lg object-cover"
                      data-testid={`service-image-${s.code}`}
                    />
                  ) : (
                    <span className="oryx-muted text-[11px]">{t('erp.automotive.noImage')}</span>
                  )}
                </td>
                <td className="font-mono text-[12px]">{s.code}</td>
                <td className="text-[12.5px]">{s.nameEn}</td>
                <td className="tabular-nums text-[12.5px]">{money(s.priceMinor)}</td>
                <td className="text-[12.5px]">{(s.taxPercentBp / 100).toFixed(2)}%</td>
                <td className="tabular-nums text-[12.5px]" data-testid={`service-vat-${s.code}`}>{money(basisPointsOfMinor(s.priceMinor, s.taxPercentBp))}</td>
                <td className="tabular-nums text-[12.5px] font-semibold" data-testid={`service-total-${s.code}`}>{money(s.priceMinor + basisPointsOfMinor(s.priceMinor, s.taxPercentBp))}</td>
                <td>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t('common.edit')} ${s.code}`}
                        onClick={() => { setEditing(s); setOpen(true); }}
                        data-testid={`service-edit-${s.code}`}
                      >
                        <Icon name="edit" size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === s.id}
                        aria-label={`${t('common.delete')} ${s.code}`}
                        onClick={() => void removeService(s.id)}
                        data-testid={`service-delete-${s.code}`}
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <ServiceModal
        open={open}
        service={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={list.reload}
      />
    </Card>
  );
}

/**
 * Create or edit an inspection service.
 *
 * The same dialog serves both because the fields are identical; only the code is
 * immutable once created (a booking and a printed invoice reference it by code).
 * The picture is uploaded through the shared media library after the service row
 * exists, so a create that includes a picture is a create followed by an upload.
 */
function ServiceModal({
  open,
  service,
  onClose,
  onSaved,
}: {
  open: boolean;
  service: InspectionServiceDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const editing = service !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', price: '0.00', taxRate: '10', duration: '60' });

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setForm({
      code: service?.code ?? '',
      nameEn: service?.nameEn ?? '',
      nameAr: service?.nameAr ?? '',
      price: (service ? service.priceMinor / 1000 : 0).toFixed(3),
      taxRate: ((service?.taxPercentBp ?? 1000) / 100).toString(),
      duration: (service?.durationMinutes ?? 60).toString(),
    });
  }, [open, service]);

  const priceMinor = toMinorInput(form.price);
  const taxBp = Math.round((Number(form.taxRate) || 0) * 100);
  const vatMinor = basisPointsOfMinor(priceMinor, taxBp);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body = {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        priceMinor,
        taxPercentBp: taxBp,
        durationMinutes: Math.round(Number(form.duration) || 60),
      };
      const saved = editing
        ? await api.updateInspectionService(service!.id, body)
        : await api.createInspectionService({ ...body, code: form.code });
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.uploadInspectionServiceImage(saved.id, fd);
      }
      await onSaved();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={editing ? t('erp.automotive.editService') : t('erp.automotive.newService')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.nameEn || (!editing && !form.code)} onClick={submit} data-testid="save-service">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} disabled={editing} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="service-code" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required><input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="service-name-en" /></Field>
        <Field label={`${t('common.name')} (AR)`} required><input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="service-name-ar" /></Field>
        <Field label={t('erp.automotive.basePrice')}><input className="oryx-input tabular-nums" type="number" min="0" step="0.001" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="service-price" /></Field>
        <Field label={t('erp.inventory.taxRate')}><input className="oryx-input tabular-nums" type="number" min="0" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} data-testid="service-tax-rate" /></Field>
        <Field label={t('erp.automotive.durationMinutes')}><input className="oryx-input tabular-nums" type="number" min="1" step="5" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} data-testid="service-duration" /></Field>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border)] p-3 text-sm" data-testid="service-price-preview">
        <div className="flex justify-between gap-3"><span>{t('erp.automotive.basePrice')}</span><span className="tabular-nums">{money(priceMinor)}</span></div>
        <div className="mt-1 flex justify-between gap-3"><span>{t('erp.automotive.vatAmount')} ({(taxBp / 100).toFixed(2)}%)</span><span className="tabular-nums" data-testid="preview-vat">{money(vatMinor)}</span></div>
        <div className="mt-2 flex justify-between gap-3 border-t border-[var(--border)] pt-2 font-bold"><span>{t('erp.automotive.totalInclVat')}</span><span className="tabular-nums" data-testid="preview-total">{money(priceMinor + vatMinor)}</span></div>
      </div>

      <div className="mt-3">
        <p className="oryx-label">{t('erp.automotive.serviceImage')}</p>
        <p className="oryx-muted m-0 mb-2 text-[11.5px]">{t('erp.automotive.serviceImageHint')}</p>
        <div className="flex items-center gap-3">
          {service?.imageUrl ? (
            <img src={api.resolveImage(service.imageUrl) ?? ''} alt={service.nameEn} className="h-14 w-14 rounded-lg object-cover" data-testid="service-image-current" />
          ) : null}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="oryx-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="service-image-input"
          />
        </div>
      </div>
    </Modal>
  );
}
