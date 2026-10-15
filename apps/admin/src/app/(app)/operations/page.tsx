'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
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
import type { ProjectDto, ProjectTaskDto, WorkOrderDto } from '@oryx/shared';

type Tab = 'dashboard' | 'projects' | 'tasks' | 'work-orders' | 'approvals' | 'calendar' | 'notifications';

export default function OperationsPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.operations.dashboard') },
    { key: 'projects', label: t('erp.operations.projects') },
    { key: 'work-orders', label: t('erp.operations.workOrders') },
    { key: 'tasks', label: t('erp.operations.tasks') },
    { key: 'approvals', label: t('erp.operations.approvals') },
    { key: 'calendar', label: t('erp.operations.calendar') },
    { key: 'notifications', label: t('erp.operations.notifications') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="operations-page">
      <SectionHeader
        title={t('nav.operations')}
        subtitle={t('erp.operations.subtitle')}
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
            data-testid={`operations-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <DashboardTab /> : null}
      {tab === 'projects' ? <ProjectsTab canManage={can('erp.operations.project.manage')} /> : null}
      {tab === 'work-orders' ? <WorkOrdersTab canManage={can('erp.operations.work_order.manage')} /> : null}
      {tab === 'tasks' ? <TasksTab canManage={can('erp.operations.task.manage')} /> : null}
      {tab === 'approvals' ? <ApprovalsTab canManage={can('erp.operations.approval.manage')} /> : null}
      {tab === 'calendar' ? <CalendarTab /> : null}
      {tab === 'notifications' ? <NotificationsTab /> : null}
    </div>
  );
}

function DashboardTab() {
  const { t } = useUi();
  const data = useAsync(() => api.operationsDashboard(), []);
  if (data.loading) return <div className="p-4"><Skeleton height={160} /></div>;
  if (data.error) return <ErrorBanner message={data.error} onRetry={data.reload} />;
  const d = data.data!;
  return (
    <Card className="p-4" data-testid="operations-dashboard">
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label={t('erp.operations.totalProjects')} value={String(d.totalProjects)} />
        <Kpi label={t('erp.operations.activeProjects')} value={String(d.activeProjects)} />
        <Kpi label={t('erp.operations.openTasks')} value={String(d.openTasks)} />
        <Kpi label={t('erp.operations.overdueTasks')} value={String(d.overdueTasks)} />
        <Kpi label={t('erp.operations.totalWorkOrders')} value={String(d.totalWorkOrders)} />
        <Kpi label={t('erp.operations.pendingApprovals')} value={String(d.pendingApprovals)} />
        <Kpi label={t('erp.operations.upcomingEvents')} value={String(d.upcomingEvents)} />
      </div>
    </Card>
  );
}

function ProjectsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.operationsProjects(), []);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.operations.projects')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-project">
            <Icon name="plus" size={16} />
            {t('erp.operations.newProject')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.operations.emptyProjects')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.operations.tasksCount')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((p: ProjectDto) => (
              <tr key={p.id} data-testid={`project-row-${p.code}`}>
                <td className="font-mono text-[12px]">{p.code}</td>
                <td className="font-semibold">{p.nameEn}</td>
                <td className="tabular-nums text-[12.5px]">{p.taskCount ?? 0}</td>
                <td><StatusBadge status={p.status} label={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateProjectModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.createOperationsProject(form);
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={t('erp.operations.newProject')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={submit} data-testid="save-project">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required><input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="project-code" /></Field>
        <Field label={`${t('common.name')} (EN)`} required><input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="project-name-en" /></Field>
        <Field label={`${t('common.name')} (AR)`} required><input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="project-name-ar" /></Field>
      </div>
    </Modal>
  );
}

function WorkOrdersTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.workOrders(), []);
  const projects = useAsync(() => api.operationsProjects(), []);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const order = useAsync(() => (detail ? api.workOrder(detail) : Promise.resolve(null)), [detail]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.operations.workOrders')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-work-order">
            <Icon name="plus" size={16} />
            {t('erp.operations.newWorkOrder')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.operations.emptyWorkOrders')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.operations.orderNumber')}</th>
              <th>{t('erp.operations.title')}</th>
              <th>{t('erp.crm.priority')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((w: WorkOrderDto) => (
              <tr key={w.id} data-testid={`work-order-row-${w.orderNumber}`}>
                <td className="font-mono text-[12px]">{w.orderNumber}</td>
                <td className="text-[12.5px]">{w.title}</td>
                <td><Badge tone={w.priority === 'URGENT' ? 'danger' : 'neutral'}>{w.priority}</Badge></td>
                <td><StatusBadge status={w.status} label={w.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDetail(w.id)} data-testid={`view-work-order-${w.orderNumber}`}>{t('common.details')}</Button>
                    {canManage && w.status === 'OPEN' ? (
                      <Button size="sm" variant="primary" data-testid={`start-work-order-${w.orderNumber}`} onClick={async () => { await api.updateWorkOrder(w.id, { status: 'IN_PROGRESS' }); await list.reload(); }}>
                        {t('erp.operations.start')}
                      </Button>
                    ) : null}
                    {canManage && w.status === 'IN_PROGRESS' ? (
                      <Button size="sm" data-testid={`complete-work-order-${w.orderNumber}`} onClick={async () => { await api.updateWorkOrder(w.id, { status: 'COMPLETED' }); await list.reload(); }}>
                        {t('erp.operations.complete')}
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
        <div className="border-t border-[var(--border)] p-4" data-testid="work-order-detail">
          <div className="mb-3 flex items-center justify-between">
            <p className="oryx-panel-title m-0">{t('erp.operations.checklist')}</p>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}><Icon name="close" size={14} /></Button>
          </div>
          {order.loading ? <Skeleton height={80} /> : (
            <div className="flex flex-col gap-2">
              {(order.data?.checklist ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={c.isDone}
                    disabled={!canManage}
                    onChange={async () => { await api.toggleWorkOrderChecklist(c.id, !c.isDone); await order.reload(); }}
                    data-testid={`checklist-${c.id}`}
                  />
                  <span className={c.isDone ? 'line-through opacity-60' : ''}>{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <CreateWorkOrderModal open={open} projects={projects.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateWorkOrderModal({
  open,
  projects,
  onClose,
  onCreated,
}: {
  open: boolean;
  projects: Array<{ id: string; code: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', projectId: '', priority: 'NORMAL', checklist: '' });
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const checklist = form.checklist
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label) => ({ label }));
      await api.createWorkOrder({
        title: form.title,
        description: form.description || undefined,
        projectId: form.projectId || undefined,
        priority: form.priority,
        checklist: checklist.length > 0 ? checklist : undefined,
      });
      await onCreated();
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : t('common.error')); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={t('erp.operations.newWorkOrder')} onClose={onClose}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={submit} data-testid="save-work-order">{busy ? t('common.loading') : t('common.save')}</Button></>}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.operations.title')} required><input className="oryx-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="work-order-title" /></Field>
        <Field label={t('erp.operations.project')}>
          <select className="oryx-select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} data-testid="work-order-project">
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.crm.priority')}>
          <select className="oryx-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={t('erp.accounting.description')}>
          <input className="oryx-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label={t('erp.operations.checklistHint')}>
          <textarea className="oryx-input" rows={3} value={form.checklist} onChange={(e) => setForm({ ...form, checklist: e.target.value })} data-testid="work-order-checklist" />
        </Field>
      </div>
    </Modal>
  );
}

function TasksTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.operationsTasks(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.operations.tasks')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.operations.emptyTasks')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.operations.title')}</th>
              <th>{t('erp.crm.priority')}</th>
              <th>{t('erp.crm.dueAt')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((task: ProjectTaskDto) => (
              <tr key={task.id} data-testid={`task-row-${task.id}`}>
                <td className="text-[12.5px]">{task.title}</td>
                <td><Badge tone={task.priority === 'URGENT' ? 'danger' : 'neutral'}>{task.priority}</Badge></td>
                <td className="text-[12.5px]">{task.dueDate ? task.dueDate.slice(0, 10) : '—'}</td>
                <td><StatusBadge status={task.status} label={task.status} /></td>
                <td>
                  {canManage && task.status !== 'DONE' ? (
                    <Button size="sm" onClick={async () => { await api.updateOperationsTask(task.id, { status: 'DONE' }); await list.reload(); }}>{t('erp.operations.complete')}</Button>
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

function ApprovalsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.operationsApprovals(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.operations.approvals')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.operations.emptyApprovals')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.operations.entity')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((a) => (
              <tr key={String(a.id)} data-testid={`approval-row-${String(a.id)}`}>
                <td className="text-[12.5px]">{String(a.entityType)}</td>
                <td><StatusBadge status={String(a.status)} label={String(a.status)} /></td>
                <td>
                  {canManage && a.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button size="sm" data-testid={`approve-${String(a.id)}`} onClick={async () => { await api.decideApproval(String(a.id), 'APPROVED'); await list.reload(); }}>{t('erp.hr.approve')}</Button>
                      <Button size="sm" variant="danger" onClick={async () => { await api.decideApproval(String(a.id), 'REJECTED'); await list.reload(); }}>{t('erp.hr.reject')}</Button>
                    </div>
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

function CalendarTab() {
  const { t } = useUi();
  const list = useAsync(() => api.operationsCalendar(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.operations.calendar')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.operations.emptyCalendar')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.operations.title')}</th>
              <th>{t('erp.reports.from')}</th>
              <th>{t('erp.reports.to')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((e) => (
              <tr key={String(e.id)}>
                <td className="text-[12.5px]">{String(e.title)}</td>
                <td className="text-[12.5px]">{String(e.startAt).slice(0, 16).replace('T', ' ')}</td>
                <td className="text-[12.5px]">{String(e.endAt).slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function NotificationsTab() {
  const { t } = useUi();
  const list = useAsync(() => api.operationsNotifications(), []);
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.operations.notifications')}</p>
        <Button size="sm" onClick={async () => { await api.markNotificationsRead(); await list.reload(); }} data-testid="mark-notifications-read">
          {t('erp.operations.markAllRead')}
        </Button>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={100} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.operations.emptyNotifications')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.type')}</th>
              <th>{t('erp.operations.title')}</th>
              <th>{t('common.date')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((n) => (
              <tr key={String(n.id)}>
                <td><Badge tone="info">{String(n.type)}</Badge></td>
                <td className="text-[12.5px]">{String(n.title)}</td>
                <td className="text-[12.5px]">{String(n.createdAt).slice(0, 16).replace('T', ' ')}</td>
                <td>{n.readAt ? <Badge tone="neutral">{t('erp.operations.read')}</Badge> : <Badge tone="warning">{t('erp.operations.unread')}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
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
