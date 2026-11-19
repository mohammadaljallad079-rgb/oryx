'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, toMinorInput, toQuantityInput } from '@/lib/erp-format';
import { useFormAttachments } from '@/lib/use-form-attachments';
import { AttachmentField } from '@/components/attachments';
import { RecordPreview } from '@/components/record-preview';
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
import type { JobCardDto, MarketplaceProviderDto, ServiceRequestDto } from '@oryx/shared';

type Tab = 'job-cards' | 'bookings' | 'bay' | 'warranties' | 'providers' | 'requests';

export default function MaintenancePage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('job-cards');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'job-cards', label: t('erp.automotive.jobCards') },
    { key: 'bookings', label: t('erp.automotive.maintenanceBookings') },
    { key: 'bay', label: t('erp.automotive.bays') },
    { key: 'warranties', label: t('erp.automotive.warranties') },
    { key: 'providers', label: t('erp.automotive.providers') },
    { key: 'requests', label: t('erp.automotive.serviceRequests') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="maintenance-page">
      <SectionHeader
        title={t('nav.automotive_maintenance')}
        subtitle={t('erp.automotive.maintenanceSubtitle')}
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
            data-testid={`maintenance-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'job-cards' ? (
        <JobCardsTab
          canManage={can('erp.maintenance.jobcard.manage')}
          canEstimate={can('erp.maintenance.estimate.manage')}
          canInvoice={can('erp.maintenance.invoice')}
          canReserve={can('erp.parts.reserve')}
          canIssue={can('erp.parts.issue')}
        />
      ) : null}
      {tab === 'bookings' ? <BookingsTab canManage={can('erp.maintenance.booking.manage')} /> : null}
      {tab === 'bay' ? <BaysTab canManage={can('erp.maintenance.booking.manage')} /> : null}
      {tab === 'warranties' ? <WarrantiesTab canManage={can('erp.maintenance.warranty.manage')} /> : null}
      {tab === 'providers' ? <ProvidersTab canManage={can('erp.marketplace.provider.manage')} /> : null}
      {tab === 'requests' ? <RequestsTab canManage={can('erp.marketplace.request.manage')} /> : null}
    </div>
  );
}

function JobCardsTab({
  canManage,
  canEstimate,
  canInvoice,
  canReserve,
  canIssue,
}: {
  canManage: boolean;
  canEstimate: boolean;
  canInvoice: boolean;
  canReserve: boolean;
  canIssue: boolean;
}) {
  const { t } = useUi();
  const list = useAsync(() => api.jobCards(), []);
  const vehicles = useAsync(() => api.vehicles(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<JobCardDto | null>(null);
  const [estimateTarget, setEstimateTarget] = useState<JobCardDto | null>(null);
  const [reserveTarget, setReserveTarget] = useState<JobCardDto | null>(null);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.jobCards')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-job-card">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newJobCard')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyJobCards')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.jobNumber')}</th>
              <th>{t('erp.automotive.vehicle')}</th>
              <th>{t('erp.automotive.complaint')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((j: JobCardDto) => (
              <tr key={j.id} data-testid={`job-row-${j.jobNumber}`}>
                <td className="font-mono text-[12px]">{j.jobNumber}</td>
                <td className="text-[12.5px]">{j.make} {j.model} ({j.plateNumber ?? j.vin})</td>
                <td className="text-[12.5px]">{j.complaint ?? '—'}</td>
                <td><StatusBadge status={j.status} label={j.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDetail(j)} data-testid={`preview-job-${j.jobNumber}`}>
                      {t('attach.preview')}
                    </Button>
                    {canEstimate ? (
                      <Button size="sm" onClick={() => setEstimateTarget(j)} data-testid={`estimate-job-${j.jobNumber}`}>
                        {t('erp.automotive.estimate')}
                      </Button>
                    ) : null}
                    {canReserve ? (
                      <Button size="sm" onClick={() => setReserveTarget(j)} data-testid={`reserve-job-${j.jobNumber}`}>
                        {t('erp.automotive.reserve')}
                      </Button>
                    ) : null}
                    {canManage && j.status === 'OPEN' ? (
                      <Button size="sm" variant="primary" data-testid={`progress-job-${j.jobNumber}`} onClick={async () => { await api.updateJobCard(j.id, { status: 'IN_PROGRESS' }); await list.reload(); }}>
                        {t('erp.operations.start')}
                      </Button>
                    ) : null}
                    {canManage && j.status === 'IN_PROGRESS' ? (
                      <Button size="sm" data-testid={`complete-job-${j.jobNumber}`} onClick={async () => { await api.updateJobCard(j.id, { status: 'COMPLETED' }); await list.reload(); }}>
                        {t('erp.operations.complete')}
                      </Button>
                    ) : null}
                    {canInvoice && j.status === 'COMPLETED' ? (
                      <Button size="sm" variant="primary" data-testid={`invoice-job-${j.jobNumber}`} onClick={async () => { await api.invoiceJobCard(j.id); await list.reload(); }}>
                        {t('erp.automotive.invoice')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <RecordPreview
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `${t('erp.automotive.jobCard')} — ${detail.jobNumber}` : ''}
        subtitle={detail ? `${detail.make ?? ''} ${detail.model ?? ''} ${detail.plateNumber ? `· ${detail.plateNumber}` : ''}`.trim() : undefined}
        entityType="JOB_CARD"
        entityId={detail?.id ?? null}
        canWriteAttachments={canManage}
        testId="job-card-preview"
        fields={
          detail
            ? [
                { label: t('erp.automotive.jobNumber'), value: detail.jobNumber },
                { label: t('erp.automotive.vin'), value: detail.vin ?? '—' },
                { label: t('erp.automotive.vehicle'), value: `${detail.make ?? '—'} ${detail.model ?? ''}`.trim() },
                { label: t('erp.automotive.plate'), value: detail.plateNumber ?? '—' },
                { label: t('erp.automotive.odometer'), value: detail.odometer !== null && detail.odometer !== undefined ? String(detail.odometer) : '—' },
                { label: t('erp.automotive.complaint'), value: detail.complaint ?? '—' },
                { label: t('common.status'), value: detail.status },
                { label: t('common.date'), value: detail.createdAt.slice(0, 10) },
              ]
            : []
        }
      />
      <CreateJobCardModal open={open} vehicles={vehicles.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
      <EstimateModal
        job={estimateTarget}
        products={products.data?.items ?? []}
        onClose={() => setEstimateTarget(null)}
        onDone={list.reload}
      />
      <ReserveModal
        job={reserveTarget}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        canIssue={canIssue}
        onClose={() => setReserveTarget(null)}
        onDone={list.reload}
      />
    </Card>
  );
}

function EstimateModal({
  job,
  products,
  onClose,
  onDone,
}: {
  job: JobCardDto | null;
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState({ productId: '', description: '', quantity: '1', unitPrice: '0.00', taxRate: '15' });
  const attach = useFormAttachments();

  const submit = async () => {
    if (!job) return;
    setBusy(true); setError(null);
    try {
      const created = await api.createEstimate(job.id, {
        lines: [
          {
            type: line.productId ? 'PART' : 'LABOUR',
            productId: line.productId || undefined,
            description: line.description || 'Service',
            quantity: toQuantityInput(line.quantity),
            unitPriceMinor: toMinorInput(line.unitPrice),
            taxPercentBp: Math.round(Number(line.taxRate) * 100),
          },
        ],
      });
      await attach.flush(String(created.id));
      attach.reset();
      await onDone();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={Boolean(job)} title={t('erp.automotive.estimate')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={submit} data-testid="save-estimate">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.product')}>
          <select className="oryx-select" value={line.productId} onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            setLine({ ...line, productId: e.target.value, description: p ? p.nameEn : line.description, unitPrice: p ? (p.salesPriceMinor / 100).toFixed(2) : line.unitPrice, taxRate: p ? String(p.taxRateBp / 100) : line.taxRate });
          }} data-testid="estimate-product">
            <option value="">{t('erp.automotive.labour')}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.accounting.description')} required>
          <input className="oryx-input" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} data-testid="estimate-description" />
        </Field>
        <Field label={t('erp.inventory.quantity')} required>
          <input className="oryx-input" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} data-testid="estimate-quantity" />
        </Field>
        <Field label={t('erp.sales.unitPrice')} required>
          <input className="oryx-input" value={line.unitPrice} onChange={(e) => setLine({ ...line, unitPrice: e.target.value })} data-testid="estimate-price" />
        </Field>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField entityType="REPAIR_ESTIMATE" entityId={null} value={attach.items} onChange={attach.setItems} registerFlush={attach.register} canWrite testId="new-estimate-attachments" />
      </div>
    </Modal>
  );
}

function ReserveModal({
  job,
  products,
  warehouses,
  canIssue,
  onClose,
  onDone,
}: {
  job: JobCardDto | null;
  products: Array<{ id: string; sku: string; nameEn: string }>;
  warehouses: Array<{ id: string; code: string; nameEn: string }>;
  canIssue: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [line, setLine] = useState({ productId: '', quantity: '1', warehouseId: '' });
  const attach = useFormAttachments();

  const reserve = async () => {
    if (!job) return;
    setBusy(true); setError(null);
    try {
      const r = await api.createPartReservation({
        jobCardId: job.id,
        warehouseId: line.warehouseId,
        lines: [{ productId: line.productId, quantity: toQuantityInput(line.quantity) }],
      });
      setReservationId(r.id);
      await attach.flush(job.id);
      attach.reset();
      await onDone();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  const issue = async () => {
    if (!reservationId) return;
    setBusy(true); setError(null);
    try {
      await api.issuePartReservation(reservationId);
      await onDone();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={Boolean(job)} title={t('erp.automotive.reserveParts')} onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {reservationId && canIssue ? (
            <Button variant="primary" disabled={busy} onClick={issue} data-testid="issue-reservation">{t('erp.automotive.issue')}</Button>
          ) : (
            <Button variant="primary" disabled={busy || !line.productId || !line.warehouseId} onClick={reserve} data-testid="save-reservation">{busy ? t('common.loading') : t('erp.automotive.reserve')}</Button>
          )}
        </>
      }>
      {error ? <ErrorBanner message={error} /> : null}
      {reservationId ? (
        <p className="oryx-muted text-[13px]" data-testid="reservation-created">{t('erp.automotive.reserved')}: {reservationId.slice(-6)}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('erp.inventory.product')} required>
            <select className="oryx-select" value={line.productId} onChange={(e) => setLine({ ...line, productId: e.target.value })} data-testid="reserve-product">
              <option value="">—</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.nameEn}</option>)}
            </select>
          </Field>
          <Field label={t('erp.inventory.warehouse')} required>
            <select className="oryx-select" value={line.warehouseId} onChange={(e) => setLine({ ...line, warehouseId: e.target.value })} data-testid="reserve-warehouse">
              <option value="">—</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.nameEn}</option>)}
            </select>
          </Field>
          <Field label={t('erp.inventory.quantity')} required>
            <input className="oryx-input" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} data-testid="reserve-quantity" />
          </Field>
        </div>
      )}
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField entityType="JOB_CARD" entityId={job?.id ?? null} value={attach.items} onChange={attach.setItems} registerFlush={attach.register} canWrite testId="reserve-attachments" />
      </div>
    </Modal>
  );
}

function CreateJobCardModal({
  open,
  vehicles,
  onClose,
  onCreated,
}: {
  open: boolean;
  vehicles: Array<{ id: string; vin: string; make: string; model: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ vehicleId: '', complaint: '', odometer: '' });

  const attach = useFormAttachments();

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const created = await api.createJobCard({
        vehicleId: form.vehicleId,
        complaint: form.complaint || undefined,
        odometer: form.odometer ? Number(form.odometer) : undefined,
      });
      await attach.flush(created.id);
      attach.reset();
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={t('erp.automotive.newJobCard')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.vehicleId} onClick={submit} data-testid="save-job-card">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.automotive.vehicle')} required>
          <select className="oryx-select" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} data-testid="job-vehicle">
            <option value="">—</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vin} — {v.make} {v.model}</option>)}
          </select>
        </Field>
        <Field label={t('erp.automotive.odometer')}>
          <input className="oryx-input" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
        </Field>
        <Field label={t('erp.automotive.complaint')}>
          <input className="oryx-input" value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} data-testid="job-complaint" />
        </Field>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField entityType="JOB_CARD" entityId={null} value={attach.items} onChange={attach.setItems} registerFlush={attach.register} canWrite testId="new-job-card-attachments" />
      </div>
    </Modal>
  );
}

interface MaintenanceBookingRow {
  id: string;
  bookingNumber: string;
  scheduledAt: string;
  status: string;
  complaint: string | null;
  notes: string | null;
  vehicle?: { vin: string; make: string; model: string; plateNumber: string | null } | null;
  _count?: { jobCards: number };
}

function BookingsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.maintenanceBookings(), []);
  const vehicles = useAsync(() => api.vehicles(), []);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<MaintenanceBookingRow | null>(null);
  const [form, setForm] = useState({ vehicleId: '', scheduledAt: '', complaint: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attach = useFormAttachments();

  const closeCreate = () => {
    setOpen(false);
    setForm({ vehicleId: '', scheduledAt: '', complaint: '', notes: '' });
    attach.reset();
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createMaintenanceBooking({
        vehicleId: form.vehicleId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        complaint: form.complaint || undefined,
        notes: form.notes || undefined,
      });
      await attach.flush(String(created.id));
      await list.reload();
      closeCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const rows = (list.data?.items ?? []) as unknown as MaintenanceBookingRow[];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.maintenanceBookings')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-maintenance-booking">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newBooking')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : rows.length === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyBookings')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.bookingNumber')}</th>
              <th>{t('erp.automotive.vehicle')}</th>
              <th>{t('erp.automotive.scheduledAt')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} data-testid={`maintenance-booking-row-${b.bookingNumber}`}>
                <td className="font-mono text-[12px]">{b.bookingNumber}</td>
                <td className="text-[12.5px]">
                  {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : '—'}
                  {b.vehicle?.plateNumber ? <span className="oryx-faint"> · {b.vehicle.plateNumber}</span> : null}
                </td>
                <td className="text-[12.5px]">{b.scheduledAt.slice(0, 16).replace('T', ' ')}</td>
                <td><StatusBadge status={b.status} label={b.status} /></td>
                <td>
                  <Button size="sm" onClick={() => setPreview(b)} data-testid={`preview-maintenance-booking-${b.bookingNumber}`}>
                    {t('attach.preview')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <RecordPreview
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? preview.bookingNumber : ''}
        subtitle={preview?.vehicle ? `${preview.vehicle.make} ${preview.vehicle.model} · ${preview.vehicle.vin}` : undefined}
        entityType="MAINTENANCE_BOOKING"
        entityId={preview?.id ?? null}
        canWriteAttachments={canManage}
        testId="maintenance-booking-preview"
        fields={
          preview
            ? [
                { label: t('erp.automotive.bookingNumber'), value: preview.bookingNumber },
                { label: t('common.status'), value: preview.status },
                { label: t('erp.automotive.scheduledAt'), value: preview.scheduledAt.slice(0, 16).replace('T', ' ') },
                { label: t('erp.automotive.plateNumber'), value: preview.vehicle?.plateNumber ?? '—' },
                { label: t('erp.automotive.complaint'), value: preview.complaint ?? '—' },
                { label: t('erp.automotive.notes'), value: preview.notes ?? '—' },
                { label: t('erp.automotive.jobCards'), value: String(preview._count?.jobCards ?? 0) },
              ]
            : []
        }
      />

      <Modal
        open={open}
        title={t('erp.automotive.newBooking')}
        onClose={closeCreate}
        footer={
          <>
            <Button onClick={closeCreate}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy || !form.vehicleId || !form.scheduledAt} onClick={submit} data-testid="save-maintenance-booking">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('erp.automotive.vehicle')} required>
            <select className="oryx-select" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} data-testid="maintenance-vehicle">
              <option value="">—</option>
              {(vehicles.data?.items ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.vin} — {v.make} {v.model}</option>
              ))}
            </select>
          </Field>
          <Field label={t('erp.automotive.scheduledAt')} required>
            <input type="datetime-local" className="oryx-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} data-testid="maintenance-scheduled-at" />
          </Field>
          <Field label={t('erp.automotive.complaint')}>
            <input className="oryx-input" value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} />
          </Field>
          <Field label={t('erp.automotive.notes')}>
            <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <AttachmentField entityType="MAINTENANCE_BOOKING" entityId={null} value={attach.items} onChange={attach.setItems} registerFlush={attach.register} canWrite testId="new-maintenance-booking-attachments" />
        </div>
      </Modal>
    </Card>
  );
}

function BaysTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.workshopBays(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4"><p className="oryx-panel-title m-0">{t('erp.automotive.bays')}</p></div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyBays')} />
      ) : (
        <TableShell>
          <thead><tr><th>{t('common.code')}</th><th>{t('common.name')}</th><th>{t('common.status')}</th></tr></thead>
          <tbody>
            {list.data!.items.map((b) => (
              <tr key={String(b.id)} data-testid={`bay-row-${String(b.code)}`}>
                <td className="font-mono text-[12px]">{String(b.code)}</td>
                <td className="text-[12.5px]">{String(b.nameEn)}</td>
                <td><Badge tone={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'Active' : 'Inactive'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <span className="hidden">{canManage ? '1' : '0'}</span>
    </Card>
  );
}

function WarrantiesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.warranties(), []);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4"><p className="oryx-panel-title m-0">{t('erp.automotive.warranties')}</p></div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyWarranties')} />
      ) : (
        <TableShell>
          <thead><tr><th>{t('erp.automotive.vehicle')}</th><th>{t('erp.accounting.description')}</th><th>{t('erp.automotive.expiresAt')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {list.data!.items.map((w) => (
              <tr key={String(w.id)}>
                <td className="text-[12.5px]">{String((w.vehicle as { vin?: string } | undefined)?.vin ?? '—')}</td>
                <td className="text-[12.5px]">{String(w.description)}</td>
                <td className="text-[12.5px]">{w.expiresAt ? String(w.expiresAt).slice(0, 10) : '—'}</td>
                <td><Badge tone={w.isActive ? 'success' : 'neutral'}>{w.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td>
                  <Button size="sm" onClick={() => setDetail(w)} data-testid={`preview-warranty-${String(w.id)}`}>{t('attach.preview')}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <RecordPreview
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={t('erp.automotive.warranties')}
        subtitle={detail ? String((detail.vehicle as { vin?: string } | undefined)?.vin ?? '') : undefined}
        entityType="VEHICLE"
        entityId={detail ? String((detail.vehicle as { id?: string } | undefined)?.id ?? '') || null : null}
        canWriteAttachments={canManage}
        testId="warranty-preview"
        fields={
          detail
            ? [
                { label: t('erp.automotive.vehicle'), value: String((detail.vehicle as { vin?: string } | undefined)?.vin ?? '—') },
                { label: t('erp.accounting.description'), value: String(detail.description ?? '—') },
                { label: t('erp.automotive.expiresAt'), value: detail.expiresAt ? String(detail.expiresAt).slice(0, 10) : '—' },
                { label: t('common.status'), value: detail.isActive ? t('common.active') : t('common.inactive') },
              ]
            : []
        }
      />
      <span className="hidden">{canManage ? '1' : '0'}</span>
    </Card>
  );
}

function ProvidersTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.marketplaceProviders(), []);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.providers')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-provider">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newProvider')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyProviders')} />
      ) : (
        <TableShell>
          <thead><tr><th>{t('common.code')}</th><th>{t('common.name')}</th><th>{t('erp.automotive.commission')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {list.data!.items.map((p: MarketplaceProviderDto) => (
              <tr key={p.id} data-testid={`provider-row-${p.code}`}>
                <td className="font-mono text-[12px]">{p.code}</td>
                <td className="text-[12.5px]">{p.nameEn}</td>
                <td className="text-[12.5px]">{(p.commissionPercentBp / 100).toFixed(2)}%</td>
                <td><StatusBadge status={p.status} label={p.status} /></td>
                <td>
                  {canManage && p.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" data-testid={`approve-provider-${p.code}`} onClick={async () => { await api.decideProvider(p.id, 'APPROVED'); await list.reload(); }}>{t('erp.hr.approve')}</Button>
                      <Button size="sm" variant="danger" onClick={async () => { await api.decideProvider(p.id, 'REJECTED'); await list.reload(); }}>{t('erp.hr.reject')}</Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateProviderModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateProviderModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', categoryKey: 'WORKSHOP', commission: '10' });
  const attach = useFormAttachments();

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const created = await api.createProvider({ ...form, commissionPercentBp: Math.round(Number(form.commission) * 100) });
      await attach.flush(created.id);
      attach.reset();
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={t('erp.automotive.newProvider')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={submit} data-testid="save-provider">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required><input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} data-testid="provider-code" /></Field>
        <Field label={t('erp.automotive.commission')}><input className="oryx-input" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} /></Field>
        <Field label={`${t('common.name')} (EN)`} required><input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="provider-name-en" /></Field>
        <Field label={`${t('common.name')} (AR)`} required><input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="provider-name-ar" /></Field>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField entityType="MARKETPLACE_PROVIDER" entityId={null} value={attach.items} onChange={attach.setItems} registerFlush={attach.register} canWrite testId="new-provider-attachments" />
      </div>
    </Modal>
  );
}

function RequestsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.serviceRequests(), []);
  const providers = useAsync(() => api.marketplaceProviders({ status: 'APPROVED' }), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4"><p className="oryx-panel-title m-0">{t('erp.automotive.serviceRequests')}</p></div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyRequests')} />
      ) : (
        <TableShell>
          <thead><tr><th>{t('erp.automotive.requestNumber')}</th><th>{t('erp.automotive.category')}</th><th>{t('erp.automotive.provider')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {list.data!.items.map((r: ServiceRequestDto) => (
              <tr key={r.id} data-testid={`request-row-${r.requestNumber}`}>
                <td className="font-mono text-[12px]">{r.requestNumber}</td>
                <td><Badge tone="info">{r.categoryKey}</Badge></td>
                <td className="text-[12.5px]">{r.provider?.nameEn ?? '—'}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  {canManage && r.status === 'NEW' && (providers.data?.items.length ?? 0) > 0 ? (
                    <Button size="sm" data-testid={`assign-request-${r.requestNumber}`} onClick={async () => { await api.assignServiceRequest(r.id, providers.data!.items[0].id); await list.reload(); }}>
                      {t('erp.automotive.assign')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <span className="hidden">{money(0)}</span>
    </Card>
  );
}
