'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type {
  AttachmentDto,
  EmployeeBonusDto,
  EmployeeFileContract,
  EmployeeFilePersonalCard,
  EmployeeFileReports,
  EmployeeLeaveRecordDto,
  EmployeePenaltyDto,
  EmployeePayslipDto,
} from '@oryx/shared';
import { api, fetchAttachmentDataUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { useFormAttachments } from '@/lib/use-form-attachments';
import { money, toMinorInput } from '@/lib/erp-format';
import { exportCsv, printDocument } from '@/lib/print';
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

type FileTab = 'personal' | 'payroll' | 'leave' | 'penalties' | 'bonuses' | 'reports' | 'documents';

const today = () => new Date().toISOString().slice(0, 10);

export default function EmployeeFilePage() {
  const { t, locale } = useUi();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employeeId = params?.id ?? '';
  const [tab, setTab] = useState<FileTab>('personal');

  const counts = useAsync(() => api.employeeFileCounts(employeeId), [employeeId]);
  const card = useAsync(() => api.employeeFilePersonalCard(employeeId), [employeeId]);

  const tabs: Array<{ key: FileTab; label: string; count?: number }> = [
    { key: 'personal', label: t('hr.file.tab.personal') },
    { key: 'payroll', label: t('hr.file.tab.payroll'), count: counts.data?.payslips },
    { key: 'leave', label: t('hr.file.tab.leave'), count: counts.data?.leave },
    { key: 'penalties', label: t('hr.file.tab.penalties'), count: counts.data?.penalties },
    { key: 'bonuses', label: t('hr.file.tab.bonuses'), count: counts.data?.bonuses },
    { key: 'reports', label: t('hr.file.tab.reports') },
    { key: 'documents', label: t('hr.file.tab.documents') },
  ];

  const employee = card.data?.employee;

  return (
    <div className="flex flex-col gap-4" data-testid="employee-file">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => router.push('/hr')} data-testid="employee-file-back">
          {locale === 'ar' ? '→' : '←'} {t('nav.human_resources')}
        </Button>
      </div>

      <SectionHeader
        title={employee ? `${employee.fullNameEn} — ${employee.fullNameAr}` : t('hr.file.title')}
        subtitle={employee ? `${employee.code} · ${employee.jobTitleNameEn ?? '—'} · ${employee.departmentNameEn ?? '—'}` : undefined}
        actions={
          employee ? (
            <>
              <StatusBadge status={employee.status} label={employee.status} />
              <Badge tone="gold">{t('hr.file.title')}</Badge>
            </>
          ) : null
        }
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
            data-testid={`file-tab-${x.key}`}
          >
            {x.label}
            {x.count !== undefined ? <span className="oryx-faint ms-1 tabular-nums">({x.count})</span> : null}
          </button>
        ))}
      </div>

      {card.error ? <ErrorBanner message={card.error} onRetry={card.reload} /> : null}

      {tab === 'personal' ? <PersonalCardTab data={card.data} loading={card.loading} reload={card.reload} /> : null}
      {tab === 'payroll' ? <PayrollTab employeeId={employeeId} employeeName={employee?.fullNameEn ?? ''} employeeCode={employee?.code ?? ''} /> : null}
      {tab === 'leave' ? <LeaveTab employeeId={employeeId} /> : null}
      {tab === 'penalties' ? <PenaltiesTab employeeId={employeeId} employeeName={employee?.fullNameEn ?? ''} /> : null}
      {tab === 'bonuses' ? <BonusesTab employeeId={employeeId} employeeName={employee?.fullNameEn ?? ''} /> : null}
      {tab === 'reports' ? <ReportsTab employeeId={employeeId} employeeName={employee?.fullNameEn ?? ''} employeeCode={employee?.code ?? ''} hireDate={employee?.hireDate ?? null} /> : null}
      {tab === 'documents' ? <DocumentsTab employeeId={employeeId} /> : null}
    </div>
  );
}

// ------------------------------------------------------------ personal card

