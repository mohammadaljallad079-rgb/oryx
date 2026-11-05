/**
 * The ORYX official-document specification.
 *
 * Two things live here and nowhere else:
 *
 * 1. **The document catalogue** — every document the platform can render, with
 *    its bilingual title and the permission that authorises issuing it.
 * 2. **The inspection-report composition planner** — the pure function that
 *    turns a set of selected inspection areas into an ordered list of printed
 *    pages.
 *
 * The planner is separated from the renderer on purpose. Dynamic pagination is
 * the part most likely to be wrong, and a pure function over the section
 * catalogue can be tested without a database, a browser or a PDF. The renderer
 * then does nothing but draw the plan it is handed.
 */

import {
  INSPECTION_SECTION_SPECS,
  type InspectionSectionKey,
  type InspectionSectionSpec,
} from './inspection';

/** The document kinds the platform issues. Mirrors `OfficialDocumentType`. */
export const OFFICIAL_DOCUMENT_TYPES = [
  'VEHICLE_INSPECTION_REPORT',
  'SALES_INVOICE',
  'PURCHASE_INVOICE',
  'SALES_ORDER',
  'PURCHASE_ORDER',
  'SALES_RETURN',
  'PURCHASE_RETURN',
  'PAYMENT_RECEIPT',
  'PAYMENT_VOUCHER',
  'QUOTATION',
  'CUSTOMER_STATEMENT',
  'SUPPLIER_STATEMENT',
  'JOURNAL_ENTRY',
] as const;

export type OfficialDocumentType = (typeof OFFICIAL_DOCUMENT_TYPES)[number];

export interface OfficialDocumentSpec {
  type: OfficialDocumentType;
  labelEn: string;
  labelAr: string;
  /** The permission required to issue, download or revoke this document. */
  permission: string;
  /** Whether the document carries a QR verification code. */
  verifiable: boolean;
  /** Whether the document can be emailed or shared with a counterparty. */
  shareable: boolean;
}

export const OFFICIAL_DOCUMENTS: readonly OfficialDocumentSpec[] = [
  {
    type: 'VEHICLE_INSPECTION_REPORT',
    labelEn: 'Vehicle Inspection Report',
    labelAr: 'تقرير فحص المركبات',
    permission: 'erp.inspection.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'SALES_INVOICE',
    labelEn: 'Tax Invoice',
    labelAr: 'فاتورة ضريبية',
    permission: 'erp.sales.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'PURCHASE_INVOICE',
    labelEn: 'Purchase Invoice',
    labelAr: 'فاتورة مشتريات',
    permission: 'erp.purchasing.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'SALES_ORDER',
    labelEn: 'Sales Order',
    labelAr: 'طلب بيع',
    permission: 'erp.sales.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'PURCHASE_ORDER',
    labelEn: 'Purchase Order',
    labelAr: 'أمر شراء',
    permission: 'erp.purchasing.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'SALES_RETURN',
    labelEn: 'Sales Return',
    labelAr: 'مرتجع بيع',
    permission: 'erp.sales.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'PURCHASE_RETURN',
    labelEn: 'Purchase Return',
    labelAr: 'مرتجع مشتريات',
    permission: 'erp.purchasing.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'PAYMENT_RECEIPT',
    labelEn: 'Payment Receipt',
    labelAr: 'سند قبض',
    permission: 'erp.sales.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'PAYMENT_VOUCHER',
    labelEn: 'Payment Voucher',
    labelAr: 'سند صرف',
    permission: 'erp.purchasing.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'QUOTATION',
    labelEn: 'Quotation',
    labelAr: 'عرض سعر',
    permission: 'erp.sales.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'CUSTOMER_STATEMENT',
    labelEn: 'Customer Statement',
    labelAr: 'كشف حساب عميل',
    permission: 'erp.accounting.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'SUPPLIER_STATEMENT',
    labelEn: 'Supplier Statement',
    labelAr: 'كشف حساب مورد',
    permission: 'erp.purchasing.read',
    verifiable: true,
    shareable: true,
  },
  {
    type: 'JOURNAL_ENTRY',
    labelEn: 'Journal Entry',
    labelAr: 'قيد محاسبي',
    permission: 'erp.accounting.read',
    verifiable: true,
    shareable: false,
  },
] as const;

export function officialDocumentSpec(type: string): OfficialDocumentSpec {
  const found = OFFICIAL_DOCUMENTS.find((d) => d.type === type);
  if (!found) throw new Error(`Unknown official document type: ${type}`);
  return found;
}

