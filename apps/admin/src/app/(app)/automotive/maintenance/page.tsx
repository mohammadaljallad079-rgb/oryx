'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { minorToInput, money, qty, toBasisPoints, toMinorInput, toQuantityInput } from '@/lib/erp-format';
import { EntitySelect } from '@/components/entity-select';
import { EntityPicker } from '@/components/inline-create';
import { CustomerModal } from '@/components/customer-modal';
import { VehicleModal } from '@/components/entity-modals';
import { JobCardPrintActions } from '@/components/job-card-print';
import { DocumentPrintActions } from '@/components/document-print';
import { renderPrintDocument } from '@/lib/print-document';
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
import type { JobCardDto, MarketplaceProviderDto, ServiceRequestDto } from '@oryx/shared';

/**
 * The workshop (car maintenance) workspace.
 *
 * A landing dashboard shows the live state of the floor, and three tabs drive the
 * work itself: job cards (the workshop's spine), marketplace providers and
 * customer service requests. Every figure and row is resolved from the API; the
 * screen never invents a job or a request.
 *
 * The job-card detail dialog is the single place a vehicle moves through the
 * workshop: record diagnosis, add one or more service/part work items,
 * reserve and issue parts, then complete and invoice without an estimate approval.
 * Each operation calls the existing tenant-scoped API and financial ledger
 * holds no matter which control the operator uses.
 */

/**
 * Open a window in the user gesture (before the network request), create or
 * reuse the financial invoice and render it through the exact shared approved
 * ORYX sales invoice template. The print toolbar lets the user save a PDF.
 */
async function issueAndPreviewJobInvoice(jobId: string, locale: string): Promise<void> {
  const win = window.open('', '_blank', 'width=920,height=1040');
  if (!win) throw new Error('Allow popups to preview the invoice.');
  win.document.write('<!doctype html><html><head><title>Invoice</title></head><body>Preparing invoice…</body></html>');
  try {
    const result = await api.invoiceJobCard(jobId);
    if (!result.id) throw new Error('The invoice was issued but its document ID was not returned.');
    const document = await api.printDocument('SALES_INVOICE', result.id);
    const toolbar = '<div class="oryx-print-toolbar" style="position:fixed;top:0;left:0;right:0;z-index:10;padding:8px;background:#0a4175;text-align:end"><button onclick="window.print()" style="padding:8px 16px;background:white;color:#0a4175;border:0;cursor:pointer">Print / طباعة</button></div><style>@media screen{body{padding-top:44px}}@media print{.oryx-print-toolbar{display:none}}</style>';
    const html = renderPrintDocument(document, locale).replace('</body>', toolbar + '</body>');
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  } catch (error) {
    win.document.body.textContent = error instanceof Error ? error.message : 'Could not issue invoice.';
    throw error;
  }
}

type Tab = 'job-cards' | 'providers' | 'requests';

const JOB_STATUSES = [
  'DRAFT',
  'OPEN',
  'AWAITING_APPROVAL',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'CANCELLED',
] as const;