function PersonalCardTab({
  data,
  loading,
  reload,
}: {
  data: EmployeeFilePersonalCard | null;
  loading: boolean;
  reload: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [contract, setContract] = useState<EmployeeFileContract | null>(null);

  // The printed card carries the photograph, so the bytes are fetched while the
  // tab is open: `printDocument` runs synchronously in the click handler and
  // cannot wait for a request once the print window is already open.
  const photos = useAsync(
    () => (data ? api.attachments('EMPLOYEE', data.employee.id) : Promise.resolve({ items: [], total: 0 })),
    [data?.employee.id],
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const items = photos.data?.items ?? [];
    const primary = items.find((a) => a.isPrimary && a.previewKind === 'image') ?? items.find((a) => a.previewKind === 'image');
    if (!primary) {
      setPhotoDataUrl(null);
      return;
    }
    let cancelled = false;
    void fetchAttachmentDataUrl(primary.id)
      .then((url) => {
        if (!cancelled) setPhotoDataUrl(url);
      })
      .catch(() => {
        // A card without its photograph is still a valid card.
        if (!cancelled) setPhotoDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [photos.data]);

  if (loading) return <Skeleton height={280} />;
  if (!data) return <EmptyState title={t('common.empty')} />;
  const e = data.employee;
  const comp = data.compensation;

  const printCard = () => {
    const ok = printDocument({
      title: `${t('hr.file.title')} — ${e.fullNameEn}`,
      subtitle: `${e.code} · ${e.jobTitleNameEn ?? '—'}`,
      locale,
      sections: [
        {
          heading: t('hr.file.tab.personal'),
          fields: [
            { label: t('common.name'), value: `${e.fullNameEn} / ${e.fullNameAr}` },
            { label: t('common.code'), value: e.code },
            { label: t('hr.file.nationalId'), value: e.nationalId ?? '—' },
            { label: t('hr.file.nationality'), value: e.nationality ?? '—' },
            { label: t('hr.file.dateOfBirth'), value: e.dateOfBirth?.slice(0, 10) ?? '—' },
            { label: t('hr.file.gender'), value: e.gender ?? '—' },
            { label: t('erp.sales.phone'), value: e.phone ?? '—' },
            { label: t('common.email'), value: e.email ?? '—' },
            { label: t('hr.file.address'), value: e.addressLine ?? '—' },
            { label: t('erp.hr.department'), value: e.departmentNameEn ?? '—' },
            { label: t('erp.hr.jobTitle'), value: e.jobTitleNameEn ?? '—' },
            { label: t('hr.file.branch'), value: e.branchNameEn ?? '—' },
            { label: t('hr.file.manager'), value: e.managerNameEn ?? '—' },
            { label: t('erp.hr.hireDate'), value: e.hireDate.slice(0, 10) },
            { label: t('hr.file.contractType'), value: e.contractType },
            { label: t('common.status'), value: e.status },
            ...(comp.visible
              ? [
                  { label: t('hr.file.basicSalary'), value: money(comp.basicMinor, comp.currency) },
                  { label: t('hr.file.bankName'), value: comp.bankName ?? '—' },
                  { label: t('hr.file.bankIban'), value: comp.bankAccountIban ?? '—' },
                ]
              : []),
          ],
        },
      ],
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
      ...(photoDataUrl ? { photo: { dataUrl: photoDataUrl, alt: e.fullNameEn } } : {}),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4" data-testid="file-personal-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="oryx-panel-title m-0">{t('hr.file.tab.personal')}</p>
          <div className="flex gap-2">
            {can('erp.hr.employee.manage') ? (
              <Button size="sm" onClick={() => setEditOpen(true)} data-testid="file-edit-card">
                {t('hr.file.editCard')}
              </Button>
            ) : null}
            <Button size="sm" onClick={printCard} data-testid="file-print-card">
              <Icon name="scroll" size={14} />
              {t('hr.file.printCard')}
            </Button>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <Row label={t('common.name')} value={`${e.fullNameEn}`} sub={e.fullNameAr} />
          <Row label={t('common.code')} value={e.code} mono />
          <Row label={t('hr.file.nationalId')} value={e.nationalId ?? '—'} />
          <Row label={t('hr.file.nationality')} value={e.nationality ?? '—'} />
          <Row label={t('hr.file.dateOfBirth')} value={e.dateOfBirth?.slice(0, 10) ?? '—'} />
          <Row label={t('hr.file.gender')} value={e.gender ?? '—'} />
          <Row label={t('erp.sales.phone')} value={e.phone ?? '—'} />
          <Row label={t('common.email')} value={e.email ?? '—'} />
          <Row label={t('hr.file.address')} value={e.addressLine ?? '—'} />
          <Row label={t('erp.hr.department')} value={e.departmentNameEn ?? '—'} />
          <Row label={t('erp.hr.jobTitle')} value={e.jobTitleNameEn ?? '—'} />
          <Row label={t('hr.file.branch')} value={e.branchNameEn ?? '—'} />
          <Row label={t('hr.file.manager')} value={e.managerNameEn ?? '—'} />
          <Row label={t('erp.hr.hireDate')} value={e.hireDate.slice(0, 10)} />
          <Row label={t('hr.file.contractType')} value={e.contractType} />
          <Row label={t('hr.file.terminationDate')} value={e.terminationDate?.slice(0, 10) ?? '—'} />
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="oryx-panel-title m-0 mb-2">{t('hr.file.basicSalary')}</p>
          {comp.visible ? (
            <>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
                <Row label={t('hr.file.basicSalary')} value={money(comp.basicMinor, comp.currency)} />
                <Row label={t('erp.hr.allowances')} value={money(comp.allowancesMinor, comp.currency)} />
                <Row label={t('erp.hr.deductions')} value={money(comp.deductionsMinor, comp.currency)} />
                <Row label={t('hr.file.bankName')} value={comp.bankName ?? '—'} />
                <Row label={t('hr.file.bankIban')} value={comp.bankAccountIban ?? '—'} mono />
                <Row label={t('hr.file.effectiveFrom')} value={comp.effectiveFrom?.slice(0, 10) ?? '—'} />
              </div>
              {comp.components.length === 0 ? (
                <p className="oryx-faint m-0 mt-2 text-[12px]">{t('hr.file.noSalaryStructure')}</p>
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('common.type')}</th>
                      <th>{t('hr.file.bonusAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comp.components.map((c) => (
                      <tr key={c.id}>
                        <td className="text-[12.5px]">{c.nameEn}</td>
                        <td className="text-[12.5px]">{c.type}</td>
                        <td className="tabular-nums text-[12.5px]">
                          {c.isPercentage ? `${(c.percentBp / 100).toFixed(2)}%` : money(c.amountMinor, comp.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </>
          ) : (
            <p className="oryx-muted m-0 text-[12.5px]" data-testid="file-salary-hidden">
              {t('hr.file.salaryNotPermitted')}
            </p>
          )}
        </div>

        {data.contracts.length > 0 ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="oryx-panel-title m-0 mb-2">{t('hr.file.contracts')}</p>
            <TableShell>
              <thead>
                <tr>
                  <th>{t('hr.file.contractNumber')}</th>
                  <th>{t('common.type')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-[12px]">{c.contractNumber}</td>
                    <td className="text-[12.5px]">{c.type}</td>
                    <td className="text-[12.5px]">
                      {c.startDate.slice(0, 10)} → {c.endDate?.slice(0, 10) ?? '—'}
                    </td>
                    <td><StatusBadge status={c.status} label={c.status} /></td>
                    <td>
                      <Button size="sm" onClick={() => setContract(c)} data-testid={`preview-contract-${c.contractNumber}`}>
                        {t('attach.preview')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        ) : null}
      </Card>

      <EmployeePhotoCard
        employeeId={e.id}
        photos={photos.data?.items ?? []}
        photoUrl={photoDataUrl}
        onChanged={photos.reload}
      />

      <EditEmployeeModal
        open={editOpen}
        employee={e}
        bank={comp.visible ? { bankName: comp.bankName, bankAccountIban: comp.bankAccountIban } : null}
        onClose={() => setEditOpen(false)}
        onSaved={reload}
      />

      <RecordPreview
        open={contract !== null}
        onClose={() => setContract(null)}
        title={contract ? `${t('hr.file.contracts')} — ${contract.contractNumber}` : ''}
        subtitle={e.fullNameEn}
        entityType="EMPLOYMENT_CONTRACT"
        entityId={contract?.id ?? null}
        canWriteAttachments={can('erp.hr.employee.manage')}
        canMarkConfidential
        testId="employment-contract-preview"
        fields={
          contract
            ? [
                { label: t('hr.file.contractNumber'), value: contract.contractNumber },
                { label: t('common.type'), value: contract.type },
                { label: t('common.status'), value: contract.status },
                { label: t('hr.file.periodFrom'), value: contract.startDate.slice(0, 10) },
                { label: t('hr.file.periodTo'), value: contract.endDate?.slice(0, 10) ?? '—' },
                { label: t('hr.file.basicSalary'), value: contract.baseSalaryMinor !== undefined ? money(contract.baseSalaryMinor, contract.currency ?? 'SAR') : '—' },
                { label: t('hr.file.probationDays'), value: String(contract.probationDays) },
              ]
            : []
        }
      />
    </div>
  );
}

/**
 * The employee photograph.
 *
 * It is an ordinary attachment with `isPrimary` set, so the printed card and
 * the file read the same image and there is no second photo column to keep in
 * sync.
 */
function EmployeePhotoCard({
  employeeId,
  photos,
  photoUrl,
  onChanged,
}: {
  employeeId: string;
  /** Every attachment of the employee record; the card shows the images. */
  photos: AttachmentDto[];
  /** The primary photograph as a `data:` URL, or null when there is none. */
  photoUrl: string | null;
  onChanged: () => Promise<void>;
}) {
  const { t } = useUi();
  const { can } = useAuth();
  const [items, setItems] = useState<AttachmentDto[] | null>(null);
  const images = (items ?? photos).filter((a) => a.previewKind === 'image');

  // The card edits its own list, then hands control back to the parent so the
  // printed card reads the photograph that was just uploaded or removed.
  const apply = (next: AttachmentDto[]) => {
    setItems(next);
    void onChanged().then(() => setItems(null));
  };

  return (
    <Card className="p-4" data-testid="file-photo">
      <p className="oryx-panel-title m-0 mb-2">{t('hr.file.photo')}</p>
      <div className="mb-3 flex items-center gap-3">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={t('hr.file.photo')}
            className="h-20 w-20 rounded-xl border object-cover"
            style={{ borderColor: 'var(--border)' }}
            data-testid="file-photo-image"
          />
        ) : (
          <div
            className="grid h-20 w-20 place-items-center rounded-xl border border-dashed text-[11px]"
            style={{ borderColor: 'var(--border)' }}
            data-testid="file-photo-empty"
          >
            <Icon name="users" size={22} />
          </div>
        )}
        <p className="oryx-faint m-0 text-[11.5px]">{t('hr.file.photoHint')}</p>
      </div>
      <AttachmentField
        entityType="EMPLOYEE"
        entityId={employeeId}
        value={images}
        onChange={apply}
        canWrite={can('erp.hr.employee.manage')}
        allowPrimary
        autoFlush
        testId="employee-photo"
      />
    </Card>
  );
}

function EditEmployeeModal({
  open,
  employee,
  bank,
  onClose,
  onSaved,
}: {
  open: boolean;
  employee: EmployeeFilePersonalCard['employee'];
  /** Null when the caller cannot read salary/bank details; the fields hide. */
  bank: { bankName: string | null; bankAccountIban: string | null } | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullNameEn: employee.fullNameEn,
    fullNameAr: employee.fullNameAr,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    nationalId: employee.nationalId ?? '',
    nationality: employee.nationality ?? '',
    dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? '',
    gender: employee.gender ?? '',
    addressLine: employee.addressLine ?? '',
    bankName: bank?.bankName ?? '',
    bankAccountIban: bank?.bankAccountIban ?? '',
    contractType: employee.contractType,
  });
  const attach = useFormAttachments();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateEmployee(employee.id, {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
      });
      await attach.flush(employee.id);
      attach.reset();
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
      title={t('hr.file.editCard')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="file-save-card">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${t('common.name')} (EN)`}>
          <input className="oryx-input" value={form.fullNameEn} onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (AR)`}>
          <input className="oryx-input" value={form.fullNameAr} onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })} />
        </Field>
        <Field label={t('hr.file.nationalId')}>
          <input className="oryx-input" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
        </Field>
        <Field label={t('hr.file.nationality')}>
          <input className="oryx-input" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
        </Field>
        <Field label={t('hr.file.dateOfBirth')}>
          <input type="date" className="oryx-input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
        </Field>
        <Field label={t('hr.file.gender')}>
          <input className="oryx-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t('hr.file.address')}>
          <input className="oryx-input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
        </Field>
        <Field label={t('hr.file.contractType')}>
          <select className="oryx-select" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
            {['PERMANENT', 'FIXED_TERM', 'PART_TIME', 'CONTRACTOR'].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </Field>
        {bank ? (
          <>
            <Field label={t('hr.file.bankName')}>
              <input className="oryx-input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            </Field>
            <Field label={t('hr.file.bankIban')}>
              <input className="oryx-input" value={form.bankAccountIban} onChange={(e) => setForm({ ...form, bankAccountIban: e.target.value })} />
            </Field>
          </>
        ) : null}
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField
          entityType="EMPLOYEE"
          entityId={employee.id}
          value={attach.items}
          onChange={attach.setItems}
          registerFlush={attach.register}
          canWrite
          canMarkConfidential
          allowPrimary
          testId="edit-employee-attachments"
        />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ payroll ledger

function PayrollTab({ employeeId, employeeName, employeeCode }: { employeeId: string; employeeName: string; employeeCode: string }) {
  const { t, locale } = useUi();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const [preview, setPreview] = useState<EmployeePayslipDto | null>(null);
  const ledger = useAsync(() => api.employeeFilePayroll(employeeId, applied), [employeeId, applied.from, applied.to]);
  // Printing must stay synchronous inside the click handler or the popup is
  // blocked, so the unfiltered ledger is loaded alongside the windowed one.
  const fullLedger = useAsync(() => api.employeeFilePayroll(employeeId, {}), [employeeId]);

  if (ledger.error) {
    return (
      <Card className="p-4">
        <ErrorBanner message={ledger.error} onRetry={ledger.reload} />
      </Card>
    );
  }
  if (ledger.loading || !ledger.data) return <Skeleton height={240} />;

  const items = ledger.data.items;
  const totals = ledger.data.totals;
  const currency = totals.currency;

  const printPayslip = (slip: EmployeePayslipDto) => {
    const ok = printDocument({
      title: `${t('hr.file.payslip')} — ${employeeName}`,
      subtitle: `${employeeCode} · ${slip.periodCode} (${slip.periodStart.slice(0, 10)} → ${slip.periodEnd.slice(0, 10)})`,
      locale,
      sections: [
        {
          heading: t('hr.file.payslip'),
          fields: [
            { label: t('hr.file.runNumber'), value: slip.runNumber },
            { label: t('hr.file.paymentStatus'), value: slip.paymentStatus },
            { label: t('hr.file.basicSalary'), value: money(slip.basicMinor, slip.currency) },
            { label: t('erp.hr.allowances'), value: money(slip.allowancesMinor, slip.currency) },
            { label: t('erp.hr.deductions'), value: money(slip.deductionsMinor, slip.currency) },
            { label: t('erp.hr.net'), value: money(slip.netMinor, slip.currency) },
          ],
          table: {
            columns: [
              { header: t('common.name'), value: (r) => String(r.nameEn) },
              { header: t('common.type'), value: (r) => String(r.type) },
              { header: t('hr.file.bonusAmount'), value: (r) => money(Number(r.amountMinor), slip.currency), align: 'end' },
            ],
            rows: slip.lines as unknown as Array<Record<string, unknown>>,
          },
        },
      ],
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  const printLedger = (onlyWindow: boolean) => {
    const source = onlyWindow ? ledger.data : fullLedger.data;
    if (!source) return;
    const ok = printDocument({
      title: `${t('hr.file.tab.payroll')} — ${employeeName}`,
      subtitle:
        onlyWindow && (applied.from || applied.to)
          ? `${applied.from ?? '—'} → ${applied.to ?? '—'}`
          : t('hr.file.printFullLedger'),
      locale,
      sections: [
        {
          heading: t('hr.file.payrollTotals'),
          fields: [
            { label: t('hr.file.basicSalary'), value: money(source.totals.basicMinor, source.totals.currency) },
            { label: t('erp.hr.allowances'), value: money(source.totals.allowancesMinor, source.totals.currency) },
            { label: t('erp.hr.deductions'), value: money(source.totals.deductionsMinor, source.totals.currency) },
            { label: t('erp.hr.net'), value: money(source.totals.netMinor, source.totals.currency) },
          ],
          table: {
            columns: [
              { header: t('hr.file.runNumber'), value: (r) => String(r.runNumber) },
              { header: t('common.date'), value: (r) => `${String(r.periodStart).slice(0, 10)} → ${String(r.periodEnd).slice(0, 10)}` },
              { header: t('hr.file.basicSalary'), value: (r) => money(Number(r.basicMinor), String(r.currency)), align: 'end' },
              { header: t('erp.hr.allowances'), value: (r) => money(Number(r.allowancesMinor), String(r.currency)), align: 'end' },
              { header: t('erp.hr.deductions'), value: (r) => money(Number(r.deductionsMinor), String(r.currency)), align: 'end' },
              { header: t('erp.hr.net'), value: (r) => money(Number(r.netMinor), String(r.currency)), align: 'end' },
              { header: t('hr.file.paymentStatus'), value: (r) => String(r.paymentStatus) },
            ],
            rows: source.items as unknown as Array<Record<string, unknown>>,
          },
        },
      ],
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  const exportLedger = () => {
    exportCsv(
      `payslips-${employeeCode}`,
      [t('hr.file.runNumber'), t('hr.file.periodFrom'), t('hr.file.periodTo'), t('hr.file.basicSalary'), t('erp.hr.allowances'), t('erp.hr.deductions'), t('erp.hr.net'), t('hr.file.paymentStatus')],
      items.map((s) => [
        s.runNumber,
        s.periodStart.slice(0, 10),
        s.periodEnd.slice(0, 10),
        money(s.basicMinor, s.currency),
        money(s.allowancesMinor, s.currency),
        money(s.deductionsMinor, s.currency),
        money(s.netMinor, s.currency),
        s.paymentStatus,
      ]),
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="file-payroll">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('hr.file.periodFrom')}>
            <input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="payroll-from" />
          </Field>
          <Field label={t('hr.file.periodTo')}>
            <input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="payroll-to" />
          </Field>
          <Button size="sm" variant="primary" onClick={() => setApplied({ from: from || undefined, to: to || undefined })} data-testid="payroll-apply">
            {t('hr.file.applyRange')}
          </Button>
          <div className="ms-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={() => printLedger(true)} data-testid="payroll-print-period">
              {t('hr.file.printPeriod')}
            </Button>
            <Button size="sm" onClick={() => printLedger(false)} data-testid="payroll-print-full">
              {t('hr.file.printFullLedger')}
            </Button>
            <Button size="sm" onClick={exportLedger} data-testid="payroll-export">
              {t('hr.file.exportPayslips')}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <p className="oryx-panel-title m-0 mb-2">{t('hr.file.payrollTotals')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label={t('hr.file.basicSalary')} value={money(totals.basicMinor, currency)} />
          <Kpi label={t('erp.hr.allowances')} value={money(totals.allowancesMinor, currency)} />
          <Kpi label={t('erp.hr.deductions')} value={money(totals.deductionsMinor, currency)} />
          <Kpi label={t('erp.hr.net')} value={money(totals.netMinor, currency)} />
          <Kpi label={t('hr.file.payslip')} value={String(totals.payslipCount)} />
        </div>
      </Card>

      <Card>
        {items.length === 0 ? (
          <EmptyState title={t('hr.file.noPayslips')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('hr.file.runNumber')}</th>
                <th>{t('common.date')}</th>
                <th>{t('hr.file.basicSalary')}</th>
                <th>{t('erp.hr.allowances')}</th>
                <th>{t('erp.hr.deductions')}</th>
                <th>{t('erp.hr.net')}</th>
                <th>{t('hr.file.paymentStatus')}</th>
                <th>{t('hr.file.paidAt')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} data-testid={`payslip-row-${s.id}`}>
                  <td className="font-mono text-[12px]">{s.runNumber}</td>
                  <td className="text-[12.5px]">{s.periodStart.slice(0, 10)} → {s.periodEnd.slice(0, 10)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(s.basicMinor, s.currency)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(s.allowancesMinor, s.currency)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(s.deductionsMinor, s.currency)}</td>
                  <td className="tabular-nums text-[12.5px] font-semibold">{money(s.netMinor, s.currency)}</td>
                  <td><StatusBadge status={s.paymentStatus} label={s.paymentStatus} /></td>
                  <td className="text-[12.5px]">{s.paidAt?.slice(0, 10) ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setPreview(s)} data-testid={`preview-payslip-${s.id}`}>
                        {t('attach.preview')}
                      </Button>
                      <Button size="sm" onClick={() => printPayslip(s)} data-testid={`print-payslip-${s.id}`}>
                        {t('hr.file.printPayslip')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <RecordPreview
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${t('hr.file.payslip')} — ${preview.runNumber}` : ''}
        subtitle={preview ? `${employeeName} · ${preview.periodCode}` : undefined}
        entityType="PAYSLIP"
        entityId={preview?.id ?? null}
        canWriteAttachments={false}
        canMarkConfidential
        testId="payslip-preview"
        fields={
          preview
            ? [
                { label: t('hr.file.runNumber'), value: preview.runNumber },
                { label: t('hr.file.periodFrom'), value: preview.periodStart.slice(0, 10) },
                { label: t('hr.file.periodTo'), value: preview.periodEnd.slice(0, 10) },
                { label: t('hr.file.basicSalary'), value: money(preview.basicMinor, preview.currency) },
                { label: t('erp.hr.allowances'), value: money(preview.allowancesMinor, preview.currency) },
                { label: t('erp.hr.deductions'), value: money(preview.deductionsMinor, preview.currency) },
                { label: t('erp.hr.net'), value: money(preview.netMinor, preview.currency) },
                { label: t('hr.file.paymentStatus'), value: preview.paymentStatus },
                { label: t('hr.file.paidAt'), value: preview.paidAt?.slice(0, 10) ?? '—' },
              ]
            : []
        }
        table={{
          headers: [t('common.name'), t('common.type'), t('hr.file.bonusAmount')],
          rows: (preview?.lines ?? []).map((l) => [String(l.nameEn), String(l.type), money(Number(l.amountMinor), preview!.currency)]),
        }}
      />
    </div>
  );
}

// -------------------------------------------------------------------- leave

function LeaveTab({ employeeId }: { employeeId: string }) {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const [preview, setPreview] = useState<EmployeeLeaveRecordDto | null>(null);
  const [open, setOpen] = useState(false);
  const data = useAsync(() => api.employeeFileLeave(employeeId), [employeeId]);

  if (data.error) return <Card className="p-4"><ErrorBanner message={data.error} onRetry={data.reload} /></Card>;
  if (data.loading || !data.data) return <Skeleton height={220} />;

  const printLeave = (row: EmployeeLeaveRecordDto) => {
    const ok = printDocument({
      title: `${t('hr.file.tab.leave')} — ${row.leaveTypeNameEn}`,
      subtitle: `${row.startDate.slice(0, 10)} → ${row.endDate.slice(0, 10)}`,
      locale,
      sections: [
        {
          fields: [
            { label: t('erp.hr.leaveType'), value: `${row.leaveTypeNameEn} / ${row.leaveTypeNameAr}` },
            { label: t('erp.hr.days'), value: (row.days / 100).toFixed(2) },
            { label: t('common.status'), value: row.status },
            { label: t('hr.file.reason'), value: row.reason ?? '—' },
            { label: t('common.notes'), value: row.decisionNote ?? '—' },
          ],
        },
      ],
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="file-leave">
      <Card className="p-4">
        <p className="oryx-panel-title m-0 mb-2">{t('hr.file.leaveBalances')} — {data.data.year}</p>
        {data.data.balances.length === 0 ? (
          <p className="oryx-faint m-0 text-[12px]">{t('hr.file.noRecords')}</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.hr.leaveType')}</th>
                <th>{t('hr.file.entitled')}</th>
                <th>{t('hr.file.used')}</th>
                <th>{t('hr.file.pending')}</th>
                <th>{t('hr.file.remaining')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.balances.map((b) => (
                <tr key={b.id}>
                  <td className="text-[12.5px]">{b.leaveTypeNameEn}</td>
                  <td className="tabular-nums text-[12.5px]">{(b.entitledDays / 100).toFixed(2)}</td>
                  <td className="tabular-nums text-[12.5px]">{(b.usedDays / 100).toFixed(2)}</td>
                  <td className="tabular-nums text-[12.5px]">{(b.pendingDays / 100).toFixed(2)}</td>
                  <td className="tabular-nums text-[12.5px] font-semibold">{(b.remainingDays / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('hr.file.leaveRequests')}</p>
          {can('erp.hr.leave.request') ? (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="file-new-leave">
              <Icon name="plus" size={14} />
              {t('erp.hr.newLeave')}
            </Button>
          ) : null}
        </div>
        {data.data.items.length === 0 ? (
          <EmptyState title={t('hr.file.noRecords')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.hr.leaveType')}</th>
                <th>{t('common.date')}</th>
                <th>{t('erp.hr.days')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((r) => (
                <tr key={r.id} data-testid={`leave-row-${r.id}`}>
                  <td className="text-[12.5px]">{r.leaveTypeNameEn}</td>
                  <td className="text-[12.5px]">{r.startDate.slice(0, 10)} → {r.endDate.slice(0, 10)}</td>
                  <td className="tabular-nums text-[12.5px]">{(r.days / 100).toFixed(2)}</td>
                  <td><StatusBadge status={r.status} label={r.status} /></td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setPreview(r)} data-testid={`preview-leave-${r.id}`}>{t('attach.preview')}</Button>
                      <Button size="sm" onClick={() => printLeave(r)}>{t('attach.print')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <RecordPreview
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${t('erp.hr.leaveType')} — ${preview.leaveTypeNameEn}` : ''}
        subtitle={preview ? `${preview.startDate.slice(0, 10)} → ${preview.endDate.slice(0, 10)}` : undefined}
        entityType="LEAVE_REQUEST"
        entityId={preview?.id ?? null}
        canWriteAttachments={can('erp.hr.leave.request')}
        testId="leave-preview"
        fields={
          preview
            ? [
                { label: `${t('erp.hr.leaveType')} (EN)`, value: preview.leaveTypeNameEn },
                { label: `${t('erp.hr.leaveType')} (AR)`, value: preview.leaveTypeNameAr },
                { label: t('erp.reports.from'), value: preview.startDate.slice(0, 10) },
                { label: t('erp.reports.to'), value: preview.endDate.slice(0, 10) },
                { label: t('erp.hr.days'), value: (preview.days / 100).toFixed(2) },
                { label: t('hr.file.paid'), value: preview.isPaid ? t('common.yes') : t('common.no') },
                { label: t('common.status'), value: preview.status },
                { label: t('hr.file.reason'), value: preview.reason ?? '—' },
                { label: t('common.notes'), value: preview.decisionNote ?? '—' },
              ]
            : []
        }
      />

      <LeaveRequestModal open={open} employeeId={employeeId} onClose={() => setOpen(false)} onSaved={data.reload} />
    </div>
  );
}

function LeaveRequestModal({
  open,
  employeeId,
  onClose,
  onSaved,
}: {
  open: boolean;
  employeeId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const types = useAsync(() => api.leaveTypes(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: today(), endDate: today(), reason: '' });
  const attach = useFormAttachments();

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
      await attach.flush(created.id);
      attach.reset();
      await onSaved();
      setForm({ leaveTypeId: '', startDate: today(), endDate: today(), reason: '' });
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
          <Button
            variant="primary"
            disabled={busy || !form.leaveTypeId || !form.startDate || !form.endDate}
            onClick={submit}
            data-testid="file-save-leave"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.hr.leaveType')} required>
          <select className="oryx-select" value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} data-testid="file-leave-type">
            <option value="">—</option>
            {(types.data?.items ?? []).map((x) => <option key={x.id} value={x.id}>{x.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.reports.from')} required>
          <input type="date" className="oryx-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="file-leave-start" />
        </Field>
        <Field label={t('erp.reports.to')} required>
          <input type="date" className="oryx-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="file-leave-end" />
        </Field>
        <Field label={t('hr.file.reason')}>
          <input className="oryx-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="file-leave-reason" />
        </Field>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField
          entityType="LEAVE_REQUEST"
          entityId={null}
          value={attach.items}
          onChange={attach.setItems}
          registerFlush={attach.register}
          canWrite
          testId="new-leave-attachments"
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- penalties

function PenaltiesTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const data = useAsync(() => api.employeeFilePenalties(employeeId), [employeeId]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EmployeePenaltyDto | null>(null);

  const printPenalty = (row: EmployeePenaltyDto) => {
    const ok = printDocument({
      title: `${t('hr.file.tab.penalties')} — ${row.actionType}`,
      subtitle: employeeName,
      locale,
      sections: [
        {
          fields: [
            { label: t('hr.file.actionType'), value: row.actionType },
            { label: t('hr.file.effectiveDate'), value: row.effectiveDate.slice(0, 10) },
            { label: t('hr.file.reason'), value: row.reason },
            { label: t('hr.file.decidedBy'), value: row.decidedByName ?? '—' },
            ...(row.amountMinor !== undefined ? [{ label: t('hr.file.bonusAmount'), value: money(row.amountMinor, row.currency ?? 'SAR') }] : []),
            { label: t('common.notes'), value: row.notes ?? '—' },
          ],
        },
      ],
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="file-penalties">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('hr.file.tab.penalties')}</p>
          {can('erp.hr.penalty.manage') ? (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="new-penalty">
              <Icon name="plus" size={14} />
              {t('hr.file.newPenalty')}
            </Button>
          ) : null}
        </div>
        {data.error ? <div className="p-4"><ErrorBanner message={data.error} onRetry={data.reload} /></div> : null}
        {data.loading ? <div className="p-4"><Skeleton height={120} /></div> : (data.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('hr.file.noRecords')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('hr.file.actionType')}</th>
                <th>{t('hr.file.effectiveDate')}</th>
                <th>{t('hr.file.reason')}</th>
                <th>{t('hr.file.decidedBy')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data!.items.map((r) => (
                <tr key={r.id} data-testid={`penalty-row-${r.id}`}>
                  <td className="text-[12.5px] font-semibold">{r.actionType}</td>
                  <td className="text-[12.5px]">{r.effectiveDate.slice(0, 10)}</td>
                  <td className="text-[12.5px]">{r.reason}</td>
                  <td className="text-[12.5px]">{r.decidedByName ?? '—'}</td>
                  <td className="flex gap-1">
                    <Button size="sm" onClick={() => setPreview(r)} data-testid={`preview-penalty-${r.id}`}>{t('attach.preview')}</Button>
                    <Button size="sm" onClick={() => printPenalty(r)}>{t('attach.print')}</Button>
                    {can('erp.hr.penalty.manage') ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await api.deleteEmployeePenalty(r.id);
                          await data.reload();
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <RecordPreview
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${t('hr.file.tab.penalties')} — ${preview.actionType}` : ''}
        subtitle={employeeName}
        entityType="EMPLOYEE_PENALTY"
        entityId={preview?.id ?? null}
        canWriteAttachments={can('erp.hr.penalty.manage')}
        canMarkConfidential
        testId="penalty-preview"
        fields={
          preview
            ? [
                { label: t('hr.file.actionType'), value: preview.actionType },
                { label: t('hr.file.effectiveDate'), value: preview.effectiveDate.slice(0, 10) },
                { label: t('hr.file.reason'), value: preview.reason },
                { label: t('hr.file.decidedBy'), value: preview.decidedByName ?? '—' },
                { label: t('hr.file.bonusAmount'), value: preview.amountMinor !== undefined ? money(preview.amountMinor, preview.currency ?? 'SAR') : '—' },
                { label: t('common.notes'), value: preview.notes ?? '—' },
              ]
            : []
        }
      />
      <PenaltyModal open={open} employeeId={employeeId} onClose={() => setOpen(false)} onSaved={data.reload} />
    </div>
  );
}

function PenaltyModal({
  open,
  employeeId,
  onClose,
  onSaved,
}: {
  open: boolean;
  employeeId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ actionType: 'WRITTEN_WARNING', reason: '', effectiveDate: today(), decidedByName: '', notes: '', amount: '' });
  const attach = useFormAttachments();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createEmployeePenalty(employeeId, {
        actionType: form.actionType,
        reason: form.reason,
        effectiveDate: form.effectiveDate,
        decidedByName: form.decidedByName || undefined,
        notes: form.notes || undefined,
        ...(form.amount ? { amountMinor: toMinorInput(form.amount) } : {}),
      });
      await attach.flush(String(created.id));
      attach.reset();
      await onSaved();
      setForm({ actionType: 'WRITTEN_WARNING', reason: '', effectiveDate: today(), decidedByName: '', notes: '', amount: '' });
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
      title={t('hr.file.newPenalty')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.reason} onClick={submit} data-testid="save-penalty">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hr.file.actionType')} required>
          <select className="oryx-select" value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })} data-testid="penalty-type">
            {['VERBAL_WARNING', 'WRITTEN_WARNING', 'FINAL_WARNING', 'SALARY_DEDUCTION', 'SUSPENSION', 'TERMINATION'].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label={t('hr.file.effectiveDate')} required>
          <input type="date" className="oryx-input" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </Field>
        <Field label={t('hr.file.reason')} required>
          <input className="oryx-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="penalty-reason" />
        </Field>
        <Field label={t('hr.file.decidedBy')}>
          <input className="oryx-input" value={form.decidedByName} onChange={(e) => setForm({ ...form, decidedByName: e.target.value })} />
        </Field>
        <Field label={`${t('hr.file.bonusAmount')} (${t('common.optional')})`}>
          <input className="oryx-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField
          entityType="EMPLOYEE_PENALTY"
          entityId={null}
          value={attach.items}
          onChange={attach.setItems}
          registerFlush={attach.register}
          canWrite
          canMarkConfidential
          testId="new-penalty-attachments"
        />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ bonuses

function BonusesTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const { t, locale } = useUi();
  const { can } = useAuth();
  const data = useAsync(() => api.employeeFileBonuses(employeeId), [employeeId]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EmployeeBonusDto | null>(null);

  if (data.error) return <Card className="p-4"><ErrorBanner message={data.error} onRetry={data.reload} /></Card>;
  if (data.loading || !data.data) return <Skeleton height={220} />;

  const printBonus = (row: EmployeeBonusDto) => {
    const ok = printDocument({
      title: `${t('hr.file.tab.bonuses')} — ${row.type}`,
      subtitle: employeeName,
      locale,
      sections: [
        {
          fields: [
            { label: t('hr.file.bonusType'), value: row.type },
            { label: t('hr.file.bonusAmount'), value: money(row.amountMinor, row.currency) },
            { label: t('hr.file.reason'), value: row.reason },
            { label: t('hr.file.approvedAt'), value: row.approvedAt?.slice(0, 10) ?? '—' },
            { label: t('hr.file.paymentStatus'), value: row.paid ? t('hr.file.paid') : t('hr.file.notPaid') },
          ],
        },
      ],
      footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
    });
    if (!ok) window.alert(t('preview.popupBlocked'));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="file-bonuses">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label={t('hr.file.notPaid')} value={money(data.data.totals.approvedMinor, data.data.totals.currency)} />
          <Kpi label={t('hr.file.paid')} value={money(data.data.totals.paidMinor, data.data.totals.currency)} />
          <Kpi label={t('hr.file.tab.bonuses')} value={String(data.data.items.length)} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('hr.file.tab.bonuses')}</p>
          {can('erp.hr.bonus.manage') ? (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="new-bonus">
              <Icon name="plus" size={14} />
              {t('hr.file.newBonus')}
            </Button>
          ) : null}
        </div>
        {data.data.items.length === 0 ? (
          <EmptyState title={t('hr.file.noRecords')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('hr.file.bonusType')}</th>
                <th>{t('hr.file.reason')}</th>
                <th>{t('hr.file.bonusAmount')}</th>
                <th>{t('hr.file.approvedAt')}</th>
                <th>{t('hr.file.paymentStatus')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.items.map((b) => (
                <tr key={b.id} data-testid={`bonus-row-${b.id}`}>
                  <td className="text-[12.5px] font-semibold">{b.type}</td>
                  <td className="text-[12.5px]">{b.reason}</td>
                  <td className="tabular-nums text-[12.5px]">{money(b.amountMinor, b.currency)}</td>
                  <td className="text-[12.5px]">{b.approvedAt?.slice(0, 10) ?? '—'}</td>
                  <td>
                    <Badge tone={b.paid ? 'success' : b.approvedAt ? 'info' : 'warning'}>
                      {b.paid ? t('hr.file.paid') : b.approvedAt ? t('hr.file.notPaid') : t('hr.file.pending')}
                    </Badge>
                  </td>
                  <td className="flex gap-1">
                    <Button size="sm" onClick={() => setPreview(b)} data-testid={`preview-bonus-${b.id}`}>{t('attach.preview')}</Button>
                    <Button size="sm" onClick={() => printBonus(b)}>{t('attach.print')}</Button>
                    {can('erp.hr.bonus.manage') && !b.paid && !b.approvedAt ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          await api.approveEmployeeBonus(b.id);
                          await data.reload();
                        }}
                        data-testid={`approve-bonus-${b.id}`}
                      >
                        {t('hr.file.approve')}
                      </Button>
                    ) : null}
                    {can('erp.hr.bonus.manage') && !b.paid ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await api.deleteEmployeeBonus(b.id);
                          await data.reload();
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <RecordPreview
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${t('hr.file.tab.bonuses')} — ${preview.type}` : ''}
        subtitle={employeeName}
        entityType="EMPLOYEE_BONUS"
        entityId={preview?.id ?? null}
        canWriteAttachments={can('erp.hr.bonus.manage')}
        canMarkConfidential
        testId="bonus-preview"
        fields={
          preview
            ? [
                { label: t('hr.file.bonusType'), value: preview.type },
                { label: t('hr.file.bonusAmount'), value: money(preview.amountMinor, preview.currency) },
                { label: t('hr.file.reason'), value: preview.reason },
                { label: t('hr.file.approvedAt'), value: preview.approvedAt?.slice(0, 10) ?? '—' },
                { label: t('hr.file.paymentStatus'), value: preview.paid ? t('hr.file.paid') : t('hr.file.notPaid') },
              ]
            : []
        }
      />
      <BonusModal open={open} employeeId={employeeId} onClose={() => setOpen(false)} onSaved={data.reload} />
    </div>
  );
}

function BonusModal({
  open,
  employeeId,
  onClose,
  onSaved,
}: {
  open: boolean;
  employeeId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ type: 'BONUS', reason: '', amount: '', approveNow: true });
  const attach = useFormAttachments();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createEmployeeBonus(employeeId, {
        type: form.type,
        reason: form.reason,
        amountMinor: toMinorInput(form.amount),
        approveNow: form.approveNow,
      });
      await attach.flush(String(created.id));
      attach.reset();
      await onSaved();
      setForm({ type: 'BONUS', reason: '', amount: '', approveNow: true });
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
      title={t('hr.file.newBonus')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.reason || toMinorInput(form.amount) <= 0}
            onClick={submit}
            data-testid="save-bonus"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hr.file.bonusType')}>
          <select className="oryx-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="bonus-type">
            {['BONUS', 'INCENTIVE', 'COMMISSION', 'OVERTIME_AWARD', 'OTHER'].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label={t('hr.file.bonusAmount')} required>
          <input className="oryx-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="bonus-amount" />
        </Field>
        <Field label={t('hr.file.reason')} required>
          <input className="oryx-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="bonus-reason" />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-[12.5px]">
          <input type="checkbox" checked={form.approveNow} onChange={(e) => setForm({ ...form, approveNow: e.target.checked })} data-testid="bonus-approve-now" />
          <span>{t('hr.file.approve')}</span>
        </label>
      </div>
      <p className="oryx-faint m-0 mt-2 text-[11.5px]">
        {t('hr.file.notPaid')}: {t('erp.hr.payroll')}
      </p>
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <AttachmentField
          entityType="EMPLOYEE_BONUS"
          entityId={null}
          value={attach.items}
          onChange={attach.setItems}
          registerFlush={attach.register}
          canWrite
          canMarkConfidential
          testId="new-bonus-attachments"
        />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ reports

function ReportsTab({
  employeeId,
  employeeName,
  employeeCode,
  hireDate,
}: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  hireDate: string | null;
}) {
  const { t, locale } = useUi();
  const [from, setFrom] = useState(hireDate?.slice(0, 10) ?? '');
  const [to, setTo] = useState(today());
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({
    from: hireDate?.slice(0, 10),
    to: today(),
  });
  const report = useAsync(() => api.employeeFileReports(employeeId, applied), [employeeId, applied.from, applied.to]);

  const printFull = useCallback(
    (data: EmployeeFileReports) => {
      const hours = (minutes: number) => (minutes / 60).toFixed(2);
      const ok = printDocument({
        title: `${t('hr.file.tab.reports')} — ${employeeName}`,
        subtitle: `${employeeCode} · ${data.window.from.slice(0, 10)} → ${data.window.to.slice(0, 10)}`,
        locale,
        sections: [
          {
            heading: t('hr.file.attendanceSummary'),
            fields: [
              { label: t('hr.file.recordedDays'), value: String(data.attendance.summary.recordedDays) },
              { label: t('erp.hr.present'), value: String(data.attendance.summary.presentDays) },
              { label: t('erp.hr.late'), value: String(data.attendance.summary.lateDays) },
              { label: t('erp.hr.absent'), value: String(data.attendance.summary.absentDays) },
              { label: t('hr.file.workedHours'), value: hours(data.attendance.summary.workedMinutes) },
              { label: t('hr.file.overtimeHours'), value: hours(data.attendance.summary.overtimeMinutes) },
            ],
          },
          {
            heading: t('hr.file.leaveSummary'),
            fields: [
              { label: t('erp.hr.requests'), value: String(data.leave.summary.requestCount) },
              { label: t('erp.hr.approved'), value: (data.leave.summary.approvedDays / 100).toFixed(2) },
              { label: t('hr.file.pending'), value: String(data.leave.summary.pendingCount) },
            ],
            table: {
              columns: [
                { header: t('erp.hr.leaveType'), value: (r) => String(r.leaveTypeNameEn) },
                { header: t('common.date'), value: (r) => `${String(r.startDate).slice(0, 10)} → ${String(r.endDate).slice(0, 10)}` },
                { header: t('erp.hr.days'), value: (r) => (Number(r.days) / 100).toFixed(2), align: 'end' },
                { header: t('common.status'), value: (r) => String(r.status) },
              ],
              rows: data.leave.records as unknown as Array<Record<string, unknown>>,
            },
          },
          {
            heading: t('hr.file.penaltiesSummary'),
            fields: [
              { label: t('hr.file.actionType'), value: String(data.penalties.summary.count) },
              ...(data.penalties.summary.totalMinor !== undefined
                ? [{ label: t('hr.file.bonusAmount'), value: money(data.penalties.summary.totalMinor) }]
                : []),
            ],
            table: {
              columns: [
                { header: t('hr.file.actionType'), value: (r) => String(r.actionType) },
                { header: t('hr.file.effectiveDate'), value: (r) => String(r.effectiveDate).slice(0, 10) },
                { header: t('hr.file.reason'), value: (r) => String(r.reason) },
              ],
              rows: data.penalties.records as unknown as Array<Record<string, unknown>>,
            },
          },
          {
            heading: t('hr.file.bonusesSummary'),
            fields: [
              { label: t('hr.file.tab.bonuses'), value: String(data.bonuses.summary.count) },
              ...(data.bonuses.summary.approvedMinor !== undefined
                ? [{ label: t('hr.file.notPaid'), value: money(data.bonuses.summary.approvedMinor) }]
                : []),
              ...(data.bonuses.summary.paidMinor !== undefined
                ? [{ label: t('hr.file.paid'), value: money(data.bonuses.summary.paidMinor) }]
                : []),
            ],
            table: {
              columns: [
                { header: t('hr.file.bonusType'), value: (r) => String(r.type) },
                { header: t('hr.file.reason'), value: (r) => String(r.reason) },
                { header: t('hr.file.bonusAmount'), value: (r) => money(Number(r.amountMinor ?? 0)), align: 'end' },
                { header: t('hr.file.paymentStatus'), value: (r) => (r.paid ? t('hr.file.paid') : t('hr.file.notPaid')) },
              ],
              rows: data.bonuses.records as unknown as Array<Record<string, unknown>>,
            },
          },
          ...(data.payroll.visible
            ? [
                {
                  heading: t('hr.file.payrollSummary'),
                  fields: [
                    { label: t('hr.file.payslip'), value: String(data.payroll.totals.payslipCount) },
                    { label: t('erp.hr.allowances'), value: money(data.payroll.totals.allowancesMinor, data.payroll.totals.currency) },
                    { label: t('erp.hr.deductions'), value: money(data.payroll.totals.deductionsMinor, data.payroll.totals.currency) },
                    { label: t('erp.hr.net'), value: money(data.payroll.totals.netMinor, data.payroll.totals.currency) },
                  ],
                  table: {
                    columns: [
                      { header: t('common.date'), value: (r: Record<string, unknown>) => String(r.createdAt).slice(0, 10) },
                      { header: t('erp.hr.net'), value: (r: Record<string, unknown>) => money(Number(r.netMinor), String(r.currency)), align: 'end' as const },
                    ],
                    rows: data.payroll.payslips as unknown as Array<Record<string, unknown>>,
                  },
                },
              ]
            : []),
        ],
        footer: new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'),
      });
      if (!ok) window.alert(t('preview.popupBlocked'));
    },
    [employeeCode, employeeName, locale, t],
  );

  if (report.error) return <Card className="p-4"><ErrorBanner message={report.error} onRetry={report.reload} /></Card>;
  if (report.loading || !report.data) return <Skeleton height={260} />;

  const d = report.data;
  const hours = (minutes: number) => (minutes / 60).toFixed(2);

  const exportReport = () => {
    exportCsv(`employee-report-${employeeCode}`, [t('hr.file.reportSection'), t('common.name'), t('common.value')], [
      [t('hr.file.attendanceSummary'), t('hr.file.recordedDays'), String(d.attendance.summary.recordedDays)],
      [t('hr.file.attendanceSummary'), t('erp.hr.present'), String(d.attendance.summary.presentDays)],
      [t('hr.file.attendanceSummary'), t('erp.hr.late'), String(d.attendance.summary.lateDays)],
      [t('hr.file.attendanceSummary'), t('erp.hr.absent'), String(d.attendance.summary.absentDays)],
      [t('hr.file.attendanceSummary'), t('hr.file.workedHours'), hours(d.attendance.summary.workedMinutes)],
      [t('hr.file.attendanceSummary'), t('hr.file.overtimeHours'), hours(d.attendance.summary.overtimeMinutes)],
      [t('hr.file.leaveSummary'), t('erp.hr.requests'), String(d.leave.summary.requestCount)],
      [t('hr.file.leaveSummary'), t('erp.hr.approved'), (d.leave.summary.approvedDays / 100).toFixed(2)],
      [t('hr.file.leaveSummary'), t('hr.file.pending'), String(d.leave.summary.pendingCount)],
      [t('hr.file.penaltiesSummary'), t('hr.file.actionType'), String(d.penalties.summary.count)],
      ...(d.penalties.summary.totalMinor !== undefined
        ? [[t('hr.file.penaltiesSummary'), t('hr.file.bonusAmount'), money(d.penalties.summary.totalMinor)]]
        : []),
      ...(d.payroll.visible
        ? [
            [t('hr.file.payrollTotals'), t('hr.file.basicSalary'), money(d.payroll.totals.grossMinor, d.payroll.totals.currency)],
            [t('hr.file.payrollTotals'), t('erp.hr.allowances'), money(d.payroll.totals.allowancesMinor, d.payroll.totals.currency)],
            [t('hr.file.payrollTotals'), t('erp.hr.deductions'), money(d.payroll.totals.deductionsMinor, d.payroll.totals.currency)],
            [t('hr.file.payrollTotals'), t('erp.hr.net'), money(d.payroll.totals.netMinor, d.payroll.totals.currency)],
          ]
        : []),
    ]);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="file-reports">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('hr.file.periodFrom')}>
            <input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from" />
          </Field>
          <Field label={t('hr.file.periodTo')}>
            <input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to" />
          </Field>
          <Button size="sm" variant="primary" onClick={() => setApplied({ from: from || undefined, to: to || undefined })} data-testid="report-apply">
            {t('hr.file.applyRange')}
          </Button>
          <Button size="sm" className="ms-auto" onClick={exportReport} data-testid="report-export">
            {t('hr.file.exportExcel')}
          </Button>
          <Button size="sm" onClick={() => printFull(d)} data-testid="report-print">
            <Icon name="scroll" size={14} />
            {t('hr.file.fullReport')}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="oryx-panel-title m-0 mb-2">{t('hr.file.attendanceSummary')}</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label={t('hr.file.recordedDays')} value={String(d.attendance.summary.recordedDays)} />
          <Kpi label={t('erp.hr.present')} value={String(d.attendance.summary.presentDays)} />
          <Kpi label={t('erp.hr.late')} value={String(d.attendance.summary.lateDays)} />
          <Kpi label={t('erp.hr.absent')} value={String(d.attendance.summary.absentDays)} />
          <Kpi label={t('hr.file.workedHours')} value={hours(d.attendance.summary.workedMinutes)} />
          <Kpi label={t('hr.file.overtimeHours')} value={hours(d.attendance.summary.overtimeMinutes)} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="oryx-panel-title m-0 mb-2">{t('hr.file.leaveSummary')}</p>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label={t('erp.hr.requests')} value={String(d.leave.summary.requestCount)} />
            <Kpi label={t('erp.hr.approved')} value={(d.leave.summary.approvedDays / 100).toFixed(2)} />
            <Kpi label={t('hr.file.pending')} value={String(d.leave.summary.pendingCount)} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="oryx-panel-title m-0 mb-2">{t('hr.file.penaltiesSummary')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={t('hr.file.actionType')} value={String(d.penalties.summary.count)} />
            {d.penalties.summary.totalMinor !== undefined ? (
              <Kpi label={t('hr.file.bonusAmount')} value={money(d.penalties.summary.totalMinor)} />
            ) : null}
          </div>
        </Card>
        <Card className="p-4">
          <p className="oryx-panel-title m-0 mb-2">{t('hr.file.bonusesSummary')}</p>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label={t('hr.file.tab.bonuses')} value={String(d.bonuses.summary.count)} />
            {d.bonuses.summary.approvedMinor !== undefined ? (
              <Kpi label={t('hr.file.notPaid')} value={money(d.bonuses.summary.approvedMinor)} />
            ) : null}
            {d.bonuses.summary.paidMinor !== undefined ? (
              <Kpi label={t('hr.file.paid')} value={money(d.bonuses.summary.paidMinor)} />
            ) : null}
          </div>
        </Card>
        <Card className="p-4">
          <p className="oryx-panel-title m-0 mb-2">{t('hr.file.payrollSummary')}</p>
          {d.payroll.visible ? (
            <div className="grid grid-cols-2 gap-3">
              <Kpi label={t('hr.file.payslip')} value={String(d.payroll.totals.payslipCount)} />
              <Kpi label={t('erp.hr.net')} value={money(d.payroll.totals.netMinor, d.payroll.totals.currency)} />
            </div>
          ) : (
            <p className="oryx-muted m-0 text-[12.5px]">{t('hr.file.salaryNotPermitted')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- documents

function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { t } = useUi();
  const { can } = useAuth();
  const list = useAsync(() => api.attachments('EMPLOYEE_DOCUMENT', employeeId), [employeeId]);
  const [items, setItems] = useState<AttachmentDto[] | null>(null);
  const flushRef = useRef<((id?: string) => Promise<AttachmentDto[]>) | null>(null);

  return (
    <Card className="p-4" data-testid="file-documents">
      <p className="oryx-panel-title m-0 mb-2">{t('hr.file.tab.documents')}</p>
      <p className="oryx-faint m-0 mb-3 text-[11.5px]">
        {t('attach.empty')}
      </p>
      <AttachmentField
        entityType="EMPLOYEE_DOCUMENT"
        entityId={employeeId}
        value={items ?? list.data?.items ?? []}
        onChange={setItems}
        canWrite={can('erp.hr.employee.manage')}
        canMarkConfidential={can('erp.hr.document.confidential')}
        registerFlush={(handle) => {
          flushRef.current = handle ? handle.flush : null;
        }}
        testId="employee-documents"
      />
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="primary"
          disabled={!can('erp.hr.employee.manage')}
          onClick={async () => {
            await flushRef.current?.(employeeId);
            await list.reload();
          }}
          data-testid="employee-documents-save"
        >
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ helpers

function Row({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="oryx-faint text-[11px]">{label}</span>
      <span className={`text-[13px] font-semibold ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
      {sub ? <span className="oryx-faint text-[11px]">{sub}</span> : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <p className="oryx-faint m-0 text-[11px]">{label}</p>
      <p className="oryx-kpi-value m-0 mt-1">{value}</p>
    </div>
  );
}
