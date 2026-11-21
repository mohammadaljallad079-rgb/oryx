import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService } from '../common/erp-context.service';
import { MediaStorageService } from '../cms/media-storage.service';
import { ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';

/**
 * Product photography.
 *
 * ## Tenant and product scope
 *
 * Every method resolves the product through the principal's own company
 * (`ErpContextService.resolveCompanyScope`), so a company administrator can only
 * touch its own catalogue. A product id from another tenant is a 404, not a
 * silent cross-tenant write.
 *
 * ## Where the bytes live
 *
 * The file goes through `MediaStorageService.store`, which sniffs the real
 * magic-byte type, rejects anything that is not JPEG/PNG/WebP/AVIF, enforces the
 * configured size ceiling, re-encodes every byte (dropping EXIF and any trailing
 * payload) and derives the storage key from a UUID plus the content hash. The
 * client never chooses a path. The resulting `CmsMediaAsset` is referenced by the
 * `ProductImage` row, so the catalogue and the website share one media library
 * rather than a second image store.
 */
@Injectable()
export class ProductImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly context: ErpContextService,
    private readonly audit: AuditService,
  ) {}

  /** The product, asserted to belong to the principal's company. */
  private async assertProduct(productId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId } });
    if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found.');
    return { product, companyId };
  }

  /** The public URL the app renders for a stored asset. */
  private assetUrl(assetId: string | null, variant = 'card'): string | null {
    if (!assetId) return null;
    return `/api/v1/cms/media/${assetId}/file?variant=${encodeURIComponent(variant)}`;
  }

  /** A product's images, primary first, with a resolved URL for each. */
  async list(productId: string, principal: RequestPrincipal) {
    await this.assertProduct(productId, principal);
    const rows = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { mediaAsset: { select: { id: true } } },
    });
    return rows.map((row) => this.toDto(row));
  }

  private toDto(row: {
    id: string;
    productId: string;
    url: string | null;
    altEn: string | null;
    altAr: string | null;
    sortOrder: number;
    isPrimary: boolean;
    mediaAssetId: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      productId: row.productId,
      // The media asset is the preferred reference; `url` covers an external
      // absolute URL that predates the library.
      url: this.assetUrl(row.mediaAssetId) ?? row.url,
      altEn: row.altEn,
      altAr: row.altAr,
      sortOrder: row.sortOrder,
      isPrimary: row.isPrimary,
      createdAt: row.createdAt,
    };
  }

  /**
   * Upload an image and attach it to the product.
   *
   * The first image a product gets is automatically primary, so a catalogue row
   * is never left without a lead photograph. A caller may also force primary,
   * which demotes the current one in the same transaction.
   */
  async upload(
    productId: string,
    file: { buffer: Buffer; originalname: string },
    options: { altEn?: string; altAr?: string; isPrimary?: boolean },
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.assertProduct(productId, principal);

    // Re-encode and store before touching the database, so a rejected image
    // never leaves a half-written row behind.
    const stored = await this.storage.store(file.buffer);

    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.cmsMediaAsset.create({
        data: {
          originalName: file.originalname.slice(0, 255),
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          width: stored.width,
          height: stored.height,
          dominantColor: stored.dominantColor,
          blurDataUrl: stored.blurDataUrl,
          variants: stored.variants as never,
          altEn: options.altEn ?? null,
          altAr: options.altAr ?? null,
          createdByUserId: actor.userId ?? null,
        },
      });

      const existing = await tx.productImage.count({ where: { productId } });
      const makePrimary = options.isPrimary === true || existing === 0;
      if (makePrimary) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }

      const image = await tx.productImage.create({
        data: {
          productId,
          mediaAssetId: asset.id,
          altEn: options.altEn ?? null,
          altAr: options.altAr ?? null,
          sortOrder: existing,
          isPrimary: makePrimary,
        },
        include: { mediaAsset: { select: { id: true } } },
      });

      await this.audit.record({
        actorUserId: actor.userId,
        companyId,
        action: 'inventory.product_image_uploaded',
        targetType: 'PRODUCT',
        targetId: productId,
        summary: `Uploaded image ${asset.originalName} for product ${productId}`,
        metadata: { imageId: image.id, byteSize: asset.byteSize },
      });

      return this.toDto(image);
    });
  }

  /** Update an image's metadata, or promote it to primary. */
  async update(
    productId: string,
    imageId: string,
    dto: { altEn?: string; altAr?: string; sortOrder?: number; isPrimary?: boolean },
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.assertProduct(productId, principal);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Image not found.');

    return this.prisma.$transaction(async (tx) => {
      // Promoting one image demotes the others, so "primary" stays a single row.
      if (dto.isPrimary === true) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }
      const updated = await tx.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.altEn !== undefined ? { altEn: dto.altEn } : {}),
          ...(dto.altAr !== undefined ? { altAr: dto.altAr } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        },
        include: { mediaAsset: { select: { id: true } } },
      });

      await this.audit.record({
        actorUserId: actor.userId,
        companyId,
        action: 'inventory.product_image_updated',
        targetType: 'PRODUCT',
        targetId: productId,
        summary: `Updated image ${imageId} for product ${productId}`,
      });

      return this.toDto(updated);
    });
  }

  /**
   * Remove an image from the product.
   *
   * The `ProductImage` row is deleted; the underlying `CmsMediaAsset` is left in
   * the library, because the same asset may be referenced elsewhere (a banner, a
   * service category) and deleting it here could blank out the website. If the
   * removed image was primary, the next remaining image is promoted so the
   * product keeps a lead photograph.
   */
  async remove(productId: string, imageId: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.assertProduct(productId, principal);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Image not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });
      if (image.isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.audit.record({
        actorUserId: actor.userId,
        companyId,
        action: 'inventory.product_image_removed',
        targetType: 'PRODUCT',
        targetId: productId,
        summary: `Removed image ${imageId} from product ${productId}`,
      });
    });

    return { removed: true };
  }

  /** The primary image for a product, or null. Used by the customer catalogue. */
  async primaryImageUrl(productId: string): Promise<string | null> {
    const image = await this.prisma.productImage.findFirst({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      select: { mediaAssetId: true, url: true },
    });
    if (!image) return null;
    return this.assetUrl(image.mediaAssetId) ?? image.url;
  }

  /**
   * Reject a request that carried no file.
   *
   * Kept here rather than in the controller so the error code and message are
   * defined once.
   */
  static assertFile(file: { buffer: Buffer } | undefined): asserts file is { buffer: Buffer } {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'media.file_required', message: 'No file was uploaded.' });
    }
  }
}
