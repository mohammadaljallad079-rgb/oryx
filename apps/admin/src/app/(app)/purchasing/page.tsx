'use client';

import { Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync, useDebounced } from '@/lib/hooks';
import { minorToInput, money, toMinorInput, toQuantityInput, todayIso } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { DocumentActions } from '@/components/document-actions';
import { AttachmentsPanel, PendingAttachments, uploadPendingAttachments } from '@/components/document-print';
import { RecordPreview } from '@/components/record-preview';
import { ModuleDashboard } from '@/components/module-dashboard';
import { TabDeepLink } from '@/components/tab-deep-link';
import { EntityPicker } from '@/components/inline-create';
import { ProductModal, SupplierModal, WarehouseModal } from '@/components/entity-modals';
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
  TableShell,
  type SearchableOption,
} from '@/components/ui';
import type { PurchaseDocumentDto, RequisitionDto, SupplierDto, WarehouseDto } from '@oryx/shared';

type Tab = 'dashboard' | 'orders' | 'requisitions' | 'receipts' | 'invoices' | 'returns' | 'suppliers';

interface LineDraft {
  productId: string;
  description: string;
  quantity: string;
  unitCost: string;
  /** The chosen tax row, or empty when the product's rate is not in the list. */
  taxId: string;
  taxPercent: string;
}

const emptyLine = (taxPercent = '10'): LineDraft => ({ productId: '', description: '', quantity: '1', unitCost: '0.00', taxId: '', taxPercent });

/**
 * The tenant's saved purchase-applicable taxes as dropdown options. `value` is
 * the rate in basis points, so a product's own rate can be matched directly.
 * `reload` refreshes the list after a rate is created from a line's picker.
 */
function useTaxOptions(companyId: string | null | undefined): {
  options: SearchableOption[];
  reload: () => Promise<void>;
} {
  const taxes = useAsync(
    () => api.taxes({ companyId: companyId ?? undefined, scope: 'PURCHASES' }),
    [companyId],
  );
  return {
    options: (taxes.data?.items ?? []).map((tax) => ({
      value: String(tax.rateBp),
      label: `${tax.rateBp / 100}%`,
      hint: tax.nameEn,
    })),
    reload: taxes.reload,
  };
}

const TAB_KEYS = ['dashboard', 'orders', 'requisitions', 'receipts', 'invoices', 'returns', 'suppliers'] as const;

export default function PurchasingPage() {
  return (
    <Suspense fallback={<Skeleton height={200} />}>
      <PurchasingInner />
    </Suspense>
  );
}

