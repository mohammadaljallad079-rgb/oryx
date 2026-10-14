'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, qty } from '@/lib/erp-format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  SectionHeader,
  Skeleton,
  TableShell,
} from '@/components/ui';
import type {
  AccountingReportDto,
  InventoryReportDto,
  PurchasingReportDto,
  SalesReportDto,
} from '@oryx/shared';

type Tab = 'accounting' | 'sales' | 'purchasing' | 'inventory';

export default function ReportsPage() {
  const { t } = useUi();
  const [tab, setTab] = useState<Tab>('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = { from: from || undefined, to: to || undefined };

  const accounting = useAsync<AccountingReportDto>(() => api.reportAccounting(params), [from, to]);
  const sales = useAsync<SalesReportDto>(() => api.reportSales(params), [from, to]);
  const purchasing = useAsync<PurchasingReportDto>(() => api.reportPurchasing(params), [from, to]);
  const inventory = useAsync<InventoryReportDto>(() => api.reportInventory(params), [from, to]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'sales', label: t('erp.reports.sales') },
    { key: 'purchasing', label: t('erp.reports.purchasing') },
    { key: 'inventory', label: t('erp.reports.inventory') },
    { key: 'accounting', label: t('erp.reports.accounting') },
  ];

  const reloadAll = () => {
    void sales.reload();
    void purchasing.reload();
    void inventory.reload();
    void accounting.reload();
  };

  return (
    <div className="flex flex-col gap-5" data-testid="reports-page">
      <SectionHeader
        title={t('nav.reports_analytics')}
        subtitle={t('erp.reports.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px]">
            <span className="oryx-label">{t('erp.reports.from')}</span>
            <input type="date" className="oryx-input" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from" />
          </label>
          <label className="min-w-[170px]">
            <span className="oryx-label">{t('erp.reports.to')}</span>
            <input type="date" className="oryx-input" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to" />
          </label>
          <Button size="sm" onClick={reloadAll}>
            {t('common.refresh')}
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`reports-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'sales' ? (
        <Card>
          {sales.error ? <div className="p-4"><ErrorBanner message={sales.error} onRetry={sales.reload} /></div> : null}
          {sales.loading ? <div className="p-4"><Skeleton height={200} /></div> : !sales.data ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <>
              <div className="grid gap-4 border-b border-[var(--border)] p-4 sm:grid-cols-4">
                <Kpi label={t('erp.reports.totalSales')} value={money(sales.data.totalSalesMinor)} testId="kpi-sales-total" />
                <Kpi label={t('erp.reports.totalTax')} value={money(sales.data.totalTaxMinor)} />
                <Kpi label={t('erp.reports.collected')} value={money(sales.data.totalPaidMinor)} />
                <Kpi label={t('erp.reports.outstanding')} value={money(sales.data.totalOutstandingMinor)} />
              </div>
              <div className="border-b border-[var(--border)] p-4">
                <p className="oryx-panel-title m-0 mb-3">{t('erp.reports.byCustomer')}</p>
                {sales.data.byCustomer.length === 0 ? (
                  <p className="oryx-muted m-0 text-[12.5px]">{t('common.empty')}</p>
                ) : (
                  <TableShell>
                    <thead>
                      <tr>
                        <th>{t('erp.sales.customer')}</th>
                        <th>{t('erp.reports.invoices')}</th>
                        <th>{t('erp.sales.total')}</th>
                        <th>{t('erp.reports.collected')}</th>
                        <th>{t('erp.reports.outstanding')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.data.byCustomer.map((c) => (
                        <tr key={c.customerId} data-testid={`report-customer-${c.customerId}`}>
                          <td>{c.nameEn}</td>
                          <td className="tabular-nums text-[12.5px]">{c.invoiceCount}</td>
                          <td className="tabular-nums text-[12.5px] font-semibold">{money(c.totalMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(c.paidMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(c.outstandingMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </div>
              <div className="p-4">
                <p className="oryx-panel-title m-0 mb-3">{t('erp.reports.byBranch')}</p>
                {sales.data.byBranch.length === 0 ? (
                  <p className="oryx-muted m-0 text-[12.5px]">{t('common.empty')}</p>
                ) : (
                  <TableShell>
                    <thead>
                      <tr>
                        <th>{t('erp.inventory.branch')}</th>
                        <th>{t('erp.reports.invoices')}</th>
                        <th>{t('erp.sales.total')}</th>
                        <th>{t('erp.reports.totalTax')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.data.byBranch.map((b, i) => (
                        <tr key={b.branchId ?? i}>
                          <td>{b.nameEn}</td>
                          <td className="tabular-nums text-[12.5px]">{b.invoiceCount}</td>
                          <td className="tabular-nums text-[12.5px] font-semibold">{money(b.totalMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(b.taxMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </div>
            </>
          )}
        </Card>
      ) : null}

      {tab === 'purchasing' ? (
        <Card>
          {purchasing.error ? <div className="p-4"><ErrorBanner message={purchasing.error} onRetry={purchasing.reload} /></div> : null}
          {purchasing.loading ? <div className="p-4"><Skeleton height={200} /></div> : !purchasing.data ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <>
              <div className="grid gap-4 border-b border-[var(--border)] p-4 sm:grid-cols-4">
                <Kpi label={t('erp.reports.ordered')} value={money(purchasing.data.totalOrderedMinor)} testId="kpi-purchasing-ordered" />
                <Kpi label={t('erp.reports.invoiced')} value={money(purchasing.data.totalInvoicedMinor)} />
                <Kpi label={t('erp.reports.paid')} value={money(purchasing.data.totalPaidMinor)} />
                <Kpi label={t('erp.reports.outstanding')} value={money(purchasing.data.totalOutstandingMinor)} />
              </div>
              <div className="p-4">
                <p className="oryx-panel-title m-0 mb-3">{t('erp.reports.bySupplier')}</p>
                {purchasing.data.bySupplier.length === 0 ? (
                  <p className="oryx-muted m-0 text-[12.5px]">{t('common.empty')}</p>
                ) : (
                  <TableShell>
                    <thead>
                      <tr>
                        <th>{t('erp.purchasing.supplier')}</th>
                        <th>{t('erp.reports.ordered')}</th>
                        <th>{t('erp.reports.invoiced')}</th>
                        <th>{t('erp.reports.paid')}</th>
                        <th>{t('erp.reports.outstanding')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasing.data.bySupplier.map((s) => (
                        <tr key={s.supplierId} data-testid={`report-supplier-${s.supplierId}`}>
                          <td>{s.nameEn}</td>
                          <td className="tabular-nums text-[12.5px]">{money(s.orderedMinor)}</td>
                          <td className="tabular-nums text-[12.5px] font-semibold">{money(s.invoicedMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(s.paidMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(s.outstandingMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </div>
            </>
          )}
        </Card>
      ) : null}

      {tab === 'inventory' ? (
        <Card>
          {inventory.error ? <div className="p-4"><ErrorBanner message={inventory.error} onRetry={inventory.reload} /></div> : null}
          {inventory.loading ? <div className="p-4"><Skeleton height={200} /></div> : !inventory.data ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <>
              <div className="grid gap-4 border-b border-[var(--border)] p-4 sm:grid-cols-3">
                <Kpi label={t('erp.inventory.totalValue')} value={money(inventory.data.totalValueMinor)} testId="kpi-inventory-value" />
                <Kpi label={t('erp.inventory.totalQty')} value={qty(inventory.data.totalQuantity)} />
                <Kpi label={t('erp.inventory.reorder')} value={String(inventory.data.reorderAlerts.length)} />
              </div>
              <div className="border-b border-[var(--border)] p-4">
                <p className="oryx-panel-title m-0 mb-3">{t('erp.inventory.valuation')}</p>
                {inventory.data.valuation.length === 0 ? (
                  <p className="oryx-muted m-0 text-[12.5px]">{t('common.empty')}</p>
                ) : (
                  <TableShell>
                    <thead>
                      <tr>
                        <th>{t('erp.inventory.sku')}</th>
                        <th>{t('erp.inventory.warehouse')}</th>
                        <th>{t('erp.inventory.onHand')}</th>
                        <th>{t('erp.inventory.avgCost')}</th>
                        <th>{t('erp.inventory.value')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.data.valuation.slice(0, 20).map((r) => (
                        <tr key={`${r.warehouseId}-${r.productId}`}>
                          <td className="font-mono text-[12px]">{r.sku}</td>
                          <td className="text-[12.5px]">{r.warehouseCode}</td>
                          <td className="tabular-nums text-[12.5px]">{qty(r.quantity)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(r.averageCostMinor)}</td>
                          <td className="tabular-nums text-[12.5px] font-semibold">{money(r.valueMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </div>
              <div className="p-4">
                <p className="oryx-panel-title m-0 mb-3">{t('erp.inventory.reorder')}</p>
                {inventory.data.reorderAlerts.length === 0 ? (
                  <p className="oryx-muted m-0 text-[12.5px]">{t('erp.inventory.noAlerts')}</p>
                ) : (
                  <TableShell>
                    <thead>
                      <tr>
                        <th>{t('erp.inventory.sku')}</th>
                        <th>{t('erp.inventory.onHand')}</th>
                        <th>{t('erp.inventory.reorderLevel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.data.reorderAlerts.map((a) => (
                        <tr key={a.sku}>
                          <td className="font-mono text-[12px]">{a.sku}</td>
                          <td className="tabular-nums text-[12.5px]">{qty(a.onHand)}</td>
                          <td className="tabular-nums text-[12.5px]">{qty(a.reorderLevel)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </div>
            </>
          )}
        </Card>
      ) : null}

      {tab === 'accounting' ? (
        <Card>
          {accounting.error ? <div className="p-4"><ErrorBanner message={accounting.error} onRetry={accounting.reload} /></div> : null}
          {accounting.loading ? <div className="p-4"><Skeleton height={200} /></div> : !accounting.data ? (
            <EmptyState title={t('common.empty')} />
          ) : (
            <>
              <div className="grid gap-4 border-b border-[var(--border)] p-4 sm:grid-cols-4">
                <Kpi label={t('erp.reports.journals')} value={String(accounting.data.journalCount)} testId="kpi-journal-count" />
                <Kpi label={t('erp.accounting.debit')} value={money(accounting.data.totalDebitMinor)} />
                <Kpi label={t('erp.accounting.credit')} value={money(accounting.data.totalCreditMinor)} />
                <div>
                  <p className="oryx-label">{t('erp.accounting.balanced')}</p>
                  <Badge tone={accounting.data.balanced ? 'success' : 'danger'} data-testid="report-accounting-balanced">
                    {accounting.data.balanced ? t('erp.accounting.balanced') : t('erp.accounting.unbalanced')}
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                <p className="oryx-panel-title m-0 mb-3">{t('erp.reports.bySource')}</p>
                <TableShell>
                  <thead>
                    <tr>
                      <th>{t('erp.accounting.source')}</th>
                      <th>{t('erp.reports.journals')}</th>
                      <th>{t('erp.accounting.debit')}</th>
                      <th>{t('erp.accounting.credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounting.data.bySourceType.map((s) => (
                      <tr key={s.sourceType}>
                        <td><Badge tone="info">{s.sourceType}</Badge></td>
                        <td className="tabular-nums text-[12.5px]">{s.count}</td>
                        <td className="tabular-nums text-[12.5px]">{money(s.debitMinor)}</td>
                        <td className="tabular-nums text-[12.5px]">{money(s.creditMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </div>
            </>
          )}
        </Card>
      ) : null}

      <span className="hidden">
        <Field label="hidden">
          <input className="oryx-input" readOnly />
        </Field>
      </span>
    </div>
  );
}

function Kpi({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div data-testid={testId}>
      <p className="oryx-label">{label}</p>
      <p className="m-0 text-[19px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