export default function MaintenancePage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('job-cards');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'job-cards', label: t('erp.automotive.jobCards') },
    { key: 'providers', label: t('erp.automotive.providers') },
    { key: 'requests', label: t('erp.automotive.serviceRequests') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="maintenance-page">
      <SectionHeader
        title={t('nav.automotive_maintenance')}
        subtitle={t('erp.automotive.maintenanceSubtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <WorkshopDashboard />

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
      {tab === 'providers' ? <ProvidersTab canManage={can('erp.marketplace.provider.manage')} /> : null}
      {tab === 'requests' ? <RequestsTab canManage={can('erp.marketplace.request.manage')} /> : null}
    </div>
  );
}

/**
 * The workshop landing dashboard. Counts come from a single endpoint so the
 * tiles never disagree with each other, and a reload follows every action that
 * changes a count.
 */
function WorkshopDashboard() {
  const { t } = useUi();
  const dashboard = useAsync(() => api.workshopDashboard(), []);

  const tiles: Array<{ key: string; label: string; value: number; icon: string; tone?: 'default' | 'gold' | 'success' | 'danger' }> = [
    { key: 'open', label: t('erp.automotive.ws.openJobCards'), value: dashboard.data?.openJobCards ?? 0, icon: 'wrench', tone: 'gold' },
    { key: 'approval', label: t('erp.automotive.ws.awaitingApproval'), value: dashboard.data?.awaitingApproval ?? 0, icon: 'clipboardCheck' },
    { key: 'completed', label: t('erp.automotive.ws.completedJobCards'), value: dashboard.data?.completedJobCards ?? 0, icon: 'check', tone: 'success' },
    { key: 'invoiced', label: t('erp.automotive.ws.invoicedJobCards'), value: dashboard.data?.invoicedJobCards ?? 0, icon: 'wallet' },
    { key: 'bookings', label: t('erp.automotive.ws.scheduledBookings'), value: dashboard.data?.scheduledBookings ?? 0, icon: 'calendar' },
    { key: 'parts', label: t('erp.automotive.ws.outstandingReservations'), value: dashboard.data?.outstandingReservations ?? 0, icon: 'package' },
  ];

  return (
    <div data-testid="workshop-dashboard">
      {dashboard.error ? <ErrorBanner message={dashboard.error} onRetry={dashboard.reload} /> : null}
      {dashboard.loading ? (
        <StatGrid>
          {tiles.map((x) => (
            <Skeleton key={x.key} height={64} />
          ))}
        </StatGrid>
      ) : (
        <StatGrid>
          {tiles.map((x) => (
            <StatCard key={x.key} icon={x.icon} label={x.label} value={x.value} tone={x.tone} data-testid={`ws-kpi-${x.key}`} />
          ))}
        </StatGrid>
      )}
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
  const { t, locale } = useUi();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const list = useAsync(
    () => api.jobCards({ ...(status ? { status } : {}), ...(search ? { search } : {}) }),
    [status, search],
  );
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const rows = list.data?.items ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="oryx-panel-title m-0">{t('erp.automotive.jobCards')}</p>
          <input
            className="oryx-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t('erp.automotive.jobNumber')} / ${t('erp.automotive.vehicle')}`}
            aria-label={t('common.search')}
            data-testid="job-search-filter"
          />
          <select
            className="oryx-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t('erp.automotive.ws.jobStatus')}
            data-testid="job-status-filter"
          >
            <option value="">{t('erp.automotive.ws.allStatuses')}</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`erp.automotive.ws.jobStatus.${s}`)}
              </option>
            ))}
          </select>
          {search || status ? (
            <Button
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('');
              }}
              data-testid="job-clear-filters"
            >
              <Icon name="refresh" size={14} />
              {t('users.clearFilters')}
            </Button>
          ) : null}
        </div>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-job-card">
            <Icon name="plus" size={16} />
            {t('erp.automotive.newJobCard')}
          </Button>
        ) : null}
      </div>

      <p className="oryx-muted m-0 px-4 pt-3 text-[12px]">{t('erp.automotive.ws.jobCardsHint')}</p>

      {list.error ? (
        <div className="p-4">
          <ErrorBanner message={list.error} onRetry={list.reload} />
        </div>
      ) : null}
      {list.loading ? (
        <div className="p-4">
          <Skeleton height={140} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyJobCards')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.jobNumber')}</th>
              <th>{t('erp.automotive.vehicle')}</th>
              <th>{t('erp.sales.customer')}</th>
              <th>{t('erp.automotive.ws.technician')}</th>
              <th>{t('erp.automotive.complaint')}</th>
              <th>{t('erp.automotive.ws.diagnosis')}</th>
              <th>{t('common.status')}</th>
              <th>{t('erp.automotive.ws.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j: JobCardDto) => (
              <tr key={j.id} data-testid={`job-row-${j.jobNumber}`}>
                <td className="font-mono text-[12px]">
                  {j.jobNumber}
                  <span className="oryx-faint block text-[11px]">{j.createdAt.slice(0, 10)}</span>
                </td>
                <td className="text-[12.5px]">
                  {j.make} {j.model}
                  <span className="oryx-faint block font-mono text-[11px]">{j.plateNumber ?? j.vin}</span>
                </td>
                <td className="text-[12.5px]">
                  {j.customerNameEn ?? '—'}
                  {j.customerPhone ? (
                    <span className="oryx-faint block font-mono text-[11px]">{j.customerPhone}</span>
                  ) : null}
                </td>
                <td className="text-[12.5px]">{j.technicianNameEn ?? '—'}</td>
                <td className="max-w-[200px] text-[12.5px]">{j.complaint ?? '—'}</td>
                <td className="max-w-[200px] text-[12.5px]">{j.diagnosis ?? '—'}</td>
                <td>
                  <StatusBadge status={j.status} label={t(`erp.automotive.ws.jobStatus.${j.status}`)} />
                </td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDetailId(j.id)} data-testid={`open-job-${j.jobNumber}`}>
                      {t('common.details')}
                    </Button>
                    <JobCardPrintActions id={j.id} customerName={j.customerNameEn ?? ''} />
                    {canInvoice && j.status === 'INVOICED' && j.invoiceId ? (
                      <DocumentPrintActions kind="SALES_INVOICE" id={j.invoiceId} compact />
                    ) : null}
                    {canManage && j.status === 'OPEN' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        data-testid={`progress-job-${j.jobNumber}`}
                        onClick={async () => {
                          await api.updateJobCard(j.id, { status: 'IN_PROGRESS' });
                          await list.reload();
                        }}
                      >
                        {t('erp.automotive.ws.startWork')}
                      </Button>
                    ) : null}
                    {canManage && j.status === 'IN_PROGRESS' ? (
                      <Button
                        size="sm"
                        data-testid={`complete-job-${j.jobNumber}`}
                        onClick={async () => {
                          await api.updateJobCard(j.id, { status: 'COMPLETED' });
                          await list.reload();
                        }}
                      >
                        {t('erp.automotive.ws.completeWork')}
                      </Button>
                    ) : null}
                    {canInvoice && j.status === 'COMPLETED' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        data-testid={`invoice-job-${j.jobNumber}`}
                        onClick={async () => {
                          await issueAndPreviewJobInvoice(j.id, locale);
                          await list.reload();
                        }}
                      >
                        {t('erp.automotive.ws.invoiceJob')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <CreateJobCardModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
      <JobCardDetailModal
        jobId={detailId}
        canManage={canManage}
        canEstimate={canEstimate}
        canInvoice={canInvoice}
        canReserve={canReserve}
        canIssue={canIssue}
        onClose={() => setDetailId(null)}
        onChanged={list.reload}
      />
    </Card>
  );
}

