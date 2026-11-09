import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type {
  UpdateServiceCategoryDto,
  UpsertBannerFullDto,
  UpsertContentBlockDto,
} from './cms.dto';

/**
 * Dynamic website content.
 *
 * A content block is one editable slot addressed by a stable key
 * (`home.hero.title`, `about.body`, …). Each block holds one locale, so Arabic
 * and English are edited independently and neither can silently fall back to
 * the other in the database. `isPublished` is what the public endpoint filters
 * on: an administrator can stage an edit, look at it in the admin preview, and
 * only then publish it.
 *
 * Every write appends a revision, which is what makes "revert to the previous
 * content" a real operation rather than a promise.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listBlocks(params: { locale?: string; keyPrefix?: string; includeUnpublished?: boolean }) {
    return this.prisma.cmsContentBlock.findMany({
      where: {
        ...(params.locale ? { locale: params.locale as never } : {}),
        ...(params.keyPrefix ? { key: { startsWith: params.keyPrefix } } : {}),
        ...(params.includeUnpublished ? {} : { isPublished: true }),
      },
      orderBy: [{ key: 'asc' }, { locale: 'asc' }],
      include: {
        mediaAsset: {
          select: {
            id: true,
            storageKey: true,
            width: true,
            height: true,
            altAr: true,
            altEn: true,
            dominantColor: true,
            blurDataUrl: true,
            variants: true,
            focalX: true,
            focalY: true,
          },
        },
      },
    });
  }

  /**
   * Creates or updates a block. Passing `isPublished` publishes or unpublishes
   * in the same write, and the prior state is snapshotted first so a revert has
   * something to restore.
   */
  async upsertBlock(dto: UpsertContentBlockDto, actor: ActorContext) {
    const existing = await this.prisma.cmsContentBlock.findUnique({
      where: { key_locale: { key: dto.key, locale: dto.locale } },
    });

    if (existing) {
      await this.snapshot(existing.id, {
        value: existing.value,
        body: existing.body,
        mediaAssetId: existing.mediaAssetId,
        linkUrl: existing.linkUrl,
        linkLabel: existing.linkLabel,
        sortOrder: existing.sortOrder,
        isPublished: existing.isPublished,
      }, actor);
    }

    const publishing = dto.isPublished ?? existing?.isPublished ?? false;
    const wasPublished = existing?.isPublished ?? false;

    const block = await this.prisma.cmsContentBlock.upsert({
      where: { key_locale: { key: dto.key, locale: dto.locale } },
      update: {
        value: dto.value,
        body: dto.body === undefined ? undefined : dto.body,
        mediaAssetId: dto.mediaAssetId === undefined ? undefined : dto.mediaAssetId,
        linkUrl: dto.linkUrl === undefined ? undefined : dto.linkUrl,
        linkLabel: dto.linkLabel === undefined ? undefined : dto.linkLabel,
        sortOrder: dto.sortOrder ?? existing?.sortOrder ?? 0,
        isPublished: publishing,
        // Stamp the publication time only on the draft→published transition, so
        // the timestamp means "when this copy went live".
        publishedAt: publishing
          ? wasPublished
            ? (existing?.publishedAt ?? new Date())
            : new Date()
          : null,
        updatedByUserId: actor.userId ?? null,
      },
      create: {
        key: dto.key,
        locale: dto.locale,
        value: dto.value,
        body: dto.body ?? null,
        mediaAssetId: dto.mediaAssetId ?? null,
        linkUrl: dto.linkUrl ?? null,
        linkLabel: dto.linkLabel ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isPublished: publishing,
        publishedAt: publishing ? new Date() : null,
        updatedByUserId: actor.userId ?? null,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: existing ? 'cms.content_updated' : 'cms.content_created',
      targetType: 'CMS_CONTENT_BLOCK',
      targetId: block.id,
      summary: `${existing ? 'Updated' : 'Created'} website content ${block.key} (${block.locale})`,
      metadata: { isPublished: block.isPublished, mediaAssetId: block.mediaAssetId },
    });

    return block;
  }

  async publishBlock(key: string, locale: string, isPublished: boolean, actor: ActorContext) {
    const existing = await this.prisma.cmsContentBlock.findUnique({
      where: { key_locale: { key, locale: locale as never } },
    });
    if (!existing) throw notFound(ERROR_CODES.CONTENT_BLOCK_NOT_FOUND, 'Content block not found.');

    await this.snapshot(existing.id, {
      value: existing.value,
      body: existing.body,
      mediaAssetId: existing.mediaAssetId,
      linkUrl: existing.linkUrl,
      linkLabel: existing.linkLabel,
      sortOrder: existing.sortOrder,
      isPublished: existing.isPublished,
    }, actor);

    const block = await this.prisma.cmsContentBlock.update({
      where: { id: existing.id },
      data: {
        isPublished,
        publishedAt: isPublished ? (existing.publishedAt ?? new Date()) : null,
        updatedByUserId: actor.userId ?? null,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: isPublished ? 'cms.content_published' : 'cms.content_unpublished',
      targetType: 'CMS_CONTENT_BLOCK',
      targetId: block.id,
      summary: `${isPublished ? 'Published' : 'Unpublished'} website content ${key} (${locale})`,
    });

    return block;
  }

  async listRevisions(key: string, locale: string) {
    const block = await this.prisma.cmsContentBlock.findUnique({
      where: { key_locale: { key, locale: locale as never } },
      select: { id: true },
    });
    if (!block) throw notFound(ERROR_CODES.CONTENT_BLOCK_NOT_FOUND, 'Content block not found.');

    return this.prisma.cmsContentRevision.findMany({
      where: { blockId: block.id },
      orderBy: { revision: 'desc' },
      take: 30,
    });
  }

  /** Restores a previous revision, snapshotting the current state first. */
  async restoreRevision(key: string, locale: string, revision: number, actor: ActorContext) {
    const block = await this.prisma.cmsContentBlock.findUnique({
      where: { key_locale: { key, locale: locale as never } },
    });
    if (!block) throw notFound(ERROR_CODES.CONTENT_BLOCK_NOT_FOUND, 'Content block not found.');

    const target = await this.prisma.cmsContentRevision.findUnique({
      where: { blockId_revision: { blockId: block.id, revision } },
    });
    if (!target) throw notFound(ERROR_CODES.CONTENT_REVISION_NOT_FOUND, 'That revision does not exist.');

    await this.snapshot(block.id, {
      value: block.value,
      body: block.body,
      mediaAssetId: block.mediaAssetId,
      linkUrl: block.linkUrl,
      linkLabel: block.linkLabel,
      sortOrder: block.sortOrder,
      isPublished: block.isPublished,
    }, actor);

    const s = target.snapshot as Record<string, unknown>;
    const restored = await this.prisma.cmsContentBlock.update({
      where: { id: block.id },
      data: {
        value: s.value as string,
        body: (s.body as string | null) ?? null,
        mediaAssetId: (s.mediaAssetId as string | null) ?? null,
        linkUrl: (s.linkUrl as string | null) ?? null,
        linkLabel: (s.linkLabel as string | null) ?? null,
        sortOrder: (s.sortOrder as number) ?? 0,
        updatedByUserId: actor.userId ?? null,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.content_reverted',
      targetType: 'CMS_CONTENT_BLOCK',
      targetId: block.id,
      summary: `Reverted website content ${key} (${locale}) to revision ${revision}`,
    });

    return restored;
  }

  async deleteBlock(key: string, locale: string, actor: ActorContext) {
    const block = await this.prisma.cmsContentBlock.findUnique({
      where: { key_locale: { key, locale: locale as never } },
    });
    if (!block) throw notFound(ERROR_CODES.CONTENT_BLOCK_NOT_FOUND, 'Content block not found.');
    await this.prisma.cmsContentBlock.delete({ where: { id: block.id } });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.content_deleted',
      targetType: 'CMS_CONTENT_BLOCK',
      targetId: block.id,
      summary: `Deleted website content ${key} (${locale})`,
    });
    return { ok: true };
  }

  /**
   * Public payload for the website. Only published blocks are returned, and
   * media is reduced to a serialisable descriptor so the client never sees a
   * storage path it could manipulate.
   */
  async publicContent(locale: string) {
    const [blocks, banners, categories] = await Promise.all([
      this.prisma.cmsContentBlock.findMany({
        where: { locale: locale as never, isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        include: {
          mediaAsset: {
            select: {
              id: true,
              width: true,
              height: true,
              altAr: true,
              altEn: true,
              dominantColor: true,
              blurDataUrl: true,
              variants: true,
              focalX: true,
              focalY: true,
            },
          },
        },
      }),
      this.prisma.cmsBanner.findMany({
        where: { locale: locale as never, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          mediaAsset: {
            select: {
              id: true,
              width: true,
              height: true,
              altAr: true,
              altEn: true,
              dominantColor: true,
              blurDataUrl: true,
              variants: true,
            },
          },
        },
      }),
      this.prisma.serviceCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          imageAsset: {
            select: {
              id: true,
              width: true,
              height: true,
              altAr: true,
              altEn: true,
              dominantColor: true,
              blurDataUrl: true,
              variants: true,
            },
          },
        },
      }),
    ]);

    return {
      locale,
      blocks: blocks.map((b) => ({
        key: b.key,
        value: b.value,
        body: b.body,
        linkUrl: b.linkUrl,
        linkLabel: b.linkLabel,
        sortOrder: b.sortOrder,
        media: b.mediaAsset ? this.describeMedia(b.mediaAsset) : null,
      })),
      banners: banners.map((b) => ({
        placement: b.placement,
        title: b.title,
        subtitle: b.subtitle,
        actionUrl: b.actionUrl,
        sortOrder: b.sortOrder,
        imageUrl: b.imageUrl,
        media: b.mediaAsset ? this.describeMedia(b.mediaAsset) : null,
      })),
      categories: categories.map((c) => ({
        key: c.key,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        domain: c.domain,
        descriptionEn: c.descriptionEn,
        descriptionAr: c.descriptionAr,
        media: c.imageAsset ? this.describeMedia(c.imageAsset) : null,
      })),
    };
  }

  private describeMedia(asset: {
    id: string;
    width: number;
    height: number;
    altAr: string | null;
    altEn: string | null;
    dominantColor: string | null;
    blurDataUrl: string | null;
    variants: unknown;
  }) {
    return {
      id: asset.id,
      width: asset.width,
      height: asset.height,
      altAr: asset.altAr,
      altEn: asset.altEn,
      dominantColor: asset.dominantColor,
      blurDataUrl: asset.blurDataUrl,
      variants: asset.variants,
      // The URL is derived, not stored: the client asks the API for bytes by id.
      url: `/api/v1/cms/media/${asset.id}/file`,
    };
  }

  private async snapshot(blockId: string, snapshot: Record<string, unknown>, actor: ActorContext) {
    const last = await this.prisma.cmsContentRevision.findFirst({
      where: { blockId },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });
    await this.prisma.cmsContentRevision.create({
      data: {
        blockId,
        revision: (last?.revision ?? 0) + 1,
        snapshot: snapshot as never,
        actorUserId: actor.userId ?? null,
      },
    });
  }

  // ------------------------------------------------- service categories

  /** Every service category, active or not, for the admin CMS. */
  async listCategories() {
    return this.prisma.serviceCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: { imageAsset: { select: { id: true, altEn: true, altAr: true, width: true, height: true } } },
    });
  }

  /**
   * Updates a category's marketing presentation. The category itself is seeded
   * (its key is referenced by provider services), so this edits presentation
   * only — never the identity a booking depends on.
   */
  async updateCategory(id: string, dto: UpdateServiceCategoryDto, actor: ActorContext) {
    const existing = await this.prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.SERVICE_CATEGORY_NOT_FOUND, 'Service category not found.');

    if (dto.imageAssetId) {
      const asset = await this.prisma.cmsMediaAsset.findUnique({ where: { id: dto.imageAssetId } });
      if (!asset) throw notFound(ERROR_CODES.MEDIA_ASSET_NOT_FOUND, 'Media asset not found.');
    }

    const category = await this.prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.imageAssetId !== undefined ? { imageAssetId: dto.imageAssetId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { imageAsset: { select: { id: true, altEn: true, altAr: true, width: true, height: true } } },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.category_updated',
      targetType: 'SERVICE_CATEGORY',
      targetId: category.id,
      summary: `Updated service category ${category.key}`,
      metadata: { imageAssetId: category.imageAssetId, isActive: category.isActive },
    });

    return category;
  }

  // ------------------------------------------------------------- banners

  async listBanners(placement?: string) {
    return this.prisma.cmsBanner.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }],
      include: { mediaAsset: { select: { id: true, altEn: true, altAr: true, width: true, height: true } } },
    });
  }

  async createBanner(dto: UpsertBannerFullDto, actor: ActorContext) {
    await this.assertBannerAsset(dto.mediaAssetId);
    const banner = await this.prisma.cmsBanner.create({
      data: {
        placement: dto.placement,
        locale: dto.locale,
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        imageUrl: dto.imageUrl ?? null,
        mediaAssetId: dto.mediaAssetId ?? null,
        actionUrl: dto.actionUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.banner_created',
      targetType: 'CMS_BANNER',
      targetId: banner.id,
      summary: `Created banner ${banner.placement} (${banner.locale})`,
      metadata: { mediaAssetId: banner.mediaAssetId },
    });

    return banner;
  }

  async updateBanner(id: string, dto: UpsertBannerFullDto, actor: ActorContext) {
    const existing = await this.prisma.cmsBanner.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.CONTENT_BLOCK_NOT_FOUND, 'Banner not found.');
    await this.assertBannerAsset(dto.mediaAssetId);

    const banner = await this.prisma.cmsBanner.update({
      where: { id },
      data: {
        placement: dto.placement,
        locale: dto.locale,
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        imageUrl: dto.imageUrl ?? null,
        mediaAssetId: dto.mediaAssetId ?? null,
        actionUrl: dto.actionUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.banner_updated',
      targetType: 'CMS_BANNER',
      targetId: banner.id,
      summary: `Updated banner ${banner.placement} (${banner.locale})`,
      metadata: { mediaAssetId: banner.mediaAssetId },
    });

    return banner;
  }

  async deleteBanner(id: string, actor: ActorContext) {
    const existing = await this.prisma.cmsBanner.findUnique({ where: { id } });
    if (!existing) throw notFound(ERROR_CODES.CONTENT_BLOCK_NOT_FOUND, 'Banner not found.');
    await this.prisma.cmsBanner.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'cms.banner_deleted',
      targetType: 'CMS_BANNER',
      targetId: id,
      summary: `Deleted banner ${existing.placement} (${existing.locale})`,
    });
    return { ok: true };
  }

  private async assertBannerAsset(mediaAssetId?: string | null) {
    if (!mediaAssetId) return;
    const asset = await this.prisma.cmsMediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw notFound(ERROR_CODES.MEDIA_ASSET_NOT_FOUND, 'Media asset not found.');
  }
}
