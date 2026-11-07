'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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
import type { InspectionBookingDto, InspectionServiceDto, VehicleDto, VehicleDocumentDto, CustomerDto } from '@oryx/shared';
import { INSPECTION_SECTION_SPECS, VEHICLE_DOCUMENT_CATEGORIES, type InspectionSectionKey } from '@oryx/shared';
import { useRouter } from 'next/navigation';

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
  const debounced = useDebounced(search);
  const list = useAsync(() => api.inspectionSessions({ search: debounced || undefined }), [debounced]);

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
                      <Button size="sm" onClick={() => router.push(`/automotive/inspections/${j.id}`)} data-testid={`open-job-${j.id}`}>
                        {t('inspection.open')}
                      </Button>
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

/**
 * Create an inspection.
 *
 * The vehicle list is filtered to the chosen customer's vehicles, because a
 * vehicle belongs to a customer and inspecting one customer's car under
 * another's name is a data-integrity error the server would reject anyway. The
 * identification fields are prefilled from the vehicle so the administrator
 * only confirms them.
 */
function NewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [areas, setAreas] = useState<InspectionSectionKey[]>([]);
  const customers = useAsync(() => api.salesCustomers(), []);

  // The vehicle options are stored together with the customer they were loaded
  // for, and only used while that customer is still selected. Storing a bare
  // list would leave the previous customer's vehicles selectable for one render
  // after the customer changes — long enough to pick another customer's car and
  // have the server reject the job.
  const [vehicleSource, setVehicleSource] = useState<{ customerId: string; items: VehicleDto[] } | null>(
    null,
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
      await api.createInspectionSession({ customerId, vehicleId, selectedAreas: areas });
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

        <Field label={t('inspection.selectVehicle')} required>
          <select
            className="oryx-select"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={!customerId || vehiclesLoading}
            data-testid="job-vehicle"
          >
            <option value="">{t('common.select')}</option>
            {vehicleOptions.map((v: VehicleDto) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} · {v.modelYear} · {v.vin}
              </option>
            ))}
          </select>
        </Field>

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
    </Modal>
  );
}

function VehiclesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const [documentsFor, setDocumentsFor] = useState<VehicleDto | null>(null);
  const list = useAsync(() => api.vehicles({ search: search || undefined }), [search]);
  const customers = useAsync(() => api.salesCustomers(), []);

  const setStatus = async (row: VehicleDto, status: string) => {
    await api.updateVehicle(row.id, { status });
    await list.reload();
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
  }, [vehicle]);

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
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="document-file"
              />
            </Field>
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

function CreateVehicleModal({
  open,
  vehicle,
  customers,
  onClose,
  onSaved,
}: {
  open: boolean;
  vehicle: VehicleDto | null;
  customers: Array<{ id: string; code: string; nameEn: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ customerId: '', vin: '', plateNumber: '', make: '', model: '', modelYear: '2024', mileage: '0', color: '', registrationExpiresAt: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      customerId: vehicle?.customerId ?? '',
      vin: vehicle?.vin ?? '',
      plateNumber: vehicle?.plateNumber ?? '',
      make: vehicle?.make ?? '',
      model: vehicle?.model ?? '',
      modelYear: String(vehicle?.modelYear ?? 2024),
      mileage: String(vehicle?.mileage ?? 0),
      color: vehicle?.color ?? '',
      registrationExpiresAt: vehicle?.registrationExpiresAt?.slice(0, 10) ?? '',
    });
  }, [open, vehicle]);

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
      } else {
        await api.createVehicle({
          customerId: form.customerId,
          vin: form.vin,
          plateNumber: form.plateNumber || undefined,
          make: form.make,
          model: form.model,
          modelYear: Number(form.modelYear),
          mileage: Number(form.mileage) || 0,
          color: form.color || undefined,
          registrationExpiresAt: form.registrationExpiresAt || undefined,
        });
      }
      await onSaved();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={vehicle ? t('erp.automotive.editVehicle') : t('erp.automotive.newVehicle')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || (!vehicle && !form.customerId) || !form.vin || !form.make || !form.model} onClick={submit} data-testid="save-vehicle">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.customer')} required>
          <select className="oryx-select" value={form.customerId} disabled={Boolean(vehicle)} onChange={(e) => setForm({ ...form, customerId: e.target.value })} data-testid="vehicle-customer">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.vin')} required hint={t('erp.automotive.vinHint')}>
          <input className="oryx-input" value={form.vin} disabled={Boolean(vehicle)} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} maxLength={17} data-testid="vehicle-vin" />
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
  const [detail, setDetail] = useState<string | null>(null);
  const report = useAsync(() => (detail ? api.inspectionReport(detail) : Promise.resolve(null)), [detail]);

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
  services: Array<{ id: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ vehicleId: '', serviceId: '', scheduledAt: new Date().toISOString().slice(0, 16) });

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createInspectionBooking({ vehicleId: form.vehicleId, serviceId: form.serviceId, scheduledAt: new Date(form.scheduledAt).toISOString() });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={t('erp.automotive.newBooking')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.vehicleId || !form.serviceId} onClick={submit} data-testid="save-booking">{busy ? t('common.loading') : t('common.save')}</Button></>}>
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
          <input type="datetime-local" className="oryx-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} data-testid="booking-date" />
        </Field>
      </div>
    </Modal>
  );
}

function ServicesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.inspectionServices(), []);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.inspectionServices')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-inspection-service">
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
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.automotive.price')}</th>
              <th>{t('erp.inventory.taxRate')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((s: InspectionServiceDto) => (
              <tr key={s.id} data-testid={`service-row-${s.code}`}>
                <td className="font-mono text-[12px]">{s.code}</td>
                <td className="text-[12.5px]">{s.nameEn}</td>
                <td className="tabular-nums text-[12.5px]">{money(s.priceMinor)}</td>
                <td className="text-[12.5px]">{(s.taxPercentBp / 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateServiceModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateServiceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', price: '0.00', taxRate: '15' });
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createInspectionService({
        code: form.code,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        priceMinor: toMinorInput(form.price),
        taxPercentBp: Math.round(Number(form.taxRate) * 100),
      });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={t('erp.automotive.newService')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={submit} data-testid="save-service">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required><input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="service-code" /></Field>
        <Field label={`${t('common.name')} (EN)`} required><input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="service-name-en" /></Field>
        <Field label={`${t('common.name')} (AR)`} required><input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="service-name-ar" /></Field>
        <Field label={t('erp.automotive.price')}><input className="oryx-input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label={t('erp.inventory.taxRate')}><input className="oryx-input" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

