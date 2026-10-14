import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  DELEGABLE_PERMISSION_CODES,
  delegablePermissionsFor,
  getPermission,
  validateDelegation,
  type PlanLimits,
  checkLimit,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { AuditService } from '../common/audit.service';
import {
  badRequest,
  conflict,
  ERROR_CODES,
  forbidden,
  notFound,
} from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type {
  CreateRoleDto,
  InviteUserDto,
  UpdateMembershipDto,
  UpdateRoleDto,
} from './rbac.dto';

const INVITATION_TTL_DAYS = 7;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------- context

  /**
   * Resolve the actor's effective permissions and licensed modules for a company
   * so delegation can be validated against what the actor truly holds.
   */
  async actorAuthority(companyId: string, actor: ActorContext) {
    const licensed = await this.entitlements.licensedModulesFor(companyId);
    if (actor.kind === 'PLATFORM') {
      return { permissions: await this.platformPermissionCodes(), licensed, isPlatform: true };
    }
    if (actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const membership = await this.prisma.membership.findFirst({
      where: { userId: actor.userId, companyId, isActive: true },
      include: { role: { include: { permissions: true } } },
    });
    if (!membership) throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'No active membership in this company.');
    return {
      permissions: membership.role.permissions.map((p) => p.permissionCode),
      licensed,
      isPlatform: false,
    };
  }

  private async platformPermissionCodes(): Promise<string[]> {
    const role = await this.prisma.role.findFirst({
      where: { isPlatform: true, code: 'platform_super_admin' },
      include: { permissions: true },
    });
    return role?.permissions.map((p) => p.permissionCode) ?? [];
  }

  /** Permissions an actor may offer when creating/editing a role. */
  async delegablePermissions(companyId: string, actor: ActorContext) {
    const authority = await this.actorAuthority(companyId, actor);

    // A platform administrator is not limited by its own granted set (it holds
    // platform.* codes, not company ones), so it may delegate any non-platform
    // delegable permission that the company's plan licenses.
    if (authority.isPlatform) {
      return DELEGABLE_PERMISSION_CODES.filter((code) => {
        const def = getPermission(code);
        if (!def || def.scope === 'PLATFORM') return false;
        if (def.moduleKey && !authority.licensed.includes(def.moduleKey)) return false;
        return true;
      }).sort();
    }

    return delegablePermissionsFor(authority.permissions, authority.licensed);
  }

  private async assertDelegation(
    companyId: string,
    actor: ActorContext,
    requested: string[],
  ): Promise<void> {
    const authority = await this.actorAuthority(companyId, actor);
    const result = validateDelegation({
      actorPermissions: authority.permissions,
      requestedPermissions: requested,
      licensedModuleKeys: authority.licensed,
      actorIsPlatform: authority.isPlatform,
    });
    if (!result.ok) {
      throw forbidden(
        ERROR_CODES.FORBIDDEN_DELEGATION,
        'The requested permissions exceed your delegable scope.',
        { rejected: result.rejected },
      );
    }
  }

  // --------------------------------------------------------------------- roles

  async listRoles(companyId: string, actor: ActorContext) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const roles = await this.prisma.role.findMany({
      where: { companyId, isPlatform: false },
      orderBy: [{ isSystem: 'desc' }, { nameEn: 'asc' }],
      include: {
        permissions: true,
        _count: { select: { memberships: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      code: r.code,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      descriptionEn: r.descriptionEn,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permissionCode).sort(),
      memberCount: r._count.memberships,
    }));
  }

  async createRole(companyId: string, dto: CreateRoleDto, actor: ActorContext) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const code = dto.code.trim().toLowerCase().replace(/\s+/g, '_');
    const existing = await this.prisma.role.findFirst({ where: { companyId, code } });
    if (existing) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Role code "${code}" already exists.`);

    const permissions = dto.permissions ?? [];
    await this.assertDelegation(companyId, actor, permissions);

    const role = await this.prisma.role.create({
      data: {
        companyId,
        code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        descriptionEn: dto.descriptionEn ?? null,
        isSystem: false,
        permissions: { create: permissions.map((permissionCode) => ({ permissionCode })) },
      },
      include: { permissions: true },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'role.created',
      targetType: 'ROLE',
      targetId: role.id,
      summary: `Created role ${role.nameEn} with ${permissions.length} permission(s)`,
      metadata: { permissions },
    });

    return {
      id: role.id,
      companyId: role.companyId,
      code: role.code,
      nameEn: role.nameEn,
      nameAr: role.nameAr,
      descriptionEn: role.descriptionEn,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p) => p.permissionCode).sort(),
    };
  }

  async updateRole(roleId: string, dto: UpdateRoleDto, actor: ActorContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
    if (!role || !role.companyId) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Role not found.');
    if (actor.kind === 'COMPANY' && actor.companyId !== role.companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    if (role.isSystem) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'System roles cannot be modified. Create a custom role instead.');
    }

    if (dto.permissions) {
      await this.assertDelegation(role.companyId, actor, dto.permissions);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (dto.permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissions.map((permissionCode) => ({ roleId, permissionCode })),
          });
        }
      }
      return tx.role.update({
        where: { id: roleId },
        data: {
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        },
        include: { permissions: true },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId: role.companyId,
      action: 'role.updated',
      targetType: 'ROLE',
      targetId: roleId,
      summary: `Updated role ${updated.nameEn}`,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return {
      id: updated.id,
      companyId: updated.companyId,
      code: updated.code,
      nameEn: updated.nameEn,
      nameAr: updated.nameAr,
      descriptionEn: updated.descriptionEn,
      isSystem: updated.isSystem,
      permissions: updated.permissions.map((p) => p.permissionCode).sort(),
    };
  }

  async deleteRole(roleId: string, actor: ActorContext) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { memberships: true, invitations: true } } },
    });
    if (!role || !role.companyId) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Role not found.');
    if (actor.kind === 'COMPANY' && actor.companyId !== role.companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    if (role.isSystem) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'System roles cannot be deleted.');
    }
    if (role._count.memberships > 0) {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'Role is still assigned to users. Reassign them first.');
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: role.companyId,
      action: 'role.deleted',
      targetType: 'ROLE',
      targetId: roleId,
      summary: `Deleted role ${role.nameEn}`,
    });
    return { ok: true };
  }

  // --------------------------------------------------------------------- users

  async listUsers(
    companyId: string,
    query: { page?: number; pageSize?: number; search?: string; status?: string },
    actor: ActorContext,
  ) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const where = {
      companyId,
      ...(query.status ? { user: { status: query.status as never } } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { fullNameEn: { contains: query.search, mode: 'insensitive' as const } },
                { fullNameAr: { contains: query.search } },
              ],
            },
          }
        : {}),
    };

    const [memberships, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: true,
          role: { include: { permissions: true } },
          branches: { include: { branch: true } },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return {
      items: memberships.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        fullNameEn: m.user.fullNameEn,
        fullNameAr: m.user.fullNameAr,
        status: m.user.status,
        isSuperAdmin: m.user.isSuperAdmin,
        preferredLocale: m.user.preferredLocale,
        preferredTheme: m.user.preferredTheme,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
        createdAt: m.user.createdAt.toISOString(),
        memberships: [
          {
            companyId,
            companyNameEn: '',
            companyNameAr: '',
            companyType: 'SAAS_TENANT' as never,
            companyStatus: 'ACTIVE' as never,
            roleId: m.roleId,
            roleNameEn: m.role.nameEn,
            roleNameAr: m.role.nameAr,
            branchIds: m.branches.map((b) => b.branchId),
          },
        ],
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Full effective-permission breakdown for a company user (privilege audit view). */
  async effectivePermissions(companyId: string, userId: string, actor: ActorContext) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      include: { role: { include: { permissions: true } }, branches: true, user: true },
    });
    if (!membership) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Membership not found.');

    const licensed = await this.entitlements.licensedModulesFor(companyId);
    const licensedSet = new Set(licensed);
    const granted = membership.role.permissions.map((p) => p.permissionCode);

    const effective: string[] = [];
    const suppressed: Array<{ code: string; reason: string }> = [];
    for (const code of granted) {
      const def = getPermission(code);
      if (!def) continue;
      if (def.moduleKey && !licensedSet.has(def.moduleKey)) {
        suppressed.push({ code, reason: 'module_not_licensed' });
        continue;
      }
      effective.push(code);
    }

    return {
      userId,
      email: membership.user.email,
      role: { id: membership.roleId, nameEn: membership.role.nameEn, nameAr: membership.role.nameAr },
      branchIds: membership.branches.map((b) => b.branchId),
      granted: granted.sort(),
      effective: effective.sort(),
      suppressedByEntitlement: suppressed.sort((a, b) => a.code.localeCompare(b.code)),
      licensedModules: licensed.sort(),
    };
  }

  async inviteUser(companyId: string, dto: InviteUserDto, actor: ActorContext) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const email = dto.email.toLowerCase().trim();
    const role = await this.prisma.role.findFirst({ where: { id: dto.roleId, companyId } });
    if (!role) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Role does not belong to this company.');
    if (role.isPlatform) throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Platform roles cannot be assigned to company users.');

    // Delegation: the inviter may only assign a role whose permissions it holds.
    const rolePermissions = (
      await this.prisma.rolePermission.findMany({ where: { roleId: role.id } })
    ).map((p) => p.permissionCode);
    await this.assertDelegation(companyId, actor, rolePermissions);

    // Seat limit.
    const ent = await this.entitlements.forCompany(companyId);
    const usage = await this.entitlements.usageFor(companyId);
    const limits: PlanLimits = { ...ent.limits };
    const check = checkLimit(limits, 'maxUsers', usage.users, 1);
    if (!check.ok) {
      throw forbidden(ERROR_CODES.PLAN_LIMIT_EXCEEDED, `Plan user limit reached (${check.limit}).`, {
        limit: check.limit,
        current: check.current,
        limitName: 'maxUsers',
      });
    }

    // Branch scope: the inviter may only assign branches it can reach.
    const branchIds = dto.branchIds ?? [];
    if (branchIds.length > 0) {
      const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } } });
      for (const b of branches) {
        if (b.companyId !== companyId) {
          throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Branch belongs to another company.');
        }
      }
      if (branches.length !== branchIds.length) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'One or more branches were not found.');
      }
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser?.isSuperAdmin) {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'That account is a platform administrator.');
    }
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId } },
      });
      if (existingMembership) {
        throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'That user is already a member of this company.');
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      // Invalidate earlier pending invitations for the same email+company.
      await tx.invitation.updateMany({
        where: { email, companyId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });

      const created = await tx.invitation.create({
        data: {
          email,
          companyId,
          roleId: role.id,
          tokenHash,
          invitedById: actor.userId,
          expiresAt,
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
      });

      // Pre-create the user in INVITED state so the account is visible in admin.
      if (!existingUser) {
        await tx.user.create({
          data: {
            email,
            // Unusable password until the invitation is accepted.
            passwordHash: 'invited-no-password',
            fullNameEn: dto.fullNameEn,
            fullNameAr: dto.fullNameAr,
            status: 'INVITED',
          },
        });
      }
      return created;
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'user.invited',
      targetType: 'INVITATION',
      targetId: invitation.id,
      summary: `Invited ${email} as ${role.nameEn}`,
      metadata: { roleId: role.id, branchIds },
    });

    return {
      id: invitation.id,
      email,
      companyId,
      roleId: role.id,
      roleNameEn: role.nameEn,
      branchIds,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      invitedByEmail: null,
      // Returned exactly once; only the hash is persisted.
      inviteToken: rawToken,
    };
  }

  async listInvitations(companyId: string, actor: ActorContext) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const invitations = await this.prisma.invitation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { role: true, branches: true, invitedBy: { select: { email: true } } },
    });
    return invitations.map((i) => ({
      id: i.id,
      email: i.email,
      companyId: i.companyId,
      companyNameEn: '',
      roleId: i.roleId,
      roleNameEn: i.role.nameEn,
      branchIds: i.branches.map((b) => b.branchId),
      status: i.status,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      invitedByEmail: i.invitedBy?.email ?? null,
    }));
  }

  async revokeInvitation(invitationId: string, actor: ActorContext) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Invitation not found.');
    if (actor.kind === 'COMPANY' && actor.companyId !== invitation.companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    await this.prisma.invitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: invitation.companyId,
      action: 'invitation.revoked',
      targetType: 'INVITATION',
      targetId: invitationId,
      summary: `Revoked invitation for ${invitation.email}`,
    });
    return { ok: true };
  }

  async updateMembership(companyId: string, userId: string, dto: UpdateMembershipDto, actor: ActorContext) {
    if (actor.kind === 'COMPANY' && actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!membership) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Membership not found.');
    if (userId === actor.userId && dto.isActive === false) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'You cannot deactivate your own membership.');
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({ where: { id: dto.roleId, companyId } });
      if (!role) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Role does not belong to this company.');
      const rolePermissions = (
        await this.prisma.rolePermission.findMany({ where: { roleId: role.id } })
      ).map((p) => p.permissionCode);
      await this.assertDelegation(companyId, actor, rolePermissions);
    }

    if (dto.branchIds) {
      const branches = await this.prisma.branch.findMany({ where: { id: { in: dto.branchIds } } });
      if (branches.length !== dto.branchIds.length) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'One or more branches were not found.');
      }
      for (const b of branches) {
        if (b.companyId !== companyId) {
          throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Branch belongs to another company.');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.roleId !== undefined || dto.isActive !== undefined) {
        await tx.membership.update({
          where: { id: membership.id },
          data: {
            ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
      }
      if (dto.branchIds) {
        await tx.membershipBranch.deleteMany({ where: { membershipId: membership.id } });
        if (dto.branchIds.length > 0) {
          await tx.membershipBranch.createMany({
            data: dto.branchIds.map((branchId) => ({ membershipId: membership.id, branchId })),
          });
        }
      }
    });

    if (dto.isActive === false) {
      // Removing access must also invalidate live sessions.
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'membership.updated',
      targetType: 'MEMBERSHIP',
      targetId: membership.id,
      summary: `Updated membership for user ${userId}`,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return this.effectivePermissions(companyId, userId, actor);
  }

  async setUserStatus(userId: string, status: string, actor: ActorContext) {
    if (actor.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Only a platform administrator may change global user status.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'User not found.');
    if (user.isSuperAdmin) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'Platform administrator accounts cannot be modified here.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { status: status as never } });
    if (status !== 'ACTIVE') {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'user.status_changed',
      targetType: 'USER',
      targetId: userId,
      summary: `User ${user.email} status set to ${status}`,
      metadata: { from: user.status, to: status },
    });
    return { ok: true };
  }
}
