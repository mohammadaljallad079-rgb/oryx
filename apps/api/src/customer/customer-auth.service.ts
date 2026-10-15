import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { MfaService, SecretCipher } from '../auth/mfa.service';
import {
  ERROR_CODES,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from '../common/errors';
import type { CustomerTokenPayload } from './customer-auth.guard';

export interface CustomerSession {
  accessToken: string;
  /** Returned only for non-browser clients; browsers receive the cookie. */
  refreshToken?: string;
  csrfToken?: string;
  expiresIn: number;
  account: {
    id: string;
    email: string;
    fullName: string;
    preferredLocale: 'ar' | 'en';
    preferredTheme: 'dark' | 'light';
    mfaEnabled: boolean;
  };
}

export interface CustomerMfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
}

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;
const RESET_TTL_MINUTES = 30;

/**
 * Consumer identity for the customer website and mobile application.
 *
 * Deliberately independent of `AuthService`:
 *  - a customer is not a `User`, so it holds no company membership and no
 *    platform privilege;
 *  - its tokens carry `typ: 'customer'`, which `PrincipalGuard` rejects, so a
 *    consumer token can never reach an ERP route;
 *  - its refresh tokens live in `CustomerRefreshToken` with their own rotation
 *    family, so revoking a consumer session cannot disturb a staff session.
 */
