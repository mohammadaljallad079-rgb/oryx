import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, PERMISSION_GROUPS } from '@oryx/shared';
import {
  CurrentPrincipal,
  PlatformOnly,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { RbacService } from './rbac.service';
import type { ActorContext } from '../organizations/organizations.service';
import {
  AssignPermissionsDto,
  CreateRoleDto,
  InviteUserDto,
  UpdateMembershipDto,
  UpdateRoleDto,
  UpdateUserStatusDto,
} from './rbac.dto';
import { PrismaService } from '../common/prisma.service';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

function actorFrom(principal: RequestPrincipal, req: RequestLike): ActorContext {
  const ua = req.headers['user-agent'];
  return {
    userId: principal.userId,
    kind: principal.kind,
    companyId: principal.company?.companyId,
    isSuperAdmin: principal.kind === 'PLATFORM',
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

/** Resolves the company scope for a route, rejecting cross-tenant access. */
function resolveCompanyId(principal: RequestPrincipal, routeCompanyId?: string): string {
  const own = principal.company?.companyId;
  if (principal.kind === 'COMPANY') {
    if (routeCompanyId && routeCompanyId !== own) {
      // PermissionsGuard/guard already rejects, but keep a defence in depth.
      throw new Error('cross-tenant route resolution');
    }
    if (!own) throw new Error('no company scope');
    return own;
  }
  if (!routeCompanyId) throw new Error('platform requests must specify a company');
  return routeCompanyId;
}

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  @Get('catalog')
  @ApiOperation({ summary: 'Full permission catalog with scope and delegability metadata' })
  catalog() {
    return {
      groups: PERMISSION_GROUPS,
      permissions: PERMISSIONS.map((p) => ({
        code: p.code,
        group: p.group,
        labelEn: p.labelEn,
        labelAr: p.labelAr,
        scope: p.scope,
        delegable: p.delegable,
        moduleKey: p.moduleKey ?? null,
        descriptionEn: p.descriptionEn,
      })),
    };
  }

  @Get('delegable')
  @RequireAnyPermission('platform.company.read', 'company.role.read')
  @ApiOperation({ summary: 'Permissions the current principal may delegate in a company' })
  async delegable(
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const scope = resolveCompanyId(p, companyId);
    const codes = await this.rbac.delegablePermissions(scope, actorFrom(p, req));
    return { companyId: scope, permissions: codes };
  }

  constructor(private readonly rbac: RbacService) {}
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('companies/:companyId/roles')
export class RolesController {
  constructor(private readonly rbac: RbacService) {}

  @Get()
  @RequireAnyPermission('platform.company.read', 'company.role.read')
  @ApiOperation({ summary: 'List roles in a company' })
  list(@Param('companyId') companyId: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.rbac.listRoles(companyId, actorFrom(p, req));
  }

  @Post()
  @RequireAnyPermission('platform.company.update', 'company.role.create')
  @ApiOperation({ summary: 'Create a company role within delegable scope' })
  create(
    @Param('companyId') companyId: string,
    @Body() dto: CreateRoleDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.rbac.createRole(companyId, dto, actorFrom(p, req));
  }
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RoleDetailController {
  constructor(private readonly rbac: RbacService) {}

  @Patch(':id')
  @RequireAnyPermission('platform.company.update', 'company.role.update')
  @ApiOperation({ summary: 'Update a custom role and its permissions' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.rbac.updateRole(id, dto, actorFrom(p, req));
  }

  @Delete(':id')
  @RequireAnyPermission('platform.company.update', 'company.role.delete')
  @ApiOperation({ summary: 'Delete an unassigned custom role' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.rbac.deleteRole(id, actorFrom(p, req));
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('companies/:companyId/users')
export class CompanyUsersController {
  constructor(
    private readonly rbac: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequireAnyPermission('platform.user.read', 'company.user.read')
  @ApiOperation({ summary: 'List company users with roles and branch scope' })
  async list(
    @Param('companyId') companyId: string,
    @Query() query: { page?: number; pageSize?: number; search?: string; status?: string },
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const result = await this.rbac.listUsers(companyId, query, actorFrom(p, req));
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { nameEn: true, nameAr: true, type: true, status: true },
    });
    return {
      ...result,
      items: result.items.map((u) => ({
        ...u,
        memberships: u.memberships.map((m) => ({
          ...m,
          companyNameEn: company?.nameEn ?? '',
          companyNameAr: company?.nameAr ?? '',
          companyType: company?.type,
          companyStatus: company?.status,
        })),
      })),
    };
  }

  @Post('invitations')
  @RequireAnyPermission('platform.user.manage', 'company.user.invite')
  @ApiOperation({ summary: 'Invite a user to the company with a delegated role and branch scope' })
  invite(
    @Param('companyId') companyId: string,
    @Body() dto: InviteUserDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.rbac.inviteUser(companyId, dto, actorFrom(p, req));
  }

  @Get('invitations')
  @RequireAnyPermission('platform.user.read', 'company.user.read')
  @ApiOperation({ summary: 'List invitations for a company' })
  invitations(@Param('companyId') companyId: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.rbac.listInvitations(companyId, actorFrom(p, req));
  }

  @Get(':userId/effective-permissions')
  @RequireAnyPermission('platform.user.read', 'company.user.read')
  @ApiOperation({ summary: 'Effective permissions, entitlement suppression and branch scope for a user' })
  effective(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.rbac.effectivePermissions(companyId, userId, actorFrom(p, req));
  }

  @Patch(':userId/membership')
  @RequireAnyPermission('platform.user.manage', 'company.user.update')
  @ApiOperation({ summary: 'Change role, branch scope or active state of a membership' })
  updateMembership(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMembershipDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.rbac.updateMembership(companyId, userId, dto, actorFrom(p, req));
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly rbac: RbacService) {}

  @Post(':id/revoke')
  @RequireAnyPermission('platform.user.manage', 'company.user.remove')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revoke(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.rbac.revokeInvitation(id, actorFrom(p, req));
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly rbac: RbacService) {}

  @Patch(':id/status')
  @PlatformOnly()
  @ApiOperation({ summary: 'Enable, suspend or disable a user account (platform only)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.rbac.setUserStatus(id, dto.status, actorFrom(p, req));
  }
}
