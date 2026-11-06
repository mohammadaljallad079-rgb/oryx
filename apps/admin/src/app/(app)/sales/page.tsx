'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { minorToInput, money, qty, toMinorInput, toQuantityInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SearchableSelect,
  SectionHeader,
  Skeleton,
  StatusBadge,
  TableShell,
  type SearchableOption,
} from '@/components/ui';
import type {
  CashierSessionDto,
  CustomerDto,
  PosSaleDto,
  SalesDocumentDto,
  WarehouseDto,
} from '@oryx/shared';
import { DocumentActions } from '@/components/document-actions';

type Tab = 'invoices' | 'orders' | 'quotations' | 'credit-notes' | 'pos' | 'customers';

interface LineDraft {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** A per-line discount in whole percent, converted to basis points on submit. */
  discountPercent: string;
  taxPercent: string;
}

const emptyLine = (): LineDraft => ({
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '0.00',
  discountPercent: '0',
  taxPercent: '15',
});

export default function SalesPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('invoices');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'invoices', label: t('erp.sales.invoices') },
    { key: 'orders', label: t('erp.sales.orders') },
    { key: 'quotations', label: t('erp.sales.quotations') },
    { key: 'credit-notes', label: t('erp.sales.creditNotes') },
    { key: 'pos', label: t('erp.sales.pos') },
    { key: 'customers', label: t('erp.sales.customers') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="sales-page">
      <SectionHeader
        title={t('nav.sales_pos')}
        subtitle={t('erp.sales.subtitle')}
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
            data-testid={`sales-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'invoices' ? <InvoicesTab canManage={can('erp.sales.invoice.manage')} /> : null}
      {tab === 'orders' ? <OrdersTab canManage={can('erp.sales.order.manage')} /> : null}
      {tab === 'quotations' ? <QuotationsTab canManage={can('erp.sales.order.manage')} /> : null}
      {tab === 'credit-notes' ? <CreditNotesTab canManage={can('erp.sales.credit_note.manage')} /> : null}
      {tab === 'pos' ? <PosTab canOperate={can('erp.sales.pos.operate')} canManage={can('erp.sales.pos.manage')} /> : null}
      {tab === 'customers' ? <CustomersTab canManage={can('erp.sales.customer.manage')} /> : null}
    </div>
  );
}

// ----------------------------------------------------------------- customers

function CustomersTab({ canManage }: { canManage: boolean }) {
  const { t, locale } = useUi();
  const { companyId } = useAuth();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerDto | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const list = useAsync(() => api.salesCustomers({ search: search || undefined }), [search]);
  const sources = useAsync(() => api.crmLeadSources({ companyId: companyId ?? undefined }), [companyId]);
  const departments = useAsync(() => api.hrDepartments({ companyId: companyId ?? undefined }), [companyId]);

  const sourceOptions: SearchableOption[] = (sources.data?.items ?? []).map((s) => ({
    value: s.id,
    label: locale === 'ar' ? s.nameAr : s.nameEn,
    hint: s.code,
  }));
  const departmentOptions: SearchableOption[] = (departments.data?.items ?? []).map((d) => ({
    value: d.id,
    label: locale === 'ar' ? d.nameAr : d.nameEn,
    hint: d.code,
  }));

  const label = (row: CustomerDto) => (locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr);

  const setStatus = async (row: CustomerDto, next: boolean) => {
    if (!window.confirm(t('erp.sales.statusChangeConfirm'))) return;
    await api.updateCustomer(row.id, { isActive: next });
    await list.reload();
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="customer-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-customer">
            <Icon name="plus" size={16} />
            {t('erp.sales.newCustomer')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.sales.emptyCustomers')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.sales.customerSource')}</th>
              <th>{t('erp.sales.customerDepartment')}</th>
              <th>{t('erp.sales.phone')}</th>
              <th>{t('erp.sales.creditLimit')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((c: CustomerDto) => (
              <tr key={c.id} data-testid={`customer-row-${c.code}`}>
                <td className="font-mono text-[12px]">{c.code}</td>
                <td>
                  <span className="block font-semibold">{label(c) || c.code}</span>
                  <span className="oryx-faint block text-[11px]">{c.nameEn && c.nameAr ? (locale === 'ar' ? c.nameEn : c.nameAr) : ''}</span>
                </td>
                <td className="text-[12.5px]">{locale === 'ar' ? c.sourceNameAr || c.sourceNameEn : c.sourceNameEn || c.sourceNameAr || '—'}</td>
                <td className="text-[12.5px]">{locale === 'ar' ? c.departmentNameAr || c.departmentNameEn : c.departmentNameEn || c.departmentNameAr || '—'}</td>
                <td className="text-[12.5px]">{c.phone ?? '—'}</td>
                <td className="tabular-nums text-[12.5px]">{money(c.creditLimitMinor, c.currency)}</td>
                <td><Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(c.id)} data-testid={`customer-view-${c.code}`}>
                      {t('common.view')}
                    </Button>
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }} data-testid={`customer-edit-${c.code}`}>
                        {t('common.edit')}
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => void setStatus(c, !c.isActive)} data-testid={`customer-toggle-${c.code}`}>
                        {c.isActive ? t('common.deactivate') : t('common.reactivate')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CustomerModal
        open={open}
        customer={editing}
        sourceOptions={sourceOptions}
        departmentOptions={departmentOptions}
        onClose={() => { setOpen(false); setEditing(null); }}
        onCreated={list.reload}
        onCreatedSource={() => sources.reload()}
        onCreatedDepartment={() => departments.reload()}
      />
      {detailId ? (
        <CustomerDetailDrawer id={detailId} canManage={canManage} onClose={() => setDetailId(null)} />
      ) : null}
    </Card>
  );
}

interface CustomerFormState {
  code: string;
  nameEn: string;
  nameAr: string;
  email: string;
  phone: string;
  taxNumber: string;
  addressLine: string;
  city: string;
  sourceId: string | null;
  departmentId: string | null;
  creditLimit: string;
  paymentTermsDays: string;
  notes: string;
}

function CustomerModal({
  open,
  customer,
  sourceOptions,
  departmentOptions,
  onClose,
  onCreated,
  onCreatedSource,
  onCreatedDepartment,
}: {
  open: boolean;
  customer: CustomerDto | null;
  sourceOptions: SearchableOption[];
  departmentOptions: SearchableOption[];
  onClose: () => void;
  onCreated: () => Promise<void>;
  onCreatedSource: () => Promise<void>;
  onCreatedDepartment: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>({
    code: '',
    nameEn: '',
    nameAr: '',
    email: '',
    phone: '',
    taxNumber: '',
    addressLine: '',
    city: '',
    sourceId: null as string | null,
    departmentId: null as string | null,
    creditLimit: '0.000',
    paymentTermsDays: '30',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: customer?.code ?? '',
      nameEn: customer?.nameEn ?? '',
      nameAr: customer?.nameAr ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      taxNumber: customer?.taxNumber ?? '',
      addressLine: customer?.addressLine ?? '',
      city: customer?.city ?? '',
      sourceId: customer?.sourceId ?? null,
      departmentId: customer?.departmentId ?? null,
      creditLimit: minorToInput(customer?.creditLimitMinor ?? 0, customer?.currency),
      paymentTermsDays: String(customer?.paymentTermsDays ?? 30),
      notes: customer?.notes ?? '',
    });
  }, [open, customer]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!form.nameEn.trim() && !form.nameAr.trim()) {
        setError(t('erp.sales.nameRequired'));
        return;
      }
      const body: Record<string, unknown> = {
        ...(form.nameEn.trim() ? { nameEn: form.nameEn.trim() } : {}),
        ...(form.nameAr.trim() ? { nameAr: form.nameAr.trim() } : {}),
        email: form.email || undefined,
        phone: form.phone || undefined,
        taxNumber: form.taxNumber || undefined,
        addressLine: form.addressLine || undefined,
        city: form.city || undefined,
        sourceId: form.sourceId ?? undefined,
        departmentId: form.departmentId ?? undefined,
        creditLimitMinor: toMinorInput(form.creditLimit, customer?.currency),
        paymentTermsDays: Number(form.paymentTermsDays) || 0,
        notes: form.notes || undefined,
      };
      if (customer) {
        await api.updateCustomer(customer.id, body);
      } else {
        await api.createCustomer({ ...body, code: form.code });
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
      title={customer ? t('erp.sales.customerEdit') : t('erp.sales.newCustomer')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-customer">
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
            disabled={Boolean(customer)}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            data-testid="customer-code"
          />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (EN)`} hint={t('erp.sales.nameOptionalHint')}>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="customer-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} hint={t('erp.sales.nameOptionalHint')}>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="customer-name-ar" />
        </Field>
        <Field label={t('common.email')}>
          <input className="oryx-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="customer-email" />
        </Field>
        <Field label={t('erp.sales.taxNumber')}>
          <input className="oryx-input" value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
        </Field>
        <Field label={t('common.address')}>
          <input className="oryx-input" value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
        </Field>
        <Field label={t('common.city')}>
          <input className="oryx-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label={t('erp.sales.customerSource')} hint={t('erp.sales.customerSourceHint')}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchableSelect
                value={form.sourceId}
                options={sourceOptions}
                onChange={(v) => setForm({ ...form, sourceId: v })}
                placeholder={t('common.select')}
                emptyLabel={t('common.none')}
                testId="customer-source"
              />
            </div>
            <InlineCreateButton
              testId="inline-create-source"
              label={t('erp.sales.customerSource')}
              onCreate={async (code, nameEn, nameAr) => {
                const created = await api.createLeadSource({ code, nameEn, nameAr });
                await onCreatedSource();
                setForm((f) => ({ ...f, sourceId: created.id }));
              }}
            />
          </div>
        </Field>
        <Field label={t('erp.sales.customerDepartment')} hint={t('erp.sales.customerDepartmentHint')}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchableSelect
                value={form.departmentId}
                options={departmentOptions}
                onChange={(v) => setForm({ ...form, departmentId: v })}
                placeholder={t('common.select')}
                emptyLabel={t('common.none')}
                testId="customer-department"
              />
            </div>
            <InlineCreateButton
              testId="inline-create-department"
              label={t('erp.sales.customerDepartment')}
              onCreate={async (code, nameEn, nameAr) => {
                const created = await api.createDepartment({ code, nameEn, nameAr });
                await onCreatedDepartment();
                setForm((f) => ({ ...f, departmentId: created.id }));
              }}
            />
          </div>
        </Field>
        <Field label={t('erp.sales.creditLimit')}>
          <input className="oryx-input" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
        </Field>
        <Field label={t('erp.sales.paymentTerms')}>
          <input className="oryx-input" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('common.notes')}>
            <textarea className="oryx-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>
      <p className="oryx-faint m-0 mt-3 text-[11px]">{locale === 'ar' ? 'يُسمح باسم واحد على الأقل.' : 'At least one name is required.'}</p>
    </Modal>
  );
}

