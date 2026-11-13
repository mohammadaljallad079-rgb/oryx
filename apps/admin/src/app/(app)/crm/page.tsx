'use client';

import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, toMinorInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { ModuleDashboard } from '@/components/module-dashboard';
import { TabDeepLink } from '@/components/tab-deep-link';
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
import type { LeadDto, OpportunityDto, SupportTicketDto } from '@oryx/shared';

type Tab = 'dashboard' | 'leads' | 'opportunities' | 'tickets' | 'activities';

const TAB_KEYS = ['dashboard', 'leads', 'opportunities', 'tickets', 'activities'] as const;

export default function CrmPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <CrmInner />
    </Suspense>
  );
}

function CrmInner() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.crm.dashboard') },
    { key: 'leads', label: t('erp.crm.leads') },
    { key: 'opportunities', label: t('erp.crm.opportunities') },
    { key: 'tickets', label: t('erp.crm.tickets') },
    { key: 'activities', label: t('erp.crm.activities') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="crm-page">
      <TabDeepLink valid={TAB_KEYS} onSelect={setTab} />
      <SectionHeader
        title={t('nav.crm')}
        subtitle={t('erp.crm.subtitle')}
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
            data-testid={`crm-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <ModuleDashboard moduleKey="crm" testId="crm-dashboard" /> : null}
      {tab === 'leads' ? <LeadsTab canManage={can('erp.crm.lead.manage')} /> : null}
      {tab === 'opportunities' ? <OpportunitiesTab canManage={can('erp.crm.opportunity.manage')} canConvert={can('erp.crm.opportunity.convert')} /> : null}
      {tab === 'tickets' ? <TicketsTab canManage={can('erp.crm.ticket.manage')} /> : null}
      {tab === 'activities' ? <ActivitiesTab canManage={can('erp.crm.activity.manage')} /> : null}
    </div>
  );
}


function LeadsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadDto | null>(null);
  const list = useAsync(() => api.crmLeads({ search: search || undefined }), [search]);

  const setStatus = async (row: LeadDto, status: string) => {
    await api.updateLead(row.id, { status });
    await list.reload();
  };

  const removeLead = async (row: LeadDto) => {
    if (!window.confirm(t('erp.crm.confirmDeleteLead'))) return;
    setBusyId(row.id);
    try {
      await api.deleteLead(row.id);
      await list.reload();
    } catch (e) {
      window.alert(e instanceof ApiError && e.code === 'resource.conflict' ? t('erp.crm.deleteLeadBlocked') : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="lead-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-lead">
            <Icon name="plus" size={16} />
            {t('erp.crm.newLead')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.crm.emptyLeads')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.crm.contact')}</th>
              <th>{t('erp.crm.estimatedValue')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((l: LeadDto) => (
              <tr key={l.id} data-testid={`lead-row-${l.code}`}>
                <td className="font-mono text-[12px]">{l.code}</td>
                <td>
                  <span className="block font-semibold">{l.nameEn}</span>
                  <span className="oryx-faint block text-[11px]">{l.nameAr}</span>
                </td>
                <td className="text-[12.5px]">{l.contactName ?? l.email ?? l.phone ?? '—'}</td>
                <td className="tabular-nums text-[12.5px]">{money(l.estimatedValueMinor, l.currency)}</td>
                <td><StatusBadge status={l.status} label={l.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" aria-label={`${t('common.edit')} ${l.code}`} onClick={() => { setEditing(l); setOpen(true); }} data-testid={`lead-edit-${l.code}`}>
                          <Icon name="edit" size={14} />
                        </Button>
                        <select
                          className="oryx-select"
                          value={l.status}
                          onChange={(ev) => void setStatus(l, ev.target.value)}
                          aria-label={`${t('erp.crm.leadStatus')} ${l.code}`}
                          data-testid={`lead-status-${l.code}`}
                        >
                          {['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'].map((s) => (
                            <option key={s} value={s}>{t(`erp.crm.leadStatusValue.${s}` as const)}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === l.id}
                          aria-label={`${t('common.delete')} ${l.code}`}
                          onClick={() => void removeLead(l)}
                          data-testid={`lead-delete-${l.code}`}
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
      <LeadModal
        open={open}
        lead={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={list.reload}
      />
    </Card>
  );
}

function LeadModal({
  open,
  lead,
  onClose,
  onSaved,
}: {
  open: boolean;
  lead: LeadDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', contactName: '', email: '', phone: '', estimatedValue: '0.00', notes: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: lead?.code ?? '',
      nameEn: lead?.nameEn ?? '',
      nameAr: lead?.nameAr ?? '',
      contactName: lead?.contactName ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      estimatedValue: lead ? String(lead.estimatedValueMinor / 100) : '0.00',
      notes: '',
    });
  }, [open, lead]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        estimatedValueMinor: toMinorInput(form.estimatedValue),
        notes: form.notes || undefined,
      };
      if (lead) {
        await api.updateLead(lead.id, body);
      } else {
        await api.createLead({ ...body, code: form.code });
      }
      await onSaved();
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
      title={lead ? t('erp.crm.editLead') : t('erp.crm.newLead')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr || (!lead && !form.code)}
            onClick={submit}
            data-testid="save-lead"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} disabled={Boolean(lead)} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="lead-code" />
        </Field>
        <Field label={t('erp.crm.contact')}>
          <input className="oryx-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} data-testid="lead-contact" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="lead-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="lead-name-ar" />
        </Field>
        <Field label={t('erp.crm.estimatedValue')}>
          <input className="oryx-input" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} data-testid="lead-estimated-value" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="lead-phone" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="lead-email" />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="lead-notes" />
        </Field>
      </div>
    </Modal>
  );
}

function OpportunitiesTab({ canManage, canConvert }: { canManage: boolean; canConvert: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.crmOpportunities(), []);
  const pipelines = useAsync(() => api.crmPipelines(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const removeOpportunity = async (o: OpportunityDto) => {
    if (!window.confirm(t('erp.crm.confirmDeleteOpportunity'))) return;
    setBusyId(o.id);
    try {
      await api.deleteOpportunity(o.id);
      await list.reload();
    } catch (e) {
      window.alert(e instanceof ApiError && e.code === 'resource.conflict' ? t('erp.crm.deleteOpportunityBlocked') : t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.crm.opportunities')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-opportunity">
            <Icon name="plus" size={16} />
            {t('erp.crm.newOpportunity')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.crm.emptyOpportunities')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('erp.crm.title')}</th>
              <th>{t('erp.crm.stage')}</th>
              <th>{t('erp.crm.amount')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((o: OpportunityDto) => (
              <tr key={o.id} data-testid={`opportunity-row-${o.code}`}>
                <td className="font-mono text-[12px]">{o.code}</td>
                <td className="text-[12.5px]">{o.title}</td>
                <td>
                  <Badge tone="info">{o.stageNameEn ?? '—'}</Badge>
                  <span className="oryx-faint ml-1 text-[11px]">{(o.probabilityBp / 100).toFixed(0)}%</span>
                </td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(o.amountMinor, o.currency)}</td>
                <td><StatusBadge status={o.status} label={o.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {canConvert && o.status === 'WON' && !o.quotationId ? (
                      <Button size="sm" data-testid={`convert-opportunity-${o.code}`} onClick={async () => { await api.convertOpportunity(o.id); await list.reload(); }}>
                        {t('erp.crm.convert')}
                      </Button>
                    ) : o.quotationId ? (
                      <span className="oryx-faint text-[11.5px]">{t('erp.crm.converted')}</span>
                    ) : null}
                    {canManage && !o.quotationId ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === o.id}
                        aria-label={`${t('common.delete')} ${o.code}`}
                        onClick={() => void removeOpportunity(o)}
                        data-testid={`opportunity-delete-${o.code}`}
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
      <CreateOpportunityModal
        open={open}
        pipelines={pipelines.data?.items ?? []}
        customers={customers.data?.items ?? []}
        onClose={() => setOpen(false)}
        onCreated={list.reload}
      />
    </Card>
  );
}

function CreateOpportunityModal({
  open,
  pipelines,
  customers,
  onClose,
  onCreated,
}: {
  open: boolean;
  pipelines: Array<{ id: string; nameEn: string; stages: Array<{ id: string; nameEn: string }> }>;
  customers: Array<{ id: string; code: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', title: '', pipelineId: '', stageId: '', customerId: '', amount: '0.00' });

  const stages = pipelines.find((p) => p.id === form.pipelineId)?.stages ?? [];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createOpportunity({
        code: form.code,
        title: form.title,
        pipelineId: form.pipelineId,
        stageId: form.stageId || undefined,
        customerId: form.customerId || undefined,
        amountMinor: toMinorInput(form.amount),
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
      open={open}
      title={t('erp.crm.newOpportunity')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.pipelineId} onClick={submit} data-testid="save-opportunity">{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="opportunity-code" />
        </Field>
        <Field label={t('erp.crm.title')} required>
          <input className="oryx-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="opportunity-title" />
        </Field>
        <Field label={t('erp.crm.pipeline')} required>
          <select className="oryx-select" value={form.pipelineId} onChange={(e) => setForm({ ...form, pipelineId: e.target.value, stageId: '' })} data-testid="opportunity-pipeline">
            <option value="">—</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.crm.stage')}>
          <select className="oryx-select" value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
            <option value="">{t('erp.crm.default')}</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.sales.customer')}>
          <select className="oryx-select" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} data-testid="opportunity-customer">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.crm.amount')} required>
          <input className="oryx-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="opportunity-amount" />
        </Field>
      </div>
    </Modal>
  );
}

function TicketsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = useAsync(() => api.crmTickets({ search: search || undefined }), [search]);

  const removeTicket = async (k: SupportTicketDto) => {
    if (!window.confirm(t('erp.crm.confirmDeleteTicket'))) return;
    setBusyId(k.id);
    try {
      await api.deleteTicket(k.id);
      await list.reload();
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ticket-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-ticket">
            <Icon name="plus" size={16} />
            {t('erp.crm.newTicket')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.crm.emptyTickets')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.crm.ticketNumber')}</th>
              <th>{t('erp.crm.subject')}</th>
              <th>{t('erp.crm.priority')}</th>
              <th>{t('erp.crm.resolutionDue')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((k: SupportTicketDto) => (
              <tr key={k.id} data-testid={`ticket-row-${k.ticketNumber}`}>
                <td className="font-mono text-[12px]">{k.ticketNumber}</td>
                <td className="text-[12.5px]">{k.subject}</td>
                <td>
                  <Badge tone={k.priority === 'URGENT' || k.priority === 'HIGH' ? 'danger' : 'neutral'}>{k.priority}</Badge>
                </td>
                <td className="text-[12.5px]">{k.resolutionDueAt ? k.resolutionDueAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                <td><StatusBadge status={k.status} label={k.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {canManage && k.status !== 'RESOLVED' && k.status !== 'CLOSED' ? (
                      <Button size="sm" data-testid={`resolve-ticket-${k.ticketNumber}`} onClick={async () => { await api.updateTicket(k.id, { status: 'RESOLVED' }); await list.reload(); }}>
                        {t('erp.crm.resolve')}
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === k.id}
                        aria-label={`${t('common.delete')} ${k.ticketNumber}`}
                        onClick={() => void removeTicket(k)}
                        data-testid={`ticket-delete-${k.ticketNumber}`}
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
      <CreateTicketModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateTicketModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'NORMAL' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createTicket({ subject: form.subject, description: form.description || undefined, priority: form.priority });
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
      title={t('erp.crm.newTicket')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-ticket">{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3">
        <Field label={t('erp.crm.subject')} required>
          <input className="oryx-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="ticket-subject" />
        </Field>
        <Field label={t('erp.crm.priority')}>
          <select className="oryx-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={t('erp.accounting.description')}>
          <textarea className="oryx-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function ActivitiesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.crmActivities(), []);
  const [busyId, setBusyId] = useState<string | null>(null);

  const removeActivity = async (id: string) => {
    if (!window.confirm(t('erp.crm.confirmDeleteActivity'))) return;
    setBusyId(id);
    try {
      await api.deleteActivity(id);
      await list.reload();
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.crm.activities')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.crm.emptyActivities')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.type')}</th>
              <th>{t('erp.crm.subject')}</th>
              <th>{t('erp.crm.dueAt')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((a) => (
              <tr key={a.id} data-testid={`activity-row-${a.id}`}>
                <td><Badge tone="info">{a.type}</Badge></td>
                <td className="text-[12.5px]">{a.subject}</td>
                <td className="text-[12.5px]">{a.dueAt ? a.dueAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                <td><StatusBadge status={a.status} label={a.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {canManage && a.status === 'OPEN' ? (
                      <Button size="sm" onClick={async () => { await api.completeActivity(a.id); await list.reload(); }}>{t('erp.crm.complete')}</Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === a.id}
                        aria-label={`${t('common.delete')} ${a.subject}`}
                        onClick={() => void removeActivity(a.id)}
                        data-testid={`activity-delete-${a.id}`}
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
    </Card>
  );
}

