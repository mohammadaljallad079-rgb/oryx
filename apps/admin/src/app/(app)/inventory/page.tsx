'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
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
  SectionHeader,
  Skeleton,
  StatusBadge,
  TableShell,
} from '@/components/ui';
import type {
  ProductDto,
  ProductImageDto,
  ReorderAlertDto,
  StockAdjustmentDto,
  StockMovementDto,
  StockTransferDto,
  ValuationRowDto,
  WarehouseDto,
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
    <div className="flex flex-col gap-4" data-testid="inventory-page">
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
  const [barcode, setBarcode] = useState('');
  // The committed scan target. Kept apart from the input so a scanner that emits
  // the code and a trailing Enter runs an exact-barcode lookup through the API's
  // dedicated path instead of a fuzzy text search.
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'' | 'PRODUCT' | 'SERVICE'>('');
  const [stockStatus, setStockStatus] = useState<'' | 'in' | 'low' | 'out'>('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [barcodeState, setBarcodeState] = useState<'' | 'with' | 'without'>('');
  const [warehouseId, setWarehouseId] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [imagesFor, setImagesFor] = useState<ProductDto | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const categories = useAsync(() => api.productCategories(), []);
  const warehouses = useAsync(() => api.warehouses(), []);

  // Prices are entered in whole currency units and sent as integer minor units,
  // so a blank field means "no bound" rather than a zero bound.
  const minPriceMinor = minPrice.trim() === '' ? undefined : Math.round(Number(minPrice) * 100);
  const maxPriceMinor = maxPrice.trim() === '' ? undefined : Math.round(Number(maxPrice) * 100);

  const list = useAsync(
    () =>
      api.products({
        search: search.trim() || undefined,
        barcode: barcodeQuery.trim() || undefined,
        category: category || undefined,
        type: type || undefined,
        stockStatus: stockStatus || undefined,
        isActive: status === '' ? undefined : status === 'active',
        hasBarcode: barcodeState === '' ? undefined : barcodeState === 'with',
        warehouseId: warehouseId || undefined,
        minPriceMinor: Number.isFinite(minPriceMinor) ? minPriceMinor : undefined,
        maxPriceMinor: Number.isFinite(maxPriceMinor) ? maxPriceMinor : undefined,
      }),
    [search, barcodeQuery, category, type, stockStatus, status, barcodeState, warehouseId, minPriceMinor, maxPriceMinor],
  );

  const activeFilterCount =
    (category ? 1 : 0) +
    (type ? 1 : 0) +
    (stockStatus ? 1 : 0) +
    (status ? 1 : 0) +
    (barcodeState ? 1 : 0) +
    (warehouseId ? 1 : 0) +
    (minPrice.trim() ? 1 : 0) +
    (maxPrice.trim() ? 1 : 0);

  function clearFilters() {
    setCategory('');
    setType('');
    setStockStatus('');
    setStatus('');
    setBarcodeState('');
    setWarehouseId('');
    setMinPrice('');
    setMaxPrice('');
    setSearch('');
    setBarcode('');
    setBarcodeQuery('');
  }

  async function onDeleteProduct(p: ProductDto) {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    try {
      await api.deleteProduct(p.id);
      await list.reload();
    } catch (err) {
      const key = err instanceof ApiError && err.code === 'resource.conflict' ? 'erp.inventory.deleteBlocked' : 'common.error';
      window.alert(t(key));
    }
  }

  // A scanner emits the whole code and a trailing Enter. The code is committed to
  // its own filter, so the API resolves it as an exact barcode match rather than
  // a name/SKU substring search, and the field is refocused for the next scan.
  async function onScanSubmit() {
    const code = barcode.trim();
    if (!code) return;
    setBarcodeQuery(code);
    setBarcode('');
    window.setTimeout(() => scanRef.current?.focus(), 50);
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="oryx-label">{t('erp.inventory.scanBarcode')}</span>
            <div className="relative">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                ref={scanRef}
                className="oryx-input ps-9 font-mono"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onScanSubmit();
                  }
                }}
                placeholder={t('erp.inventory.scanHint')}
                data-testid="product-barcode-scan"
                aria-label={t('erp.inventory.scanBarcode')}
              />
            </div>
            {barcodeQuery ? (
              <div className="mt-1 flex items-center gap-2" data-testid="product-barcode-active">
                <span className="oryx-faint text-[11.5px]">{t('erp.inventory.scanActive')}</span>
                <span className="font-mono text-[11.5px] text-[var(--text)]">{barcodeQuery}</span>
                <button
                  type="button"
                  className="oryx-faint text-[11.5px] underline"
                  onClick={() => setBarcodeQuery('')}
                  data-testid="product-barcode-clear"
                >
                  {t('common.clear')}
                </button>
              </div>
            ) : null}
          </label>
          <label className="min-w-[200px] flex-1">
            <span className="oryx-label">{t('common.search')}</span>
            <input
              className="oryx-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('erp.inventory.searchHint')}
              data-testid="product-search"
            />
          </label>
          {canManage ? (
            <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-product">
              <Icon name="plus" size={16} />
              {t('erp.inventory.newProduct')}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3" data-testid="product-filters">
          <label className="min-w-[150px]">
            <span className="oryx-label">{t('erp.inventory.category')}</span>
            <select
              className="oryx-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              data-testid="filter-category"
            >
              <option value="">{t('erp.inventory.allCategories')}</option>
              {(categories.data?.items ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[130px]">
            <span className="oryx-label">{t('erp.inventory.type')}</span>
            <select className="oryx-select" value={type} onChange={(e) => setType(e.target.value as typeof type)} data-testid="filter-type">
              <option value="">{t('common.all')}</option>
              <option value="PRODUCT">{t('erp.inventory.typeProduct')}</option>
              <option value="SERVICE">{t('erp.inventory.typeService')}</option>
            </select>
          </label>
          <label className="min-w-[150px]">
            <span className="oryx-label">{t('erp.inventory.stockStatus')}</span>
            <select
              className="oryx-select"
              value={stockStatus}
              onChange={(e) => setStockStatus(e.target.value as typeof stockStatus)}
              data-testid="filter-stock"
            >
              <option value="">{t('common.all')}</option>
              <option value="in">{t('erp.inventory.stockIn')}</option>
              <option value="low">{t('erp.inventory.stockLow')}</option>
              <option value="out">{t('erp.inventory.stockOut')}</option>
            </select>
          </label>
          <label className="min-w-[130px]">
            <span className="oryx-label">{t('common.status')}</span>
            <select className="oryx-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid="filter-status">
              <option value="">{t('common.all')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </select>
          </label>
          <label className="min-w-[150px]">
            <span className="oryx-label">{t('erp.inventory.barcode')}</span>
            <select
              className="oryx-select"
              value={barcodeState}
              onChange={(e) => setBarcodeState(e.target.value as typeof barcodeState)}
              data-testid="filter-barcode"
            >
              <option value="">{t('common.all')}</option>
              <option value="with">{t('erp.inventory.withBarcode')}</option>
              <option value="without">{t('erp.inventory.withoutBarcode')}</option>
            </select>
          </label>
          <label className="min-w-[150px]">
            <span className="oryx-label">{t('erp.inventory.warehouse')}</span>
            <select
              className="oryx-select"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              data-testid="filter-warehouse"
            >
              <option value="">{t('erp.inventory.allWarehouses')}</option>
              {(warehouses.data?.items ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[120px]">
            <span className="oryx-label">{t('erp.inventory.minPrice')}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              className="oryx-input"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              data-testid="filter-min-price"
            />
          </label>
          <label className="min-w-[120px]">
            <span className="oryx-label">{t('erp.inventory.maxPrice')}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              className="oryx-input"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              data-testid="filter-max-price"
            />
          </label>
          {activeFilterCount > 0 ? (
            <Button size="sm" variant="ghost" onClick={clearFilters} data-testid="clear-filters">
              {t('erp.inventory.clearFilters')}
            </Button>
          ) : null}
          <span className="ms-auto self-center text-[12.5px] text-[var(--muted)]" data-testid="product-count">
            {t('erp.inventory.resultCount', { count: list.data?.total ?? 0 })}
          </span>
        </div>
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
              <th>{t('erp.inventory.barcode')}</th>
              <th>{t('erp.inventory.category')}</th>
              <th>{t('erp.inventory.unit')}</th>
              <th>{t('erp.inventory.salesPrice')}</th>
              <th>{t('erp.inventory.costPrice')}</th>
              <th>{t('erp.inventory.taxRate')}</th>
              <th>{t('common.status')}</th>
              {canManage ? <th>{t('common.actions')}</th> : null}
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
                <td className="font-mono text-[12px]" data-testid={`product-barcode-${p.sku}`}>
                  {p.barcode ?? '—'}
                </td>
                <td className="text-[12.5px]">{p.category ?? '—'}</td>
                <td className="text-[12.5px]">{p.unit}</td>
                <td className="tabular-nums text-[12.5px]">{money(p.salesPriceMinor)}</td>
                <td className="tabular-nums text-[12.5px]">{money(p.costPriceMinor)}</td>
                <td className="text-[12.5px]">{(p.taxRateBp / 100).toFixed(2)}%</td>
                <td>
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? t('common.active') : t('common.inactive')}</Badge>
                </td>
                {canManage ? (
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setEditing(p)} data-testid={`edit-product-${p.sku}`}>
                        {t('common.edit')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setImagesFor(p)} data-testid={`images-product-${p.sku}`}>
                        <Icon name="eye" size={15} />
                        {t('erp.inventory.images')}
                      </Button>
                      {p.isActive ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await api.updateProduct(p.id, { isActive: false });
                            await list.reload();
                          }}
                          data-testid={`deactivate-product-${p.sku}`}
                        >
                          {t('common.deactivate')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={async () => {
                            await api.updateProduct(p.id, { isActive: true });
                            await list.reload();
                          }}
                          data-testid={`reactivate-product-${p.sku}`}
                        >
                          {t('common.reactivate')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void onDeleteProduct(p)}
                        data-testid={`delete-product-${p.sku}`}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <CreateProductModal open={open} onClose={() => setOpen(false)} onCreated={list.reload} />
      <EditProductModal
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await list.reload();
        }}
      />
      <ProductImagesModal
        product={imagesFor}
        canManage={canManage}
        onClose={() => setImagesFor(null)}
      />
    </Card>
  );
}

/**
 * Edit an existing catalogue item.
 *
 * The SKU is immutable: it is the key inventory movements and invoices reference,
 * so the API would reject a change and the field is shown read-only rather than
 * offered and then refused.
 */
function EditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameEn: '', nameAr: '', unit: 'unit', salesPrice: '0.00', costPrice: '0.00', taxRate: '15', isActive: true,
    barcode: '', category: '', reorderLevel: '0', reorderQuantity: '0', trackStock: true,
  });

  useEffect(() => {
    if (!product) return;
    setError(null);
    setForm({
      nameEn: product.nameEn,
      nameAr: product.nameAr,
      unit: product.unit,
      salesPrice: minorToInput(product.salesPriceMinor),
      costPrice: minorToInput(product.costPriceMinor),
      taxRate: (product.taxRateBp / 100).toString(),
      isActive: product.isActive,
      barcode: product.barcode ?? '',
      category: product.category ?? '',
      // The stored reorder level is scaled by 10^4; `qty` renders it back.
      reorderLevel: String(product.reorderLevel / 10_000),
      reorderQuantity: String(product.reorderQuantity / 10_000),
      trackStock: product.trackStock,
    });
  }, [product]);

  const submit = async () => {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProduct(product.id, {
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        unit: form.unit,
        salesPriceMinor: toMinorInput(form.salesPrice),
        costPriceMinor: toMinorInput(form.costPrice),
        taxRateBp: Math.round(Number(form.taxRate) * 100),
        isActive: form.isActive,
        barcode: form.barcode,
        category: form.category,
        reorderLevel: toQuantityInput(form.reorderLevel),
        reorderQuantity: toQuantityInput(form.reorderQuantity),
        trackStock: form.trackStock,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(product)}
      title={`${t('common.edit')} — ${product?.sku ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-product-edit">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.inventory.sku')}>
          <input className="oryx-input" value={product?.sku ?? ''} readOnly disabled />
        </Field>
        <Field label={t('erp.inventory.unit')}>
          <input className="oryx-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="edit-product-unit" />
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="edit-product-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="edit-product-name-ar" />
        </Field>
        <Field label={t('erp.inventory.salesPrice')}>
          <input className="oryx-input" value={form.salesPrice} onChange={(e) => setForm({ ...form, salesPrice: e.target.value })} data-testid="edit-product-sales-price" />
        </Field>
        <Field label={t('erp.inventory.costPrice')}>
          <input className="oryx-input" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.taxRate')}>
          <input className="oryx-input" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
        </Field>
        <Field label={t('erp.inventory.barcode')}>
          <input className="oryx-input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} data-testid="edit-product-barcode" />
        </Field>
        <Field label={t('erp.inventory.category')}>
          <input className="oryx-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="edit-product-category" />
        </Field>
        <Field label={t('erp.inventory.reorderLevel')}>
          <input className="oryx-input" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} data-testid="edit-product-reorder-level" />
        </Field>
        <Field label={t('erp.inventory.reorderQuantity')}>
          <input className="oryx-input" value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: e.target.value })} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold">
        <input
          type="checkbox"
          className="oryx-checkbox"
          checked={form.trackStock}
          onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
          data-testid="edit-product-track-stock"
        />
        {t('erp.inventory.trackStock')}
      </label>
      <label className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold">
        <input
          type="checkbox"
          className="oryx-checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          data-testid="edit-product-active"
        />
        {t('common.active')}
      </label>
    </Modal>
  );
}

/**
 * Product photography.
 *
 * Uploads go to the shared media library through the API's authorized pipeline,
 * which sniffs the real file type, enforces the size ceiling and re-encodes the
 * bytes. This screen never writes a storage path — it only posts the file and
 * renders the served URL the API returns.
 */
function ProductImagesModal({
  product,
  canManage,
  onClose,
}: {
  product: ProductDto | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useUi();
  const [images, setImages] = useState<ProductImageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altEn, setAltEn] = useState('');
  const [altAr, setAltAr] = useState('');

  const load = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    setError(null);
    try {
      setImages(await api.productImages(product.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [product, t]);

  useEffect(() => {
    if (product) void load();
    else {
      setImages([]);
      setFile(null);
      setAltEn('');
      setAltAr('');
    }
  }, [product, load]);

  async function upload() {
    if (!product || !file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (altEn) form.append('altEn', altEn);
      if (altAr) form.append('altAr', altAr);
      await api.uploadProductImage(product.id, form);
      setFile(null);
      setAltEn('');
      setAltAr('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function promote(imageId: string) {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateProductImage(product.id, imageId, { isPrimary: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(imageId: string) {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProductImage(product.id, imageId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(product)} title={`${t('erp.inventory.images')} — ${product?.sku ?? ''}`} onClose={onClose}>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <Skeleton height={120} /> : images.length === 0 ? (
        <p className="oryx-faint mb-3 text-[12.5px]">{t('erp.inventory.noImages')}</p>
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {images.map((img) => (
            <figure key={img.id} className="overflow-hidden rounded-lg border border-[var(--border)]" data-testid={`product-image-${img.id}`}>
              {img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={api.resolveImage(img.url) ?? ''} alt={locale === 'ar' ? img.altAr ?? '' : img.altEn ?? ''} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center text-[11px] text-[var(--muted)]">{t('common.empty')}</div>
              )}
              <figcaption className="flex items-center justify-between gap-2 p-2">
                {img.isPrimary ? <Badge tone="success">{t('erp.inventory.primary')}</Badge> : <span />}
                {canManage ? (
                  <div className="flex gap-1">
                    {!img.isPrimary ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void promote(img.id)} data-testid={`promote-image-${img.id}`}>
                        {t('erp.inventory.makePrimary')}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(img.id)} data-testid={`delete-image-${img.id}`}>
                      <Icon name="close" size={14} />
                    </Button>
                  </div>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {canManage ? (
        <div className="border-t border-[var(--border)] pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('erp.inventory.file')}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="oryx-input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="product-image-file"
              />
            </Field>
            <Field label={`${t('common.name')} (EN)`}>
              <input className="oryx-input" value={altEn} onChange={(e) => setAltEn(e.target.value)} data-testid="product-image-alt-en" />
            </Field>
            <Field label={`${t('common.name')} (AR)`}>
              <input className="oryx-input" value={altAr} onChange={(e) => setAltAr(e.target.value)} data-testid="product-image-alt-ar" />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="sm" disabled={busy || !file} onClick={() => void upload()} data-testid="upload-product-image">
              {busy ? t('common.loading') : t('erp.inventory.uploadImage')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function CreateProductModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    sku: '', nameEn: '', nameAr: '', unit: 'unit', salesPrice: '0.00', costPrice: '0.00', taxRate: '15',
    barcode: '', category: '', reorderLevel: '0', reorderQuantity: '0', trackStock: true,
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createProduct({
        sku: form.sku,
        nameEn: form.nameEn,
        nameAr: form.nameAr,
        unit: form.unit,
        salesPriceMinor: toMinorInput(form.salesPrice),
        costPriceMinor: toMinorInput(form.costPrice),
        taxRateBp: Math.round(Number(form.taxRate) * 100),
        barcode: form.barcode || undefined,
        category: form.category || undefined,
        // The reorder level is stored scaled by 10^4, exactly like a quantity.
        reorderLevel: toQuantityInput(form.reorderLevel),
        reorderQuantity: toQuantityInput(form.reorderQuantity),
        trackStock: form.trackStock,
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
      title={t('erp.inventory.newProduct')}
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
          <input className="oryx-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} data-testid="product-sku" />
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
        <Field label={t('erp.inventory.barcode')}>
          <input className="oryx-input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} data-testid="product-barcode" />
        </Field>
        <Field label={t('erp.inventory.category')}>
          <input className="oryx-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="product-category" />
        </Field>
        <Field label={t('erp.inventory.reorderLevel')}>
          <input className="oryx-input" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} data-testid="product-reorder-level" />
        </Field>
        <Field label={t('erp.inventory.reorderQuantity')}>
          <input className="oryx-input" value={form.reorderQuantity} onChange={(e) => setForm({ ...form, reorderQuantity: e.target.value })} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold">
        <input
          type="checkbox"
          className="oryx-checkbox"
          checked={form.trackStock}
          onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
          data-testid="product-track-stock"
        />
        {t('erp.inventory.trackStock')}
      </label>
    </Modal>
  );
}

function WarehousesTab({ canManage }: { canManage: boolean }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.warehouses(), []);

  async function onDeleteWarehouse(w: WarehouseDto) {
    if (!window.confirm(t('common.deleteConfirm'))) return;
    try {
      await api.deleteWarehouse(w.id);
      await list.reload();
    } catch (err) {
      const key = err instanceof ApiError && err.code === 'resource.conflict' ? 'erp.inventory.deleteWarehouseBlocked' : 'common.error';
      window.alert(t(key));
    }
  }

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
              {canManage ? <th>{t('common.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((w: WarehouseDto) => (
              <tr key={w.id} data-testid={`warehouse-row-${w.code}`}>
                <td className="font-mono text-[12px]">{w.code}</td>
                <td>{w.nameEn}</td>
                <td className="text-[12.5px]">{w.branchNameEn ?? '—'}</td>
                <td><Badge tone={w.isActive ? 'success' : 'neutral'}>{w.isActive ? t('common.active') : t('common.inactive')}</Badge></td>
                {canManage ? (
                  <td>
                    <div className="flex flex-wrap gap-2">
                    {w.isActive ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await api.updateWarehouse(w.id, { isActive: false });
                          await list.reload();
                        }}
                        data-testid={`deactivate-warehouse-${w.code}`}
                      >
                        {t('common.deactivate')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          await api.updateWarehouse(w.id, { isActive: true });
                          await list.reload();
                        }}
                        data-testid={`reactivate-warehouse-${w.code}`}
                      >
                        {t('common.reactivate')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void onDeleteWarehouse(w)}
                      data-testid={`delete-warehouse-${w.code}`}
                    >
                      {t('common.delete')}
                    </Button>
                    </div>
                  </td>
                ) : null}
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
