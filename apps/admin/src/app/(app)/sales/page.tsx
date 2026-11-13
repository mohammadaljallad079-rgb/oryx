'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync, useDebounced } from '@/lib/hooks';
import { minorToInput, money, qty, toMinorInput, toQuantityInput } from '@/lib/erp-format';
import {
  basisPointsOfMinor,
  currencyScale as currencyScaleOf,
  fromMinor,
  lineAmountMinor,
  roundMinor,
  sumMinor,
  type RoundingMode,
} from '@oryx/shared';
import { Icon } from '@/components/icons';
import { AttachmentsPanel, DocumentPrintActions } from '@/components/document-print';
import { ModuleDashboard } from '@/components/module-dashboard';
import { TabDeepLink } from '@/components/tab-deep-link';
import { CustomerModal } from '@/components/customer-modal';
import { EntityPicker } from '@/components/inline-create';
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
  PosProductDto,
  PosSaleDto,
  SalesDocumentDto,
  WarehouseDto,
} from '@oryx/shared';
import { DocumentActions } from '@/components/document-actions';

type Tab = 'dashboard' | 'invoices' | 'orders' | 'quotations' | 'credit-notes' | 'pos' | 'customers';

interface LineDraft {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** A per-line discount in whole percent, converted to basis points on submit. */
  discountPercent: string;
  /** The chosen tax row, or a synthetic id when the product carries a rate that
   * is not in the tenant's saved list. */
  taxId: string;
  taxPercent: string;
}

const emptyLine = (taxPercent = '10'): LineDraft => ({
  productId: '',
  description: '',
  quantity: '1',
  unitPrice: '0.00',
  discountPercent: '0',
  taxId: '',
  taxPercent,
});

/** The payment methods a POS sale may be settled with. */
type PosPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'WALLET';

/** The tender buttons the till offers, in the order a cashier expects them. */
const POS_PAYMENT_METHODS: PosPaymentMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'WALLET'];

/**
 * Round a cash tender up to the next convenience denomination.
 *
 * A cashier taking notes rarely has the exact change, so the "round cash" button
 * lifts the tender to the next `10^(scale-1)` minor unit (0.100 BD for a
 * three-decimal currency, 0.10 for a two-decimal one). It only ever raises the
 * figure, so the change shown can never go negative from this button.
 */
function roundCashUp(minor: number, scale: number): number {
  const step = Math.max(1, 10 ** (scale - 1));
  return Math.ceil(minor / step) * step;
}

/** One line of the POS cart, held in integer minor units and basis points. */
interface CartLine {
  key: string;
  productId: string;
  description: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  taxPercentBp: number;
  discountPercentBp: number;
}

/**
 * Price a POS cart exactly as the server will.
 *
 * This is the shared `document-totals` algorithm re-expressed on the client:
 * the line subtotal is a single half-up rounding of quantity × price, the
 * discount and tax are each a single half-up rounding of the running amount, and
 * the subtotal is the sum of the rounded line subtotals rather than a re-rounded
 * aggregate. Mirroring the server here is deliberate — the till shows the exact
 * figure that will be posted, and `subtotal − discount + tax + rounding = total`
 * holds on both sides.
 */
function computePosTotals(
  lines: Array<{
    quantity: number;
    unitPriceMinor: number;
    discountPercentBp: number;
    taxPercentBp: number;
  }>,
  roundingMode: RoundingMode,
  scale: number,
) {
  const priced = lines.map((l) => {
    const lineSubtotalMinor = lineAmountMinor(l.quantity, l.unitPriceMinor);
    const discountMinor = basisPointsOfMinor(lineSubtotalMinor, l.discountPercentBp);
    const net = lineSubtotalMinor - discountMinor;
    const taxMinor = basisPointsOfMinor(net, l.taxPercentBp);
    return { lineSubtotalMinor, discountMinor, taxMinor, lineTotalMinor: net + taxMinor };
  });
  const subtotalMinor = sumMinor(priced.map((l) => l.lineSubtotalMinor));
  const discountMinor = sumMinor(priced.map((l) => l.discountMinor));
  const taxMinor = sumMinor(priced.map((l) => l.taxMinor));
  const exactTotal = sumMinor(priced.map((l) => l.lineTotalMinor));
  const { rounded: totalMinor, adjustment: roundingMinor } = roundMinor(exactTotal, roundingMode, scale);
  return { subtotalMinor, discountMinor, taxMinor, roundingMinor, totalMinor };
}

/**
 * The tenant's saved taxes as dropdown options. `value` is the rate in basis
 * points so a product's own `taxRateBp` can be matched without a lookup table,
 * and `label` is the display percentage the line parses back on selection.
 */
function useTaxOptions(companyId: string | null | undefined): SearchableOption[] {
  const taxes = useAsync(
    () => api.taxes({ companyId: companyId ?? undefined, includeInactive: 'false' }),
    [companyId],
  );
  return (taxes.data?.items ?? []).map((tax) => ({
    value: String(tax.rateBp),
    label: `${tax.rateBp / 100}%`,
    hint: tax.nameEn,
  }));
}

const TAB_KEYS = ['dashboard', 'invoices', 'orders', 'quotations', 'credit-notes', 'pos', 'customers'] as const;

export default function SalesPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <SalesInner />
    </Suspense>
  );
}

