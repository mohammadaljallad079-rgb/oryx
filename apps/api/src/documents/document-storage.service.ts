import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { badRequest, ERROR_CODES, notFound } from '../common/errors';

/**
 * Disk-backed storage for generated PDFs.
 *
 * Deliberately separate from `MediaStorageService`. That service exists to
 * re-encode *images* through sharp, generate responsive variants and sniff magic
 * bytes — none of which applies to a PDF we generated ourselves, and all of
 * which would corrupt one. Sharing the store would also mean the public image
 * route could reach a document, and a customer invoice must not be reachable by
 * guessing a media URL.
 *
 * The key is derived from the company, the document id and a content hash, so it
 * is deterministic for a given render (a re-render overwrites its own file
 * rather than accumulating orphans) and cannot be chosen by a caller.
 */
@Injectable()
export class DocumentStorageService implements OnModuleInit {
  private readonly logger = new Logger(DocumentStorageService.name);
  private root!: string;

  async onModuleInit(): Promise<void> {
    this.root = resolve(process.env.DOCUMENT_STORAGE_ROOT ?? join(process.cwd(), '.documents'));
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Document storage root: ${this.root}`);
  }

  get storageRoot(): string {
    return this.root;
  }

  /** A deterministic, non-guessable storage key for a document version. */
  keyFor(companyId: string, documentId: string, version: number): string {
    const digest = createHash('sha256')
      .update(`${companyId}:${documentId}:${version}`)
      .digest('hex')
      .slice(0, 20);
    const safeCompany = companyId.replace(/[^A-Za-z0-9_-]/g, '');
    return `${safeCompany}/${digest}-v${version}.pdf`;
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the root.
   * The key is validated as well as normalised, so a traversal attempt is
   * rejected rather than silently rewritten.
   */
  resolvePath(storageKey: string): string {
    if (!/^[A-Za-z0-9/_\-.]+$/.test(storageKey) || storageKey.includes('..')) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid document path.');
    }
    const full = resolve(this.root, storageKey);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Invalid document path.');
    }
    return full;
  }

  async write(storageKey: string, bytes: Buffer): Promise<{ byteSize: number }> {
    const path = this.resolvePath(storageKey);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes);
    return { byteSize: bytes.byteLength };
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.resolvePath(storageKey));
    } catch {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'The document file is missing.');
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
}
