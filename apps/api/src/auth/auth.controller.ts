import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { CurrentPrincipal, Public, type RequestPrincipal } from './auth.decorators';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  LoginDto,
  RefreshDto,
  UpdateProfileDto,
} from './auth.dto';
import { badRequest, ERROR_CODES, forbidden, unauthorized } from '../common/errors';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  principal?: RequestPrincipal;
}

function meta(req: RequestLike) {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementService,
  ) {}

  @Public()
  @Throttle({ default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive access + refresh tokens' })
  async login(@Body() dto: LoginDto, @Req() req: RequestLike) {
    return this.auth.login(dto.email, dto.password, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  async refresh(@Body() dto: RefreshDto, @Req() req: RequestLike) {
    return this.auth.refresh(dto.refreshToken, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation and activate the invited account' })
  async acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: RequestLike) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: { role: true, branches: true },
    });
    if (!invitation || invitation.status !== 'PENDING') {
      throw unauthorized(ERROR_CODES.AUTH_INVITATION_INVALID, 'Invitation is not valid.');
    }
    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw unauthorized(ERROR_CODES.AUTH_INVITATION_EXPIRED, 'Invitation has expired.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (existing && existing.status === 'ACTIVE') {
      throw badRequest(ERROR_CODES.RESOURCE_CONFLICT, 'An active account already exists for this invitation.');
    }

    const passwordHash = await AuthService.hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              passwordHash,
              status: 'ACTIVE',
              fullNameEn: dto.fullNameEn,
              fullNameAr: dto.fullNameAr,
            },
          })
        : await tx.user.create({
            data: {
              email: invitation.email,
              passwordHash,
              status: 'ACTIVE',
              fullNameEn: dto.fullNameEn,
              fullNameAr: dto.fullNameAr,
            },
          });

      await tx.membership.upsert({
        where: { userId_companyId: { userId: created.id, companyId: invitation.companyId } },
        update: { roleId: invitation.roleId, isActive: true },
        create: {
          userId: created.id,
          companyId: invitation.companyId,
          roleId: invitation.roleId,
          invitedById: invitation.invitedById,
        },
      });

      const membership = await tx.membership.findUnique({
        where: { userId_companyId: { userId: created.id, companyId: invitation.companyId } },
      });
      if (membership) {
        for (const b of invitation.branches) {
          await tx.membershipBranch.upsert({
            where: { membershipId_branchId: { membershipId: membership.id, branchId: b.branchId } },
            update: {},
            create: { membershipId: membership.id, branchId: b.branchId },
          });
        }
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      return created;
    });

    await this.audit.record({
      actorUserId: user.id,
      companyId: invitation.companyId,
      action: 'auth.invitation_accepted',
      targetType: 'USER',
      targetId: user.id,
      summary: `${user.email} accepted an invitation`,
      ...meta(req),
    });

    return this.auth.login(user.email, dto.password, meta(req));
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the presented refresh token' })
  async logout(@Body() dto: RefreshDto, @CurrentPrincipal() principal: RequestPrincipal) {
    await this.auth.logout(dto.refreshToken, principal.userId);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  async logoutAll(@CurrentPrincipal() principal: RequestPrincipal) {
    await this.auth.revokeAllSessions(principal.userId);
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'auth.logout_all',
      targetType: 'USER',
      targetId: principal.userId,
      summary: 'All sessions revoked',
    });
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user, memberships and effective permissions' })
  async me(@CurrentPrincipal() principal: RequestPrincipal) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    const memberships = await this.auth.loadMemberships(user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        fullNameEn: user.fullNameEn,
        fullNameAr: user.fullNameAr,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        preferredLocale: user.preferredLocale,
        preferredTheme: user.preferredTheme,
      },
      memberships,
      permissions: principal.grantedPermissions,
      context: {
        companyId: principal.company?.companyId ?? principal.activeCompanyId ?? null,
        branchId: principal.activeBranchId ?? null,
        licensedModules: principal.company?.licensedModuleKeys ?? [],
        supportSessionCompanyId: principal.supportSessionCompanyId ?? null,
      },
    };
  }

  @ApiBearerAuth()
  @Get('context')
  @ApiOperation({ summary: 'Company/branch selector options for the current principal' })
  async context(@CurrentPrincipal() principal: RequestPrincipal) {
    if (principal.kind === 'PLATFORM') {
      const companies = await this.prisma.company.findMany({
        where: { status: { not: 'ARCHIVED' } },
        orderBy: { nameEn: 'asc' },
        select: { id: true, nameEn: true, nameAr: true, type: true, status: true },
      });
      const branches = await this.prisma.branch.findMany({
        where: { isActive: true, company: { status: { not: 'ARCHIVED' } } },
        orderBy: [{ companyId: 'asc' }, { nameEn: 'asc' }],
        select: { id: true, companyId: true, nameEn: true, nameAr: true, code: true },
      });
      const licensed = principal.company
        ? await this.entitlements.licensedModulesFor(principal.company.companyId)
        : [];
      return { companies, branches, licensedModules: licensed, permissions: principal.grantedPermissions };
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: principal.userId, isActive: true },
      include: { company: true, branches: true },
    });
    const companyIds = memberships.map((m) => m.companyId);
    const companies = memberships.map((m) => ({
      id: m.companyId,
      nameEn: m.company.nameEn,
      nameAr: m.company.nameAr,
      type: m.company.type,
      status: m.company.status,
    }));
    const scopedBranchIds = memberships.flatMap((m) => m.branches.map((b) => b.branchId));
    const branches = await this.prisma.branch.findMany({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        ...(scopedBranchIds.length > 0 ? { id: { in: scopedBranchIds } } : {}),
      },
      orderBy: { nameEn: 'asc' },
      select: { id: true, companyId: true, nameEn: true, nameAr: true, code: true },
    });
    const licensed = principal.company
      ? await this.entitlements.licensedModulesFor(principal.company.companyId)
      : [];
    return { companies, branches, licensedModules: licensed, permissions: principal.grantedPermissions };
  }

  @ApiBearerAuth()
  @Patch('profile')
  @ApiOperation({ summary: 'Update profile and persisted theme/locale preference' })
  async updateProfile(@Body() dto: UpdateProfileDto, @CurrentPrincipal() principal: RequestPrincipal) {
    const data: Record<string, unknown> = {};
    if (dto.fullNameEn !== undefined) data.fullNameEn = dto.fullNameEn;
    if (dto.fullNameAr !== undefined) data.fullNameAr = dto.fullNameAr;
    if (dto.preferredLocale !== undefined) data.preferredLocale = dto.preferredLocale;
    if (dto.preferredTheme !== undefined) data.preferredTheme = dto.preferredTheme;
    if (Object.keys(data).length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No profile fields supplied.');
    }
    const user = await this.prisma.user.update({ where: { id: principal.userId }, data });
    await this.audit.record({
      actorUserId: principal.userId,
      companyId: principal.company?.companyId ?? null,
      action: 'auth.profile_updated',
      targetType: 'USER',
      targetId: principal.userId,
      summary: 'Profile preferences updated',
      metadata: data,
    });
    return {
      id: user.id,
      preferredLocale: user.preferredLocale,
      preferredTheme: user.preferredTheme,
      fullNameEn: user.fullNameEn,
      fullNameAr: user.fullNameAr,
    };
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the current user password and revoke other sessions' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentPrincipal() principal: RequestPrincipal) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!ok) throw unauthorized(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Current password is incorrect.');
    if (dto.newPassword === dto.currentPassword) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'New password must differ from the current password.');
    }
    const passwordHash = await AuthService.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await this.auth.revokeAllSessions(user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.password_changed',
      targetType: 'USER',
      targetId: user.id,
      summary: 'Password changed; all sessions revoked',
    });
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'List active refresh-token sessions for the current user' })
  async sessions(@CurrentPrincipal() principal: RequestPrincipal) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId: principal.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    });
    return { sessions };
  }
}