function PurchasingInner() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'dashboard', label: t('erp.purchasing.dashboard') },
    { key: 'orders', label: t('erp.purchasing.orders') },
    { key: 'requisitions', label: t('erp.purchasing.requisitions') },
    { key: 'receipts', label: t('erp.purchasing.receipts') },
    { key: 'invoices', label: t('erp.purchasing.invoices') },
    { key: 'returns', label: t('erp.purchasing.returns') },
    { key: 'suppliers', label: t('erp.purchasing.suppliers') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="purchasing-page">
      <TabDeepLink valid={TAB_KEYS} onSelect={setTab} />
      <SectionHeader
        title={t('nav.purchasing_procurement')}
        subtitle={t('erp.purchasing.subtitle')}
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
            data-testid={`purchasing-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' ? <ModuleDashboard moduleKey="purchasing_procurement" /> : null}
      {tab === 'orders' ? <OrdersTab canManage={can('erp.purchasing.order.manage')} /> : null}
      {tab === 'requisitions' ? <RequisitionsTab canManage={can('erp.purchasing.requisition.manage')} /> : null}
      {tab === 'receipts' ? <ReceiptsTab canManage={can('erp.purchasing.receipt.manage')} /> : null}
      {tab === 'invoices' ? <InvoicesTab canManage={can('erp.purchasing.invoice.manage')} /> : null}
      {tab === 'returns' ? <ReturnsTab canManage={can('erp.purchasing.return.manage')} /> : null}
      {tab === 'suppliers' ? <SuppliersTab canManage={can('erp.purchasing.supplier.manage')} /> : null}
    </div>
  );
}

function SuppliersTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [preview, setPreview] = useState<SupplierDto | null>(null);
  const list = useAsync(() => api.suppliers({ search: search || undefined }), [search]);

  const setStatus = async (row: SupplierDto, next: boolean) => {
    if (!window.confirm(t('erp.sales.statusChangeConfirm'))) return;
    await api.updateSupplier(row.id, { isActive: next });
    await list.reload();
  };

  const onDelete = async (row: SupplierDto) => {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    try {
      await api.deleteSupplier(row.id);
      await list.reload();
    } catch (err) {
      const key = err instanceof ApiError && err.code === 'resource.conflict' ? 'erp.purchasing.deleteSupplierBlocked' : 'common.error';
      window.alert(t(key));
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="supplier-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-supplier">
            <Icon name="plus" size={16} />
            {t('erp.purchasing.newSupplier')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.purchasing.emptySuppliers')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.sales.phone')}</th>
              <th>{t('erp.sales.paymentTerms')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((s: SupplierDto) => (
              <tr key={s.id} data-testid={`supplier-row-${s.code}`}>
                <td className="font-mono text-[12px]">{s.code}</td>
                <td>
                  <span className="block font-semibold">{s.nameEn}</span>
                  <span className="oryx-faint block text-[11px]">{s.nameAr}</span>
                </td>
                <td className="text-[12.5px]">{s.phone ?? '—'}</td>
                <td className="text-[12.5px]">{s.paymentTermsDays}</td>
                <td><Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t('print.preview')} ${s.code}`}
                      onClick={() => setPreview(s)}
                      data-testid={`supplier-preview-${s.code}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" aria-label={`${t('common.edit')} ${s.code}`} onClick={() => { setEditing(s); setOpen(true); }} data-testid={`supplier-edit-${s.code}`}>
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${s.isActive ? t('common.deactivate') : t('common.reactivate')} ${s.code}`}
                          onClick={() => void setStatus(s, !s.isActive)}
                          data-testid={`supplier-toggle-${s.code}`}
                        >
                          <Icon name={s.isActive ? 'close' : 'check'} size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={`${t('common.delete')} ${s.code}`}
                          onClick={() => void onDelete(s)}
                          data-testid={`supplier-delete-${s.code}`}
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </>
                    ) : null}
                    <DocumentActions
                      sourceType="Supplier"
                      sourceId={s.id}
                      type="SUPPLIER_STATEMENT"
                      permissions={['erp.purchasing.read', 'erp.accounting.read']}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <SupplierModal
        open={open}
        supplier={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onCreated={list.reload}
      />
      {preview ? (
        <RecordPreview
          open
          title={`${preview.code} — ${preview.nameEn || preview.nameAr}`}
          subtitle={preview.nameAr}
          onClose={() => setPreview(null)}
          fields={[
            { label: t('common.code'), value: preview.code },
            { label: `${t('common.name')} (EN)`, value: preview.nameEn || '—' },
            { label: `${t('common.name')} (AR)`, value: preview.nameAr || '—' },
            { label: t('common.type'), value: preview.kind },
            { label: t('erp.sales.contactPerson'), value: preview.contactPerson ?? '—' },
            { label: t('erp.sales.phone'), value: preview.phone ?? '—' },
            { label: t('common.email'), value: preview.email ?? '—' },
            { label: t('erp.sales.taxNumber'), value: preview.taxNumber ?? '—' },
            { label: t('common.address'), value: preview.addressLine ?? '—', wide: true },
            { label: t('erp.sales.paymentTerms'), value: String(preview.paymentTermsDays) },
            { label: t('common.status'), value: <Badge tone={preview.isActive ? 'success' : 'neutral'}>{preview.isActive ? t('common.active') : t('common.inactive')}</Badge> },
            { label: t('common.notes'), value: preview.notes ?? '—', wide: true },
          ]}
          attachment={{ entityType: 'SUPPLIER', entityId: preview.id, canManage }}
        />
      ) : null}
    </Card>
  );
}


/** Shared searchable filter controls for purchasing registers.
 * The query is sent to the API, not applied only to the visible page.
 */
