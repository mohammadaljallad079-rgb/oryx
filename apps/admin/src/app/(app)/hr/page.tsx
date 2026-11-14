'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, toMinorInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { ModuleDashboard } from '@/components/module-dashboard';
import { TabDeepLink } from '@/components/tab-deep-link';
import { EntityPicker } from '@/components/inline-create';
import { EmployeeModal } from '@/components/entity-modals';
import { LeaveTypeModal } from '@/components/leave-type-modal';
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

type Tab = 'dashboard' | 'employees' | 'leave' | 'attendance' | 'payroll' | 'advances' | 'policy' | 'reports';

const TAB_KEYS = ['dashboard', 'employees', 'leave', 'attendance', 'policy', 'payroll', 'reports', 'advances'] as const;

export default function HrPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <HrInner />
    </Suspense>
  );
}

function HrInner() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.hr.dashboard') },
    { key: 'employees', label: t('erp.hr.employees') },
    { key: 'leave', label: t('erp.hr.leave') },
    { key: 'attendance', label: t('erp.hr.attendance') },
    { key: 'policy', label: t('erp.hr.policyTab') },
    { key: 'payroll', label: t('erp.hr.payroll') },
    { key: 'reports', label: t('erp.hr.reportsTab') },
    { key: 'advances', label: t('erp.hr.advances') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="hr-page">
      <TabDeepLink valid={TAB_KEYS} onSelect={setTab} />
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

      {tab === 'dashboard' ? <ModuleDashboard moduleKey="human_resources" testId="hr-dashboard" /> : null}
      {tab === 'employees' ? <EmployeesTab canManage={can('erp.hr.employee.manage')} /> : null}
      {tab === 'leave' ? <LeaveTab canRequest={can('erp.hr.leave.request')} canApprove={can('erp.hr.leave.approve')} /> : null}
      {tab === 'attendance' ? <AttendanceTab canManage={can('erp.hr.attendance.manage')} canSelf={can('erp.hr.attendance.self')} /> : null}
      {tab === 'policy' ? <PolicyTab canManagePolicy={can('erp.hr.attendance.policy')} canViewWorkSites={can('erp.hr.read') || can('erp.hr.worksite.manage') || can('erp.hr.attendance.manage')} canManageWorkSites={can('erp.hr.worksite.manage')} /> : null}
      {tab === 'payroll' ? <PayrollTab canRun={can('erp.hr.payroll.run')} canApprove={can('erp.hr.payroll.approve')} /> : null}
      {tab === 'reports' ? <ReportsTab /> : null}
      {tab === 'advances' ? <AdvancesTab canManage={can('erp.hr.advance.manage')} /> : null}
    </div>
  );
}


function EmployeesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDto | null>(null);
  const [salaryFor, setSalaryFor] = useState<EmployeeDto | null>(null);
  const list = useAsync(() => api.hrEmployees({ search: search || undefined }), [search]);
  const departments = useAsync(() => api.hrDepartments(), []);

  const setStatus = async (row: EmployeeDto, status: string) => {
    await api.updateEmployee(row.id, { status });
    await list.reload();
  };

  const onDelete = async (row: EmployeeDto) => {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    try {
      await api.deleteEmployee(row.id);
      await list.reload();
    } catch (err) {
      const key = err instanceof ApiError && err.code === 'resource.conflict' ? 'erp.hr.deleteBlocked' : 'common.error';
      window.alert(t(key));
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="employee-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-employee">
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
              <th>{t('common.actions')}</th>
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
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" aria-label={`${t('common.edit')} ${e.code}`} onClick={() => { setEditing(e); setOpen(true); }} data-testid={`employee-edit-${e.code}`}>
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`${t('erp.hr.salary')} ${e.code}`} onClick={() => setSalaryFor(e)} data-testid={`employee-salary-${e.code}`}>
                          <Icon name="wallet" size={14} />
                        </Button>
                        <select
                          className="oryx-select"
                          value={e.status}
                          onChange={(ev) => void setStatus(e, ev.target.value)}
                          aria-label={`${t('erp.hr.employeeStatus')} ${e.code}`}
                          data-testid={`employee-status-${e.code}`}
                        >
                          {['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'].map((s) => (
                            <option key={s} value={s}>{t(`erp.hr.employeeStatusValue.${s}` as const)}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={`${t('common.delete')} ${e.code}`}
                          onClick={() => void onDelete(e)}
                          data-testid={`employee-delete-${e.code}`}
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
      <EmployeeModal
        open={open}
        employee={editing}
        departments={departments.data?.items ?? []}
        canManage={canManage}
        documentsSlot={editing ? <EmployeeDocumentsSection employeeId={editing.id} canManage={canManage} /> : null}
        onDepartmentCreated={departments.reload}
        onClose={() => { setOpen(false); setEditing(null); }}
        onCreated={list.reload}
      />
      <SalaryModal employee={salaryFor} canManage={canManage} onClose={() => setSalaryFor(null)} />
    </Card>
  );
}


const DOC_CATEGORIES = ['IDENTITY', 'PASSPORT', 'VISA', 'CONTRACT', 'CERTIFICATE', 'MEDICAL', 'OTHER'] as const;

/**
 * Employee document list, upload and preview.
 *
 * Documents are stored against the employee; the confidential flag is enforced
 * server-side, so a viewer without the permission simply never receives them.
 * Each row can preview or download its stored file — the bytes are fetched as a
 * blob with the bearer token in a header, never in a URL.
 */
function EmployeeDocumentsSection({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.employeeDocuments(employeeId), [employeeId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  const [form, setForm] = useState({ title: '', category: 'OTHER', issuedAt: '', expiresAt: '', isConfidential: false, fileRef: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const upload = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const file = fileRef.current?.files?.[0];
      const body = new FormData();
      body.append('title', form.title.trim());
      body.append('category', form.category);
      if (form.issuedAt) body.append('issuedAt', form.issuedAt);
      if (form.expiresAt) body.append('expiresAt', form.expiresAt);
      body.append('isConfidential', String(form.isConfidential));
      if (form.fileRef) body.append('fileRef', form.fileRef);
      if (file) body.append('file', file);
      await api.createEmployeeDocument(employeeId, body);
      setForm({ title: '', category: 'OTHER', issuedAt: '', expiresAt: '', isConfidential: false, fileRef: '' });
      if (fileRef.current) fileRef.current.value = '';
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (documentId: string) => {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteEmployeeDocument(employeeId, documentId);
      await list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (documentId: string, name: string, download: boolean) => {
    try {
      const blob = await api.fetchEmployeeDocumentBlob(employeeId, documentId);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        window.setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 10_000);
      } else {
        setPreview({ url, mime: blob.type || 'application/octet-stream', name });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const items = list.data?.items ?? [];

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4" data-testid="employee-documents">
      <p className="oryx-label mb-2 inline-flex items-center gap-1.5">
        <Icon name="paperclip" size={15} />
        {t('erp.hr.documents')}
      </p>
      {error ? <div className="mb-2"><ErrorBanner message={error} /></div> : null}
      {canManage ? (
        <div className="mb-3 grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-2">
          <Field label={t('erp.hr.documentTitle')} required>
            <input className="oryx-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="doc-title" />
          </Field>
          <Field label={t('erp.hr.documentCategory')}>
            <select className="oryx-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="doc-category">
              {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{t(`erp.hr.docCategory.${c}` as const)}</option>)}
            </select>
          </Field>
          <Field label={t('erp.hr.issuedAt')}>
            <input type="date" className="oryx-input" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} data-testid="doc-issued" />
          </Field>
          <Field label={t('erp.hr.expiresAt')}>
            <input type="date" className="oryx-input" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} data-testid="doc-expires" />
          </Field>
          <Field label={t('erp.hr.documentFile')}>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="oryx-input" data-testid="doc-file" />
          </Field>
          <Field label={t('erp.hr.documentRef')}>
            <input className="oryx-input" value={form.fileRef} onChange={(e) => setForm({ ...form, fileRef: e.target.value })} data-testid="doc-ref" />
          </Field>
          <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2">
            <input type="checkbox" checked={form.isConfidential} onChange={(e) => setForm({ ...form, isConfidential: e.target.checked })} data-testid="doc-confidential" />
            {t('erp.hr.confidential')}
          </label>
          <div className="sm:col-span-2">
            <Button size="sm" variant="primary" disabled={busy || !form.title.trim()} onClick={upload} data-testid="doc-save">
              <Icon name="plus" size={14} />
              {busy ? t('common.loading') : t('erp.hr.addDocument')}
            </Button>
          </div>
        </div>
      ) : null}
      {list.loading ? (
        <Skeleton height={30} />
      ) : items.length === 0 ? (
        <p className="oryx-faint m-0 text-[12px]">{t('erp.hr.noDocuments')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {items.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5" data-testid={`doc-row-${d.id}`}>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold">{d.title}</span>
                  {d.isConfidential ? <Badge tone="gold">{t('erp.hr.confidential')}</Badge> : null}
                </span>
                <span className="oryx-faint text-[11px]">
                  {t(`erp.hr.docCategory.${d.category}` as const)}
                  {d.fileName ? ` · ${d.fileName}` : d.fileRef ? ` · ${d.fileRef}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {d.hasFile ? (
                  <>
                    <Button size="sm" variant="ghost" title={t('print.preview')} onClick={() => void openFile(d.id, d.fileName ?? d.title, false)} data-testid={`doc-preview-${d.id}`}>
                      <Icon name="eye" size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" title={t('attachments.download')} onClick={() => void openFile(d.id, d.fileName ?? d.title, true)} data-testid={`doc-download-${d.id}`}>
                      <Icon name="download" size={14} />
                    </Button>
                  </>
                ) : null}
                {canManage ? (
                  <Button size="sm" variant="ghost" disabled={busy} title={t('common.delete')} onClick={() => void remove(d.id)} data-testid={`doc-delete-${d.id}`}>
                    <Icon name="close" size={14} />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={preview !== null} title={preview?.name ?? ''} onClose={() => setPreview(null)}>
        {preview ? (
          preview.mime === 'application/pdf' ? (
            <iframe title={preview.name} src={preview.url} className="h-[70vh] w-full rounded-md border border-[var(--border)]" data-testid="doc-preview-content" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.name} className="mx-auto max-h-[70vh] rounded-md" data-testid="doc-preview-content" />
          )
        ) : null}
      </Modal>
    </div>
  );
}

function SalaryModal({ employee, canManage, onClose }: { employee: EmployeeDto | null; canManage: boolean; onClose: () => void }) {
  const { t } = useUi();
  const detail = useAsync(() => (employee ? api.hrEmployee(employee.id) : Promise.resolve(null)), [employee?.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ effectiveFrom: new Date().toISOString().slice(0, 10), basic: '0.00', currency: 'BHD', notes: '' });

  const structures = (detail.data?.salaryStructures as Array<{ id: string; effectiveFrom: string; basicMinor: number; currency: string; isActive: boolean; components: Array<{ id: string; type: string; nameEn: string; amountMinor: number; isPercentage: boolean; percentBp: number }> }> | undefined) ?? [];

  const submit = async () => {
    if (!employee) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSalaryStructure({
        employeeId: employee.id,
        effectiveFrom: form.effectiveFrom,
        basicMinor: toMinorInput(form.basic),
        currency: form.currency,
        notes: form.notes || undefined,
        components: [],
      });
      await detail.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(employee)}
      title={employee ? `${t('erp.hr.salary')} — ${employee.fullNameEn}` : t('erp.hr.salary')}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      {error ? <ErrorBanner message={error} /> : null}
      {detail.loading ? (
        <Skeleton height={100} />
      ) : structures.length === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.emptySalary')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.hr.effectiveFrom')}</th>
              <th>{t('erp.hr.basic')}</th>
              <th>{t('erp.hr.allowances')}</th>
              <th>{t('erp.hr.deductions')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {structures.map((s) => {
              const allowances = s.components.filter((c) => c.type === 'ALLOWANCE').reduce((sum, c) => sum + c.amountMinor, 0);
              const deductions = s.components.filter((c) => c.type === 'DEDUCTION').reduce((sum, c) => sum + c.amountMinor, 0);
              return (
                <tr key={s.id} data-testid={`salary-row-${s.id}`}>
                  <td className="text-[12.5px]">{s.effectiveFrom.slice(0, 10)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(s.basicMinor, s.currency)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(allowances, s.currency)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(deductions, s.currency)}</td>
                  <td><Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {canManage ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-2">
          <Field label={t('erp.hr.effectiveFrom')} required>
            <input type="date" className="oryx-input" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} data-testid="salary-effective-from" />
          </Field>
          <Field label={t('erp.hr.basic')} required>
            <input className="oryx-input" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} data-testid="salary-basic" />
          </Field>
          <Field label={t('erp.hr.currency')}>
            <input className="oryx-input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} data-testid="salary-currency" />
          </Field>
          <Field label={t('common.notes')}>
            <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="salary-notes" />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={submit} data-testid="save-salary">
              <Icon name="plus" size={15} />
              {busy ? t('common.loading') : t('erp.hr.addSalary')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function LeaveTab({ canRequest, canApprove }: { canRequest: boolean; canApprove: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.leaveRequests(), []);
  const employees = useAsync(() => api.hrEmployees(), []);
  const types = useAsync(() => api.leaveTypes(), []);
  const departments = useAsync(() => api.hrDepartments(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveRequestDto | null>(null);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.hr.leave')}</p>
        {canRequest ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-leave-request">
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
                  <div className="flex gap-2">
                    {canRequest && r.status === 'SUBMITTED' ? (
                      <Button size="sm" data-testid={`edit-leave-${r.id}`} onClick={() => { setEditing(r); setOpen(true); }}>
                        {t('common.edit')}
                      </Button>
                    ) : null}
                    {canApprove && r.status === 'SUBMITTED' ? (
                      <>
                        <Button size="sm" data-testid={`approve-leave-${r.id}`} onClick={async () => { await api.decideLeave(r.id, 'APPROVED'); await list.reload(); }}>
                          {t('erp.hr.approve')}
                        </Button>
                        <Button size="sm" variant="danger" onClick={async () => { await api.decideLeave(r.id, 'REJECTED'); await list.reload(); }}>
                          {t('erp.hr.reject')}
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
      <LeaveRequestModal
        open={open}
        editing={editing}
        employees={employees.data?.items ?? []}
        types={types.data?.items ?? []}
        departments={departments.data?.items ?? []}
        onEmployeeCreated={employees.reload}
        onDepartmentCreated={departments.reload}
        onTypesReload={types.reload}
        onClose={() => { setOpen(false); setEditing(null); }}
        onCreated={list.reload}
      />
    </Card>
  );
}

function LeaveRequestModal({
  open,
  editing,
  employees,
  types,
  departments,
  onEmployeeCreated,
  onDepartmentCreated,
  onTypesReload,
  onClose,
  onCreated,
}: {
  open: boolean;
  editing: LeaveRequestDto | null;
  employees: Array<{ id: string; code: string; fullNameEn: string }>;
  types: Array<{ id: string; nameEn: string }>;
  departments: Array<{ id: string; nameEn: string }>;
  onEmployeeCreated?: () => Promise<void> | void;
  onDepartmentCreated?: () => Promise<void> | void;
  onTypesReload?: () => Promise<void> | void;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      employeeId: editing?.employeeId ?? '',
      leaveTypeId: editing?.leaveTypeId ?? '',
      startDate: editing?.startDate?.slice(0, 10) ?? '',
      endDate: editing?.endDate?.slice(0, 10) ?? '',
      reason: editing?.reason ?? '',
    });
  }, [open, editing]);

  const valid = Boolean(form.employeeId && form.leaveTypeId && form.startDate && form.endDate);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateLeaveRequest(editing.id, {
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
        });
      } else {
        await api.requestLeave({
          employeeId: form.employeeId,
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
        });
      }
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
      title={editing ? t('erp.hr.editLeave') : t('erp.hr.newLeave')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !valid} onClick={submit} data-testid="save-leave">{busy ? t('common.loading') : t('common.save')}</Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.hr.employee')} required>
          <EntityPicker
            value={form.employeeId || null}
            options={employees.map((x) => ({ value: x.id, label: `${x.code} — ${x.fullNameEn}` }))}
            onChange={(v) => setForm({ ...form, employeeId: v ?? '' })}
            placeholder={t('common.select')}
            disabled={Boolean(editing)}
            testId="leave-employee"
            createLabel={t('erp.hr.newEmployee')}
            reloadOptions={onEmployeeCreated}
            renderCreate={({ onClose, onSaved }) => (
              <EmployeeModal
                open
                departments={departments}
                onDepartmentCreated={onDepartmentCreated}
                onClose={onClose}
                onCreated={() => { /* selection is handled by onSaved */ }}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('erp.hr.leaveType')} required>
          <EntityPicker
            value={form.leaveTypeId || null}
            options={types.map((x) => ({ value: x.id, label: x.nameEn }))}
            onChange={(v) => setForm({ ...form, leaveTypeId: v ?? '' })}
            placeholder={t('common.select')}
            testId="leave-type"
            createLabel={t('erp.hr.newLeaveType')}
            reloadOptions={onTypesReload}
            renderCreate={({ onClose: closeCreate, onSaved }) => (
              <LeaveTypeModal
                open
                onClose={closeCreate}
                onCreated={() => { /* selection is handled by onSaved */ }}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('erp.reports.from')} required>
          <input type="date" className="oryx-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="leave-start" />
        </Field>
        <Field label={t('erp.reports.to')} required>
          <input type="date" className="oryx-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="leave-end" />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('common.notes')}>
            <input className="oryx-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="leave-reason" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function AttendanceTab({ canManage, canSelf }: { canManage: boolean; canSelf: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.hrAttendance(), []);
  const employees = useAsync(() => api.hrEmployees(), []);
  const departments = useAsync(() => api.hrDepartments(), []);
  const [open, setOpen] = useState(false);

  const hours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

  return (
    <div className="flex flex-col gap-4">
      {canSelf ? <SelfServiceCard onRecorded={list.reload} /> : null}
      <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.hr.attendance')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-attendance">
            <Icon name="plus" size={16} />
            {t('erp.hr.recordAttendance')}
          </Button>
        ) : null}
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
              <th>{t('erp.hr.checkIn')}</th>
              <th>{t('erp.hr.checkOut')}</th>
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
                <td className="tabular-nums text-[12.5px]">{clock(a.checkInAt)}</td>
                <td className="tabular-nums text-[12.5px]">{clock(a.checkOutAt)}</td>
                <td className="tabular-nums text-[12.5px]">{hours(a.workedMinutes)}</td>
                <td className="tabular-nums text-[12.5px]">{hours(a.overtimeMinutes)}</td>
                <td><StatusBadge status={a.status} label={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <RecordAttendanceModal
        open={open}
        employees={employees.data?.items ?? []}
        departments={departments.data?.items ?? []}
        onEmployeeCreated={employees.reload}
        onDepartmentCreated={departments.reload}
        onClose={() => setOpen(false)}
        onSaved={list.reload}
      />
      </Card>
    </div>
  );
}

/**
 * Employee self-service clock.
 *
 * Uses the browser's geolocation when available and falls back to a plain punch,
 * so the card still works on a device that denies location access. The API is the
 * authority on whether a punch is verified; the UI only reports what it returned.
 */
function SelfServiceCard({ onRecorded }: { onRecorded: () => Promise<void> }) {
  const { t } = useUi();
  const today = useAsync(() => api.myAttendance(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLocation = async (): Promise<Record<string, unknown>> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return {};
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ location: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy } }),
        () => resolve({}),
        { timeout: 4000 },
      );
    });
  };

  const punch = async (kind: 'in' | 'out' | 'break-start' | 'break-end') => {
    setBusy(true);
    setError(null);
    try {
      const body = await withLocation();
      if (kind === 'in') await api.selfCheckIn(body);
      else if (kind === 'out') await api.selfCheckOut(body);
      else if (kind === 'break-start') await api.selfBreakStart(body);
      else await api.selfBreakEnd(body);
      await today.reload();
      await onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const rec = today.data as Record<string, unknown> | null;
  const hours = (m: unknown) => `${Math.floor(Number(m ?? 0) / 60)}:${String(Number(m ?? 0) % 60).padStart(2, '0')}`;

  return (
    <Card className="p-4" data-testid="self-service">
      <div className="mb-3 flex items-center justify-between">
        <p className="oryx-panel-title m-0">{t('erp.hr.selfService')}</p>
        {rec ? <Badge tone="info">{String(rec.status ?? '—')}</Badge> : null}
      </div>
      {error ? <ErrorBanner message={error} /> : null}
      {today.loading ? <Skeleton height={80} /> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-[12.5px]">
            <div><span className="oryx-muted">{t('erp.hr.checkIn')}: </span><span className="tabular-nums">{rec?.checkInAt ? new Date(String(rec.checkInAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
            <div><span className="oryx-muted">{t('erp.hr.checkOut')}: </span><span className="tabular-nums">{rec?.checkOutAt ? new Date(String(rec.checkOutAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
            <div><span className="oryx-muted">{t('erp.hr.workedHours')}: </span><span className="tabular-nums">{hours(rec?.netMinutes)}</span></div>
            <div><span className="oryx-muted">{t('erp.hr.overtime')}: </span><span className="tabular-nums">{hours(rec?.overtimeMinutes)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => punch('in')} data-testid="self-check-in">{t('erp.hr.checkIn')}</Button>
            <Button size="sm" disabled={busy} onClick={() => punch('break-start')} data-testid="self-break-start">{t('erp.hr.breakStart')}</Button>
            <Button size="sm" disabled={busy} onClick={() => punch('break-end')} data-testid="self-break-end">{t('erp.hr.breakEnd')}</Button>
            <Button size="sm" disabled={busy} onClick={() => punch('out')} data-testid="self-check-out">{t('erp.hr.checkOut')}</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function RecordAttendanceModal({
  open,
  employees,
  departments,
  onEmployeeCreated,
  onDepartmentCreated,
  onClose,
  onSaved,
}: {
  open: boolean;
  employees: EmployeeDto[];
  departments: Array<{ id: string; nameEn: string }>;
  onEmployeeCreated?: () => Promise<void> | void;
  onDepartmentCreated?: () => Promise<void> | void;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: '',
    workDate: new Date().toISOString().slice(0, 10),
    checkIn: '09:00',
    checkOut: '17:00',
    overtimeMinutes: '0',
    status: 'PRESENT',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      employeeId: '',
      workDate: new Date().toISOString().slice(0, 10),
      checkIn: '09:00',
      checkOut: '17:00',
      overtimeMinutes: '0',
      status: 'PRESENT',
      notes: '',
    });
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.recordAttendance({
        employeeId: form.employeeId,
        workDate: form.workDate,
        checkInAt: `${form.workDate}T${form.checkIn}:00.000Z`,
        checkOutAt: `${form.workDate}T${form.checkOut}:00.000Z`,
        overtimeMinutes: Number(form.overtimeMinutes) || 0,
        status: form.status,
        notes: form.notes || undefined,
      });
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
      title={t('erp.hr.recordAttendance')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.employeeId || !form.workDate} onClick={submit} data-testid="save-attendance">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.hr.employee')} required>
          <EntityPicker
            value={form.employeeId || null}
            options={employees.map((x) => ({ value: x.id, label: `${x.code} — ${x.fullNameEn}` }))}
            onChange={(v) => setForm({ ...form, employeeId: v ?? '' })}
            placeholder={t('common.select')}
            testId="attendance-employee"
            createLabel={t('erp.hr.newEmployee')}
            reloadOptions={onEmployeeCreated}
            renderCreate={({ onClose, onSaved }) => (
              <EmployeeModal
                open
                departments={departments}
                onDepartmentCreated={onDepartmentCreated}
                onClose={onClose}
                onCreated={() => { /* selection is handled by onSaved */ }}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('common.date')} required>
          <input type="date" className="oryx-input" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} data-testid="attendance-date" />
        </Field>
        <Field label={t('erp.hr.checkIn')}>
          <input type="time" className="oryx-input" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} data-testid="attendance-check-in" />
        </Field>
        <Field label={t('erp.hr.checkOut')}>
          <input type="time" className="oryx-input" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} data-testid="attendance-check-out" />
        </Field>
        <Field label={t('erp.hr.overtime')}>
          <input className="oryx-input" value={form.overtimeMinutes} onChange={(e) => setForm({ ...form, overtimeMinutes: e.target.value })} data-testid="attendance-overtime" />
        </Field>
        <Field label={t('common.status')}>
          <select className="oryx-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="attendance-status">
            {['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY'].map((s) => (
              <option key={s} value={s}>{t(`erp.hr.attendanceStatus.${s}` as const)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="attendance-notes" />
        </Field>
      </div>
    </Modal>
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
                  <th>{t('common.actions')}</th>
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
                    <td>
                      <PayslipPdfButton payslipId={String(p.id)} code={String(p.employeeCode)} />
                    </td>
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

/** Downloads a payslip PDF (the route needs the bearer token, so it is fetched). */
function PayslipPdfButton({ payslipId, code }: { payslipId: string; code: string }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const url = await api.payslipPdfBlobUrl(payslipId);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${code}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" disabled={busy} onClick={open} data-testid={`payslip-pdf-${code}`}>
      <Icon name="download" size={14} />
      {t('erp.hr.payslipPdf')}
    </Button>
  );
}

function PolicyTab({ canManagePolicy, canViewWorkSites, canManageWorkSites }: { canManagePolicy: boolean; canViewWorkSites: boolean; canManageWorkSites: boolean }) {
  const { t, locale } = useUi();
  const policy = useAsync(() => api.hrAttendancePolicy(), []);
  const sites = useAsync(() => canViewWorkSites ? api.hrWorkSites() : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 0 }), [canViewWorkSites]);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (policy.data) setForm((current) => current ?? policy.data);
  }, [policy.data]);

  const save = async () => {
    if (!form || !canManagePolicy) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api.updateAttendancePolicy({
        graceMinutes: Number(form.graceMinutes),
        standardDailyHours: Math.round(Number(form.standardDailyHours) * 100),
        overtimeMultiplierBp: Number(form.overtimeMultiplierBp),
        deductLate: Boolean(form.deductLate),
        deductAbsence: Boolean(form.deductAbsence),
      });
      await policy.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4" data-testid="attendance-policy">
        <p className="oryx-panel-title mb-3">{t('erp.hr.attendancePolicy')}</p>
        {policy.error ? (
          <ErrorBanner message={policy.error} onRetry={policy.reload} />
        ) : policy.loading || !form ? (
          <Skeleton height={120} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('erp.hr.graceMinutes')}>
              <input type="number" min="0" max="120" className="oryx-input" value={String(form.graceMinutes ?? 0)} disabled={!canManagePolicy} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })} data-testid="policy-grace" />
            </Field>
            <Field label={t('erp.hr.standardDailyHours')}>
              <input type="number" min="1" max="24" step="0.01" className="oryx-input" value={String(Number(form.standardDailyHours ?? 800) / 100)} disabled={!canManagePolicy} onChange={(e) => setForm({ ...form, standardDailyHours: e.target.value })} data-testid="policy-hours" />
            </Field>
            <Field label={t('erp.hr.overtimeMultiplier')} hint={t('erp.hr.overtimeHint')}>
              <input type="number" min="0" max="50000" className="oryx-input" value={String(form.overtimeMultiplierBp ?? 15000)} disabled={!canManagePolicy} onChange={(e) => setForm({ ...form, overtimeMultiplierBp: e.target.value })} data-testid="policy-ot" />
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={Boolean(form.deductLate)} disabled={!canManagePolicy} onChange={(e) => setForm({ ...form, deductLate: e.target.checked })} data-testid="policy-deduct-late" />
              {t('erp.hr.deductLate')}
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={Boolean(form.deductAbsence)} disabled={!canManagePolicy} onChange={(e) => setForm({ ...form, deductAbsence: e.target.checked })} data-testid="policy-deduct-absence" />
              {t('erp.hr.deductAbsence')}
            </label>
          </div>
        )}
        {saveError ? <div className="mt-3"><ErrorBanner message={saveError} /></div> : null}
        {canManagePolicy && !policy.error ? (
          <div className="mt-4">
            <Button variant="primary" size="sm" disabled={busy || !form} onClick={save} data-testid="save-policy">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        ) : null}
      </Card>

      {canViewWorkSites ? (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.hr.workSites')}</p>
          {canManageWorkSites ? (
            <Button variant="primary" size="sm" onClick={() => { setEditTarget(null); setOpen(true); }} data-testid="new-work-site">
              <Icon name="plus" size={16} />
              {t('erp.hr.newWorkSite')}
            </Button>
          ) : null}
        </div>
        {sites.error ? (
          <div className="p-4"><ErrorBanner message={sites.error} onRetry={sites.reload} /></div>
        ) : sites.loading ? (
          <div className="p-4"><Skeleton height={100} /></div>
        ) : (sites.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('erp.hr.workSites')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.hr.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('erp.hr.latitude')}</th>
                <th>{t('erp.hr.longitude')}</th>
                <th>{t('erp.hr.radius')}</th>
                <th>{t('erp.hr.wifi')}</th>
                {canManageWorkSites ? <th>{t('common.actions')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {sites.data!.items.map((s, i) => (
                <tr key={String(s.id ?? i)}>
                  <td className="font-mono text-[12px]">{String(s.code)}</td>
                  <td className="text-[12.5px]">{String(s.nameEn)}</td>
                  <td className="tabular-nums text-[12.5px]">{String(s.latitude ?? '—')}</td>
                  <td className="tabular-nums text-[12.5px]">{String(s.longitude ?? '—')}</td>
                  <td className="tabular-nums text-[12.5px]">{String(s.radiusMeters ?? '—')}</td>
                  <td className="text-[12.5px]">{String(s.wifiSsids ?? '—')}</td>
                  {canManageWorkSites ? (
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => { setEditTarget(s); setOpen(true); }} data-testid={`edit-work-site-${String(s.code)}`}>
                          {t('branches.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            const name = locale === 'ar' ? String(s.nameAr ?? s.nameEn) : String(s.nameEn);
                            if (!window.confirm(t('erp.hr.confirmDeleteWorkSite').replace('{name}', name))) return;
                            try {
                              await api.deleteWorkSite(String(s.id));
                              await sites.reload();
                            } catch (err) {
                              window.alert(err instanceof Error ? err.message : t('common.error'));
                            }
                          }}
                          data-testid={`delete-work-site-${String(s.code)}`}
                        >
                          <Icon name="trash" size={14} />
                          {t('common.delete')}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
        <CreateWorkSiteModal open={open} site={editTarget} onClose={() => { setOpen(false); setEditTarget(null); }} onSaved={sites.reload} />
      </Card>
      ) : null}
    </div>
  );
}

function CreateWorkSiteModal({ open, site, onClose, onSaved }: { open: boolean; site?: Record<string, unknown> | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', latitude: '', longitude: '', radiusMeters: '150', wifiSsids: '' });
  const isEdit = Boolean(site?.id);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (site?.id) {
      setForm({
        code: String(site.code ?? ''),
        nameEn: String(site.nameEn ?? ''),
        nameAr: String(site.nameAr ?? ''),
        latitude: site.latitude != null ? String(site.latitude) : '',
        longitude: site.longitude != null ? String(site.longitude) : '',
        radiusMeters: site.radiusMeters != null ? String(site.radiusMeters) : '150',
        wifiSsids: String(site.wifiSsids ?? ''),
      });
    } else {
      setForm({ code: '', nameEn: '', nameAr: '', latitude: '', longitude: '', radiusMeters: '150', wifiSsids: '' });
    }
  }, [open, site]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isEdit) {
        await api.updateWorkSite(String(site!.id), {
          nameEn: form.nameEn,
          nameAr: form.nameAr || form.nameEn,
          latitude: form.latitude ? Number(form.latitude) : undefined,
          longitude: form.longitude ? Number(form.longitude) : undefined,
          radiusMeters: form.radiusMeters ? Number(form.radiusMeters) : undefined,
          wifiSsids: form.wifiSsids,
        });
      } else {
        await api.createWorkSite({
          code: form.code,
          nameEn: form.nameEn,
          nameAr: form.nameAr || form.nameEn,
          latitude: form.latitude ? Number(form.latitude) : undefined,
          longitude: form.longitude ? Number(form.longitude) : undefined,
          radiusMeters: form.radiusMeters ? Number(form.radiusMeters) : undefined,
          wifiSsids: form.wifiSsids || undefined,
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={isEdit ? t('erp.hr.editWorkSite') : t('erp.hr.newWorkSite')} onClose={onClose} footer={
      <>
        <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button size="sm" variant="primary" disabled={busy || !form.code || !form.nameEn} onClick={submit} data-testid="submit-work-site">{t('common.save')}</Button>
      </>
    }>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.hr.code')}><input className="oryx-input" value={form.code} disabled={isEdit} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="work-site-code" /></Field>
        <Field label={t('erp.hr.radius')}><input type="number" className="oryx-input" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} data-testid="work-site-radius" /></Field>
        <Field label={`${t('common.name')} (EN)`}><input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="work-site-name-en" /></Field>
        <Field label={`${t('common.name')} (AR)`}><input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="work-site-name-ar" /></Field>
        <Field label={t('erp.hr.latitude')}><input className="oryx-input" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} data-testid="work-site-lat" /></Field>
        <Field label={t('erp.hr.longitude')}><input className="oryx-input" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} data-testid="work-site-lng" /></Field>
        <Field label={t('erp.hr.wifi')}><input className="oryx-input" value={form.wifiSsids} onChange={(e) => setForm({ ...form, wifiSsids: e.target.value })} data-testid="work-site-wifi" /></Field>
      </div>
    </Modal>
  );
}

const REPORT_KINDS = ['attendance', 'late-absence', 'overtime', 'worked-hours', 'payroll', 'deductions-allowances', 'employee-payroll', 'payroll-cost'] as const;

function ReportsTab() {
  const { t } = useUi();
  const [kind, setKind] = useState<string>('attendance');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useAsync(() => api.hrReport(kind, { from: from || undefined, to: to || undefined }), [kind, from, to]);
  const [busy, setBusy] = useState(false);

  const rows: Array<Record<string, unknown>> = (() => {
    const d = report.data as Record<string, unknown> | null;
    if (!d) return [];
    if (Array.isArray(d.items)) return d.items as Array<Record<string, unknown>>;
    if (Array.isArray(d.byDepartment)) return d.byDepartment as Array<Record<string, unknown>>;
    return [];
  })();
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];

  const exportCsv = async () => {
    setBusy(true);
    try {
      await api.downloadHrReportCsv(kind, { from: from || undefined, to: to || undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <Field label={t('erp.hr.reportTitle')}>
          <select className="oryx-select" value={kind} onChange={(e) => setKind(e.target.value)} data-testid="report-kind">
            {REPORT_KINDS.map((k) => <option key={k} value={k}>{t(`erp.hr.report.${k}`)}</option>)}
          </select>
        </Field>
        <Field label={t('common.from')}><input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from" /></Field>
        <Field label={t('common.to')}><input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to" /></Field>
        <Button size="sm" disabled={busy} onClick={exportCsv} data-testid="export-report-csv">
          <Icon name="download" size={14} />
          {t('erp.hr.exportCsv')}
        </Button>
      </div>
      {report.error ? <div className="p-4"><ErrorBanner message={report.error} onRetry={report.reload} /></div> : null}
      {report.loading ? <div className="p-4"><Skeleton height={140} /></div> : rows.length === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.hr.reportsTab')} />
      ) : (
        <TableShell>
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className="tabular-nums text-[12.5px]">{r[c] === null || r[c] === undefined ? '—' : String(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

