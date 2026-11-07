import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { MediaStorageService } from '../cms/media-storage.service';
import { ERROR_CODES, notFound } from '../common/errors';

/**
 * SENSAGE inspection photographs uploaded by a consumer.
 *
 * ## Ownership
 *
 * The `accountId` comes from the verified customer token and scopes every read
 * and write. A vehicle id in the body is a *claim*: it is checked against the
 * account's own garage before the photo is linked, so a customer cannot attach a
 * photograph to another account's car.
 *
 * ## Storage
 *
 * Bytes go through the shared `MediaStorageService`, which sniffs the true
 * magic-byte type (a declared content-type is never trusted), rejects anything
 * that is not JPEG/PNG/WebP/AVIF, enforces the configured ceiling, re-encodes the
 * image to strip EXIF/GPS and derives the storage key from a UUID and a content
 * hash. A client never chooses a path.
 *
 * ## What is not stored
 *
 * There is no analysis result on the row. The app's SENSAGE report is a demo, and
 * writing a demo score into a table named as if it were a diagnosis would make a
 * placeholder look like a product finding. Only the photograph and its metadata
 * are persisted.
 */
@Injectable()
export class CustomerInspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly audit: AuditService,
  ) {}

  private assetUrl(assetId: string | null, variant = 'card'): string | null {
    if (!assetId) return null;
    return `/api/v1/cms/media/${assetId}/file?variant=${encodeURIComponent(variant)}`;
  }

  /** A photo row shaped for the app, with a resolved URL. */
  private toDto(row: {
    id: string;
    vehicleId: string | null;
    mediaAssetId: string | null;
    originalName: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    caption: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      url: this.assetUrl(row.mediaAssetId),
      originalName: row.originalName,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      width: row.width,
      height: row.height,
      caption: row.caption,
      createdAt: row.createdAt,
    };
  }

  /** The caller's own uploaded inspection photos, newest first. */
  async list(accountId: string, vehicleId?: string) {
    const rows = await this.prisma.customerInspectionPhoto.findMany({
      where: { customerAccountId: accountId, ...(vehicleId ? { vehicleId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Upload one photograph.
   *
   * `vehicleId` is optional — a customer may photograph a car before it is in the
   * garage — but when present it must be one this account owns.
   */
  async upload(
    accountId: string,
    file: { buffer: Buffer; originalname: string },
    options: { vehicleId?: string; caption?: string },
  ) {
    if (options.vehicleId) {
      const owned = await this.prisma.vehicle.findFirst({
        where: { id: options.vehicleId, customerAccountId: accountId },
        select: { id: true },
      });
      if (!owned) {
        throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'That vehicle is not in your garage.');
      }
    }

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
          caption: options.caption ?? null,
        },
      });

      const photo = await tx.customerInspectionPhoto.create({
        data: {
          customerAccountId: accountId,
          vehicleId: options.vehicleId ?? null,
          mediaAssetId: asset.id,
          originalName: asset.originalName,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          width: asset.width,
          height: asset.height,
          caption: options.caption ?? null,
        },
      });

      await this.audit.record({
        actorUserId: null,
        action: 'customer.inspection_photo_uploaded',
        targetType: 'CUSTOMER_INSPECTION_PHOTO',
        targetId: photo.id,
        summary: `Inspection photo uploaded (${asset.byteSize} bytes)`,
        metadata: { accountId, vehicleId: options.vehicleId ?? null },
      });

      return this.toDto(photo);
    });
  }

  /** Remove one of the caller's own photographs. */
  async remove(accountId: string, photoId: string) {
    const photo = await this.prisma.customerInspectionPhoto.findFirst({
      where: { id: photoId, customerAccountId: accountId },
    });
    if (!photo) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Photo not found.');

    await this.prisma.customerInspectionPhoto.delete({ where: { id: photoId } });
    // The media asset stays in the library: it may be referenced elsewhere, and
    // deleting it here could blank an unrelated page.
    await this.audit.record({
      actorUserId: null,
      action: 'customer.inspection_photo_removed',
      targetType: 'CUSTOMER_INSPECTION_PHOTO',
      targetId: photoId,
      summary: 'Inspection photo removed',
      metadata: { accountId },
    });
    return { removed: true };
  }
}
