'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  EmployeeBonusDto,
  EmployeeLeaveTabDto,
  EmployeePayrollLedgerDto,
  EmployeePenaltyDto,
  EmployeePayslipRow,
  EmployeePersonalCardDto,
  EmployeeReportPackDto,
} from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money } from '@/lib/erp-format';
import { downloadTableCsv, openPrintTable, recordPrintInput, type PrintTableColumn, type PrintTableInput } from '@/lib/print-table';
import { AttachmentsPanel, PendingAttachments, uploadPendingAttachments } from '@/components/document-print';
import { RecordPreview } from '@/components/record-preview';
import { EmployeeModal } from '@/components/entity-modals';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  Skeleton,
  TableShell,
} from '@/components/ui';

/**
 * The employee electronic file.
 *
 * Seven tabs over the production HR engine: the personal card, the payroll
 * ledger, leave, disciplinary actions, bonuses and the report pack. Every figure
 * is read from the stored records through the dedicated `/file` routes; nothing
 * is computed here beyond formatting, so a printed page and the screen agree.
 *
 * Pay, bank details and the payroll ledger are gated on `erp.hr.salary.read`.
 * The API already withholds those fields, and the tabs are hidden as well so an
 * operator without the permission sees a coherent screen rather than empty
 * tables.
 */

export type EmployeeFileTabKey =
  | 'identity'
  | 'payroll'
  | 'leave'
  | 'penalties'
  | 'bonuses'
  | 'reports';

function hours(minutes: number | null | undefined): string {
  if (!minutes) return '0';
  return (minutes / 60).toFixed(1);
}

function genderLabel(value: string | null | undefined, ar: boolean): string {
  if (!value) return '—';
  if (value === 'MALE') return ar ? 'ذكر' : 'Male';
  if (value === 'FEMALE') return ar ? 'أنثى' : 'Female';
  return value;
}

function day(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '—';
}

function useLabels() {
  const { locale } = useUi();
  const ar = locale === 'ar';
  return { ar, locale, pick: (en: string, arText: string) => (ar ? arText : en) };
}

function companyName(
  memberships: Array<{ companyId: string; companyNameEn: string; companyNameAr: string }>,
  companyId: string | null,
): { en: string; ar: string } {
  const hit = memberships.find((m) => m.companyId === companyId);
  return {
    en: hit?.companyNameEn ?? 'ORYX',
    ar: hit?.companyNameAr ?? 'أوريكس',
  };
}

/** Run a print/export action with a busy flag and a surfaced error. */
function useTableAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useUi();
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function TableActions({
  onPrint,
  onCsv,
  busy,
  csvLabel,
}: {
  onPrint: () => void;
  onCsv: () => void;
  busy: boolean;
  csvLabel: string;
}) {
  const { t } = useUi();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="ghost" disabled={busy} onClick={onPrint} title={t('print.print')}>
        <Icon name="print" size={14} />
        {t('print.print')}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCsv} title={csvLabel}>
        <Icon name="download" size={14} />
        {csvLabel}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------- personal card

