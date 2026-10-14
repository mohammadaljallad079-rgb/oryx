import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { AuditService } from '../common/audit.service';
import { badRequest, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  group?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

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

@ApiTags('modules')
@ApiBearerAuth()
@Controller('modules')
export class ModulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'ERP module catalog with the caller\'s entitlement state' })
  async list(@CurrentPrincipal() principal: RequestPrincipal) {
    const modules = await this.prisma.module.findMany({ orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }] });
    const licensed = principal.company ? await this.entitlements.licensedModulesFor(principal.company.companyId) : [];
    const licensedSet = new Set(licensed);
    return {
      items: modules.map((m) => ({
        id: m.id,
        key: m.key,
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        descriptionEn: m.descriptionEn,
        descriptionAr: m.descriptionAr,
        group: m.group,
        icon: m.icon,
        route: m.route,
        status: m.status,
        deliveryPhase: m.deliveryPhase,
        readPermission: m.readPermission,
        writePermission: m.writePermission,
        licensed: principal.kind === 'PLATFORM' && !principal.company ? true : licensedSet.has(m.key),
      })),
    };
  }

  @Get('entitlements')
  @RequireAnyPermission('platform.subscription.manage', 'company.subscription.read')
  @ApiOperation({ summary: 'Effective module entitlements and plan limits for a company' })
  async companyEntitlements(
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    const scope = principal.kind === 'COMPANY' ? principal.company?.companyId : companyId;
    if (!scope) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'companyId is required.');
    if (principal.kind === 'COMPANY' && companyId && companyId !== scope) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
    const ent = await this.entitlements.forCompany(scope);
    const usage = await this.entitlements.usageFor(scope);
    return { ...ent, usage };
  }

  @Patch(':id')
  @RequirePermissions('platform.module.manage')
  @ApiOperation({ summary: 'Update a module catalog entry (platform only)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateModuleDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const module = await this.prisma.module.findUnique({ where: { id } });
    if (!module) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Module not found.');
    const updated = await this.prisma.module.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.group !== undefined ? { group: dto.group } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.route !== undefined ? { route: dto.route } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'module.updated',
      targetType: 'MODULE',
      targetId: id,
      summary: `Updated module ${updated.key}`,
      metadata: dto as unknown as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return updated;
  }
}
