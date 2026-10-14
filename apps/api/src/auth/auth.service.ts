import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import type { LoginResponse, LoginResult, MembershipSummary, SessionUser } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ERROR_CODES, forbidden, unauthorized } from '../common/errors';
import { MfaEnrollmentService } from './mfa-enrollment.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  kind: 'PLATFORM' | 'COMPANY';
  companyId?: string;
  membershipId?: string;
  supportSessionCompanyId?: string;
  sessionId: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

/** The subset of the user record the session issuer needs. */
interface UserRecord {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  status: string;
  preferredLocale: string;
  preferredTheme: string;
  isSuperAdmin: boolean;
}

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mfa: MfaEnrollmentService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  private accessTtl(): number {
    return Number(this.config.get('JWT_ACCESS_TTL') ?? 900);
  }

  private refreshTtl(): number {
    return Number(this.config.get('JWT_REFRESH_TTL') ?? 2592000);
  }

  /** MFA challenge tokens are intentionally very short lived. */
  private mfaChallengeTtl(): number {
    return Number(this.config.get('MFA_CHALLENGE_TTL') ?? 300);
  }

  /**
   * Grace window during which a just-rotated token may be presented again
   * without being treated as a compromise.
   *
   * Two tabs (or a retried request) can race the same rotation: the loser sees
   * a token that was revoked milliseconds ago and is not an attacker. Inside
   * this window we answer with a freshly minted token from the same family
   * instead of revoking the family. Outside it, replay is treated as theft.
   */
  private rotationGraceMs(): number {
    return Number(this.config.get('REFRESH_ROTATION_GRACE_MS') ?? 30_000);
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      // Constant-ish work to avoid trivially enumerating accounts by timing.
      await argon2.hash(password).catch(() => undefined);
      throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid email or password.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_LOCKED, 'Account temporarily locked due to failed sign-in attempts.');
    }
    if (user.status === 'SUSPENDED' || user.status === 'DISABLED') {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'This account is not active.');
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid email or password.');
    }
    if (user.failedLoginCount !== 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    return user;
  }

  /**
   * Password step of login.
   *
   * When the account has MFA enabled this returns an MFA challenge instead of a
   * session: no tokens are issued until the second factor is verified, so a
   * stolen password alone cannot obtain access.
   */
  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const user = await this.validateCredentials(email, password);

    if (user.mfaEnabled && user.mfaSecretEncrypted) {
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, mfa: 'pending' },
        {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: this.mfaChallengeTtl(),
        },
      );
      await this.audit.record({
        actorUserId: user.id,
        action: 'auth.mfa_challenge_issued',
        targetType: 'USER',
        targetId: user.id,
        summary: `MFA challenge issued for ${user.email}`,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      return {
        mfaRequired: true,
        challengeToken,
        expiresIn: this.mfaChallengeTtl(),
      };
    }

    return this.issueSession(user, meta, 'auth.login');
  }

  /**
   * Second step of login: verify a TOTP or recovery code against the challenge
   * token and, on success, issue the session.
   */
  async loginWithMfa(
    challengeToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    let payload: { sub: string; mfa?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; mfa?: string }>(challengeToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'The MFA challenge has expired. Sign in again.');
    }
    if (payload.mfa !== 'pending') {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Invalid MFA challenge token.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'DISABLED') {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'This account is not active.');
    }

    const ok = await this.mfa.verifyChallenge(user.id, code);
    if (!ok) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'auth.mfa_failed',
        targetType: 'USER',
        targetId: user.id,
        summary: `Failed MFA verification for ${user.email}`,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw unauthorized(ERROR_CODES.MFA_INVALID_CODE, 'The verification code is not valid.');
    }

    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.mfa_verified',
      targetType: 'USER',
      targetId: user.id,
      summary: `MFA verified for ${user.email}`,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.issueSession(user, meta, 'auth.login_mfa');
  }

  /** Issue a full session (access token + refresh token + audit entry). */
  private async issueSession(
    user: {
      id: string;
      email: string;
      fullNameEn: string;
      fullNameAr: string;
      status: string;
      preferredLocale: string;
      preferredTheme: string;
      isSuperAdmin: boolean;
    },
    meta: { ip?: string; userAgent?: string },
    auditAction: string,
  ): Promise<LoginResponse> {
    const memberships = await this.loadMemberships(user.id);
    const activeMemberships = memberships.filter((m) => m.companyStatus === 'ACTIVE');

    const kind: 'PLATFORM' | 'COMPANY' = user.isSuperAdmin ? 'PLATFORM' : 'COMPANY';
    if (kind === 'COMPANY' && activeMemberships.length === 0) {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'No active company membership for this account.');
    }

    const primary = activeMemberships[0];
    const sessionId = randomBytes(16).toString('hex');

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        kind,
        companyId: kind === 'COMPANY' ? primary?.companyId : undefined,
        membershipId: kind === 'COMPANY' ? primary?.membershipId : undefined,
        sessionId,
      } satisfies AccessTokenPayload,
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTtl(),
      },
    );

    const jti = randomBytes(24).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, jti } satisfies RefreshTokenPayload,
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      actorUserId: user.id,
      companyId: kind === 'COMPANY' ? (primary?.companyId ?? null) : null,
      action: auditAction,
      targetType: 'USER',
      targetId: user.id,
      summary: `Signed in as ${user.email}`,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    const permissions = await this.effectivePermissionCodes(user.id, primary?.membershipId);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl(),
      user: this.toSessionUser(user, kind),
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyNameEn: m.companyNameEn,
        companyNameAr: m.companyNameAr,
        companyType: m.companyType as MembershipSummary['companyType'],
        companyStatus: m.companyStatus as MembershipSummary['companyStatus'],
        roleId: m.roleId,
        roleNameEn: m.roleNameEn,
        roleNameAr: m.roleNameAr,
        branchIds: m.branchIds,
      })),
      permissions,
    };
  }

  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }): Promise<LoginResponse> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Refresh token is invalid or expired.');
    }

    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // ------------------------------------------------------------- unknown token
    // A well-signed token that is not in the store can only mean the row was
    // purged. Treat it as invalid rather than as a compromise signal, because
    // there is no family to revoke.
    if (!record) {
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token is no longer valid.');
    }

    // ------------------------------------------------------------- hard expiry
    if (record.expiresAt < new Date()) {
      await this.revokeFamily(record.familyId);
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token has expired.');
    }

    // ---------------------------------------------------------- rotated token
    if (record.revokedAt) {
      const age = Date.now() - record.revokedAt.getTime();

      // Benign race: two tabs (or a retried request) presented the same token
      // within the grace window. Answer with a fresh token from the same family
      // instead of destroying the session. The presented token stays revoked,
      // so a leaked copy is still useless once the window closes.
      if (record.replacedBy && age <= this.rotationGraceMs()) {
        const successor = await this.prisma.refreshToken.findUnique({
          where: { id: record.replacedBy },
        });
        if (successor && !successor.revokedAt && successor.expiresAt > new Date()) {
          await this.audit.record({
            actorUserId: record.userId,
            action: 'auth.refresh_concurrent_rotation',
            targetType: 'USER',
            targetId: record.userId,
            summary: 'Concurrent refresh handled within the rotation grace window.',
            ipAddress: meta.ip ?? null,
          });
          // Issue a sibling token in the same family. The successor is left
          // untouched so the other caller's cookie keeps working: both tabs end
          // up with valid, independent sessions.
          return this.issueSibling(record.user, record.familyId, meta);
        }
      }

      // Replay of a token that was rotated long ago, or of a token whose
      // successor is gone: this is the compromise signal. Revoke the whole
      // family so every descendant of this login stops working.
      await this.revokeFamily(record.familyId);
      await this.audit.record({
        actorUserId: record.userId,
        action: 'auth.refresh_reuse_detected',
        targetType: 'USER',
        targetId: record.userId,
        summary: 'Revoked refresh token was replayed; the token family was invalidated.',
        ipAddress: meta.ip ?? null,
      });
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token is no longer valid.');
    }

    // ------------------------------------------------------------ valid rotation
    return this.rotateFrom(record, meta);
  }

  /**
   * Atomically consume a refresh token and issue its successor.
   *
   * The `updateMany` is guarded on `revokedAt: null`, so exactly one concurrent
   * caller wins the race; the loser sees a count of 0 and falls through to the
   * reuse path above, which the grace window handles.
   */
  private async rotateFrom(
    record: { id: string; userId: string; familyId: string; user: UserRecord },
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const sessionId = randomBytes(16).toString('hex');
    const newJti = randomBytes(24).toString('hex');
    const newRefresh = await this.jwt.signAsync(
      { sub: record.userId, sid: sessionId, jti: newJti } satisfies RefreshTokenPayload,
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Another caller won the race and already consumed this token. Answer with
    // a sibling in the same family so both callers end up with a usable session.
    //
    // There is a narrow window where the winner has set `revokedAt` but has not
    // yet written `replacedBy`, so a single read can miss the successor. Poll
    // briefly for it; if it still does not appear, the revocation is recent
    // enough that this is plainly a concurrent refresh rather than a replay, and
    // a sibling is still the correct answer.
    if (claimed.count === 0) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const current = await this.prisma.refreshToken.findUnique({ where: { id: record.id } });
        if (!current) break;
        if (current.replacedBy) {
          const successor = await this.prisma.refreshToken.findUnique({ where: { id: current.replacedBy } });
          if (successor && !successor.revokedAt && successor.expiresAt > new Date()) {
            return this.issueSibling(record.user, record.familyId, meta);
          }
        }
        // A revocation older than the grace window is a replay, not a race.
        if (current.revokedAt && Date.now() - current.revokedAt.getTime() > this.rotationGraceMs()) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token is no longer valid.');
    }

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: this.hashToken(newRefresh),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        familyId: record.familyId,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { replacedBy: created.id },
    });

    const user = record.user;
    const memberships = await this.loadMemberships(user.id);
    const activeMemberships = memberships.filter((m) => m.companyStatus === 'ACTIVE');
    const kind: 'PLATFORM' | 'COMPANY' = user.isSuperAdmin ? 'PLATFORM' : 'COMPANY';
    const primary = activeMemberships[0];
    if (kind === 'COMPANY' && !primary) {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'No active company membership for this account.');
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        kind,
        companyId: kind === 'COMPANY' ? primary?.companyId : undefined,
        membershipId: kind === 'COMPANY' ? primary?.membershipId : undefined,
        sessionId,
      } satisfies AccessTokenPayload,
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl() },
    );

    const permissions = await this.effectivePermissionCodes(user.id, primary?.membershipId);

    return {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: this.accessTtl(),
      user: this.toSessionUser(user, kind),
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyNameEn: m.companyNameEn,
        companyNameAr: m.companyNameAr,
        companyType: m.companyType as MembershipSummary['companyType'],
        companyStatus: m.companyStatus as MembershipSummary['companyStatus'],
        roleId: m.roleId,
        roleNameEn: m.roleNameEn,
        roleNameAr: m.roleNameAr,
        branchIds: m.branchIds,
      })),
      permissions,
    };
  }

  /**
   * Issue an additional valid token in an existing family.
   *
   * Used when a refresh races another refresh of the same token. Unlike a
   * rotation, nothing is revoked: the caller gets its own session alongside the
   * one the winning caller already received.
   */
  private async issueSibling(
    user: UserRecord,
    familyId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const sessionId = randomBytes(16).toString('hex');
    const jti = randomBytes(24).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, jti } satisfies RefreshTokenPayload,
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        familyId,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    const memberships = await this.loadMemberships(user.id);
    const activeMemberships = memberships.filter((m) => m.companyStatus === 'ACTIVE');
    const kind: 'PLATFORM' | 'COMPANY' = user.isSuperAdmin ? 'PLATFORM' : 'COMPANY';
    const primary = activeMemberships[0];
    if (kind === 'COMPANY' && !primary) {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'No active company membership for this account.');
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        kind,
        companyId: kind === 'COMPANY' ? primary?.companyId : undefined,
        membershipId: kind === 'COMPANY' ? primary?.membershipId : undefined,
        sessionId,
      } satisfies AccessTokenPayload,
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl() },
    );

    const permissions = await this.effectivePermissionCodes(user.id, primary?.membershipId);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl(),
      user: this.toSessionUser(user, kind),
      memberships: memberships.map((m) => ({
        companyId: m.companyId,
        companyNameEn: m.companyNameEn,
        companyNameAr: m.companyNameAr,
        companyType: m.companyType as MembershipSummary['companyType'],
        companyStatus: m.companyStatus as MembershipSummary['companyStatus'],
        roleId: m.roleId,
        roleNameEn: m.roleNameEn,
        roleNameAr: m.roleNameAr,
        branchIds: m.branchIds,
      })),
      permissions,
    };
  }

  /** Revoke every token in a rotation family. */
  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logout(refreshToken: string | undefined, userId: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (userId) {
      await this.audit.record({
        actorUserId: userId,
        action: 'auth.logout',
        targetType: 'USER',
        targetId: userId,
        summary: 'Signed out',
      });
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async loadMemberships(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        company: true,
        role: true,
        branches: { select: { branchId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      companyId: m.companyId,
      companyNameEn: m.company.nameEn,
      companyNameAr: m.company.nameAr,
      companyType: m.company.type,
      companyStatus: m.company.status,
      roleId: m.roleId,
      roleNameEn: m.role.nameEn,
      roleNameAr: m.role.nameAr,
      branchIds: m.branches.map((b) => b.branchId),
      isActive: m.isActive,
    }));
  }

  /** Permission codes granted by the role (before entitlement gating). */
  async effectivePermissionCodes(userId: string, membershipId?: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];
    if (user.isSuperAdmin) {
      const role = await this.prisma.role.findFirst({
        where: { isPlatform: true, code: 'platform_super_admin' },
        include: { permissions: true },
      });
      return role?.permissions.map((p) => p.permissionCode) ?? [];
    }
    if (!membershipId) return [];
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { role: { include: { permissions: true } } },
    });
    return membership?.role.permissions.map((p) => p.permissionCode) ?? [];
  }

  private toSessionUser(
    user: { id: string; email: string; fullNameEn: string; fullNameAr: string; status: string; preferredLocale: string; preferredTheme: string; isSuperAdmin: boolean },
    kind: 'PLATFORM' | 'COMPANY',
  ): SessionUser {
    return {
      id: user.id,
      email: user.email,
      fullNameEn: user.fullNameEn,
      fullNameAr: user.fullNameAr,
      status: user.status as SessionUser['status'],
      kind,
      preferredLocale: user.preferredLocale as 'ar' | 'en',
      preferredTheme: user.preferredTheme as 'dark' | 'light',
      isSuperAdmin: user.isSuperAdmin,
    };
  }
}
