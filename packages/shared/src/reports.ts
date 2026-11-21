/**
 * ORYX report catalogue.
 *
 * The reporting surface is declared once here so the API, the admin UI and the
 * tests cannot drift apart. A report is a *definition*: which module licenses
 * it, which permission reads it, and which columns it prints. The API renders a
 * definition from live data; the UI reads the same definition to build its
 * table, its filter bar and its export.
 *
 * ## The honesty rule
 *
 * A definition describes a report that exists. Every `kind` below is backed by
 * a real query in `ReportsService` — none is a placeholder. A report whose data
 * would require a provider we do not have is simply not listed here.
 *
 * ## Money
 *
 * Every monetary figure is an integer in minor units, matching the rest of the
 * ERP core. The `format` on a column decides how it is presented (money,
 * quantity, percent, date, text); it never changes what is stored.
 */

/** The modules a report can belong to, used for grouping in the UI. */
export type ReportGroup = 'SALES' | 'PURCHASING' | 'INVENTORY' | 'ACCOUNTING' | 'RECEIVABLES';

/** How a column's raw value is rendered. */
export type ReportColumnFormat =
  | 'text'
  | 'money'
  | 'quantity'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'number';

export interface ReportColumn {
  /** The key on the row object. */
  key: string;
  /** English header. */
  labelEn: string;
  /** Arabic header. */
  labelAr: string;
  format: ReportColumnFormat;
  /** Right-align numeric columns; the PDF template reads this too. */
  align?: 'start' | 'end' | 'center';
  /** When true the column is a running total and prints in the footer row. */
  total?: boolean;
}

export interface ReportDefinition {
  /** The stable identifier used in the route: `GET /reports/:kind/pdf`. */
  kind: ReportKind;
  group: ReportGroup;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  /** The module that must be licensed for the report to be available. */
  moduleKey: string;
  /** Any one of these permissions grants access. */
  permissions: readonly string[];
  /** The columns of the detail table, in print order. */
  columns: readonly ReportColumn[];
  /**
   * True when the report is a *summary* (one row per party or bucket) rather
   * than a *detail* list (one row per document). The UI shows detail reports
   * with a pagination note.
   */
  detail: boolean;
}

