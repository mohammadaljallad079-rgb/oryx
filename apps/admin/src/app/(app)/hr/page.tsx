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
import type { EmployeeDto, LeaveRequestDto, PayrollRunDto } from '@oryx/shared';

type Tab = 'dashboard' | 'employees' | 'leave' | 'attendance' | 'payroll' | 'advances';

export default function HrPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.hr.dashboard') },
    { key: 'employees', label: t('erp.hr.employees') },
    { key: 'leave', label: t('erp.hr.leave') },
    { key: 'attendance', label: t('erp.hr.attendance') },
    { key: 'payroll', label: t('erp.hr.payroll') },
    { key: 'advances', label: t('erp.hr.advances') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="hr-page">
      <SectionHeader
        title={t('nav.human_resources')}
        subtitle={t('erp.hr.subtitle')}
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
            data-testid={`hr-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <DashboardTab /> : null}
      {tab === 'employees' ? <EmployeesTab canManage={can('erp.hr.employee.manage')} /> : null}
      {tab === 'leave' ? <LeaveTab canRequest={can('erp.hr.leave.request')} canApprove={can('erp.hr.leave.approve')} /> : null}
      {tab === 'attendance' ? <AttendanceTab canManage={can('erp.hr.attendance.manage')} /> : null}
      {tab === 'payroll' ? <PayrollTab canRun={can('erp.hr.payroll.run')} canApprove={can('erp.hr.payroll.approve')} /> : null}
      {tab === 'advances' ? <AdvancesTab canManage={can('erp.hr.advance.manage')} /> : null}
    </div>
  );
}

function DashboardTab() {
  const { t } = useUi();
  const data = useAsync(() => api.hrDashboard(), []);
  if (data.loading) return <div className="p-4"><Skeleton height={160} /></div>;
  if (data.error) return <ErrorBanner message={data.error} onRetry={data.reload} />;
  const d = data.data!;
  return (
    <Card className="p-4" data-testid="hr-dashboard">
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label={t('erp.hr.totalEmployees')} value={String(d.totalEmployees)} />
        <Kpi label={t('erp.hr.active')} value={String(d.activeEmployees)} />
        <Kpi label={t('erp.hr.onLeave')} value={String(d.onLeaveEmployees)} />
        <Kpi label={t('erp.hr.pendingLeave')} value={String(d.pendingLeaveRequests)} />
        <Kpi label={t('erp.hr.departments')} value={String(d.departmentCount)} />
      </div>
      {d.latestPayroll ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-[13px]">
          <span className="oryx-muted">{t('erp.hr.latestPayroll')}: </span>
          <span className="font-semibold">{d.latestPayroll.runNumber}</span>{' '}
          <Badge tone="info">{d.latestPayroll.status}</Badge>{' '}
          <span className="tabular-nums">{money(d.latestPayroll.netMinor)}</span>
        </div>
      ) : null}
    </Card>
  );
}

function EmployeesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.hrEmployees({ search: search || undefined }), [search]);
  const departments = useAsync(() => api.hrDepartments(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="employee-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-employee">
            <Icon name="plus" size={16} />
            {t('erp.hr.newEmployee')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.emptyEmployees')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.hr.department')}</th>
              <th>{t('erp.hr.jobTitle')}</th>
              <th>{t('erp.hr.hireDate')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((e: EmployeeDto) => (
              <tr key={e.id} data-testid={`employee-row-${e.code}`}>
                <td className="font-mono text-[12px]">{e.code}</td>
                <td>
                  <span className="block font-semibold">{e.fullNameEn}</span>
                  <span className="oryx-faint block text-[11px]">{e.fullNameAr}</span>
                </td>
                <td className="text-[12.5px]">{e.departmentNameEn ?? '—'}</td>
                <td className="text-[12.5px]">{e.jobTitleNameEn ?? '—'}</td>
                <td className="text-[12.5px]">{e.hireDate.slice(0, 10)}</td>
                <td><StatusBadge status={e.status} label={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateEmployeeModal open={open} departments={departments.data?.items ?? []} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateEmployeeModal({
  open,
  departments,
  onClose,
  onCreated,
}: {
  open: boolean;
  departments: Array<{ id: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', fullNameEn: '', fullNameAr: '', email: '', departmentId: '', hireDate: new Date().toISOString().slice(0, 10) });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createEmployee({
        code: form.code,
        fullNameEn: form.fullNameEn,
        fullNameAr: form.fullNameAr,
        email: form.email || undefined,
        departmentId: form.departmentId || undefined,
        hireDate: form.hireDate,
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
      title={t('erp.hr.newEmployee')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-employee">{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="employee-code" />
        </Field>
        <Field label={t('erp.hr.department')}>
          <select className="oryx-select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}
          </select>
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} data-testid="employee-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} data-testid="employee-name-ar" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t('erp.hr.hireDate')} required>
          <input type="date" className="oryx-input" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function LeaveTab({ canRequest, canApprove }: { canRequest: boolean; canApprove: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.leaveRequests(), []);
  const employees = useAsync(() => api.hrEmployees(), []);
  const types = useAsync(() => api.leaveTypes(), []);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.hr.leave')}</p>
        {canRequest ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-leave-request">
            <Icon name="plus" size={16} />
            {t('erp.hr.newLeave')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.emptyLeave')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.hr.employee')}</th>
              <th>{t('erp.hr.leaveType')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.hr.days')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((r: LeaveRequestDto) => (
              <tr key={r.id} data-testid={`leave-row-${r.id}`}>
                <td className="text-[12.5px]">{r.employeeNameEn} ({r.employeeCode})</td>
                <td className="text-[12.5px]">{r.leaveTypeNameEn}</td>
                <td className="text-[12.5px]">{r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}</td>
                <td className="tabular-nums text-[12.5px]">{(r.days / 100).toFixed(2)}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  {canApprove && r.status === 'SUBMITTED' ? (
                    <div className="flex gap-2">
                      <Button size="sm" data-testid={`approve-leave-${r.id}`} onClick={async () => { await api.decideLeave(r.id, 'APPROVED'); await list.reload(); }}>
                        {t('erp.hr.approve')}
                      </Button>
                      <Button size="sm" variant="danger" onClick={async () => { await api.decideLeave(r.id, 'REJECTED'); await list.reload(); }}>
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
      <LeaveRequestModal
        open={open}
        employees={employees.data?.items ?? []}
        types={types.data?.items ?? []}
        onClose={() => setOpen(false)}
        onCreated={list.reload}
      />
    </Card>
  );
}

function LeaveRequestModal({
  open,
  employees,
  types,
  onClose,
  onCreated,
}: {
  open: boolean;
  employees: Array<{ id: string; code: string; fullNameEn: string }>;
  types: Array<{ id: string; nameEn: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.requestLeave({
        employeeId: form.employeeId,
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
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
      title={t('erp.hr.newLeave')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-leave">{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.hr.employee')} required>
          <select className="oryx-select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} data-testid="leave-employee">
            <option value="">—</option>
            {employees.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.fullNameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.hr.leaveType')} required>
          <select className="oryx-select" value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} data-testid="leave-type">
            <option value="">—</option>
            {types.map((x) => <option key={x.id} value={x.id}>{x.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.reports.from')} required>
          <input type="date" className="oryx-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="leave-start" />
        </Field>
        <Field label={t('erp.reports.to')} required>
          <input type="date" className="oryx-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="leave-end" />
        </Field>
      </div>
    </Modal>
  );
}

function AttendanceTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.hrAttendance(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.hr.attendance')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.emptyAttendance')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.hr.employee')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.hr.workedMinutes')}</th>
              <th>{t('erp.hr.overtime')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((a) => (
              <tr key={a.id} data-testid={`attendance-row-${a.id}`}>
                <td className="text-[12.5px]">{a.employeeNameEn}</td>
                <td className="text-[12.5px]">{a.workDate.slice(0, 10)}</td>
                <td className="tabular-nums text-[12.5px]">{a.workedMinutes}</td>
                <td className="tabular-nums text-[12.5px]">{a.overtimeMinutes}</td>
                <td><StatusBadge status={a.status} label={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <span className="hidden">{canManage ? '1' : '0'}</span>
    </Card>
  );
}

function PayrollTab({ canRun, canApprove }: { canRun: boolean; canApprove: boolean }) {
  const { t } = useUi();
  const runs = useAsync(() => api.payrollRuns(), []);
  const periods = useAsync(() => api.payrollPeriods(), []);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const run = useAsync(() => (detail ? api.payrollRun(detail) : Promise.resolve(null)), [detail]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.hr.payroll')}</p>
        {canRun ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-payroll-run">
            <Icon name="plus" size={16} />
            {t('erp.hr.newPayroll')}
          </Button>
        ) : null}
      </div>
      {runs.error ? <div className="p-4"><ErrorBanner message={runs.error} onRetry={runs.reload} /></div> : null}
      {runs.loading ? <div className="p-4"><Skeleton height={140} /></div> : (runs.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.emptyPayroll')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.hr.runNumber')}</th>
              <th>{t('erp.hr.period')}</th>
              <th>{t('erp.hr.employees')}</th>
              <th>{t('erp.hr.gross')}</th>
              <th>{t('erp.hr.net')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {runs.data!.items.map((r: PayrollRunDto) => (
              <tr key={r.id} data-testid={`payroll-row-${r.runNumber}`}>
                <td className="font-mono text-[12px]">{r.runNumber}</td>
                <td className="text-[12.5px]">{r.periodNameEn ?? '—'}</td>
                <td className="tabular-nums text-[12.5px]">{r.employeeCount}</td>
                <td className="tabular-nums text-[12.5px]">{money(r.grossMinor, r.currency)}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(r.netMinor, r.currency)}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDetail(r.id)} data-testid={`view-payroll-${r.runNumber}`}>{t('common.details')}</Button>
                    {canApprove && r.status === 'DRAFT' ? (
                      <Button size="sm" variant="primary" data-testid={`approve-payroll-${r.runNumber}`} onClick={async () => { await api.approvePayrollRun(r.id); await runs.reload(); }}>
                        {t('erp.hr.approve')}
                      </Button>
                    ) : null}
                    {canApprove && r.status === 'POSTED' ? (
                      <Button size="sm" data-testid={`lock-payroll-${r.runNumber}`} onClick={async () => { await api.lockPayrollRun(r.id); await runs.reload(); }}>
                        {t('erp.hr.lock')}
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
        <div className="border-t border-[var(--border)] p-4" data-testid="payroll-detail">
          <div className="mb-3 flex items-center justify-between">
            <p className="oryx-panel-title m-0">{t('erp.hr.payslips')}</p>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}><Icon name="close" size={14} /></Button>
          </div>
          {run.loading ? <Skeleton height={100} /> : (
            <TableShell>
              <thead>
                <tr>
                  <th>{t('erp.hr.employee')}</th>
                  <th>{t('erp.hr.basic')}</th>
                  <th>{t('erp.hr.allowances')}</th>
                  <th>{t('erp.hr.deductions')}</th>
                  <th>{t('erp.hr.net')}</th>
                </tr>
              </thead>
              <tbody>
                {((run.data?.payslips ?? []) as Array<Record<string, number | string>>).map((p, i) => (
                  <tr key={i}>
                    <td className="text-[12.5px]">{String(p.employeeNameEn)} ({String(p.employeeCode)})</td>
                    <td className="tabular-nums text-[12.5px]">{money(Number(p.basicMinor))}</td>
                    <td className="tabular-nums text-[12.5px]">{money(Number(p.allowancesMinor))}</td>
                    <td className="tabular-nums text-[12.5px]">{money(Number(p.deductionsMinor))}</td>
                    <td className="tabular-nums text-[12.5px] font-semibold">{money(Number(p.netMinor))}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      ) : null}

      <RunPayrollModal
        open={open}
        periods={periods.data?.items ?? []}
        onClose={() => setOpen(false)}
        onCreated={async () => { await runs.reload(); }}
      />
    </Card>
  );
}

function RunPayrollModal({
  open,
  periods,
  onClose,
  onCreated,
}: {
  open: boolean;
  periods: Array<{ id: string; code: string; nameEn: string; status: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState('');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createPayrollRun({ periodId });
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
      title={t('erp.hr.newPayroll')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !periodId} onClick={submit} data-testid="save-payroll">{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Field label={t('erp.hr.period')} required>
        <select className="oryx-select" value={periodId} onChange={(e) => setPeriodId(e.target.value)} data-testid="payroll-period">
          <option value="">—</option>
          {periods.filter((p) => p.status === 'OPEN').map((p) => <option key={p.id} value={p.id}>{p.code} — {p.nameEn}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

function AdvancesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.hrAdvances(), []);
  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.hr.advances')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.emptyAdvances')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.hr.advanceNumber')}</th>
              <th>{t('erp.hr.employee')}</th>
              <th>{t('erp.hr.amount')}</th>
              <th>{t('erp.hr.outstanding')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((a) => (
              <tr key={a.id} data-testid={`advance-row-${a.advanceNumber}`}>
                <td className="font-mono text-[12px]">{a.advanceNumber}</td>
                <td className="text-[12.5px]">{a.employeeNameEn}</td>
                <td className="tabular-nums text-[12.5px]">{money(a.amountMinor, a.currency)}</td>
                <td className="tabular-nums text-[12.5px]">{money(a.outstandingMinor, a.currency)}</td>
                <td><StatusBadge status={a.status} label={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <span className="hidden">{canManage ? '1' : '0'} {toMinorInput('0')}</span>
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