function SalesInner() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('invoices');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.sales.dashboard') },
    { key: 'invoices', label: t('erp.sales.invoices') },
    { key: 'orders', label: t('erp.sales.orders') },
    { key: 'quotations', label: t('erp.sales.quotations') },
    { key: 'credit-notes', label: t('erp.sales.creditNotes') },
    { key: 'pos', label: t('erp.sales.pos') },
    { key: 'customers', label: t('erp.sales.customers') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="sales-page">
      <TabDeepLink valid={TAB_KEYS} onSelect={setTab} />
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

      {tab === 'dashboard' ? <ModuleDashboard moduleKey="sales_pos" /> : null}
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
                    <DocumentActions
                      sourceType="Customer"
                      sourceId={c.id}
                      type="CUSTOMER_STATEMENT"
                      permissions={['erp.sales.read', 'erp.accounting.read']}
                    />
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

// ------------------------------------------------------------------ invoices

function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SalesDocumentDto | null>(null);
  const [autoPreviewId, setAutoPreviewId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<SalesDocumentDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creditNoteSource, setCreditNoteSource] = useState<SalesDocumentDto | null>(null);
  const list = useAsync(() => api.salesInvoices({ page: 1 }), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const taxOptions = useTaxOptions(companyId);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.sales.invoices')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditingInvoice(null); setOpen(true); }} data-testid="new-invoice">
            <Icon name="plus" size={16} />
            {t('erp.sales.newInvoice')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {actionError ? <div className="p-4"><ErrorBanner message={actionError} /></div> : null}
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canManage && inv.status === 'DRAFT' ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingInvoice(inv); setOpen(true); }} data-testid={`edit-invoice-${inv.invoiceNumber}`}>
                          <Icon name="edit" size={14} />
                          {t('common.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (!window.confirm(t('common.confirm'))) return;
                            setActionError(null);
                            void api.deleteSalesInvoice(inv.id)
                              .then(() => list.reload())
                              .catch((e) => setActionError(e instanceof Error ? e.message : t('common.error')));
                          }}
                          data-testid={`delete-invoice-${inv.invoiceNumber}`}
                        >
                          <Icon name="trash" size={14} />
                          {t('common.delete')}
                        </Button>
                      </>
                    ) : null}
                    {canManage && inv.status !== 'DRAFT' && inv.status !== 'VOID' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCreditNoteSource(inv)}
                        data-testid={`credit-note-from-invoice-${inv.invoiceNumber}`}
                      >
                        <Icon name="scroll" size={14} />
                        {t('erp.sales.newCreditNote')}
                      </Button>
                    ) : null}
                    {inv.status !== 'DRAFT' ? (
                      <>
                        <DocumentPrintActions kind="SALES_INVOICE" id={inv.id} compact />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetail(inv)}
                          title={t('attachments.title')}
                          data-testid={`invoice-attach-open-${inv.invoiceNumber}`}
                        >
                          <Icon name="paperclip" size={15} />
                        </Button>
                        <DocumentActions
                          sourceType="SalesInvoice"
                          sourceId={inv.id}
                          type="SALES_INVOICE"
                          permissions={['erp.sales.read', 'erp.accounting.read']}
                          autoOpenOnMount={autoPreviewId === inv.id}
                        />
                      </>
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
        title={editingInvoice ? t('common.edit') + ' — ' + t('erp.sales.invoiceNumber') + ' ' + editingInvoice.invoiceNumber : t('erp.sales.newInvoice')}
        initialDocument={editingInvoice}
        allowDraft
        customers={customers.data?.items ?? []}
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        taxOptions={taxOptions}
        showWarehouse
        dueDateField="dueDate"
        settlement
        testIdPrefix="invoice"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          if (editingInvoice) {
            await api.updateSalesInvoice(editingInvoice.id, payload);
            if (payload.post !== false) setAutoPreviewId(editingInvoice.id);
            setEditingInvoice(null);
          } else {
            const created = await api.createSalesInvoice(payload);
            if (payload.post !== false) setAutoPreviewId(created.id);
          }
          await list.reload();
        }}
      />
      <DocumentModal
        open={creditNoteSource !== null}
        title={t('erp.sales.newCreditNote')}
        initialDocument={creditNoteSource}
        relatedInvoiceId={creditNoteSource?.id}
        customers={customers.data?.items ?? []}
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        taxOptions={taxOptions}
        showWarehouse
        showRestock
        reasonField
        testIdPrefix="invoice-credit-note"
        onClose={() => setCreditNoteSource(null)}
        onSubmit={async (payload) => {
          await api.createCreditNote(payload);
          setCreditNoteSource(null);
          await list.reload();
        }}
      />
      <Modal
        open={detail !== null}
        title={`${t('erp.sales.invoiceNumber')} ${detail?.invoiceNumber ?? ''}`}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{detail.customerNameEn}</span>
              <DocumentPrintActions kind="SALES_INVOICE" id={detail.id} />
            </div>
            <AttachmentsPanel entityType="SALES_INVOICE" entityId={detail.id} canManage={canManage} />
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

// -------------------------------------------------------------------- orders

function OrdersTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.salesOrders(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const taxOptions = useTaxOptions(companyId);

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
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        taxOptions={taxOptions}
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
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.quotations(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const taxOptions = useTaxOptions(companyId);

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
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        taxOptions={taxOptions}
        dueDateField="validUntil"
        settlement
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
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.creditNotes(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const taxOptions = useTaxOptions(companyId);

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
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        taxOptions={taxOptions}
        showWarehouse
        showRestock
        reasonField
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
  const { companyId } = useAuth();
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('NONE');
  const [currencyScale, setCurrencyScale] = useState(2);
  useEffect(() => {
    if (!companyId) {
      setRoundingMode('NONE');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const company = await api.getCompany(companyId);
        if (cancelled) return;
        setRoundingMode(company.roundingMode ?? 'NONE');
        setCurrencyScale(currencyScaleOf(company.currency));
      } catch {
        if (!cancelled) setRoundingMode('NONE');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);
  const sessions = useAsync(() => api.cashierSessions(), []);
  const sales = useAsync(() => api.posSales({ page: 1 }), []);
  const branches = useAsync(() => api.context(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const [saleOpen, setSaleOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashierSessionDto | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const openSession = sessions.data?.items.find((s) => s.status === 'OPEN');

  /**
   * Opens the branch's cashier session.
   *
   * The API refuses a second open session per branch (`CASHIER_SESSION_ALREADY_OPEN`)
   * and refuses a branch the operator is not scoped to. Both are real answers the
   * cashier must see, so the failure is surfaced rather than swallowed: a silent
   * no-op here reads as a broken button.
   */
  const startSession = async () => {
    const branchId = branches.data?.branches[0]?.id;
    if (!branchId) {
      setOpenError(t('erp.sales.pos.noBranch'));
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      await api.openCashierSession({
        branchId,
        warehouseId: warehouses.data?.items[0]?.id,
        openingFloatMinor: 0,
      });
      await sessions.reload();
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setOpening(false);
    }
  };

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
              disabled={opening}
              onClick={() => void startSession()}
            >
              <Icon name="plus" size={16} />
              {opening ? t('common.loading') : t('erp.sales.openSession')}
            </Button>
          ) : null}
          {canOperate && openSession ? (
            <Button variant="primary" size="sm" onClick={() => setSaleOpen(true)} data-testid="new-pos-sale">
              <Icon name="cart" size={16} />
              {t('erp.sales.newPosSale')}
            </Button>
          ) : null}
        </div>
        {openError ? (
          <div className="p-4">
            <ErrorBanner message={openError} />
          </div>
        ) : null}
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
                <th>{t('common.actions')}</th>
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
                  <td>
                    <DocumentActions
                      sourceType="PosSale"
                      sourceId={p.id}
                      type="POS_RECEIPT"
                      permissions={['erp.sales.read']}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <PosSaleModal
        open={saleOpen}
        session={openSession ?? null}
        customers={customers.data?.items ?? []}
        onCustomerCreated={customers.reload}
        warehouses={warehouses.data?.items ?? []}
        roundingMode={roundingMode}
        currencyScale={currencyScale}
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

/**
 * The point-of-sale terminal.
 *
 * A full-screen, touch-first till: a product grid on one side and a live cart on
 * the other. Products are tiles with a photograph, price and a stock badge;
 * a barcode scan or a typed search narrows the grid, and a scan that matches one
 * product adds it to the cart immediately, which is what a cashier expects from
 * a scanner. Every figure shown here is computed by the same `@oryx/shared`
 * pricing helpers the server uses, so the total on screen is the total that is
 * posted — the browser never sends a total, only the lines.
 */
function PosSaleModal({
  open,
  session,
  customers,
  onCustomerCreated,
  warehouses,
  roundingMode,
  currencyScale,
  onClose,
  onDone,
}: {
  open: boolean;
  session: CashierSessionDto | null;
  customers: CustomerDto[];
  onCustomerCreated?: () => Promise<void> | void;
  warehouses: WarehouseDto[];
  roundingMode: RoundingMode;
  currencyScale: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const { companyId } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const debouncedSearch = useDebounced(search, 250);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const catalog = useAsync(
    () =>
      api.posCatalog({
        companyId: companyId ?? undefined,
        search: debouncedSearch || undefined,
        category: category || undefined,
      }),
    [companyId, debouncedSearch, category],
  );
  const categories = useAsync(() => api.posCategories(companyId ?? undefined), [companyId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setSearch('');
    setCart([]);
    setPaid('');
    setPaymentMethod('CASH');
    setCustomerId('');
    setWarehouseId(session?.warehouseId ?? warehouses[0]?.id ?? '');
    // Focus the scan field so a USB scanner's keystrokes land in it without a
    // click; the field doubles as the search box.
    const id = window.setTimeout(() => scanRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, session, warehouses]);

  const addProduct = useCallback(
    (product: PosProductDto) => {
      setNotice(null);
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === product.id);
        if (existing) {
          return prev.map((l) =>
            l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
          );
        }
        const line: CartLine = {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          description: locale === 'ar' && product.nameAr ? product.nameAr : product.nameEn,
          sku: product.sku,
          quantity: 1,
          unitPriceMinor: product.salesPriceMinor,
          taxPercentBp: product.taxRateBp,
          discountPercentBp: 0,
        };
        return [...prev, line];
      });
    },
    [locale],
  );

  // A scanner types the barcode and presses Enter. The lookup is immediate and
  // independent of the debounced grid query, because a scanner emits the whole
  // code and the Enter in one burst — waiting for a 250 ms debounce would miss
  // it. An exact barcode match wins; otherwise a lone search result is taken;
  // otherwise the term stays in the field as an ordinary search.
  const onScanSubmit = async () => {
    const term = search.trim();
    if (!term) return;
    try {
      const { items } = await api.posCatalog({
        companyId: companyId ?? undefined,
        search: term,
      });
      const exact = items.filter((p) => p.barcode && p.barcode === term);
      if (exact.length === 1) {
        addProduct(exact[0]);
        setSearch('');
        return;
      }
      if (items.length === 1) {
        addProduct(items[0]);
        setSearch('');
        return;
      }
      setNotice(t('erp.sales.pos.notFound'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  const totals = useMemo(
    () =>
      computePosTotals(
        cart.map((l) => ({
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: l.discountPercentBp,
          taxPercentBp: l.taxPercentBp,
        })),
        roundingMode,
        currencyScale,
      ),
    [cart, roundingMode, currencyScale],
  );

  const paidMinor = paid.trim() === '' ? totals.totalMinor : toMinorInput(paid);
  const changeMinor = paidMinor - totals.totalMinor;

  const submit = async () => {
    if (!session || cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.createPosSale({
        branchId: session.branchId,
        cashierSessionId: session.id,
        warehouseId: warehouseId || undefined,
        customerId: customerId || undefined,
        paymentMethod,
        paidMinor,
        lines: cart.map((l) => ({
          productId: l.productId,
          description: l.description || 'Item',
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: l.discountPercentBp,
          taxPercentBp: l.taxPercentBp,
        })),
      });
      await onDone();
      setCart([]);
      setPaid('');
      setNotice(t('erp.sales.pos.receiptReady'));
      scanRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const items = catalog.data?.items ?? [];

  return (
    <Modal
      open={open}
      title={t('erp.sales.newPosSale')}
      onClose={onClose}
      size="pos"
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || cart.length === 0 || !session}
            onClick={submit}
            data-testid="save-pos-sale"
          >
            <Icon name="check" size={15} />
            {busy ? t('common.loading') : `${t('erp.sales.pos.complete')} · ${money(totals.totalMinor)}`}
          </Button>
        </>
      }
    >
      {!session ? (
        <div className="p-4">
          <ErrorBanner message={t('erp.sales.pos.noSession')} />
        </div>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {notice ? (
        <p className="oryx-muted m-0 mb-3 text-[12.5px]" role="status" data-testid="pos-notice">
          {notice}
        </p>
      ) : null}

      <div className="oryx-pos grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ---------------------------------------------------- product grid */}
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="oryx-pos__toolbar">
            <div className="oryx-pos__search">
              <span className="oryx-pos__search-icon">
                <Icon name="search" size={18} />
              </span>
              <input
                ref={scanRef}
                className="oryx-input"
                value={search}
                placeholder={t('erp.sales.pos.searchPlaceholder')}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onScanSubmit();
                  }
                }}
                aria-label={t('erp.sales.pos.scan')}
                data-testid="pos-search"
              />
            </div>
            <Button variant="ghost" onClick={() => void catalog.reload()} aria-label={t('common.refresh')}>
              <Icon name="refresh" size={18} />
            </Button>
          </div>

          {catalog.error ? <ErrorBanner message={catalog.error} onRetry={catalog.reload} /> : null}

          {(categories.data?.items.length ?? 0) > 0 ? (
            <div className="oryx-pos__chips" data-testid="pos-categories">
              <button
                type="button"
                onClick={() => setCategory('')}
                className={`oryx-chip ${category === '' ? 'oryx-chip--active' : ''}`}
                data-testid="pos-category-all"
              >
                {t('erp.sales.pos.allCategories')}
              </button>
              {categories.data!.items.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`oryx-chip ${category === c ? 'oryx-chip--active' : ''}`}
                  data-testid={`pos-category-${c}`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}

          {catalog.loading ? (
            <div className="oryx-pos__grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} height={168} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title={t('common.empty')} hint={t('erp.sales.pos.notFound')} />
          ) : (
            <div className="oryx-pos__grid" data-testid="pos-grid">
              {items.map((p) => (
                <PosProductTile key={p.id} product={p} onAdd={() => addProduct(p)} />
              ))}
            </div>
          )}
        </div>

        {/* ---------------------------------------------------- order rail */}
        <div className="oryx-pos__rail">
          <div className="oryx-pos__rail-head">
            <p className="oryx-pos__rail-title">
              <Icon name="cart" size={17} />
              {t('erp.sales.pos.cart')}
              <Badge tone="neutral">
                {cart.reduce((n, l) => n + l.quantity, 0)} {t('erp.sales.pos.itemCount')}
              </Badge>
            </p>
            {cart.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t('erp.sales.pos.confirmClear'))) setCart([]);
                }}
                data-testid="pos-clear-cart"
              >
                <Icon name="trash" size={14} />
                {t('erp.sales.pos.clearCart')}
              </Button>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <p className="oryx-pos__empty m-0">{t('erp.sales.pos.emptyCart')}</p>
          ) : (
            <div className="oryx-pos__lines">
              {cart.map((l) => (
                <CartRow
                  key={l.key}
                  line={l}
                  onChange={(patch) => updateLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </div>
          )}

          <div className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2">
            <Field label={t('erp.sales.pos.customer')}>
              <EntityPicker
                value={customerId || null}
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.code} — ${c.nameEn || c.nameAr}`,
                  hint: c.phone ?? undefined,
                }))}
                onChange={(v) => setCustomerId(v ?? '')}
                placeholder={t('erp.sales.pos.walkIn')}
                emptyLabel={t('erp.sales.pos.walkIn')}
                testId="pos-customer"
                createLabel={t('erp.sales.newCustomer')}
                reloadOptions={onCustomerCreated}
                renderCreate={({ onClose, onSaved }) => (
                  <CustomerModal
                    open
                    customer={null}
                    onClose={onClose}
                    onCreated={() => {
                      /* selection is handled by onSaved below */
                    }}
                    onSaved={(saved) => void onSaved(saved.id)}
                  />
                )}
              />
            </Field>
            <Field label={t('erp.sales.pos.warehouse')}>
              <select
                className="oryx-select"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                data-testid="pos-warehouse"
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.nameEn}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="oryx-pos__tender">
            <dl className="oryx-pos__totals">
              <Row label={t('erp.sales.pos.subtotal')} value={money(totals.subtotalMinor)} />
              {totals.discountMinor !== 0 ? (
                <Row label={t('erp.sales.pos.discountTotal')} value={`− ${money(totals.discountMinor)}`} />
              ) : null}
              <Row label={t('erp.sales.pos.tax')} value={money(totals.taxMinor)} />
              {totals.roundingMinor !== 0 ? (
                <Row label={t('erp.sales.rounding')} value={money(totals.roundingMinor)} testId="pos-rounding" />
              ) : null}
            </dl>
            <div className="oryx-pos__grand" data-testid="pos-total">
              <span>{t('erp.sales.total')}</span>
              <span className="tabular-nums">{money(totals.totalMinor)}</span>
            </div>

            <span className="oryx-label">{t('erp.sales.pos.payment')}</span>
            <div className="oryx-pos__pay" role="group" aria-label={t('erp.sales.pos.payment')}>
              {POS_PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  aria-pressed={paymentMethod === m}
                  className={`oryx-pay-method ${paymentMethod === m ? 'oryx-pay-method--active' : ''}`}
                  data-testid={`pos-pay-${m}`}
                >
                  {t(`erp.sales.payment.${m}`)}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label={t('erp.sales.pos.paid')}>
                <input
                  className="oryx-input text-end"
                  inputMode="decimal"
                  value={paid}
                  placeholder={fromMinor(totals.totalMinor, currencyScale)}
                  onChange={(e) => setPaid(e.target.value)}
                  data-testid="pos-paid"
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPaid(fromMinor(totals.totalMinor, currencyScale))}
                  data-testid="pos-paid-exact"
                >
                  {t('erp.sales.pos.exact')}
                </Button>
                {paymentMethod === 'CASH' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPaid(fromMinor(roundCashUp(totals.totalMinor, currencyScale), currencyScale))}
                    data-testid="pos-paid-round"
                  >
                    {t('erp.sales.pos.roundCash')}
                  </Button>
                ) : null}
              </div>
            </div>

            <p className="oryx-pos__change m-0" data-testid="pos-change">
              <span>{t('erp.sales.pos.change')}</span>
              <strong className={`tabular-nums ${changeMinor < 0 ? 'text-[var(--danger)]' : ''}`}>
                {money(changeMinor)}
              </strong>
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** One product tile in the POS grid. */
function PosProductTile({ product, onAdd }: { product: PosProductDto; onAdd: () => void }) {
  const { t, locale } = useUi();
  const imageUrl = api.resolveImage(product.imageUrl);
  const soldOut = product.trackStock && product.stockStatus === 'OUT';
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={soldOut}
      className="oryx-pos-tile"
      data-testid={`pos-product-${product.sku}`}
    >
      <span className="oryx-pos-tile__media">
        {imageUrl ? (
          // The catalogue serves a card-sized variant; a plain img keeps the
          // grid cheap for hundreds of tiles.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[var(--muted)]">
            <Icon name="package" size={22} />
          </span>
        )}
        <span className="oryx-pos-tile__badge">
          <Badge tone={soldOut ? 'danger' : product.stockStatus === 'LOW' ? 'gold' : 'success'}>
            {soldOut
              ? t('erp.sales.pos.outOfStock')
              : product.stockStatus === 'LOW'
                ? t('erp.sales.pos.lowStock')
                : t('erp.sales.pos.inStock')}
          </Badge>
        </span>
      </span>
      <span className="oryx-pos-tile__body">
        <span className="oryx-pos-tile__name">
          {locale === 'ar' && product.nameAr ? product.nameAr : product.nameEn}
        </span>
        <span className="oryx-faint font-mono text-[10.5px]">{product.sku}</span>
        <span className="oryx-pos-tile__price tabular-nums">{money(product.salesPriceMinor)}</span>
        <span className="oryx-pos-tile__stock" data-testid={`pos-stock-${product.sku}`}>
          {product.trackStock
            ? `${t('erp.sales.pos.available')}: ${qty(product.onHand)}`
            : t('erp.sales.pos.service')}
        </span>
      </span>
    </button>
  );
}

/** One editable cart line. */
function CartRow({
  line,
  onChange,
  onRemove,
}: {
  line: CartLine;
  onChange: (patch: Partial<CartLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useUi();
  const lineTotal = computePosTotals(
    [
      {
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountPercentBp: line.discountPercentBp,
        taxPercentBp: line.taxPercentBp,
      },
    ],
    'NONE',
    2,
  ).totalMinor;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{line.description}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${t('common.delete')} ${line.description}`}
          onClick={onRemove}
          data-testid={`pos-remove-${line.sku}`}
        >
          <Icon name="close" size={13} />
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <input
          className="oryx-input text-center text-[12px]"
          type="number"
          min={1}
          value={line.quantity}
          aria-label={t('erp.inventory.quantity')}
          onChange={(e) => onChange({ quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          data-testid={`pos-qty-${line.sku}`}
        />
        <input
          className="oryx-input text-end text-[12px]"
          inputMode="decimal"
          value={minorToInput(line.unitPriceMinor)}
          aria-label={t('erp.sales.unitPrice')}
          onChange={(e) => onChange({ unitPriceMinor: toMinorInput(e.target.value) })}
          data-testid={`pos-price-${line.sku}`}
        />
        <input
          className="oryx-input text-center text-[12px]"
          inputMode="decimal"
          value={line.discountPercentBp / 100}
          aria-label={t('erp.sales.discount')}
          onChange={(e) =>
            onChange({ discountPercentBp: Math.round((Number(e.target.value) || 0) * 100) })
          }
          data-testid={`pos-discount-${line.sku}`}
        />
        <span className="grid place-items-center text-[12px] font-semibold tabular-nums">
          {money(lineTotal)}
        </span>
      </div>
    </div>
  );
}

/** A label/value pair in the cart totals. */
function Row({
  label,
  value,
  strong = false,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <dt className={strong ? 'font-bold' : 'oryx-muted'}>{label}</dt>
      <dd className={`m-0 tabular-nums ${strong ? 'text-[15px] font-bold' : ''}`}>{value}</dd>
    </div>
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

/**
 * Price one draft line exactly the way the API prices it, so the figure the
 * form shows is the figure the document prints.
 */
function priceDraftLine(line: LineDraft, currency?: string) {
  const quantity = toQuantityInput(line.quantity);
  const unitPriceMinor = toMinorInput(line.unitPrice, currency);
  const discountPercentBp = Math.round((Number(line.discountPercent) || 0) * 100);
  const taxPercentBp = Math.round((Number(line.taxPercent) || 0) * 100);
  const lineSubtotalMinor = lineAmountMinor(quantity, unitPriceMinor);
  const discountMinor = basisPointsOfMinor(lineSubtotalMinor, discountPercentBp);
  const net = lineSubtotalMinor - discountMinor;
  const taxMinor = basisPointsOfMinor(net, taxPercentBp);
  return { lineSubtotalMinor, discountMinor, taxMinor, lineTotalMinor: net + taxMinor };
}

function computeDraftTotals(
  lines: LineDraft[],
  roundingMode: RoundingMode,
  scale: number,
  currency?: string,
) {
  const priced = lines.map((l) => priceDraftLine(l, currency));
  const subtotalMinor = sumMinor(priced.map((l) => l.lineSubtotalMinor));
  const discountMinor = sumMinor(priced.map((l) => l.discountMinor));
  const taxMinor = sumMinor(priced.map((l) => l.taxMinor));
  const exactTotal = sumMinor(priced.map((l) => l.lineTotalMinor));
  const { rounded: totalMinor, adjustment: roundingMinor } = roundMinor(exactTotal, roundingMode, scale);
  return { subtotalMinor, discountMinor, taxMinor, roundingMinor, totalMinor, priced };
}

/**
 * The line table, laid out to mirror the printed document.
 *
 * The columns follow the paper exactly — Description, Quantity, Unit Price,
 * Discount, Taxes and Amount — and the live Amount column recomputes the line
 * the way the API will, so the operator reads the same figure the PDF prints.
 */
function LineEditor({
  lines,
  setLines,
  products,
  taxOptions,
  testIdPrefix,
  currency,
  roundingMode,
  defaultTaxPercent = '10',
}: {
  lines: LineDraft[];
  setLines: (lines: LineDraft[]) => void;
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  taxOptions: SearchableOption[];
  testIdPrefix: string;
  /** The tenant currency, so the live Amount column matches the document's scale. */
  currency?: string;
  /** The tenant's whole-amount rounding, so the summary matches the printed total. */
  roundingMode: RoundingMode;
  /** The tenant's default VAT rate as a percent, used when a blank line is added. */
  defaultTaxPercent?: string;
}) {
  const { t } = useUi();
  const scale = currencyScaleOf(currency ?? 'BHD');

  const totals = useMemo(
    () => computeDraftTotals(lines, roundingMode, scale, currency),
    [lines, roundingMode, scale, currency],
  );

  const update = (i: number, patch: Partial<LineDraft>) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    setLines(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="oryx-doc-form__grid oryx-doc-form__grid--head">
        <span>{t('erp.sales.form.description')}</span>
        <span className="text-center">{t('erp.sales.form.quantity')}</span>
        <span className="text-end">{t('erp.sales.form.unitPrice')}</span>
        <span className="text-center">{t('erp.sales.discount')}</span>
        <span className="text-center">{t('erp.sales.form.taxes')}</span>
        <span className="text-end">{t('erp.sales.form.amount')}</span>
        <span />
      </div>
      {lines.map((line, i) => (
        <div key={i} className="oryx-doc-form__grid">
          <div className="flex flex-col gap-1">
            <select
              className="oryx-select"
              value={line.productId}
              onChange={(e) => {
                const product = products.find((p) => p.id === e.target.value);
                // A product carries its own rate; if it is not in the saved tax
                // list, keep the numeric value and clear the selection rather than
                // silently switching the line to a different tax.
                const matched = product
                  ? taxOptions.find((o) => o.value === String(product.taxRateBp))
                  : undefined;
                update(i, {
                  productId: e.target.value,
                  description: product ? product.nameEn : line.description,
                  unitPrice: product
                    ? minorToInput(product.salesPriceMinor, currency ?? 'BHD')
                    : line.unitPrice,
                  taxPercent: product ? String(product.taxRateBp / 100) : line.taxPercent,
                  taxId: product ? (matched ? matched.value : '') : line.taxId,
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
              className="oryx-input"
              placeholder={t('erp.sales.form.description')}
              value={line.description}
              onChange={(e) => update(i, { description: e.target.value })}
              data-testid={`${testIdPrefix}-description-${i}`}
            />
          </div>
          <input
            className="oryx-input text-center"
            placeholder="1"
            value={line.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            data-testid={`${testIdPrefix}-quantity-${i}`}
          />
          <input
            className="oryx-input text-end"
            placeholder="0.000"
            value={line.unitPrice}
            onChange={(e) => update(i, { unitPrice: e.target.value })}
            data-testid={`${testIdPrefix}-price-${i}`}
          />
          <input
            className="oryx-input text-center"
            placeholder="%"
            value={line.discountPercent}
            onChange={(e) => update(i, { discountPercent: e.target.value })}
            data-testid={`${testIdPrefix}-discount-${i}`}
          />
          <SearchableSelect
            value={line.taxId || null}
            options={taxOptions}
            onChange={(v) => {
              const chosen = taxOptions.find((o) => o.value === v);
              update(i, {
                taxId: v ?? '',
                taxPercent: chosen ? chosen.label.replace(/[^\d.]/g, '') : line.taxPercent,
              });
            }}
            placeholder="%"
            emptyLabel={t('common.none')}
            testId={`${testIdPrefix}-tax-${i}`}
          />
          <span
            className="text-end tabular-nums text-[12.5px] font-semibold"
            data-testid={`${testIdPrefix}-line-amount-${i}`}
          >
            {money(totals.priced[i]?.lineTotalMinor ?? 0, currency)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={lines.length <= 1}
            onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
            aria-label={t('common.delete')}
          >
            <Icon name="close" size={14} />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button size="sm" onClick={() => setLines([...lines, emptyLine(defaultTaxPercent)])} data-testid={`${testIdPrefix}-add`}>
          <Icon name="plus" size={14} />
          {t('erp.accounting.addLine')}
        </Button>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]" data-testid={`${testIdPrefix}-totals`}>
          <dt className="oryx-muted">{t('erp.sales.form.untaxedAmount')}</dt>
          <dd className="m-0 text-end tabular-nums font-semibold">{money(totals.subtotalMinor, currency)}</dd>
          <dt className="oryx-muted">{t('erp.sales.form.tax')}</dt>
          <dd className="m-0 text-end tabular-nums font-semibold">{money(totals.taxMinor, currency)}</dd>
          <dt className="oryx-muted">{t('erp.sales.form.discount')}</dt>
          <dd className="m-0 text-end tabular-nums font-semibold">{money(totals.discountMinor, currency)}</dd>
          {totals.roundingMinor !== 0 ? (
            <>
              <dt className="oryx-muted">{t('erp.sales.rounding')}</dt>
              <dd className="m-0 text-end tabular-nums font-semibold">{money(totals.roundingMinor, currency)}</dd>
            </>
          ) : null}
          <dt className="font-semibold text-[var(--text)]">{t('erp.sales.form.total')}</dt>
          <dd className="m-0 text-end tabular-nums text-[13.5px] font-bold text-[var(--text)]">
            {money(totals.totalMinor, currency)}
          </dd>
        </dl>
      </div>
    </div>
  );
}

/** One labelled read-only value in the document/customer panel. */
function MirrorField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-bold tracking-wide text-[var(--muted)]">{label}</span>
      <span className="text-[12.5px] font-semibold text-[var(--text)]">{value && value.trim() ? value : '—'}</span>
    </div>
  );
}

/**
 * The create-document form, laid out to mirror the printed page.
 *
 * The fields are grouped the way the document is printed — a document-
 * information panel, a customer-information panel, the item table and a
 * summary — so an operator filling the form reads the same structure the paper
 * carries. Each field maps to a value the PDF actually renders; the operational
 * fields the paper does not print (warehouse, restock, notes) sit in the
 * summary, keeping the mirrored part an exact reflection of the document.
 */
function DocumentModal({
  open,
  title,
  initialDocument,
  relatedInvoiceId,
  allowDraft,
  customers,
  products,
  warehouses,
  taxOptions,
  showWarehouse,
  showRestock,
  reasonField,
  dueDateField,
  settlement,
  testIdPrefix,
  onClose,
  onSubmit,
  onCustomerCreated,
}: {
  open: boolean;
  title: string;
  initialDocument?: SalesDocumentDto | null;
  relatedInvoiceId?: string;
  allowDraft?: boolean;
  customers: CustomerDto[];
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  warehouses: WarehouseDto[];
  taxOptions: SearchableOption[];
  showWarehouse?: boolean;
  showRestock?: boolean;
  /** Reload the customer list after one is created from the picker. */
  onCustomerCreated?: () => Promise<void> | void;
  /**
   * Whether the printed document renders a free-text reason (a credit note
   * prints one where an invoice prints notes). The field is only offered where
   * the template actually prints it.
   */
  reasonField?: boolean;
  /**
   * Which date field the printed template renders beyond the document date:
   * an invoice prints a due date, a quotation a validity date, an order none.
   * The field is only offered where the template actually prints it, so the
   * form never collects data the document would drop.
   */
  dueDateField?: 'dueDate' | 'validUntil';
  /**
   * Whether the document is settled and therefore prints a Payment line. An
   * invoice and a quotation both print the settlement method; a credit note and
   * an order do not, so the field is only offered where the template renders it.
   */
  settlement?: boolean;
  testIdPrefix: string;
  /** The single date property the target document DTO accepts. */
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const { t, locale } = useUi();
  const { companyId, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<{
    currency: string;
    roundingMode: RoundingMode;
    taxNumber: string | null;
    defaultTaxRateBp: number;
  } | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [restock, setRestock] = useState(true);
  const [documentDate, setDocumentDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [salespersonName, setSalespersonName] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDocumentDate(initialDocument?.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setCustomerId(initialDocument?.customerId ?? '');
    setWarehouseId(initialDocument?.warehouseId ?? '');
    setDueDate(initialDocument?.dueDate?.slice(0, 10) ?? '');
    setNotes(reasonField ? '' : initialDocument?.notes ?? '');
    setPaymentMethod(initialDocument?.paymentMethod ?? 'CASH');
    setRestock(!(initialDocument && reasonField));
    setSalespersonName(initialDocument?.salespersonName ?? user?.fullNameEn ?? user?.fullNameAr ?? user?.email ?? '');
    setPaymentReference(initialDocument?.paymentReference ?? '');
    setLines(
      initialDocument?.lines?.length
        ? initialDocument.lines.map((line) => ({
            productId: typeof line.productId === 'string' ? line.productId : '',
            description: typeof line.description === 'string' ? line.description : '',
            quantity: qty(Number(line.quantity ?? 0)),
            unitPrice: minorToInput(Number(line.unitPriceMinor ?? 0), initialDocument.currency),
            discountPercent: String(Number(line.discountPercentBp ?? 0) / 100),
            taxId: '',
            taxPercent: String(Number(line.taxPercentBp ?? 0) / 100),
          }))
        : [emptyLine()],
    );
    // Default the printed "Staf Name" to the signed-in operator. The server
    // applies the same fallback, so an untouched field still prints a real name;
    // prefilling it here shows the operator what the document will say.
    setSalespersonName((prev) => prev || user?.fullNameEn || user?.fullNameAr || user?.email || '');
    if (!companyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await api.getCompany(companyId);
        if (cancelled) return;
        setCompany({
          currency: c.currency,
          roundingMode: c.roundingMode ?? 'NONE',
          taxNumber: c.taxNumber ?? null,
          defaultTaxRateBp: c.defaultTaxRateBp ?? 0,
        });
        // A brand-new document adopts the tenant's configured default rate. Only
        // an untouched single line is seeded, so opening an existing document or
        // a line the operator has already edited is never rewritten.
        if (!initialDocument && c.defaultTaxRateBp != null) {
          setLines((prev) =>
            prev.length === 1 && !prev[0].productId && !prev[0].description && prev[0].unitPrice === '0.00'
              ? [{ ...prev[0], taxPercent: String(c.defaultTaxRateBp / 100) }]
              : prev,
          );
        }
      } catch {
        /* the form still works without the company summary */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, initialDocument, reasonField, user]);

  const currency = company?.currency;
  const selected = customers.find((c) => c.id === customerId) ?? null;
  const customerOptions: SearchableOption[] = customers.map((c) => ({
    value: c.id,
    label: `${c.code} — ${c.nameEn || c.nameAr}`,
    hint: c.phone ?? undefined,
  }));

  const submit = async (post = true) => {
    setBusy(true);
    setError(null);
    try {
      // Each document DTO accepts exactly one date property and its own set of
      // optional fields, so the payload is assembled per document rather than
      // posting every field to every endpoint.
      const payload: Record<string, unknown> = {
        customerId,
        ...(relatedInvoiceId ? {
          invoiceId: relatedInvoiceId,
          branchId: initialDocument?.branchId ?? undefined,
          currency: initialDocument?.currency,
        } : {}),
        ...(allowDraft ? { post } : {}),
        warehouseId: warehouseId || undefined,
        documentDate: documentDate ? new Date(documentDate).toISOString() : new Date().toISOString(),
        ...(dueDateField && dueDate ? { [dueDateField]: new Date(dueDate).toISOString() } : {}),
        ...(reasonField && reason.trim() ? { reason: reason.trim() } : {}),
        ...(settlement ? { paymentMethod } : {}),
        ...(settlement && salespersonName.trim() ? { salespersonName: salespersonName.trim() } : {}),
        ...(settlement && paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
        ...(!reasonField && notes.trim() ? { notes: notes.trim() } : {}),
        restockInventory: showRestock ? restock : undefined,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitPriceMinor: toMinorInput(l.unitPrice, currency),
          discountPercentBp: Math.round((Number(l.discountPercent) || 0) * 100),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      };

      await onSubmit(payload);
      onClose();
      setLines([emptyLine(company ? String(company.defaultTaxRateBp / 100) : '10')]);
      setCustomerId('');
      setDueDate('');
      setNotes('');
      setReason('');
      setSalespersonName('');
      setPaymentReference('');
      setPaymentMethod('CASH');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const dateLabel =
    dueDateField === 'validUntil' ? t('erp.sales.form.quotationDate') : t('erp.sales.form.orderDate');

  return (
    <Modal
      open={open}
      title={title}
      size="document"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {allowDraft ? (
            <Button disabled={busy || !customerId} onClick={() => void submit(false)} data-testid={`save-draft-${testIdPrefix}`}>
              {locale === 'ar' ? 'حفظ كمسودة' : 'Save draft'}
            </Button>
          ) : null}
          <Button variant="primary" disabled={busy || !customerId} onClick={() => void submit(true)} data-testid={`save-${testIdPrefix}`}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="oryx-doc-form__section" data-testid={`${testIdPrefix}-document-info`}>
          <div className="oryx-doc-form__section-head">
            <span>{t('erp.sales.form.documentInfo')}</span>
            <span className="font-mono text-[11px] font-semibold text-[var(--muted)]">
              {t('erp.sales.form.autoNumber')}
            </span>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <Field label={t('erp.sales.form.documentNumber')} hint={t('erp.sales.form.autoNumberHint')}>
              <input className="oryx-input" value="—" readOnly disabled data-testid={`${testIdPrefix}-number`} />
            </Field>
            <Field label={dateLabel}>
              <input
                type="date"
                className="oryx-input"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
                data-testid={`${testIdPrefix}-document-date`}
              />
            </Field>
            {dueDateField ? (
              <Field label={t('erp.sales.form.expirationDate')}>
                <input
                  type="date"
                  className="oryx-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid={`${testIdPrefix}-due-date`}
                />
              </Field>
            ) : null}
            {settlement ? (
              <Field label={t('erp.sales.form.payment')}>
                <select
                  className="oryx-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  data-testid={`${testIdPrefix}-payment-method`}
                >
                  {(['CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'CHEQUE', 'OTHER'] as const).map((m) => (
                    <option key={m} value={m}>
                      {t(`erp.sales.payment.${m}`)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {settlement ? (
              <MirrorField
                label={t('erp.sales.form.staffName')}
                value={salespersonName || user?.fullNameEn || user?.fullNameAr || user?.email}
              />
            ) : null}
            {settlement && paymentMethod === 'BANK_TRANSFER' ? (
              <Field label={t('erp.sales.form.paymentAtAccount')}>
                <input
                  className="oryx-input"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  data-testid={`${testIdPrefix}-payment-reference`}
                />
              </Field>
            ) : null}
            <MirrorField label={t('erp.sales.form.companyTrn')} value={company?.taxNumber ?? null} />
          </div>
        </section>

        <section className="oryx-doc-form__section" data-testid={`${testIdPrefix}-customer-info`}>
          <div className="oryx-doc-form__section-head">
            <span>{t('erp.sales.form.customerInfo')}</span>
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('erp.sales.form.customerName')} hint={t('erp.sales.form.customerHint')} required>
                <EntityPicker
                  value={customerId || null}
                  options={customerOptions}
                  onChange={(v) => setCustomerId(v ?? '')}
                  placeholder={t('common.select')}
                  testId={`${testIdPrefix}-customer`}
                  createLabel={t('erp.sales.newCustomer')}
                  reloadOptions={onCustomerCreated}
                  renderCreate={({ onClose, onSaved }) => (
                    <CustomerModal
                      open
                      customer={null}
                      onClose={onClose}
                      onCreated={() => {
                        /* selection is handled by onSaved below */
                      }}
                      onSaved={(saved) => void onSaved(saved.id)}
                    />
                  )}
                />
              </Field>
            </div>
            <MirrorField label={t('erp.sales.form.contactNo')} value={selected?.phone ?? null} />
            <MirrorField label={t('erp.sales.form.trn')} value={selected?.taxNumber ?? null} />
            <div className="sm:col-span-2">
              <MirrorField
                label={t('erp.sales.form.address')}
                value={selected ? [selected.addressLine, selected.city].filter(Boolean).join(', ') : null}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="oryx-doc-form__section mt-3" data-testid={`${testIdPrefix}-items`}>
        <div className="oryx-doc-form__section-head">
          <span>{t('erp.sales.form.items')}</span>
        </div>
        <div className="p-3">
          <LineEditor
            lines={lines}
            setLines={setLines}
            products={products}
            taxOptions={taxOptions}
            testIdPrefix={testIdPrefix}
            currency={currency}
            roundingMode={company?.roundingMode ?? 'NONE'}
            defaultTaxPercent={company ? String(company.defaultTaxRateBp / 100) : '10'}
          />
        </div>
      </section>

      <section className="oryx-doc-form__section mt-3" data-testid={`${testIdPrefix}-summary`}>
        <div className="oryx-doc-form__section-head">
          <span>{t('erp.sales.form.summary')}</span>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          {showWarehouse ? (
            <Field label={t('erp.inventory.warehouse')}>
              <select
                className="oryx-select"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                data-testid={`${testIdPrefix}-warehouse`}
              >
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
              <select
                className="oryx-select"
                value={restock ? 'yes' : 'no'}
                onChange={(e) => setRestock(e.target.value === 'yes')}
              >
                <option value="yes">{t('common.yes')}</option>
                <option value="no">{t('common.no')}</option>
              </select>
            </Field>
          ) : null}
          {reasonField ? (
            <Field label={t('erp.sales.creditNoteReason')} hint={t('erp.sales.creditNoteReasonHint')}>
              <input
                className="oryx-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid={`${testIdPrefix}-reason`}
              />
            </Field>
          ) : null}
          <Field label={t('common.notes')}>
            <input
              className="oryx-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid={`${testIdPrefix}-notes`}
            />
          </Field>
        </div>
      </section>
    </Modal>
  );
}

/**
 * Secondary branches of a company customer.
 *
 * A branch is stored in its own table and rolled up to the head-office customer,
 * so it never fragments the receivable. The create form posts to the real branch
 * endpoint and the list reloads from the server rather than echoing local state.
 */
function CustomerBranchesPanel({ customerId, canManage }: { customerId: string; canManage: boolean }) {
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