export const REPORT_KINDS = [
  'sales-summary',
  'sales-detail',
  'sales-by-item',
  'purchasing-summary',
  'purchasing-detail',
  'inventory-valuation',
  'inventory-movement',
  'inventory-reorder',
  'accounting-summary',
  'trial-balance',
  'general-ledger',
  'receivables-aging',
  'payables-aging',
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

const MONEY_COLUMN: Pick<ReportColumn, 'format' | 'align'> = { format: 'money', align: 'end' };
const QTY_COLUMN: Pick<ReportColumn, 'format' | 'align'> = { format: 'quantity', align: 'end' };

/**
 * The catalogue.
 *
 * `permissions` mirrors the existing report permissions, so a report is visible
 * to exactly the principal that could already read its module.
 */
export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    kind: 'sales-summary',
    group: 'SALES',
    titleEn: 'Sales summary by customer',
    titleAr: 'ملخص المبيعات حسب العميل',
    descriptionEn: 'Invoiced, collected and outstanding totals for each customer.',
    descriptionAr: 'إجمالي المفوتر والمحصل والمتبقي لكل عميل.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.sales.read', 'erp.sales.read'],
    detail: false,
    columns: [
      { key: 'nameEn', labelEn: 'Customer', labelAr: 'العميل', format: 'text' },
      { key: 'invoiceCount', labelEn: 'Invoices', labelAr: 'الفواتير', format: 'number', align: 'end', total: true },
      { key: 'totalMinor', labelEn: 'Total', labelAr: 'الإجمالي', ...MONEY_COLUMN, total: true },
      { key: 'paidMinor', labelEn: 'Collected', labelAr: 'المحصل', ...MONEY_COLUMN, total: true },
      { key: 'outstandingMinor', labelEn: 'Outstanding', labelAr: 'المتبقي', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'sales-detail',
    group: 'SALES',
    titleEn: 'Sales invoices (detail)',
    titleAr: 'فواتير المبيعات (تفصيلي)',
    descriptionEn: 'Every posted sales invoice with its date, customer, totals and payment state.',
    descriptionAr: 'كل فاتورة مبيعات مرحّلة مع التاريخ والعميل والإجماليات وحالة السداد.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.sales.read', 'erp.sales.read'],
    detail: true,
    columns: [
      { key: 'invoiceNumber', labelEn: 'Invoice', labelAr: 'الفاتورة', format: 'text' },
      { key: 'invoiceDate', labelEn: 'Date', labelAr: 'التاريخ', format: 'date' },
      { key: 'customerName', labelEn: 'Customer', labelAr: 'العميل', format: 'text' },
      { key: 'salespersonName', labelEn: 'Salesperson', labelAr: 'الموظف', format: 'text' },
      { key: 'subtotalMinor', labelEn: 'Subtotal', labelAr: 'قبل الضريبة', ...MONEY_COLUMN, total: true },
      { key: 'discountMinor', labelEn: 'Discount', labelAr: 'الخصم', ...MONEY_COLUMN, total: true },
      { key: 'taxMinor', labelEn: 'VAT', labelAr: 'الضريبة', ...MONEY_COLUMN, total: true },
      { key: 'totalMinor', labelEn: 'Total', labelAr: 'الإجمالي', ...MONEY_COLUMN, total: true },
      { key: 'amountPaidMinor', labelEn: 'Paid', labelAr: 'المدفوع', ...MONEY_COLUMN, total: true },
      { key: 'outstandingMinor', labelEn: 'Outstanding', labelAr: 'المتبقي', ...MONEY_COLUMN, total: true },
      { key: 'status', labelEn: 'Status', labelAr: 'الحالة', format: 'text' },
    ],
  },
  {
    kind: 'sales-by-item',
    group: 'SALES',
    titleEn: 'Sales by item',
    titleAr: 'المبيعات حسب الصنف',
    descriptionEn: 'Quantity and revenue grouped by the product or service sold.',
    descriptionAr: 'الكمية والإيراد مجمّعة حسب الصنف أو الخدمة المباعة.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.sales.read', 'erp.sales.read'],
    detail: false,
    columns: [
      { key: 'description', labelEn: 'Item', labelAr: 'الصنف', format: 'text' },
      { key: 'quantity', labelEn: 'Quantity', labelAr: 'الكمية', ...QTY_COLUMN, total: true },
      { key: 'discountMinor', labelEn: 'Discount', labelAr: 'الخصم', ...MONEY_COLUMN, total: true },
      { key: 'taxMinor', labelEn: 'VAT', labelAr: 'الضريبة', ...MONEY_COLUMN, total: true },
      { key: 'netMinor', labelEn: 'Net revenue', labelAr: 'صافي الإيراد', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'purchasing-summary',
    group: 'PURCHASING',
    titleEn: 'Purchasing summary by supplier',
    titleAr: 'ملخص المشتريات حسب المورّد',
    descriptionEn: 'Ordered, invoiced, paid and outstanding totals for each supplier.',
    descriptionAr: 'إجمالي المطلوب والمفوتر والمدفوع والمتبقي لكل مورّد.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.purchasing.read', 'erp.purchasing.read'],
    detail: false,
    columns: [
      { key: 'nameEn', labelEn: 'Supplier', labelAr: 'المورّد', format: 'text' },
      { key: 'orderedMinor', labelEn: 'Ordered', labelAr: 'المطلوب', ...MONEY_COLUMN, total: true },
      { key: 'invoicedMinor', labelEn: 'Invoiced', labelAr: 'المفوتر', ...MONEY_COLUMN, total: true },
      { key: 'paidMinor', labelEn: 'Paid', labelAr: 'المدفوع', ...MONEY_COLUMN, total: true },
      { key: 'outstandingMinor', labelEn: 'Outstanding', labelAr: 'المتبقي', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'purchasing-detail',
    group: 'PURCHASING',
    titleEn: 'Supplier invoices (detail)',
    titleAr: 'فواتير المورّدين (تفصيلي)',
    descriptionEn: 'Every posted supplier invoice with its date, supplier, totals and payment state.',
    descriptionAr: 'كل فاتورة مورّد مرحّلة مع التاريخ والمورّد والإجماليات وحالة السداد.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.purchasing.read', 'erp.purchasing.read'],
    detail: true,
    columns: [
      { key: 'invoiceNumber', labelEn: 'Invoice', labelAr: 'الفاتورة', format: 'text' },
      { key: 'invoiceDate', labelEn: 'Date', labelAr: 'التاريخ', format: 'date' },
      { key: 'supplierName', labelEn: 'Supplier', labelAr: 'المورّد', format: 'text' },
      { key: 'subtotalMinor', labelEn: 'Subtotal', labelAr: 'قبل الضريبة', ...MONEY_COLUMN, total: true },
      { key: 'taxMinor', labelEn: 'VAT', labelAr: 'الضريبة', ...MONEY_COLUMN, total: true },
      { key: 'totalMinor', labelEn: 'Total', labelAr: 'الإجمالي', ...MONEY_COLUMN, total: true },
      { key: 'amountPaidMinor', labelEn: 'Paid', labelAr: 'المدفوع', ...MONEY_COLUMN, total: true },
      { key: 'outstandingMinor', labelEn: 'Outstanding', labelAr: 'المتبقي', ...MONEY_COLUMN, total: true },
      { key: 'status', labelEn: 'Status', labelAr: 'الحالة', format: 'text' },
    ],
  },
  {
    kind: 'inventory-valuation',
    group: 'INVENTORY',
    titleEn: 'Inventory valuation',
    titleAr: 'تقييم المخزون',
    descriptionEn: 'On-hand quantity and moving-average value for each product in each warehouse.',
    descriptionAr: 'الكمية المتوفرة والقيمة بالمتوسط المرجح لكل صنف في كل مستودع.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.inventory.read', 'erp.inventory.read'],
    detail: true,
    columns: [
      { key: 'sku', labelEn: 'SKU', labelAr: 'الرمز', format: 'text' },
      { key: 'nameEn', labelEn: 'Product', labelAr: 'الصنف', format: 'text' },
      { key: 'warehouseCode', labelEn: 'Warehouse', labelAr: 'المستودع', format: 'text' },
      { key: 'quantity', labelEn: 'On hand', labelAr: 'المتوفّر', ...QTY_COLUMN, total: true },
      { key: 'averageCostMinor', labelEn: 'Avg cost', labelAr: 'متوسط التكلفة', ...MONEY_COLUMN },
      { key: 'valueMinor', labelEn: 'Value', labelAr: 'القيمة', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'inventory-movement',
    group: 'INVENTORY',
    titleEn: 'Stock movement',
    titleAr: 'حركة المخزون',
    descriptionEn: 'Quantity in and out and the net change for each product over the period.',
    descriptionAr: 'الكمية الداخلة والخارجة وصافي التغير لكل صنف خلال الفترة.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.inventory.read', 'erp.inventory.read'],
    detail: false,
    columns: [
      { key: 'sku', labelEn: 'SKU', labelAr: 'الرمز', format: 'text' },
      { key: 'nameEn', labelEn: 'Product', labelAr: 'الصنف', format: 'text' },
      { key: 'quantityIn', labelEn: 'In', labelAr: 'داخل', ...QTY_COLUMN, total: true },
      { key: 'quantityOut', labelEn: 'Out', labelAr: 'خارج', ...QTY_COLUMN, total: true },
      { key: 'netQuantity', labelEn: 'Net', labelAr: 'الصافي', ...QTY_COLUMN, total: true },
    ],
  },
  {
    kind: 'inventory-reorder',
    group: 'INVENTORY',
    titleEn: 'Reorder alerts',
    titleAr: 'تنبيهات إعادة الطلب',
    descriptionEn: 'Products whose on-hand quantity has reached its reorder level.',
    descriptionAr: 'الأصناف التي بلغت كميتها المتوفرة حد إعادة الطلب.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.inventory.read', 'erp.inventory.read'],
    detail: false,
    columns: [
      { key: 'sku', labelEn: 'SKU', labelAr: 'الرمز', format: 'text' },
      { key: 'nameEn', labelEn: 'Product', labelAr: 'الصنف', format: 'text' },
      { key: 'onHand', labelEn: 'On hand', labelAr: 'المتوفّر', ...QTY_COLUMN },
      { key: 'reorderLevel', labelEn: 'Reorder level', labelAr: 'حد إعادة الطلب', ...QTY_COLUMN },
    ],
  },
  {
    kind: 'accounting-summary',
    group: 'ACCOUNTING',
    titleEn: 'Accounting summary by source',
    titleAr: 'الملخص المحاسبي حسب المصدر',
    descriptionEn: 'Journal count and debit/credit totals grouped by the source that posted them.',
    descriptionAr: 'عدد القيود وإجمالي المدين والدائن مجمّعة حسب المصدر الذي رحّلها.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read'],
    detail: false,
    columns: [
      { key: 'sourceType', labelEn: 'Source', labelAr: 'المصدر', format: 'text' },
      { key: 'count', labelEn: 'Journals', labelAr: 'القيود', format: 'number', align: 'end', total: true },
      { key: 'debitMinor', labelEn: 'Debit', labelAr: 'مدين', ...MONEY_COLUMN, total: true },
      { key: 'creditMinor', labelEn: 'Credit', labelAr: 'دائن', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'trial-balance',
    group: 'ACCOUNTING',
    titleEn: 'Trial balance',
    titleAr: 'ميزان المراجعة',
    descriptionEn: 'Opening, movement and closing balance for every account in the period.',
    descriptionAr: 'الرصيد الافتتاحي والحركة والرصيد الختامي لكل حساب خلال الفترة.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read'],
    detail: true,
    columns: [
      { key: 'code', labelEn: 'Code', labelAr: 'الرمز', format: 'text' },
      { key: 'nameEn', labelEn: 'Account', labelAr: 'الحساب', format: 'text' },
      { key: 'debitMinor', labelEn: 'Debit', labelAr: 'مدين', ...MONEY_COLUMN, total: true },
      { key: 'creditMinor', labelEn: 'Credit', labelAr: 'دائن', ...MONEY_COLUMN, total: true },
      { key: 'balanceMinor', labelEn: 'Balance', labelAr: 'الرصيد', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'general-ledger',
    group: 'ACCOUNTING',
    titleEn: 'General ledger',
    titleAr: 'دفتر الأستاذ العام',
    descriptionEn: 'Every posted journal line in the period, in entry order.',
    descriptionAr: 'كل سطر قيد مرحّل خلال الفترة، بترتيب القيد.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read'],
    detail: true,
    columns: [
      { key: 'entryNumber', labelEn: 'Entry', labelAr: 'القيد', format: 'text' },
      { key: 'entryDate', labelEn: 'Date', labelAr: 'التاريخ', format: 'date' },
      { key: 'accountCode', labelEn: 'Code', labelAr: 'الرمز', format: 'text' },
      { key: 'accountName', labelEn: 'Account', labelAr: 'الحساب', format: 'text' },
      { key: 'description', labelEn: 'Description', labelAr: 'الوصف', format: 'text' },
      { key: 'debitMinor', labelEn: 'Debit', labelAr: 'مدين', ...MONEY_COLUMN, total: true },
      { key: 'creditMinor', labelEn: 'Credit', labelAr: 'دائن', ...MONEY_COLUMN, total: true },
    ],
  },
  {
    kind: 'receivables-aging',
    group: 'RECEIVABLES',
    titleEn: 'Receivables aging',
    titleAr: 'أعمار الذمم المدينة',
    descriptionEn: 'Outstanding customer invoices grouped by how far past due they are.',
    descriptionAr: 'فواتير العملاء المستحقة مجمّعة حسب مدة التأخر.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read', 'erp.sales.read'],
    detail: true,
    columns: [
      { key: 'invoiceNumber', labelEn: 'Invoice', labelAr: 'الفاتورة', format: 'text' },
      { key: 'partyName', labelEn: 'Customer', labelAr: 'العميل', format: 'text' },
      { key: 'invoiceDate', labelEn: 'Date', labelAr: 'التاريخ', format: 'date' },
      { key: 'dueDate', labelEn: 'Due', labelAr: 'الاستحقاق', format: 'date' },
      { key: 'daysOverdue', labelEn: 'Days overdue', labelAr: 'أيام التأخر', format: 'number', align: 'end' },
      { key: 'outstandingMinor', labelEn: 'Outstanding', labelAr: 'المتبقي', ...MONEY_COLUMN, total: true },
      { key: 'bucket', labelEn: 'Bucket', labelAr: 'الفئة', format: 'text' },
    ],
  },
  {
    kind: 'payables-aging',
    group: 'RECEIVABLES',
    titleEn: 'Payables aging',
    titleAr: 'أعمار الذمم الدائنة',
    descriptionEn: 'Outstanding supplier invoices grouped by how far past due they are.',
    descriptionAr: 'فواتير المورّدين المستحقة مجمّعة حسب مدة التأخر.',
    moduleKey: 'reports_analytics',
    permissions: ['erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read', 'erp.purchasing.read'],
    detail: true,
    columns: [
      { key: 'invoiceNumber', labelEn: 'Invoice', labelAr: 'الفاتورة', format: 'text' },
      { key: 'partyName', labelEn: 'Supplier', labelAr: 'المورّد', format: 'text' },
      { key: 'invoiceDate', labelEn: 'Date', labelAr: 'التاريخ', format: 'date' },
      { key: 'dueDate', labelEn: 'Due', labelAr: 'الاستحقاق', format: 'date' },
      { key: 'daysOverdue', labelEn: 'Days overdue', labelAr: 'أيام التأخر', format: 'number', align: 'end' },
      { key: 'outstandingMinor', labelEn: 'Outstanding', labelAr: 'المتبقي', ...MONEY_COLUMN, total: true },
      { key: 'bucket', labelEn: 'Bucket', labelAr: 'الفئة', format: 'text' },
    ],
  },
] as const;