@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly cipher: SecretCipher,
  ) {}

  private accessTtl(): number {
    return Number(this.config.get<string>('JWT_ACCESS_TTL') ?? 900);
  }

  private refreshTtl(): number {
    return Number(this.config.get<string>('JWT_REFRESH_TTL') ?? 2592000);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Register a consumer account.
   *
   * The account starts `ACTIVE` because a consumer has nothing to provision: it
   * owns only its own data. `PENDING` is reserved for an account created by an
   * operator that the customer has not yet claimed.
   *
   * A privacy row is created eagerly with restrictive defaults, so a later read
   * never has to guess whether "absent" means "denied" or "not yet asked".
   */
  async register(input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    preferredLocale?: 'ar' | 'en';
    preferredTheme?: 'dark' | 'light';
    meta?: { ip?: string; userAgent?: string };
  }): Promise<CustomerSession> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.customerAccount.findUnique({ where: { email } });
    if (existing) {
      throw conflict(ERROR_CODES.CUSTOMER_ACCOUNT_EXISTS, 'An account already exists for this email.');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const account = await this.prisma.customerAccount.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() ?? null,
        status: 'ACTIVE',
        preferredLocale: input.preferredLocale ?? 'ar',
        preferredTheme: input.preferredTheme ?? 'dark',
        privacy: { create: {} },
      },
    });

    await this.audit.record({
      action: 'customer.register',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: account.id,
      summary: `Customer account registered: ${email}`,
      ipAddress: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent ?? null,
    });

    return this.issueSession(account, input.meta ?? {}, 'WEB');
  }

  /**
   * Password login with a lockout counter.
   *
   * The failure path deliberately returns the same error for an unknown email
   * and a wrong password, so the endpoint cannot be used to enumerate accounts.
   */
  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
    deviceKind = 'WEB',
  ): Promise<CustomerSession | CustomerMfaChallenge> {
    const normalized = email.trim().toLowerCase();
    const account = await this.prisma.customerAccount.findUnique({ where: { email: normalized } });

    if (!account) {
      // Constant-ish work so a missing account is not obviously faster.
      await argon2.hash(password, { type: argon2.argon2id }).catch(() => undefined);
      throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'The email or password is incorrect.');
    }

    if (account.lockedUntil && account.lockedUntil > new Date()) {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_LOCKED, 'This account is temporarily locked. Try again later.');
    }
    if (account.status === 'SUSPENDED' || account.status === 'CLOSED') {
      throw forbidden(ERROR_CODES.CUSTOMER_ACCOUNT_INACTIVE, 'This customer account is not active.');
    }

    const valid = await argon2.verify(account.passwordHash, password);
    if (!valid) {
      await this.recordFailedLogin(account.id, account.failedLoginCount + 1);
      throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'The email or password is incorrect.');
    }

    if (account.mfaEnabled) {
      const challengeToken = await this.jwt.signAsync(
        { sub: account.id, mfa: 'pending', typ: 'customer' },
        { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: 300 },
      );
      return { mfaRequired: true, challengeToken, expiresIn: 300 };
    }

    await this.prisma.customerAccount.update({
      where: { id: account.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issueSession(account, meta, deviceKind);
  }

  private async recordFailedLogin(accountId: string, failedCount: number): Promise<void> {
    const shouldLock = failedCount >= MAX_FAILED_LOGINS;
    await this.prisma.customerAccount.update({
      where: { id: accountId },
      data: {
        failedLoginCount: failedCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
  }

  /** Second step of login when the account has TOTP enabled. */
  async loginWithMfa(
    challengeToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string },
    deviceKind = 'WEB',
  ): Promise<CustomerSession> {
    let payload: { sub: string; mfa?: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(challengeToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'The verification session has expired.');
    }
    if (payload.mfa !== 'pending' || payload.typ !== 'customer') {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Invalid verification token.');
    }

    const account = await this.prisma.customerAccount.findUnique({ where: { id: payload.sub } });
    if (!account || account.status === 'SUSPENDED' || account.status === 'CLOSED') {
      throw forbidden(ERROR_CODES.CUSTOMER_ACCOUNT_INACTIVE, 'This customer account is not active.');
    }
    if (!account.mfaEnabled || !account.mfaSecretEncrypted) {
      throw badRequest(ERROR_CODES.MFA_NOT_ENROLLED, 'This account does not have MFA enabled.');
    }

    const secret = this.cipher.decrypt(account.mfaSecretEncrypted);
    const result = this.mfa.verify(secret, code, account.mfaLastUsedStep);
    if (!result.valid) {
      await this.audit.record({
        action: 'customer.mfa_failed',
        targetType: 'CUSTOMER_ACCOUNT',
        targetId: account.id,
        summary: `Failed MFA verification for ${account.email}`,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw unauthorized(ERROR_CODES.MFA_INVALID_CODE, 'The verification code is not valid.');
    }

    // Advance the replay guard so the same code cannot be reused.
    await this.prisma.customerAccount.update({
      where: { id: account.id },
      data: {
        mfaLastUsedStep: BigInt(result.step ?? this.mfa.currentStep()),
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return this.issueSession(account, meta, deviceKind);
  }

  /**
   * Issue an access/refresh pair.
   *
   * `deviceKind` distinguishes a browser session from a mobile device session,
   * so the app can list and revoke devices independently.
   */
  private async issueSession(
    account: {
      id: string;
      email: string;
      fullName: string;
      preferredLocale: 'ar' | 'en';
      preferredTheme: 'dark' | 'light';
      mfaEnabled: boolean;
    },
    meta: { ip?: string; userAgent?: string },
    deviceKind: string,
  ): Promise<CustomerSession> {
    const sessionId = randomBytes(16).toString('hex');

    const accessToken = await this.jwt.signAsync(
      {
        sub: account.id,
        email: account.email,
        typ: 'customer',
        sessionId,
      } satisfies CustomerTokenPayload,
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl() },
    );

    const familyId = randomBytes(16).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: account.id, sid: sessionId, jti: randomBytes(24).toString('hex'), familyId, typ: 'customer' },
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );

    await this.prisma.customerRefreshToken.create({
      data: {
        accountId: account.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        familyId,
        deviceKind,
        deviceName: meta.userAgent?.slice(0, 120) ?? null,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ip ?? null,
      },
    });

    await this.audit.record({
      action: 'customer.login',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: account.id,
      summary: `Customer signed in: ${account.email}`,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl(),
      account: {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        preferredLocale: account.preferredLocale,
        preferredTheme: account.preferredTheme,
        mfaEnabled: account.mfaEnabled,
      },
    };
  }

  /**
   * Rotate a refresh token.
   *
   * A token that is valid but already revoked means the same token was presented
   * twice. That is the signature of a stolen token, so the entire rotation
   * family is revoked rather than just the one row.
   */
  async refresh(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<CustomerSession> {
    let payload: { sub: string; sid: string; familyId: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Refresh token is invalid or expired.');
    }
    if (payload.typ !== 'customer') {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Refresh token is invalid or expired.');
    }

    const record = await this.prisma.customerRefreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { account: true },
    });

    if (!record) {
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token is no longer valid.');
    }
    if (record.expiresAt < new Date()) {
      await this.revokeFamily(record.familyId);
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token has expired.');
    }
    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      await this.audit.record({
        action: 'customer.refresh_reuse_detected',
        targetType: 'CUSTOMER_ACCOUNT',
        targetId: record.accountId,
        summary: 'A revoked customer refresh token was replayed; the session family was revoked.',
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token is no longer valid.');
    }

    const account = record.account;
    if (account.status === 'SUSPENDED' || account.status === 'CLOSED') {
      throw forbidden(ERROR_CODES.CUSTOMER_ACCOUNT_INACTIVE, 'This customer account is not active.');
    }

    const session = await this.issueSession(account, meta, record.deviceKind);
    await this.prisma.customerRefreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedBy: this.hashToken(session.refreshToken!) },
    });
    return session;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.customerRefreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Sign out the current session only, leaving other devices signed in. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.customerRefreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(accountId: string): Promise<number> {
    const result = await this.prisma.customerRefreshToken.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: 'customer.logout_all',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: accountId,
      summary: 'Customer signed out of every device.',
    });
    return result.count;
  }

  /**
   * Start a password reset.
   *
   * Always resolves, whether or not the email exists, so the endpoint cannot be
   * used to discover registered addresses. Only the SHA-256 hash of the token is
   * stored, so a database read cannot be replayed into a reset.
   */
  async requestPasswordReset(email: string, meta: { ip?: string }): Promise<{ token?: string }> {
    const normalized = email.trim().toLowerCase();
    const account = await this.prisma.customerAccount.findUnique({ where: { email: normalized } });
    if (!account || account.status === 'CLOSED') return {};

    const token = randomBytes(32).toString('base64url');
    await this.prisma.customerPasswordResetToken.create({
      data: {
        accountId: account.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });

    await this.audit.record({
      action: 'customer.password_reset_requested',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: account.id,
      summary: `Password reset requested for ${normalized}`,
      ipAddress: meta.ip ?? null,
    });

    // The token is returned so the notification adapter can deliver it. It is
    // never logged. In production the email adapter is the only consumer.
    return { token };
  }

  /** Complete a password reset with a single-use token. */
  async resetPassword(token: string, password: string): Promise<void> {
    const record = await this.prisma.customerPasswordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!record) {
      throw badRequest(ERROR_CODES.CUSTOMER_RESET_INVALID, 'This reset link is not valid.');
    }
    if (record.usedAt) {
      throw badRequest(ERROR_CODES.CUSTOMER_RESET_INVALID, 'This reset link has already been used.');
    }
    if (record.expiresAt < new Date()) {
      throw badRequest(ERROR_CODES.CUSTOMER_RESET_EXPIRED, 'This reset link has expired.');
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.customerPasswordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.customerAccount.update({
        where: { id: record.accountId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      // A password change invalidates every existing session.
      this.prisma.customerRefreshToken.updateMany({
        where: { accountId: record.accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'customer.password_reset_completed',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: record.accountId,
      summary: 'Customer password reset; all sessions revoked.',
    });
  }

  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');

    const valid = await argon2.verify(account.passwordHash, currentPassword);
    if (!valid) {
      throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'The current password is incorrect.');
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.customerAccount.update({ where: { id: accountId }, data: { passwordHash } }),
      // Keep the current device signed in is not possible without the token, so
      // every session is revoked and the client is expected to sign in again.
      this.prisma.customerRefreshToken.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'customer.password_changed',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: accountId,
      summary: 'Customer changed their password; all sessions revoked.',
    });
  }

  async getProfile(accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        preferredLocale: true,
        preferredTheme: true,
        mfaEnabled: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        defaultCompanyId: true,
        _count: { select: { vehicles: true, addresses: true, bookings: true } },
      },
    });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');
    return account;
  }

  async updateProfile(
    accountId: string,
    input: {
      fullName?: string;
      phone?: string;
      preferredLocale?: 'ar' | 'en';
      preferredTheme?: 'dark' | 'light';
    },
  ) {
    const data: Record<string, unknown> = {};
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.preferredLocale !== undefined) data.preferredLocale = input.preferredLocale;
    if (input.preferredTheme !== undefined) data.preferredTheme = input.preferredTheme;

    if (Object.keys(data).length === 0) return this.getProfile(accountId);

    await this.prisma.customerAccount.update({ where: { id: accountId }, data });
    return this.getProfile(accountId);
  }

  /** Sessions the customer can review and revoke from the app. */
  async listSessions(accountId: string) {
    const sessions = await this.prisma.customerRefreshToken.findMany({
      where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceKind: true,
        deviceName: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  async revokeSession(accountId: string, sessionRowId: string): Promise<void> {
    const result = await this.prisma.customerRefreshToken.updateMany({
      where: { id: sessionRowId, accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Session not found.');
    }
  }

  // ---------------------------------------------------------------------- MFA

  /**
   * Begin TOTP enrollment for a consumer account.
   *
   * The secret is sealed with the same AES-256-GCM cipher the staff MFA path
   * uses and is returned exactly once, for the QR code. It is not activated
   * until `confirmMfa` verifies a code, so an interrupted enrollment cannot lock
   * the customer out.
   */
  async beginMfaEnrollment(accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');
    if (account.mfaEnabled) {
      throw badRequest(ERROR_CODES.MFA_ALREADY_ENROLLED, 'MFA is already enabled for this account.');
    }

    const secret = this.mfa.generateSecret();
    const uri = this.mfa.provisioningUri(secret, account.email);

    // Stored sealed but not yet active; mfaEnabled stays false until confirmed.
    await this.prisma.customerAccount.update({
      where: { id: accountId },
      data: { mfaSecretEncrypted: this.cipher.encrypt(secret) },
    });

    return { secret, otpauthUri: uri, qrDataUrl: await this.mfa.qrDataUrl(uri) };
  }

  async confirmMfaEnrollment(accountId: string, code: string) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');
    if (account.mfaEnabled) {
      throw badRequest(ERROR_CODES.MFA_ALREADY_ENROLLED, 'MFA is already enabled for this account.');
    }
    if (!account.mfaSecretEncrypted) {
      throw badRequest(ERROR_CODES.MFA_NOT_ENROLLED, 'Start MFA enrollment before confirming it.');
    }

    const secret = this.cipher.decrypt(account.mfaSecretEncrypted);
    const result = this.mfa.verify(secret, code, null);
    if (!result.valid) {
      throw badRequest(ERROR_CODES.MFA_INVALID_CODE, 'The verification code is not valid.');
    }

    await this.prisma.customerAccount.update({
      where: { id: accountId },
      data: {
        mfaEnabled: true,
        mfaEnrolledAt: new Date(),
        mfaLastUsedStep: BigInt(result.step ?? this.mfa.currentStep()),
      },
    });

    await this.audit.record({
      action: 'customer.mfa_enrolled',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: accountId,
      summary: 'Customer enabled TOTP MFA.',
    });

    return { mfaEnabled: true };
  }

  async disableMfa(accountId: string, password: string): Promise<void> {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');

    const valid = await argon2.verify(account.passwordHash, password);
    if (!valid) {
      throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'The password is incorrect.');
    }

    await this.prisma.customerAccount.update({
      where: { id: accountId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaLastUsedStep: null, mfaEnrolledAt: null },
    });

    await this.audit.record({
      action: 'customer.mfa_disabled',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: accountId,
      summary: 'Customer disabled TOTP MFA.',
    });
  }
}
