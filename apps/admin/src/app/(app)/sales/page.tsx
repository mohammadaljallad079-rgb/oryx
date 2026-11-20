'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
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
  DEFAULT_COMPANY_PAYMENT_METHODS,
  type CompanyPaymentMethodSetting,
} from '@oryx/shared';
import { Icon } from '@/components/icons';
import { AttachmentsPanel, DocumentPrintActions, PendingAttachments, uploadPendingAttachments } from '@/components/document-print';
import { ModuleDashboard } from '@/components/module-dashboard';
import { TabDeepLink } from '@/components/tab-deep-link';
import { CustomerModal } from '@/components/customer-modal';
import { EntityPicker } from '@/components/inline-create';
import { ProductModal, WarehouseModal } from '@/components/entity-modals';
import { TaxPicker } from '@/components/tax-modal';
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
  SearchableSelect,
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
import { SalesRegisterFilters, EMPTY_SALES_REGISTER_FILTERS, salesFilterQuery, type SalesRegisterFilterValues } from '@/components/sales-register-filters';
import { PosCameraScanner } from '@/components/pos-camera-scanner';

type Tab = 'dashboard' | 'invoices' | 'quotations' | 'returns' | 'pos';

interface LineDraft {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** A fixed per-line discount in document currency (excluding VAT). */
  discountAmount: string;
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
  discountAmount: '0',
  taxId: '',
  taxPercent,
});

