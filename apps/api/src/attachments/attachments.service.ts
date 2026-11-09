import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import {
  ATTACHMENT_ENTITY_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  type AttachmentDto,
  type AttachmentEntityType,
} from '@oryx/shared';
import { badRequest, ERROR_CODES, notFound } from '../common/errors';
import { ErpContextService } from '../common/erp-context.service';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import type { RequestPrincipal } from '../auth/auth.decorators';

/** Minimal shape of an uploaded multipart file (avoids a hard @types/multer dep). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
};

/**
 * Attachments for sales invoices and financial receipts.
 *
 * The binary lands on disk under an opaque, server-generated name; the database
 * keeps only metadata and that reference. Every route is scoped by the owning
 * record's company, so a user can only attach to — or read — a document inside
 * their own tenant, and the download path re-checks that ownership each time
 * rather than trusting the stored reference alone.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly root: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
    private readonly audit: AuditService,
  ) {
    this.root = resolve(
      process.env.ATTACHMENT_STORAGE_DIR ?? join(process.cwd(), 'storage', 'attachments'),
    );
  }

  private static assertEntityType(entityType: string): AttachmentEntityType {
    if (!(ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unsupported attachment entity type.');
    }
    return entityType as AttachmentEntityType;
  }

  /** Assert the record exists inside the company before a file is linked to it. */
  private async assertEntityExists(
    companyId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<void> {
    if (entityType === 'SALES_INVOICE') {
      const found = await this.prisma.salesInvoice.findFirst({ where: { id: entityId, companyId } });
      if (!found) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales invoice not found.');
      return;
    }
    if (entityType === 'PAYMENT') {
      const found = await this.prisma.payment.findFirst({ where: { id: entityId, companyId } });
      if (!found) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Receipt not found.');
      return;
    }
    throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unsupported attachment entity type.');
  }

  private toDto(row: {
    id: string;
    entityType: string;
    entityId: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number;
    uploadedById: string | null;
    createdAt: Date;
  }): AttachmentDto {
    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(
    entityTypeRaw: string,
    entityId: string,
    principal: RequestPrincipal,
  ): Promise<AttachmentDto[]> {
    const entityType = AttachmentsService.assertEntityType(entityTypeRaw);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEntityExists(companyId, entityType, entityId);
    const rows = await this.prisma.entityAttachment.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async upload(
    entityTypeRaw: string,
    entityId: string,
    file: UploadedFileLike | undefined,
    principal: RequestPrincipal,
  ): Promise<AttachmentDto> {
    const entityType = AttachmentsService.assertEntityType(entityTypeRaw);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEntityExists(companyId, entityType, entityId);

    if (!file || !file.buffer || file.size === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A file is required.');
    }
    if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Only PDF, JPG, PNG and screenshot images are accepted.',
      );
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The file exceeds the 10 MB limit.');
    }

    const safeName = basename(file.originalname || 'attachment').slice(0, 200);
    const ext = EXTENSIONS[file.mimetype] ?? extname(safeName);
    const stored = `${randomUUID()}${ext}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, stored), file.buffer);

    const row = await this.prisma.entityAttachment.create({
      data: {
        companyId,
        entityType,
        entityId,
        fileName: safeName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageRef: stored,
        uploadedById: principal.userId,
      },
    });
    await this.audit.record({
      actorUserId: principal.userId,
      companyId,
      action: 'attachment.uploaded',
      targetType: entityType,
      targetId: entityId,
      summary: `Attached ${safeName} (${file.mimetype})`,
    });
    return this.toDto(row);
  }

  /** Resolve a stored file for streaming; verifies tenant + entity ownership. */
  async resolveForDownload(
    entityTypeRaw: string,
    entityId: string,
    attachmentId: string,
    principal: RequestPrincipal,
  ): Promise<{ path: string; fileName: string; mimeType: string; sizeBytes: number }> {
    const entityType = AttachmentsService.assertEntityType(entityTypeRaw);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const row = await this.prisma.entityAttachment.findFirst({
      where: { id: attachmentId, companyId, entityType, entityId },
    });
    if (!row || !row.storageRef) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Attachment not found.');
    }

    const path = join(this.root, row.storageRef);
    // Guard against a tampered storage reference escaping the storage root.
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Attachment not found.');
    }
    try {
      await stat(path);
    } catch {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Attachment file is missing.');
    }
    return {
      path,
      fileName: row.fileName,
      mimeType: row.mimeType ?? 'application/octet-stream',
      sizeBytes: row.sizeBytes,
    };
  }

  stream(path: string): ReturnType<typeof createReadStream> {
    return createReadStream(path);
  }

  async remove(
    entityTypeRaw: string,
    entityId: string,
    attachmentId: string,
    principal: RequestPrincipal,
  ): Promise<{ deleted: true }> {
    const entityType = AttachmentsService.assertEntityType(entityTypeRaw);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const row = await this.prisma.entityAttachment.findFirst({
      where: { id: attachmentId, companyId, entityType, entityId },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Attachment not found.');

    await this.prisma.entityAttachment.delete({ where: { id: row.id } });
    if (row.storageRef) {
      const path = join(this.root, row.storageRef);
      if (path === this.root || path.startsWith(this.root + sep)) {
        await unlink(path).catch(() => undefined);
      }
    }
    await this.audit.record({
      actorUserId: principal.userId,
      companyId,
      action: 'attachment.removed',
      targetType: entityType,
      targetId: entityId,
      summary: `Removed ${row.fileName}`,
    });
    return { deleted: true };
  }
}
