/**
 * Per-company settings catalogue.
 *
 * Every tenant owns an independent configuration. The sections below are stored
 * one JSON document per `(companyId, section)` row, so a section can gain a
 * field without a migration while tenant isolation stays a database guarantee
 * (the unique key is `(companyId, section)`, never `section` alone).
 *
 * This file is the single source of the section list and of each section's
 * defaults. The API, the admin settings centre and the printed-document path
 * all read it, so a new section is added in exactly one place.
 */

export const COMPANY_SETTING_SECTIONS = [
  'general',
  'invoicing',
  'accounting',
  'tax',
  'hr',
  'purchasing',
  'inventory',
  'sales',
  'maintenance',
  'documents',
] as const;

export type CompanySettingSection = (typeof COMPANY_SETTING_SECTIONS)[number];

export interface GeneralSettings {
  nameEn: string;
  nameAr: string;
  tradeNameEn: string;
  tradeNameAr: string;
  crNumber: string;
  taxNumber: string;
  phone: string;
  email: string;
  website: string;
  addressLine: string;
  city: string;
  countryCode: string;
  currency: string;
  timezone: string;
  defaultLocale: 'en' | 'ar';
  dateFormat: string;
  numberFormat: string;
  logoUrl: string;
}

export interface InvoicingSettings {
  numberPrefix: string;
  nextNumber: number;
  showLogo: boolean;
  showTaxNumber: boolean;
  showCrNumber: boolean;
  showBankDetails: boolean;
  headerNoteEn: string;
  headerNoteAr: string;
  footerNoteEn: string;
  footerNoteAr: string;
  paperSize: 'A4' | 'A5' | 'THERMAL';
  pdfTemplate: string;
  printCopies: number;
}

export interface AccountingSettings {
  fiscalYearStartMonth: number;
  defaultSalesAccount: string;
  defaultPurchaseAccount: string;
  defaultTaxAccount: string;
  defaultReceivableAccount: string;
  defaultPayableAccount: string;
  defaultCashAccount: string;
  journalPrefix: string;
  allowManualJournals: boolean;
  requireApproval: boolean;
  roundingMode: 'NONE' | 'NEAREST' | 'UP' | 'DOWN';
  currencyDecimals: number;
}

export interface TaxSettings {
  vatEnabled: boolean;
  defaultRateBp: number;
  salesRateBp: number;
  purchasesRateBp: number;
  companyTaxNumber: string;
  pricesIncludeTax: boolean;
  calculationMethod: 'LINE' | 'TOTAL';
  exemptEnabled: boolean;
  exemptNoteEn: string;
  exemptNoteAr: string;
}

export interface HrSettings {
  workdayStart: string;
  workdayEnd: string;
  workDaysPerWeek: number;
  annualLeaveDays: number;
  attendanceEnabled: boolean;
  attendanceGraceMinutes: number;
  overtimeEnabled: boolean;
  overtimeRateBp: number;
  payrollDayOfMonth: number;
  requireDocuments: boolean;
}

export interface PurchasingSettings {
  orderPrefix: string;
  nextOrderNumber: number;
  defaultWarehouseId: string;
  valuationMethod: 'MOVING_AVERAGE' | 'FIFO';
  lowStockAlertsEnabled: boolean;
  reorderLeadDays: number;
  requireSupplierTaxNumber: boolean;
}

export interface InventorySettings {
  valuationMethod: 'MOVING_AVERAGE' | 'FIFO';
  lowStockThreshold: number;
  allowNegativeStock: boolean;
  defaultWarehouseId: string;
  barcodeRequired: boolean;
}

export interface SalesSettings {
  quotationPrefix: string;
  orderPrefix: string;
  invoicePrefix: string;
  defaultCustomerTermsDays: number;
  defaultCreditLimitMinor: number;
  allowDiscounts: boolean;
  maxDiscountBp: number;
  requireCustomerDocuments: boolean;
}

export interface MaintenanceSettings {
  orderPrefix: string;
  nextOrderNumber: number;
  defaultLabourRateMinor: number;
  defaultTaxRateBp: number;
  requireInspection: boolean;
  allowPartsFromAnyWarehouse: boolean;
  autoAssignTechnician: boolean;
  statuses: string[];
}

export interface DocumentsSettings {
  headerTextEn: string;
  headerTextAr: string;
  footerTextEn: string;
  footerTextAr: string;
  contactLine: string;
  showStamp: boolean;
  showSignature: boolean;
  stampUrl: string;
  signatureUrl: string;
  paperSize: 'A4' | 'A5' | 'THERMAL';
}

export interface CompanySettingsMap {
  general: GeneralSettings;
  invoicing: InvoicingSettings;
  accounting: AccountingSettings;
  tax: TaxSettings;
  hr: HrSettings;
  purchasing: PurchasingSettings;
  inventory: InventorySettings;
  sales: SalesSettings;
  maintenance: MaintenanceSettings;
  documents: DocumentsSettings;
}