/** The payment methods a POS sale may be settled with. */
type PosPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'WALLET' | 'CHEQUE' | 'OTHER';

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
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  taxPercentBp: number;
  discountAmountMinor: number;
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
    discountAmountMinor: number;
    taxPercentBp: number;
  }>,
  roundingMode: RoundingMode,
  scale: number,
) {
  const priced = lines.map((l) => {
    // Cart quantities are human units; the shared money helper expects 10^4-scaled units.
    const lineSubtotalMinor = lineAmountMinor(l.quantity * 10000, l.unitPriceMinor);
    const discountMinor = Math.min(lineSubtotalMinor, Math.max(0, l.discountAmountMinor));
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
 * `reload` refreshes the list after a rate is created from a line's picker.
 */
function useTaxOptions(companyId: string | null | undefined): {
  options: SearchableOption[];
  reload: () => Promise<void>;
} {
  const taxes = useAsync(
    () => api.taxes({ companyId: companyId ?? undefined, includeInactive: 'false' }),
    [companyId],
  );
  return {
    options: (taxes.data?.items ?? [])
      .filter((tax) => tax.scope === 'SALES' || tax.scope === 'BOTH')
      .map((tax) => ({
        value: String(tax.rateBp),
        label: `${tax.rateBp / 100}%`,
        hint: tax.nameEn || tax.nameAr,
      })),
    reload: taxes.reload,
  };
}

const TAB_KEYS = ['dashboard', 'invoices', 'quotations', 'returns', 'pos'] as const;

/** The dictionary key for a return's refund method. */
function refundLabelKey(method?: string): string {
  switch (method) {
    case 'CASH':
      return 'erp.sales.refundCash';
    case 'BANK_TRANSFER':
      return 'erp.sales.refundBankTransfer';
    case 'CARD':
      return 'erp.sales.refundCard';
    default:
      return 'erp.sales.refundCreditAccount';
  }
}

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
    { key: 'quotations', label: t('erp.sales.quotations') },
    { key: 'returns', label: t('erp.sales.returns') },
    { key: 'pos', label: t('erp.sales.pos') },
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
      {tab === 'quotations' ? <QuotationsTab canManage={can('erp.sales.order.manage')} canConvertToInvoice={can('erp.sales.invoice.manage')} onConverted={() => setTab('invoices')} /> : null}
      {tab === 'returns' ? <CreditNotesTab canManage={can('erp.sales.credit_note.manage')} /> : null}
      {tab === 'pos' ? <PosTab canOperate={can('erp.sales.pos.operate')} canManage={can('erp.sales.pos.manage')} /> : null}
    </div>
  );
}

/** One priced line as the API stores it inside a sales document. */
type SalesLine = {
  description?: string;
  quantity?: number;
  unitPriceMinor?: number;
  discountPercentBp?: number;
  discountMinor?: number;
  taxPercentBp?: number;
  lineTotalMinor?: number;
};

/**
 * The read-only pricing breakdown of an issued invoice: every line with its own
 * quantity, unit price, discount, VAT rate and line total, then the document
 * totals. Every figure is a stored integer rendered through `money`, so the
 * panel and the printed PDF read the same numbers and can never disagree.
 */
function InvoiceLineBreakdown({ document: doc }: { document: SalesDocumentDto }) {
  const { t } = useUi();
  const lines = (doc.lines ?? []) as SalesLine[];
  const currency = doc.currency;
  return (
    <div className="flex flex-col gap-3" data-testid="invoice-line-details">
      <p className="oryx-panel-title m-0">{t('erp.sales.lineDetails')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[11px] uppercase text-[var(--muted)]">
              <th className="py-1 text-start font-semibold">{t('erp.sales.form.description')}</th>
              <th className="py-1 text-end font-semibold">{t('erp.sales.form.quantity')}</th>
              <th className="py-1 text-end font-semibold">{t('erp.sales.form.unitPrice')}</th>
              <th className="py-1 text-end font-semibold">{t('erp.sales.discount')}</th>
              <th className="py-1 text-end font-semibold">{t('erp.sales.form.tax')}</th>
              <th className="py-1 text-end font-semibold">{t('erp.sales.form.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-[var(--border)]" data-testid={`invoice-line-${i}`}>
                <td className="py-1.5 text-start">{line.description || '—'}</td>
                <td className="py-1.5 text-end tabular-nums">{qty(line.quantity)}</td>
                <td className="py-1.5 text-end tabular-nums">{money(line.unitPriceMinor, currency)}</td>
                <td className="py-1.5 text-end tabular-nums">{money((line.discountMinor && line.discountMinor > 0 ? line.discountMinor : basisPointsOfMinor(lineAmountMinor(line.quantity ?? 0, line.unitPriceMinor ?? 0), line.discountPercentBp ?? 0)), currency)}</td>
                <td className="py-1.5 text-end tabular-nums">{((line.taxPercentBp ?? 0) / 100).toFixed(2)}%</td>
                <td className="py-1.5 text-end tabular-nums font-semibold">{money(lineAmountMinor(line.quantity ?? 0, line.unitPriceMinor ?? 0) - (line.discountMinor && line.discountMinor > 0 ? line.discountMinor : basisPointsOfMinor(lineAmountMinor(line.quantity ?? 0, line.unitPriceMinor ?? 0), line.discountPercentBp ?? 0)), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ms-auto grid w-full max-w-xs grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]" data-testid="invoice-totals">
        <dt className="oryx-muted">{t('erp.sales.form.untaxedAmount')}</dt>
        <dd className="m-0 text-end tabular-nums font-semibold">{money(doc.subtotalMinor, currency)}</dd>
        <dt className="oryx-muted">{t('erp.sales.form.discount')}</dt>
        <dd className="m-0 text-end tabular-nums font-semibold">{money(doc.discountMinor, currency)}</dd>
        <dt className="oryx-muted">{t('erp.sales.form.tax')}</dt>
        <dd className="m-0 text-end tabular-nums font-semibold">{money(doc.taxMinor, currency)}</dd>
        {doc.roundingMinor !== 0 ? (
          <>
            <dt className="oryx-muted">{t('erp.sales.rounding')}</dt>
            <dd className="m-0 text-end tabular-nums font-semibold">{money(doc.roundingMinor, currency)}</dd>
          </>
        ) : null}
        <dt className="font-semibold text-[var(--text)]">{t('erp.sales.form.total')}</dt>
        <dd className="m-0 text-end tabular-nums text-[13.5px] font-bold text-[var(--text)]">{money(doc.totalMinor, currency)}</dd>
      </dl>
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
  const [filters, setFilters] = useState<SalesRegisterFilterValues>({ ...EMPTY_SALES_REGISTER_FILTERS });
  const list = useAsync(() => api.salesInvoices({ page: 1, ...salesFilterQuery(filters) }), [filters]);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);

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
      <SalesRegisterFilters kind="invoices" value={filters} onChange={setFilters} />
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
                <td className="font-mono text-[12px]">
                  <div>{inv.invoiceNumber}</div>
                  {(inv as SalesDocumentDto & { sourceQuotationNumber?: string | null }).sourceQuotationNumber ? (
                    <div className="text-[11px] text-[var(--muted)]" data-testid={`invoice-source-quote-${inv.invoiceNumber}`}>
                      {t('erp.sales.quoteNumber')}: {(inv as SalesDocumentDto & { sourceQuotationNumber?: string | null }).sourceQuotationNumber}
                    </div>
                  ) : null}
                </td>
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
                      </>
                    ) : null}
                    {inv.status !== 'DRAFT' ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetail(inv)}
                          title={t('common.details')}
                          aria-label={t('common.details')}
                          data-testid={`invoice-attach-open-${inv.invoiceNumber}`}
                        >
                          <Icon name="list" size={15} />
                        </Button>
                        <DocumentActions
                          sourceType="SalesInvoice"
                          sourceId={inv.id}
                          type="SALES_INVOICE"
                          permissions={['erp.sales.read', 'erp.accounting.read']}
                          autoOpenOnMount={autoPreviewId === inv.id}
                          iconsOnly
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
        onProductCreated={products.reload}
        onWarehouseCreated={warehouses.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        showWarehouse
        dueDateField="dueDate"
        settlement
        testIdPrefix="invoice"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          let savedId: string;
          if (editingInvoice) {
            await api.updateSalesInvoice(editingInvoice.id, payload);
            if (payload.post !== false) setAutoPreviewId(editingInvoice.id);
            savedId = editingInvoice.id;
            setEditingInvoice(null);
          } else {
            const created = await api.createSalesInvoice(payload);
            if (payload.post !== false) setAutoPreviewId(created.id);
            savedId = created.id;
          }
          await list.reload();
          return savedId;
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
              <DocumentPrintActions kind="SALES_INVOICE" id={detail.id} compact />
            </div>
            <InvoiceLineBreakdown document={detail} />
            <AttachmentsPanel entityType="SALES_INVOICE" entityId={detail.id} canManage={canManage} />
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- quotations

function QuotationsTab({ canManage, canConvertToInvoice, onConverted }: { canManage: boolean; canConvertToInvoice: boolean; onConverted: () => void }) {
  const { t, locale } = useUi();
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SalesDocumentDto | null>(null);
  const [filters, setFilters] = useState<SalesRegisterFilterValues>({ ...EMPTY_SALES_REGISTER_FILTERS });
  const list = useAsync(() => api.quotations({ page: 1, ...salesFilterQuery(filters) }), [filters]);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);

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
      <SalesRegisterFilters kind="quotations" value={filters} onChange={setFilters} />
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
                <td className="font-mono text-[12px]">
                  <div>{q.quoteNumber}</div>
                  {(q as SalesDocumentDto & { convertedInvoiceNumber?: string | null }).convertedInvoiceNumber ? (
                    <button type="button" className="text-[11px] text-[var(--accent)] underline"
                      onClick={onConverted}
                      data-testid={`quotation-invoice-link-${q.quoteNumber}`}>
                      {locale === 'ar' ? 'الفاتورة: ' : 'Invoice: '}
                      {(q as SalesDocumentDto & { convertedInvoiceNumber?: string | null }).convertedInvoiceNumber}
                    </button>
                  ) : null}
                </td>
                <td className="text-[12.5px]">{q.issueDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{q.customerNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(q.totalMinor, q.currency)}</td>
                <td><StatusBadge status={q.status} label={q.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(q)}
                      data-testid={`quotation-details-${q.quoteNumber}`}
                      title={t('common.details')} aria-label={t('common.details')}>
                      <Icon name="list" size={15} />
                    </Button>
                    <DocumentActions
                      sourceType="Quotation"
                      sourceId={q.id}
                      type="QUOTATION"
                      permissions={['erp.sales.read', 'erp.accounting.read']}
                      iconsOnly
                    />
                    {canManage && canConvertToInvoice && q.status !== 'CONVERTED' ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await api.convertQuotationToDraftInvoice(q.id, warehouses.data?.items[0]?.id);
                          await list.reload();
                          onConverted();
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
      <Modal open={detail !== null}
        title={`${t('erp.sales.quoteNumber')} ${detail?.quoteNumber ?? ''}`}
        onClose={() => setDetail(null)}>
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{detail.customerNameEn || detail.customerNameAr}</span>
              <DocumentActions sourceType="Quotation" sourceId={detail.id} type="QUOTATION"
                permissions={['erp.sales.read', 'erp.accounting.read']} iconsOnly />
            </div>
            <InvoiceLineBreakdown document={detail} />
            <AttachmentsPanel entityType="QUOTATION" entityId={detail.id} canManage={canManage} />
          </div>
        ) : null}
      </Modal>
      <DocumentModal
        open={open}
        title={t('erp.sales.newQuotation')}
        customers={customers.data?.items ?? []}
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        onProductCreated={products.reload}
        onWarehouseCreated={warehouses.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        dueDateField="validUntil"
        settlement
        testIdPrefix="quotation"
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          const created = await api.createQuotation(payload);
          await list.reload();
          return created.id;
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
  const [relatedInvoiceId, setRelatedInvoiceId] = useState<string | null>(null);
  const [returnCustomerId, setReturnCustomerId] = useState('');
  const [detail, setDetail] = useState<SalesDocumentDto | null>(null);
  const [filters, setFilters] = useState<SalesRegisterFilterValues>({ ...EMPTY_SALES_REGISTER_FILTERS });
  const list = useAsync(() => api.creditNotes({ page: 1, ...salesFilterQuery(filters) }), [filters]);
  const customers = useAsync(() => api.salesCustomers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const invoices = useAsync(() => api.salesInvoices({ page: 1, pageSize: 100, customerId: returnCustomerId || undefined }), [returnCustomerId]);
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);

  // A return is normally raised against the invoice it reverses. Picking the
  // invoice here pre-fills the customer, branch, currency and lines, so the
  // operator does not retype what the original document already carries.
  const selectedInvoice = (invoices.data?.items ?? []).find((inv) => inv.id === relatedInvoiceId) ?? null;
  const invoiceOptions: SearchableOption[] = (invoices.data?.items ?? [])
    .filter((inv) => returnCustomerId && inv.customerId === returnCustomerId && inv.status !== 'DRAFT')
    .map((inv) => ({
    value: inv.id,
    label: `${inv.invoiceNumber} — ${inv.customerNameEn}`,
    hint: money(inv.totalMinor, inv.currency),
  }));

  const closeModal = () => {
    setOpen(false);
    setRelatedInvoiceId(null);
    setReturnCustomerId('');
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.sales.returns')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-credit-note">
            <Icon name="plus" size={16} />
            {t('erp.sales.newCreditNote')}
          </Button>
        ) : null}
      </div>
      <SalesRegisterFilters kind="returns" value={filters} onChange={setFilters} />
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
              <th>{t('erp.sales.refundMethod')}</th>
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
                <td className="text-[12.5px]" data-testid={`credit-note-refund-${n.creditNoteNumber}`}>{t(refundLabelKey(n.refundMethod))}</td>
                <td className="text-[12.5px]">{(n as { restockInventory?: boolean }).restockInventory ? '✓' : '—'}</td>
                <td><StatusBadge status={n.status} label={n.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(n)}
                      data-testid={`return-attachments-${n.creditNoteNumber}`}
                      title={t('common.details')} aria-label={t('common.details')}>
                      <Icon name="list" size={15} />
                    </Button>
                    <DocumentActions
                      sourceType="CreditNote"
                      sourceId={n.id}
                      type="SALES_RETURN"
                      permissions={['erp.sales.read', 'erp.accounting.read']}
                      iconsOnly
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Modal
        open={detail !== null}
        title={`${t('erp.sales.creditNoteNumber')} ${detail?.creditNoteNumber ?? ''}`}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{detail.customerNameEn || detail.customerNameAr}</span>
              <DocumentActions sourceType="CreditNote" sourceId={detail.id} type="SALES_RETURN"
                permissions={['erp.sales.read', 'erp.accounting.read']} iconsOnly />
            </div>
            <InvoiceLineBreakdown document={detail} />
            <AttachmentsPanel entityType="CREDIT_NOTE" entityId={detail.id} canManage={canManage} />
          </div>
        ) : null}
      </Modal>
      <DocumentModal
        open={open}
        title={t('erp.sales.newCreditNote')}
        initialDocument={selectedInvoice}
        relatedInvoiceId={relatedInvoiceId ?? undefined}
        returnInvoiceOptions={invoiceOptions}
        returnInvoiceLoading={invoices.loading}
        onReturnInvoiceChange={(id) => setRelatedInvoiceId(id)}
        onReturnCustomerChange={(id) => {
          setReturnCustomerId(id);
          setRelatedInvoiceId(null);
        }}
        customers={customers.data?.items ?? []}
        onCustomerCreated={customers.reload}
        products={products.data?.items ?? []}
        warehouses={warehouses.data?.items ?? []}
        onProductCreated={products.reload}
        onWarehouseCreated={warehouses.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        showWarehouse
        showRestock
        reasonField
        testIdPrefix="credit-note"
        onClose={closeModal}
        onSubmit={async (payload) => {
          const created = await api.createCreditNote(payload);
          await list.reload();
          return created.id;
        }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------- POS

function PosTab({ canOperate, canManage }: { canOperate: boolean; canManage: boolean }) {
  const { t, locale } = useUi();
  const { companyId } = useAuth();
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('NONE');
  const [currencyScale, setCurrencyScale] = useState(currencyScaleOf('BHD'));
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
  const [filters, setFilters] = useState<SalesRegisterFilterValues>({ ...EMPTY_SALES_REGISTER_FILTERS });
  const sales = useAsync(() => api.posSales({ page: 1, ...salesFilterQuery(filters) }), [filters]);
  const branches = useAsync(() => api.context(), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const customers = useAsync(() => api.salesCustomers(), []);
  const [saleOpen, setSaleOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashierSessionDto | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const openSession = sessions.data?.items.find((s) => s.status === 'OPEN');

  // Keep the desktop POS workstation ready as soon as a cashier session is open.
  useEffect(() => {
    if (canOperate && openSession?.id) setSaleOpen(true);
  }, [canOperate, openSession?.id]);

  /**
   * Opens the branch's cashier session.
   *
   * The API refuses a second open session per branch (`CASHIER_SESSION_ALREADY_OPEN`)
   * and refuses a branch the operator is not scoped to. Both are real answers the
   * cashier must see, so the failure is surfaced rather than swallowed: a silent
   * no-op here reads as a broken button.
   */
  const startSession = async () => {
    // `context().branches` can carry branches from every company the principal
    // can see (a platform or multi-company operator). Opening a session against
    // the first entry regardless of the selected company is what produced
    // "Branch belongs to another company", so the branch is matched to the
    // active company first.
    const branchId = (branches.data?.branches ?? []).find(
      (b) => !companyId || b.companyId === companyId,
    )?.id;
    if (!branchId) {
      setOpenError(t('erp.sales.pos.noBranch'));
      return;
    }
    // The session's warehouse must belong to the same branch; a warehouse from
    // another branch is silently dropped rather than sent and rejected.
    const warehouseId = (warehouses.data?.items ?? []).find(
      (w) => !w.branchId || w.branchId === branchId,
    )?.id;
    setOpening(true);
    setOpenError(null);
    try {
      await api.openCashierSession({
        branchId,
        warehouseId,
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
              {opening ? t('common.loading') : (locale === 'ar' ? 'فتح جلسة جديدة' : 'Open new session')}
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
        <SalesRegisterFilters kind="pos" value={filters} onChange={setFilters} />
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
                      iconsOnly
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
        onWarehouseCreated={warehouses.reload}
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
  onWarehouseCreated,
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
  onWarehouseCreated?: () => Promise<void> | void;
  roundingMode: RoundingMode;
  currencyScale: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t, locale } = useUi();
  const { companyId, can } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const debouncedSearch = useDebounced(search, 250);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [paymentMethodCode, setPaymentMethodCode] = useState('CASH');
  const [paymentOptions, setPaymentOptions] = useState<CompanyPaymentMethodSetting[]>(DEFAULT_COMPANY_PAYMENT_METHODS);
  const [paid, setPaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const cartListRef = useRef<HTMLDivElement>(null);
  const previousCartLength = useRef(0);

  // A new product must be visible immediately in a crowded cashier cart,
  // without moving the whole POS workspace or hiding payment controls.
  useEffect(() => {
    if (!open) {
      previousCartLength.current = 0;
      return;
    }
    if (cart.length > previousCartLength.current && cartListRef.current) {
      cartListRef.current.scrollTop = cartListRef.current.scrollHeight;
    }
    previousCartLength.current = cart.length;
  }, [cart.length, open]);


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
    if (!open || !companyId) return;
    let cancelled = false;
    void api.companySettings(companyId).then((response) => {
      if (cancelled) return;
      const enabled = (response.sections.sales.paymentMethods ?? DEFAULT_COMPANY_PAYMENT_METHODS)
        .filter((method) => method.isActive && method.useInPos && method.accountingMethod !== 'CREDIT');
      setPaymentOptions(enabled);
      const preferred = enabled.find((method) => method.code === 'CASH') ?? enabled[0];
      if (preferred) {
        setPaymentMethodCode(preferred.code);
        setPaymentMethod(preferred.accountingMethod as PosPaymentMethod);
      }
    }).catch(() => {
      if (!cancelled) setPaymentOptions(DEFAULT_COMPANY_PAYMENT_METHODS.filter(
        (method) => method.useInPos && method.isActive,
      ));
    });
    return () => { cancelled = true; };
  }, [open, companyId]);


  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setSearch('');
    setCart([]);
    setPaid('');
    setCameraOpen(false);
    setPaymentMethod('CASH');
    setPaymentMethodCode('CASH');
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
          imageUrl: product.imageUrl,
          quantity: 1,
          unitPriceMinor: product.salesPriceMinor,
          taxPercentBp: product.taxRateBp,
          discountAmountMinor: 0,
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
  const onScanSubmit = async (scannedCode?: string) => {
    const term = (scannedCode ?? search).trim();
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
          discountAmountMinor: l.discountAmountMinor,
          taxPercentBp: l.taxPercentBp,
        })),
        roundingMode,
        currencyScale,
      ),
    [cart, roundingMode, currencyScale],
  );

  const paidMinor = useMemo(() => {
    try {
      return paid.trim() === '' ? totals.totalMinor : toMinorInput(paid);
    } catch {
      return -1;
    }
  }, [paid, totals.totalMinor]);
  const changeMinor = paidMinor - totals.totalMinor;
  const saleValid = Boolean(session) && cart.length > 0 &&
    cart.every(line => Number.isSafeInteger(line.unitPriceMinor) && line.unitPriceMinor > (currencyScale === 3 ? 1 : 0)) &&
    paidMinor >= totals.totalMinor && totals.totalMinor > 0;

  const submit = async () => {
    if (!session || cart.length === 0) return;
    if (cart.some(line => !Number.isInteger(line.unitPriceMinor) || line.unitPriceMinor <= (currencyScale === 3 ? 1 : 0))) {
      setError(locale === 'ar' ? 'يرجى إدخال سعر صحيح أكبر من صفر لكل منتج قبل إتمام البيع.' : 'Set a valid price greater than zero for every item before checkout.');
      return;
    }
    if (paidMinor < totals.totalMinor) {
      setError(locale === 'ar' ? 'المبلغ المدفوع أقل من إجمالي الفاتورة.' : 'Paid amount is less than the sale total.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createPosSale({
        branchId: session.branchId,
        cashierSessionId: session.id,
        warehouseId: warehouseId || undefined,
        customerId: customerId || undefined,
        paymentMethod,
        paymentMethodCode,
        paidMinor,
        lines: cart.map((l) => ({
          productId: l.productId,
          description: l.description || 'Item',
          // The API's invoice/stock engine also uses 10^4-scaled quantities.
          quantity: l.quantity * 10000,
          unitPriceMinor: l.unitPriceMinor,
          discountAmountMinor: l.discountAmountMinor,
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

  async function uploadPosImage(product: PosProductDto, file: File | null) {
    if (!file) return;
    setError(null);
    setUploadingImageId(product.id);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('altEn', product.nameEn);
      if (product.nameAr) form.append('altAr', product.nameAr);
      await api.uploadProductImage(product.id, form);
      await catalog.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setUploadingImageId(null);
    }
  }

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
            disabled={busy || !saleValid}
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

      <div className="oryx-pos oryx-pos--premium oryx-pos--workspace-v4 oryx-pos--new-cashier" data-testid="pos-premium-workstation">
        <header className="oryx-pos__quickbar" data-testid="pos-command-bar">
          <div className="oryx-pos__quickbar-heading">
            <span className="oryx-pos__quickbar-mark"><Icon name="cart" size={19} /></span>
            <div className="min-w-0">
              <strong>{locale === 'ar' ? 'نقطة البيع' : 'Point of sale'}</strong>
              <span>{locale === 'ar' ? 'اختر المنتجات، راجع السلة، ثم أكمل الدفع' : 'Choose products, review cart, then pay'}</span>
            </div>
          </div>
          <div className="oryx-pos__quickbar-session">
            <span className="oryx-pos__quickbar-live" aria-hidden="true" />
            <span>{locale === 'ar' ? 'جلسة نشطة' : 'Active session'}</span>
            <b dir="ltr">{session?.sessionNumber ?? '—'}</b>
          </div>
          <div className="oryx-pos__quickbar-summary" aria-live="polite">
            <span>{locale === 'ar' ? 'المنتجات المختارة' : 'Selected items'} <b>{cart.reduce((n, l) => n + l.quantity, 0)}</b></span>
            <strong dir="ltr">{money(totals.totalMinor)}</strong>
          </div>
        </header>
        {/* ---------------------------------------------------- product grid */}
        <div className="oryx-pos__catalog flex min-h-0 min-w-0 flex-col gap-3">
          <div className="oryx-pos__section-heading">
            <div>
              <strong>{locale === 'ar' ? 'كتالوج المنتجات والخدمات' : 'Products & services'}</strong>
              <span>{locale === 'ar' ? 'اختر من المنتجات أو امسح الباركود' : 'Select a product or scan a barcode'}</span>
            </div>
            <span className="oryx-pos__catalog-count">{items.length} {locale === 'ar' ? 'منتج' : 'products'}</span>
          </div>
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
            <Button size="sm" variant="ghost" onClick={() => setCameraOpen(value => !value)}
              data-testid="pos-camera-toggle" aria-label={locale === 'ar' ? 'مسح بالكاميرا' : 'Scan with camera'}>
              <Icon name="camera" size={18} />
              {locale === 'ar' ? 'مسح بالكاميرا' : 'Camera scan'}
            </Button>
            <Button variant="ghost" onClick={() => void catalog.reload()} aria-label={t('common.refresh')}>
              <Icon name="refresh" size={18} />
            </Button>
          </div>

          <PosCameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)}
            onDetected={(code) => { setCameraOpen(false); void onScanSubmit(code); }} />
          {catalog.error ? <ErrorBanner message={catalog.error} onRetry={catalog.reload} /> : null}

          {catalog.loading ? (
            <div className="oryx-pos__grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} height={168} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title={t('common.empty')} hint={t('erp.sales.pos.notFound')} />
          ) : (
            <div className="oryx-pos__grid" data-testid="pos-grid" role="list" aria-label={locale === 'ar' ? 'المنتجات المتاحة' : 'Available products'}>
              {items.map((p) => (
                <div key={p.id} className="flex min-w-0 flex-col gap-1">
                  <PosProductTile product={p} onAdd={() => addProduct(p)} selectedQuantity={cart.find((line) => line.productId === p.id)?.quantity ?? 0} />
                  {!p.imageUrl && can('erp.inventory.item.manage') ? (
                    <label className="oryx-btn oryx-btn--sm flex cursor-pointer items-center justify-center gap-1"
                      data-testid={`pos-add-image-${p.sku}`}>
                      <Icon name="plus" size={13} />
                      {uploadingImageId === p.id
                        ? (locale === 'ar' ? 'جارٍ رفع الصورة...' : 'Uploading image...')
                        : (locale === 'ar' ? 'إضافة صورة المنتج' : 'Add product photo')}
                      <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/avif"
                        disabled={uploadingImageId !== null}
                        onChange={e => { void uploadPosImage(p, e.target.files?.[0] ?? null); e.target.value = ''; }} />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="oryx-pos__categories" data-testid="pos-categories" aria-label={locale === 'ar' ? 'تصنيفات المنتجات' : 'Product categories'}>
          <p className="oryx-pos__categories-title"><Icon name="grid" size={17} /> {locale === 'ar' ? 'التصنيفات' : 'Categories'}</p>
          <button type="button" onClick={() => setCategory('')}
            className={`oryx-pos__category ${category === '' ? 'oryx-pos__category--active' : ''}`}
            data-testid="pos-category-all" aria-pressed={category === ''}>
            <Icon name="grid" size={17} />
            <span>{t('erp.sales.pos.allCategories')}</span>
          </button>
          {(categories.data?.items ?? []).map((c) => (
            <button type="button" key={c} onClick={() => setCategory(c)}
              className={`oryx-pos__category ${category === c ? 'oryx-pos__category--active' : ''}`}
              data-testid={`pos-category-${c}`} aria-pressed={category === c}>
              <Icon name="package" size={17} />
              <span>{c}</span>
            </button>
          ))}
        </aside>

        {/* ---------------------------------------------------- order rail */}
        <div className="oryx-pos__rail" data-testid="pos-checkout-cart" aria-label={locale === 'ar' ? 'سلة المنتجات المختارة' : 'Selected products cart'}>
          <div className="oryx-pos__rail-head">
            <p className="oryx-pos__rail-title">
              <span className="oryx-pos__rail-icon"><Icon name="cart" size={19} /></span>
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
            <div className="oryx-pos__lines" ref={cartListRef} data-testid="pos-cart-lines">
              {cart.map((l) => (
                <CartRow
                  key={l.key}
                  line={l}
                  currencyScale={currencyScale}
                  onChange={(patch) => updateLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </div>
          )}

          <div className="oryx-pos__customer-warehouse grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2">
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
              <EntityPicker
                value={warehouseId || null}
                options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.nameEn}` }))}
                onChange={(v) => setWarehouseId(v ?? '')}
                placeholder={t('common.select')}
                emptyLabel={t('common.none')}
                testId="pos-warehouse"
                createLabel={t('erp.inventory.newWarehouse')}
                reloadOptions={onWarehouseCreated}
                renderCreate={({ onClose: closeCreate, onSaved }) => (
                  <WarehouseModal
                    open
                    onClose={closeCreate}
                    onCreated={() => { /* selection is handled by onSaved */ }}
                    onSaved={(saved) => void onSaved(saved.id)}
                  />
                )}
              />
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
              {paymentOptions.filter((m) => m.isActive && m.useInPos && m.accountingMethod !== 'CREDIT').map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => {
                    setPaymentMethodCode(m.code);
                    setPaymentMethod(m.accountingMethod as PosPaymentMethod);
                  }}
                  aria-pressed={paymentMethodCode === m.code}
                  className={`oryx-pay-method ${paymentMethodCode === m.code ? 'oryx-pay-method--active' : ''}`}
                  data-testid={`pos-pay-${m.code}`}
                >
                  {locale === 'ar' ? m.nameAr : m.nameEn}
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

            {paidMinor < 0 ? (
              <p className="m-0 text-xs text-[var(--danger)]" role="alert">
                {locale === 'ar' ? 'تحقق من صيغة المبلغ المدفوع.' : 'Enter a valid paid amount.'}
              </p>
            ) : null}
            <p className="oryx-pos__change m-0" data-testid="pos-change">
              <span>{t('erp.sales.pos.change')}</span>
              <strong className={`tabular-nums ${changeMinor < 0 ? 'text-[var(--danger)]' : ''}`}>
                {money(changeMinor)}
              </strong>
            </p>
            <Button variant="primary" className="oryx-btn oryx-btn--primary w-full justify-center"
              disabled={busy || !saleValid}
              onClick={() => void submit()} data-testid="pos-checkout-panel">
              <Icon name="check" size={17} />
              {busy ? t('common.loading') : `${t('erp.sales.pos.complete')} · ${money(totals.totalMinor)}`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** One product tile in the POS grid. */
function PosProductTile({ product, onAdd, selectedQuantity = 0 }: { product: PosProductDto; onAdd: () => void; selectedQuantity?: number }) {
  const { t, locale } = useUi();
  const imageUrl = api.resolveImage(product.imageUrl);
  const soldOut = product.trackStock && product.stockStatus === 'OUT';
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={soldOut}
      className={`oryx-pos-tile ${selectedQuantity > 0 ? 'oryx-pos-tile--selected' : ''}`}
      data-testid={`pos-product-${product.sku}`}
    >
      <span className="oryx-pos-tile__media">
        {selectedQuantity > 0 ? <span className="oryx-pos-tile__selected" aria-label={`${selectedQuantity} in cart`}>{selectedQuantity}</span> : null}
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
        <span className="oryx-pos-tile__price tabular-nums">
          {product.salesPriceMinor <= 1
            ? (locale === 'ar' ? 'السعر بحاجة لتحديد' : 'Price needs review')
            : money(product.salesPriceMinor)}
        </span>
        <span className="oryx-pos-tile__add" aria-hidden="true"><Icon name="plus" size={15} /></span>
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
  currencyScale,
  onChange,
  onRemove,
}: {
  line: CartLine;
  currencyScale: number;
  onChange: (patch: Partial<CartLine>) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useUi();
  const [priceDraft, setPriceDraft] = useState(() => minorToInput(line.unitPriceMinor));
  const [priceError, setPriceError] = useState(false);
  const [expanded, setExpanded] = useState(() => line.unitPriceMinor <= (currencyScale === 3 ? 1 : 0));
  useEffect(() => { setPriceDraft(minorToInput(line.unitPriceMinor)); }, [line.unitPriceMinor]);
  const onPriceCommit = () => {
    try {
      const price = toMinorInput(priceDraft);
      if (!Number.isSafeInteger(price) || price < 0) throw new Error('Invalid price');
      onChange({ unitPriceMinor: price });
      setPriceDraft(minorToInput(price));
      setPriceError(false);
    } catch {
      setPriceError(true);
    }
  };
  // Amount is the extended unit price, before any line discount or VAT.
  // Discounts and tax stay in the checkout totals below the cart, where the
  // shared POS pricing engine already calculates them correctly.
  const lineAmountMinor = line.unitPriceMinor * line.quantity;
  const imageUrl = api.resolveImage(line.imageUrl);
  // One fils is a common unconfigured placeholder in BHD catalogue imports.
  const needsPrice = line.unitPriceMinor <= (currencyScale === 3 ? 1 : 0);
  const ar = locale === 'ar';
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2"
      data-testid={`pos-cart-line-${line.sku}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--background)]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={line.description} className="h-full w-full object-cover" loading="lazy" />
          ) : <Icon name="package" size={24} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{line.description}</div>
          <div className="font-mono text-xs text-[var(--muted)]">{line.sku}</div>
          <div className="mt-1 text-xs font-medium tabular-nums">{money(line.unitPriceMinor)}</div>
          <div className="oryx-pos__line-quick">
            <div className="oryx-pos__quantity-stepper" role="group" aria-label={ar ? 'تعديل الكمية' : 'Change quantity'}>
              <button type="button" aria-label={ar ? 'تقليل الكمية' : 'Decrease quantity'}
                data-testid={`pos-decrement-${line.sku}`} disabled={line.quantity <= 1}
                onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })}>−</button>
              <span className="tabular-nums" data-testid={`pos-quantity-label-${line.sku}`}>{line.quantity}</span>
              <button type="button" aria-label={ar ? 'زيادة الكمية' : 'Increase quantity'}
                data-testid={`pos-increment-${line.sku}`}
                onClick={() => onChange({ quantity: line.quantity + 1 })}>+</button>
            </div>
            <strong className="tabular-nums" data-testid={`pos-line-amount-${line.sku}`}>{money(lineAmountMinor)}</strong>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded} aria-label={ar ? 'تفاصيل المنتج' : 'Edit item details'}
          data-testid={`pos-edit-line-${line.sku}`}>
          <Icon name="edit" size={14} />
        </Button>
        <Button size="sm" variant="ghost" aria-label={`${t('common.delete')} ${line.description}`}
          onClick={onRemove} data-testid={`pos-remove-${line.sku}`}>
          <Icon name="close" size={14} />
        </Button>
      </div>
      {needsPrice ? (
        <p className="m-0 rounded-lg border border-[var(--warning)] p-2 text-xs" role="alert">
          {ar ? 'المنتج بدون سعر بيع. أدخل السعر قبل إتمام العملية.' : 'Product has no sales price. Enter a price to check out.'}
        </p>
      ) : null}
      {expanded ? <>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>{t('erp.inventory.quantity')}</span>
          <input className="oryx-input text-center tabular-nums" type="number" min={1} step={1}
            value={line.quantity}
            onChange={e => onChange({ quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
            data-testid={`pos-qty-${line.sku}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>{t('erp.sales.unitPrice')}</span>
          <input className="oryx-input text-end tabular-nums" inputMode="decimal" type="text"
            value={priceDraft} aria-invalid={priceError || needsPrice}
            onChange={e => { setPriceDraft(e.target.value); setPriceError(false); }}
            onBlur={onPriceCommit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            data-testid={`pos-price-${line.sku}`} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>{t('erp.sales.discount')} (BHD)</span>
          <input className="oryx-input text-center tabular-nums" inputMode="decimal" type="number"
            min={0} step={currencyScale === 3 ? '0.001' : '0.01'}
            value={line.discountAmountMinor / (10 ** currencyScale)}
            onChange={e => {
              const next = Number(e.target.value);
              onChange({ discountAmountMinor: Math.max(0, Math.round((Number.isFinite(next) ? next : 0) * (10 ** currencyScale))) });
            }}
            data-testid={`pos-discount-${line.sku}`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" aria-label={ar ? 'خصم سريع' : 'Quick discount'}>
          {[0, 1, 2, 5].map(amount => (
            <button key={amount} type="button"
              className={`oryx-btn oryx-btn--sm ${line.discountAmountMinor === amount * (10 ** currencyScale) ? 'oryx-btn--primary' : ''}`}
              onClick={() => onChange({ discountAmountMinor: amount * (10 ** currencyScale) })}
              data-testid={`pos-discount-preset-${amount}-${line.sku}`}>{amount} BHD</button>
          ))}
        </div>
        <span className="text-xs text-[var(--muted)]">
          {ar ? 'ضريبة تلقائية' : 'Auto tax'}: {(line.taxPercentBp / 100).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm font-bold">
        <span>{ar ? 'المبلغ قبل الخصم والضريبة' : 'Amount before discount & tax'}</span>
        <span className="tabular-nums" data-testid={`pos-line-total-${line.sku}`}>{money(lineAmountMinor)}</span>
      </div>
      </> : null}
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
  const discountAmountMinor = toMinorInput(line.discountAmount, currency);
  const taxPercentBp = Math.round((Number(line.taxPercent) || 0) * 100);
  const lineSubtotalMinor = lineAmountMinor(quantity, unitPriceMinor);
  const discountMinor = Math.min(lineSubtotalMinor, Math.max(0, discountAmountMinor));
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
  onProductCreated,
  onTaxCreated,
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
  /** Reload the product list after one is created from a line's picker. */
  onProductCreated?: () => Promise<void> | void;
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
}) {
  const { t, locale } = useUi();
  const scale = currencyScaleOf(currency ?? 'BHD');

  const applyProduct = (i: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    // A product carries its own rate; if it is not in the saved tax list, keep
    // the numeric value and clear the selection rather than silently switching
    // the line to a different tax.
    const matched = product
      ? taxOptions.find((o) => o.value === String(product.taxRateBp))
      : undefined;
    const next = [...lines];
    next[i] = {
      ...next[i],
      productId,
      description: product ? product.nameEn : next[i].description,
      unitPrice: product
        ? minorToInput(product.salesPriceMinor, currency ?? 'BHD')
        : next[i].unitPrice,
      taxPercent: product ? String(product.taxRateBp / 100) : next[i].taxPercent,
      taxId: product ? (matched ? matched.value : '') : next[i].taxId,
    };
    setLines(next);
  };

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
        <span className="text-center">{t('erp.sales.discount')} ({currency ?? 'BHD'})</span>
        <span className="text-center">{t('erp.sales.form.taxes')}</span>
        <span className="text-end">{t('erp.sales.form.amount')}</span>
        <span />
      </div>
      {lines.map((line, i) => (
        <div key={i} className="oryx-doc-form__grid">
          <div className="flex flex-col gap-1">
            <EntityPicker
              value={line.productId || null}
              options={products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.nameEn}` }))}
              onChange={(v) => applyProduct(i, v ?? '')}
              placeholder={t('erp.inventory.product')}
              emptyLabel={t('common.none')}
              testId={`${testIdPrefix}-product-${i}`}
              createLabel={t('erp.inventory.newProduct')}
              reloadOptions={onProductCreated}
              renderCreate={({ onClose, onSaved }) => (
                <ProductModal
                  open
                  onClose={onClose}
                  onCreated={() => { /* selection is handled by onSaved */ }}
                  onSaved={(saved) => void onSaved(saved.id)}
                />
              )}
            />
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
            className="oryx-input text-end min-w-0 w-full tabular-nums"
            dir="ltr"
            inputMode="decimal"
            placeholder="0.000"
            value={line.unitPrice}
            onChange={(e) => update(i, { unitPrice: e.target.value })}
            data-testid={`${testIdPrefix}-price-${i}`}
          />
          <input
            className="oryx-input text-end min-w-0 w-full tabular-nums"
            dir="ltr"
            inputMode="decimal"
            placeholder="0.000"
            value={line.discountAmount}
            onChange={(e) => update(i, { discountAmount: e.target.value })}
            data-testid={`${testIdPrefix}-discount-${i}`}
          />
          <TaxPicker
            value={line.taxId || (Number(line.taxPercent) > 0
              ? String(Math.round(Number(line.taxPercent) * 100))
              : null)}
            options={[
              ...taxOptions,
              ...(Number(line.taxPercent) > 0 && !taxOptions.some((option) =>
                option.value === String(Math.round(Number(line.taxPercent) * 100)))
                ? [{
                    value: String(Math.round(Number(line.taxPercent) * 100)),
                    label: `${line.taxPercent}%`,
                    hint: locale === 'ar' ? 'ضريبة الصنف' : 'Product tax rate',
                  }]
                : []),
            ]}
            onChange={(v) => {
              const chosen = taxOptions.find((o) => o.value === v);
              const chosenRate = chosen ? chosen.label.replace(/[^\d.]/g, '') : v ? String(Number(v) / 100) : '0';
              // Choosing "None" must zero the line's rate, not leave the
              // previous one in place: the picker's empty option means "without
              // tax", and keeping the old percentage silently charged VAT on a
              // line the operator had just exempted.
              update(i, {
                taxId: v ?? '',
                taxPercent: chosenRate,
              });
            }}
            scope="SALES"
            placeholder={t('erp.sales.form.taxes')}
            emptyLabel={locale === 'ar' ? 'بدون ضريبة' : 'No tax'}
            testId={`${testIdPrefix}-tax-${i}`}
            onCreated={onTaxCreated}
          />
          <span
            className="text-end tabular-nums text-[12.5px] font-semibold"
            data-testid={`${testIdPrefix}-line-amount-${i}`}
          >
            {money((totals.priced[i]?.lineSubtotalMinor ?? 0) - (totals.priced[i]?.discountMinor ?? 0), currency)}
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
  returnInvoiceOptions,
  returnInvoiceLoading,
  onReturnInvoiceChange,
  onReturnCustomerChange,
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
  onProductCreated,
  onWarehouseCreated,
  onTaxCreated,
}: {
  open: boolean;
  title: string;
  initialDocument?: SalesDocumentDto | null;
  relatedInvoiceId?: string;
  returnInvoiceOptions?: SearchableOption[];
  returnInvoiceLoading?: boolean;
  onReturnInvoiceChange?: (id: string | null) => void;
  onReturnCustomerChange?: (id: string) => void;
  allowDraft?: boolean;
  customers: CustomerDto[];
  products: Array<{ id: string; sku: string; nameEn: string; salesPriceMinor: number; taxRateBp: number }>;
  warehouses: WarehouseDto[];
  taxOptions: SearchableOption[];
  showWarehouse?: boolean;
  showRestock?: boolean;
  /** Reload the customer list after one is created from the picker. */
  onCustomerCreated?: () => Promise<void> | void;
  /** Reload the product list after one is created from a line picker. */
  onProductCreated?: () => Promise<void> | void;
  /** Reload the warehouse list after one is created from the picker. */
  onWarehouseCreated?: () => Promise<void> | void;
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
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
  /** Resolves with the saved document's id so files chosen here can be linked. */
  onSubmit: (payload: Record<string, unknown>) => Promise<string | void>;
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
  const [refundMethod, setRefundMethod] = useState('CREDIT_ACCOUNT');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentMethodCode, setPaymentMethodCode] = useState('CASH');
  const [paymentOptions, setPaymentOptions] = useState<CompanyPaymentMethodSetting[]>(DEFAULT_COMPANY_PAYMENT_METHODS);
  const [salespersonName, setSalespersonName] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pending, setPending] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPending([]);
    setDocumentDate(initialDocument?.invoiceDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setCustomerId(initialDocument?.customerId ?? '');
    setWarehouseId(initialDocument?.warehouseId ?? '');
    setDueDate(initialDocument?.dueDate?.slice(0, 10) ?? '');
    setNotes(reasonField ? '' : initialDocument?.notes ?? '');
    setPaymentMethod(initialDocument?.paymentMethod ?? 'CASH');
    setPaymentMethodCode(
      (initialDocument as (SalesDocumentDto & { paymentMethodCode?: string | null }) | null)?.paymentMethodCode
        ?? initialDocument?.paymentMethod ?? 'CASH',
    );
    setPaymentOptions(DEFAULT_COMPANY_PAYMENT_METHODS);
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
            discountAmount: minorToInput(Number(line.discountMinor ?? 0), initialDocument.currency),
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
    void api.companySettings(companyId).then((res) => {
      if (cancelled) return;
      const methods = res.sections.sales.paymentMethods ?? DEFAULT_COMPANY_PAYMENT_METHODS;
      setPaymentOptions(methods);
    }).catch(() => {
      // The catalogue defaults preserve the form if settings cannot be loaded.
    });
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
    if (reasonField && onReturnInvoiceChange && !relatedInvoiceId) {
      setError(locale === 'ar' ? 'يجب اختيار فاتورة العميل الأصلية قبل الإرجاع.' : 'Select the original customer invoice before returning items.');
      return;
    }
    if (dueDateField === 'dueDate' && paymentMethod === 'CREDIT' && !dueDate) {
      setError(locale === 'ar' ? 'تاريخ الاستحقاق مطلوب للبيع الآجل.' : 'A due date is required for credit sales.');
      return;
    }
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
        ...(reasonField ? { refundMethod } : {}),
        ...(settlement ? { paymentMethod, paymentMethodCode } : {}),
        ...(settlement && salespersonName.trim() ? { salespersonName: salespersonName.trim() } : {}),
        ...(settlement && paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
        ...(!reasonField && notes.trim() ? { notes: notes.trim() } : {}),
        restockInventory: showRestock ? restock : undefined,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitPriceMinor: toMinorInput(l.unitPrice, currency),
          discountAmountMinor: toMinorInput(l.discountAmount, currency),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      };

      const savedId = await onSubmit(payload);
      // Files chosen in this form are linked once the document exists, so the
      // operator never has to reopen it to attach the signed paperwork.
      if (savedId && pending.length) {
        await uploadPendingAttachments(documentEntityType(testIdPrefix), savedId, pending);
      }
      onClose();
      setLines([emptyLine(company ? String(company.defaultTaxRateBp / 100) : '10')]);
      setCustomerId('');
      setDueDate('');
      setNotes('');
      setReason('');
      setSalespersonName('');
      setPaymentReference('');
      setPaymentMethod('CASH');
      setPaymentMethodCode('CASH');
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
      size="full"
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

      <nav className="oryx-doc-form__section-tabs" aria-label={locale === 'ar' ? 'أقسام المستند' : 'Document sections'} data-testid={`${testIdPrefix}-section-tabs`}>
        {([
          ['document-info', t('erp.sales.form.documentInfo')],
          ['customer-info', t('erp.sales.form.customerInfo')],
          ['items', t('erp.sales.form.items')],
          ['summary', t('erp.sales.form.summary')],
        ] as const).map(([section, label]) => (
          <button key={section} type="button"
            className="oryx-doc-form__section-tab"
            data-testid={`${testIdPrefix}-tab-${section}`}
            onClick={() => document.querySelector(`[data-testid="${testIdPrefix}-${section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {label}
          </button>
        ))}
      </nav>

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
            {dueDateField && (dueDateField === 'validUntil' || paymentMethod === 'CREDIT' || Boolean(dueDate)) ? (
              <Field label={dueDateField === 'dueDate' ? (locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due date') : t('erp.sales.form.expirationDate')}>
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
                  value={paymentMethodCode}
                  onChange={(e) => {
                    const method = paymentOptions.find((item) => item.code === e.target.value);
                    setPaymentMethodCode(e.target.value);
                    setPaymentMethod(method?.accountingMethod ?? 'CASH');
                  }}
                  data-testid={`${testIdPrefix}-payment-method`}
                >
                  {paymentOptions.filter((m) => m.isActive && m.useInInvoices &&
                    (dueDateField === 'dueDate' || m.accountingMethod !== 'CREDIT')).map((m) => (
                    <option key={m.code} value={m.code}>
                      {locale === 'ar' ? m.nameAr : m.nameEn}
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
                  onChange={(v) => {
                    setCustomerId(v ?? '');
                    onReturnCustomerChange?.(v ?? '');
                  }}
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
            {reasonField && onReturnInvoiceChange ? (
              <div className="sm:col-span-2">
                <Field label={t('erp.sales.invoiceNumber')} required>
                  <SearchableSelect
                    value={relatedInvoiceId ?? null}
                    options={returnInvoiceOptions ?? []}
                    onChange={onReturnInvoiceChange}
                    placeholder={locale === 'ar' ? 'اختر فاتورة العميل للإرجاع' : 'Select this customer’s invoice'}
                    emptyLabel={t('common.none')}
                    loading={returnInvoiceLoading}
                    testId="return-invoice-picker"
                  />
                </Field>
              </div>
            ) : null}
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
            onTaxCreated={onTaxCreated}
            testIdPrefix={testIdPrefix}
            currency={currency}
            roundingMode={company?.roundingMode ?? 'NONE'}
            defaultTaxPercent={company ? String(company.defaultTaxRateBp / 100) : '10'}
            onProductCreated={onProductCreated}
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
              <EntityPicker
                value={warehouseId || null}
                options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.nameEn}` }))}
                onChange={(v) => setWarehouseId(v ?? '')}
                placeholder={t('common.select')}
                emptyLabel={t('common.none')}
                testId={`${testIdPrefix}-warehouse`}
                createLabel={t('erp.inventory.newWarehouse')}
                reloadOptions={onWarehouseCreated}
                renderCreate={({ onClose, onSaved }) => (
                  <WarehouseModal
                    open
                    onClose={onClose}
                    onCreated={() => { /* selection is handled by onSaved */ }}
                    onSaved={(saved) => void onSaved(saved.id)}
                  />
                )}
              />
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
          {reasonField ? (
            <Field label={t('erp.sales.refundMethod')} hint={t('erp.sales.refundMethodHint')}>
              <select
                className="oryx-input"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                data-testid={`${testIdPrefix}-refund-method`}
              >
                <option value="CREDIT_ACCOUNT">{t('erp.sales.refundCreditAccount')}</option>
                <option value="CASH">{t('erp.sales.refundCash')}</option>
                <option value="BANK_TRANSFER">{t('erp.sales.refundBankTransfer')}</option>
                <option value="CARD">{t('erp.sales.refundCard')}</option>
              </select>
            </Field>
          ) : null}
          <Field label={t('common.notes')}>
            <textarea
              className="oryx-input oryx-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid={`${testIdPrefix}-notes`}
            />
          </Field>
        </div>
      </section>
      {!initialDocument ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <PendingAttachments files={pending} onChange={setPending} canManage />
        </div>
      ) : null}
    </Modal>
  );
}

/** The attachment register that matches each sales document form. */
function documentEntityType(prefix: string): 'SALES_INVOICE' | 'QUOTATION' | 'CREDIT_NOTE' {
  if (prefix === 'credit-note') return 'CREDIT_NOTE';
  if (prefix === 'quotation') return 'QUOTATION';
  return 'SALES_INVOICE';
}