function PurchasingListFilters({
  search, onSearch, status, onStatus, statuses,
}: {
  search: string;
  onSearch: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  statuses: string[];
}) {
  const { t, locale } = useUi();
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] px-4 py-3"
      data-testid="purchasing-list-filters">
      <label className="min-w-[220px] flex-[2]">
        <span className="oryx-label">{t('common.search')}</span>
        <input className="oryx-input" type="search" value={search}
          placeholder={locale === 'ar' ? 'ابحث بالرقم، المورد، الكود، الملاحظات أو الأصناف' : 'Search number, supplier, code, notes or items'}
          onChange={(event) => onSearch(event.target.value)}
          data-testid="purchasing-list-search" />
      </label>
      <label className="min-w-[155px] flex-1">
        <span className="oryx-label">{t('common.status')}</span>
        <select className="oryx-select" value={status}
          onChange={(event) => onStatus(event.target.value)}
          data-testid="purchasing-list-status">
          <option value="">{locale === 'ar' ? 'كل الحالات' : 'All statuses'}</option>
          {Array.from(new Set([...statuses, ...(status ? [status] : [])]))
            .filter(Boolean).sort().map((value) => (
              <option value={value} key={value}>{value}</option>
            ))}
        </select>
      </label>
      {(search || status) ? (
        <Button size="sm" variant="ghost" onClick={() => { onSearch(''); onStatus(''); }}>
          {locale === 'ar' ? 'مسح الفلاتر' : 'Clear filters'}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One preview for the four purchasing documents, which share
 * `PurchaseDocumentDto`. The entity type decides which attachment register the
 * panel reads, so the paperclip and the preview always agree.
 */
function PurchaseDocumentPreview({
  document: doc,
  entityType,
  canManage,
  onClose,
}: {
  document: PurchaseDocumentDto;
  entityType: 'PURCHASE_ORDER' | 'GOODS_RECEIPT' | 'SUPPLIER_INVOICE' | 'PURCHASE_RETURN';
  canManage: boolean;
  onClose: () => void;
}) {
  const { t } = useUi();
  const number =
    doc.orderNumber ?? doc.receiptNumber ?? doc.invoiceNumber ?? doc.returnNumber ?? doc.id;
  const date =
    doc.orderDate ?? doc.receivedAt ?? doc.invoiceDate ?? doc.returnDate ?? null;
  return (
    <RecordPreview
      open
      title={number}
      subtitle={doc.supplierNameEn ?? doc.supplierNameAr}
      onClose={onClose}
      fields={[
        { label: t('erp.purchasing.supplier'), value: doc.supplierNameEn ?? doc.supplierNameAr ?? '—' },
        { label: t('common.date'), value: date?.slice(0, 10) ?? '—' },
        { label: t('common.status'), value: <StatusBadge status={doc.status} label={doc.status} /> },
        { label: t('erp.sales.total'), value: money(doc.totalMinor, doc.currency) },
        { label: t('erp.sales.tax'), value: money(doc.taxMinor, doc.currency) },
        { label: t('erp.sales.pos.subtotal'), value: money(doc.subtotalMinor, doc.currency) },
        ...(doc.outstandingMinor !== undefined
          ? [{ label: t('erp.sales.outstanding'), value: money(doc.outstandingMinor, doc.currency) }]
          : []),
        { label: t('erp.accounting.lines'), value: String(doc.lines.length) },
        { label: t('common.notes'), value: doc.notes ?? doc.reason ?? '—', wide: true },
      ]}
      attachment={{ entityType, entityId: doc.id, canManage }}
    />
  );
}

// ---------------------------------------------------------------- requisitions

function RequisitionsTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<RequisitionDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const list = useAsync(() => api.requisitions({ search: debouncedSearch || undefined, status: status || undefined }), [debouncedSearch, status]);
  const suppliers = useAsync(() => api.suppliers(), []);
  const products = useAsync(() => api.products(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.purchasing.requisitions')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-requisition">
            <Icon name="plus" size={16} />
            {t('erp.purchasing.newRequisition')}
          </Button>
        ) : null}
      </div>
      <PurchasingListFilters
        search={search} onSearch={setSearch} status={status} onStatus={setStatus}
        statuses={(list.data?.items ?? []).map((item) => item.status)}
      />
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.purchasing.emptyRequisitions')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.purchasing.requisitionNumber')}</th>
              <th>{t('erp.accounting.lines')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((r: RequisitionDto) => (
              <tr key={r.id} data-testid={`requisition-row-${r.requisitionNumber}`}>
                <td className="font-mono text-[12px]">{r.requisitionNumber}</td>
                <td className="tabular-nums text-[12.5px]">{r.lines.length}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t('print.preview')} ${r.requisitionNumber}`}
                    onClick={() => setPreview(r)}
                    data-testid={`requisition-preview-${r.requisitionNumber}`}
                  >
                    <Icon name="eye" size={14} />
                  </Button>
                  {canManage && r.status === 'DRAFT' ? (
                    <Button
                      size="sm"
                      data-testid={`approve-requisition-${r.requisitionNumber}`}
                      onClick={async () => {
                        await api.approveRequisition(r.id);
                        await list.reload();
                      }}
                    >
                      {t('erp.purchasing.approve')}
                    </Button>
                  ) : null}
                  {canManage && r.status === 'APPROVED' ? (
                    <Button
                      size="sm"
                      data-testid={`convert-requisition-${r.requisitionNumber}`}
                      onClick={async () => {
                        const supplierId = r.supplierId ?? suppliers.data?.items[0]?.id;
                        if (!supplierId) return;
                        await api.convertRequisition(r.id, supplierId);
                        await list.reload();
                      }}
                    >
                      {t('erp.purchasing.convert')}
                    </Button>
                  ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <RequisitionModal
        open={open}
        suppliers={suppliers.data?.items ?? []}
        onSupplierCreated={suppliers.reload}
        products={products.data?.items ?? []}
        onProductCreated={products.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        onClose={() => setOpen(false)}
        onCreated={list.reload}
      />
      {preview ? (
        <RecordPreview
          open
          title={preview.requisitionNumber}
          onClose={() => setPreview(null)}
          fields={[
            { label: t('erp.purchasing.requisitionNumber'), value: preview.requisitionNumber },
            { label: t('common.status'), value: <StatusBadge status={preview.status} label={preview.status} /> },
            { label: t('erp.purchasing.supplier'), value: preview.supplierNameEn ?? preview.supplierNameAr ?? '—' },
            { label: t('erp.purchasing.neededBy'), value: preview.neededBy?.slice(0, 10) ?? '—' },
            { label: t('erp.accounting.lines'), value: String(preview.lines.length) },
            { label: t('common.date'), value: preview.createdAt.slice(0, 10) },
            { label: t('common.notes'), value: preview.notes ?? '—', wide: true },
          ]}
          attachment={{ entityType: 'PURCHASE_REQUISITION', entityId: preview.id, canManage }}
        />
      ) : null}
    </Card>
  );
}

function RequisitionModal({
  taxOptions,
  onTaxCreated,
  open,
  suppliers,
  products,
  onProductCreated,
  onClose,
  onCreated,
  onSupplierCreated,
}: {
  open: boolean;
  suppliers: SupplierDto[];
  products: Array<{ id: string; sku: string; nameEn: string; costPriceMinor: number }>;
  onProductCreated?: () => Promise<void> | void;
  taxOptions: SearchableOption[];
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
  onClose: () => void;
  onCreated: () => Promise<void>;
  /** Reload the supplier list after one is created from the picker. */
  onSupplierCreated?: () => Promise<void> | void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pending, setPending] = useState<File[]>([]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createRequisition({
        supplierId: supplierId || undefined,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          estimatedUnitCostMinor: toMinorInput(l.unitCost),
        })),
      });
      if (pending.length) await uploadPendingAttachments('PURCHASE_REQUISITION', created.id, pending);
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
      title={t('erp.purchasing.newRequisition')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-requisition">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <Field label={t('erp.purchasing.supplier')}>
        <EntityPicker
          value={supplierId || null}
          options={suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.nameEn}`, hint: s.phone ?? undefined }))}
          onChange={(v) => setSupplierId(v ?? '')}
          placeholder={t('common.select')}
          testId="purchase-supplier"
          createLabel={t('erp.purchasing.newSupplier')}
          reloadOptions={onSupplierCreated}
          renderCreate={({ onClose, onSaved }) => (
            <SupplierModal
              open
              supplier={null}
              onClose={onClose}
              onCreated={() => { /* selection is handled by onSaved */ }}
              onSaved={(saved) => void onSaved(saved.id)}
            />
          )}
        />
      </Field>
      <div className="mt-4">
        <CostLineEditor lines={lines} setLines={setLines} products={products} taxOptions={taxOptions} onTaxCreated={onTaxCreated} testIdPrefix="requisition-line" onProductCreated={onProductCreated} costLabel={t('erp.inventory.estimatedCost')} />
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <PendingAttachments files={pending} onChange={setPending} canManage />
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------- orders

function OrdersTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PurchaseDocumentDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const list = useAsync(() => api.purchaseOrders({ search: debouncedSearch || undefined, status: status || undefined }), [debouncedSearch, status]);
  const suppliers = useAsync(() => api.suppliers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.purchasing.orders')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-purchase-order">
            <Icon name="plus" size={16} />
            {t('erp.purchasing.newOrder')}
          </Button>
        ) : null}
      </div>
      <PurchasingListFilters
        search={search} onSearch={setSearch} status={status} onStatus={setStatus}
        statuses={(list.data?.items ?? []).map((item) => item.status)}
      />
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.purchasing.emptyOrders')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.purchasing.orderNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.purchasing.supplier')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((o: PurchaseDocumentDto) => (
              <tr key={o.id} data-testid={`purchase-order-row-${o.orderNumber}`}>
                <td className="font-mono text-[12px]">{o.orderNumber}</td>
                <td className="text-[12.5px]">{o.orderDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{o.supplierNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(o.totalMinor, o.currency)}</td>
                <td><StatusBadge status={o.status} label={o.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t('print.preview')} ${o.orderNumber}`}
                      onClick={() => setPreview(o)}
                      data-testid={`purchase-order-preview-${o.orderNumber}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                    {canManage && o.status === 'DRAFT' ? (
                      <Button
                        size="sm"
                        data-testid={`approve-order-${o.orderNumber}`}
                        onClick={async () => {
                          await api.approvePurchaseOrder(o.id);
                          await list.reload();
                        }}
                      >
                        {t('erp.purchasing.approve')}
                      </Button>
                    ) : null}
                    <DocumentActions
                      sourceType="PurchaseOrder"
                      sourceId={o.id}
                      type="PURCHASE_ORDER"
                      permissions={['erp.purchasing.read']}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <PurchaseOrderModal
        open={open}
        suppliers={suppliers.data?.items ?? []}
        onSupplierCreated={suppliers.reload}
        products={products.data?.items ?? []}
        onProductCreated={products.reload}
        warehouses={warehouses.data?.items ?? []}
        onWarehouseCreated={warehouses.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        onClose={() => setOpen(false)}
        onCreated={list.reload}
      />
      {preview ? (
        <PurchaseDocumentPreview document={preview} entityType="PURCHASE_ORDER" canManage={canManage} onClose={() => setPreview(null)} />
      ) : null}
    </Card>
  );
}

function PurchaseOrderModal({
  taxOptions,
  onTaxCreated,
  open,
  suppliers,
  products,
  onProductCreated,
  warehouses,
  onWarehouseCreated,
  onClose,
  onCreated,
  onSupplierCreated,
}: {
  open: boolean;
  suppliers: SupplierDto[];
  products: Array<{ id: string; sku: string; nameEn: string; costPriceMinor: number }>;
  warehouses: WarehouseDto[];
  onProductCreated?: () => Promise<void> | void;
  onWarehouseCreated?: () => Promise<void> | void;
  taxOptions: SearchableOption[];
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
  onClose: () => void;
  onCreated: () => Promise<void>;
  /** Reload the supplier list after one is created from the picker. */
  onSupplierCreated?: () => Promise<void> | void;
}) {
  const { t } = useUi();
  const { companyId } = useAuth();
  const branches = useAsync(() => companyId ? api.listBranches(companyId, { pageSize: 100 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 }), [companyId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDate, setExpectedDate] = useState('');
  const [currency, setCurrency] = useState('BHD');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const { canAny } = useAuth();
  const canAttach = canAny('erp.purchasing.order.manage', 'erp.purchasing.write');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createPurchaseOrder({
        supplierId,
        branchId: branchId || undefined,
        warehouseId: warehouseId || undefined,
        approve: true,
        orderDate: new Date(orderDate).toISOString(),
        ...(expectedDate ? { expectedDate: new Date(expectedDate).toISOString() } : {}),
        currency,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitCostMinor: toMinorInput(l.unitCost),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      });
      if (pending.length) await uploadPendingAttachments('PURCHASE_ORDER', created.id, pending);
      await onCreated();
      // Keep the modal open after the first save so more documents can be
      // added to the new order from the same form.
      setSavedId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      size="full"
      title={t('erp.purchasing.newOrder')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !supplierId} onClick={submit} data-testid="save-purchase-order">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.purchasing.supplier')} required>
          <EntityPicker
            value={supplierId || null}
            options={suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.nameEn}`, hint: s.phone ?? undefined }))}
            onChange={(v) => setSupplierId(v ?? '')}
            placeholder={t('common.select')}
            testId="purchase-supplier"
            createLabel={t('erp.purchasing.newSupplier')}
            reloadOptions={onSupplierCreated}
            renderCreate={({ onClose, onSaved }) => (
              <SupplierModal
                open
                supplier={null}
                onClose={onClose}
                onCreated={() => { /* selection is handled by onSaved */ }}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('context.branch')}>
          <EntityPicker
            value={branchId || null}
            options={(branches.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.code} — ${b.nameEn}` }))}
            onChange={(v) => setBranchId(v ?? '')}
            placeholder={t('common.select')}
            emptyLabel={t('common.none')}
            testId="purchase-order-branch"
          />
        </Field>
        <Field label={t('common.date')} required>
          <input type="date" className="oryx-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} data-testid="purchase-order-date" />
        </Field>
        <Field label={t('companies.currency')}>
          <select className="oryx-select" value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="purchase-order-currency">
            {['BHD', 'SAR', 'AED', 'KWD', 'QAR', 'OMR', 'USD', 'EUR'].map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </Field>
        <Field label={t('erp.inventory.warehouse')}>
          <EntityPicker
            value={warehouseId || null}
            options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.nameEn}` }))}
            onChange={(v) => setWarehouseId(v ?? '')}
            placeholder={t('common.select')}
            emptyLabel={t('common.none')}
            testId="purchase-order-warehouse"
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
        <Field label={t('erp.purchasing.expectedDate')}>
          <input
            type="date"
            className="oryx-input"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            data-testid="purchase-order-expected-date"
          />
        </Field>
        <Field label={t('common.notes')}>
          <input
            className="oryx-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="purchase-order-notes"
          />
        </Field>
      </div>
      <div className="mt-4">
        <CostLineEditor lines={lines} setLines={setLines} products={products} taxOptions={taxOptions} onTaxCreated={onTaxCreated} testIdPrefix="purchase-order-line" onProductCreated={onProductCreated} costLabel={t('erp.inventory.unitCost')} />
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        {savedId ? (
          <AttachmentsPanel entityType="PURCHASE_ORDER" entityId={savedId} canManage={canAttach} categorised />
        ) : (
          <PendingAttachments files={pending} onChange={setPending} canManage={canAttach} />
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ receipts

function ReceiptsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [preview, setPreview] = useState<PurchaseDocumentDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const list = useAsync(() => api.goodsReceipts({ search: debouncedSearch || undefined, status: status || undefined }), [debouncedSearch, status]);
  const orders = useAsync(() => api.purchaseOrders({ status: 'APPROVED' }), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.purchasing.receipts')}</p>
        {canManage && (orders.data?.items.length ?? 0) > 0 ? (
          <Button
            variant="primary"
            size="sm"
            data-testid="receive-first-order"
            onClick={async () => {
              const order = orders.data!.items[0];
              await api.createGoodsReceipt({ purchaseOrderId: order.id, receivedAt: new Date().toISOString() });
              await list.reload();
              await orders.reload();
            }}
          >
            <Icon name="plus" size={16} />
            {t('erp.purchasing.receiveGoods')}
          </Button>
        ) : null}
      </div>
      <PurchasingListFilters
        search={search} onSearch={setSearch} status={status} onStatus={setStatus}
        statuses={(list.data?.items ?? []).map((item) => item.status)}
      />
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.purchasing.emptyReceipts')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.purchasing.receiptNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.purchasing.supplier')}</th>
              <th>{t('erp.accounting.lines')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((r: PurchaseDocumentDto) => (
              <tr key={r.id} data-testid={`receipt-row-${r.receiptNumber}`}>
                <td className="font-mono text-[12px]">{r.receiptNumber}</td>
                <td className="text-[12.5px]">{r.receivedAt?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{r.supplierNameEn}</td>
                <td className="tabular-nums text-[12.5px]">{r.lines.length}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t('print.preview')} ${r.receiptNumber}`}
                    onClick={() => setPreview(r)}
                    data-testid={`receipt-preview-${r.receiptNumber}`}
                  >
                    <Icon name="eye" size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {preview ? (
        <PurchaseDocumentPreview document={preview} entityType="GOODS_RECEIPT" canManage={canManage} onClose={() => setPreview(null)} />
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ invoices

function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PurchaseDocumentDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const list = useAsync(() => api.supplierInvoices({ search: debouncedSearch || undefined, status: status || undefined }), [debouncedSearch, status]);
  const suppliers = useAsync(() => api.suppliers(), []);
  const products = useAsync(() => api.products(), []);
  const branches = useAsync(() => (companyId ? api.listBranches(companyId, { pageSize: 100 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 })), [companyId]);
  const purchaseOrders = useAsync(() => api.purchaseOrders(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.purchasing.invoices')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-supplier-invoice">
            <Icon name="plus" size={16} />
            {t('erp.purchasing.newInvoice')}
          </Button>
        ) : null}
      </div>
      <PurchasingListFilters
        search={search} onSearch={setSearch} status={status} onStatus={setStatus}
        statuses={(list.data?.items ?? []).map((item) => item.status)}
      />
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.purchasing.emptyInvoices')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.sales.invoiceNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.purchasing.supplier')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('erp.sales.outstanding')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((i: PurchaseDocumentDto) => (
              <tr key={i.id} data-testid={`supplier-invoice-row-${i.invoiceNumber}`}>
                <td className="font-mono text-[12px]">{i.invoiceNumber}</td>
                <td className="text-[12.5px]">{i.invoiceDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{i.supplierNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(i.totalMinor, i.currency)}</td>
                <td className="tabular-nums text-[12.5px]">{money(i.outstandingMinor ?? 0, i.currency)}</td>
                <td><StatusBadge status={i.status} label={i.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t('print.preview')} ${i.invoiceNumber}`}
                      onClick={() => setPreview(i)}
                      data-testid={`supplier-invoice-preview-${i.invoiceNumber}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                    <DocumentActions
                      sourceType="SupplierInvoice"
                      sourceId={i.id}
                      type="PURCHASE_INVOICE"
                      permissions={['erp.purchasing.read']}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <SupplierInvoiceModal
        open={open}
        suppliers={suppliers.data?.items ?? []}
        branches={branches.data?.items ?? []}
        purchaseOrders={purchaseOrders.data?.items ?? []}
        onSupplierCreated={suppliers.reload}
        products={products.data?.items ?? []}
        onProductCreated={products.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        onClose={() => setOpen(false)}
        onCreated={list.reload}
      />
      {preview ? (
        <PurchaseDocumentPreview document={preview} entityType="SUPPLIER_INVOICE" canManage={canManage} onClose={() => setPreview(null)} />
      ) : null}
    </Card>
  );
}

function SupplierInvoiceModal({
  taxOptions,
  onTaxCreated,
  open,
  suppliers,
  branches,
  purchaseOrders,
  products,
  onProductCreated,
  onClose,
  onCreated,
  onSupplierCreated,
}: {
  open: boolean;
  suppliers: SupplierDto[];
  branches: Array<{ id: string; code: string; nameEn: string }>;
  purchaseOrders: Array<{ id: string; orderNumber?: string; supplierNameEn?: string; status?: string }>;
  products: Array<{ id: string; sku: string; nameEn: string; costPriceMinor: number }>;
  onProductCreated?: () => Promise<void> | void;
  taxOptions: SearchableOption[];
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
  onClose: () => void;
  onCreated: () => Promise<void>;
  /** Reload the supplier list after one is created from the picker. */
  onSupplierCreated?: () => Promise<void> | void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [currency, setCurrency] = useState('BHD');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pending, setPending] = useState<File[]>([]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSupplierInvoice({
        supplierId,
        supplierInvoiceNumber,
        invoiceDate: new Date(invoiceDate).toISOString(),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
        ...(branchId ? { branchId } : {}),
        ...(purchaseOrderId ? { purchaseOrderId } : {}),
        currency,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitCostMinor: toMinorInput(l.unitCost),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      });
      if (pending.length) await uploadPendingAttachments('SUPPLIER_INVOICE', created.id, pending);
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
      size="full"
      title={t('erp.purchasing.newInvoice')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !supplierId || !supplierInvoiceNumber} onClick={submit} data-testid="save-supplier-invoice">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.purchasing.supplier')} required>
          <EntityPicker
            value={supplierId || null}
            options={suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.nameEn}`, hint: s.phone ?? undefined }))}
            onChange={(v) => setSupplierId(v ?? '')}
            placeholder={t('common.select')}
            testId="purchase-supplier"
            createLabel={t('erp.purchasing.newSupplier')}
            reloadOptions={onSupplierCreated}
            renderCreate={({ onClose, onSaved }) => (
              <SupplierModal
                open
                supplier={null}
                onClose={onClose}
                onCreated={() => { /* selection is handled by onSaved */ }}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('erp.purchasing.supplierInvoiceNumber')} required>
          <input
            className="oryx-input"
            value={supplierInvoiceNumber}
            onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
            data-testid="supplier-invoice-number"
          />
        </Field>
        <Field label={t('common.date')} required>
          <input type="date" className="oryx-input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} data-testid="supplier-invoice-date" />
        </Field>
        <Field label={t('erp.sales.dueDate')}>
          <input type="date" className="oryx-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="supplier-invoice-due-date" />
        </Field>
        <Field label={t('context.branch')}>
          <EntityPicker value={branchId || null} options={branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.nameEn}` }))} onChange={(v) => setBranchId(v ?? '')} placeholder={t('common.select')} emptyLabel={t('common.none')} testId="supplier-invoice-branch" />
        </Field>
        <Field label={t('erp.purchasing.orders')}>
          <EntityPicker value={purchaseOrderId || null} options={purchaseOrders.map((o) => ({ value: o.id, label: o.orderNumber ?? o.id, hint: o.supplierNameEn ?? o.status }))} onChange={(v) => setPurchaseOrderId(v ?? '')} placeholder={t('common.select')} emptyLabel={t('common.none')} testId="supplier-invoice-purchase-order" />
        </Field>
        <Field label={t('companies.currency')}>
          <select className="oryx-select" value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="supplier-invoice-currency">
            {['BHD', 'SAR', 'AED', 'KWD', 'QAR', 'OMR', 'USD', 'EUR'].map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </Field>
        <Field label={t('common.notes')}>
          <input
            className="oryx-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="supplier-invoice-notes"
          />
        </Field>
      </div>
      <div className="mt-4">
        <CostLineEditor lines={lines} setLines={setLines} products={products} taxOptions={taxOptions} onTaxCreated={onTaxCreated} testIdPrefix="supplier-invoice-line" onProductCreated={onProductCreated} costLabel={t('erp.inventory.unitCost')} />
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <PendingAttachments files={pending} onChange={setPending} canManage />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- returns

function ReturnsTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PurchaseDocumentDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const list = useAsync(() => api.purchaseReturns({ search: debouncedSearch || undefined, status: status || undefined }), [debouncedSearch, status]);
  const suppliers = useAsync(() => api.suppliers(), []);
  const products = useAsync(() => api.products(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.purchasing.returns')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-purchase-return">
            <Icon name="plus" size={16} />
            {t('erp.purchasing.newReturn')}
          </Button>
        ) : null}
      </div>
      <PurchasingListFilters
        search={search} onSearch={setSearch} status={status} onStatus={setStatus}
        statuses={(list.data?.items ?? []).map((item) => item.status)}
      />
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.purchasing.emptyReturns')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.purchasing.returnNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.purchasing.supplier')}</th>
              <th>{t('erp.sales.total')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((r: PurchaseDocumentDto) => (
              <tr key={r.id} data-testid={`return-row-${r.returnNumber}`}>
                <td className="font-mono text-[12px]">{r.returnNumber}</td>
                <td className="text-[12.5px]">{r.returnDate?.slice(0, 10)}</td>
                <td className="text-[12.5px]">{r.supplierNameEn}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(r.totalMinor, r.currency)}</td>
                <td><StatusBadge status={r.status} label={r.status} /></td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${t('print.preview')} ${r.returnNumber}`}
                      onClick={() => setPreview(r)}
                      data-testid={`return-preview-${r.returnNumber}`}
                    >
                      <Icon name="eye" size={14} />
                    </Button>
                    <DocumentActions
                      sourceType="PurchaseReturn"
                      sourceId={r.id}
                      type="PURCHASE_RETURN"
                      permissions={['erp.purchasing.read']}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <PurchaseReturnModal
        open={open}
        suppliers={suppliers.data?.items ?? []}
        onSupplierCreated={suppliers.reload}
        products={products.data?.items ?? []}
        onProductCreated={products.reload}
        warehouses={warehouses.data?.items ?? []}
        onWarehouseCreated={warehouses.reload}
        taxOptions={taxOptions}
        onTaxCreated={reloadTaxOptions}
        onClose={() => setOpen(false)}
        onCreated={list.reload}
      />
      {preview ? (
        <PurchaseDocumentPreview document={preview} entityType="PURCHASE_RETURN" canManage={canManage} onClose={() => setPreview(null)} />
      ) : null}
    </Card>
  );
}

function PurchaseReturnModal({
  open,
  suppliers,
  products,
  onProductCreated,
  warehouses,
  onWarehouseCreated,
  taxOptions,
  onTaxCreated,
  onClose,
  onCreated,
  onSupplierCreated,
}: {
  open: boolean;
  suppliers: SupplierDto[];
  products: Array<{ id: string; sku: string; nameEn: string; costPriceMinor: number }>;
  warehouses: WarehouseDto[];
  onProductCreated?: () => Promise<void> | void;
  onWarehouseCreated?: () => Promise<void> | void;
  taxOptions: SearchableOption[];
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
  onClose: () => void;
  onCreated: () => Promise<void>;
  /** Reload the supplier list after one is created from the picker. */
  onSupplierCreated?: () => Promise<void> | void;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [returnDate, setReturnDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pending, setPending] = useState<File[]>([]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createPurchaseReturn({
        supplierId,
        warehouseId,
        returnDate: new Date(returnDate).toISOString(),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId,
          description: l.description || 'Item',
          quantity: Number(l.quantity) || 1,
          unitCostMinor: toMinorInput(l.unitCost),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
      });
      if (pending.length) await uploadPendingAttachments('PURCHASE_RETURN', created.id, pending);
      await onCreated();
      onClose();
      setReason('');
      setLines([emptyLine()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.purchasing.newReturn')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !supplierId || !warehouseId || lines.every((l) => !l.productId)}
            onClick={submit}
            data-testid="save-purchase-return"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.purchasing.supplier')} required>
          <EntityPicker
            value={supplierId || null}
            options={suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.nameEn}`, hint: s.phone ?? undefined }))}
            onChange={(v) => setSupplierId(v ?? '')}
            placeholder={t('common.select')}
            testId="purchase-supplier"
            createLabel={t('erp.purchasing.newSupplier')}
            reloadOptions={onSupplierCreated}
            renderCreate={({ onClose, onSaved }) => (
              <SupplierModal
                open
                supplier={null}
                onClose={onClose}
                onCreated={() => { /* selection is handled by onSaved */ }}
                onSaved={(saved) => void onSaved(saved.id)}
              />
            )}
          />
        </Field>
        <Field label={t('erp.inventory.warehouse')} required>
          <EntityPicker
            value={warehouseId || null}
            options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.nameEn}` }))}
            onChange={(v) => setWarehouseId(v ?? '')}
            placeholder={t('common.select')}
            emptyLabel={t('common.none')}
            testId="purchase-return-warehouse"
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
        <Field label={t('erp.purchasing.returnDate')} required>
          <input type="date" className="oryx-input" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} data-testid="purchase-return-date" />
        </Field>
        <Field label={t('erp.purchasing.returnReason')} hint={t('erp.purchasing.returnReasonHint')}>
          <input className="oryx-input" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="purchase-return-reason" />
        </Field>
      </div>
      <div className="mt-4">
        <CostLineEditor lines={lines} setLines={setLines} products={products} taxOptions={taxOptions} onTaxCreated={onTaxCreated} testIdPrefix="purchase-return-line" onProductCreated={onProductCreated} costLabel={t('erp.inventory.unitCost')} />
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <PendingAttachments files={pending} onChange={setPending} canManage />
      </div>
    </Modal>
  );
}

// --------------------------------------------------------- shared line editor

function CostLineEditor({
  lines,
  setLines,
  products,
  taxOptions,
  onTaxCreated,
  testIdPrefix,
  costLabel,
  onProductCreated,
}: {
  lines: LineDraft[];
  setLines: (lines: LineDraft[]) => void;
  products: Array<{ id: string; sku: string; nameEn: string; costPriceMinor: number }>;
  taxOptions: SearchableOption[];
  /** Reload the tax list after one is created from a line's picker. */
  onTaxCreated?: () => Promise<void> | void;
  testIdPrefix: string;
  costLabel: string;
  /** Reload the product list after one is created from a line picker. */
  onProductCreated?: () => Promise<void> | void;
}) {
  const { t } = useUi();

  const update = (i: number, patch: Partial<LineDraft>) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    setLines(next);
  };

  const applyProduct = (i: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const next = [...lines];
    next[i] = {
      ...next[i],
      productId,
      description: product ? product.nameEn : next[i].description,
      unitCost: product ? minorToInput(product.costPriceMinor) : next[i].unitCost,
    };
    setLines(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <div className="col-span-4">
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
          </div>
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
            placeholder={costLabel}
            value={line.unitCost}
            onChange={(e) => update(i, { unitCost: e.target.value })}
            data-testid={`${testIdPrefix}-cost-${i}`}
          />
          <div className="col-span-1">
            <TaxPicker
              value={line.taxId || null}
              options={taxOptions}
              onChange={(v) => {
                const chosen = taxOptions.find((o) => o.value === v);
                update(i, { taxId: v ?? '', taxPercent: chosen ? chosen.label.replace(/[^\d.]/g, '') : line.taxPercent });
              }}
              scope="PURCHASES"
              placeholder="%"
              emptyLabel={t('common.none')}
              testId={`${testIdPrefix}-tax-${i}`}
              onCreated={onTaxCreated}
            />
          </div>
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
