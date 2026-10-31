import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import { MediaStorageService, type StoredVariant } from './media-storage.service';
import type { UpdateMediaAssetDto, UpsertMediaFolderDto } from './cms.dto';

export interface MediaUsage {
  kind: 'banner' | 'service_category' | 'content_block';
  id: string;
  label: string;
}

/**
 * Website media library.
 *
 * Deletion is guarded rather than cascading: an image that a banner, a service
 * category or a content block still points at is refused with the list of
 * places it is used, so an administrator cannot silently blank out the
 * homepage by cleaning up the library.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ folders
  listFolders() {
    return this.prisma.cmsMediaFolder.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { assets: true } } },
    });
  }

  async upsertFolder(dto: UpsertMediaFolderDto, actor: ActorContext) {
    const folder = await this.prisma.cmsMediaFolder.upsert({
      where: { slug: dto.slug },
      update: { name: dto.name, sortOrder: dto.sortOrder ?? 0 },
      create: { slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_folder_upserted',
      targetType: 'CMS_MEDIA_FOLDER',
      targetId: folder.id,
      summary: `Upserted media folder ${folder.slug}`,
    });
    return folder;
  }

  async deleteFolder(id: string, actor: ActorContext) {
    const folder = await this.prisma.cmsMediaFolder.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!folder) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Folder not found.');
    if (folder._count.assets > 0) {
      throw conflict(
        ERROR_CODES.MEDIA_IN_USE,
        `Folder still holds ${folder._count.assets} asset(s). Move them first.`,
      );
    }
    await this.prisma.cmsMediaFolder.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_folder_deleted',
      targetType: 'CMS_MEDIA_FOLDER',
      targetId: id,
      summary: `Deleted media folder ${folder.slug}`,
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------- assets
  async listAssets(params: {
    folderId?: string;
    search?: string;
    tag?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 40, 1), 200);
    const where = {
      ...(params.folderId ? { folderId: params.folderId } : {}),
      ...(params.tag ? { tags: { has: params.tag } } : {}),
      ...(params.search
        ? {
            OR: [
              { originalName: { contains: params.search, mode: 'insensitive' as const } },
              { altEn: { contains: params.search, mode: 'insensitive' as const } },
              { altAr: { contains: params.search, mode: 'insensitive' as const } },
              { caption: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.cmsMediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { folder: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.cmsMediaAsset.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getAsset(id: string) {
    const asset = await this.prisma.cmsMediaAsset.findUnique({
      where: { id },
      include: {
        folder: { select: { id: true, name: true, slug: true } },
        versions: { orderBy: { revision: 'desc' }, take: 20 },
      },
    });
    if (!asset) throw notFound(ERROR_CODES.MEDIA_NOT_FOUND, 'Image not found.');
    return { ...asset, usage: await this.usage(id) };
  }

  /** Every place an asset is referenced, so deletion can be refused safely. */
  async usage(id: string): Promise<MediaUsage[]> {
    const [banners, categories, blocks] = await Promise.all([
      this.prisma.cmsBanner.findMany({
        where: { mediaAssetId: id },
        select: { id: true, title: true, placement: true, locale: true },
      }),
      this.prisma.serviceCategory.findMany({
        where: { imageAssetId: id },
        select: { id: true, key: true, nameEn: true },
      }),
      this.prisma.cmsContentBlock.findMany({
        where: { mediaAssetId: id },
        select: { id: true, key: true, locale: true },
      }),
    ]);

    return [
      ...banners.map((b) => ({
        kind: 'banner' as const,
        id: b.id,
        label: `Banner “${b.title}” (${b.placement}, ${b.locale})`,
      })),
      ...categories.map((c) => ({
        kind: 'service_category' as const,
        id: c.id,
        label: `Service category “${c.nameEn}”`,
      })),
      ...blocks.map((b) => ({
        kind: 'content_block' as const,
        id: b.id,
        label: `Website content “${b.key}” (${b.locale})`,
      })),
    ];
  }

  async upload(
    file: { buffer: Buffer; originalname: string },
    options: {
      folderId?: string;
      altAr?: string;
      altEn?: string;
      caption?: string;
      credit?: string;
      licenseNote?: string;
      tags?: string[];
      focalX?: number;
      focalY?: number;
    },
    actor: ActorContext,
  ) {
    const stored = await this.storage.store(file.buffer);

    const asset = await this.prisma.cmsMediaAsset.create({
      data: {
        folderId: options.folderId ?? null,
        originalName: file.originalname.slice(0, 255),
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        dominantColor: stored.dominantColor,
        blurDataUrl: stored.blurDataUrl,
        variants: stored.variants as never,
        focalX: options.focalX ?? 50,
        focalY: options.focalY ?? 50,
        altAr: options.altAr ?? null,
        altEn: options.altEn ?? null,
        caption: options.caption ?? null,
        credit: options.credit ?? null,
        licenseNote: options.licenseNote ?? null,
        tags: options.tags ?? [],
        createdByUserId: actor.userId ?? null,
      },
    });

    await this.prisma.cmsMediaAssetVersion.create({
      data: {
        assetId: asset.id,
        revision: 1,
        snapshot: {
          altAr: asset.altAr,
          altEn: asset.altEn,
          caption: asset.caption,
          focalX: asset.focalX,
          focalY: asset.focalY,
          credit: asset.credit,
          licenseNote: asset.licenseNote,
        } as never,
        actorUserId: actor.userId ?? null,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_uploaded',
      targetType: 'CMS_MEDIA_ASSET',
      targetId: asset.id,
      summary: `Uploaded image ${asset.originalName} (${asset.width}×${asset.height})`,
      metadata: { storageKey: asset.storageKey, byteSize: asset.byteSize },
    });

    return asset;
  }

  /**
   * Metadata edit. Appends a version so the previous values can be restored,
   * and regenerates the crop when the focal point moved.
   */
  async updateAsset(id: string, dto: UpdateMediaAssetDto, actor: ActorContext) {
    const existing = await this.prisma.cmsMediaAsset.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.MEDIA_NOT_FOUND, 'Image not found.');

    const lastVersion = await this.prisma.cmsMediaAssetVersion.findFirst({
      where: { assetId: id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    const revision = (lastVersion?.revision ?? 0) + 1;

    const focalChanged =
      (dto.focalX !== undefined && dto.focalX !== existing.focalX) ||
      (dto.focalY !== undefined && dto.focalY !== existing.focalY);

    let variants = existing.variants as unknown as Record<string, StoredVariant>;
    if (focalChanged) {
      const focalX = dto.focalX ?? existing.focalX;
      const focalY = dto.focalY ?? existing.focalY;
      const recropped: Record<string, StoredVariant> = { ...variants };
      for (const name of ['card', 'wide', 'hero'] as const) {
        recropped[name] = await this.storage.cropAtFocalPoint(
          existing.storageKey,
          focalX,
          focalY,
          name,
        );
      }
      variants = recropped;
    }

    const asset = await this.prisma.cmsMediaAsset.update({
      where: { id },
      data: {
        folderId: dto.folderId === undefined ? undefined : dto.folderId,
        altAr: dto.altAr === undefined ? undefined : dto.altAr,
        altEn: dto.altEn === undefined ? undefined : dto.altEn,
        caption: dto.caption === undefined ? undefined : dto.caption,
        credit: dto.credit === undefined ? undefined : dto.credit,
        licenseNote: dto.licenseNote === undefined ? undefined : dto.licenseNote,
        tags: dto.tags === undefined ? undefined : dto.tags,
        focalX: dto.focalX === undefined ? undefined : dto.focalX,
        focalY: dto.focalY === undefined ? undefined : dto.focalY,
        variants: variants as never,
      },
    });

    await this.prisma.cmsMediaAssetVersion.create({
      data: {
        assetId: id,
        revision,
        snapshot: {
          altAr: asset.altAr,
          altEn: asset.altEn,
          caption: asset.caption,
          focalX: asset.focalX,
          focalY: asset.focalY,
          credit: asset.credit,
          licenseNote: asset.licenseNote,
        } as never,
        actorUserId: actor.userId ?? null,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_updated',
      targetType: 'CMS_MEDIA_ASSET',
      targetId: id,
      summary: `Updated image ${asset.originalName}`,
      metadata: { revision, focalChanged },
    });

    return asset;
  }

  /** Replaces the binary of an asset in place, keeping its id and references. */
  async replaceAsset(id: string, file: { buffer: Buffer; originalname: string }, actor: ActorContext) {
    const existing = await this.prisma.cmsMediaAsset.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.MEDIA_NOT_FOUND, 'Image not found.');

    const stored = await this.storage.store(file.buffer);

    const lastVersion = await this.prisma.cmsMediaAssetVersion.findFirst({
      where: { assetId: id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });

    const asset = await this.prisma.cmsMediaAsset.update({
      where: { id },
      data: {
        storageKey: stored.storageKey,
        originalName: file.originalname.slice(0, 255),
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        dominantColor: stored.dominantColor,
        blurDataUrl: stored.blurDataUrl,
        variants: stored.variants as never,
      },
    });

    await this.prisma.cmsMediaAssetVersion.create({
      data: {
        assetId: id,
        revision: (lastVersion?.revision ?? 0) + 1,
        snapshot: {
          replacedStorageKey: existing.storageKey,
          storageKey: stored.storageKey,
          altAr: asset.altAr,
          altEn: asset.altEn,
          caption: asset.caption,
          focalX: asset.focalX,
          focalY: asset.focalY,
        } as never,
        actorUserId: actor.userId ?? null,
      },
    });

    // The old bytes are only removed after the row points at the new file, so a
    // failure cannot leave a row referencing a deleted file.
    await this.storage.remove(
      existing.storageKey,
      existing.variants as unknown as Record<string, StoredVariant>,
    );

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_replaced',
      targetType: 'CMS_MEDIA_ASSET',
      targetId: id,
      summary: `Replaced image ${asset.originalName}`,
      metadata: { from: existing.storageKey, to: stored.storageKey },
    });

    return asset;
  }

  /** Restores the metadata captured in a previous version of an asset. */
  async restoreAssetVersion(id: string, revision: number, actor: ActorContext) {
    const version = await this.prisma.cmsMediaAssetVersion.findUnique({
      where: { assetId_revision: { assetId: id, revision } },
    });
    if (!version) throw notFound(ERROR_CODES.CONTENT_REVISION_NOT_FOUND, 'That version does not exist.');

    const snapshot = version.snapshot as Record<string, unknown>;
    const asset = await this.prisma.cmsMediaAsset.update({
      where: { id },
      data: {
        altAr: (snapshot.altAr as string | null) ?? null,
        altEn: (snapshot.altEn as string | null) ?? null,
        caption: (snapshot.caption as string | null) ?? null,
        credit: (snapshot.credit as string | null) ?? null,
        licenseNote: (snapshot.licenseNote as string | null) ?? null,
        focalX: (snapshot.focalX as number) ?? 50,
        focalY: (snapshot.focalY as number) ?? 50,
      },
    });

    const last = await this.prisma.cmsMediaAssetVersion.findFirst({
      where: { assetId: id },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    await this.prisma.cmsMediaAssetVersion.create({
      data: {
        assetId: id,
        revision: (last?.revision ?? 0) + 1,
        snapshot: snapshot as never,
        actorUserId: actor.userId ?? null,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_version_restored',
      targetType: 'CMS_MEDIA_ASSET',
      targetId: id,
      summary: `Restored image ${asset.originalName} to version ${revision}`,
    });

    return asset;
  }

  async deleteAsset(id: string, actor: ActorContext) {
    const asset = await this.prisma.cmsMediaAsset.findUnique({ where: { id } });
    if (!asset) throw notFound(ERROR_CODES.MEDIA_NOT_FOUND, 'Image not found.');

    const usage = await this.usage(id);
    if (usage.length > 0) {
      throw conflict(
        ERROR_CODES.MEDIA_IN_USE,
        `This image is still used in ${usage.length} place(s): ${usage.map((u) => u.label).join('; ')}`,
      );
    }

    await this.prisma.cmsMediaAsset.delete({ where: { id } });
    await this.storage.remove(
      asset.storageKey,
      asset.variants as unknown as Record<string, StoredVariant>,
    );

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.media_deleted',
      targetType: 'CMS_MEDIA_ASSET',
      targetId: id,
      summary: `Deleted image ${asset.originalName}`,
      metadata: { storageKey: asset.storageKey },
    });

    return { ok: true };
  }
}
