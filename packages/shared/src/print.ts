/**
 * Print model.
 *
 * A single, framework-free description of a printable document. The API builds
 * it (so every field is resolved from its real source and the tenant's data)
 * and the admin app renders it (so the browser's print dialog produces the PDF
 * the user expects). Keeping the shape in `@oryx/shared` means the fields the
 * print template needs are exactly the fields the API guarantees, which is what
 * keeps the printed document and the approved original in step.
 */

export type PrintDocumentKind = 'SALES_INVOICE' | 'QUOTATION' | 'SALES_ORDER' | 'CREDIT_NOTE' | 'RECEIPT';

export interface PrintCompanyDto {
  nameEn: string;
  nameAr: string;
  legalNameEn: string | null;
  taxNumber: string | null;
  currency: string;
  countryCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine: string | null;
  crNumber: string | null;
}

export interface PrintPartyDto {
  name: string;
  nameAr: string | null;
  addressLine: string | null;
  city: string | null;
  countryCode: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
}

export interface PrintLineDto {
  description: string;
  /** Optional note printed under the description, as on the approved form. */
  subDescription?: string | null;
  quantity: string;
  unitPrice: string;
  taxLabel: string;
  discountPercent: string;
  amount: string;
}

export interface PrintTotalsDto {
  untaxedAmount: string;
  taxLabel: string;
  taxAmount: string;
  discount: string;
  total: string;
}

export interface PrintDocumentDto {
  kind: PrintDocumentKind;
  /** Human-facing document number, e.g. SI-00001 or PMT-00001. */
  documentNumber: string;
  /** Localised document title, e.g. فاتورة / INVOICE. */
  titleEn: string;
  titleAr: string;
  issueDateLabel: string;
  issueDateValue: string;
  secondaryDateLabel: string | null;
  secondaryDateValue: string | null;
  staffName: string;
  paymentLabel: string | null;
  paymentValue: string | null;
  reference: string | null;
  company: PrintCompanyDto;
  party: PrintPartyDto;
  lines: PrintLineDto[];
  totals: PrintTotalsDto;
  amountInWords: string;
  notes: string | null;
  currency: string;
}

/** Attachment metadata returned by the API. The stored value never leaves it. */
export interface AttachmentDto {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedById: string | null;
  createdAt: string;
}

/** Document kinds an attachment may be linked to. */
export const ATTACHMENT_ENTITY_TYPES = ['SALES_INVOICE', 'PAYMENT'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/** Accepted attachment MIME types: PDF, JPG, PNG and screenshots (png/jpeg). */
export const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
