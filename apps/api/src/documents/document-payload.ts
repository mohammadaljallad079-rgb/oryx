import type { InspectionSectionKey } from '@oryx/shared';

/**
 * The immutable snapshot a document is rendered from.
 *
 * A document is rendered once and stored. If the template later read the live
 * record, reprinting an old invoice would silently show today's prices, and an
 * inspection report would show findings edited after the customer signed. The
 * payload is therefore copied at issue time and the renderer reads only this.
 */

export interface DocumentIssuer {
  companyId: string;
  nameEn: string;
  nameAr: string;
  code: string;
  legalNameEn?: string | null;
  taxNumber?: string | null;
  addressLine?: string | null;
  city?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  logoDataUri?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  currency: string;
}

/** The QR block printed on a verifiable document. */
export interface DocumentVerification {
  token: string;
  url: string;
  qrDataUri: string;
}

// ---------------------------------------------------------------------------
// Inspection report
// ---------------------------------------------------------------------------

export interface InspectionReportItem {
  itemKey: string;
  labelEn: string;
  labelAr: string;
  result: 'PASS' | 'FAIL' | 'NA' | 'UNSET';
  note: string | null;
}

export interface InspectionReportMarker {
  condition: 'PAINT' | 'FILLER' | 'CHANGE' | 'SECTIONED';
  x: number;
  y: number;
  panelKey: string | null;
  note: string | null;
}

export interface InspectionReportChassisRegion {
  regionKey: string;
  labelEn: string;
  labelAr: string;
  condition: 'OK' | 'DAMAGE' | 'UNSET';
  note: string | null;
  x: number;
  y: number;
}

export interface InspectionReportDiagnostic {
  module: string;
  faultCode: string | null;
  description: string;
  observation: string | null;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface InspectionReportAttachment {
  id: string;
  dataUri: string;
  caption: string | null;
  sectionArea: InspectionSectionKey | null;
}

export interface InspectionReportSection {
  area: InspectionSectionKey;
  labelEn: string;
  labelAr: string;
  kind: 'ITEMS' | 'DIAGRAM_PAINT' | 'DIAGRAM_CHASSIS' | 'DIAGNOSTIC';
  remarks: string | null;
  remarksLabelEn: string;
  remarksLabelAr: string;
  noFindings: boolean;
  items: InspectionReportItem[];
  markers: InspectionReportMarker[];
  chassisRegions: InspectionReportChassisRegion[];
  diagnostics: InspectionReportDiagnostic[];
  attachments: InspectionReportAttachment[];
}

export interface InspectionReportPayload {
  kind: 'INSPECTION_REPORT';
  jobNumber: string;
  inspectedAt: string;
  status: string;
  customerName: string;
  contactNumber: string | null;
  vehicle: {
    make: string;
    model: string;
    modelYear: number;
    plateNumber: string | null;
    vin: string;
    color: string | null;
    odometer: number | null;
  };
  branchName: string | null;
  inspectorName: string | null;
  selectedAreas: InspectionSectionKey[];
  generalRemarks: string | null;
  interiorRemarks: string | null;
  exteriorRemarks: string | null;
  engineRemarks: string | null;
  roadTestRemarks: string | null;
  finalAssessment: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  sections: InspectionReportSection[];
}

// ---------------------------------------------------------------------------
// Financial documents
// ---------------------------------------------------------------------------

export interface FinancialDocumentLine {
  description: string;
  /** Present for a product or service line; absent for a free-text line. */
  sku?: string | null;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface FinancialDocumentPayload {
  kind: 'FINANCIAL';
  titleEn: string;
  titleAr: string;
  documentNumber: string;
  documentDate: string;
  dueDate: string | null;
  status: string;
  counterparty: {
    nameEn: string;
    nameAr: string;
    code: string;
    taxNumber: string | null;
    email: string | null;
    phone: string | null;
    addressLine: string | null;
    city: string | null;
  };
  lines: FinancialDocumentLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  currency: string;
  notes: string | null;
  /** Payment-specific fields, present only for a receipt or voucher. */
  payment?: {
    method: string;
    reference: string | null;
    receivedByName: string | null;
    paidAt: string;
  } | null;
}

export type DocumentPayload = InspectionReportPayload | FinancialDocumentPayload;
