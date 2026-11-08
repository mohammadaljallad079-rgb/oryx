'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, qty, toBasisPoints, toMinorInput, toQuantityInput } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { AttachmentsPanel, DocumentPrintActions } from '@/components/document-print';
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
import type {
  CashierSessionDto,
  CustomerDto,
  PosSaleDto,
  SalesDocumentDto,
  WarehouseDto,
} from '@oryx/shared';

type Tab = 'invoices' | 'orders' | 'quotations' | 'credit-notes' | 'pos' | 'customers';

interface LineDraft {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
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

/**
 * Line amount preview, computed exactly as the API prices it: quantity × price,
 * minus the discount, plus the tax. Kept in integer minor units so the figure
 * under the cursor matches the figure the server will store.
 */
function lineAmountPreview(line: LineDraft): string {
  const qtyScaled = toQuantityInput(line.quantity);
  const unitMinor = toMinorInput(line.unitPrice);
  const gross = Math.round((qtyScaled * unitMinor) / 10000);
  const discount = Math.round((gross * (Number(line.discountPercent) || 0) * 100) / 10000);
  const net = gross - discount;
  const tax = Math.round((net * (Number(line.taxPercent) || 0) * 100) / 10000);
  return money(net + tax);
}

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
    <div className="flex flex-col gap-5" data-testid="sales-page">
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
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.salesCustomers({ search: search || undefined }), [search]);

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="customer-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-customer">
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
              <th>{t('erp.sales.phone')}</th>
              <th>{t('erp.sales.creditLimit')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((c: CustomerDto) => (
              <tr key={c.id} data-testid={`customer-row-${c.code}`}>
                <td className="font-mono text-[12px]">{c.code}</td>
                <td>
                  <span className="block font-semibold">{c.nameEn}</span>
                  <span className="oryx-faint block text-[11px]">{c.nameAr}</span>
                </td>
                <td className="text-[12.5px]">{c.phone ?? '—'}</td>
                <td className="tabular-nums text-[12.5px]">{money(c.creditLimitMinor)}</td>
                <td><Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CustomerModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CustomerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '', phone: '', creditLimit: '0.00', paymentTermsDays: '30' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createCustomer({
        code: form.code,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        phone: form.phone || undefined,
        creditLimitMinor: toMinorInput(form.creditLimit),
        paymentTermsDays: Number(form.paymentTermsDays) || 0,
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
      title={t('erp.sales.newCustomer')}
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
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="customer-code" />
        </Field>
        <Field label={t('erp.sales.phone')}>
          <input className="oryx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="customer-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="customer-name-ar" />
        </Field>
        <Field label={t('erp.sales.creditLimit')}>
          <input className="oryx-input" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} />
        </Field>
        <Field label={t('erp.sales.paymentTerms')}>
          <input className="oryx-input" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ invoices

function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SalesDocumentDto | null>(null);
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
                  <div className="flex items-center gap-1.5">
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
                  </div>
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
        dateField="invoiceDate"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await api.createSalesInvoice({ ...payload, post: true });
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
                <td><DocumentPrintActions kind="SALES_ORDER" id={o.id} compact /></td>
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
        dateField="orderDate"
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
                  <div className="flex items-center gap-1.5">
                    <DocumentPrintActions kind="QUOTATION" id={q.id} compact />
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
                <td><DocumentPrintActions kind="CREDIT_NOTE" id={n.id} compact /></td>
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
    const net = toQuantityInput(l.quantity) * toMinorInput(l.unitPrice) / 10000;
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

  // Columns: description (wide) | qty | unit price | discount % | tax % | amount | remove.
  const cols = 'grid-cols-[minmax(0,1fr)_70px_100px_70px_70px_104px_32px]';

  return (
    <div className="flex flex-col gap-2" dir="inherit">
      <div className={`hidden ${cols} items-center gap-2 px-1 sm:grid`}>
        <span className="oryx-label m-0">{t('erp.accounting.description')}</span>
        <span className="oryx-label m-0 text-center">{t('erp.inventory.quantity')}</span>
        <span className="oryx-label m-0 text-center">{t('erp.sales.unitPrice')}</span>
        <span className="oryx-label m-0 text-center">{t('erp.sales.discount')}</span>
        <span className="oryx-label m-0 text-center">{t('erp.sales.tax')}</span>
        <span className="oryx-label m-0 text-center">{t('erp.sales.amount')}</span>
        <span aria-hidden />
      </div>
      {lines.map((line, i) => (
        <div key={i} className={`grid ${cols} items-center gap-2`} data-testid={`${testIdPrefix}-line-${i}`}>
          <div className="flex min-w-0 flex-col gap-1">
            <select
              className="oryx-select"
              value={line.productId}
              onChange={(e) => {
                const product = products.find((p) => p.id === e.target.value);
                // Selecting a product fills the product field and its price/tax
                // only. The description stays independent and editable, so a
                // free-text note is never overwritten by the catalogue name.
                update(i, {
                  productId: e.target.value,
                  unitPrice: product ? (product.salesPriceMinor / 100).toFixed(2) : line.unitPrice,
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
              className="oryx-input"
              placeholder={t('erp.sales.lineDescription')}
              value={line.description}
              onChange={(e) => update(i, { description: e.target.value })}
              data-testid={`${testIdPrefix}-description-${i}`}
            />
          </div>
          <input
            className="oryx-input text-center tabular-nums"
            inputMode="decimal"
            placeholder="1"
            value={line.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            data-testid={`${testIdPrefix}-quantity-${i}`}
          />
          <input
            className="oryx-input text-center tabular-nums"
            inputMode="decimal"
            placeholder="0.00"
            value={line.unitPrice}
            onChange={(e) => update(i, { unitPrice: e.target.value })}
            data-testid={`${testIdPrefix}-price-${i}`}
          />
          <input
            className="oryx-input text-center tabular-nums"
            inputMode="decimal"
            placeholder="0"
            value={line.discountPercent}
            onChange={(e) => update(i, { discountPercent: e.target.value })}
            data-testid={`${testIdPrefix}-discount-${i}`}
          />
          <input
            className="oryx-input text-center tabular-nums"
            inputMode="decimal"
            placeholder="15"
            value={line.taxPercent}
            onChange={(e) => update(i, { taxPercent: e.target.value })}
            data-testid={`${testIdPrefix}-tax-${i}`}
          />
          <span
            className="oryx-faint truncate text-center text-[12.5px] font-semibold tabular-nums"
            data-testid={`${testIdPrefix}-amount-${i}`}
          >
            {lineAmountPreview(line)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={lines.length <= 1}
            onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
            data-testid={`${testIdPrefix}-remove-${i}`}
            title={t('common.delete')}
          >
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
  dateField = 'issueDate',
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
  /** The single date property the target document DTO accepts. */
  dateField?: 'issueDate' | 'invoiceDate' | 'orderDate';
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
      // Each document DTO accepts exactly one date property and its own set of
      // optional fields, so the payload is assembled per document rather than
      // posting every field to every endpoint.
      const payload: Record<string, unknown> = {
        customerId,
        [dateField]: new Date().toISOString(),
        // The printed line carries the product name on its first line and the
        // free-text note beneath it, matching the approved form; the note field
        // stays independent of the product selection. A line with neither keeps
        // a neutral placeholder rather than printing empty.
        lines: lines.map((l) => {
          const product = products.find((p) => p.id === l.productId);
          const note = l.description.trim();
          const description = product
            ? note
              ? `${product.nameEn}\n${note}`
              : product.nameEn
            : note || 'Item';
          return {
            productId: l.productId || undefined,
            description,
            quantity: toQuantityInput(l.quantity),
            unitPriceMinor: toMinorInput(l.unitPrice),
            discountPercentBp: toBasisPoints(l.discountPercent),
            taxPercentBp: toBasisPoints(l.taxPercent),
          };
        }),
      };
      if (showWarehouse) payload.warehouseId = warehouseId || undefined;
      if (showRestock) payload.restockInventory = restock;
      await onSubmit(payload);
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
