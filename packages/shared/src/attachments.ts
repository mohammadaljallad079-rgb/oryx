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

/** The record kinds an attachment can hang off. */
export const ATTACHMENT_ENTITY_TYPES = ['SALES_INVOICE', 'PAYMENT'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/** Accepted upload MIME types. A screenshot is a PNG or a JPEG. */
export const ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** The hard ceiling on one attachment, matching the upload interceptor. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Human-readable label for the accept attribute of a file input. */
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** What the API returns for an attachment; never the stored bytes. */
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
