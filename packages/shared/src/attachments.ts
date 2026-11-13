/**
 * Document attachments.
 *
 * A sales invoice or a financial receipt can carry supporting paperwork — a
 * signed delivery note, a supplier's PDF, a photo of a cheque. The binary is
 * stored on disk and the database row keeps only the metadata plus an opaque
 * storage reference, so the value never travels in a listing and cannot be
 * guessed from an id.
 *
 * The accepted types are the ones an operator actually has to hand: PDF, JPG,
 * PNG and phone screenshots (which arrive as PNG or JPG). Anything else is
 * refused rather than stored unopenable.
 */

/**
 * The record kinds an attachment can hang off.
 *
 * One unified register serves every form that carries paperwork: a customer, a
 * company customer, a supplier, an employee, a vehicle, a maintenance job, a
 * purchase order, an accounting entry, a contract and the sales/payment
 * documents that already used it. The owning row is checked inside the tenant
 * before any file is linked, so an attachment can never be orphaned or shared
 * across companies.
 */
export const ATTACHMENT_ENTITY_TYPES = [
  'SALES_INVOICE',
  'PAYMENT',
  'EMPLOYEE',
  'CUSTOMER',
  'SUPPLIER',
  'VEHICLE',
  'WORK_ORDER',
  'JOB_CARD',
  'PURCHASE_ORDER',
  'JOURNAL_ENTRY',
  'CONTRACT',
  'INSPECTION',
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/** Accepted upload MIME types: the office documents and images an operator has. */
export const ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** The hard ceiling on one attachment, matching the upload interceptor. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Human-readable label for the accept attribute of a file input. */
export const ATTACHMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'image/jpeg,image/png';

/**
 * A document category, so a record's paperwork can be classified rather than
 * listed as an undifferentiated pile.
 */
export const ATTACHMENT_CATEGORIES = [
  'IDENTITY',
  'CONTRACT',
  'CERTIFICATE',
  'CV',
  'INVOICE',
  'RECEIPT',
  'PHOTO',
  'REPORT',
  'OFFICIAL',
  'OTHER',
] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

/** What the API returns for an attachment; never the stored bytes. */
export interface AttachmentDto {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedById: string | null;
  /** Classification of the document; null for rows created before categories. */
  category: string | null;
  createdAt: string;
}
