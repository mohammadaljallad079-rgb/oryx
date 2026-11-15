'use client';

import { useMemo, useState } from 'react';
import type { AgingRowDto, ReportColumn, ReportDefinition, ReportResultDto } from '@oryx/shared';
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
  Modal,
  SectionHeader,
  Skeleton,
  StatCard,
  StatGrid,
  TableShell,
} from '@/components/ui';
import { Icon } from '@/components/icons';

/**
 * The Reports workspace.
 *
 * A catalogue of reports, each resolved from live data by the API and exported
 * as a print-ready PDF or a CSV. The catalogue comes from the server
 * (`GET /reports/catalogue`), so a report added to the shared definition appears
 * here without a second list; the page never invents a report the API cannot
 * produce.
 *
 * The operational summaries below the catalogue are the ERP core's own KPI
 * endpoints, kept as a quick overview beside the detailed, exportable reports.
 */

type LegacyTab = 'accounting' | 'sales' | 'purchasing' | 'inventory' | 'aging';

export default function ReportsPage() {
  const { t, locale } = useUi();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [legacyTab, setLegacyTab] = useState<LegacyTab>('sales');

  const params = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to]);

  const catalogue = useAsync<{ reports: ReportDefinition[] }>(() => api.reportCatalogue(), []);
  const definitions = useMemo(() => catalogue.data?.reports ?? [], [catalogue.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return definitions.filter((d) => {
      if (group !== 'all' && d.group !== group) return false;
      if (!needle) return true;
      const hay = `${d.titleEn} ${d.titleAr} ${d.descriptionEn}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [definitions, group, search]);

  const activeKind = selected ?? filtered[0]?.kind ?? null;
  const activeDefinition = definitions.find((d) => d.kind === activeKind) ?? null;
  const report = useAsync<ReportResultDto | null>(
    () => (activeKind ? api.reportData(activeKind, params) : Promise.resolve(null)),
    [activeKind, from, to],
  );

  const groups = [
    { key: 'all', label: t('erp.reports.group.all') },
    ...(['SALES', 'PURCHASING', 'INVENTORY', 'ACCOUNTING', 'RECEIVABLES'] as const).map((g) => ({
      key: g,
      label: t(`erp.reports.group.${g}`),
    })),
  ];

  const exportCsv = async (kind: string) => {
    setBusy(`csv-${kind}`);
    try {
      await api.downloadReportCsv(kind, params);
    } finally {
      setBusy(null);
    }
  };

  const openPdf = async (kind: string) => {
    setBusy(`pdf-${kind}`);
    try {
      const url = await api.reportPdfBlobUrl(kind, params);
      window.open(url, '_blank', 'noopener');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="reports-page">
      <SectionHeader
        title={t('nav.reports_analytics')}
        subtitle={t('erp.reports.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[170px]">
            <span className="oryx-label">{t('erp.reports.from')}</span>
            <input
              type="date"
              className="oryx-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="report-from"
            />
          </label>
          <label className="min-w-[170px]">
            <span className="oryx-label">{t('erp.reports.to')}</span>
            <input
              type="date"
              className="oryx-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="report-to"
            />
          </label>
          <Button size="sm" variant="primary" onClick={() => void report.reload()} data-testid="report-refresh">
            <Icon name="refresh" size={14} /> {t('common.refresh')}
          </Button>
        </div>
      </Card>

      {/* The catalogue: a searchable, grouped index of every report. */}
      <Card className="p-4" data-testid="report-catalogue">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="oryx-panel-title m-0">{t('erp.reports.catalogue')}</p>
            <p className="oryx-muted m-0 mt-1 text-[12.5px]">{t('erp.reports.catalogueHint')}</p>
          </div>
          <label className="min-w-[220px]">
            <input
              type="search"
              className="oryx-input"
              placeholder={t('erp.reports.searchReports')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="report-search"
            />
          </label>
        </div>

        <div className="mb-3 flex flex-wrap gap-2" role="tablist">
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={group === g.key}
              className={`oryx-btn oryx-btn--sm ${group === g.key ? 'oryx-btn--primary' : ''}`}
              onClick={() => setGroup(g.key)}
              data-testid={`reports-group-${g.key}`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {catalogue.error ? (
          <ErrorBanner message={catalogue.error} onRetry={catalogue.reload} />
        ) : catalogue.loading && definitions.length === 0 ? (
          <Skeleton height={180} />
        ) : filtered.length === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="report-list">
            {filtered.map((d) => (
              <div
                key={d.kind}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(d.kind)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelected(d.kind);
                }}
                className={`oryx-report-tile ${activeKind === d.kind ? 'oryx-report-tile--active' : ''}`}
                data-testid={`report-tile-${d.kind}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="oryx-report-tile__title">{locale === 'ar' ? d.titleAr : d.titleEn}</span>
                  <Badge tone={d.detail ? 'info' : 'neutral'}>
                    {d.detail ? t('erp.reports.detail') : t('erp.reports.summary')}
                  </Badge>
                </span>
                <span className="oryx-report-tile__desc">{locale === 'ar' ? d.descriptionAr : d.descriptionEn}</span>
                <span className="oryx-report-tile__actions">
                  <button
                    type="button"
                    className="oryx-report-tile__action"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openPdf(d.kind);
                    }}
                    data-testid={`report-pdf-${d.kind}`}
                  >
                    <Icon name="download" size={13} /> {t('erp.reports.exportPdf')}
                  </button>
                  <button
                    type="button"
                    className="oryx-report-tile__action"
                    onClick={(e) => {
                      e.stopPropagation();
                      void exportCsv(d.kind);
                    }}
                    data-testid={`report-csv-${d.kind}`}
                  >
                    <Icon name="download" size={13} /> {t('erp.reports.exportCsv')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* The selected report: its rows, its totals, and its export controls. */}
      {activeKind && activeDefinition ? (
        <Card data-testid="report-detail">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-4">
            <div>
              <p className="oryx-panel-title m-0">
                {locale === 'ar' ? activeDefinition.titleAr : activeDefinition.titleEn}
              </p>
              <p className="oryx-muted m-0 mt-1 text-[12.5px]">
                {locale === 'ar' ? activeDefinition.descriptionAr : activeDefinition.descriptionEn}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setPreviewKind(activeKind)} data-testid="report-preview">
                <Icon name="eye" size={14} /> {t('erp.reports.preview')}
              </Button>
              <Button size="sm" onClick={() => void exportCsv(activeKind)} disabled={busy === `csv-${activeKind}`} data-testid="report-csv">
                <Icon name="download" size={14} /> {t('erp.reports.exportCsv')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void openPdf(activeKind)} disabled={busy === `pdf-${activeKind}`} data-testid="report-pdf">
                <Icon name="print" size={14} /> {t('erp.reports.exportPdf')}
              </Button>
            </div>
          </div>

          {report.error ? (
            <div className="p-4">
              <ErrorBanner message={report.error} onRetry={report.reload} />
            </div>
          ) : report.loading ? (
            <div className="p-4">
              <Skeleton height={200} />
            </div>
          ) : !report.data ? (
            <EmptyState title={t('erp.reports.chooseReport')} />
          ) : (
            <>
              <div className="border-b border-[var(--border)] p-4">
                <StatGrid>
                  <StatCard icon="list" label={t('erp.reports.rows')} value={String(report.data.rowCount)} data-testid="report-row-count" />
                  <StatCard
                    icon="calendar"
                    label={t('erp.reports.period')}
                    value={
                      report.data.from || report.data.to
                        ? `${report.data.from?.slice(0, 10) ?? '…'} → ${report.data.to?.slice(0, 10) ?? '…'}`
                        : t('erp.reports.allPeriods')
                    }
                  />
                  <StatCard icon="wallet" label={t('erp.reports.totals')} value={String(Object.keys(report.data.totals).length)} />
                  <StatCard
                    icon="scroll"
                    label={t('erp.reports.generatedAt')}
                    value={report.data.generatedAt.slice(0, 16).replace('T', ' ')}
                  />
                </StatGrid>
              </div>

              <div className="p-4">
                {report.data.rows.length === 0 ? (
                  <p className="oryx-muted m-0 text-[12.5px]" data-testid="report-empty">
                    {t('erp.reports.noRows')}
                  </p>
                ) : (
                  <ReportTable result={report.data} locale={locale} />
                )}
                {report.data.truncated ? (
                  <p className="oryx-faint m-0 mt-3 text-[12px]">
                    {t('erp.reports.truncated', { shown: report.data.rows.length, total: report.data.rowCount })}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </Card>
      ) : null}

      {/* The operational summaries, preserved from the ERP core. */}
      <LegacySummaries tab={legacyTab} setTab={setLegacyTab} from={from} to={to} />

      <ReportPreviewModal
        kind={previewKind}
        params={params}
        onClose={() => setPreviewKind(null)}
        title={activeDefinition ? (locale === 'ar' ? activeDefinition.titleAr : activeDefinition.titleEn) : ''}
      />
    </div>
  );
}

/** The detail table for a report, with a footer carrying the server's totals. */
function ReportTable({ result, locale }: { result: ReportResultDto; locale: string }) {
  const { t } = useUi();
  const firstTotalIndex = result.columns.findIndex((c) => c.total);
  const formatCell = (column: ReportColumn, value: unknown): string => {
    if (value === null || value === undefined) return '—';
    switch (column.format) {
      case 'money':
        return money(typeof value === 'number' ? value : 0, result.currency);
      case 'quantity':
        return qty(typeof value === 'number' ? value : 0);
      case 'percent':
        return `${typeof value === 'number' ? value.toFixed(2) : '0.00'}%`;
      case 'date':
        return typeof value === 'string' ? value.slice(0, 10) : String(value);
      case 'datetime':
        return typeof value === 'string' ? value.slice(0, 16).replace('T', ' ') : String(value);
      default:
        return String(value);
    }
  };

  return (
    <TableShell>
      <thead>
        <tr>
          <th className="w-[42px]">#</th>
          {result.columns.map((c) => (
            <th key={c.key} className={c.align === 'end' ? 'text-end' : ''}>
              {locale === 'ar' ? c.labelAr : c.labelEn}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, index) => (
          <tr key={index} data-testid={`report-row-${index}`}>
            <td className="tabular-nums text-[12px] text-[var(--muted)]">{index + 1}</td>
            {result.columns.map((c) => (
              <td key={c.key} className={c.align === 'end' ? 'tabular-nums text-end text-[12.5px]' : 'text-[12.5px]'}>
                {formatCell(c, row[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {firstTotalIndex >= 0 ? (
        <tfoot>
          <tr data-testid="report-totals">
            <td />
            <td colSpan={firstTotalIndex} className="font-semibold">
              {t('erp.reports.total')}
            </td>
            {result.columns.slice(firstTotalIndex).map((c) => (
              <td key={c.key} className={c.align === 'end' ? 'tabular-nums text-end font-semibold' : 'font-semibold'}>
                {c.total ? formatCell(c, result.totals[c.key] ?? 0) : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </TableShell>
  );
}

/** A modal that previews a report's print-ready PDF. */
function ReportPreviewModal({
  kind,
  params,
  onClose,
  title,
}: {
  kind: string | null;
  params: Record<string, unknown>;
  onClose: () => void;
  title: string;
}) {
  const { t } = useUi();
  const url = useAsync<string | null>(
    () => (kind ? api.reportPdfBlobUrl(kind, params) : Promise.resolve(null)),
    [kind, params.from, params.to],
  );

  return (
    <Modal
      open={kind !== null}
      title={`${t('erp.reports.previewTitle')} — ${title}`}
      onClose={onClose}
      size="full"
      footer={
        <>
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
          {url.data ? (
            <Button size="sm" variant="primary" onClick={() => window.open(url.data!, '_blank', 'noopener')}>
              <Icon name="print" size={14} /> {t('erp.reports.print')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="min-h-[60vh]" data-testid="report-preview-body">
        {url.error ? (
          <ErrorBanner message={url.error} onRetry={url.reload} />
        ) : url.loading || !url.data ? (
          <Skeleton height={400} />
        ) : (
          <iframe
            title={t('erp.reports.previewTitle')}
            src={url.data}
            className="h-[70vh] w-full rounded-md border border-[var(--border)]"
          />
        )}
      </div>
    </Modal>
  );
}

/** The preserved ERP-core summaries: KPI tiles plus the per-module tables. */
function LegacySummaries({
  tab,
  setTab,
  from,
  to,
}: {
  tab: LegacyTab;
  setTab: (t: LegacyTab) => void;
  from: string;
  to: string;
}) {
  const { t } = useUi();
  const params = { from: from || undefined, to: to || undefined };
  const sales = useAsync(() => api.reportSales(params), [from, to]);
  const purchasing = useAsync(() => api.reportPurchasing(params), [from, to]);
  const inventory = useAsync(() => api.reportInventory(params), [from, to]);
  const accounting = useAsync(() => api.reportAccounting(params), [from, to]);
  const receivables = useAsync(() => api.receivablesAging(), []);
  const payables = useAsync(() => api.payablesAging(), []);

  const tabs: Array<{ key: LegacyTab; label: string }> = [
    { key: 'sales', label: t('erp.reports.sales') },
    { key: 'purchasing', label: t('erp.reports.purchasing') },
    { key: 'inventory', label: t('erp.reports.inventory') },
    { key: 'accounting', label: t('erp.reports.accounting') },
    { key: 'aging', label: t('erp.reports.aging') },
  ];

  return (
    <Card className="p-4" data-testid="reports-legacy">
      <div className="mb-3">
        <p className="oryx-panel-title m-0">{t('erp.reports.legacyTitle')}</p>
        <p className="oryx-muted m-0 mt-1 text-[12.5px]">{t('erp.reports.quickHint')}</p>
      </div>

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

      <div className="mt-3">
        {tab === 'sales' ? (
          <div className="flex flex-col gap-3">
            {sales.error ? <ErrorBanner message={sales.error} onRetry={sales.reload} /> : null}
            {sales.loading ? (
              <Skeleton height={160} />
            ) : sales.data ? (
              <>
                <StatGrid>
                  <StatCard tone="gold" icon="cart" label={t('erp.reports.totalSales')} value={money(sales.data.totalSalesMinor)} />
                  <StatCard icon="scroll" label={t('erp.reports.totalTax')} value={money(sales.data.totalTaxMinor)} />
                  <StatCard tone="success" icon="wallet" label={t('erp.reports.collected')} value={money(sales.data.totalPaidMinor)} />
                  <StatCard tone="danger" icon="clock" label={t('erp.reports.outstanding')} value={money(sales.data.totalOutstandingMinor)} />
                </StatGrid>
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
                        <tr key={c.customerId}>
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
              </>
            ) : (
              <EmptyState title={t('common.empty')} />
            )}
          </div>
        ) : null}

        {tab === 'purchasing' ? (
          <div className="flex flex-col gap-3">
            {purchasing.error ? <ErrorBanner message={purchasing.error} onRetry={purchasing.reload} /> : null}
            {purchasing.loading ? (
              <Skeleton height={160} />
            ) : purchasing.data ? (
              <>
                <StatGrid>
                  <StatCard icon="truck" label={t('erp.reports.ordered')} value={money(purchasing.data.totalOrderedMinor)} />
                  <StatCard icon="scroll" label={t('erp.reports.invoiced')} value={money(purchasing.data.totalInvoicedMinor)} />
                  <StatCard tone="success" icon="wallet" label={t('erp.reports.paid')} value={money(purchasing.data.totalPaidMinor)} />
                  <StatCard tone="danger" icon="clock" label={t('erp.reports.outstanding')} value={money(purchasing.data.totalOutstandingMinor)} />
                </StatGrid>
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
                        <tr key={s.supplierId}>
                          <td>{s.nameEn}</td>
                          <td className="tabular-nums text-[12.5px]">{money(s.orderedMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(s.invoicedMinor)}</td>
                          <td className="tabular-nums text-[12.5px]">{money(s.paidMinor)}</td>
                          <td className="tabular-nums text-[12.5px] font-semibold">{money(s.outstandingMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                )}
              </>
            ) : (
              <EmptyState title={t('common.empty')} />
            )}
          </div>
        ) : null}

        {tab === 'inventory' ? (
          <div className="flex flex-col gap-3">
            {inventory.error ? <ErrorBanner message={inventory.error} onRetry={inventory.reload} /> : null}
            {inventory.loading ? (
              <Skeleton height={160} />
            ) : inventory.data ? (
              <>
                <StatGrid>
                  <StatCard tone="gold" icon="warehouse" label={t('erp.inventory.totalValue')} value={money(inventory.data.totalValueMinor)} />
                  <StatCard icon="package" label={t('erp.inventory.totalQty')} value={qty(inventory.data.totalQuantity)} />
                </StatGrid>
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
              </>
            ) : (
              <EmptyState title={t('common.empty')} />
            )}
          </div>
        ) : null}

        {tab === 'accounting' ? (
          <div className="flex flex-col gap-3">
            {accounting.error ? <ErrorBanner message={accounting.error} onRetry={accounting.reload} /> : null}
            {accounting.loading ? (
              <Skeleton height={160} />
            ) : accounting.data ? (
              <>
                <StatGrid>
                  <StatCard icon="scroll" label={t('erp.reports.journals')} value={String(accounting.data.journalCount)} />
                  <StatCard icon="calculator" label={t('erp.accounting.debit')} value={money(accounting.data.totalDebitMinor)} />
                  <StatCard icon="calculator" label={t('erp.accounting.credit')} value={money(accounting.data.totalCreditMinor)} />
                  <StatCard
                    icon="shield"
                    tone={accounting.data.balanced ? 'success' : 'danger'}
                    label={t('erp.accounting.balanced')}
                    value={
                      <Badge tone={accounting.data.balanced ? 'success' : 'danger'} data-testid="report-accounting-balanced">
                        {accounting.data.balanced ? t('erp.accounting.balanced') : t('erp.accounting.unbalanced')}
                      </Badge>
                    }
                  />
                </StatGrid>
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
                        <td>
                          <Badge tone="info">{s.sourceType}</Badge>
                        </td>
                        <td className="tabular-nums text-[12.5px]">{s.count}</td>
                        <td className="tabular-nums text-[12.5px]">{money(s.debitMinor)}</td>
                        <td className="tabular-nums text-[12.5px]">{money(s.creditMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </>
            ) : (
              <EmptyState title={t('common.empty')} />
            )}
          </div>
        ) : null}

        {tab === 'aging' ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="oryx-panel-title m-0 mb-3">{t('erp.reports.receivablesAging')}</p>
              <AgingTable
                rows={receivables.data}
                loading={receivables.loading}
                error={receivables.error}
                onRetry={receivables.reload}
                partyLabel={t('erp.sales.customer')}
              />
            </div>
            <div>
              <p className="oryx-panel-title m-0 mb-3">{t('erp.reports.payablesAging')}</p>
              <AgingTable
                rows={payables.data}
                loading={payables.loading}
                error={payables.error}
                onRetry={payables.reload}
                partyLabel={t('erp.purchasing.supplier')}
              />
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Outstanding balances grouped by how far past due they are. */
function AgingTable({
  rows,
  loading,
  error,
  onRetry,
  partyLabel,
}: {
  rows: AgingRowDto[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  partyLabel: string;
}) {
  const { t } = useUi();
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (loading) return <Skeleton height={160} />;
  if (!rows || rows.length === 0) return <p className="oryx-muted m-0 text-[12.5px]">{t('common.empty')}</p>;
  const total = rows.reduce((s, r) => s + r.outstandingMinor, 0);
  return (
    <>
      <p className="oryx-faint m-0 mb-2 text-[12px]">
        {t('erp.reports.outstandingTotal')}: <span className="tabular-nums font-semibold">{money(total)}</span>
      </p>
      <TableShell>
        <thead>
          <tr>
            <th>{t('erp.sales.invoiceNumber')}</th>
            <th>{partyLabel}</th>
            <th>{t('common.date')}</th>
            <th>{t('erp.sales.dueDate')}</th>
            <th>{t('erp.reports.daysOverdue')}</th>
            <th>{t('erp.sales.outstanding')}</th>
            <th>{t('erp.reports.bucket')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`aging-row-${r.invoiceNumber}`}>
              <td className="font-mono text-[12px]">{r.invoiceNumber}</td>
              <td className="text-[12.5px]">{r.customerNameEn ?? r.supplierNameEn ?? '—'}</td>
              <td className="text-[12.5px]">{r.invoiceDate.slice(0, 10)}</td>
              <td className="text-[12.5px]">{r.dueDate ? r.dueDate.slice(0, 10) : '—'}</td>
              <td className="tabular-nums text-[12.5px]">{r.daysOverdue > 0 ? r.daysOverdue : 0}</td>
              <td className="tabular-nums text-[12.5px] font-semibold">{money(r.outstandingMinor)}</td>
              <td>
                <Badge tone={r.bucket === 'CURRENT' ? 'success' : 'warning'}>{t(`erp.reports.bucket.${r.bucket}`)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </>
  );
}
