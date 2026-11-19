import { Injectable } from '@nestjs/common';
import type { ReadStream } from 'node:fs';
import {
  attachmentPreviewKind,
  getAttachmentEntity,
  isAllowedAttachmentType,
  resolveMimeType,
  type AttachmentEntityDefinition,
  type AttachmentPreviewKind,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { AttachmentStorage } from './attachment-storage.service';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentDto {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isPrimary: boolean;
  isConfidential: boolean;
  previewKind: AttachmentPreviewKind;
  uploadedById: string | null;
  createdAt: string;
  /** Present only when the caller may read confidential rows. */
  canDownload: boolean;
}

const MAX_FILES_PER_REQUEST = 10;

/**
 * Unified attachment service.
 *
 * One implementation serves every module: the entity catalogue in
 * `@oryx/shared` decides which permissions apply, the request's company scope
 * decides which tenant the row belongs to, and confidentiality is enforced on
 * read rather than hidden in the UI.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: ErpContextService,
    private readonly storage: AttachmentStorage,
  ) {}

  /** Resolve the catalogue entry or fail: an undeclared entity cannot be attached to. */
  private definition(entityType: string): AttachmentEntityDefinition {
    const def = getAttachmentEntity(entityType);
    if (!def) throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown attachment entity type: ${entityType}`);
    return def;
  }

  private canSeeConfidential(def: AttachmentEntityDefinition, principal: RequestPrincipal): boolean {
    if (!def.confidentialPermission) return true;
    return principal.grantedPermissions.includes(def.confidentialPermission);
  }

  private assertRead(def: AttachmentEntityDefinition, principal: RequestPrincipal): void {
    if (!principal.grantedPermissions.includes(def.readPermission)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, `Missing permission: ${def.readPermission}`);
    }
  }

  private assertWrite(def: AttachmentEntityDefinition, principal: RequestPrincipal): void {
    if (!principal.grantedPermissions.includes(def.writePermission)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, `Missing permission: ${def.writePermission}`);
    }
  }

  async list(entityType: string, entityId: string, principal: RequestPrincipal): Promise<{ items: AttachmentDto[]; total: number }> {
    const def = this.definition(entityType);
    this.assertRead(def, principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const canSeeConfidential = this.canSeeConfidential(def, principal);
    const rows = await this.prisma.entityAttachment.findMany({
      where: { companyId, entityType, entityId, ...(canSeeConfidential ? {} : { isConfidential: false }) },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      items: rows.map((row) => this.toDto(row, canSeeConfidential)),
      total: rows.length,
    };
  }

  /**
   * Upload one or more files to an entity.
   *
   * Every file is validated before anything is written, so a request that
   * contains one disallowed file stores nothing at all.
   */
  async upload(
    entityType: string,
    entityId: string,
    files: UploadedFileLike[],
    options: { isConfidential?: boolean; isPrimary?: boolean },
    principal: RequestPrincipal,
    actor: ActorContext,
  ): Promise<{ items: AttachmentDto[] }> {
    const def = this.definition(entityType);
    this.assertWrite(def, principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    if (files.length === 0) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No file was uploaded.');
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `At most ${MAX_FILES_PER_REQUEST} files may be uploaded at once.`);
    }
    if (options.isConfidential && !this.canSeeConfidential(def, principal)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'You cannot mark an attachment confidential.');
    }

    const prepared = files.map((file) => {
      const fileName = sanitiseFileName(file.originalname);
      const mimeType = resolveMimeType(fileName, file.mimetype);
      if (!isAllowedAttachmentType(mimeType)) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unsupported file type: ${mimeType}`);
      }
      return { file, fileName, mimeType };
    });

    const created: AttachmentDto[] = [];
    for (const item of prepared) {
      const stored = await this.storage.write(companyId, item.fileName, item.file.buffer);
      const row = await this.prisma.entityAttachment.create({
        data: {
          companyId,
          entityType,
          entityId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: stored.sizeBytes,
          storageRef: stored.storageRef,
          checksum: stored.checksum,
          isConfidential: options.isConfidential ?? false,
          isPrimary: options.isPrimary ?? false,
          uploadedById: actor.userId,
        },
      });
      if (row.isPrimary) await this.clearOtherPrimary(companyId, entityType, entityId, row.id);
      created.push(this.toDto(row, this.canSeeConfidential(def, principal)));
    }

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'attachments.uploaded',
      targetType: entityType,
      targetId: entityId,
      // Audit by file name and count, never by content.
      summary: `Uploaded ${created.length} attachment(s): ${created.map((c) => c.fileName).join(', ')}`,
    });
    return { items: created };
  }

  /**
   * Replace the binary of an existing attachment in place.
   *
   * Replacing keeps the row id and every link that points at it, and is how the
   * UI implements "replace before saving" without losing the association.
   */
  async replace(
    id: string,
    file: UploadedFileLike,
    principal: RequestPrincipal,
    actor: ActorContext,
  ): Promise<AttachmentDto> {
    const row = await this.findOne(id, principal, 'write');
    const def = this.definition(row.entityType);
    const fileName = sanitiseFileName(file.originalname);
    const mimeType = resolveMimeType(fileName, file.mimetype);
    if (!isAllowedAttachmentType(mimeType)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unsupported file type: ${mimeType}`);
    }
    const stored = await this.storage.write(row.companyId, fileName, file.buffer);
    const updated = await this.prisma.entityAttachment.update({
      where: { id },
      data: {
        fileName,
        mimeType,
        sizeBytes: stored.sizeBytes,
        storageRef: stored.storageRef,
        checksum: stored.checksum,
        uploadedById: actor.userId,
        createdAt: new Date(),
      },
    });
    await this.storage.remove(row.storageRef);
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: row.companyId,
      action: 'attachments.replaced',
      targetType: row.entityType,
      targetId: row.entityId,
      summary: `Replaced attachment ${row.fileName} with ${fileName}`,
    });
    return this.toDto(updated, this.canSeeConfidential(def, principal));
  }

  async update(
    id: string,
    dto: { fileName?: string; isPrimary?: boolean; isConfidential?: boolean },
    principal: RequestPrincipal,
    actor: ActorContext,
  ): Promise<AttachmentDto> {
    const row = await this.findOne(id, principal, 'write');
    const def = this.definition(row.entityType);
    if (dto.isConfidential !== undefined && !this.canSeeConfidential(def, principal)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'You cannot change the confidentiality of an attachment.');
    }
    const updated = await this.prisma.entityAttachment.update({
      where: { id },
      data: {
        ...(dto.fileName !== undefined ? { fileName: sanitiseFileName(dto.fileName) } : {}),
        ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        ...(dto.isConfidential !== undefined ? { isConfidential: dto.isConfidential } : {}),
      },
    });
    if (updated.isPrimary) await this.clearOtherPrimary(updated.companyId, updated.entityType, updated.entityId, updated.id);
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: row.companyId,
      action: 'attachments.updated',
      targetType: row.entityType,
      targetId: row.entityId,
      summary: `Updated attachment ${updated.fileName}`,
    });
    return this.toDto(updated, this.canSeeConfidential(def, principal));
  }

  async remove(id: string, principal: RequestPrincipal, actor: ActorContext): Promise<{ id: string }> {
    const row = await this.findOne(id, principal, 'write');
    await this.prisma.entityAttachment.delete({ where: { id } });
    await this.storage.remove(row.storageRef);
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: row.companyId,
      action: 'attachments.deleted',
      targetType: row.entityType,
      targetId: row.entityId,
      summary: `Deleted attachment ${row.fileName}`,
    });
    return { id };
  }

  /** Stream a stored file. Confidential rows are refused without the extra permission. */
  async open(
    id: string,
    principal: RequestPrincipal,
    disposition: 'inline' | 'attachment',
  ): Promise<{ stream: ReadStream; sizeBytes: number; fileName: string; mimeType: string; disposition: string }> {
    const row = await this.findOne(id, principal, 'read');
    if (!row.storageRef) throw badRequest(ERROR_CODES.RESOURCE_NOT_FOUND, 'This attachment has no stored file.');
    const { stream, sizeBytes } = await this.storage.read(row.storageRef);
    return {
      stream,
      sizeBytes,
      fileName: row.fileName,
      mimeType: resolveMimeType(row.fileName, row.mimeType),
      disposition,
    };
  }

  /**
   * Copy every attachment of `fromEntityId` onto `toEntityId`.
   *
   * Used when a record is created together with its attachments in one save:
   * the form uploads against a draft key, and the save re-parents the files to
   * the real row without re-uploading them.
   */
  async reattach(
    companyId: string,
    entityType: string,
    fromEntityId: string,
    toEntityId: string,
  ): Promise<number> {
    if (fromEntityId === toEntityId) return 0;
    const result = await this.prisma.entityAttachment.updateMany({
      where: { companyId, entityType, entityId: fromEntityId },
      data: { entityId: toEntityId },
    });
    return result.count;
  }

  /** Attachments for a set of entities in one query (preview screens). */
  async listForEntities(
    companyId: string,
    entityType: string,
    entityIds: string[],
    canSeeConfidential: boolean,
  ): Promise<Record<string, AttachmentDto[]>> {
    if (entityIds.length === 0) return {};
    const rows = await this.prisma.entityAttachment.findMany({
      where: {
        companyId,
        entityType,
        entityId: { in: entityIds },
        ...(canSeeConfidential ? {} : { isConfidential: false }),
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
    const out: Record<string, AttachmentDto[]> = {};
    for (const row of rows) {
      (out[row.entityId] ??= []).push(this.toDto(row, canSeeConfidential));
    }
    return out;
  }

  // ---------------------------------------------------------------- helpers

  private async findOne(
    id: string,
    principal: RequestPrincipal,
    mode: 'read' | 'write',
  ): Promise<{
    id: string;
    companyId: string;
    entityType: string;
    entityId: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number;
    storageRef: string | null;
    isPrimary: boolean;
    isConfidential: boolean;
    uploadedById: string | null;
    createdAt: Date;
  }> {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const row = await this.prisma.entityAttachment.findFirst({ where: { id, companyId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Attachment not found.');
    const def = this.definition(row.entityType);
    if (mode === 'write') this.assertWrite(def, principal);
    else this.assertRead(def, principal);
    if (row.isConfidential && !this.canSeeConfidential(def, principal)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'This attachment is confidential.');
    }
    return row;
  }

  private async clearOtherPrimary(companyId: string, entityType: string, entityId: string, keepId: string): Promise<void> {
    await this.prisma.entityAttachment.updateMany({
      where: { companyId, entityType, entityId, isPrimary: true, id: { not: keepId } },
      data: { isPrimary: false },
    });
  }

  private toDto(
    row: {
      id: string;
      companyId: string;
      entityType: string;
      entityId: string;
      fileName: string;
      mimeType: string | null;
      sizeBytes: number;
      isPrimary: boolean;
      isConfidential: boolean;
      uploadedById: string | null;
      createdAt: Date;
    },
    canSeeConfidential: boolean,
  ): AttachmentDto {
    const mimeType = resolveMimeType(row.fileName, row.mimeType);
    return {
      id: row.id,
      companyId: row.companyId,
      entityType: row.entityType,
      entityId: row.entityId,
      fileName: row.fileName,
      mimeType,
      sizeBytes: row.sizeBytes,
      isPrimary: row.isPrimary,
      isConfidential: row.isConfidential,
      previewKind: attachmentPreviewKind(mimeType, row.fileName),
      uploadedById: row.uploadedById,
      createdAt: row.createdAt.toISOString(),
      canDownload: !row.isConfidential || canSeeConfidential,
    };
  }
}

/**
 * Keep only the last path segment and strip control characters, so a crafted
 * upload name cannot traverse directories or break a Content-Disposition header.
 */
export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  const safe = cleaned.length > 0 ? cleaned : 'file';
  return safe.length > 240 ? safe.slice(safe.length - 240) : safe;
}
