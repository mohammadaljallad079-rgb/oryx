'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Card, ErrorBanner, Skeleton } from '@/components/ui';
import { EmployeeFile } from '@/components/employee-file';

type EmployeeDetail = {
  id?: string;
  code?: string;
  fullNameEn?: string;
  fullNameAr?: string;
  email?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  nationalId?: string | null;
  status?: string;
  hireDate?: string;
  department?: { nameAr?: string; nameEn?: string } | null;
  jobTitle?: { nameAr?: string; nameEn?: string } | null;
  contracts?: Array<{ id: string; startDate?: string; endDate?: string | null; status?: string }>;
  leaveBalances?: Array<{ id: string; balanceDays?: number; remainingDays?: number; leaveType?: { nameAr?: string; nameEn?: string } }>;
  lifecycle?: Array<{ id: string; type?: string; status?: string; startedAt?: string }>;
};
type EmployeeFileTab = 'dossier' | 'identity' | 'contracts' | 'leave' | 'documents';

function date(value: unknown): string {
  return typeof value === 'string' && value ? value.slice(0, 10) : '—';
}
function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

/**
 * The employee dossier.
 *
 * The default tab is the full electronic file (`EmployeeFile`), which reads the
 * permission-gated `/hr/employees/:id/file/*` routes. The older read-only tabs
 * are kept alongside it so existing bookmarks and links keep working.
 */
