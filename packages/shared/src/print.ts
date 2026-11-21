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
  /** Registered city printed after the address on the footer's legal line. */
  city: string | null;
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

/**
 * The verification block a printed document may carry.
 *
 * It is present only when the document has actually been issued, so the code on
 * the sheet is the same token the public verification endpoint resolves. A
 * document that was never issued prints no code rather than inventing one that
 * would scan to nothing.
 */
export interface PrintVerificationDto {
  /** The public verification URL the QR encodes. */
  url: string;
  /** The PNG data URI drawn on the sheet. */
  qrDataUri: string;
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
  /**
   * The issued document's verification code, when the record has been issued.
   * `null` for a record that has not been issued yet.
   */
  verification: PrintVerificationDto | null;
}

