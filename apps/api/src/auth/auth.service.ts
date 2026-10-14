import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import type { LoginResponse, MembershipSummary, SessionUser } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ERROR_CODES, forbidden, unauthorized } from '../common/errors';

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

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
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

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }): Promise<LoginResponse> {
    const user = await this.validateCredentials(email, password);

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
      action: 'auth.login',
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

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      // Reuse of a rotated/revoked token is treated as a compromise signal.
      if (record?.userId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.record({
          actorUserId: record.userId,
          action: 'auth.refresh_reuse_detected',
          targetType: 'USER',
          targetId: record.userId,
          summary: 'Revoked refresh token was replayed; all sessions invalidated.',
          ipAddress: meta.ip ?? null,
        });
      }
      throw unauthorized(ERROR_CODES.AUTH_REFRESH_REVOKED, 'Refresh token is no longer valid.');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const user = record.user;
    const memberships = await this.loadMemberships(user.id);
    const activeMemberships = memberships.filter((m) => m.companyStatus === 'ACTIVE');
    const kind: 'PLATFORM' | 'COMPANY' = user.isSuperAdmin ? 'PLATFORM' : 'COMPANY';
    const primary = activeMemberships[0];
    if (kind === 'COMPANY' && !primary) {
      throw forbidden(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'No active company membership for this account.');
    }

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
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: this.accessTtl() },
    );

    const newJti = randomBytes(24).toString('hex');
    const newRefresh = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, jti: newJti } satisfies RefreshTokenPayload,
      { secret: this.config.get<string>('JWT_REFRESH_SECRET'), expiresIn: this.refreshTtl() },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(newRefresh),
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

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
