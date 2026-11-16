'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { AttachmentsPanel } from '@/components/document-print';
import { CustomerModal } from '@/components/customer-modal';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  Skeleton,
  StatusBadge,
  TableShell,
  type SearchableOption,
} from '@/components/ui';
import type { CustomerDto } from '@oryx/shared';

/**
 * The customer master, shared by the CRM module (where customer management now
 * lives) and any other surface that needs to list or open a customer. The API
 * and the data model are unchanged: a customer is still owned by the sales
 * domain, this component only relocates the interface.
 */
export function CustomersTab({ canManage }: { canManage: boolean }) {
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

  const onDelete = async (row: CustomerDto) => {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    try {
      await api.deleteCustomer(row.id);
      await list.reload();
    } catch (err) {
      const key = err instanceof ApiError && err.code === 'resource.conflict' ? 'erp.sales.deleteCustomerBlocked' : 'common.error';
      window.alert(t(key));
    }
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
                    {canManage ? (
                      <Button size="sm" variant="danger" onClick={() => void onDelete(c)} data-testid={`customer-delete-${c.code}`}>
                        {t('common.delete')}
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

export function CustomerDetailDrawer({
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
            <DetailRow
              label={t('erp.sales.customerType')}
              value={d.kind === 'COMPANY' ? t('erp.sales.customerKindCompany') : t('erp.sales.customerKindIndividual')}
            />
            {d.kind === 'INDIVIDUAL' ? (
              <DetailRow label={t('erp.sales.nationalId')} value={d.nationalId} />
            ) : (
              <>
                <DetailRow label={t('erp.sales.crNumber')} value={d.crNumber} />
                <DetailRow label={t('erp.sales.crExpiry')} value={d.crExpiryDate ? d.crExpiryDate.slice(0, 10) : null} />
                <DetailRow label={t('erp.sales.website')} value={d.website} />
                <DetailRow label={t('erp.sales.contactPerson')} value={d.contactPersonName} />
                <DetailRow label={t('erp.sales.contactPersonPhone')} value={d.contactPersonPhone} />
              </>
            )}
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

          {d.kind === 'COMPANY' ? <CustomerBranchesPanel customerId={id} canManage={canManage} /> : null}

          <AttachmentsPanel entityType="CUSTOMER" entityId={id} canManage={canManage} categorised />
        </div>
      )}

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

export function CustomerBranchesPanel({ customerId, canManage }: { customerId: string; canManage: boolean }) {
  const { t, locale } = useUi();
  const branches = useAsync(() => api.customerBranches(customerId), [customerId]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', contactName: '', phone: '', city: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createCustomerBranch(customerId, {
        code: form.code,
        nameEn: form.nameEn || undefined,
        nameAr: form.nameAr || undefined,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        city: form.city || undefined,
      });
      setForm({ code: '', nameEn: '', nameAr: '', contactName: '', phone: '', city: '' });
      setOpen(false);
      await branches.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (branchId: string) => {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    await api.deleteCustomerBranch(customerId, branchId);
    await branches.reload();
  };

  return (
    <div data-testid="customer-branches">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="m-0 text-[13px] font-bold">{t('erp.sales.branches')}</h3>
        {canManage ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="add-customer-branch">
            <Icon name="plus" size={15} />
            {t('erp.sales.addBranch')}
          </Button>
        ) : null}
      </div>
      <p className="oryx-faint m-0 mb-2 text-[11px]">{t('erp.sales.branchesHint')}</p>
      {branches.loading ? (
        <Skeleton height={40} />
      ) : (branches.data?.length ?? 0) === 0 ? (
        <p className="oryx-faint m-0 text-[12px]" data-testid="customer-branches-empty">{t('erp.sales.noBranches')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {branches.data!.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]" data-testid={`customer-branch-${b.code}`}>
              <span>
                <span className="font-mono text-[11px]">{b.code}</span>{' '}
                <span className="font-semibold">{locale === 'ar' ? b.nameAr || b.nameEn : b.nameEn || b.nameAr}</span>
                {b.city ? <span className="oryx-faint block text-[11px]">{b.city}</span> : null}
              </span>
              {canManage ? (
                <Button size="sm" variant="ghost" onClick={() => void remove(b.id)}>
                  {t('common.delete')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        title={t('erp.sales.addBranch')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={busy || !form.code} onClick={() => void submit()} data-testid="save-customer-branch">
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('erp.sales.branchCode')} required>
            <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="branch-code" />
          </Field>
          <Field label={`${t('erp.sales.branchName')} (EN)`}>
            <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="branch-name-en" />
          </Field>
          <Field label={`${t('erp.sales.branchName')} (AR)`}>
            <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="branch-name-ar" />
          </Field>
          <Field label={t('erp.sales.contactPerson')}>
            <input className="oryx-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </Field>
          <Field label={t('common.phone')}>
            <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t('common.city')}>
            <input className="oryx-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
