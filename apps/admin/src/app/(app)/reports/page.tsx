'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, qty } from '@/lib/erp-format';
import { exportCsv, printDocument } from '@/lib/print';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
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
  const { t, locale } = useUi();
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

  const windowLabel = `${from || '—'} → ${to || '—'}`;

  const printReport = () => {
    const footer = new Date().toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB');
    if (tab === 'sales' && sales.data) {
      const d = sales.data;
      printDocument({
        title: t('erp.reports.sales'),
        subtitle: windowLabel,
        locale,
        footer,
        sections: [
          {
            heading: t('erp.reports.sales'),
            fields: [
              { label: t('erp.reports.invoices'), value: String(d.invoiceCount) },
              { label: t('erp.reports.totalSales'), value: money(d.totalSalesMinor) },
              { label: t('erp.reports.totalTax'), value: money(d.totalTaxMinor) },
              { label: t('erp.reports.collected'), value: money(d.totalPaidMinor) },
              { label: t('erp.reports.outstanding'), value: money(d.totalOutstandingMinor) },
            ],
            table: {
              columns: [
                { header: t('erp.sales.customer'), value: (r) => String(r.nameEn) },
                { header: t('erp.reports.invoices'), value: (r) => String(r.invoiceCount) },
                { header: t('erp.sales.total'), value: (r) => money(Number(r.totalMinor)), align: 'end' },
                { header: t('erp.reports.collected'), value: (r) => money(Number(r.paidMinor)), align: 'end' },
                { header: t('erp.reports.outstanding'), value: (r) => money(Number(r.outstandingMinor)), align: 'end' },
              ],
              rows: d.byCustomer as unknown as Array<Record<string, unknown>>,
            },
          },
          {
            heading: t('erp.reports.byBranch'),
            table: {
              columns: [
                { header: t('erp.inventory.branch'), value: (r) => String(r.nameEn) },
                { header: t('erp.reports.invoices'), value: (r) => String(r.invoiceCount) },
                { header: t('erp.sales.total'), value: (r) => money(Number(r.totalMinor)), align: 'end' },
                { header: t('erp.reports.totalTax'), value: (r) => money(Number(r.taxMinor)), align: 'end' },
              ],
              rows: d.byBranch as unknown as Array<Record<string, unknown>>,
            },
          },
        ],
      });
      return;
    }
    if (tab === 'purchasing' && purchasing.data) {
      const d = purchasing.data;
      printDocument({
        title: t('erp.reports.purchasing'),
        subtitle: windowLabel,
        locale,
        footer,
        sections: [
          {
            heading: t('erp.reports.purchasing'),
            fields: [
              { label: t('erp.purchasing.orders'), value: String(d.orderCount) },
              { label: t('erp.reports.ordered'), value: money(d.totalOrderedMinor) },
              { label: t('erp.reports.invoiced'), value: money(d.totalInvoicedMinor) },
              { label: t('erp.reports.paid'), value: money(d.totalPaidMinor) },
              { label: t('erp.reports.outstanding'), value: money(d.totalOutstandingMinor) },
            ],
            table: {
              columns: [
                { header: t('erp.purchasing.supplier'), value: (r) => String(r.nameEn) },
                { header: t('erp.reports.ordered'), value: (r) => money(Number(r.orderedMinor)), align: 'end' },
                { header: t('erp.reports.invoiced'), value: (r) => money(Number(r.invoicedMinor)), align: 'end' },
                { header: t('erp.reports.paid'), value: (r) => money(Number(r.paidMinor)), align: 'end' },
                { header: t('erp.reports.outstanding'), value: (r) => money(Number(r.outstandingMinor)), align: 'end' },
              ],
              rows: d.bySupplier as unknown as Array<Record<string, unknown>>,
            },
          },
        ],
      });
      return;
    }
    if (tab === 'inventory' && inventory.data) {
      const d = inventory.data;
      printDocument({
        title: t('erp.reports.inventory'),
        subtitle: windowLabel,
        locale,
        footer,
        sections: [
          {
            heading: t('erp.reports.inventory'),
            fields: [
              { label: t('erp.inventory.totalValue'), value: money(d.totalValueMinor) },
              { label: t('erp.inventory.totalQty'), value: qty(d.totalQuantity) },
              { label: t('erp.inventory.reorder'), value: String(d.reorderAlerts.length) },
            ],
            table: {
              columns: [
                { header: t('erp.inventory.sku'), value: (r) => String(r.sku) },
                { header: t('erp.inventory.warehouse'), value: (r) => String(r.warehouseCode) },
                { header: t('erp.inventory.onHand'), value: (r) => qty(Number(r.quantity)), align: 'end' },
                { header: t('erp.inventory.avgCost'), value: (r) => money(Number(r.averageCostMinor)), align: 'end' },
                { header: t('erp.inventory.value'), value: (r) => money(Number(r.valueMinor)), align: 'end' },
              ],
              rows: d.valuation as unknown as Array<Record<string, unknown>>,
            },
          },
        ],
      });
      return;
    }
    if (tab === 'accounting' && accounting.data) {
      const d = accounting.data;
      printDocument({
        title: t('erp.reports.accounting'),
        subtitle: windowLabel,
        locale,
        footer,
        sections: [
          {
            heading: t('erp.reports.accounting'),
            fields: [
              { label: t('erp.reports.journals'), value: String(d.journalCount) },
              { label: t('erp.accounting.debit'), value: money(d.totalDebitMinor) },
              { label: t('erp.accounting.credit'), value: money(d.totalCreditMinor) },
              { label: t('erp.accounting.balanced'), value: d.balanced ? t('common.yes') : t('common.no') },
            ],
            table: {
              columns: [
                { header: t('erp.accounting.source'), value: (r) => String(r.sourceType) },
                { header: t('erp.reports.journals'), value: (r) => String(r.count) },
                { header: t('erp.accounting.debit'), value: (r) => money(Number(r.debitMinor)), align: 'end' },
                { header: t('erp.accounting.credit'), value: (r) => money(Number(r.creditMinor)), align: 'end' },
              ],
              rows: d.bySourceType as unknown as Array<Record<string, unknown>>,
            },
          },
        ],
      });
    }
  };

  const exportReport = () => {
    if (tab === 'sales' && sales.data) {
      exportCsv(
        'sales-report',
        [t('erp.sales.customer'), t('erp.reports.invoices'), t('erp.sales.total'), t('erp.reports.collected'), t('erp.reports.outstanding')],
        sales.data.byCustomer.map((c) => [c.nameEn, String(c.invoiceCount), money(c.totalMinor), money(c.paidMinor), money(c.outstandingMinor)]),
      );
      return;
    }
    if (tab === 'purchasing' && purchasing.data) {
      exportCsv(
        'purchasing-report',
        [t('erp.purchasing.supplier'), t('erp.reports.ordered'), t('erp.reports.invoiced'), t('erp.reports.paid'), t('erp.reports.outstanding')],
        purchasing.data.bySupplier.map((s) => [s.nameEn, money(s.orderedMinor), money(s.invoicedMinor), money(s.paidMinor), money(s.outstandingMinor)]),
      );
      return;
    }
    if (tab === 'inventory' && inventory.data) {
      exportCsv(
        'inventory-report',
        [t('erp.inventory.sku'), t('erp.inventory.warehouse'), t('erp.inventory.onHand'), t('erp.inventory.avgCost'), t('erp.inventory.value')],
        inventory.data.valuation.map((r) => [r.sku, r.warehouseCode, qty(r.quantity), money(r.averageCostMinor), money(r.valueMinor)]),
      );
      return;
    }
    if (tab === 'accounting' && accounting.data) {
      exportCsv(
        'accounting-report',
        [t('erp.accounting.source'), t('erp.reports.journals'), t('erp.accounting.debit'), t('erp.accounting.credit')],
        accounting.data.bySourceType.map((r) => [r.sourceType, String(r.count), money(r.debitMinor), money(r.creditMinor)]),
      );
    }
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
          <div className="ms-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={exportReport} data-testid="report-export">
              {t('attach.exportCsv')}
            </Button>
            <Button size="sm" variant="primary" onClick={printReport} data-testid="report-print">
              <Icon name="scroll" size={14} />
              {t('attach.print')}
            </Button>
          </div>
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
