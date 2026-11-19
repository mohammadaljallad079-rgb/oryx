import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { ATTACHMENT_MAX_BYTES, extensionOf } from '@oryx/shared';
import { badRequest, ERROR_CODES } from '../common/errors';

/**
 * Attachment storage.
 *
 * Binaries are written outside the database to a configurable root and only a
 * relative reference is persisted. The reference is validated on every read, so
 * a tampered row can never be used to escape the upload root and read an
 * arbitrary file from the host.
 *
 * The local driver is the only one implemented. A cloud driver can be added
 * behind the same three methods without changing the attachments service.
 */
@Injectable()
export class AttachmentStorage {
  private readonly logger = new Logger(AttachmentStorage.name);

  /** Absolute root that every stored path must stay inside. */
  private get root(): string {
    return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'var', 'uploads'));
  }

  /** Persist `buffer` and return the reference and checksum to store on the row. */
  async write(
    companyId: string,
    fileName: string,
    buffer: Buffer,
  ): Promise<{ storageRef: string; checksum: string; sizeBytes: number }> {
    if (buffer.length === 0) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The uploaded file is empty.');
    if (buffer.length > ATTACHMENT_MAX_BYTES) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The uploaded file exceeds the 20 MB limit.');
    }

    const now = new Date();
    const relativeDir = join(companyId, String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
    const extension = extensionOf(fileName) || 'bin';
    const storageRef = join(relativeDir, `${randomUUID()}.${extension}`);
    const absolute = this.absolutePath(storageRef);

    await mkdir(join(this.root, relativeDir), { recursive: true });
    await writeFile(absolute, buffer, { mode: 0o640 });

    return {
      storageRef,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      sizeBytes: buffer.length,
    };
  }

  /** Open a stored file for streaming. Throws when the reference is unusable. */
  async read(storageRef: string): Promise<{ stream: ReadStream; sizeBytes: number }> {
    const absolute = this.absolutePath(storageRef);
    let sizeBytes: number;
    try {
      sizeBytes = (await stat(absolute)).size;
    } catch {
      throw badRequest(ERROR_CODES.RESOURCE_NOT_FOUND, 'The stored file is no longer available.');
    }
    return { stream: createReadStream(absolute), sizeBytes };
  }

  /** Remove a stored file. A missing file is not an error. */
  async remove(storageRef: string | null): Promise<void> {
    if (!storageRef) return;
    try {
      await unlink(this.absolutePath(storageRef));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.logger.warn(`Could not delete ${storageRef}: ${String(error)}`);
    }
  }

  /**
   * Resolve a stored reference to an absolute path, refusing anything that
   * would land outside the upload root.
   */
  private absolutePath(storageRef: string): string {
    const absolute = resolve(this.root, storageRef);
    const prefix = this.root.endsWith(sep) ? this.root : `${this.root}${sep}`;
    if (absolute !== this.root && !absolute.startsWith(prefix)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid storage reference.');
    }
    if (extname(absolute) === '') {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid storage reference.');
    }
    return absolute;
  }
}