export const MAINTENANCE_STATUSES = [
  'New',
  'Received',
  'Under Inspection',
  'In Progress',
  'Waiting for Parts',
  'Completed',
  'Delivered',
] as const;

/**
 * The defaults a company starts from. They are deliberately empty or neutral:
 * nothing here asserts a legal identity, a tax rate or an account number that
 * the owner has not set, because a wrong default on a printed document is worse
 * than an obvious blank.
 */
export const COMPANY_SETTING_DEFAULTS: CompanySettingsMap = {
  general: {
    nameEn: '',
    nameAr: '',
    tradeNameEn: '',
    tradeNameAr: '',
    crNumber: '',
    taxNumber: '',
    phone: '',
    email: '',
    website: '',
    addressLine: '',
    city: '',
    countryCode: '',
    currency: 'BHD',
    timezone: 'Asia/Bahrain',
    defaultLocale: 'ar',
    dateFormat: 'dd/MM/yyyy',
    numberFormat: '1,234.56',
    logoUrl: '',
  },
  invoicing: {
    numberPrefix: 'INV-',
    nextNumber: 1,
    showLogo: true,
    showTaxNumber: true,
    showCrNumber: true,
    showBankDetails: false,
    headerNoteEn: '',
    headerNoteAr: '',
    footerNoteEn: '',
    footerNoteAr: '',
    paperSize: 'A4',
    pdfTemplate: 'standard',
    printCopies: 1,
  },
  accounting: {
    fiscalYearStartMonth: 1,
    defaultSalesAccount: '',
    defaultPurchaseAccount: '',
    defaultTaxAccount: '',
    defaultReceivableAccount: '',
    defaultPayableAccount: '',
    defaultCashAccount: '',
    journalPrefix: 'JV-',
    allowManualJournals: true,
    requireApproval: false,
    roundingMode: 'NONE',
    currencyDecimals: 3,
  },
  tax: {
    vatEnabled: true,
    defaultRateBp: 0,
    salesRateBp: 0,
    purchasesRateBp: 0,
    companyTaxNumber: '',
    pricesIncludeTax: false,
    calculationMethod: 'LINE',
    exemptEnabled: false,
    exemptNoteEn: '',
    exemptNoteAr: '',
  },
  hr: {
    workdayStart: '08:00',
    workdayEnd: '17:00',
    workDaysPerWeek: 5,
    annualLeaveDays: 30,
    attendanceEnabled: true,
    attendanceGraceMinutes: 15,
    overtimeEnabled: false,
    overtimeRateBp: 12500,
    payrollDayOfMonth: 25,
    requireDocuments: true,
  },
  purchasing: {
    orderPrefix: 'PO-',
    nextOrderNumber: 1,
    defaultWarehouseId: '',
    valuationMethod: 'MOVING_AVERAGE',
    lowStockAlertsEnabled: true,
    reorderLeadDays: 7,
    requireSupplierTaxNumber: false,
  },
  inventory: {
    valuationMethod: 'MOVING_AVERAGE',
    lowStockThreshold: 0,
    allowNegativeStock: false,
    defaultWarehouseId: '',
    barcodeRequired: false,
  },
  sales: {
    quotationPrefix: 'QT-',
    orderPrefix: 'SO-',
    invoicePrefix: 'INV-',
    defaultCustomerTermsDays: 30,
    defaultCreditLimitMinor: 0,
    allowDiscounts: true,
    maxDiscountBp: 10000,
    requireCustomerDocuments: false,
  },
  maintenance: {
    orderPrefix: 'WO-',
    nextOrderNumber: 1,
    defaultLabourRateMinor: 0,
    defaultTaxRateBp: 0,
    requireInspection: true,
    allowPartsFromAnyWarehouse: false,
    autoAssignTechnician: false,
    statuses: [...MAINTENANCE_STATUSES],
  },
  documents: {
    headerTextEn: '',
    headerTextAr: '',
    footerTextEn: '',
    footerTextAr: '',
    contactLine: '',
    showStamp: true,
    showSignature: true,
    stampUrl: '',
    signatureUrl: '',
    paperSize: 'A4',
  },
};

export interface CompanySettingsResponse {
  companyId: string;
  sections: CompanySettingsMap;
}

/** Merge a stored partial section over the catalogue default for that section. */
export function withDefaults<K extends CompanySettingSection>(
  section: K,
  stored: unknown,
): CompanySettingsMap[K] {
  const base = COMPANY_SETTING_DEFAULTS[section];
  if (!stored || typeof stored !== 'object') return { ...base };
  return { ...base, ...(stored as Record<string, unknown>) } as CompanySettingsMap[K];
}