/**
 * The financial document types that can be issued from a stored source record.
 *
 * A type is listed here only when a real loader exists for it, so the API's
 * whitelist and the admin screen's buttons read the same list and cannot drift.
 * `VEHICLE_INSPECTION_REPORT` is absent because it is issued from an inspection
 * through its own route.
 */
export const ISSUABLE_FINANCIAL_TYPES = [
  'SALES_INVOICE',
  'SALES_ORDER',
  'QUOTATION',
  // A sales return is rendered from its credit note, a purchase invoice from
  // its supplier invoice and a purchase return from the return record.
  'SALES_RETURN',
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
  'PAYMENT_RECEIPT',
  'PAYMENT_VOUCHER',
  // A statement is rendered from the party it reports on over the company's
  // current fiscal period; a journal entry is rendered from the entry itself.
  'CUSTOMER_STATEMENT',
  'SUPPLIER_STATEMENT',
  'JOURNAL_ENTRY',
] as const satisfies readonly OfficialDocumentType[];

export type IssuableFinancialType = (typeof ISSUABLE_FINANCIAL_TYPES)[number];

// ---------------------------------------------------------------------------
// Inspection-report composition
// ---------------------------------------------------------------------------

/**
 * The printed pages of the report, independent of the data.
 *
 * The original report is five pages. Page 1 is the identification and terms
 * page; the remaining four carry inspection content. A partial inspection keeps
 * page 1 and only the sections that were actually selected — an empty chassis
 * page is never emitted, because a blank page reads as "inspected, nothing
 * found" when the truth is "not inspected".
 */
export type InspectionReportPageKind =
  | 'IDENTIFICATION'
  | 'SECTION';

export interface InspectionReportPage {
  /** 1-based position in the generated document. */
  number: number;
  kind: InspectionReportPageKind;
  /** The section on this page; absent on the identification page. */
  section?: InspectionSectionKey;
  /** Bilingual page heading. */
  titleEn: string;
  titleAr: string;
}

/**
 * The identification page heading, and the titles of the combined content
 * pages.
 *
 * The original report groups the sections as:
 *   page 2 — Paint & Body, then Chassis
 *   page 3 — Interior, Exterior
 *   page 4 — Engine Compartment, Road Test
 *   page 5 — Computer Unit
 *
 * When several selected sections share an original page they are drawn on one
 * printed page with their own headings; when only one is selected it keeps its
 * own page. Either way the page heading comes from this table.
 */
export const INSPECTION_PAGE_TITLES: Record<number, { en: string; ar: string }> = {
  2: { en: 'Paint & Body Check', ar: 'فحص الصبغ والهيكل' },
  3: { en: 'Interior & Exterior Inspection', ar: 'فحص المقصورة والخارج' },
  4: { en: 'Engine Compartment & Road Test', ar: 'فحص حجرة المحرك واختبار الطريق' },
  5: { en: 'Computer Unit Inspection', ar: 'فحص وحدة الكمبيوتر' },
};

export const INSPECTION_IDENTIFICATION_TITLE = {
  en: 'Vehicle Inspection Report',
  ar: 'تقرير فحص المركبات',
};

/**
 * The sections on a given original page, in the report's own order.
 *
 * Derived from the catalogue rather than hard-coded, so adding a section to
 * `INSPECTION_SECTION_SPECS` places it correctly without touching the planner.
 */
export function sectionsForReportPage(page: number): InspectionSectionSpec[] {
  return INSPECTION_SECTION_SPECS.filter((s) => s.page === page);
}

/**
 * Build the ordered page plan for an inspection.
 *
 * `selectedAreas` is the set stored on the session. The result is:
 *   page 1 — identification, terms and signatures (always present);
 *   then one page per original page that has at least one selected section,
 *   carrying only the selected sections of that page.
 *
 * A section that was not selected never appears, and no page is emitted empty.
 * Page numbers are recomputed from the result, so a paint-only inspection is a
 * two-page document rather than a five-page one with three blanks.
 */
export function planInspectionReport(
  selectedAreas: readonly InspectionSectionKey[],
): InspectionReportPage[] {
  const selected = new Set<InspectionSectionKey>(selectedAreas);

  const pages: InspectionReportPage[] = [
    {
      number: 1,
      kind: 'IDENTIFICATION',
      titleEn: INSPECTION_IDENTIFICATION_TITLE.en,
      titleAr: INSPECTION_IDENTIFICATION_TITLE.ar,
    },
  ];

  const originalPages = [2, 3, 4, 5];
  for (const original of originalPages) {
    const onThisPage = sectionsForReportPage(original).filter((s) => selected.has(s.key));
    if (onThisPage.length === 0) continue;

    // One selected section keeps its own bilingual title; several share the
    // combined title of the original page.
    const title =
      onThisPage.length === 1
        ? { en: onThisPage[0].labelEn, ar: onThisPage[0].labelAr }
        : INSPECTION_PAGE_TITLES[original];

    pages.push({
      number: pages.length + 1,
      kind: 'SECTION',
      section: onThisPage[0].key,
      titleEn: title.en,
      titleAr: title.ar,
    });
  }

  return pages;
}

