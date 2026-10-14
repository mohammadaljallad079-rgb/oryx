import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { generateSecret as otpGenerateSecret, generateURI, generateSync, verifySync } from 'otplib';
import * as QRCode from 'qrcode';

/**
 * TOTP secret encryption at rest.
 *
 * Secrets are sealed with AES-256-GCM using a key derived from
 * MFA_ENCRYPTION_KEY. The key must come from the environment (a secret manager
 * in production) and must never be committed. GCM is authenticated, so
 * tampering is detected on decryption.
 *
 * Format: v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>
 */
@Injectable()
export class SecretCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('MFA_ENCRYPTION_KEY');
    if (!raw || raw.length < 32) {
      throw new Error(
        'MFA_ENCRYPTION_KEY must be set to at least 32 characters. Generate one with: ' +
          'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
      );
    }
    this.key = createHash('sha256').update(raw).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(sealed: string): string {
    const [version, ivB64, tagB64, dataB64] = sealed.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Unsupported or malformed sealed value.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export interface TotpVerification {
  valid: boolean;
  /** Accepted TOTP time step; used to reject replay of the same code. */
  step?: number;
}

const STEP_SECONDS = 30;

/**
 * MFA service: TOTP enrollment, verification, recovery codes and reset.
 *
 * Security properties:
 *  - secrets sealed with AES-256-GCM and never returned after enrollment;
 *  - the pending enrollment secret is separate from the active secret and expires;
 *  - TOTP replay is rejected through a monotonic last-used step;
 *  - recovery codes are stored only as hashes and are single use.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly cipher: SecretCipher,
    private readonly config: ConfigService,
  ) {}

  private get issuer(): string {
    return this.config.get<string>('MFA_ISSUER') ?? 'ORYX Platform';
  }

  generateSecret(): string {
    return otpGenerateSecret({ length: 20 });
  }

  provisioningUri(secret: string, accountLabel: string): string {
    return generateURI({ secret, label: accountLabel, issuer: this.issuer, strategy: 'totp' });
  }

  async qrDataUrl(otpauthUri: string): Promise<string> {
    return QRCode.toDataURL(otpauthUri, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
  }

  /**
   * Verify a TOTP code with replay protection.
   *
   * `afterTimeStep` is otplib's native replay guard: a token whose time step is
   * not strictly greater than the last accepted step is rejected even when the
   * digits are otherwise correct, so a captured code cannot be replayed inside
   * its validity window. `epochTolerance` tolerates one step of clock drift,
   * matching common authenticator apps.
   */
  verify(secret: string, token: string, lastUsedStep?: bigint | null): TotpVerification {
    const clean = token.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) return { valid: false };

    let result: { valid: boolean; timeStep?: number } | undefined;
    try {
      result = verifySync({
        secret,
        token: clean,
        strategy: 'totp',
        epochTolerance: STEP_SECONDS,
        ...(lastUsedStep !== undefined && lastUsedStep !== null
          ? { afterTimeStep: Number(lastUsedStep) }
          : {}),
      }) as { valid: boolean; timeStep?: number };
    } catch {
      return { valid: false };
    }
    if (!result?.valid) return { valid: false };

    const step = typeof result.timeStep === 'number' ? result.timeStep : this.currentStep();
    // Defence in depth: enforce the same monotonic rule even if a future otplib
    // release stops honouring afterTimeStep.
    if (lastUsedStep !== undefined && lastUsedStep !== null && BigInt(step) <= lastUsedStep) {
      return { valid: false };
    }
    return { valid: true, step };
  }

  /** Generate a code for a secret; used by tests and tooling. */
  generateCode(secret: string, epochMs?: number): string {
    return generateSync(
      epochMs === undefined
        ? { secret, strategy: 'totp' }
        : { secret, strategy: 'totp', epoch: epochMs } as never,
    );
  }

  generateRecoveryCodes(count = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const raw = randomBytes(5).toString('hex').toUpperCase();
      codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
    }
    return codes;
  }

  hashRecoveryCode(code: string): string {
    return createHash('sha256')
      .update(code.replace(/[\s-]/g, '').toUpperCase())
      .digest('hex');
  }

  /** Constant-time comparison of two hex-encoded hashes. */
  hashEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  currentStep(): number {
    return Math.floor(Date.now() / 1000 / STEP_SECONDS);
  }
}
