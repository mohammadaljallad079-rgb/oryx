'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
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
  StatusBadge,
  TableShell,
} from '@/components/ui';
import type { InspectionBookingDto, InspectionServiceDto, VehicleDto } from '@oryx/shared';

type Tab = 'vehicles' | 'bookings' | 'services';

export default function InspectionsPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('vehicles');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'vehicles', label: t('erp.automotive.vehicles') },
    { key: 'bookings', label: t('erp.automotive.inspectionBookings') },
    { key: 'services', label: t('erp.automotive.inspectionServices') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="inspections-page">
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

function VehiclesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.vehicles({ search: search || undefined }), [search]);
  const customers = useAsync(() => api.salesCustomers(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('erp.automotive.vinOrPlate')} data-testid="vehicle-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-vehicle">
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
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateVehicleModal open={open} customers={customers.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateVehicleModal({
  open,
  customers,
  onClose,
  onCreated,
}: {
  open: boolean;
  customers: Array<{ id: string; code: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ customerId: '', vin: '', plateNumber: '', make: '', model: '', modelYear: '2024', mileage: '0' });

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createVehicle({
        customerId: form.customerId,
        vin: form.vin,
        plateNumber: form.plateNumber || undefined,
        make: form.make,
        model: form.model,
        modelYear: Number(form.modelYear),
        mileage: Number(form.mileage) || 0,
      });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={t('erp.automotive.newVehicle')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.customerId} onClick={submit} data-testid="save-vehicle">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.customer')} required>
          <select className="oryx-select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} data-testid="vehicle-customer">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.vin')} required hint={t('erp.automotive.vinHint')}>
          <input className="oryx-input" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} maxLength={17} data-testid="vehicle-vin" />
        </Field>
        <Field label={t('erp.automotive.make')} required><input className="oryx-input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} data-testid="vehicle-make" /></Field>
        <Field label={t('erp.automotive.model')} required><input className="oryx-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} data-testid="vehicle-model" /></Field>
        <Field label={t('erp.automotive.modelYear')} required><input className="oryx-input" value={form.modelYear} onChange={(e) => setForm({ ...form, modelYear: e.target.value })} data-testid="vehicle-year" /></Field>
        <Field label={t('erp.automotive.plate')}><input className="oryx-input" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} /></Field>
        <Field label={t('erp.automotive.mileage')}><input className="oryx-input" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} /></Field>
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
            <div className="grid gap-3 sm:grid-cols-4">
              <Kpi label={t('erp.automotive.findings')} value={String((report.data?.findings as unknown[] | undefined)?.length ?? 0)} />
              <Kpi label={t('erp.automotive.defects')} value={String(report.data?.defects ?? 0)} />
              <Kpi label={t('erp.automotive.critical')} value={String(report.data?.critical ?? 0)} />
              {canBook && report.data?.report ? null : (
                <div className="flex items-end">
                  <Button size="sm" data-testid={`submit-report-${detail}`} onClick={async () => { await api.submitInspectionReport(detail); await report.reload(); }}>
                    {t('erp.automotive.submitReport')}
                  </Button>
                </div>
              )}
            </div>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="oryx-label">{label}</p>
      <p className="m-0 text-[22px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