/** The sections rendered on a page of a plan, in catalogue order. */
export function sectionsOnReportPage(
  plan: InspectionReportPage,
  selectedAreas: readonly InspectionSectionKey[],
): InspectionSectionSpec[] {
  if (plan.kind === 'IDENTIFICATION') return [];
  const selected = new Set<InspectionSectionKey>(selectedAreas);
  return sectionsForReportPage(
    INSPECTION_SECTION_SPECS.find((s) => s.key === plan.section)?.page ?? 0,
  ).filter((s) => selected.has(s.key));
}

// ---------------------------------------------------------------------------
// QR verification
// ---------------------------------------------------------------------------

/**
 * The stored lifecycle vocabulary. Mirrors the `OfficialDocumentStatus` enum.
 *
 * The register hands the raw stored status to the interface, and the interface
 * localises it. Keeping the list here is what stops a screen from inventing a
 * status the API never returns — an earlier revision labelled an `ISSUED`
 * document `VALID` in the register, which is the *public* vocabulary, and the
 * badge rendered the raw key.
 */
export const OFFICIAL_DOCUMENT_STATUSES = [
  'DRAFT',
  'ISSUED',
  'SUPERSEDED',
  'CANCELLED',
  'REVOKED',
] as const;

export type OfficialDocumentStatus = (typeof OFFICIAL_DOCUMENT_STATUSES)[number];

/** The public status vocabulary shown on the verification page. */
export const DOCUMENT_VERIFICATION_STATUSES = [
  'VALID',
  'SUPERSEDED',
  'CANCELLED',
  'REVOKED',
] as const;

export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

/**
 * The non-sensitive projection a QR scan reveals.
 *
 * Deliberately excludes amounts, line items, customer contact details and the
 * inspection findings. A verification page answers "is this document real, and
 * which document is it" — nothing more.
 */
export interface DocumentVerificationView {
  status: DocumentVerificationStatus;
  type: OfficialDocumentType;
  typeLabelEn: string;
  typeLabelAr: string;
  documentNumber: string;
  version: number;
  issuerNameEn: string;
  issuerNameAr: string;
  issuerCode: string;
  issuedAt: string;
  /** Present only for an inspection report, and only its identity. */
  subject?: {
    jobNumber: string;
    plateNumber: string | null;
    vinMasked: string;
    make: string;
    model: string;
    modelYear: number;
  };
}

/** Mask all but the last four characters of a VIN for public display. */
export function maskVin(vin: string): string {
  if (vin.length <= 4) return vin;
  return `${'•'.repeat(vin.length - 4)}${vin.slice(-4)}`;
}

/**
 * Map a stored document status onto the public verification status.
 *
 * `DRAFT` never reaches the public page — an unissued document is not
 * verifiable — but if one is ever looked up it reports as `REVOKED` rather than
 * `VALID`, because failing closed is the only safe direction.
 */
export function verificationStatusFor(status: OfficialDocumentStatus): DocumentVerificationStatus {
  switch (status) {
    case 'ISSUED':
      return 'VALID';
    case 'SUPERSEDED':
      return 'SUPERSEDED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'REVOKED';
  }
}

/** Whether a document in this state may still be downloaded as a PDF. */
export function isDocumentDownloadable(status: string): boolean {
  return status === 'ISSUED' || status === 'SUPERSEDED';
}

/**
 * The status to show in a register row, from the stored status.
 *
 * The register shows the stored lifecycle state, never the public one: an
 * administrator must be able to tell "issued" from "superseded", which the
 * public vocabulary collapses.
 */
export function isStoredDocumentStatus(status: string): status is OfficialDocumentStatus {
  return (OFFICIAL_DOCUMENT_STATUSES as readonly string[]).includes(status);
}

/**
 * The dictionary key for a stored status, or `null` when the value is not one.
 *
 * A register badge must never print a raw enum. Returning `null` for an
 * unrecognised value lets the caller render a neutral label instead, so a
 * status added to the enum without a dictionary entry is visibly "unknown"
 * rather than a bare English token in an Arabic interface.
 */
export function documentStatusLabelKey(status: string): string | null {
  return isStoredDocumentStatus(status) ? `documents.status.${status}` : null;
}
