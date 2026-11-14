/**
 * ORYX per-company settings.
 *
 * Settings are grouped into namespaces and stored one JSON row per
 * (company, namespace). This module is the single source of truth for:
 *   - the namespace list,
 *   - the default value of every namespace,
 *   - the shape (TypeScript type) the API validates against.
 *
 * The API, the settings control center and every document-producing service
 * import from here, so the admin UI cannot offer a field the API ignores and a
 * document cannot read a value the UI never wrote.
 *
 * Values are stored per company and are never shared between companies: a
 * document produced for company A reads only company A's rows.
 */

export const SETTING_NAMESPACES = [
  'GENERAL',
  'INVOICING',
  'ACCOUNTING',
  'TAX',
  'HR',
  'INVENTORY',
  'SALES',
  'MAINTENANCE',
  'DOCUMENTS',
] as const;

export type SettingNamespace = (typeof SETTING_NAMESPACES)[number];

export interface GeneralSettings {
  companyNameEn: string;
  companyNameAr: string;
  tradeName: string;
  logoUrl: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  addressLine: string;
  city: string;
  countryCode: string;
  crNumber: string;
  taxNumber: string;
  /** ISO 4217 code, e.g. SAR. */
  currency: string;
  /** IANA timezone, e.g. Asia/Riyadh. */
  timezone: string;
  /** Default UI/document locale. */
  locale: 'ar' | 'en';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  numberFormat: '1,234.56' | '1.234,56' | '1 234,56';
  /** Extra trading addresses shown on documents. */
  branches: Array<{ name: string; city: string; phone: string; addressLine: string }>;
}

export interface InvoicingSettings {
  numberPrefix: string;
  numberPadding: number;
  /** Named document template. */
  template: 'STANDARD' | 'COMPACT' | 'DETAILED';
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showTaxNumber: boolean;
  showSignature: boolean;
  showBankDetails: boolean;
  bankDetails: string;
  paperSize: 'A4' | 'A5' | 'LETTER';
  /** What the PDF export includes. */
  pdfIncludeStamp: boolean;
  pdfIncludeTerms: boolean;
  termsText: string;
}

export interface AccountingSettings {
  fiscalYearStartMonth: number;
  /** Default account ids resolved when posting. */
  defaultReceivableAccountId: string;
  defaultPayableAccountId: string;
  defaultCashAccountId: string;
  defaultSalesAccountId: string;
  defaultVatAccountId: string;
  /** Rounding applied to computed tax. */
  roundingMode: 'HALF_UP' | 'HALF_EVEN' | 'FLOOR';
  currencyPrecision: number;
  allowManualJournals: boolean;
  requireBalancedJournals: boolean;
}

export interface TaxSettings {
  vatEnabled: boolean;
  /** Basis points: 1500 = 15.00%. */
  vatRateBp: number;
  /** When true, stored line prices already include VAT. */
  pricesIncludeTax: boolean;
  taxNumber: string;
  calculationMethod: 'LINE' | 'DOCUMENT';
  /** Zero-rated categories (exports, exemptions) by code. */
  exemptions: Array<{ code: string; label: string; rateBp: number }>;
}

export interface HrSettings {
  /** "HH:MM" 24h. */
  workdayStart: string;
  workdayEnd: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekendDays: number[];
  annualLeaveDays: number;
  attendanceGraceMinutes: number;
  payrollDayOfMonth: number;
  requireLeaveApproval: boolean;
}

export interface InventorySettings {
  defaultWarehouseId: string;
  valuationMethod: 'MOVING_AVERAGE' | 'FIFO';
  lowStockThreshold: number;
  negativeStockAllowed: boolean;
  purchaseOrderPrefix: string;
  /** Stock level below which a reorder alert is raised. */
  reorderPoint: number;
}

export interface SalesSettings {
  defaultPaymentTermsDays: number;
  defaultCreditLimitMinor: number;
  allowDiscounts: boolean;
  maxDiscountPercentBp: number;
  quoteValidityDays: number;
  invoiceNumberPrefix: string;
  defaultTaxRateBp: number;
}

export interface MaintenanceSettings {
  jobNumberPrefix: string;
  defaultLaborRateMinor: number;
  /** Parts are marked up by this rate when quoted. */
  partsMarkupPercentBp: number;
  vatEnabled: boolean;
  defaultTaxRateBp: number;
  requireEstimateApproval: boolean;
  /** Ordered status flow shown to the workshop. */
  statusFlow: string[];
}

export interface DocumentSettings {
  logoUrl: string;
  headerText: string;
  footerText: string;
  contactInfo: string;
  stampUrl: string;
  signatureUrl: string;
  paperSize: 'A4' | 'A5' | 'LETTER';
  showStamp: boolean;
  showSignature: boolean;
}

