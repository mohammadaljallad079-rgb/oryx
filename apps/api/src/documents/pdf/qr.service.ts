import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';

/**
 * QR codes and the public verification URL that a scan resolves to.
 *
 * The token is 32 random bytes, not a document id. A sequential or guessable
 * credential would let anyone enumerate other tenants' documents by editing the
 * URL, and the verification page is public by design. The token is the only
 * thing that grants a lookup, and it is stored uniquely.
 */
@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  /** A fresh, unguessable verification token. */
  newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * The absolute verification URL for a token.
   *
   * The base must be configured for the deployment: a QR code embeds a URL that
   * a phone will open with no context, so a relative path or a localhost default
   * in production would produce a code that scans to nothing. The fallback is
   * the local customer site, which is correct in development. In production the
   * fallback is refused outright — a QR that encodes `localhost` reaches a
   * printed document and cannot be recalled, so a missing base must fail the
   * issuance rather than emit a dead code.
   */
  verificationUrl(token: string): string {
    const configured = process.env.DOCUMENT_VERIFY_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    if (!configured && process.env.NODE_ENV === 'production') {
      this.logger.error(
        'DOCUMENT_VERIFY_BASE_URL is not set: refusing to issue a document whose QR code would resolve to a developer machine.',
      );
      throw new Error(
        'DOCUMENT_VERIFY_BASE_URL must be set in production; a QR code cannot embed a localhost URL.',
      );
    }
    const base = configured ?? 'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}/verify/${token}`;
  }

  /**
   * A QR code as a PNG data URI, ready to drop into an `<img src>`.
   *
   * Error-correction level `M` survives a partial smudge or a fold; the code is
   * small enough on the page that a higher level would make the modules too
   * dense to scan reliably from a phone at arm's length.
   */
  async dataUri(url: string): Promise<string> {
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      width: 320,
      color: { dark: '#0F2B48ff', light: '#ffffffff' },
    });
  }
}
