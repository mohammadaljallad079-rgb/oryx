'use client';

import { Suspense, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { minorToInput, money, toMinorInput, toQuantityInput, todayIso } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { DocumentActions } from '@/components/document-actions';
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
    </Card>
  );
}


// ---------------------------------------------------------------- requisitions

function RequisitionsTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.requisitions(), []);
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

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createRequisition({
        supplierId: supplierId || undefined,
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          estimatedUnitCostMinor: toMinorInput(l.unitCost),
        })),
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
    </Modal>
  );
}

// -------------------------------------------------------------------- orders

function OrdersTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.purchaseOrders(), []);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createPurchaseOrder({
        supplierId,
        warehouseId: warehouseId || undefined,
        approve: true,
        orderDate: new Date().toISOString(),
        ...(expectedDate ? { expectedDate: new Date(expectedDate).toISOString() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitCostMinor: toMinorInput(l.unitCost),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
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
    </Modal>
  );
}

// ------------------------------------------------------------------ receipts

function ReceiptsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.goodsReceipts(), []);
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
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ invoices

function InvoicesTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.supplierInvoices(), []);
  const suppliers = useAsync(() => api.suppliers(), []);
  const products = useAsync(() => api.products(), []);

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
                  <DocumentActions
                    sourceType="SupplierInvoice"
                    sourceId={i.id}
                    type="PURCHASE_INVOICE"
                    permissions={['erp.purchasing.read']}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <SupplierInvoiceModal
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
    </Card>
  );
}

function SupplierInvoiceModal({
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
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createSupplierInvoice({
        supplierId,
        supplierInvoiceNumber,
        invoiceDate: new Date().toISOString(),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((l) => ({
          productId: l.productId || undefined,
          description: l.description || 'Item',
          quantity: toQuantityInput(l.quantity),
          unitCostMinor: toMinorInput(l.unitCost),
          taxPercentBp: Math.round((Number(l.taxPercent) || 0) * 100),
        })),
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
        <Field label={t('erp.sales.dueDate')}>
          <input
            type="date"
            className="oryx-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            data-testid="supplier-invoice-due-date"
          />
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
    </Modal>
  );
}

// ------------------------------------------------------------------- returns

function ReturnsTab({ canManage }: { canManage: boolean }) {
  const { companyId } = useAuth();
  const { options: taxOptions, reload: reloadTaxOptions } = useTaxOptions(companyId);
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.purchaseReturns(), []);
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
                  <DocumentActions
                    sourceType="PurchaseReturn"
                    sourceId={r.id}
                    type="PURCHASE_RETURN"
                    permissions={['erp.purchasing.read']}
                  />
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

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createPurchaseReturn({
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