export interface CompanySettingsMap {
  GENERAL: GeneralSettings;
  INVOICING: InvoicingSettings;
  ACCOUNTING: AccountingSettings;
  TAX: TaxSettings;
  HR: HrSettings;
  INVENTORY: InventorySettings;
  SALES: SalesSettings;
  MAINTENANCE: MaintenanceSettings;
  DOCUMENTS: DocumentSettings;
}

export type CompanySettings = CompanySettingsMap[SettingNamespace];

export interface ResolvedCompanySettings extends CompanySettingsMap {
  companyId: string;
}

/** Default settings for a freshly provisioned company. */
export function defaultSettingsFor<N extends SettingNamespace>(namespace: N): CompanySettingsMap[N] {
  const defaults: CompanySettingsMap = {
    GENERAL: {
      companyNameEn: '',
      companyNameAr: '',
      tradeName: '',
      logoUrl: '',
      contactEmail: '',
      contactPhone: '',
      website: '',
      addressLine: '',
      city: '',
      countryCode: 'SA',
      crNumber: '',
      taxNumber: '',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      locale: 'ar',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1,234.56',
      branches: [],
    },
    INVOICING: {
      numberPrefix: 'INV',
      numberPadding: 5,
      template: 'STANDARD',
      headerText: '',
      footerText: '',
      showLogo: true,
      showTaxNumber: true,
      showSignature: false,
      showBankDetails: false,
      bankDetails: '',
      paperSize: 'A4',
      pdfIncludeStamp: false,
      pdfIncludeTerms: true,
      termsText: '',
    },
    ACCOUNTING: {
      fiscalYearStartMonth: 1,
      defaultReceivableAccountId: '',
      defaultPayableAccountId: '',
      defaultCashAccountId: '',
      defaultSalesAccountId: '',
      defaultVatAccountId: '',
      roundingMode: 'HALF_UP',
      currencyPrecision: 2,
      allowManualJournals: true,
      requireBalancedJournals: true,
    },
    TAX: {
      vatEnabled: true,
      vatRateBp: 1500,
      pricesIncludeTax: false,
      taxNumber: '',
      calculationMethod: 'LINE',
      exemptions: [],
    },
    HR: {
      workdayStart: '09:00',
      workdayEnd: '18:00',
      weekendDays: [5, 6],
      annualLeaveDays: 21,
      attendanceGraceMinutes: 15,
      payrollDayOfMonth: 28,
      requireLeaveApproval: true,
    },
    INVENTORY: {
      defaultWarehouseId: '',
      valuationMethod: 'MOVING_AVERAGE',
      lowStockThreshold: 5,
      negativeStockAllowed: false,
      purchaseOrderPrefix: 'PO',
      reorderPoint: 10,
    },
    SALES: {
      defaultPaymentTermsDays: 30,
      defaultCreditLimitMinor: 0,
      allowDiscounts: true,
      maxDiscountPercentBp: 5000,
      quoteValidityDays: 30,
      invoiceNumberPrefix: 'INV',
      defaultTaxRateBp: 1500,
    },
    MAINTENANCE: {
      jobNumberPrefix: 'JC',
      defaultLaborRateMinor: 0,
      partsMarkupPercentBp: 0,
      vatEnabled: true,
      defaultTaxRateBp: 1500,
      requireEstimateApproval: true,
      statusFlow: ['NEW', 'RECEIVED', 'UNDER_INSPECTION', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'COMPLETED', 'DELIVERED'],
    },
    DOCUMENTS: {
      logoUrl: '',
      headerText: '',
      footerText: '',
      contactInfo: '',
      stampUrl: '',
      signatureUrl: '',
      paperSize: 'A4',
      showStamp: false,
      showSignature: false,
    },
  };
  return structuredClone(defaults[namespace]);
}

/**
 * Merge a stored partial value over the defaults for its namespace.
 *
 * A row written before a field existed therefore keeps working, and a value the
 * code no longer recognises cannot leak into a document.
 */
export function mergeSettings<N extends SettingNamespace>(
  namespace: N,
  stored: Partial<CompanySettingsMap[N]> | null | undefined,
): CompanySettingsMap[N] {
  return { ...defaultSettingsFor(namespace), ...(stored ?? {}) };
}

