/**
 * The catalogue of numberable document types.
 *
 * This is the single source of the document-numbering keys, their default
 * leading letter and their display metadata. The API allocator
 * (`DocumentSequenceService`), the company settings centre and the numbering
 * settings screen all read it, so a new document type is added in exactly one
 * place. The keys are stable identifiers: a stored `DocumentSequence` row and
 * a stored numbering setting are both keyed by them, so renaming one would
 * orphan a tenant's existing counter.
 *
 * The brief fixes the shape of a number: a single leading English letter
 * followed directly by the sequence digits (`S00001`), with no separator.
 */
export interface DocumentNumberingType {
  /** Stable key, shared by the sequence row and the numbering setting. */
  key: string;
  /** Default leading letter, used until a tenant overrides it. */
  defaultPrefix: string;
  labelEn: string;
  labelAr: string;
}

export const DOCUMENT_NUMBERING_TYPES: readonly DocumentNumberingType[] = [
  { key: 'JOURNAL_ENTRY', defaultPrefix: 'J', labelEn: 'Journal entry', labelAr: 'قيد اليومية' },
  { key: 'PAYMENT', defaultPrefix: 'Y', labelEn: 'Payment voucher', labelAr: 'سند صرف' },
  { key: 'QUOTATION', defaultPrefix: 'Q', labelEn: 'Quotation', labelAr: 'عرض سعر' },
  { key: 'SALES_ORDER', defaultPrefix: 'O', labelEn: 'Sales order', labelAr: 'طلب بيع' },
  { key: 'SALES_INVOICE', defaultPrefix: 'S', labelEn: 'Sales invoice', labelAr: 'فاتورة مبيعات' },
  { key: 'CREDIT_NOTE', defaultPrefix: 'C', labelEn: 'Return / credit note', labelAr: 'إرجاع / إشعار دائن' },
  { key: 'CASHIER_SESSION', defaultPrefix: 'K', labelEn: 'Cashier session', labelAr: 'جلسة الكاشير' },
  { key: 'POS_SALE', defaultPrefix: 'T', labelEn: 'POS sale', labelAr: 'بيع نقطة البيع' },
  { key: 'PURCHASE_REQUISITION', defaultPrefix: 'E', labelEn: 'Purchase requisition', labelAr: 'طلب شراء' },
  { key: 'PURCHASE_ORDER', defaultPrefix: 'P', labelEn: 'Purchase order', labelAr: 'أمر شراء' },
  { key: 'GOODS_RECEIPT', defaultPrefix: 'G', labelEn: 'Goods receipt', labelAr: 'سند استلام' },
  { key: 'SUPPLIER_INVOICE', defaultPrefix: 'B', labelEn: 'Supplier invoice', labelAr: 'فاتورة مورد' },
  { key: 'PURCHASE_RETURN', defaultPrefix: 'U', labelEn: 'Purchase return', labelAr: 'إرجاع مشتريات' },
  { key: 'STOCK_TRANSFER', defaultPrefix: 'F', labelEn: 'Stock transfer', labelAr: 'تحويل مخزون' },
  { key: 'STOCK_ADJUSTMENT', defaultPrefix: 'D', labelEn: 'Stock adjustment', labelAr: 'تسوية مخزون' },
  { key: 'PAYROLL_RUN', defaultPrefix: 'L', labelEn: 'Payroll run', labelAr: 'مسير الرواتب' },
  { key: 'EMPLOYEE_ADVANCE', defaultPrefix: 'A', labelEn: 'Employee advance', labelAr: 'سلفة موظف' },
  { key: 'LEAD', defaultPrefix: 'N', labelEn: 'Lead', labelAr: 'عميل محتمل' },
  { key: 'OPPORTUNITY', defaultPrefix: 'V', labelEn: 'Opportunity', labelAr: 'فرصة بيع' },
  { key: 'SUPPORT_TICKET', defaultPrefix: 'I', labelEn: 'Support ticket', labelAr: 'تذكرة دعم' },
  { key: 'WORK_ORDER', defaultPrefix: 'W', labelEn: 'Work order', labelAr: 'أمر عمل' },
  { key: 'PROJECT', defaultPrefix: 'X', labelEn: 'Project', labelAr: 'مشروع' },
  { key: 'INSPECTION_BOOKING', defaultPrefix: 'H', labelEn: 'Inspection booking', labelAr: 'حجز فحص' },
  { key: 'INSPECTION_SESSION', defaultPrefix: 'Z', labelEn: 'Inspection job', labelAr: 'أمر فحص' },
  { key: 'MAINTENANCE_BOOKING', defaultPrefix: 'M', labelEn: 'Maintenance booking', labelAr: 'حجز صيانة' },
  { key: 'JOB_CARD', defaultPrefix: 'R', labelEn: 'Job card', labelAr: 'بطاقة عمل' },
  { key: 'REPAIR_ESTIMATE', defaultPrefix: 'N', labelEn: 'Repair estimate', labelAr: 'تقدير إصلاح' },
  { key: 'SERVICE_REQUEST', defaultPrefix: 'I', labelEn: 'Service request', labelAr: 'طلب خدمة' },
  { key: 'CUSTOMER_ORDER', defaultPrefix: 'O', labelEn: 'Customer order', labelAr: 'طلب عميل' },
  { key: 'CUSTOMER_RFQ', defaultPrefix: 'Q', labelEn: 'Customer RFQ', labelAr: 'طلب عرض سعر عميل' },
  { key: 'CUSTOMER_RETURN', defaultPrefix: 'U', labelEn: 'Customer return', labelAr: 'إرجاع عميل' },
  { key: 'RECOVERY_REQUEST', defaultPrefix: 'R', labelEn: 'Recovery request', labelAr: 'طلب إنقاذ' },
  { key: 'CUSTOMER_STATEMENT', defaultPrefix: 'G', labelEn: 'Customer statement', labelAr: 'كشف حساب عميل' },
  { key: 'SUPPLIER_STATEMENT', defaultPrefix: 'W', labelEn: 'Supplier statement', labelAr: 'كشف حساب مورد' },
] as const;

/** One type's numbering configuration, as stored on the `numbering` section. */
export interface DocumentNumberingRule {
  prefix: string;
  padding: number;
  nextNumber: number;
}

export type DocumentNumberingSettings = Record<string, DocumentNumberingRule>;

/** The numbering rule a tenant starts from: the catalogue's default letter, 5 digits, starting at 1. */
export function defaultNumberingRule(key: string): DocumentNumberingRule {
  const type = DOCUMENT_NUMBERING_TYPES.find((t) => t.key === key);
  return { prefix: type?.defaultPrefix ?? 'X', padding: 5, nextNumber: 1 };
}
