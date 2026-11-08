import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { badRequest, ERROR_CODES } from '../common/errors';
import { parseRegistrationCard, type RegistrationCardParse } from './vehicle-card-parser';

/** Languages the card reader understands: Arabic + English side by side. */
const OCR_LANGUAGES = 'ara+eng';

/** Uploads larger than this are almost certainly not a registration card. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface OcrWorker {
  recognize(image: Buffer): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

/**
 * Reads a vehicle registration card from a photo.
 *
 * The OCR engine is a single lazily-created worker that is reused across
 * requests and serialised through {@link queue}, because a tesseract worker
 * cannot run two recognitions at once. Everything the engine produces is handed
 * to the pure {@link parseRegistrationCard} parser, so the parsing rules can be
 * tested without the engine.
 */
@Injectable()
export class VehicleCardOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(VehicleCardOcrService.name);
  private readonly cachePath: string;
  private workerPromise: Promise<OcrWorker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    // The trained language data is cached under the runtime storage dir so it is
    // downloaded once and reused; it is never committed.
    this.cachePath = resolve(process.env.OCR_CACHE_DIR ?? join(process.cwd(), 'storage', 'ocr'));
    try {
      mkdirSync(this.cachePath, { recursive: true });
    } catch {
      // A read-only filesystem is not fatal: the engine falls back to its own
      // default cache location.
    }
  }

  async onModuleDestroy(): Promise<void> {
    const worker = this.workerPromise ? await this.workerPromise.catch(() => null) : null;
    await worker?.terminate().catch(() => undefined);
    this.workerPromise = null;
  }

  /** Read a card image and return the parsed fields plus the raw text. */
  async readCard(image: { mimetype: string; size: number; buffer: Buffer }): Promise<RegistrationCardParse> {
    if (!image?.buffer?.length) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No image was uploaded.');
    }
    if (image.size > MAX_IMAGE_BYTES) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The image is too large (maximum 12 MB).');
    }
    if (image.mimetype && !ALLOWED_MIME.has(image.mimetype)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Upload a JPG, PNG or WebP photo of the registration card.');
    }

    const text = await this.recognize(image.buffer);
    if (!text.trim()) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No text could be read from the image. Try a sharper, well-lit photo.');
    }
    return parseRegistrationCard(text);
  }

  /** Run one recognition, serialised behind any in-flight recognition. */
  private recognize(buffer: Buffer): Promise<string> {
    const run = this.queue.then(async () => {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(buffer);
      return data.text ?? '';
    });
    // Keep the chain alive even when a recognition rejects, so one bad image
    // does not poison every later request.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private getWorker(): Promise<OcrWorker> {
    if (!this.workerPromise) {
      this.workerPromise = this.createWorker();
    }
    return this.workerPromise;
  }

  private async createWorker(): Promise<OcrWorker> {
    try {
      const mod = await import('tesseract.js');
      const createWorker = (mod as unknown as { createWorker: (langs: string, oem?: number, options?: Record<string, unknown>) => Promise<OcrWorker> }).createWorker
        ?? (mod as unknown as { default: { createWorker: (langs: string, oem?: number, options?: Record<string, unknown>) => Promise<OcrWorker> } }).default?.createWorker;
      if (!createWorker) throw new Error('tesseract.js did not expose createWorker');
      return await createWorker(OCR_LANGUAGES, undefined, {
        cachePath: this.cachePath,
        cacheMethod: 'write',
      });
    } catch (error) {
      // Reset so a later request can retry after a transient failure.
      this.workerPromise = null;
      this.logger.error(`OCR engine failed to start: ${error instanceof Error ? error.message : String(error)}`);
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The OCR engine is unavailable. Enter the vehicle details manually.');
    }
  }
}