export default function EmployeeFilePage() {
  const params = useParams<{ id: string }>();
  const employeeId = String(params.id ?? '');
  const { canAny, ready } = useAuth();
  const { locale } = useUi();
  const ar = locale === 'ar';
  const [tab, setTab] = useState<EmployeeFileTab>('dossier');
  const allowed = ready && canAny('erp.hr.read', 'erp.hr.employee.manage');
  const file = useAsync(
    () => allowed && employeeId ? api.hrEmployee(employeeId) : Promise.resolve(null),
    [allowed, employeeId],
  );
  const documents = useAsync(
    () => allowed && employeeId && tab === 'documents'
      ? api.employeeDocuments(employeeId) : Promise.resolve(null),
    [allowed, employeeId, tab],
  );
  const employee = file.data as EmployeeDetail | null;
  const tabs: Array<{ id: EmployeeFileTab; label: string }> = [
    { id: 'dossier', label: ar ? 'الملف الشامل' : 'Full file' },
    { id: 'identity', label: ar ? 'البيانات الشخصية' : 'Personal details' },
    { id: 'contracts', label: ar ? 'العقود' : 'Contracts' },
    { id: 'leave', label: ar ? 'رصيد الإجازات' : 'Leave balances' },
    { id: 'documents', label: ar ? 'المستندات' : 'Documents' },
  ];
  const name = (en?: string, arName?: string) => (ar ? arName || en : en || arName) || '—';

  return (
    <div className="flex flex-col gap-4" data-testid="employee-dossier">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/hr?tab=employees" className="oryx-muted underline">
            {ar ? 'العودة إلى الموظفين' : 'Back to employees'}
          </Link>
          <h1 className="mt-2 text-xl font-bold">{ar ? 'الملف الإلكتروني للموظف' : 'Employee electronic file'}</h1>
          {employee ? <p className="oryx-muted">{name(employee.fullNameEn, employee.fullNameAr)} · {employee.code}</p> : null}
        </div>
      </div>
      {!ready ? <Skeleton height={180} /> : !allowed ? (
        <Card><p>{ar ? 'ليس لديك صلاحية عرض بيانات الموظفين.' : 'You do not have permission to read employees.'}</p></Card>
      ) : file.error ? (
        <ErrorBanner message={file.error} onRetry={file.reload} />
      ) : file.loading || !employee ? <Skeleton height={220} /> : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={ar ? 'أقسام ملف الموظف' : 'Employee file sections'}>
            {tabs.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
                className={`oryx-btn oryx-btn--sm ${tab === item.id ? 'oryx-btn--primary' : ''}`}
                data-testid={`employee-file-tab-${item.id}`}
                onClick={() => setTab(item.id)}>{item.label}</button>
            ))}
          </div>
          {tab === 'dossier' ? (
            <EmployeeFile
              employeeId={employeeId}
              employeeName={name(employee.fullNameEn, employee.fullNameAr)}
              employeeCode={employee.code ?? ''}
            />
          ) : null}
          {tab === 'identity' ? (
            <Card>
              <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {([
                  [ar ? 'الرقم الوظيفي' : 'Employee code', employee.code],
                  [ar ? 'الاسم بالعربية' : 'Arabic name', employee.fullNameAr],
                  [ar ? 'الاسم بالإنجليزية' : 'English name', employee.fullNameEn],
                  [ar ? 'الحالة' : 'Status', employee.status],
                  [ar ? 'تاريخ التعيين' : 'Hire date', date(employee.hireDate)],
                  [ar ? 'البريد الإلكتروني' : 'Email', employee.email],
                  [ar ? 'الهاتف' : 'Phone', employee.phone],
                  [ar ? 'الهاتف الإضافي' : 'Secondary phone', employee.secondaryPhone],
                  [ar ? 'رقم الهوية' : 'National ID', employee.nationalId],
                  [ar ? 'القسم' : 'Department', name(employee.department?.nameEn, employee.department?.nameAr)],
                  [ar ? 'المسمى الوظيفي' : 'Job title', name(employee.jobTitle?.nameEn, employee.jobTitle?.nameAr)],
                ] as Array<[string, unknown]>).map(([label, value]) => (
                  <div key={label} className="border-b border-[var(--border)] pb-2">
                    <dt className="oryx-muted text-xs">{label}</dt><dd className="mt-1 font-semibold">{display(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
          {tab === 'contracts' ? (
            <Card>
              {(employee.contracts ?? []).length ? (
                <ul className="flex flex-col gap-3">
                  {(employee.contracts ?? []).map((contract) => (
                    <li key={contract.id} className="rounded-lg border border-[var(--border)] p-3">
                      {ar ? 'من' : 'From'} {date(contract.startDate)} · {ar ? 'إلى' : 'To'} {date(contract.endDate)}
                      <span className="oryx-muted ms-3">{display(contract.status)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="oryx-muted">{ar ? 'لا توجد عقود مسجلة.' : 'No contracts found.'}</p>}
            </Card>
          ) : null}
          {tab === 'leave' ? (
            <Card>
              {(employee.leaveBalances ?? []).length ? (
                <ul className="flex flex-col gap-3">
                  {(employee.leaveBalances ?? []).map((item) => (
                    <li key={item.id} className="rounded-lg border border-[var(--border)] p-3">
                      {name(item.leaveType?.nameEn, item.leaveType?.nameAr)} · {ar ? 'المتبقي' : 'Remaining'}: {display(item.remainingDays ?? item.balanceDays)}
                    </li>
                  ))}
                </ul>
              ) : <p className="oryx-muted">{ar ? 'لا توجد أرصدة إجازات.' : 'No leave balances found.'}</p>}
            </Card>
          ) : null}
          {tab === 'documents' ? (
            <Card>
              {documents.error ? <ErrorBanner message={documents.error} onRetry={documents.reload} />
                : documents.loading ? <Skeleton height={120} />
                : (documents.data?.items ?? []).length ? (
                  <ul className="flex flex-col gap-3">
                    {(documents.data?.items ?? []).map((document) => (
                      <li key={document.id} className="rounded-lg border border-[var(--border)] p-3">
                        {document.title} · {document.category || '—'}
                      </li>
                    ))}
                  </ul>
                ) : <p className="oryx-muted">{ar ? 'لا توجد مستندات مسجلة.' : 'No documents found.'}</p>}
              <p className="oryx-muted mt-3 text-xs">{ar ? 'إدارة المستندات والتحميل متاحة من شاشة الموارد البشرية الحالية وفق الصلاحيات.' : 'Manage and download documents from the existing HR screen according to permissions.'}</p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
