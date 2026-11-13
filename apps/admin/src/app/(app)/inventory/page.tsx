'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, qty, toMinorInput, toQuantityInput } from '@/lib/erp-format';
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
import {
  PART_CATEGORIES,
  type ProductDto,
  type ReorderAlertDto,
  type StockAdjustmentDto,
  type StockMovementDto,
  type StockTransferDto,
  type ValuationRowDto,
  type WarehouseDto,
} from '@oryx/shared';

type Tab = 'valuation' | 'products' | 'warehouses' | 'movements' | 'transfers' | 'adjustments' | 'reorder';

export default function InventoryPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('valuation');

  const canItem = can('erp.inventory.item.manage');
  const canWarehouse = can('erp.inventory.warehouse.manage');
  const canMove = can('erp.inventory.movement.manage');
  const canTransfer = can('erp.inventory.transfer.manage');
  const canAdjust = can('erp.inventory.adjustment.manage');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'valuation', label: t('erp.inventory.valuation') },
    { key: 'products', label: t('erp.inventory.products') },
    { key: 'warehouses', label: t('erp.inventory.warehouses') },
    { key: 'movements', label: t('erp.inventory.movements') },
    { key: 'transfers', label: t('erp.inventory.transfers') },
    { key: 'adjustments', label: t('erp.inventory.adjustments') },
    { key: 'reorder', label: t('erp.inventory.reorder') },
  ];

  return (
    <div className="flex flex-col gap-5" data-testid="inventory-page">
      <SectionHeader
        title={t('nav.warehouses_inventory')}
        subtitle={t('erp.inventory.subtitle')}
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
            data-testid={`inventory-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'valuation' ? <ValuationTab /> : null}
      {tab === 'products' ? <ProductsTab canManage={canItem} /> : null}
      {tab === 'warehouses' ? <WarehousesTab canManage={canWarehouse} /> : null}
      {tab === 'movements' ? <MovementsTab canManage={canMove} /> : null}
      {tab === 'transfers' ? <TransfersTab canManage={canTransfer} /> : null}
      {tab === 'adjustments' ? <AdjustmentsTab canManage={canAdjust} /> : null}
      {tab === 'reorder' ? <ReorderTab /> : null}
    </div>
  );
}

function ValuationTab() {
  const { t } = useUi();
  const valuation = useAsync<{ rows: ValuationRowDto[]; totalValueMinor: number; totalQuantity: number }>(
    () => api.inventoryValuation(),
    [],
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.inventory.valuation')}</p>
        <div className="flex gap-4 text-[13px]">
          <span className="oryx-muted">
            {t('erp.inventory.totalValue')}: <strong className="tabular-nums">{money(valuation.data?.totalValueMinor ?? 0)}</strong>
          </span>
          <span className="oryx-muted">
            {t('erp.inventory.totalQty')}: <strong className="tabular-nums">{qty(valuation.data?.totalQuantity ?? 0)}</strong>
          </span>
        </div>
      </div>
      {valuation.error ? <div className="p-4"><ErrorBanner message={valuation.error} onRetry={valuation.reload} /></div> : null}
      {valuation.loading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={34} />)}
        </div>
      ) : (valuation.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.inventory.emptyValuation')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.inventory.warehouse')}</th>
              <th>{t('erp.inventory.sku')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.inventory.onHand')}</th>
              <th>{t('erp.inventory.avgCost')}</th>
              <th>{t('erp.inventory.value')}</th>
            </tr>
          </thead>
          <tbody>
            {valuation.data!.rows.map((r) => (
              <tr key={`${r.warehouseId}-${r.productId}`} data-testid={`valuation-row-${r.sku}`}>
                <td className="text-[12.5px]">{r.warehouseCode}</td>
                <td className="font-mono text-[12px]">{r.sku}</td>
                <td>{r.nameEn}</td>
                <td className="tabular-nums text-[12.5px]">{qty(r.quantity)}</td>
                <td className="tabular-nums text-[12.5px]">{money(r.averageCostMinor)}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(r.valueMinor)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function ProductsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const list = useAsync(() => api.products({ search: search || undefined }), [search]);

  const categoryName = (key: string | null) => {
    if (!key) return null;
    const category = PART_CATEGORIES.find((c) => c.key === key);
    return category?.nameEn ?? key;
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input className="oryx-input" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="product-search" />
        </label>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-product">
            <Icon name="plus" size={16} />
            {t('erp.inventory.newProduct')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={34} />)}
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.inventory.emptyProducts')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.inventory.sku')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.inventory.unit')}</th>
              <th>{t('erp.inventory.salesPrice')}</th>
              <th>{t('erp.inventory.costPrice')}</th>
              <th>{t('cms.storefront')}</th>
              <th>{t('common.status')}</th>
              {canManage ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((p) => (
              <tr key={p.id} data-testid={`product-row-${p.sku}`}>
                <td className="font-mono text-[12px]">{p.sku}</td>
                <td>
                  <span className="block font-semibold">{p.nameEn}</span>
                  <span className="oryx-faint block text-[11px]">{p.nameAr}</span>
                </td>
                <td className="text-[12.5px]">{p.unit}</td>
                <td className="tabular-nums text-[12.5px]">{money(p.salesPriceMinor)}</td>
                <td className="tabular-nums text-[12.5px]">{money(p.costPriceMinor)}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5" data-testid={`storefront-${p.sku}`}>
                    {p.isPublished ? (
                      <Badge tone="success">{t('cms.published')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('cms.unpublished')}</Badge>
                    )}
                    {p.isFeatured ? <Badge tone="gold">{t('cms.featured')}</Badge> : null}
                    {categoryName(p.partCategoryKey) ? (
                      <span className="oryx-faint text-[11px]">{categoryName(p.partCategoryKey)}</span>
                    ) : (
                      <span className="oryx-faint text-[11px]">{t('cms.noCategory')}</span>
                    )}
                  </div>
                </td>
                <td>
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? t('common.active') : t('common.inactive')}</Badge>
                </td>
                {canManage ? (
                  <td>
                    <Button size="sm" onClick={() => setEditing(p)} data-testid={`edit-product-${p.sku}`}>
                      {t('common.edit')}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <ProductModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={list.reload}
      />
      <ProductModal
        open={editing !== null}
        product={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={list.reload}
      />
    </Card>
  );
}

function ProductModal({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  product?: ProductDto;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const isEdit = Boolean(product);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: '',
    nameEn: '',
    nameAr: '',
    unit: 'unit',
    salesPrice: '0.00',
    costPrice: '0.00',
    taxRate: '15',
    partCategoryKey: '',
    brand: '',
    imageUrl: '',
    isPublished: false,
    isFeatured: false,
    compareAtPrice: '',
  });

  // Reset the form whenever the modal opens, seeding from the product on edit.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      product
        ? {
            sku: product.sku,
            nameEn: product.nameEn,
            nameAr: product.nameAr,
            unit: product.unit,
            salesPrice: (product.salesPriceMinor / 100).toFixed(2),
            costPrice: (product.costPriceMinor / 100).toFixed(2),
            taxRate: (product.taxRateBp / 100).toFixed(2),
            partCategoryKey: product.partCategoryKey ?? '',
            brand: product.brand ?? '',
            imageUrl: product.imageUrl ?? '',
            isPublished: product.isPublished,
            isFeatured: product.isFeatured,
            compareAtPrice:
              product.compareAtPriceMinor !== null ? (product.compareAtPriceMinor / 100).toFixed(2) : '',
          }
        : {
            sku: '',
            nameEn: '',
            nameAr: '',
            unit: 'unit',
            salesPrice: '0.00',
            costPrice: '0.00',
            taxRate: '15',
            partCategoryKey: '',
            brand: '',
            imageUrl: '',
            isPublished: false,
            isFeatured: false,
            compareAtPrice: '',
          },
    );
  }, [open, product]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const storefront = {
        partCategoryKey: form.partCategoryKey || undefined,
        brand: form.brand || undefined,
        imageUrl: form.imageUrl || undefined,
        isPublished: form.isPublished,
        isFeatured: form.isFeatured,
        compareAtPriceMinor: form.compareAtPrice ? toMinorInput(form.compareAtPrice) : undefined,
      };
      if (isEdit) {
        await api.updateProduct(product!.id, {
          nameEn: form.nameEn,
          nameAr: form.nameAr,
          unit: form.unit,
          salesPriceMinor: toMinorInput(form.salesPrice),
          costPriceMinor: toMinorInput(form.costPrice),
          taxRateBp: Math.round(Number(form.taxRate) * 100),
          ...storefront,
        });
      } else {
        await api.createProduct({
          sku: form.sku,
          nameEn: form.nameEn,
          nameAr: form.nameAr,
          unit: form.unit,
          salesPriceMinor: toMinorInput(form.salesPrice),
          costPriceMinor: toMinorInput(form.costPrice),
          taxRateBp: Math.round(Number(form.taxRate) * 100),
          ...storefront,
        });
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
      title={isEdit ? `${t('common.edit')} ${product!.sku}` : t('erp.inventory.newProduct')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-product">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.sku')} required>
          <input
            className="oryx-input"
            value={form.sku}
            disabled={isEdit}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            data-testid="product-sku"
          />
        </Field>
        <Field label={t('erp.inventory.unit')}>
          <input className="oryx-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="product-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="product-name-ar" />
        </Field>
        <Field label={t('erp.inventory.salesPrice')}>
          <input className="oryx-input" value={form.salesPrice} onChange={(e) => setForm({ ...form, salesPrice: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.costPrice')}>
          <input className="oryx-input" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.taxRate')}>
          <input className="oryx-input" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
        </Field>
      </div>

      <p className="oryx-panel-title" style={{ marginTop: 20, marginBottom: 8 }}>
        {t('cms.storefront')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('cms.category')}>
          <select
            className="oryx-input"
            value={form.partCategoryKey}
            onChange={(e) => setForm({ ...form, partCategoryKey: e.target.value })}
            data-testid="product-category"
          >
            <option value="">{t('cms.noCategory')}</option>
            {PART_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.nameEn}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('cms.productBrand')}>
          <input className="oryx-input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} data-testid="product-brand" />
        </Field>
        <Field label={t('cms.image')}>
          <input
            className="oryx-input"
            value={form.imageUrl}
            placeholder="/media/part-brake-disc.jpg"
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            data-testid="product-image-url"
          />
        </Field>
        <Field label={t('cms.compareAtPrice')}>
          <input
            className="oryx-input"
            value={form.compareAtPrice}
            onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })}
            data-testid="product-compare-price"
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            data-testid="product-published"
          />
          {t('cms.published')}
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.isFeatured}
            onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
            data-testid="product-featured"
          />
          {t('cms.featured')}
        </label>
      </div>
      <p className="oryx-faint" style={{ marginTop: 10, fontSize: 12 }}>
        {t('cms.storefrontHint')}
      </p>
    </Modal>
  );
}

function WarehousesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.warehouses(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.inventory.warehouses')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-warehouse">
            <Icon name="plus" size={16} />
            {t('erp.inventory.newWarehouse')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.inventory.emptyWarehouses')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.inventory.branch')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((w: WarehouseDto) => (
              <tr key={w.id} data-testid={`warehouse-row-${w.code}`}>
                <td className="font-mono text-[12px]">{w.code}</td>
                <td>{w.nameEn}</td>
                <td className="text-[12.5px]">{w.branchNameEn ?? '—'}</td>
                <td><Badge tone={w.isActive ? 'success' : 'neutral'}>{w.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateWarehouseModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
    </Card>
  );
}

function CreateWarehouseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', nameEn: '', nameAr: '' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createWarehouse(form);
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
      title={t('erp.inventory.newWarehouse')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-warehouse">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="warehouse-code" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="warehouse-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="warehouse-name-ar" />
        </Field>
      </div>
    </Modal>
  );
}

function MovementsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.stockMovements({ page: 1 }), []);
  const warehouses = useAsync(() => api.warehouses(), []);
  const products = useAsync(() => api.products(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.inventory.movements')}</p>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-movement">
            <Icon name="plus" size={16} />
            {t('erp.inventory.recordMovement')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={160} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.inventory.emptyMovements')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('erp.inventory.warehouse')}</th>
              <th>{t('erp.inventory.sku')}</th>
              <th>{t('erp.inventory.movementType')}</th>
              <th>{t('erp.inventory.quantity')}</th>
              <th>{t('erp.inventory.unitCost')}</th>
              <th>{t('erp.inventory.balanceAfter')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((m: StockMovementDto) => (
              <tr key={m.id} data-testid={`movement-row-${m.id}`}>
                <td className="text-[12.5px]">{m.occurredAt.slice(0, 10)}</td>
                <td className="text-[12.5px]">{m.warehouseCode}</td>
                <td className="font-mono text-[12px]">{m.sku}</td>
                <td><Badge tone={m.quantity > 0 ? 'success' : 'warning'}>{m.movementType}</Badge></td>
                <td className="tabular-nums text-[12.5px]">{qty(m.quantity)}</td>
                <td className="tabular-nums text-[12.5px]">{money(m.unitCostMinor)}</td>
                <td className="tabular-nums text-[12.5px]">{qty(m.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <RecordMovementModal
        open={open}
        warehouses={warehouses.data?.items ?? []}
        products={products.data?.items ?? []}
        onClose={() => setOpen(false)}
        onDone={list.reload}
      />
    </Card>
  );
}

function RecordMovementModal({
  open,
  warehouses,
  products,
  onClose,
  onDone,
}: {
  open: boolean;
  warehouses: WarehouseDto[];
  products: ProductDto[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ warehouseId: '', productId: '', direction: 'IN', quantity: '1', unitCost: '0.00' });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.recordStockMovement({
        warehouseId: form.warehouseId,
        productId: form.productId,
        direction: form.direction,
        quantity: toQuantityInput(form.quantity),
        unitCostMinor: toMinorInput(form.unitCost),
        occurredAt: new Date().toISOString(),
      });
      await onDone();
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
      title={t('erp.inventory.recordMovement')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-movement">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.warehouse')} required>
          <select className="oryx-select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} data-testid="movement-warehouse">
            <option value="">—</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.inventory.product')} required>
          <select className="oryx-select" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} data-testid="movement-product">
            <option value="">—</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.nameEn}</option>)}
          </select>
        </Field>
        <Field label={t('erp.inventory.movementType')} required>
          <select className="oryx-select" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
            <option value="IN">{t('erp.inventory.receipt')}</option>
            <option value="OUT">{t('erp.inventory.issue')}</option>
          </select>
        </Field>
        <Field label={t('erp.inventory.quantity')} required>
          <input className="oryx-input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="movement-quantity" />
        </Field>
        <Field label={t('erp.inventory.unitCost')}>
          <input className="oryx-input" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} data-testid="movement-cost" />
        </Field>
      </div>
    </Modal>
  );
}

function TransfersTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.stockTransfers(), []);

  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.inventory.transfers')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.inventory.emptyTransfers')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.inventory.transferNumber')}</th>
              <th>{t('erp.inventory.from')}</th>
              <th>{t('erp.inventory.to')}</th>
              <th>{t('erp.accounting.lines')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((tr: StockTransferDto) => (
              <tr key={tr.id} data-testid={`transfer-row-${tr.transferNumber}`}>
                <td className="font-mono text-[12px]">{tr.transferNumber}</td>
                <td className="text-[12.5px]">{tr.fromWarehouseId.slice(-6)}</td>
                <td className="text-[12.5px]">{tr.toWarehouseId.slice(-6)}</td>
                <td className="tabular-nums text-[12.5px]">{tr.lines.length}</td>
                <td><StatusBadge status={tr.status} label={tr.status} /></td>
                <td>
                  {canManage && tr.status === 'DRAFT' ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.postStockTransfer(tr.id);
                        await list.reload();
                      }}
                    >
                      {t('erp.inventory.post')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function AdjustmentsTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const list = useAsync(() => api.stockAdjustments(), []);

  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.inventory.adjustments')}</p>
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? <div className="p-4"><Skeleton height={120} /></div> : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.inventory.emptyAdjustments')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.inventory.adjustmentNumber')}</th>
              <th>{t('erp.inventory.reason')}</th>
              <th>{t('erp.accounting.lines')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((a: StockAdjustmentDto) => (
              <tr key={a.id} data-testid={`adjustment-row-${a.adjustmentNumber}`}>
                <td className="font-mono text-[12px]">{a.adjustmentNumber}</td>
                <td className="text-[12.5px]">{a.reason}</td>
                <td className="tabular-nums text-[12.5px]">{a.lines.length}</td>
                <td><StatusBadge status={a.status} label={a.status} /></td>
                <td>
                  {canManage && a.status === 'DRAFT' ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await api.postStockAdjustment(a.id);
                        await list.reload();
                      }}
                    >
                      {t('erp.inventory.post')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}

function ReorderTab() {
  const { t } = useUi();
  const alerts = useAsync<{ items: ReorderAlertDto[] }>(() => api.reorderAlerts(), []);

  return (
    <Card>
      <div className="border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.inventory.reorder')}</p>
      </div>
      {alerts.error ? <div className="p-4"><ErrorBanner message={alerts.error} onRetry={alerts.reload} /></div> : null}
      {alerts.loading ? <div className="p-4"><Skeleton height={120} /></div> : (alerts.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('erp.inventory.noAlerts')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.inventory.sku')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.inventory.onHand')}</th>
              <th>{t('erp.inventory.reorderLevel')}</th>
              <th>{t('erp.inventory.reorderQuantity')}</th>
            </tr>
          </thead>
          <tbody>
            {alerts.data!.items.map((a) => (
              <tr key={a.productId} data-testid={`reorder-row-${a.sku}`}>
                <td className="font-mono text-[12px]">{a.sku}</td>
                <td>{a.nameEn}</td>
                <td className="tabular-nums text-[12.5px]">{qty(a.onHand)}</td>
                <td className="tabular-nums text-[12.5px]">{qty(a.reorderLevel)}</td>
                <td className="tabular-nums text-[12.5px]">{qty(a.reorderQuantity)}</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Card>
  );
}
