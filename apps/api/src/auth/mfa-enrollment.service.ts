import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import { MfaService, SecretCipher } from './mfa.service';

/** Enrollment secrets are short lived and must be confirmed quickly. */
const ENROLLMENT_TTL_MINUTES = 10;
const RECOVERY_CODE_COUNT = 10;

export interface MfaStatus {
  enabled: boolean;
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
}

export interface EnrollmentStart {
  /** otpauth:// URI for the authenticator app. */
  otpauthUri: string;
  /** Inline PNG data URL of the QR code. */
  qrDataUrl: string;
  /** Base32 secret, shown once so it can be entered manually. */
  secret: string;
  expiresAt: string;
}

@Injectable()
export class MfaEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfa: MfaService,
    private readonly cipher: SecretCipher,
    private readonly audit: AuditService,
  ) {}

  async status(userId: string): Promise<MfaStatus> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found.');
    const remaining = await this.prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
    return {
      enabled: user.mfaEnabled,
      enrolledAt: user.mfaEnrolledAt?.toISOString() ?? null,
      recoveryCodesRemaining: remaining,
    };
  }

  /**
   * Begin enrollment: generate a secret, seal it, and return the provisioning
   * QR code. The secret is not activated until a valid code is confirmed, and
   * the pending secret expires.
   */
  async beginEnrollment(userId: string, actor: { userId: string; ip?: string }): Promise<EnrollmentStart> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found.');
    if (user.mfaEnabled) {
      throw conflict(ERROR_CODES.MFA_ALREADY_ENROLLED, 'MFA is already enabled for this account.');
    }

    const secret = this.mfa.generateSecret();
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MINUTES * 60_000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaPendingSecretEncrypted: this.cipher.encrypt(secret),
        mfaPendingExpiresAt: expiresAt,
      },
    });

    const otpauthUri = this.mfa.provisioningUri(secret, user.email);
    const qrDataUrl = await this.mfa.qrDataUrl(otpauthUri);

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'mfa.enrollment_started',
      targetType: 'USER',
      targetId: userId,
      summary: `MFA enrollment started for ${user.email}`,
      ipAddress: actor.ip ?? null,
    });

    return { otpauthUri, qrDataUrl, secret, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Confirm enrollment with a valid TOTP code. On success the pending secret is
   * promoted to the active secret, recovery codes are issued (returned once,
   * stored hashed), and the account is marked enrolled.
   */
  async confirmEnrollment(
    userId: string,
    code: string,
    actor: { userId: string; ip?: string },
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found.');
    if (user.mfaEnabled) {
      throw conflict(ERROR_CODES.MFA_ALREADY_ENROLLED, 'MFA is already enabled for this account.');
    }
    if (!user.mfaPendingSecretEncrypted || !user.mfaPendingExpiresAt) {
      throw badRequest(ERROR_CODES.MFA_NOT_ENROLLED, 'No enrollment is in progress.');
    }
    if (user.mfaPendingExpiresAt < new Date()) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaPendingSecretEncrypted: null, mfaPendingExpiresAt: null },
      });
      throw badRequest(ERROR_CODES.MFA_ENROLLMENT_EXPIRED, 'The enrollment window has expired. Start again.');
    }

    const secret = this.cipher.decrypt(user.mfaPendingSecretEncrypted);
    const verification = this.mfa.verify(secret, code);
    if (!verification.valid) {
      await this.audit.record({
        actorUserId: actor.userId,
        action: 'mfa.enrollment_failed',
        targetType: 'USER',
        targetId: userId,
        summary: `MFA enrollment confirmation failed for ${user.email}`,
        ipAddress: actor.ip ?? null,
      });
      throw forbidden(ERROR_CODES.MFA_INVALID_CODE, 'The verification code is not valid.');
    }

    const recoveryCodes = this.mfa.generateRecoveryCodes(RECOVERY_CODE_COUNT);

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ userId, codeHash: this.mfa.hashRecoveryCode(code) })),
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecretEncrypted: user.mfaPendingSecretEncrypted,
          mfaPendingSecretEncrypted: null,
          mfaPendingExpiresAt: null,
          mfaLastUsedStep: BigInt(verification.step ?? this.mfa.currentStep()),
          mfaEnrolledAt: new Date(),
        },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'mfa.enrolled',
      targetType: 'USER',
      targetId: userId,
      summary: `MFA enabled for ${user.email}`,
      ipAddress: actor.ip ?? null,
    });

    return { recoveryCodes };
  }

  /**
   * Verify a login challenge. Accepts either a TOTP code or a single-use
   * recovery code. Updates the replay counter on success.
   */
  async verifyChallenge(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) return false;

    const secret = this.cipher.decrypt(user.mfaSecretEncrypted);
    const totp = this.mfa.verify(secret, code, user.mfaLastUsedStep);
    if (totp.valid) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaLastUsedStep: BigInt(totp.step ?? this.mfa.currentStep()) },
      });
      return true;
    }

    // Fall back to a recovery code, which is consumed on use.
    const hash = this.mfa.hashRecoveryCode(code);
    const match = await this.prisma.mfaRecoveryCode.findFirst({
      where: { userId, usedAt: null, codeHash: hash },
    });
    if (!match || !this.mfa.hashEquals(match.codeHash, hash)) return false;

    await this.prisma.mfaRecoveryCode.update({
      where: { id: match.id },
      data: { usedAt: new Date() },
    });
    return true;
  }

  /** Regenerate recovery codes. Requires a currently valid code. */
  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    actor: { userId: string; ip?: string },
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw badRequest(ERROR_CODES.MFA_NOT_ENROLLED, 'MFA is not enabled for this account.');
    }
    const secret = this.cipher.decrypt(user.mfaSecretEncrypted);
    const totp = this.mfa.verify(secret, code, user.mfaLastUsedStep);
    if (!totp.valid) {
      throw forbidden(ERROR_CODES.MFA_INVALID_CODE, 'A valid current code is required to regenerate recovery codes.');
    }

    const recoveryCodes = this.mfa.generateRecoveryCodes(RECOVERY_CODE_COUNT);
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: this.mfa.hashRecoveryCode(c) })),
      });
      await tx.user.update({
        where: { id: userId },
        data: { mfaLastUsedStep: BigInt(totp.step ?? this.mfa.currentStep()) },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'mfa.recovery_codes_regenerated',
      targetType: 'USER',
      targetId: userId,
      summary: `Recovery codes regenerated for ${user.email}`,
      ipAddress: actor.ip ?? null,
    });
    return { recoveryCodes };
  }

  /** Disable MFA. Requires a valid current code. */
  async disable(userId: string, code: string, actor: { userId: string; ip?: string }): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw badRequest(ERROR_CODES.MFA_NOT_ENROLLED, 'MFA is not enabled for this account.');
    }
    const secret = this.cipher.decrypt(user.mfaSecretEncrypted);
    if (!this.mfa.verify(secret, code, user.mfaLastUsedStep).valid) {
      throw forbidden(ERROR_CODES.MFA_INVALID_CODE, 'A valid current code is required to disable MFA.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaPendingSecretEncrypted: null,
          mfaPendingExpiresAt: null,
          mfaLastUsedStep: null,
          mfaEnrolledAt: null,
        },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'mfa.disabled',
      targetType: 'USER',
      targetId: userId,
      summary: `MFA disabled for ${user.email}`,
      ipAddress: actor.ip ?? null,
    });
  }

  /**
   * Administrative reset for a locked-out account. Only a platform principal
   * may call this; the target's MFA material is cleared and every session is
   * revoked so the account cannot be used until the owner re-enrolls.
   */
  async adminReset(
    targetUserId: string,
    actor: { userId: string; ip?: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaPendingSecretEncrypted: null,
          mfaPendingExpiresAt: null,
          mfaLastUsedStep: null,
          mfaEnrolledAt: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'mfa.admin_reset',
      targetType: 'USER',
      targetId: targetUserId,
      summary: `MFA reset by an administrator for ${user.email}`,
      ipAddress: actor.ip ?? null,
    });
  }
}