export function reportDefinition(kind: string): ReportDefinition | null {
  return REPORT_DEFINITIONS.find((d) => d.kind === kind) ?? null;
}

export const REPORT_GROUPS: readonly { key: ReportGroup; labelEn: string; labelAr: string }[] = [
  { key: 'SALES', labelEn: 'Sales', labelAr: 'المبيعات' },
  { key: 'PURCHASING', labelEn: 'Purchasing', labelAr: 'المشتريات' },
  { key: 'INVENTORY', labelEn: 'Inventory', labelAr: 'المخزون' },
  { key: 'ACCOUNTING', labelEn: 'Accounting', labelAr: 'المحاسبة' },
  { key: 'RECEIVABLES', labelEn: 'Receivables & payables', labelAr: 'الذمم' },
];

/**
 * A rendered report: the definition's metadata plus the rows.
 *
 * `totals` carries one entry per column flagged `total`, so the UI footer, the
 * CSV export and the PDF footer all print the same figures the server summed —
 * a client that re-added the visible page would total the wrong set when the
 * rows are paginated.
 */
export interface ReportResultDto {
  kind: ReportKind;
  titleEn: string;
  titleAr: string;
  from: string | null;
  to: string | null;
  generatedAt: string;
  currency: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  totals: Record<string, number>;
  /** True when the row set was truncated to the detail cap. */
  truncated: boolean;
  /** How many rows the underlying query matched, before any cap. */
  rowCount: number;
}