/** The shape the detail endpoint returns, narrowed to the fields this screen reads. */
interface JobCardDetail {
  id: string;
  jobNumber: string;
  status: string;
  complaint: string | null;
  diagnosis: string | null;
  odometer: number | null;
  invoiceId?: string | null;
  vehicle?: { vin: string; make: string; model: string; plateNumber: string | null } | null;
  labour?: Array<{ id: string; description: string; hours: number; rateMinor: number; amountMinor: number }>;
  estimates?: Array<{
    id: string;
    estimateNumber: string;
    status: string;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
    lines: Array<{ id: string; type: string; productId: string | null; description: string; quantity: number; unitPriceMinor: number; taxPercentBp: number; lineTotalMinor: number }>;
  }>;
  reservations?: Array<{
    id: string;
    status: string;
    warehouseId: string;
    lines: Array<{ id: string; productId: string; quantity: number; issuedQuantity: number }>;
  }>;
}

const EMPTY_WORK_ITEM_LINES: NonNullable<JobCardDetail['estimates']>[number]['lines'] = [];

function JobCardDetailModal({
  jobId,
  canManage,
  canEstimate,
  canInvoice,
  canReserve,
  canIssue,
  onClose,
  onChanged,
}: {
  jobId: string | null;
  canManage: boolean;
  canEstimate: boolean;
  canInvoice: boolean;
  canReserve: boolean;
  canIssue: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const detail = useAsync<JobCardDetail | null>(
    () => (jobId ? (api.jobCard(jobId) as unknown as Promise<JobCardDetail>) : Promise.resolve(null)),
    [jobId],
  );
  const [diagnosis, setDiagnosis] = useState('');
  const [diagnosisSeeded, setDiagnosisSeeded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);

  const job = detail.data;
  // Seed the diagnosis editor once the record loads, without clobbering a draft
  // the operator is already typing.
  if (job && diagnosisSeeded !== job.id) {
    setDiagnosis(job.diagnosis ?? '');
    setDiagnosisSeeded(job.id);
  }

  const refresh = useCallback(async () => {
    await detail.reload();
    await onChanged();
  }, [detail, onChanged]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const latestEstimate = job?.estimates?.[0] ?? null;

  return (
    <Modal
      open={Boolean(jobId)}
      title={job ? `${t('erp.automotive.jobNumber')} ${job.jobNumber}` : t('erp.automotive.jobCards')}
      onClose={() => {
        setDiagnosisSeeded(null);
        onClose();
      }}
      size="document"
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {detail.loading || !job ? (
        <Skeleton height={260} />
      ) : (
        <div className="flex flex-col gap-4" data-testid="job-detail">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className="oryx-label">{t('erp.automotive.vehicle')}</span>
              <p className="m-0 text-[13px]">
                {job.vehicle?.make} {job.vehicle?.model}
                <span className="oryx-faint block font-mono text-[11px]">{job.vehicle?.plateNumber ?? job.vehicle?.vin}</span>
              </p>
            </div>
            <div>
              <span className="oryx-label">{t('erp.automotive.odometer')}</span>
              <p className="m-0 text-[13px]">{job.odometer ?? '—'}</p>
            </div>
            <div>
              <span className="oryx-label">{t('common.status')}</span>
              <p className="m-0">
                <StatusBadge status={job.status} label={t(`erp.automotive.ws.jobStatus.${job.status}`)} />
              </p>
            </div>
          </div>

          <div>
            <span className="oryx-label">{t('erp.automotive.complaint')}</span>
            <p className="m-0 text-[13px]">{job.complaint ?? '—'}</p>
          </div>

          {/* Diagnosis — the operator's own record of the fault. */}
          <div>
            <Field label={t('erp.automotive.ws.diagnosis')}>
              <textarea
                className="oryx-input"
                rows={2}
                value={diagnosis}
                disabled={!canManage}
                onChange={(e) => setDiagnosis(e.target.value)}
                data-testid="job-diagnosis"
              />
            </Field>
            {canManage ? (
              <Button
                size="sm"
                className="mt-2"
                disabled={busy}
                data-testid="save-diagnosis"
                onClick={() => act(() => api.updateJobCard(job.id, { diagnosis }))}
              >
                {t('erp.automotive.ws.saveDiagnosis')}
              </Button>
            ) : null}
          </div>

          {/* Estimates. */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="oryx-label m-0">{locale === 'ar' ? 'بنود العمل (خدمات وقطع)' : 'Work items (services and parts)'}</span>
              {canEstimate && !['COMPLETED', 'INVOICED', 'CANCELLED'].includes(job.status) ? (
                <Button size="sm" onClick={() => setEstimateOpen(true)} data-testid="new-estimate">
                  <Icon name="plus" size={14} />
                  {t('erp.automotive.ws.addLine')}
                </Button>
              ) : null}
            </div>
            {!latestEstimate ? (
              <p className="oryx-muted m-0 text-[12px]">{locale === 'ar' ? 'لم تُضف بنود بعد.' : 'No work items added yet.'}</p>
            ) : (
              <div className="rounded-[10px] border border-[var(--border)] p-3" data-testid="job-estimate">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[12px]">{latestEstimate.estimateNumber}</span>

                </div>
                <TableShell>
                  <thead>
                    <tr>
                      <th>{t('erp.automotive.ws.lineType')}</th>
                      <th>{t('erp.accounting.description')}</th>
                      <th>{t('erp.inventory.quantity')}</th>
                      <th>{t('erp.sales.unitPrice')}</th>
                      <th>{t('erp.automotive.ws.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestEstimate.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <Badge tone="info">{t(`erp.automotive.ws.lineType.${l.type}`)}</Badge>
                        </td>
                        <td className="text-[12.5px]">{l.description}</td>
                        <td className="tabular-nums text-[12.5px]">{qty(l.quantity)}</td>
                        <td className="tabular-nums text-[12.5px]">{money(l.unitPriceMinor)}</td>
                        <td className="tabular-nums text-[12.5px]">{money(l.lineTotalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                <div className="mt-2 flex flex-col items-end gap-1 text-[12.5px]">
                  <div className="flex w-[220px] justify-between">
                    <span>{t('erp.automotive.ws.subtotal')}</span>
                    <span className="tabular-nums">{money(latestEstimate.subtotalMinor)}</span>
                  </div>
                  <div className="flex w-[220px] justify-between">
                    <span>{t('erp.automotive.ws.tax')}</span>
                    <span className="tabular-nums">{money(latestEstimate.taxMinor)}</span>
                  </div>
                  <div className="flex w-[220px] justify-between border-t border-[var(--border)] pt-1 font-bold">
                    <span>{t('erp.automotive.ws.total')}</span>
                    <span className="tabular-nums">{money(latestEstimate.totalMinor)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Parts reservations. */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="oryx-label m-0">{t('erp.automotive.ws.parts')}</span>
              {canReserve ? (
                <Button size="sm" onClick={() => setReserveOpen(true)} data-testid="reserve-job">
                  <Icon name="plus" size={14} />
                  {t('erp.automotive.ws.reserveParts')}
                </Button>
              ) : null}
            </div>
            {(job.reservations?.length ?? 0) === 0 ? (
              <p className="oryx-muted m-0 text-[12px]">{t('erp.automotive.ws.noRows')}</p>
            ) : (
              <TableShell>
                <thead>
                  <tr>
                    <th>{t('common.code')}</th>
                    <th>{t('erp.inventory.quantity')}</th>
                    <th>{t('erp.automotive.ws.reservationStatus')}</th>
                    <th>{t('erp.automotive.ws.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {job.reservations!.map((r) => (
                    <tr key={r.id} data-testid={`reservation-${r.id.slice(-6)}`}>
                      <td className="font-mono text-[12px]">{r.id.slice(-6)}</td>
                      <td className="tabular-nums text-[12.5px]">{r.lines.length}</td>
                      <td>
                        <StatusBadge
                          status={r.status}
                          label={t(`erp.automotive.ws.reservationStatus.${r.status}`)}
                        />
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {canIssue && (r.status === 'RESERVED' || r.status === 'PARTIALLY_ISSUED') ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy}
                              data-testid={`issue-reservation-${r.id.slice(-6)}`}
                              onClick={() => act(() => api.issuePartReservation(r.id))}
                            >
                              {t('erp.automotive.ws.issueParts')}
                            </Button>
                          ) : null}
                          {canReserve && (r.status === 'RESERVED' || r.status === 'PARTIALLY_ISSUED') ? (
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy}
                              data-testid={`cancel-reservation-${r.id.slice(-6)}`}
                              onClick={() => act(() => api.cancelPartReservation(r.id))}
                            >
                              {t('erp.automotive.ws.cancelReservation')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </div>

          {/* Lifecycle controls. */}
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
            {canManage && ['OPEN', 'APPROVED'].includes(job.status) ? (
              <Button size="sm" variant="primary" disabled={busy} data-testid="start-work"
                onClick={() => act(() => api.updateJobCard(job.id, { status: 'IN_PROGRESS' }))}>
                {t('erp.automotive.ws.startWork')}
              </Button>
            ) : null}
            {canManage && job.status === 'IN_PROGRESS' ? (
              <Button
                size="sm"
                disabled={busy}
                data-testid="complete-work"
                onClick={() => act(() => api.updateJobCard(job.id, { status: 'COMPLETED' }))}
              >
                {t('erp.automotive.ws.completeWork')}
              </Button>
            ) : null}
            {canInvoice && job.status === 'INVOICED' && job.invoiceId ? (
              <DocumentPrintActions kind="SALES_INVOICE" id={job.invoiceId} />
            ) : null}
            {canInvoice && job.status === 'COMPLETED' ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                data-testid="invoice-job"
                onClick={() => act(() => issueAndPreviewJobInvoice(job.id, locale))}
              >
                {t('erp.automotive.ws.invoiceJob')}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {job ? (
        <>
          <CreateEstimateModal
            open={estimateOpen}
            jobId={job.id}
            initialLines={latestEstimate?.lines ?? EMPTY_WORK_ITEM_LINES}
            onClose={() => setEstimateOpen(false)}
            onCreated={refresh}
          />
          <ReservePartsModal open={reserveOpen} jobId={job.id} onClose={() => setReserveOpen(false)} onCreated={refresh} />
        </>
      ) : null}
    </Modal>
  );
}

/** A single editable estimate line. */
interface EstimateLineDraft {
  type: 'PART' | 'SERVICE';
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

function emptyLine(): EstimateLineDraft {
  return { type: 'SERVICE', productId: '', description: '', quantity: '1', unitPrice: '0.000', taxRate: '10' };
}

function CreateEstimateModal({
  open,
  jobId,
  initialLines,
  onClose,
  onCreated,
}: {
  open: boolean;
  jobId: string;
  initialLines: NonNullable<JobCardDetail['estimates']>[number]['lines'];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<EstimateLineDraft[]>([emptyLine()]);
  useEffect(() => {
    if (!open) return;
    setLines(initialLines.length ? initialLines.map((line) => ({
      type: line.type === 'PART' ? 'PART' : 'SERVICE',
      productId: line.productId ?? '',
      description: line.description,
      quantity: String(line.quantity / 10000),
      unitPrice: minorToInput(line.unitPriceMinor),
      taxRate: String(line.taxPercentBp / 100),
    })) : [emptyLine()]);
  }, [open, initialLines]);

  const patch = (index: number, next: Partial<EstimateLineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...next } : l)));

  const valid = lines.every((l) => l.description.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveWorkItems(jobId, {
        lines: lines.map((l) => ({
          type: l.type,
          productId: l.productId || undefined,
          description: l.description.trim(),
          quantity: toQuantityInput(l.quantity),
          unitPriceMinor: toMinorInput(l.unitPrice),
          taxPercentBp: toBasisPoints(l.taxRate),
        })),
      });
      await onCreated();
      setLines([emptyLine()]);
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
      title={locale === 'ar' ? 'إضافة بنود العمل' : 'Add work items'}
      onClose={onClose}
      size="document"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !valid} onClick={submit} data-testid="save-estimate">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-[10px] border border-[var(--border)] p-3 sm:grid-cols-2"
            data-testid={`estimate-line-${index}`}
          >
            <Field label={t('erp.automotive.ws.lineType')}>
              <select
                className="oryx-input"
                value={line.type}
                onChange={(e) => patch(index, { type: e.target.value as EstimateLineDraft['type'] })}
                data-testid={`estimate-type-${index}`}
              >
                {(['SERVICE', 'PART'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`erp.automotive.ws.lineType.${v}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('erp.inventory.product')}>
              <EntitySelect
                catalogue="product"
                allowCreate
                value={line.productId || null}
                onChange={(v) => patch(index, { productId: v ?? '' })}
                onSelectData={(data) =>
                  patch(index, {
                    productId: String(data.id ?? ''),
                    description: line.description || String(data.nameEn ?? ''),
                    unitPrice: minorToInput(Number(data.salesPriceMinor ?? 0)),
                    taxRate: String(Number(data.taxRateBp ?? 0) / 100),
                  })
                }
                placeholder={t('common.select')}
                emptyLabel={t('common.select')}
                testId={`estimate-product-${index}`}
              />
            </Field>
            <Field label={t('erp.accounting.description')} required>
              <input
                className="oryx-input"
                value={line.description}
                onChange={(e) => patch(index, { description: e.target.value })}
                data-testid={`estimate-description-${index}`}
              />
            </Field>
            <Field label={t('erp.inventory.quantity')} required>
              <input
                className="oryx-input"
                value={line.quantity}
                onChange={(e) => patch(index, { quantity: e.target.value })}
                data-testid={`estimate-quantity-${index}`}
              />
            </Field>
            <Field label={t('erp.sales.unitPrice')} required>
              <input
                className="oryx-input"
                value={line.unitPrice}
                onChange={(e) => patch(index, { unitPrice: e.target.value })}
                data-testid={`estimate-price-${index}`}
              />
            </Field>
            <Field label={`${t('erp.automotive.ws.tax')} %`}>
              <input
                className="oryx-input"
                value={line.taxRate}
                onChange={(e) => patch(index, { taxRate: e.target.value })}
                data-testid={`estimate-tax-${index}`}
              />
            </Field>
            {lines.length > 1 ? (
              <div className="sm:col-span-2">
                <Button
                  size="sm"
                  variant="danger"
                  data-testid={`remove-line-${index}`}
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        <div>
          <Button size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])} data-testid="add-estimate-line">
            <Icon name="plus" size={14} />
            {t('erp.automotive.ws.addLine')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReservePartsModal({
  open,
  jobId,
  onClose,
  onCreated,
}: {
  open: boolean;
  jobId: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ productId: '', warehouseId: '', quantity: '1' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createPartReservation({
        jobCardId: jobId,
        warehouseId: form.warehouseId,
        lines: [{ productId: form.productId, quantity: toQuantityInput(form.quantity) }],
      });
      await onCreated();
      setForm({ productId: '', warehouseId: '', quantity: '1' });
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
      title={t('erp.automotive.ws.reserveParts')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.productId || !form.warehouseId}
            onClick={submit}
            data-testid="save-reservation"
          >
            {busy ? t('common.loading') : t('erp.automotive.ws.reserveParts')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.product')} required>
          <EntitySelect
            catalogue="product"
            allowCreate
            value={form.productId || null}
            onChange={(v) => setForm({ ...form, productId: v ?? '' })}
            placeholder={t('common.select')}
            testId="reserve-product"
          />
        </Field>
        <Field label={t('erp.automotive.ws.warehouse')} required>
          <EntitySelect
            catalogue="warehouse"
            allowCreate
            value={form.warehouseId || null}
            onChange={(v) => setForm({ ...form, warehouseId: v ?? '' })}
            placeholder={t('common.select')}
            testId="reserve-warehouse"
          />
        </Field>
        <Field label={t('erp.inventory.quantity')} required>
          <input
            className="oryx-input"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            data-testid="reserve-quantity"
          />
        </Field>
      </div>
    </Modal>
  );
}

function CreateJobCardModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const { companyId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState({
    vehicleId: '',
    complaint: '',
    diagnosis: '',
    technicianUserId: '',
    branchId: '',
  });
  const branches = useAsync(
    () => (companyId ? api.listBranches(companyId, { pageSize: 100 }) : Promise.resolve(null)),
    [companyId],
  );
  const technicians = useAsync(
    () => (companyId ? api.listUsers(companyId, { pageSize: 100 }).catch(() => null) : Promise.resolve(null)),
    [companyId],
  );
  // The vehicle catalogue is fetched unfiltered so the inline-create flow can
  // reload it after a new vehicle is saved; the list is narrowed to the chosen
  // customer's vehicles below, which also stops a job being raised against a
  // vehicle that belongs to someone else.
  const vehicles = useAsync(
    () => (companyId ? api.vehicles({ companyId, pageSize: 200 }).catch(() => null) : Promise.resolve(null)),
    [companyId],
  );
  const customerOptions = useAsync(
    () => api.salesCustomers({ companyId: companyId ?? undefined, search: undefined }).catch(() => null),
    [companyId],
  );
  // Choosing a customer narrows the picker to that customer's vehicles; with no
  // customer chosen the whole company catalogue is offered, so a job can still
  // be raised directly against a known vehicle.
  const vehicleOptions = useMemo(() => {
    const all = vehicles.data?.items ?? [];
    return customerId ? all.filter((v) => v.customerId === customerId) : all;
  }, [vehicles.data, customerId]);

  const reset = () => {
    setCustomerId('');
    setForm({
      vehicleId: '',
      complaint: '',
      diagnosis: '',
      technicianUserId: '',
      branchId: '',
    });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createJobCard({
        vehicleId: form.vehicleId,
        complaint: form.complaint || undefined,
        diagnosis: form.diagnosis || undefined,
        technicianUserId: form.technicianUserId || undefined,
        branchId: form.branchId || undefined,
      });
      await onCreated();
      reset();
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
      title={t('erp.automotive.newJobCard')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.vehicleId}
            onClick={submit}
            data-testid="save-job-card"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.customer')} required>
          <EntityPicker
            value={customerId || null}
            options={(customerOptions.data?.items ?? []).map((c) => ({
              value: c.id,
              label: c.nameEn || c.nameAr || c.code,
              hint: c.phone ?? undefined,
            }))}
            onChange={(v) => {
              setCustomerId(v ?? '');
              // The previously chosen vehicle may belong to a different
              // customer, so it is cleared whenever the customer changes.
              setForm((f) => ({ ...f, vehicleId: '' }));
            }}
            placeholder={t('common.select')}
            testId="job-card-customer"
            createLabel={t('erp.sales.newCustomer')}
            reloadOptions={customerOptions.reload}
            renderCreate={({ onClose: closeCreate, onSaved }) => (
              <CustomerModal
                open
                customer={null}
                onClose={closeCreate}
                onCreated={() => undefined}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('erp.automotive.vehicle')} required>
          <EntityPicker
            value={form.vehicleId || null}
            options={vehicleOptions.map((v) => ({ value: v.id, label: `${v.vin} — ${v.make} ${v.model}` }))}
            onChange={(v) => setForm({ ...form, vehicleId: v ?? '' })}
            placeholder={t('common.select')}
            testId="job-vehicle"
            createLabel={t('erp.automotive.newVehicle')}
            reloadOptions={vehicles.reload}
            renderCreate={({ onClose: closeCreate, onSaved }) => (
              <VehicleModal
                open
                customers={(customerOptions.data?.items ?? []).map((c) => ({
                  id: c.id,
                  code: c.code,
                  nameEn: c.nameEn,
                  nameAr: c.nameAr,
                }))}
                defaultCustomerId={customerId}
                onCustomerCreated={customerOptions.reload}
                onClose={closeCreate}
                onCreated={() => undefined}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('erp.automotive.ws.technician')}>
          <select
            className="oryx-input"
            value={form.technicianUserId}
            onChange={(e) => setForm({ ...form, technicianUserId: e.target.value })}
            data-testid="job-technician"
          >
            <option value="">{t('common.select')}</option>
            {(technicians.data?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullNameEn || u.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('erp.automotive.branch')}>
          <select
            className="oryx-input"
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            data-testid="job-branch"
          >
            <option value="">{t('common.select')}</option>
            {(branches.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameEn}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('erp.automotive.complaint')}>
          <textarea
            className="oryx-input min-h-[70px]"
            value={form.complaint}
            onChange={(e) => setForm({ ...form, complaint: e.target.value })}
            data-testid="job-complaint"
          />
        </Field>
        <Field label={t('erp.automotive.ws.diagnosis')}>
          <textarea
            className="oryx-input min-h-[70px]"
            value={form.diagnosis}
            onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
            data-testid="job-diagnosis"
          />
        </Field>
      </div>
    </Modal>
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
      <p className="oryx-muted m-0 px-4 pt-3 text-[12px]">{t('erp.automotive.ws.providersHint')}</p>
      {list.error ? (
        <div className="p-4">
          <ErrorBanner message={list.error} onRetry={list.reload} />
        </div>
      ) : null}
      {list.loading ? (
        <div className="p-4">
          <Skeleton height={100} />
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyProviders')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.automotive.commission')}</th>
              <th>{t('common.status')}</th>
              <th>{t('erp.automotive.ws.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((p: MarketplaceProviderDto) => (
              <tr key={p.id} data-testid={`provider-row-${p.code}`}>
                <td className="font-mono text-[12px]">{p.code}</td>
                <td className="text-[12.5px]">{p.nameEn}</td>
                <td className="text-[12.5px]">{(p.commissionPercentBp / 100).toFixed(2)}%</td>
                <td>
                  <StatusBadge status={p.status} label={p.status} />
                </td>
                <td>
                  {canManage && p.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        data-testid={`approve-provider-${p.code}`}
                        onClick={async () => {
                          await api.decideProvider(p.id, 'APPROVED');
                          await list.reload();
                        }}
                      >
                        {t('erp.hr.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await api.decideProvider(p.id, 'REJECTED');
                          await list.reload();
                        }}
                      >
                        {t('erp.hr.reject')}
                      </Button>
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

function CreateProviderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', categoryKey: 'WORKSHOP', commission: '10' });
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createProvider({ ...form, commissionPercentBp: Math.round(Number(form.commission) * 100) });
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
      open={open}
      title={t('erp.automotive.newProvider')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-provider">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input
            className="oryx-input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            data-testid="provider-code"
          />
        </Field>
        <Field label={t('erp.automotive.commission')}>
          <input
            className="oryx-input"
            value={form.commission}
            onChange={(e) => setForm({ ...form, commission: e.target.value })}
          />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input
            className="oryx-input"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            data-testid="provider-name-en"
          />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input
            className="oryx-input"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            data-testid="provider-name-ar"
          />
        </Field>
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
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.automotive.serviceRequests')}</p>
      </div>
      <p className="oryx-muted m-0 px-4 pt-3 text-[12px]">{t('erp.automotive.ws.requestsHint')}</p>
      {list.error ? (
        <div className="p-4">
          <ErrorBanner message={list.error} onRetry={list.reload} />
        </div>
      ) : null}
      {list.loading ? (
        <div className="p-4">
          <Skeleton height={100} />
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.automotive.emptyRequests')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.automotive.requestNumber')}</th>
              <th>{t('erp.automotive.category')}</th>
              <th>{t('erp.automotive.provider')}</th>
              <th>{t('common.status')}</th>
              <th>{t('erp.automotive.ws.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((r: ServiceRequestDto) => (
              <tr key={r.id} data-testid={`request-row-${r.requestNumber}`}>
                <td className="font-mono text-[12px]">{r.requestNumber}</td>
                <td>
                  <Badge tone="info">{r.categoryKey}</Badge>
                </td>
                <td className="text-[12.5px]">{r.provider?.nameEn ?? '—'}</td>
                <td>
                  <StatusBadge status={r.status} label={r.status} />
                </td>
                <td>
                  {canManage && r.status === 'NEW' && (providers.data?.items.length ?? 0) > 0 ? (
                    <Button
                      size="sm"
                      data-testid={`assign-request-${r.requestNumber}`}
                      onClick={async () => {
                        await api.assignServiceRequest(r.id, providers.data!.items[0].id);
                        await list.reload();
                      }}
                    >
                      {t('erp.automotive.assign')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}
