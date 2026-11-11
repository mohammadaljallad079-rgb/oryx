import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { AuditService } from '../common/audit.service';
import { forbidden, ERROR_CODES } from '../common/errors';

class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequireAnyPermission('platform.audit.read', 'company.audit.read')
  @ApiOperation({ summary: 'Read the audit trail within the caller\'s authorized scope' })
  async list(@Query() query: AuditQueryDto, @CurrentPrincipal() principal: RequestPrincipal) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const companyId =
      principal.kind === 'COMPANY' ? principal.company?.companyId : query.companyId;

    if (principal.kind === 'COMPANY' && query.companyId && query.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }

    const { items, total } = await this.audit.list({
      companyId: companyId ?? null,
      action: query.action,
      targetType: query.targetType,
      actorUserId: query.actorUserId,
      search: query.search,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page,
      pageSize,
    });

    return {
      items: items.map((i) => ({
        id: i.id,
        actorUserId: i.actorUserId,
        actorEmail: i.actor?.email ?? null,
        companyId: i.companyId,
        action: i.action,
        targetType: i.targetType,
        targetId: i.targetId,
        summary: i.summary,
        ipAddress: i.ipAddress,
        createdAt: i.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}
