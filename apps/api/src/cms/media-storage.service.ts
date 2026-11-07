import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { badRequest, ERROR_CODES } from '../common/errors';

/**
 * Disk-backed media storage.
 *
 * Two rules drive the design:
 *
 * 1. **The client never chooses a path.** The storage key is derived from a
 *    random UUID and the content hash, so a crafted filename cannot escape the
 *    media root, overwrite an unrelated file, or be predicted.
 * 2. **Every byte is re-encoded.** An upload is decoded by sharp and written
 *    back out as a fresh image. That discards EXIF (including GPS), strips any
 *    trailing payload appended to the file, and guarantees the stored bytes
 *    really are the format the row claims.
 *
 * SVG is deliberately refused: an SVG is a document that can carry script and
 * external references, and serving one from the site's own origin would turn an
 * image upload into stored XSS.
 */

export const ALLOWED_INPUT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type AllowedInputMime = (typeof ALLOWED_INPUT_MIME)[number];

/** Variants generated for every upload, so pages never ship a full-size image. */
export const MEDIA_VARIANTS = {
  thumb: { width: 320, height: 240 },
  card: { width: 800, height: 600 },
  wide: { width: 1600, height: 900 },
  hero: { width: 2400, height: 1350 },
} as const;

export type VariantName = keyof typeof MEDIA_VARIANTS;

export interface StoredVariant {
  key: string;
  width: number;
  height: number;
  byteSize: number;
}

export interface StoredMedia {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  dominantColor: string | null;
  blurDataUrl: string | null;
  variants: Record<string, StoredVariant>;
}

/** Magic-byte signatures. A declared content-type is never trusted on its own. */
const SIGNATURES: Array<{ mime: AllowedInputMime; test: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) =>
      b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  {
    mime: 'image/webp',
    test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    mime: 'image/avif',
    // ISO-BMFF: `....ftyp` with an `avif`/`avis` brand.
    test: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(b.toString('ascii', 8, 12)),
  },
];

export function sniffMime(buffer: Buffer): AllowedInputMime | null {
  return SIGNATURES.find((s) => s.test(buffer))?.mime ?? null;
}

