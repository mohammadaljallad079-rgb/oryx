import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import type { Readable } from 'node:stream';
import { join, resolve, sep } from 'node:path';
import { ALLOWED_DOCUMENT_EXTENSIONS } from '@oryx/shared';
import { badRequest, ERROR_CODES, notFound } from '../common/errors';

/** Where a stored document lives, and what it is. */
export interface StoredDocument {
  storageRef: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  sha256: string;
}

export interface IncomingDocument {
  originalName: string;
  mimeType: string | null;
  buffer: Buffer;
}

/**
 * Local document storage.
 *
 * Document binaries are written to a directory outside the web root and are
 * never served statically: a download goes through an authenticated controller
 * route that resolves the owning company first. The `storageRef` is an opaque
 * relative path (`<companyId>/<uuid><ext>`), so a caller cannot name an
 * arbitrary file, and every read is re-joined under the storage root and
 * re-checked to stay inside it.
 */
@Injectable()
export class DocumentStorageService {
  private readonly root: string;

  constructor() {
    this.root = resolve(process.env.DOCUMENT_STORAGE_DIR ?? join(process.cwd(), '.oryx-tmp', 'documents'));
  }

  get storageRoot(): string {
    return this.root;
  }

  private assertAllowedExtension(fileName: string): void {
    const lower = fileName.toLowerCase();
    if (!ALLOWED_DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `Unsupported file extension. Allowed: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}.`,
      );
    }
  }

  /** Persist a buffer and return the metadata to record on the attachment row. */
  async store(companyId: string, file: IncomingDocument): Promise<StoredDocument> {
    this.assertAllowedExtension(file.originalName);
    const ext = file.originalName.slice(file.originalName.lastIndexOf('.')).toLowerCase();
    const relative = join(companyId, `${randomUUID()}${ext}`);
    const absolute = this.absolute(relative);
    await fs.mkdir(join(this.root, companyId), { recursive: true });
    await fs.writeFile(absolute, file.buffer);
    return {
      storageRef: relative.split(sep).join('/'),
      fileName: file.originalName.slice(0, 300),
      mimeType: file.mimeType,
      sizeBytes: file.buffer.byteLength,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  /** Remove a stored binary; a missing file is not an error. */
  async remove(storageRef: string | null): Promise<void> {
    if (!storageRef) return;
    try {
      await fs.unlink(this.absolute(storageRef));
    } catch {
      /* already gone */
    }
  }

  async readStream(storageRef: string): Promise<Readable> {
    const absolute = this.absolute(storageRef);
    try {
      await fs.access(absolute);
    } catch {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'The stored file is no longer available.');
    }
    return createReadStream(absolute);
  }

  /** Resolve a stored reference to an absolute path, refusing anything outside the root. */
  private absolute(storageRef: string): string {
    const absolute = resolve(this.root, storageRef);
    if (absolute !== this.root && !absolute.startsWith(`${this.root}${sep}`)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid document reference.');
    }
    return absolute;
  }
}