function IdentityTab({ employeeId }: { employeeId: string }) {
  const { t } = useUi();
  const { ar, locale, pick } = useLabels();
  const { can, memberships, companyId } = useAuth();
  const card = useAsync(() => api.hrEmployeeFile.personalCard(employeeId), [employeeId]);
  const canManageDocs = can('erp.hr.write') || can('erp.hr.employee.manage');
  const [contractPreview, setContractPreview] = useState<EmployeePersonalCardDto['contracts'][number] | null>(null);
  const [photo, setPhoto] = useState<{ url: string; attachmentId: string } | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const departments = useAsync(() => api.hrDepartments(), []);
  const jobTitles = useAsync(() => api.hrJobTitles(), []);
  const branches = useAsync(
    () => (companyId ? api.listBranches(companyId, { pageSize: 200 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 200 })),
    [companyId],
  );

  const openEditor = async () => {
    const detail = await api.hrEmployee(employeeId);
    setEditing(detail);
  };

  // The portrait is an ordinary EMPLOYEE attachment filed under PHOTO, so the
  // upload, the permission check and the preview are the ones every other
  // document already uses instead of a second, photo-only path.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const items = await api.attachments('EMPLOYEE', employeeId);
        const latest = items.filter((a) => a.category === 'PHOTO' && a.mimeType?.startsWith('image/')).pop();
        if (!latest) return;
        const blob = await api.fetchAttachmentBlob('EMPLOYEE', employeeId, latest.id);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPhoto({ url: objectUrl, attachmentId: latest.id });
      } catch {
        // A missing portrait is not an error; the monogram stands in.
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employeeId, photoVersion]);

  if (card.loading) return <Skeleton height={260} />;
  if (card.error) return <ErrorBanner message={card.error} onRetry={card.reload} />;
  if (!card.data) return null;

  const d: EmployeePersonalCardDto = card.data;
  const e = d.employee;
  const name = (en: string | null, arName: string | null) => (ar ? arName || en : en || arName) || '—';
  const rows: Array<[string, string]> = [
    [t('erp.hr.code'), e.code],
    [pick('Arabic name', 'الاسم بالعربية'), e.fullNameAr || '—'],
    [pick('English name', 'الاسم بالإنجليزية'), e.fullNameEn || '—'],
    [pick('National ID', 'الرقم الشخصي'), e.nationalId || '—'],
    [pick('Date of birth', 'تاريخ الميلاد'), day(e.dateOfBirth)],
    [pick('Gender', 'الجنس'), genderLabel(e.gender, ar)],
    [pick('Nationality', 'الجنسية'), e.nationality || '—'],
    [pick('Phone', 'الهاتف'), e.phone || '—'],
    [pick('Secondary phone', 'هاتف إضافي'), e.secondaryPhone || '—'],
    [pick('Email', 'البريد الإلكتروني'), e.email || '—'],
    [pick('Address', 'العنوان'), e.addressLine || '—'],
    [pick('Department', 'القسم'), name(e.departmentNameEn, e.departmentNameAr)],
    [pick('Job title', 'المسمى الوظيفي'), name(e.jobTitleNameEn, e.jobTitleNameAr)],
    [pick('Branch', 'الفرع'), name(e.branchNameEn, e.branchNameAr)],
    [pick('Manager', 'المدير'), name(e.managerNameEn, e.managerNameAr)],
    [pick('Hire date', 'تاريخ التعيين'), day(e.hireDate)],
    [pick('Termination date', 'تاريخ انتهاء الخدمة'), day(e.terminationDate)],
    [t('erp.hr.employeeStatus'), t(`erp.hr.employeeStatusValue.${e.status}` as const)],
  ];
  const cardPrintFields = rows.map(([label, value]) => ({ label, value }));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {photo ? (
              // A blob URL cannot go through next/image, which needs a
              // configured loader for anything but a static path.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.url}
                alt={name(e.fullNameEn, e.fullNameAr)}
                className="h-16 w-16 rounded-full border border-[var(--border)] object-cover"
                data-testid="employee-photo"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] text-lg font-bold"
                aria-hidden="true"
              >
                {(e.fullNameEn || e.code).slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold">{name(e.fullNameEn, e.fullNameAr)}</h2>
              <p className="oryx-muted text-sm">
                {e.code} · {name(e.jobTitleNameEn, e.jobTitleNameAr)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={e.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {t(`erp.hr.employeeStatusValue.${e.status}` as const)}
            </Badge>
            {canManageDocs ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={pick('Edit employee', 'تعديل بيانات الموظف')}
                title={pick('Edit employee', 'تعديل بيانات الموظف')}
                data-testid="identity-edit"
                onClick={() => void openEditor()}
              >
                <Icon name="edit" size={14} />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('print.print')}
              data-testid="identity-print"
              onClick={() =>
                openPrintTable(
                  recordPrintInput({
                    locale,
                    titleEn: 'Employee card',
                    titleAr: 'بطاقة الموظف',
                    subjectName: name(e.fullNameEn, e.fullNameAr),
                    subjectCode: e.code,
                    companyNameEn: companyName(memberships, companyId).en,
                    companyNameAr: companyName(memberships, companyId).ar,
                    windowLabel: day(e.hireDate),
                    fields: cardPrintFields,
                  }),
                  true,
                )
              }
            >
              <Icon name="print" size={14} />
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="border-b border-[var(--border)] pb-2">
              <dt className="oryx-muted text-xs">{label}</dt>
              <dd className="mt-0.5 text-[13px] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold">{pick('Compensation', 'الراتب والبدلات')}</h3>
        {d.compensation.visible ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--border)] p-3">
                <div className="oryx-muted text-xs">{t('erp.hr.basic')}</div>
                <div className="mt-1 font-bold tabular-nums">
                  {money(d.compensation.basicMinor, d.compensation.currency ?? undefined)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] p-3">
                <div className="oryx-muted text-xs">{pick('Allowances', 'البدلات')}</div>
                <div className="mt-1 font-bold tabular-nums">
                  {money(d.compensation.allowancesMinor, d.compensation.currency ?? undefined)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] p-3">
                <div className="oryx-muted text-xs">{pick('Deductions', 'الخصومات')}</div>
                <div className="mt-1 font-bold tabular-nums">
                  {money(d.compensation.deductionsMinor, d.compensation.currency ?? undefined)}
                </div>
              </div>
            </div>
            {d.compensation.components.length ? (
              <TableShell label={pick('Salary components', 'مكونات الراتب')}>
                <thead>
                  <tr>
                    <th>{pick('Component', 'المكوّن')}</th>
                    <th>{pick('Type', 'النوع')}</th>
                    <th className="text-end">{pick('Amount', 'المبلغ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.compensation.components.map((c) => (
                    <tr key={c.id}>
                      <td>{ar ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}</td>
                      <td className="text-[12px]">{t(`erp.hr.componentType.${c.type}` as const)}</td>
                      <td className="text-end tabular-nums">
                        {money(c.amountMinor, d.compensation.visible ? (d.compensation.currency ?? undefined) : undefined)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            ) : null}
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <h4 className="mb-2 text-xs font-bold">{pick('Bank details', 'البيانات البنكية')}</h4>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="bank-details">
                {([
                  [t('erp.hr.bankName'), d.compensation.bankName],
                  [t('erp.hr.bankAccountName'), d.compensation.bankAccountName],
                  [t('erp.hr.bankIban'), d.compensation.bankIban],
                ] as Array<[string, string | null | undefined]>).map(([label, value]) => (
                  <div key={label}>
                    <dt className="oryx-muted text-xs">{label}</dt>
                    <dd className="mt-0.5 text-[13px] font-semibold">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : (
          <EmptyState title={t('erp.hr.salaryRestrictedTitle')} hint={t('erp.hr.salaryRestrictedHint')} />
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-bold">{pick('Contracts', 'العقود')}</h3>
        {d.contracts.length ? (
          <TableShell label={pick('Contracts', 'العقود')}>
            <thead>
              <tr>
                <th>{pick('Contract', 'العقد')}</th>
                <th>{pick('Type', 'النوع')}</th>
                <th>{pick('From', 'من')}</th>
                <th>{pick('To', 'إلى')}</th>
                <th>{t('common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.contracts.map((c) => (
                <tr key={c.id} data-testid={`contract-row-${c.contractNumber}`}>
                  <td className="font-mono text-[12px]">{c.contractNumber}</td>
                  <td className="text-[12px]">{t(`erp.hr.contractType.${c.type}` as const)}</td>
                  <td className="text-[12px]">{day(c.startDate)}</td>
                  <td className="text-[12px]">{day(c.endDate)}</td>
                  <td>
                    <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {t(`erp.hr.contractStatus.${c.status}` as const)}
                    </Badge>
                  </td>
                  <td className="text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t('print.preview')} ${c.contractNumber}`}
                      onClick={() => setContractPreview(c)}
                      data-testid={`contract-preview-${c.contractNumber}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title={t('common.empty')} hint={pick('No contracts recorded.', 'لا توجد عقود مسجلة.')} />
        )}
      </Card>

      {contractPreview ? (
        <RecordPreview
          open
          title={`${pick('Contract', 'العقد')} ${contractPreview.contractNumber}`}
          subtitle={name(e.fullNameEn, e.fullNameAr)}
          onClose={() => setContractPreview(null)}
          fields={[
            { label: pick('Contract', 'العقد'), value: contractPreview.contractNumber },
            { label: pick('Type', 'النوع'), value: contractPreview.type },
            { label: pick('From', 'من'), value: day(contractPreview.startDate) },
            { label: pick('To', 'إلى'), value: day(contractPreview.endDate) },
            { label: t('common.status'), value: <Badge tone={contractPreview.status === 'ACTIVE' ? 'success' : 'neutral'}>{contractPreview.status}</Badge> },
            { label: pick('Employee', 'الموظف'), value: `${name(e.fullNameEn, e.fullNameAr)} · ${e.code}` },
          ]}
          printInput={recordPrintInput({
            locale,
            titleEn: 'Employment contract',
            titleAr: 'عقد العمل',
            subjectName: name(e.fullNameEn, e.fullNameAr),
            subjectCode: contractPreview.contractNumber,
            companyNameEn: companyName(memberships, companyId).en,
            companyNameAr: companyName(memberships, companyId).ar,
            windowLabel: `${day(contractPreview.startDate)} → ${day(contractPreview.endDate)}`,
            fields: [
              { label: pick('Contract', 'العقد'), value: contractPreview.contractNumber },
              { label: pick('Employee', 'الموظف'), value: `${name(e.fullNameEn, e.fullNameAr)} · ${e.code}` },
              { label: pick('Type', 'النوع'), value: contractPreview.type },
              { label: pick('From', 'من'), value: day(contractPreview.startDate) },
              { label: pick('To', 'إلى'), value: day(contractPreview.endDate) },
              { label: t('common.status'), value: contractPreview.status },
            ],
          })}
          csvName={`contract-${contractPreview.contractNumber}`}
          attachment={{ entityType: 'CONTRACT', entityId: contractPreview.id, canManage: canManageDocs }}
        />
      ) : null}

      <LegacyDocumentsCard employeeId={employeeId} canRead={can('erp.hr.document.read')} />

      <Card>
        <h3 className="mb-3 text-sm font-bold">{pick('Documents and attachments', 'المستندات والمرفقات')}</h3>
        {canManageDocs ? (
          <div className="mb-3">
            <PortraitUpload employeeId={employeeId} onUploaded={() => setPhotoVersion((v) => v + 1)} />
          </div>
        ) : null}
        <AttachmentsPanel entityType="EMPLOYEE" entityId={employeeId} canManage={canManageDocs} categorised />
      </Card>

      {editing ? (
        <EmployeeModal
          open
          employee={editing as never}
          departments={(departments.data?.items ?? []).map((dep) => ({ id: dep.id, nameEn: dep.nameEn }))}
          jobTitles={(jobTitles.data?.items ?? []).map((j) => ({ id: j.id, nameEn: j.nameEn }))}
          branches={(branches.data?.items ?? []).map((b) => ({ id: b.id, nameEn: b.nameEn }))}
          canManage={canManageDocs}
          onClose={() => setEditing(null)}
          onCreated={() => {
            card.reload();
            setPhotoVersion((v) => v + 1);
          }}
          onSaved={() => card.reload()}
        />
      ) : null}
    </div>
  );
}

/**
 * The HR document register predates the shared attachment store. Its rows are
 * still live records with their own confidentiality flag, so the file lists
 * them read-only instead of hiding documents an operator already filed there.
 */
function LegacyDocumentsCard({ employeeId, canRead }: { employeeId: string; canRead: boolean }) {
  const { t } = useUi();
  const { pick } = useLabels();
  const docs = useAsync(
    () => (canRead ? api.employeeDocuments(employeeId) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 0 })),
    [employeeId, canRead],
  );
  const [error, setError] = useState<string | null>(null);

  const open = async (documentId: string, name: string, download: boolean) => {
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
        window.open(url, '_blank', 'noopener');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const rows = docs.data?.items ?? [];
  if (!canRead || !rows.length) return null;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-bold">{pick('Document register', 'سجل المستندات')}</h3>
      {error ? <ErrorBanner message={error} /> : null}
      <TableShell label={pick('Document register', 'سجل المستندات')}>
        <thead>
          <tr>
            <th>{pick('Title', 'العنوان')}</th>
            <th>{pick('Category', 'التصنيف')}</th>
            <th>{pick('Issued', 'تاريخ الإصدار')}</th>
            <th>{pick('Expires', 'تاريخ الانتهاء')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} data-testid={`legacy-document-${d.id}`}>
              <td className="text-[12.5px]">{d.title}</td>
              <td className="text-[12px]">{t(`erp.hr.docCategory.${d.category}` as const)}</td>
              <td className="text-[12px]">{day(d.issuedAt)}</td>
              <td className="text-[12px]">{day(d.expiresAt)}</td>
              <td className="text-end">
                {d.hasFile ? (
                  <span className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('print.preview')}
                      onClick={() => void open(d.id, d.fileName ?? d.title, false)}
                      data-testid={`legacy-doc-preview-${d.id}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('attachments.download')}
                      onClick={() => void open(d.id, d.fileName ?? d.title, true)}
                      data-testid={`legacy-doc-download-${d.id}`}
                    >
                      <Icon name="download" size={14} />
                    </Button>
                  </span>
                ) : (
                  <span className="oryx-faint text-[11px]">{d.fileRef ?? '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </Card>
  );
}

/**
 * Files the portrait as a PHOTO attachment on the employee, which is the same
 * record the card reads. Uploading a new one supersedes the previous portrait
 * without deleting it, so the history of what was on file survives.
 */
function PortraitUpload({ employeeId, onUploaded }: { employeeId: string; onUploaded: () => void }) {
  const { t } = useUi();
  const { pick } = useLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (selected: FileList | null) => {
    const file = selected?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadAttachment('EMPLOYEE', employeeId, file, 'PHOTO');
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      {error ? <ErrorBanner message={error} /> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
        data-testid="employee-photo-input"
      />
      <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()} data-testid="employee-photo-upload">
        <Icon name="plus" size={14} />
        {pick('Upload photo', 'رفع صورة الموظف')}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ payroll ledger

function PayrollTab({ employeeId, employeeName, employeeCode }: { employeeId: string; employeeName: string; employeeCode: string }) {
  const { t } = useUi();
  const { locale, pick } = useLabels();
  const { can, memberships, companyId } = useAuth();
  const canSalary = can('erp.hr.salary.read');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const ledger = useAsync(
    () =>
      canSalary
        ? api.hrEmployeeFile.payroll(employeeId, { from: from || undefined, to: to || undefined })
        : Promise.resolve(null),
    [employeeId, canSalary, from, to],
  );
  const { busy, error, run } = useTableAction();
  const company = companyName(memberships, companyId);
  const [payslip, setPayslip] = useState<EmployeePayslipRow | null>(null);

  if (!canSalary) {
    return <EmptyState title={t('erp.hr.salaryRestrictedTitle')} hint={t('erp.hr.salaryRestrictedHint')} />;
  }
  if (ledger.loading) return <Skeleton height={240} />;
  if (ledger.error) return <ErrorBanner message={ledger.error} onRetry={ledger.reload} />;

  const d: EmployeePayrollLedgerDto | null = ledger.data;
  if (!d) return null;

  const columns: PrintTableColumn[] = [
    { key: 'period', labelEn: 'Period', labelAr: 'الفترة' },
    { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
    { key: 'basic', labelEn: 'Basic', labelAr: 'الأساسي', align: 'end' },
    { key: 'allowances', labelEn: 'Allowances', labelAr: 'البدلات', align: 'end' },
    { key: 'deductions', labelEn: 'Deductions', labelAr: 'الخصومات', align: 'end' },
    { key: 'net', labelEn: 'Net', labelAr: 'الصافي', align: 'end' },
    { key: 'paidAt', labelEn: 'Paid', labelAr: 'تاريخ الصرف' },
  ];

  const rows = d.items.map((p) => ({
    period: `${p.periodCode} (${day(p.periodStart)} → ${day(p.periodEnd)})`,
    status: t(`erp.hr.paymentStatus.${p.paymentStatus}` as const),
    basic: money(p.basicMinor, p.currency),
    allowances: money(p.allowancesMinor, p.currency),
    deductions: money(p.deductionsMinor, p.currency),
    net: money(p.netMinor, p.currency),
    paidAt: day(p.paidAt),
  }));

  const currency = d.totals.currency ?? undefined;
  const printInput: PrintTableInput = {
    locale,
    columns,
    rows,
    meta: {
      titleEn: 'Payroll ledger',
      titleAr: 'سجل الرواتب',
      subjectNameEn: employeeName,
      subjectNameAr: employeeName,
      subjectCode: employeeCode,
      companyNameEn: company.en,
      companyNameAr: company.ar,
      windowLabel: `${from || day(d.from) || '…'} → ${to || day(d.to) || '…'}`,
      totals: [
        { labelEn: 'Basic', labelAr: 'الأساسي', value: money(d.totals.basicMinor, currency) },
        { labelEn: 'Allowances', labelAr: 'البدلات', value: money(d.totals.allowancesMinor, currency) },
        { labelEn: 'Deductions', labelAr: 'الخصومات', value: money(d.totals.deductionsMinor, currency) },
        { labelEn: 'Net', labelAr: 'الصافي', value: money(d.totals.netMinor, currency) },
      ],
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('common.from')}>
              <input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="payroll-from" />
            </Field>
            <Field label={t('common.to')}>
              <input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="payroll-to" />
            </Field>
            {from || to ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
                data-testid="payroll-all-history"
              >
                {pick('Full history', 'السجل الكامل')}
              </Button>
            ) : null}
          </div>
          <TableActions
            busy={busy}
            onPrint={() => void run(() => openPrintTable(printInput, true))}
            onCsv={() => void run(() => downloadTableCsv(printInput, `payroll-${employeeCode}`))}
            csvLabel={pick('Excel (CSV)', 'Excel (CSV)')}
          />
        </div>
        {error ? <div className="p-4"><ErrorBanner message={error} /></div> : null}
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {[
            [pick('Basic', 'الأساسي'), d.totals.basicMinor],
            [pick('Allowances', 'البدلات'), d.totals.allowancesMinor],
            [pick('Deductions', 'الخصومات'), d.totals.deductionsMinor],
            [pick('Net', 'الصافي'), d.totals.netMinor],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-[var(--border)] p-3">
              <div className="oryx-muted text-xs">{String(label)}</div>
              <div className="mt-1 font-bold tabular-nums">{money(Number(value), currency)}</div>
            </div>
          ))}
        </div>
        {d.items.length === 0 ? (
          <EmptyState title={t('common.empty')} hint={pick('No payslips in this window.', 'لا توجد قسائم رواتب في هذه الفترة.')} />
        ) : (
          <TableShell label={pick('Payroll ledger', 'سجل الرواتب')}>
            <thead>
              <tr>
                <th>{pick('Period', 'الفترة')}</th>
                <th>{pick('Status', 'الحالة')}</th>
                <th className="text-end">{pick('Basic', 'الأساسي')}</th>
                <th className="text-end">{pick('Allowances', 'البدلات')}</th>
                <th className="text-end">{pick('Deductions', 'الخصومات')}</th>
                <th className="text-end">{pick('Net', 'الصافي')}</th>
                <th>{pick('Paid', 'تاريخ الصرف')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.items.map((p) => (
                <tr key={p.id} data-testid={`payslip-row-${p.id}`}>
                  <td className="text-[12px]">
                    {p.periodCode}
                    <div className="oryx-muted text-[11px]">
                      {day(p.periodStart)} → {day(p.periodEnd)}
                    </div>
                  </td>
                  <td>
                    <Badge tone={p.paymentStatus === 'PAID' ? 'success' : p.paymentStatus === 'APPROVED' ? 'warning' : 'neutral'}>
                      {t(`erp.hr.paymentStatus.${p.paymentStatus}` as const)}
                    </Badge>
                  </td>
                  <td className="text-end tabular-nums">{money(p.basicMinor, p.currency)}</td>
                  <td className="text-end tabular-nums">{money(p.allowancesMinor, p.currency)}</td>
                  <td className="text-end tabular-nums">{money(p.deductionsMinor, p.currency)}</td>
                  <td className="text-end font-semibold tabular-nums">{money(p.netMinor, p.currency)}</td>
                  <td className="text-[12px]">{day(p.paidAt)}</td>
                  <td className="text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPayslip(p)}
                      title={t('print.preview')}
                      data-testid={`payslip-view-${p.id}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
      <PayslipModal payslip={payslip} employeeName={employeeName} employeeCode={employeeCode} onClose={() => setPayslip(null)} />
    </div>
  );
}

/**
 * One payslip, exactly as the stored run recorded it.
 *
 * The figures come from the payslip row rather than being recomputed from the
 * live salary structure, so a payslip opened years later still shows what was
 * paid. The PDF is the API's own document, so the printout and this screen
 * cannot disagree.
 */
function PayslipModal({
  payslip,
  employeeName,
  employeeCode,
  onClose,
}: {
  payslip: EmployeePayslipRow | null;
  employeeName: string;
  employeeCode: string;
  onClose: () => void;
}) {
  const { t } = useUi();
  const { locale, pick } = useLabels();
  const { memberships, companyId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const company = companyName(memberships, companyId);

  const download = async () => {
    if (!payslip) return;
    setBusy(true);
    setError(null);
    try {
      const url = await api.payslipPdfBlobUrl(payslip.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${employeeCode}-${payslip.periodCode}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (!payslip) return null;
  const currency = payslip.currency || undefined;
  const rows: Array<[string, string]> = [
    [pick('Employee', 'الموظف'), employeeName],
    [pick('Payroll run', 'دورة الرواتب'), payslip.runNumber],
    [pick('Period', 'الفترة'), `${payslip.periodCode} · ${day(payslip.periodStart)} → ${day(payslip.periodEnd)}`],
    [pick('Status', 'الحالة'), t(`erp.hr.paymentStatus.${payslip.paymentStatus}` as const)],
    [pick('Paid on', 'تاريخ الصرف'), day(payslip.paidAt)],
    [pick('Basic', 'الراتب الأساسي'), money(payslip.basicMinor, currency)],
    [pick('Allowances', 'البدلات'), money(payslip.allowancesMinor, currency)],
    [pick('Deductions', 'الخصومات'), money(payslip.deductionsMinor, currency)],
    [pick('Advance deduction', 'خصم السلف'), money(payslip.advanceDeductionMinor, currency)],
    [pick('Gross', 'الإجمالي'), money(payslip.grossMinor, currency)],
    [pick('Net pay', 'صافي الراتب'), money(payslip.netMinor, currency)],
    [pick('Worked hours', 'ساعات العمل'), hours(payslip.workedMinutes)],
    [pick('Overtime hours', 'ساعات إضافية'), hours(payslip.overtimeMinutes)],
    [pick('Late minutes', 'دقائق التأخير'), String(payslip.lateMinutes)],
    [pick('Absence days', 'أيام الغياب'), String(payslip.absenceDays)],
    [pick('Paid leave days', 'أيام إجازة مدفوعة'), String(payslip.paidLeaveDays)],
  ];

  return (
    <Modal
      open
      title={`${t('erp.hr.payslipPdf')} — ${payslip.periodCode}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button
            disabled={busy}
            onClick={() =>
              openPrintTable(
                recordPrintInput({
                  locale,
                  titleEn: 'Payslip',
                  titleAr: 'قسيمة راتب',
                  subjectName: employeeName,
                  subjectCode: employeeCode,
                  companyNameEn: company.en,
                  companyNameAr: company.ar,
                  windowLabel: payslip.periodCode,
                  fields: rows.map(([label, value]) => ({ label, value })),
                }),
                true,
              )
            }
            data-testid="payslip-print"
          >
            <Icon name="print" size={14} />
            {t('print.print')}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              downloadTableCsv(
                recordPrintInput({
                  locale,
                  titleEn: 'Payslip',
                  titleAr: 'قسيمة راتب',
                  subjectName: employeeName,
                  subjectCode: employeeCode,
                  companyNameEn: company.en,
                  companyNameAr: company.ar,
                  windowLabel: payslip.periodCode,
                  fields: rows.map(([label, value]) => ({ label, value })),
                }),
                `payslip-${employeeCode}-${payslip.periodCode}`,
              )
            }
            data-testid="payslip-csv"
          >
            <Icon name="download" size={14} />
            {pick('Excel (CSV)', 'Excel (CSV)')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={download} data-testid="payslip-download">
            <Icon name="download" size={14} />
            {t('erp.hr.payslipPdf')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="payslip-detail">
        {rows.map(([label, value]) => (
          <div key={label} className="border-b border-[var(--border)] pb-2">
            <dt className="oryx-muted text-xs">{label}</dt>
            <dd className="mt-0.5 text-[13px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {payslip.lines.length ? (
        <div className="mt-4">
          <TableShell label={pick('Components', 'المكونات')}>
            <thead>
              <tr>
                <th>{pick('Component', 'المكوّن')}</th>
                <th>{pick('Type', 'النوع')}</th>
                <th className="text-end">{pick('Amount', 'المبلغ')}</th>
              </tr>
            </thead>
            <tbody>
              {payslip.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.nameEn || l.nameAr || l.code}</td>
                  <td className="text-[12px]">{t(`erp.hr.componentType.${l.type}` as const)}</td>
                  <td className="text-end tabular-nums">{money(l.amountMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      ) : null}
    </Modal>
  );
}

// -------------------------------------------------------------------- leave

function LeaveTab({ employeeId, employeeName, employeeCode }: { employeeId: string; employeeName: string; employeeCode: string }) {
  const { t } = useUi();
  const { ar, locale, pick } = useLabels();
  const { can, memberships, companyId } = useAuth();
  const leave = useAsync(() => api.hrEmployeeFile.leave(employeeId), [employeeId]);
  const { busy, error, run } = useTableAction();
  const company = companyName(memberships, companyId);
  const canRequest = can('erp.hr.leave.request');
  const [preview, setPreview] = useState<EmployeeLeaveTabDto['items'][number] | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  if (leave.loading) return <Skeleton height={220} />;
  if (leave.error) return <ErrorBanner message={leave.error} onRetry={leave.reload} />;
  const d: EmployeeLeaveTabDto | null = leave.data;
  if (!d) return null;

  const columns: PrintTableColumn[] = [
    { key: 'type', labelEn: 'Leave type', labelAr: 'نوع الإجازة' },
    { key: 'start', labelEn: 'From', labelAr: 'من' },
    { key: 'end', labelEn: 'To', labelAr: 'إلى' },
    { key: 'days', labelEn: 'Days', labelAr: 'الأيام', align: 'end' },
    { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
    { key: 'approver', labelEn: 'Approved by', labelAr: 'الموافقة' },
  ];
  const rows = d.items.map((r) => ({
    type: ar ? r.leaveTypeNameAr || r.leaveTypeNameEn : r.leaveTypeNameEn || r.leaveTypeNameAr,
    start: day(r.startDate),
    end: day(r.endDate),
    days: String(r.days),
    status: t(`erp.hr.leaveStatus.${r.status}` as const),
    approver: (ar ? r.approvedByNameAr || r.approvedByNameEn : r.approvedByNameEn || r.approvedByNameAr) || '—',
  }));
  const printInput: PrintTableInput = {
    locale,
    columns,
    rows,
    meta: {
      titleEn: 'Leave history',
      titleAr: 'سجل الإجازات',
      companyNameEn: company.en,
      companyNameAr: company.ar,
      windowLabel: String(d.year),
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <h3 className="text-sm font-bold">{pick('Leave balances', 'أرصدة الإجازات')} · {d.year}</h3>
          <TableActions
            busy={busy}
            onPrint={() => void run(() => openPrintTable(printInput, true))}
            onCsv={() => void run(() => downloadTableCsv(printInput, `leave-${employeeId}`))}
            csvLabel={pick('Excel (CSV)', 'Excel (CSV)')}
          />
        </div>
        {error ? <div className="p-4"><ErrorBanner message={error} /></div> : null}
        {d.balances.length ? (
          <TableShell label={pick('Leave balances', 'أرصدة الإجازات')}>
            <thead>
              <tr>
                <th>{pick('Leave type', 'نوع الإجازة')}</th>
                <th className="text-end">{pick('Entitled', 'المستحق')}</th>
                <th className="text-end">{pick('Accrued', 'المتراكم')}</th>
                <th className="text-end">{pick('Used', 'المستخدم')}</th>
                <th className="text-end">{pick('Pending', 'المعلّق')}</th>
                <th className="text-end">{pick('Remaining', 'المتبقي')}</th>
              </tr>
            </thead>
            <tbody>
              {d.balances.map((b) => (
                <tr key={b.id}>
                  <td>{ar ? b.leaveTypeNameAr || b.leaveTypeNameEn : b.leaveTypeNameEn || b.leaveTypeNameAr}</td>
                  <td className="text-end tabular-nums">{b.entitledDays}</td>
                  <td className="text-end tabular-nums">{b.accruedDays}</td>
                  <td className="text-end tabular-nums">{b.usedDays}</td>
                  <td className="text-end tabular-nums">{b.pendingDays}</td>
                  <td className="text-end font-semibold tabular-nums">{b.remainingDays}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title={t('common.empty')} hint={pick('No leave balances this year.', 'لا توجد أرصدة إجازات لهذا العام.')} />
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <h3 className="text-sm font-bold">{pick('Leave requests', 'طلبات الإجازة')}</h3>
          {canRequest ? (
            <Button size="sm" onClick={() => setRequestOpen(true)} data-testid="leave-new-request">
              <Icon name="plus" size={14} />
              {pick('New leave request', 'طلب إجازة جديد')}
            </Button>
          ) : null}
        </div>
        {d.items.length ? (
          <TableShell label={pick('Leave requests', 'طلبات الإجازة')}>
            <thead>
              <tr>
                <th>{pick('Leave type', 'نوع الإجازة')}</th>
                <th>{pick('From', 'من')}</th>
                <th>{pick('To', 'إلى')}</th>
                <th className="text-end">{pick('Days', 'الأيام')}</th>
                <th>{pick('Status', 'الحالة')}</th>
                <th>{pick('Approved by', 'الموافقة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.items.map((r) => (
                <tr key={r.id} data-testid={`leave-row-${r.id}`}>
                  <td>{ar ? r.leaveTypeNameAr || r.leaveTypeNameEn : r.leaveTypeNameEn || r.leaveTypeNameAr}</td>
                  <td className="text-[12px]">{day(r.startDate)}</td>
                  <td className="text-[12px]">{day(r.endDate)}</td>
                  <td className="text-end tabular-nums">{r.days}</td>
                  <td>
                    <Badge tone={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'neutral'}>
                      {t(`erp.hr.leaveStatus.${r.status}` as const)}
                    </Badge>
                  </td>
                  <td className="text-[12px]">
                    {(ar ? r.approvedByNameAr || r.approvedByNameEn : r.approvedByNameEn || r.approvedByNameAr) || '—'}
                  </td>
                  <td className="text-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t('print.preview')} ${r.id}`}
                      onClick={() => setPreview(r)}
                      data-testid={`leave-preview-${r.id}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState title={t('common.empty')} hint={pick('No leave requests recorded.', 'لا توجد طلبات إجازة مسجلة.')} />
        )}
      </Card>

      {d.items.length ? (
        <Card>
          <h3 className="mb-3 text-sm font-bold">{pick('Supporting documents', 'المرفقات الداعمة')}</h3>
          <div className="flex flex-col gap-3">
            {d.items.slice(0, 5).map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                <p className="m-0 mb-2 text-[12.5px] font-semibold">
                  {ar ? r.leaveTypeNameAr || r.leaveTypeNameEn : r.leaveTypeNameEn || r.leaveTypeNameAr} ·{' '}
                  {day(r.startDate)} → {day(r.endDate)}
                </p>
                <AttachmentsPanel entityType="LEAVE_REQUEST" entityId={r.id} canManage={canRequest} categorised />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {preview ? (
        <RecordPreview
          open
          title={`${pick('Leave request', 'طلب إجازة')} — ${ar ? preview.leaveTypeNameAr || preview.leaveTypeNameEn : preview.leaveTypeNameEn || preview.leaveTypeNameAr}`}
          subtitle={employeeName}
          onClose={() => setPreview(null)}
          fields={[
            {
              label: pick('Leave type', 'نوع الإجازة'),
              value: ar ? preview.leaveTypeNameAr || preview.leaveTypeNameEn : preview.leaveTypeNameEn || preview.leaveTypeNameAr,
            },
            { label: pick('From', 'من'), value: day(preview.startDate) },
            { label: pick('To', 'إلى'), value: day(preview.endDate) },
            { label: pick('Days', 'الأيام'), value: String(preview.days) },
            {
              label: pick('Status', 'الحالة'),
              value: (
                <Badge tone={preview.status === 'APPROVED' ? 'success' : preview.status === 'REJECTED' ? 'danger' : 'neutral'}>
                  {t(`erp.hr.leaveStatus.${preview.status}` as const)}
                </Badge>
              ),
            },
            {
              label: pick('Approved by', 'الموافقة'),
              value: (ar ? preview.approvedByNameAr || preview.approvedByNameEn : preview.approvedByNameEn || preview.approvedByNameAr) || '—',
            },
            { label: pick('Reason', 'السبب'), value: preview.reason || '—', wide: true },
            { label: pick('Decision note', 'ملاحظة القرار'), value: preview.decisionNote || '—', wide: true },
          ]}
          printInput={recordPrintInput({
            locale,
            titleEn: 'Leave request',
            titleAr: 'طلب إجازة',
            subjectName: employeeName,
            subjectCode: employeeCode,
            companyNameEn: company.en,
            companyNameAr: company.ar,
            windowLabel: `${day(preview.startDate)} → ${day(preview.endDate)}`,
            fields: [
              {
                label: pick('Leave type', 'نوع الإجازة'),
                value: ar ? preview.leaveTypeNameAr || preview.leaveTypeNameEn : preview.leaveTypeNameEn || preview.leaveTypeNameAr,
              },
              { label: pick('From', 'من'), value: day(preview.startDate) },
              { label: pick('To', 'إلى'), value: day(preview.endDate) },
              { label: pick('Days', 'الأيام'), value: String(preview.days) },
              { label: pick('Status', 'الحالة'), value: preview.status },
              { label: pick('Reason', 'السبب'), value: preview.reason || '—' },
            ],
          })}
          csvName={`leave-${preview.id}`}
          attachment={{ entityType: 'LEAVE_REQUEST', entityId: preview.id, canManage: canRequest }}
        />
      ) : null}

      <LeaveRequestModal
        open={requestOpen}
        employeeId={employeeId}
        balances={d.balances}
        onClose={() => setRequestOpen(false)}
        onSaved={leave.reload}
      />
    </div>
  );
}

/**
 * A leave request filed from inside the employee's file.
 *
 * The balance list is the one already loaded for the tab, so the form cannot
 * offer a leave type this employee has no balance row for. The API still
 * enforces the balance; this only avoids an avoidable rejection.
 */
function LeaveRequestModal({
  open,
  employeeId,
  balances,
  onClose,
  onSaved,
}: {
  open: boolean;
  employeeId: string;
  balances: EmployeeLeaveTabDto['balances'];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const { pick } = useLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPending([]);
    setForm({ leaveTypeId: balances[0]?.leaveTypeId ?? '', startDate: '', endDate: '', reason: '' });
  }, [open, balances]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.requestLeave({
        employeeId,
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      });
      if (pending.length) {
        await uploadPendingAttachments('LEAVE_REQUEST', created.id, pending);
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
      title={pick('New leave request', 'طلب إجازة جديد')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.leaveTypeId || !form.startDate || !form.endDate}
            onClick={submit}
            data-testid="leave-request-save"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={pick('Leave type', 'نوع الإجازة')} required>
          <select
            className="oryx-select"
            value={form.leaveTypeId}
            onChange={(e) => setForm((prev) => ({ ...prev, leaveTypeId: e.target.value }))}
            data-testid="leave-request-type"
          >
            {balances.map((b) => (
              <option key={b.id} value={b.leaveTypeId}>
                {`${b.leaveTypeNameEn || b.leaveTypeNameAr} · ${pick('remaining', 'المتبقي')} ${b.remainingDays}`}
              </option>
            ))}
          </select>
        </Field>
        <div />
        <Field label={t('common.from')} required>
          <input type="date" className="oryx-input" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} data-testid="leave-request-from" />
        </Field>
        <Field label={t('common.to')} required>
          <input type="date" className="oryx-input" value={form.endDate} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} data-testid="leave-request-to" />
        </Field>
        <Field label={pick('Reason', 'السبب')}>
          <input className="oryx-input" value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} data-testid="leave-request-reason" />
        </Field>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <PendingAttachments files={pending} onChange={setPending} canManage />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- penalties

const PENALTY_ACTIONS = ['WARNING', 'NOTICE', 'FINE', 'SUSPENSION', 'TERMINATION'] as const;

function PenaltiesTab({ employeeId, employeeName, employeeCode }: { employeeId: string; employeeName: string; employeeCode: string }) {
  const { t } = useUi();
  const { locale, pick } = useLabels();
  const { can, memberships, companyId } = useAuth();
  const canManage = can('erp.hr.penalty.manage');
  const list = useAsync(() => api.hrEmployeeFile.penalties(employeeId), [employeeId]);
  const { busy, error, run } = useTableAction();
  const company = companyName(memberships, companyId);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EmployeePenaltyDto | null>(null);

  const columns: PrintTableColumn[] = [
    { key: 'date', labelEn: 'Date', labelAr: 'التاريخ' },
    { key: 'type', labelEn: 'Action', labelAr: 'الإجراء' },
    { key: 'reason', labelEn: 'Reason', labelAr: 'السبب' },
    { key: 'amount', labelEn: 'Amount', labelAr: 'المبلغ', align: 'end' },
    { key: 'by', labelEn: 'Decided by', labelAr: 'المسؤول' },
  ];

  const items: EmployeePenaltyDto[] = list.data?.items ?? [];
  const rows = items.map((p) => ({
    date: day(p.effectiveDate),
    type: t(`erp.hr.actionType.${p.actionType}` as const),
    reason: p.reason,
    amount: p.amountMinor !== undefined ? money(p.amountMinor, p.currency) : '—',
    by: p.decidedByName || '—',
  }));
  const printInput: PrintTableInput = {
    locale,
    columns,
    rows,
    meta: {
      titleEn: 'Disciplinary record',
      titleAr: 'سجل العقوبات والإجراءات الإدارية',
      companyNameEn: company.en,
      companyNameAr: company.ar,
    },
  };

  const remove = async (p: EmployeePenaltyDto) => {
    await run(async () => {
      await api.hrEmployeeFile.deletePenalty(p.id);
      await list.reload();
    });
  };

  if (list.loading) return <Skeleton height={200} />;
  if (list.error) return <ErrorBanner message={list.error} onRetry={list.reload} />;

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <h3 className="text-sm font-bold">{pick('Disciplinary actions', 'العقوبات والإجراءات الإدارية')}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <TableActions
              busy={busy}
              onPrint={() => void run(() => openPrintTable(printInput, true))}
              onCsv={() => void run(() => downloadTableCsv(printInput, `penalties-${employeeId}`))}
              csvLabel={pick('Excel (CSV)', 'Excel (CSV)')}
            />
            {canManage ? (
              <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="add-penalty">
                <Icon name="plus" size={14} />
                {pick('Record action', 'تسجيل إجراء')}
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <div className="p-4"><ErrorBanner message={error} /></div> : null}
        {items.length === 0 ? (
          <EmptyState title={t('common.empty')} hint={pick('No disciplinary actions recorded.', 'لا توجد إجراءات مسجلة.')} />
        ) : (
          <TableShell label={pick('Disciplinary actions', 'العقوبات')}>
            <thead>
              <tr>
                <th>{pick('Date', 'التاريخ')}</th>
                <th>{pick('Action', 'الإجراء')}</th>
                <th>{pick('Reason', 'السبب')}</th>
                <th className="text-end">{pick('Amount', 'المبلغ')}</th>
                <th>{pick('Decided by', 'المسؤول')}</th>
                <th>{pick('Attachments', 'المرفقات')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} data-testid={`penalty-row-${p.id}`}>
                  <td className="text-[12px]">{day(p.effectiveDate)}</td>
                  <td>
                    <Badge tone={p.actionType === 'TERMINATION' ? 'danger' : 'warning'}>
                      {t(`erp.hr.actionType.${p.actionType}` as const)}
                    </Badge>
                  </td>
                  <td className="text-[12.5px]">{p.reason}</td>
                  <td className="text-end tabular-nums">
                    {p.amountMinor !== undefined ? money(p.amountMinor, p.currency) : '—'}
                  </td>
                  <td className="text-[12px]">{p.decidedByName || '—'}</td>
                  <td>
                    <AttachmentsPanel
                      entityType="EMPLOYEE_PENALTY"
                      entityId={p.id}
                      canManage={canManage}
                      categorised
                    />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t('print.preview')} ${p.actionType}`}
                        onClick={() => setPreview(p)}
                        data-testid={`penalty-preview-${p.id}`}
                      >
                        <Icon name="eye" size={14} />
                      </Button>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('common.delete')}
                          disabled={busy}
                          onClick={() => void remove(p)}
                          data-testid={`delete-penalty-${p.id}`}
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

      {open ? (
        <PenaltyModal
          employeeId={employeeId}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await list.reload();
          }}
        />
      ) : null}

      {preview ? (
        <RecordPreview
          open
          title={`${pick('Disciplinary action', 'إجراء إداري')} — ${preview.actionType}`}
          subtitle={preview.decidedByName ?? undefined}
          onClose={() => setPreview(null)}
          fields={[
            {
              label: pick('Action', 'الإجراء'),
              value: (
                <Badge tone={preview.actionType === 'TERMINATION' ? 'danger' : 'warning'}>
                  {t(`erp.hr.actionType.${preview.actionType}` as const)}
                </Badge>
              ),
            },
            { label: pick('Effective date', 'تاريخ السريان'), value: day(preview.effectiveDate) },
            { label: pick('Decided by', 'المسؤول'), value: preview.decidedByName || '—' },
            { label: pick('Amount', 'المبلغ'), value: preview.amountMinor !== undefined ? money(preview.amountMinor, preview.currency) : '—' },
            { label: pick('Reason', 'السبب'), value: preview.reason, wide: true },
            { label: pick('Notes', 'ملاحظات'), value: preview.notes || '—', wide: true },
          ]}
          printInput={recordPrintInput({
            locale,
            titleEn: 'Disciplinary action',
            titleAr: 'إجراء إداري',
            subjectName: employeeName,
            subjectCode: employeeCode,
            companyNameEn: company.en,
            companyNameAr: company.ar,
            windowLabel: day(preview.effectiveDate),
            fields: [
              { label: pick('Action', 'الإجراء'), value: preview.actionType },
              { label: pick('Effective date', 'تاريخ السريان'), value: day(preview.effectiveDate) },
              { label: pick('Decided by', 'المسؤول'), value: preview.decidedByName || '—' },
              { label: pick('Amount', 'المبلغ'), value: preview.amountMinor !== undefined ? money(preview.amountMinor, preview.currency) : '—' },
              { label: pick('Reason', 'السبب'), value: preview.reason },
            ],
          })}
          csvName={`penalty-${preview.id}`}
          attachment={{ entityType: 'EMPLOYEE_PENALTY', entityId: preview.id, canManage }}
        />
      ) : null}
    </div>
  );
}

function PenaltyModal({
  employeeId,
  onClose,
  onSaved,
}: {
  employeeId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const { pick } = useLabels();
  const { can } = useAuth();
  const canSalary = can('erp.hr.salary.read');
  const [actionType, setActionType] = useState<string>('WARNING');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [decidedByName, setDecidedByName] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.hrEmployeeFile.createPenalty(employeeId, {
        actionType,
        reason,
        effectiveDate,
        ...(canSalary && amount ? { amountMinor: Math.round(Number(amount) * 1000) } : {}),
        ...(decidedByName ? { decidedByName } : {}),
        ...(notes ? { notes } : {}),
      });
      if (pending.length) await uploadPendingAttachments('EMPLOYEE_PENALTY', saved.id, pending);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={pick('Record a disciplinary action', 'تسجيل إجراء إداري')}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" variant="primary" disabled={busy || !reason.trim()} onClick={() => void submit()} data-testid="save-penalty">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <ErrorBanner message={error} /> : null}
        <Field label={pick('Action type', 'نوع الإجراء')} required>
          <select className="oryx-select" value={actionType} onChange={(e) => setActionType(e.target.value)} data-testid="penalty-type">
            {PENALTY_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label={pick('Reason', 'السبب')} required>
          <input className="oryx-input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="penalty-reason" />
        </Field>
        <Field label={pick('Effective date', 'تاريخ السريان')} required>
          <input type="date" className="oryx-input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} data-testid="penalty-date" />
        </Field>
        {canSalary ? (
          <Field label={pick('Fine amount (BHD)', 'قيمة الغرامة (د.ب)')}>
            <input className="oryx-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="penalty-amount" />
          </Field>
        ) : null}
        <Field label={pick('Decided by', 'الجهة القرار')}>
          <input className="oryx-input" value={decidedByName} onChange={(e) => setDecidedByName(e.target.value)} data-testid="penalty-by" />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="penalty-notes" />
        </Field>
        <div className="border-t border-[var(--border)] pt-3">
          <PendingAttachments files={pending} onChange={setPending} canManage />
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ bonuses

function BonusesTab({ employeeId, employeeName, employeeCode }: { employeeId: string; employeeName: string; employeeCode: string }) {
  const { t } = useUi();
  const { locale, pick } = useLabels();
  const { can, memberships, companyId } = useAuth();
  const canManage = can('erp.hr.bonus.manage');
  const list = useAsync(
    () => (can('erp.hr.salary.read') ? api.hrEmployeeFile.bonuses(employeeId) : Promise.resolve(null)),
    [employeeId],
  );
  const { busy, error, run } = useTableAction();
  const company = companyName(memberships, companyId);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EmployeeBonusDto | null>(null);

  const columns: PrintTableColumn[] = [
    { key: 'date', labelEn: 'Granted', labelAr: 'تاريخ المنح' },
    { key: 'type', labelEn: 'Type', labelAr: 'النوع' },
    { key: 'reason', labelEn: 'Reason', labelAr: 'السبب' },
    { key: 'amount', labelEn: 'Amount', labelAr: 'المبلغ', align: 'end' },
    { key: 'state', labelEn: 'State', labelAr: 'الحالة' },
  ];

  const items: EmployeeBonusDto[] = list.data?.items ?? [];
  const rows = items.map((b) => ({
    date: day(b.createdAt),
    type: b.type,
    reason: b.reason,
    amount: money(b.amountMinor, b.currency),
    state: t(`erp.hr.bonusState.${b.paid ? 'PAID' : b.approvedAt ? 'APPROVED' : 'PENDING'}` as const),
  }));
  const printInput: PrintTableInput = {
    locale,
    columns,
    rows,
    meta: {
      titleEn: 'Bonuses and rewards',
      titleAr: 'الحوافز والمكافآت',
      companyNameEn: company.en,
      companyNameAr: company.ar,
      totals: list.data
        ? [
            { labelEn: 'Pending', labelAr: 'معلّق', value: money(list.data.totals.pendingMinor, list.data.totals.currency ?? undefined) },
            { labelEn: 'Approved', labelAr: 'معتمد', value: money(list.data.totals.approvedMinor, list.data.totals.currency ?? undefined) },
            { labelEn: 'Paid', labelAr: 'مدفوع', value: money(list.data.totals.paidMinor, list.data.totals.currency ?? undefined) },
          ]
        : undefined,
    },
  };

  if (!can('erp.hr.salary.read')) {
    return <EmptyState title={t('erp.hr.salaryRestrictedTitle')} hint={t('erp.hr.salaryRestrictedHint')} />;
  }
  if (list.loading) return <Skeleton height={200} />;
  if (list.error) return <ErrorBanner message={list.error} onRetry={list.reload} />;

  const remove = async (b: EmployeeBonusDto) => {
    await run(async () => {
      await api.hrEmployeeFile.deleteBonus(b.id);
      await list.reload();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <h3 className="text-sm font-bold">{pick('Bonuses and rewards', 'الحوافز والمكافآت')}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <TableActions
              busy={busy}
              onPrint={() => void run(() => openPrintTable(printInput, true))}
              onCsv={() => void run(() => downloadTableCsv(printInput, `bonuses-${employeeId}`))}
              csvLabel={pick('Excel (CSV)', 'Excel (CSV)')}
            />
            {canManage ? (
              <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="add-bonus">
                <Icon name="plus" size={14} />
                {pick('Grant bonus', 'منح مكافأة')}
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <div className="p-4"><ErrorBanner message={error} /></div> : null}
        {items.length === 0 ? (
          <EmptyState title={t('common.empty')} hint={pick('No bonuses recorded.', 'لا توجد مكافآت مسجلة.')} />
        ) : (
          <TableShell label={pick('Bonuses', 'المكافآت')}>
            <thead>
              <tr>
                <th>{pick('Granted', 'تاريخ المنح')}</th>
                <th>{pick('Type', 'النوع')}</th>
                <th>{pick('Reason', 'السبب')}</th>
                <th className="text-end">{pick('Amount', 'المبلغ')}</th>
                <th>{pick('State', 'الحالة')}</th>
                <th>{pick('Attachments', 'المرفقات')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} data-testid={`bonus-row-${b.id}`}>
                  <td className="text-[12px]">{day(b.createdAt)}</td>
                  <td className="text-[12px]">{t(`erp.hr.bonusType.${b.type}` as const)}</td>
                  <td className="text-[12.5px]">{b.reason}</td>
                  <td className="text-end tabular-nums">{money(b.amountMinor, b.currency)}</td>
                  <td>
                    <Badge tone={b.paid ? 'success' : b.approvedAt ? 'warning' : 'neutral'}>
                      {t(`erp.hr.bonusState.${b.paid ? 'PAID' : b.approvedAt ? 'APPROVED' : 'PENDING'}` as const)}
                    </Badge>
                  </td>
                  <td>
                    <AttachmentsPanel entityType="EMPLOYEE_BONUS" entityId={b.id} canManage={canManage} categorised />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${t('print.preview')} ${b.type}`}
                        onClick={() => setPreview(b)}
                        data-testid={`bonus-preview-${b.id}`}
                      >
                        <Icon name="eye" size={14} />
                      </Button>
                      {canManage ? (
                        b.paid ? (
                          <span className="oryx-muted text-[11px]">{pick('Locked', 'مقفلة')}</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t('common.delete')}
                            disabled={busy}
                            onClick={() => void remove(b)}
                            data-testid={`delete-bonus-${b.id}`}
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {open ? (
        <BonusModal
          employeeId={employeeId}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await list.reload();
          }}
        />
      ) : null}

      {preview ? (
        <RecordPreview
          open
          title={`${pick('Bonus', 'مكافأة')} — ${preview.type}`}
          subtitle={employeeName}
          onClose={() => setPreview(null)}
          fields={[
            { label: pick('Type', 'النوع'), value: preview.type },
            { label: pick('Amount', 'المبلغ'), value: money(preview.amountMinor, preview.currency) },
            { label: pick('Granted', 'تاريخ المنح'), value: day(preview.createdAt) },
            { label: pick('Approved', 'الاعتماد'), value: day(preview.approvedAt) },
            {
              label: pick('State', 'الحالة'),
              value: (
                <Badge tone={preview.paid ? 'success' : preview.approvedAt ? 'warning' : 'neutral'}>
                  {preview.paid ? 'PAID' : preview.approvedAt ? 'APPROVED' : 'PENDING'}
                </Badge>
              ),
            },
            { label: pick('Payroll period', 'فترة الرواتب'), value: preview.payPeriodCode ?? '—' },
            { label: pick('Reason', 'السبب'), value: preview.reason, wide: true },
          ]}
          printInput={recordPrintInput({
            locale,
            titleEn: 'Bonus',
            titleAr: 'مكافأة',
            subjectName: employeeName,
            subjectCode: employeeCode,
            companyNameEn: company.en,
            companyNameAr: company.ar,
            windowLabel: preview.payPeriodCode ?? day(preview.createdAt),
            fields: [
              { label: pick('Type', 'النوع'), value: preview.type },
              { label: pick('Amount', 'المبلغ'), value: money(preview.amountMinor, preview.currency) },
              { label: pick('Granted', 'تاريخ المنح'), value: day(preview.createdAt) },
              { label: pick('Approved', 'الاعتماد'), value: day(preview.approvedAt) },
              { label: pick('Reason', 'السبب'), value: preview.reason },
            ],
          })}
          csvName={`bonus-${preview.id}`}
          attachment={{ entityType: 'EMPLOYEE_BONUS', entityId: preview.id, canManage }}
        />
      ) : null}
    </div>
  );
}

function BonusModal({
  employeeId,
  onClose,
  onSaved,
}: {
  employeeId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const { pick } = useLabels();
  const [type, setType] = useState('BONUS');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [approveNow, setApproveNow] = useState(true);
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.hrEmployeeFile.createBonus(employeeId, {
        type,
        reason,
        amountMinor: Math.round(Number(amount || '0') * 1000),
        approveNow,
      });
      if (pending.length) await uploadPendingAttachments('EMPLOYEE_BONUS', saved.id, pending);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={pick('Grant a bonus', 'منح مكافأة')}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !reason.trim() || !amount}
            onClick={() => void submit()}
            data-testid="save-bonus"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? <ErrorBanner message={error} /> : null}
        <Field label={pick('Type', 'النوع')} required>
          <select className="oryx-select" value={type} onChange={(e) => setType(e.target.value)} data-testid="bonus-type">
            <option value="BONUS">{t('erp.hr.bonusType.BONUS')}</option>
            <option value="INCENTIVE">{t('erp.hr.bonusType.INCENTIVE')}</option>
            <option value="COMMISSION">{t('erp.hr.bonusType.COMMISSION')}</option>
            <option value="ALLOWANCE">{t('erp.hr.bonusType.ALLOWANCE')}</option>
          </select>
        </Field>
        <Field label={pick('Reason', 'السبب')} required>
          <input className="oryx-input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="bonus-reason" />
        </Field>
        <Field label={pick('Amount (BHD)', 'المبلغ (د.ب)')} required>
          <input className="oryx-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="bonus-amount" />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} data-testid="bonus-approve" />
          {pick('Approve now so the next payroll run pays it', 'اعتمادها الآن ليدفعها تشغيل الرواتب التالي')}
        </label>
        <p className="oryx-muted text-xs">
          {pick(
            'An approved bonus is paid by the next payroll run exactly once and is then locked.',
            'المكافأة المعتمدة تُدفع في أول تشغيل رواتب لاحق مرة واحدة فقط ثم تُقفل.',
          )}
        </p>
        <div className="border-t border-[var(--border)] pt-3">
          <PendingAttachments files={pending} onChange={setPending} canManage />
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ reports

function ReportsTab({ employeeId }: { employeeId: string }) {
  const { t } = useUi();
  const { ar, locale, pick } = useLabels();
  const { can, memberships, companyId } = useAuth();
  const canSalary = can('erp.hr.salary.read');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const report = useAsync(
    () => api.hrEmployeeFile.reports(employeeId, { from: from || undefined, to: to || undefined }),
    [employeeId, from, to],
  );
  const { busy, error, run } = useTableAction();
  const company = companyName(memberships, companyId);

  if (report.loading) return <Skeleton height={240} />;
  if (report.error) return <ErrorBanner message={report.error} onRetry={report.reload} />;
  const d: EmployeeReportPackDto | null = report.data;
  if (!d) return null;

  const windowLabel = `${day(d.window.from)} → ${day(d.window.to)}`;
  const metaBase = {
    companyNameEn: company.en,
    companyNameAr: company.ar,
    subjectNameEn: ar ? d.employee.fullNameAr : d.employee.fullNameEn,
    subjectNameAr: d.employee.fullNameAr,
    subjectCode: d.employee.code,
    windowLabel,
  };

  const attendanceInput: PrintTableInput = {
    locale,
    meta: { ...metaBase, titleEn: 'Attendance report', titleAr: 'تقرير الحضور والانصراف' },
    columns: [
      { key: 'date', labelEn: 'Date', labelAr: 'التاريخ' },
      { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
      { key: 'worked', labelEn: 'Worked (h)', labelAr: 'ساعات العمل', align: 'end' },
      { key: 'overtime', labelEn: 'Overtime (h)', labelAr: 'إضافي', align: 'end' },
      { key: 'late', labelEn: 'Late (min)', labelAr: 'تأخير (د)', align: 'end' },
    ],
    rows: d.attendance.records.map((r) => ({
      date: day(r.workDate),
      status: t(`erp.hr.attendanceStatus.${r.status}` as const),
      worked: hours(r.workedMinutes),
      overtime: hours(r.overtimeMinutes),
      late: String(r.lateMinutes),
    })),
  };

  const penaltyInput: PrintTableInput = {
    locale,
    meta: { ...metaBase, titleEn: 'Disciplinary report', titleAr: 'تقرير العقوبات' },
    columns: [
      { key: 'date', labelEn: 'Date', labelAr: 'التاريخ' },
      { key: 'type', labelEn: 'Action', labelAr: 'الإجراء' },
      { key: 'reason', labelEn: 'Reason', labelAr: 'السبب' },
    ],
    rows: d.penalties.records.map((p) => ({
      date: day(p.effectiveDate),
      type: t(`erp.hr.actionType.${p.actionType}` as const),
      reason: p.reason,
    })),
  };

  const leaveInput: PrintTableInput = {
    locale,
    meta: { ...metaBase, titleEn: 'Leave report', titleAr: 'تقرير الإجازات' },
    columns: [
      { key: 'type', labelEn: 'Leave type', labelAr: 'نوع الإجازة' },
      { key: 'start', labelEn: 'From', labelAr: 'من' },
      { key: 'end', labelEn: 'To', labelAr: 'إلى' },
      { key: 'days', labelEn: 'Days', labelAr: 'الأيام', align: 'end' },
      { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
    ],
    rows: d.leave.records.map((r) => ({
      type: ar ? r.leaveTypeNameAr || r.leaveTypeNameEn : r.leaveTypeNameEn || r.leaveTypeNameAr,
      start: day(r.startDate),
      end: day(r.endDate),
      days: String(r.days),
      status: t(`erp.hr.leaveStatus.${r.status}` as const),
    })),
  };

  const leaveBalancesInput: PrintTableInput = {
    locale,
    meta: {
      ...metaBase,
      titleEn: 'Leave balances',
      titleAr: 'أرصدة الإجازات',
      totals: [
        {
          labelEn: 'Remaining days',
          labelAr: 'الأيام المتبقية',
          value: String(d.leave.balances.reduce((sum, b) => sum + b.remainingDays, 0)),
        },
      ],
    },
    columns: [
      { key: 'type', labelEn: 'Leave type', labelAr: 'نوع الإجازة' },
      { key: 'year', labelEn: 'Year', labelAr: 'السنة', align: 'end' },
      { key: 'entitled', labelEn: 'Entitled', labelAr: 'الاستحقاق', align: 'end' },
      { key: 'accrued', labelEn: 'Accrued', labelAr: 'المستحق', align: 'end' },
      { key: 'used', labelEn: 'Used', labelAr: 'المستخدم', align: 'end' },
      { key: 'pending', labelEn: 'Pending', labelAr: 'قيد الموافقة', align: 'end' },
      { key: 'remaining', labelEn: 'Remaining', labelAr: 'المتبقي', align: 'end' },
    ],
    rows: d.leave.balances.map((b) => ({
      type: ar ? b.leaveTypeNameAr || b.leaveTypeNameEn : b.leaveTypeNameEn || b.leaveTypeNameAr,
      year: String(b.year),
      entitled: String(b.entitledDays),
      accrued: String(b.accruedDays),
      used: String(b.usedDays),
      pending: String(b.pendingDays),
      remaining: String(b.remainingDays),
    })),
  };

  const payrollVisible = !('visible' in d.payroll);
  const bonusVisible = !('visible' in d.bonuses);
  const payrollInput: PrintTableInput = {
    locale,
    meta: { ...metaBase, titleEn: 'Payroll report', titleAr: 'التقرير المالي والرواتب' },
    columns: [
      { key: 'period', labelEn: 'Payslip', labelAr: 'القسيمة' },
      { key: 'basic', labelEn: 'Basic', labelAr: 'الأساسي', align: 'end' },
      { key: 'allowances', labelEn: 'Allowances', labelAr: 'البدلات', align: 'end' },
      { key: 'deductions', labelEn: 'Deductions', labelAr: 'الخصومات', align: 'end' },
      { key: 'net', labelEn: 'Net', labelAr: 'الصافي', align: 'end' },
    ],
    rows: payrollVisible
      ? (d.payroll as Extract<EmployeeReportPackDto['payroll'], { records: unknown[] }>).records.map((p) => ({
          period: p.id.slice(-8),
          basic: money(p.basicMinor, p.currency),
          allowances: money(p.allowancesMinor, p.currency),
          deductions: money(p.deductionsMinor, p.currency),
          net: money(p.netMinor, p.currency),
        }))
      : [],
  };

  const latenessInput: PrintTableInput = {
    locale,
    meta: { ...metaBase, titleEn: 'Lateness and absence report', titleAr: 'تقرير التأخير والغياب' },
    columns: [
      { key: 'date', labelEn: 'Date', labelAr: 'التاريخ' },
      { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
      { key: 'late', labelEn: 'Late (min)', labelAr: 'تأخير (د)', align: 'end' },
      { key: 'early', labelEn: 'Early leave (min)', labelAr: 'انصراف مبكر (د)', align: 'end' },
      { key: 'checkIn', labelEn: 'Check-in', labelAr: 'الحضور' },
      { key: 'checkOut', labelEn: 'Check-out', labelAr: 'الانصراف' },
    ],
    rows: d.attendance.records
      .filter((r) => r.status === 'ABSENT' || r.status === 'LATE' || r.lateMinutes > 0 || r.earlyLeaveMinutes > 0)
      .map((r) => ({
        date: day(r.workDate),
        status: t(`erp.hr.attendanceStatus.${r.status}` as const),
        late: String(r.lateMinutes),
        early: String(r.earlyLeaveMinutes),
        checkIn: r.checkInAt ? r.checkInAt.slice(11, 16) : '—',
        checkOut: r.checkOutAt ? r.checkOutAt.slice(11, 16) : '—',
      })),
  };

  const bonusInput: PrintTableInput = {
    locale,
    meta: { ...metaBase, titleEn: 'Bonuses report', titleAr: 'تقرير الحوافز والمكافآت' },
    columns: [
      { key: 'type', labelEn: 'Type', labelAr: 'النوع' },
      { key: 'reason', labelEn: 'Reason', labelAr: 'السبب' },
      { key: 'amount', labelEn: 'Amount', labelAr: 'المبلغ', align: 'end' },
      { key: 'approvedAt', labelEn: 'Approved', labelAr: 'الاعتماد' },
      { key: 'paid', labelEn: 'Paid', labelAr: 'مدفوع' },
    ],
    rows: bonusVisible
      ? (d.bonuses as Extract<EmployeeReportPackDto['bonuses'], { records: unknown[] }>).records.map((b) => ({
          type: t(`erp.hr.bonusType.${b.type}` as const),
          reason: b.reason,
          amount: money(b.amountMinor, b.currency),
          approvedAt: day(b.approvedAt),
          paid: b.paid ? '✔' : '—',
        }))
      : [],
  };

  const comprehensiveInput: PrintTableInput = {
    locale,
    meta: {
      ...metaBase,
      titleEn: 'Comprehensive employee report',
      titleAr: 'التقرير الشامل للموظف',
      totals: [
        { labelEn: 'Attendance days', labelAr: 'أيام الحضور', value: String(d.attendance.summary.recordedDays) },
        { labelEn: 'Absent days', labelAr: 'أيام الغياب', value: String(d.attendance.summary.absentDays) },
        { labelEn: 'Leave days', labelAr: 'أيام الإجازة', value: String(d.leave.summary.approvedDays) },
        { labelEn: 'Disciplinary actions', labelAr: 'الإجراءات', value: String(d.penalties.summary.count) },
        ...(bonusVisible
          ? [
              {
                labelEn: 'Bonuses',
                labelAr: 'الحوافز',
                value: money(
                  (d.bonuses as Extract<EmployeeReportPackDto['bonuses'], { records: unknown[] }>).summary.totalAmountMinor,
                  (d.bonuses as Extract<EmployeeReportPackDto['bonuses'], { records: unknown[] }>).records[0]?.currency,
                ),
              },
            ]
          : []),
        ...(payrollVisible
          ? [
              {
                labelEn: 'Net payroll',
                labelAr: 'صافي الرواتب',
                value: money(
                  (d.payroll as Extract<EmployeeReportPackDto['payroll'], { records: unknown[] }>).summary.netMinor,
                  (d.payroll as Extract<EmployeeReportPackDto['payroll'], { records: unknown[] }>).summary.currency ?? undefined,
                ),
              },
            ]
          : []),
      ],
    },
    columns: [
      { key: 'section', labelEn: 'Section', labelAr: 'القسم' },
      { key: 'measure', labelEn: 'Measure', labelAr: 'البند' },
      { key: 'value', labelEn: 'Value', labelAr: 'القيمة', align: 'end' },
    ],
    rows: (() => {
      const sec = {
        attendance: pick('Attendance', 'الحضور'),
        leave: pick('Leave', 'الإجازات'),
        disciplinary: pick('Disciplinary', 'العقوبات'),
        bonuses: pick('Bonuses', 'الحوافز'),
        payroll: pick('Payroll', 'الرواتب'),
      };
      const out: Array<{ section: string; measure: string; value: string }> = [
        { section: sec.attendance, measure: pick('Recorded days', 'الأيام المسجلة'), value: String(d.attendance.summary.recordedDays) },
        { section: sec.attendance, measure: pick('Present days', 'أيام الحضور'), value: String(d.attendance.summary.presentDays) },
        { section: sec.attendance, measure: pick('Late days', 'أيام التأخير'), value: String(d.attendance.summary.lateDays) },
        { section: sec.attendance, measure: pick('Absent days', 'أيام الغياب'), value: String(d.attendance.summary.absentDays) },
        { section: sec.attendance, measure: pick('Worked hours', 'ساعات العمل'), value: hours(d.attendance.summary.workedMinutes) },
        { section: sec.attendance, measure: pick('Overtime hours', 'ساعات إضافية'), value: hours(d.attendance.summary.overtimeMinutes) },
        { section: sec.leave, measure: pick('Requests', 'الطلبات'), value: String(d.leave.summary.requestCount) },
        { section: sec.leave, measure: pick('Approved days', 'أيام معتمدة'), value: String(d.leave.summary.approvedDays) },
        { section: sec.disciplinary, measure: pick('Actions', 'الإجراءات'), value: String(d.penalties.summary.count) },
      ];
      if (bonusVisible) {
        const b = d.bonuses as Extract<EmployeeReportPackDto['bonuses'], { records: unknown[] }>;
        out.push({ section: sec.bonuses, measure: pick('Count', 'العدد'), value: String(b.summary.count) });
        out.push({
          section: sec.bonuses,
          measure: pick('Total', 'الإجمالي'),
          value: money(b.summary.totalAmountMinor, b.records[0]?.currency),
        });
      }
      if (payrollVisible) {
        const pr = d.payroll as Extract<EmployeeReportPackDto['payroll'], { records: unknown[] }>;
        out.push({ section: sec.payroll, measure: pick('Payslips', 'القسائم'), value: String(pr.summary.payslipCount) });
        out.push({
          section: sec.payroll,
          measure: pick('Net', 'الصافي'),
          value: money(pr.summary.netMinor, pr.summary.currency ?? undefined),
        });
      }
      return out;
    })(),
  };

  const cards: Array<{ key: string; title: string; summary: string; input: PrintTableInput; count: number }> = [
    {
      key: 'attendance',
      title: pick('Attendance', 'الحضور والانصراف'),
      summary: `${pick('Recorded', 'مسجل')}: ${d.attendance.summary.recordedDays} · ${pick('Present', 'حاضر')}: ${d.attendance.summary.presentDays} · ${pick('Late', 'متأخر')}: ${d.attendance.summary.lateDays} · ${pick('Absent', 'غائب')}: ${d.attendance.summary.absentDays}`,
      input: attendanceInput,
      count: d.attendance.records.length,
    },
    {
      key: 'leave',
      title: pick('Leave', 'الإجازات'),
      summary: `${pick('Requests', 'الطلبات')}: ${d.leave.summary.requestCount} · ${pick('Approved days', 'أيام معتمدة')}: ${d.leave.summary.approvedDays}`,
      input: leaveInput,
      count: d.leave.records.length,
    },
    {
      key: 'leave-balances',
      title: pick('Leave balances', 'أرصدة الإجازات'),
      summary: `${pick('Remaining days', 'الأيام المتبقية')}: ${d.leave.balances.reduce((sum, b) => sum + b.remainingDays, 0)}`,
      input: leaveBalancesInput,
      count: d.leave.balances.length,
    },
    {
      key: 'lateness',
      title: pick('Lateness and absence', 'التأخير والغياب'),
      summary: `${pick('Late days', 'أيام التأخير')}: ${d.attendance.summary.lateDays} · ${pick('Absent days', 'أيام الغياب')}: ${d.attendance.summary.absentDays} · ${pick('Early leave', 'انصراف مبكر')}: ${d.attendance.summary.earlyLeaveMinutes} ${pick('min', 'دقيقة')}`,
      input: latenessInput,
      count: latenessInput.rows.length,
    },
    {
      key: 'penalties',
      title: pick('Disciplinary', 'العقوبات'),
      summary: `${pick('Actions', 'الإجراءات')}: ${d.penalties.summary.count}`,
      input: penaltyInput,
      count: d.penalties.records.length,
    },
    {
      key: 'comprehensive',
      title: pick('Comprehensive report', 'التقرير الشامل'),
      summary: `${pick('Window', 'الفترة')}: ${windowLabel}`,
      input: comprehensiveInput,
      count: comprehensiveInput.rows.length,
    },
  ];

  if (canSalary) {
    cards.push({
      key: 'payroll',
      title: pick('Payroll', 'الرواتب'),
      summary: payrollVisible
        ? `${pick('Payslips', 'القسائم')}: ${(d.payroll as { summary: { payslipCount: number; netMinor: number; currency: string | null } }).summary.payslipCount} · ${pick('Net', 'الصافي')}: ${money(
            (d.payroll as { summary: { netMinor: number; currency: string | null } }).summary.netMinor,
            (d.payroll as { summary: { currency: string | null } }).summary.currency ?? undefined,
          )}`
        : '—',
      input: payrollInput,
      count: payrollVisible ? (d.payroll as { records: unknown[] }).records.length : 0,
    });
    if (bonusVisible) {
      const b = d.bonuses as Extract<EmployeeReportPackDto['bonuses'], { records: unknown[] }>;
      cards.splice(cards.length - 1, 0, {
        key: 'bonuses',
        title: pick('Bonuses', 'الحوافز والمكافآت'),
        summary: `${pick('Count', 'العدد')}: ${b.summary.count} · ${pick('Total', 'الإجمالي')}: ${money(b.summary.totalAmountMinor, b.records[0]?.currency)}`,
        input: bonusInput,
        count: b.records.length,
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('common.from')}>
              <input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from" />
            </Field>
            <Field label={t('common.to')}>
              <input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to" />
            </Field>
          </div>
          <span className="oryx-muted text-xs">{windowLabel}</span>
        </div>
        {error ? <div className="p-4"><ErrorBanner message={error} /></div> : null}
        {!bonusVisible || !payrollVisible ? (
          <div className="p-4">
            <EmptyState title={t('erp.hr.salaryRestrictedTitle')} hint={t('erp.hr.salaryRestrictedHint')} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.key} className="rounded-lg border border-[var(--border)] p-3" data-testid={`report-card-${c.key}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold">{c.title}</h4>
                  <p className="oryx-muted mt-1 text-[12px]">{c.summary}</p>
                </div>
                <Badge tone="neutral">{c.count}</Badge>
              </div>
              <div className="mt-2">
                <TableActions
                  busy={busy}
                  onPrint={() => void run(() => openPrintTable(c.input, true))}
                  onCsv={() => void run(() => downloadTableCsv(c.input, `${c.key}-${d.employee.code}`))}
                  csvLabel={pick('Excel (CSV)', 'Excel (CSV)')}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------- the shell

export function EmployeeFile({
  employeeId,
  employeeName,
  employeeCode,
  initialTab = 'identity',
}: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  initialTab?: EmployeeFileTabKey;
}) {
  const { t } = useUi();
  const { pick } = useLabels();
  const { can } = useAuth();
  const [tab, setTab] = useState<EmployeeFileTabKey>(initialTab);
  const canSalary = can('erp.hr.salary.read');

  const tabs: Array<{ key: EmployeeFileTabKey; label: string; hidden?: boolean }> = [
    { key: 'identity', label: pick('Personal card', 'البطاقة الشخصية') },
    { key: 'payroll', label: pick('Payroll', 'سجل الرواتب'), hidden: !canSalary },
    { key: 'leave', label: pick('Leave', 'الإجازات') },
    { key: 'penalties', label: pick('Disciplinary', 'العقوبات والإجراءات') },
    { key: 'bonuses', label: pick('Bonuses', 'الحوافز والمكافآت'), hidden: !canSalary },
    { key: 'reports', label: pick('Reports', 'التقارير') },
  ];

  const visible = tabs.filter((x) => !x.hidden);

  return (
    <div className="flex flex-col gap-4" data-testid="employee-file">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('erp.hr.employeeFile')}>
        {visible.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`employee-file-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'identity' ? <IdentityTab employeeId={employeeId} /> : null}
      {tab === 'payroll' && canSalary ? (
        <PayrollTab employeeId={employeeId} employeeName={employeeName} employeeCode={employeeCode} />
      ) : null}
      {tab === 'leave' ? <LeaveTab employeeId={employeeId} employeeName={employeeName} employeeCode={employeeCode} /> : null}
      {tab === 'penalties' ? <PenaltiesTab employeeId={employeeId} employeeName={employeeName} employeeCode={employeeCode} /> : null}
      {tab === 'bonuses' && canSalary ? <BonusesTab employeeId={employeeId} employeeName={employeeName} employeeCode={employeeCode} /> : null}
      {tab === 'reports' ? <ReportsTab employeeId={employeeId} /> : null}
    </div>
  );
}