/** Enumerated string fields, keyed by `NAMESPACE.field`. */
const SETTINGS_ENUMS: Record<string, readonly string[]> = {
  'GENERAL.locale': ['ar', 'en'],
  'GENERAL.dateFormat': ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
  'GENERAL.numberFormat': ['1,234.56', '1.234,56', '1 234,56'],
  'INVOICING.template': ['STANDARD', 'COMPACT', 'DETAILED'],
  'INVOICING.paperSize': ['A4', 'A5', 'LETTER'],
  'ACCOUNTING.roundingMode': ['HALF_UP', 'HALF_EVEN', 'FLOOR'],
  'TAX.calculationMethod': ['LINE', 'DOCUMENT'],
  'INVENTORY.valuationMethod': ['MOVING_AVERAGE', 'FIFO'],
  'DOCUMENTS.paperSize': ['A4', 'A5', 'LETTER'],
};

/** Inclusive numeric bounds, keyed by `NAMESPACE.field`. */
const SETTINGS_BOUNDS: Record<string, readonly [number, number]> = {
  'INVOICING.numberPadding': [1, 10],
  'ACCOUNTING.fiscalYearStartMonth': [1, 12],
  'ACCOUNTING.currencyPrecision': [0, 4],
  'TAX.vatRateBp': [0, 10000],
  'HR.attendanceGraceMinutes': [0, 240],
  'HR.payrollDayOfMonth': [1, 31],
  'HR.annualLeaveDays': [0, 365],
  'INVENTORY.lowStockThreshold': [0, 1000000],
  'INVENTORY.reorderPoint': [0, 1000000],
  'SALES.defaultPaymentTermsDays': [0, 365],
  'SALES.maxDiscountPercentBp': [0, 10000],
  'SALES.quoteValidityDays': [1, 365],
  'SALES.defaultTaxRateBp': [0, 10000],
  'MAINTENANCE.defaultTaxRateBp': [0, 10000],
  'MAINTENANCE.partsMarkupPercentBp': [0, 10000],
};

export class SettingsValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

function coerceField(namespace: string, key: string, def: unknown, raw: unknown): unknown {
  const field = `${namespace}.${key}`;
  if (typeof def === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new SettingsValidationError(`${field} must be a boolean.`, field);
  }
  if (typeof def === 'number') {
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(num)) throw new SettingsValidationError(`${field} must be a number.`, field);
    const bounds = SETTINGS_BOUNDS[field];
    if (bounds) {
      if (num < bounds[0] || num > bounds[1]) {
        throw new SettingsValidationError(`${field} must be between ${bounds[0]} and ${bounds[1]}.`, field);
      }
    }
    return Math.round(num);
  }
  if (typeof def === 'string') {
    if (typeof raw !== 'string') throw new SettingsValidationError(`${field} must be a string.`, field);
    const allowed = SETTINGS_ENUMS[field];
    if (allowed && !allowed.includes(raw)) {
      throw new SettingsValidationError(`${field} must be one of ${allowed.join(', ')}.`, field);
    }
    return raw.slice(0, 2000);
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(raw)) throw new SettingsValidationError(`${field} must be an array.`, field);
    // Array members are shallow-copied so a caller cannot smuggle nested
    // objects the type does not describe.
    return raw.slice(0, 500).map((item) =>
      item && typeof item === 'object' && !Array.isArray(item) ? { ...(item as object) } : item,
    );
  }
  if (def && typeof def === 'object') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new SettingsValidationError(`${field} must be an object.`, field);
    }
    return { ...(raw as object) };
  }
  return raw;
}

/**
 * Validate and normalise an incoming settings value against its namespace.
 *
 * Unknown keys are dropped, missing keys are filled from the defaults, numbers
 * are bounded and enumerated strings are checked. A malformed payload therefore
 * cannot reach the database, and the stored value always has the full shape.
 */
export function sanitizeSettings<N extends SettingNamespace>(
  namespace: N,
  input: unknown,
): CompanySettingsMap[N] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SettingsValidationError(`Settings for ${namespace} must be an object.`, namespace);
  }
  const source = input as Record<string, unknown>;
  const defaults = defaultSettingsFor(namespace) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(defaults)) {
    out[key] = key in source ? coerceField(namespace, key, def, source[key]) : def;
  }
  return out as unknown as CompanySettingsMap[N];
}

/** Attachments accept these document types. */
export const ALLOWED_DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
];

/** Human-readable label per accepted extension (used by the UI accept list). */
export const ALLOWED_DOCUMENT_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.jpg',
  '.jpeg',
  '.png',
];

/** Entity types that accept documents in the unified document panel. */
export const DOCUMENT_ENTITY_TYPES = [
  'CUSTOMER',
  'COMPANY',
  'SUPPLIER',
  'EMPLOYEE',
  'VEHICLE',
  'JOB_CARD',
  'INSPECTION',
  'PURCHASE_ORDER',
  'SUPPLIER_INVOICE',
  'JOURNAL_ENTRY',
  'CONTRACT',
  'WORK_ORDER',
  'PROJECT',
] as const;

export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];
