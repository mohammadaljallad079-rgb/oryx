import { Injectable } from '@nestjs/common';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_ENTITY_TYPES,
  type DocumentEntityType,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, ERROR_CODES, notFound } from '../common/errors';
import { DocumentStorageService } from './document-storage.service';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';

/** Delegate name on PrismaService for each supported document owner. */
const OWNER_MODEL: Record<string, string> = {
  CUSTOMER: 'customer',
  COMPANY: 'company',
  SUPPLIER: 'supplier',
  EMPLOYEE: 'employee',
  VEHICLE: 'vehicle',
  JOB_CARD: 'jobCard',
  INSPECTION: 'inspectionBooking',
  PURCHASE_ORDER: 'purchaseOrder',
  SUPPLIER_INVOICE: 'supplierInvoice',
  JOURNAL_ENTRY: 'journalEntry',
  WORK_ORDER: 'workOrder',
  PROJECT: 'project',
};

export interface UploadedDocument {
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
  category?: string | null;
  title?: string | null;
  /** Optional opaque storage reference when a binary is stored out of band. */
  storageRef?: string | null;
  /** The uploaded binary; when present it is written to the storage root. */
  buffer?: Buffer | null;
}

/**
 * Unified document store.
 *
 * One table (`EntityAttachment`) backs documents for every record type. A
 * document is linked to its owner by `(entityType, entityId)` and is always
 * company-scoped: reads and writes resolve the caller's company first, so a
 * document belonging to another tenant is never listed, fetched or deleted even
 * if its id is known.
 *
 * A binary may either be uploaded (multipart) or registered by reference. In
 * both cases the metadata (name, size, type, uploader, timestamp) is stored, and
 * only `hint`-free metadata is ever returned — never a file's bytes.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: ErpContextService,
    private readonly storage: DocumentStorageService,
  ) {}

  /** Entity types a document may be attached to. */
  static readonly entityTypes = DOCUMENT_ENTITY_TYPES;

  private assertEntityType(entityType: string): DocumentEntityType {
    if (!(DOCUMENT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unsupported document entity type ${entityType}.`);
    }
    return entityType as DocumentEntityType;
  }

  /**
   * Confirm the owner record exists inside the company before a document is
   * linked, so an attachment cannot dangle from a missing or foreign record.
   */
  private async assertOwner(companyId: string, entityType: string, entityId: string): Promise<void> {
    const model = OWNER_MODEL[entityType];
    if (!model) return;
    const found = await (this.prisma as unknown as Record<string, {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    }>)[model].findFirst({ where: { id: entityId, companyId }, select: { id: true } });
    if (!found) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'The record this document belongs to was not found.');
  }

  async list(principal: RequestPrincipal, entityType: string, entityId: string, companyId?: string | null) {
    const scope = (await this.context.resolveCompanyScope(principal, companyId)).companyId;
    this.assertEntityType(entityType);
    const items = await this.prisma.entityAttachment.findMany({
      where: { companyId: scope, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map(toDocumentDto) };
  }

  async upload(
    principal: RequestPrincipal,
    input: { entityType: string; entityId: string; companyId?: string | null } & UploadedDocument,
    actor: ActorContext,
  ) {
    const scope = (await this.context.resolveCompanyScope(principal, input.companyId)).companyId;
    this.assertEntityType(input.entityType);
    if (!input.fileName?.trim()) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A file name is required.');
    }
    if (input.mimeType && !ALLOWED_DOCUMENT_MIME_TYPES.includes(input.mimeType)) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Unsupported file type ${input.mimeType}. Allowed: PDF, DOC/DOCX, XLS/XLSX, JPG, PNG.`,
      );
    }
    await this.assertOwner(scope, input.entityType, input.entityId);

    // A binary is written to the storage root; only its opaque reference is
    // recorded, never its bytes. A reference-only registration (no buffer) keeps
    // the caller-supplied `storageRef`.
    const stored = input.buffer
      ? await this.storage.store(scope, {
          originalName: input.fileName,
          mimeType: input.mimeType ?? null,
          buffer: input.buffer,
        })
      : null;

    const created = await this.prisma.entityAttachment.create({
      data: {
        companyId: scope,
        entityType: input.entityType,
        entityId: input.entityId,
        fileName: (stored?.fileName ?? input.fileName).trim().slice(0, 300),
        mimeType: stored?.mimeType ?? input.mimeType ?? null,
        sizeBytes: stored?.sizeBytes ?? input.sizeBytes ?? 0,
        storageRef: stored?.storageRef ?? input.storageRef ?? null,
        category: input.category ?? null,
        title: input.title ?? null,
        uploadedById: actor.userId,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId: scope,
      action: 'document.upload',
      targetType: input.entityType,
      targetId: input.entityId,
      summary: `Uploaded document ${created.fileName}`,
      metadata: { documentId: created.id, category: created.category },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });

    return toDocumentDto(created);
  }

  /** Replace a document's metadata (and optionally its stored reference). */
  async replace(
    principal: RequestPrincipal,
    id: string,
    input: UploadedDocument,
    actor: ActorContext,
  ) {
    const scope = (await this.context.resolveCompanyScope(principal)).companyId;
    const existing = await this.prisma.entityAttachment.findFirst({ where: { id, companyId: scope } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    if (input.mimeType && !ALLOWED_DOCUMENT_MIME_TYPES.includes(input.mimeType)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unsupported file type ${input.mimeType}.`);
    }

    const stored = input.buffer
      ? await this.storage.store(scope, {
          originalName: input.fileName ?? existing.fileName,
          mimeType: input.mimeType ?? existing.mimeType,
          buffer: input.buffer,
        })
      : null;
    // The previous binary is removed only after the replacement is stored.
    if (stored && existing.storageRef && existing.storageRef !== stored.storageRef) {
      await this.storage.remove(existing.storageRef);
    }

    const updated = await this.prisma.entityAttachment.update({
      where: { id },
      data: {
        fileName: (stored?.fileName ?? input.fileName)?.trim().slice(0, 300) ?? existing.fileName,
        mimeType: stored?.mimeType ?? input.mimeType ?? existing.mimeType,
        sizeBytes: stored?.sizeBytes ?? input.sizeBytes ?? existing.sizeBytes,
        storageRef: stored?.storageRef ?? input.storageRef ?? existing.storageRef,
        category: input.category ?? existing.category,
        title: input.title ?? existing.title,
        uploadedById: actor.userId,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: scope,
      action: 'document.replace',
      targetType: existing.entityType,
      targetId: existing.entityId,
      summary: `Replaced document ${updated.fileName}`,
      metadata: { documentId: updated.id },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
    return toDocumentDto(updated);
  }

  async remove(principal: RequestPrincipal, id: string, actor: ActorContext) {
    const scope = (await this.context.resolveCompanyScope(principal)).companyId;
    const existing = await this.prisma.entityAttachment.findFirst({ where: { id, companyId: scope } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    await this.prisma.entityAttachment.delete({ where: { id } });
    await this.storage.remove(existing.storageRef);
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: scope,
      action: 'document.delete',
      targetType: existing.entityType,
      targetId: existing.entityId,
      summary: `Deleted document ${existing.fileName}`,
      metadata: { documentId: existing.id },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
    return { deleted: true };
  }

  /**
   * Resolve a document for download.
   *
   * The company scope is resolved first, so a document belonging to another
   * tenant is not found even when its id is known. Only a stored binary can be
   * downloaded; a reference-only row reports that no file is held.
   */
  async download(principal: RequestPrincipal, id: string) {
    const scope = (await this.context.resolveCompanyScope(principal)).companyId;
    const row = await this.prisma.entityAttachment.findFirst({ where: { id, companyId: scope } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    if (!row.storageRef) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'This document holds no stored file.');
    }
    return {
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      stream: await this.storage.readStream(row.storageRef),
    };
  }
}

function toDocumentDto(row: {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storageRef: string | null;
  category: string | null;
  title: string | null;
  uploadedById: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageRef: row.storageRef,
    category: row.category,
    title: row.title,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}