@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name);
  private root!: string;

  /** Absolute path to the configured media root. */
  get mediaRoot(): string {
    return this.root;
  }

  async onModuleInit(): Promise<void> {
    this.root = resolve(process.env.MEDIA_ROOT ?? join(process.cwd(), '.media'));
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Media root: ${this.root}`);
  }

  get maxUploadBytes(): number {
    return Number(process.env.MEDIA_MAX_UPLOAD_BYTES ?? 12 * 1024 * 1024);
  }

  /**
   * Resolves a storage key to an absolute path, refusing anything that escapes
   * the media root. The key is validated as well as normalised, so a traversal
   * attempt is rejected rather than silently rewritten.
   */
  resolvePath(storageKey: string): string {
    if (!/^[A-Za-z0-9/_\-.]+$/.test(storageKey) || storageKey.includes('..')) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid media path.');
    }
    const full = resolve(this.root, storageKey);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid media path.');
    }
    return full;
  }

  /**
   * Validates, re-encodes and stores an uploaded image plus its variants.
   * Throws before writing anything if the input is not a supported image.
   */
  async store(buffer: Buffer): Promise<StoredMedia> {
    if (buffer.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The uploaded file is empty.');
    }
    if (buffer.length > this.maxUploadBytes) {
      throw badRequest(
        ERROR_CODES.MEDIA_TOO_LARGE,
        `Images must be ${Math.floor(this.maxUploadBytes / (1024 * 1024))} MB or smaller.`,
      );
    }

    const sniffed = sniffMime(buffer);
    if (!sniffed) {
      throw badRequest(
        ERROR_CODES.MEDIA_TYPE_NOT_ALLOWED,
        'Only JPEG, PNG, WebP and AVIF images are accepted.',
      );
    }

    // `failOn: 'error'` rejects a truncated or malformed image instead of
    // producing a half-decoded one.
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata();
    } catch {
      throw badRequest(ERROR_CODES.MEDIA_TYPE_NOT_ALLOWED, 'The image could not be decoded.');
    }
    if (!metadata.width || !metadata.height) {
      throw badRequest(ERROR_CODES.MEDIA_DIMENSIONS_INVALID, 'The image has no readable dimensions.');
    }
    if (metadata.width < 64 || metadata.height < 64) {
      throw badRequest(ERROR_CODES.MEDIA_DIMENSIONS_INVALID, 'Images must be at least 64×64 pixels.');
    }

    // `metadata()` only reads the header, so a file truncated after its header
    // still passes the checks above and then fails partway through encoding.
    // Decoding once up front turns that into a clean rejection before any file
    // is written.
    try {
      await sharp(buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: 64, height: 64, fit: 'inside' })
        .webp()
        .toBuffer();
    } catch {
      throw badRequest(
        ERROR_CODES.MEDIA_TYPE_NOT_ALLOWED,
        'The image is incomplete or corrupt and could not be decoded.',
      );
    }

    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const base = `${folder}/${randomUUID().slice(0, 8)}-${digest}`;

    const variants: Record<string, StoredVariant> = {};
    let originalSize = 0;
    let originalW = 0;
    let originalH = 0;

    try {
      for (const [name, spec] of Object.entries(MEDIA_VARIANTS) as Array<[VariantName, { width: number; height: number }]>) {
        // `withoutEnlargement` keeps a small source from being upscaled into a
        // soft, over-large file.
        const out = await sharp(buffer, { failOn: 'error' })
          .rotate() // honour EXIF orientation before EXIF is discarded
          .resize({ width: spec.width, height: spec.height, fit: 'cover', position: 'attention', withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toBuffer({ resolveWithObject: true });

        const key = `${base}-${name}.webp`;
        const full = this.resolvePath(key);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, out.data);
        variants[name] = { key, width: out.info.width, height: out.info.height, byteSize: out.data.length };

        if (name === 'hero') {
          originalSize = out.data.length;
          originalW = out.info.width;
          originalH = out.info.height;
        }
      }
    } catch (error) {
      // Do not leave orphaned files behind when a later variant fails.
      await this.remove('', variants);
      this.logger.warn(`Image encoding failed: ${(error as Error).message}`);
      throw badRequest(
        ERROR_CODES.MEDIA_TYPE_NOT_ALLOWED,
        'The image could not be processed into the required sizes.',
      );
    }

    // A 24px blurred placeholder, inlined as a data URL so a page can paint
    // something meaningful before the real image arrives.
    const blur = await sharp(buffer).rotate().resize({ width: 24 }).webp({ quality: 40 }).toBuffer();
    const blurDataUrl = `data:image/webp;base64,${blur.toString('base64')}`;

    let dominantColor: string | null = null;
    try {
      const { dominant } = await sharp(buffer).rotate().stats();
      if (dominant) {
        dominantColor = `#${[dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      }
    } catch {
      dominantColor = null;
    }

    return {
      storageKey: variants.hero.key,
      mimeType: 'image/webp',
      byteSize: originalSize,
      width: originalW,
      height: originalH,
      dominantColor,
      blurDataUrl,
      variants,
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    const full = this.resolvePath(storageKey);
    try {
      return await readFile(full);
    } catch {
      throw badRequest(ERROR_CODES.MEDIA_NOT_FOUND, 'The media file is missing from storage.');
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  /** Removes every variant belonging to an asset. Idempotent. */
  async remove(storageKey: string, variants: Record<string, StoredVariant> = {}): Promise<void> {
    const keys = new Set<string>([storageKey, ...Object.values(variants).map((v) => v.key)]);
    for (const key of keys) {
      if (!key) continue;
      try {
        await rm(this.resolvePath(key), { force: true });
      } catch (error) {
        // A missing file is not an error: the row is being deleted either way.
        this.logger.warn(`Could not remove ${key}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Produces a crop that keeps the chosen focal point in frame. The crop box is
   * computed from the focal percentages against the target aspect ratio, then
   * the result is resized to the variant's exact dimensions.
   */
  async cropAtFocalPoint(
    storageKey: string,
    focalX: number,
    focalY: number,
    name: VariantName,
  ): Promise<StoredVariant> {
    const source = await this.read(storageKey);
    const spec = MEDIA_VARIANTS[name];
    const meta = await sharp(source).metadata();
    const srcW = meta.width ?? spec.width;
    const srcH = meta.height ?? spec.height;

    const targetRatio = spec.width / spec.height;

    // Largest box with the target aspect ratio that fits inside the source.
    let boxW = srcW;
    let boxH = Math.round(srcW / targetRatio);
    if (boxH > srcH) {
      boxH = srcH;
      boxW = Math.round(srcH * targetRatio);
    }

    const px = Math.min(Math.max(focalX, 0), 100) / 100;
    const py = Math.min(Math.max(focalY, 0), 100) / 100;
    const left = Math.round(Math.min(Math.max(px * srcW - boxW / 2, 0), srcW - boxW));
    const top = Math.round(Math.min(Math.max(py * srcH - boxH / 2, 0), srcH - boxH));

    const out = await sharp(source, { failOn: 'error' })
      .extract({ left, top, width: boxW, height: boxH })
      .resize({ width: spec.width, height: spec.height, fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const key = storageKey.replace(/-hero\.webp$/, `-focal${Math.round(focalX)}x${Math.round(focalY)}-${name}.webp`);
    await writeFile(this.resolvePath(key), out.data);
    return { key, width: out.info.width, height: out.info.height, byteSize: out.data.length };
  }
}