/** A compact "+" that opens a small create dialog for an inline catalogue. */
function InlineCreateButton({
  label,
  onCreate,
  testId,
}: {
  label: string;
  onCreate: (code: string, nameEn: string, nameAr: string) => Promise<void>;
  testId?: string;
}) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(form.code, form.nameEn, form.nameAr);
      setForm({ code: '', nameEn: '', nameAr: '' });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`${t('common.create')} ${label}`} data-testid={testId ?? 'inline-create'}>
        <Icon name="plus" size={15} />
      </Button>
      <Modal
        open={open}
        title={`${t('common.create')} — ${label}`}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy || !form.code || !form.nameEn || !form.nameAr} onClick={submit} data-testid="inline-create-save">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-3">
          <Field label={t('common.code')} required>
            <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="inline-create-code" />
          </Field>
          <Field label={`${t('common.name')} (EN)`} required>
            <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="inline-create-name-en" />
          </Field>
          <Field label={`${t('common.name')} (AR)`} required>
            <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="inline-create-name-ar" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function CustomerDetailDrawer({
  id,
  canManage,
  onClose,
}: {
  id: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useUi();
  const detail = useAsync(() => api.customer(id), [id]);
  const attachments = useAsync(() => api.customerAttachments(id), [id]);
  const [busy, setBusy] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attach, setAttach] = useState({ fileName: '', storageRef: '' });

  const removeAttachment = async (attachmentId: string) => {
    if (!window.confirm(t('common.confirm'))) return;
    await api.removeCustomerAttachment(id, attachmentId);
    await attachments.reload();
  };

  const addAttachment = async () => {
    setBusy(true);
    try {
      await api.addCustomerAttachment(id, { fileName: attach.fileName, storageRef: attach.storageRef || undefined });
      setAttach({ fileName: '', storageRef: '' });
      setAttachOpen(false);
      await attachments.reload();
    } finally {
      setBusy(false);
    }
  };

  const d = detail.data;
  const historyEntries: Array<[string, number]> = d
    ? [
        [t('erp.sales.historyQuotations'), d.history.quotations],
        [t('erp.sales.historyOrders'), d.history.orders],
        [t('erp.sales.historyInvoices'), d.history.invoices],
        [t('erp.sales.historyPayments'), d.history.payments],
        [t('erp.sales.historyCreditNotes'), d.history.creditNotes],
        [t('erp.sales.historyVehicles'), d.history.vehicles],
      ]
    : [];

  return (
    <Modal open title={`${t('erp.sales.customerDetails')}${d ? ` — ${d.code}` : ''}`} onClose={onClose} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
      {detail.loading || !d ? (
        <Skeleton height={220} />
      ) : (
        <div className="flex flex-col gap-4" data-testid="customer-detail">
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailRow label={t('common.name')} value={locale === 'ar' ? d.nameAr || d.nameEn : d.nameEn || d.nameAr} />
            <DetailRow label={t('common.phone')} value={d.phone} />
            <DetailRow label={t('common.email')} value={d.email} />
            <DetailRow label={t('erp.sales.taxNumber')} value={d.taxNumber} />
            <DetailRow label={t('common.address')} value={d.addressLine} />
            <DetailRow label={t('common.city')} value={d.city} />
            <DetailRow label={t('erp.sales.customerSource')} value={locale === 'ar' ? d.sourceNameAr || d.sourceNameEn : d.sourceNameEn || d.sourceNameAr} />
            <DetailRow label={t('erp.sales.customerDepartment')} value={locale === 'ar' ? d.departmentNameAr || d.departmentNameEn : d.departmentNameEn || d.departmentNameAr} />
            <DetailRow label={t('erp.sales.creditLimit')} value={money(d.creditLimitMinor, d.currency)} />
            <DetailRow label={t('erp.sales.paymentTerms')} value={String(d.paymentTermsDays)} />
            <DetailRow label={t('common.status')} value={d.isActive ? t('common.active') : t('common.inactive')} />
          </div>

          <div>
            <h3 className="m-0 mb-2 text-[13px] font-bold">{t('erp.sales.customerHistory')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {historyEntries.map(([labelText, count]) => (
                <div key={labelText} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  <span className="oryx-faint block text-[11px]">{labelText}</span>
                  <span className="block text-[15px] font-bold tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {d.recentInvoices.length ? (
            <div>
              <h3 className="m-0 mb-2 text-[13px] font-bold">{t('erp.sales.recentInvoices')}</h3>
              <TableShell>
                <thead>
                  <tr>
                    <th>{t('erp.sales.invoiceNumber')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('erp.sales.total')}</th>
                    <th>{t('erp.sales.outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="font-mono text-[12px]">{inv.invoiceNumber}</td>
                      <td><StatusBadge status={inv.status} label={inv.status} /></td>
                      <td className="tabular-nums text-[12.5px]">{money(inv.totalMinor, inv.currency)}</td>
                      <td className="tabular-nums text-[12.5px]">{money(inv.balanceMinor, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          ) : null}

          {d.vehicles.length ? (
            <div>
              <h3 className="m-0 mb-2 text-[13px] font-bold">{t('erp.sales.registeredVehicles')}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {d.vehicles.map((v) => (
                  <li key={v.id} className="text-[12.5px]">
                    <span className="font-semibold">{v.plateNumber ?? v.vin}</span> — {v.make} {v.model} ({v.modelYear})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="m-0 text-[13px] font-bold">{t('erp.sales.customerAttachments')}</h3>
              {canManage ? (
                <Button size="sm" variant="ghost" onClick={() => setAttachOpen(true)} data-testid="add-customer-attachment">
                  <Icon name="plus" size={15} />
                  {t('erp.sales.addAttachment')}
                </Button>
              ) : null}
            </div>
            {attachments.loading ? (
              <Skeleton height={40} />
            ) : (attachments.data?.items.length ?? 0) === 0 ? (
              <p className="oryx-faint m-0 text-[12px]">{t('erp.sales.noAttachments')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {attachments.data!.items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]">
                    <span>
                      <span className="font-semibold">{a.fileName}</span>
                      {a.storageRef ? <span className="oryx-faint block text-[11px]">{a.storageRef}</span> : null}
                    </span>
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => void removeAttachment(a.id)}>
                        {t('common.delete')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Modal
        open={attachOpen}
        title={t('erp.sales.addAttachment')}
        onClose={() => setAttachOpen(false)}
        footer={
          <>
            <Button onClick={() => setAttachOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy || !attach.fileName} onClick={addAttachment} data-testid="save-customer-attachment">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={t('erp.sales.attachmentName')} required>
            <input className="oryx-input" value={attach.fileName} onChange={(e) => setAttach({ ...attach, fileName: e.target.value })} data-testid="attachment-file-name" />
          </Field>
          <Field label={t('erp.sales.attachmentReference')}>
            <input className="oryx-input" value={attach.storageRef} onChange={(e) => setAttach({ ...attach, storageRef: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <span className="oryx-faint text-[11px]">{label}</span>
      <span className="text-[12.5px] font-semibold">{value || '—'}</span>
    </div>
  );
}

// ------------------------------------------------------------------ invoices

function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.salesInvoices({ page: 1 }), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.sales.invoices')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-invoice">
            <Icon name="plus" size={16} />
            {t('erp.sales.newInvoice')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.sales.emptyInvoices')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.sales.invoiceNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.sales.customer')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('erp.sales.outstanding')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((inv: SalesDocumentDto) => (
              <tr key={inv.id} data-testid={`invoice-row-${inv.invoiceNumber}`}>
                <td className="font-mono text-[12px]">{inv.invoiceNumber}</td>
                <td className="text-[12.5px]">{inv.invoiceDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{inv.customerNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(inv.totalMinor, inv.currency)}</td>
                <td className="tabular-nums text-[12.5px]">{money(inv.outstandingMinor ?? 0, inv.currency)}</td>
                <td><StatusBadge status={inv.status} label={inv.status} /></td>
                <td>
                  <DocumentActions
                    sourceType="SalesInvoice"
                    sourceId={inv.id}
                    type="SALES_INVOICE"
                    permissions={['erp.sales.read', 'erp.accounting.read']}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <DocumentModal
        open={open}
        title={t('erp.sales.newInvoice')}
        customers={customers.data?.items ?? []}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        showWarehouse
        testIdPrefix="invoice"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await api.createSalesInvoice(payload);
          await list.reload();
        }}
      />
    </Card>
  );
}

// -------------------------------------------------------------------- orders

function OrdersTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.salesOrders(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.sales.orders')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-order">
            <Icon name="plus" size={16} />
            {t('erp.sales.newOrder')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.sales.emptyOrders')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.sales.orderNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.sales.customer')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((o: SalesDocumentDto) => (
              <tr key={o.id} data-testid={`order-row-${o.orderNumber}`}>
                <td className="font-mono text-[12px]">{o.orderNumber}</td>
                <td className="text-[12.5px]">{o.orderDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{o.customerNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(o.totalMinor, o.currency)}</td>
                <td><StatusBadge status={o.status} label={o.status} /></td>
                <td>
                  <DocumentActions
                    sourceType="SalesOrder"
                    sourceId={o.id}
                    type="SALES_ORDER"
                    permissions={['erp.sales.read', 'erp.accounting.read']}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <DocumentModal
        open={open}
        title={t('erp.sales.newOrder')}
        customers={customers.data?.items ?? []}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        showWarehouse
        testIdPrefix="order"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await api.createSalesOrder({ ...payload, confirm: true });
          await list.reload();
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- quotations

function QuotationsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.quotations(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.sales.quotations')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-quotation">
            <Icon name="plus" size={16} />
            {t('erp.sales.newQuotation')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.sales.emptyQuotations')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.sales.quoteNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.sales.customer')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((q: SalesDocumentDto) => (
              <tr key={q.id} data-testid={`quotation-row-${q.quoteNumber}`}>
                <td className="font-mono text-[12px]">{q.quoteNumber}</td>
                <td className="text-[12.5px]">{q.issueDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{q.customerNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(q.totalMinor, q.currency)}</td>
                <td><StatusBadge status={q.status} label={q.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <DocumentActions
                      sourceType="Quotation"
                      sourceId={q.id}
                      type="QUOTATION"
                      permissions={['erp.sales.read', 'erp.accounting.read']}
                    />
                    {canManage && q.status !== 'CONVERTED' ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await api.convertQuotation(q.id, warehouses.data?.items[0]?.id);
                          await list.reload();
                        }}
                        data-testid={`convert-quotation-${q.quoteNumber}`}
                      >
                        {t('erp.sales.convert')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <DocumentModal
        open={open}
        title={t('erp.sales.newQuotation')}
        customers={customers.data?.items ?? []}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        testIdPrefix="quotation"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await api.createQuotation(payload);
          await list.reload();
        }}
      />
    </Card>
  );
}

// -------------------------------------------------------------- credit notes

function CreditNotesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.creditNotes(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.sales.creditNotes')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-credit-note">
            <Icon name="plus" size={16} />
            {t('erp.sales.newCreditNote')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={140} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.sales.emptyCreditNotes')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.sales.creditNoteNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.sales.customer')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('erp.sales.restock')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((n: SalesDocumentDto) => (
              <tr key={n.id} data-testid={`credit-note-row-${n.creditNoteNumber}`}>
                <td className="font-mono text-[12px]">{n.creditNoteNumber}</td>
                <td className="text-[12.5px]">{n.issueDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{n.customerNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(n.totalMinor, n.currency)}</td>
                <td className="text-[12.5px]">{(n as { restockInventory?: boolean }).restockInventory ? '✓' : '—'}</td>
                <td><StatusBadge status={n.status} label={n.status} /></td>
                <td>
                  <DocumentActions
                    sourceType="CreditNote"
                    sourceId={n.id}
                    type="SALES_RETURN"
                    permissions={['erp.sales.read', 'erp.accounting.read']}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <DocumentModal
        open={open}
        title={t('erp.sales.newCreditNote')}
        customers={customers.data?.items ?? []}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        showWarehouse
        showRestock
        testIdPrefix="credit-note"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await api.createCreditNote(payload);
          await list.reload();
        }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------- POS

function PosTab({ canOperate, canManage }: { canOperate: boolean; canManage: boolean }) {
  const { t } = useUi();
  const sessions = useAsync(() => api.cashierSessions(), []);
  const sales = useAsync(() => api.posSales({ page: 1 }), []);
  const branches = useAsync(() => api.context(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const products = useAsync(() => api.products(), []);
  const [saleOpen, setSaleOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashierSessionDto | null>(null);

  const openSession = sessions.data?.items.find((s) => s.status === 'OPEN');

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.sales.cashierSessions')}</p>
          {canOperate && !openSession ? (
            <Button
              variant="primary"
              size="sm"
              data-testid="open-session"
              onClick={async () => {
                const branchId = branches.data?.branches[0]?.id;
                if (!branchId) return;
                await api.openCashierSession({ branchId, warehouseId: warehouses.data?.items[0]?.id, openingFloatMinor: 0 });
                await sessions.reload();
              }}
            >
              <Icon name="plus" size={16} />
              {t('erp.sales.openSession')}
            </Button>
          ) : null}
          {canOperate && openSession ? (
            <Button variant="primary" size="sm" onClick={() => setSaleOpen(true)} data-testid="new-pos-sale">
              <Icon name="cart" size={16} />
              {t('erp.sales.newPosSale')}
            </Button>
          ) : null}
        </div>
        {sessions.error ? <div className="p-4"><ErrorBanner message={sessions.error} onRetry={sessions.reload} /></div> : null}
        {sessions.loading ? <div className="p-4"><Skeleton height={100} /></div> : (sessions.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('erp.sales.emptySessions')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.sales.sessionNumber')}</th>
                <th>{t('erp.inventory.branch')}</th>
                <th>{t('erp.sales.expectedCash')}</th>
                <th>{t('erp.sales.countedCash')}</th>
                <th>{t('erp.sales.variance')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data!.items.map((s) => (
                <tr key={s.id} data-testid={`session-row-${s.sessionNumber}`}>
                  <td className="font-mono text-[12px]">{s.sessionNumber}</td>
                  <td className="text-[12.5px]">{s.branchNameEn}</td>
                  <td className="tabular-nums text-[12.5px]">{money(s.expectedCashMinor)}</td>
                  <td className="tabular-nums text-[12.5px]">{s.countedCashMinor !== null ? money(s.countedCashMinor) : '—'}</td>
                  <td className="tabular-nums text-[12.5px]">{s.varianceMinor !== null ? money(s.varianceMinor) : '—'}</td>
                  <td><StatusBadge status={s.status} label={s.status} /></td>
                  <td>
                    {canManage && s.status === 'OPEN' ? (
                      <Button size="sm" onClick={() => setCloseTarget(s)} data-testid={`close-session-${s.sessionNumber}`}>
                        {t('erp.sales.closeSession')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card>
        <div className="border-b border-[var(--border)] p-4">
          <p className="oryx-panel-title m-0">{t('erp.sales.posSales')}</p>
        </div>
        {sales.loading ? <div className="p-4"><Skeleton height={100} /></div> : (sales.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} hint={t('erp.sales.emptyPosSales')} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.sales.receiptNumber')}</th>
                <th>{t('common.date')}</th>
                <th>{t('erp.sales.total')}</th>
                <th>{t('erp.sales.paid')}</th>
                <th>{t('erp.sales.change')}</th>
                <th>{t('erp.sales.method')}</th>
              </tr>
            </thead>
            <tbody>
              {sales.data!.items.map((p: PosSaleDto) => (
                <tr key={p.id} data-testid={`pos-row-${p.receiptNumber}`}>
                  <td className="font-mono text-[12px]">{p.receiptNumber}</td>
                  <td className="text-[12.5px]">{p.createdAt.slice(0, 10)}</td>
                  <td className="tabular-nums text-[12.5px] font-semibold">{money(p.totalMinor)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(p.paidMinor)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(p.changeMinor)}</td>
                  <td><Badge tone="info">{p.paymentMethod}</Badge></td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <PosSaleModal
        open={saleOpen}
        session={openSession ?? null}
        products={products.data?.items ?? []}
        onClose={() => setSaleOpen(false)}
        onDone={async () => {
          await sales.reload();
          await sessions.reload();
        }}
      />

      <CloseSessionModal
        session={closeTarget}
        onClose={() => setCloseTarget(null)}
        onDone={async () => {
          await sessions.reload();
          await sales.reload();
        }}
      />
    </div>
  );
}

function PosSaleModal({
  open,
  session,
  products,
  onClose,
  onDone,
}: {
  open: boolean;
  session: CashierSessionDto | null;
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [paid, setPaid] = useState('');

  const total = lines.reduce((sum, l) => {
    const gross = toQuantityInput(l.quantity) * toMinorInput(l.unitPrice) / 10000;
    // The discount is applied to the gross line before tax, exactly as the
    // server's `computeDocumentTotals` does.
    const net = gross * (1 - (Number(l.discountPercent) || 0) / 100);
    const tax = net * (Number(l.taxPercent) || 0) / 100;
    return sum + Math.round(net + tax);
  }, 0);

  const submit = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await api.createPosSale({
        branchId: session.branchId,
        cashierSessionId: session.id,
        warehouseId: session.warehouseId ?? undefined,
        paymentMethod: 'CASH',
        paidMinor: paid ? toMinorInput(paid) : total,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description,
          quantity: toQuantityInput(l.quantity),
          unitPriceMinor: toMinorInput(l.unitPrice),
          discountPercentBp: Math.round((Number(l.discountPercent) || 0) * 100),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      });
      await onDone();
      onClose();
      setLines([emptyLine()]);
      setPaid('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.sales.newPosSale')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-pos-sale">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <LineEditor lines={lines} setLines={setLines} products={products} testIdPrefix="pos-line" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.paid')}>
          <input className="oryx-input" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={String(total / 100)} data-testid="pos-paid" />
        </Field>
        <div className="flex items-end">
          <span className="oryx-muted text-[13px]">
            {t('erp.sales.total')}: <strong className="tabular-nums">{money(total)}</strong>
          </span>
        </div>
      </div>
    </Modal>
  );
}

function CloseSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: CashierSessionDto | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState('');

  const submit = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await api.closeCashierSession(session.id, toMinorInput(counted));
      await onDone();
      onClose();
      setCounted('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(session)}
      title={t('erp.sales.closeSession')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="confirm-close-session">
            {busy ? t('common.loading') : t('common.confirm')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <p className="oryx-muted text-[12.5px]">
        {t('erp.sales.expectedCash')}: {money(session?.expectedCashMinor ?? 0)}
      </p>
      <Field label={t('erp.sales.countedCash')} required>
        <input className="oryx-input" value={counted} onChange={(e) => setCounted(e.target.value)} data-testid="counted-cash" />
      </Field>
    </Modal>
  );
}

// --------------------------------------------------------- shared line editor

function LineEditor({
  lines,
  setLines,
  products,
  testIdPrefix,
}: {
  lines: LineDraft[];
  setLines: (lines: LineDraft[]) => void;
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  testIdPrefix: string;
}) {
  const { t } = useUi();

  const update = (i: number, patch: Partial<LineDraft>) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    setLines(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <select
            className="oryx-select col-span-3"
            value={line.productId}
            onChange={(e) => {
              const product = products.find((p) => p.id === e.target.value);
              update(i, {
                productId: e.target.value,
                description: product ? product.nameEn : line.description,
                unitPrice: product ? minorToInput(product.salesPriceMinor) : line.unitPrice,
                taxPercent: product ? String(product.taxRateBp / 100) : line.taxPercent,
              });
            }}
            data-testid={`${testIdPrefix}-product-${i}`}
          >
            <option value="">{t('erp.inventory.product')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.nameEn}
              </option>
            ))}
          </select>
          <input
            className="oryx-input col-span-3"
            placeholder={t('erp.accounting.description')}
            value={line.description}
            onChange={(e) => update(i, { description: e.target.value })}
            data-testid={`${testIdPrefix}-description-${i}`}
          />
          <input
            className="oryx-input col-span-1"
            placeholder={t('erp.inventory.quantity')}
            value={line.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            data-testid={`${testIdPrefix}-quantity-${i}`}
          />
          <input
            className="oryx-input col-span-2"
            placeholder={t('erp.sales.unitPrice')}
            value={line.unitPrice}
            onChange={(e) => update(i, { unitPrice: e.target.value })}
            data-testid={`${testIdPrefix}-price-${i}`}
          />
          <input
            className="oryx-input col-span-1"
            placeholder={t('erp.sales.discount')}
            value={line.discountPercent}
            onChange={(e) => update(i, { discountPercent: e.target.value })}
            data-testid={`${testIdPrefix}-discount-${i}`}
          />
          <input
            className="oryx-input col-span-1"
            placeholder="%"
            value={line.taxPercent}
            onChange={(e) => update(i, { taxPercent: e.target.value })}
            data-testid={`${testIdPrefix}-tax-${i}`}
          />
          <Button size="sm" variant="ghost" className="col-span-1" disabled={lines.length <= 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
            <Icon name="close" size={14} />
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => setLines([...lines, emptyLine()])} data-testid={`${testIdPrefix}-add`}>
        <Icon name="plus" size={14} />
        {t('erp.accounting.addLine')}
      </Button>
    </div>
  );
}

function DocumentModal({
  open,
  title,
  customers,
  products,
  warehouses,
  showWarehouse,
  showRestock,
  testIdPrefix,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  customers: CustomerDto[];
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  warehouses: WarehouseDto[];
  showWarehouse?: boolean;
  showRestock?: boolean;
  testIdPrefix: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [restock, setRestock] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        customerId,
        warehouseId: warehouseId || undefined,
        documentDate: new Date().toISOString(),
        restockInventory: showRestock ? restock : undefined,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitPriceMinor: toMinorInput(l.unitPrice),
          discountPercentBp: Math.round((Number(l.discountPercent) || 0) * 100),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      });
      onClose();
      setLines([emptyLine()]);
      setCustomerId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !customerId} onClick={submit} data-testid={`save-${testIdPrefix}`}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.sales.customer')} required>
          <select className="oryx-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} data-testid={`${testIdPrefix}-customer`}>
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.nameEn}
              </option>
            ))}
          </select>
        </Field>
        {showWarehouse ? (
          <Field label={t('erp.inventory.warehouse')}>
            <select className="oryx-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} data-testid={`${testIdPrefix}-warehouse`}>
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.nameEn}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {showRestock ? (
          <Field label={t('erp.sales.restock')}>
            <select className="oryx-select" value={restock ? 'yes' : 'no'} onChange={(e) => setRestock(e.target.value === 'yes')}>
              <option value="yes">{t('common.yes')}</option>
              <option value="no">{t('common.no')}</option>
            </select>
          </Field>
        ) : null}
      </div>
      <div className="mt-4">
        <LineEditor lines={lines} setLines={setLines} products={products} testIdPrefix={testIdPrefix} />
      </div>
      <span className="hidden">{qty(0)}</span>
    </Modal>
  );
}
