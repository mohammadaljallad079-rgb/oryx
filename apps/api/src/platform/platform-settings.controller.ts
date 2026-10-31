import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import {
  CurrentPrincipal,
  PlatformOnly,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { AuditService } from '../common/audit.service';
import { badRequest, ERROR_CODES, notFound } from '../common/errors';
import { PlatformSettingsService, PLATFORM_SETTING_KEYS } from './platform-settings.service';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /**
   * Basis points, matching every other percentage in the platform. Zero is
   * valid and means "no default VAT is applied".
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultVatRateBp?: number;
}

export class CreateServiceAreaDto {
  @IsString()
  @MaxLength(16)
  code!: string;

  @IsString()
  @MaxLength(120)
  nameEn!: string;

  @IsString()
  @MaxLength(120)
  nameAr!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateServiceAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameAr?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
export class PlatformSettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  @PlatformOnly()
  @RequireAnyPermission('platform.settings.read', 'platform.settings.manage')
  @ApiOperation({ summary: 'Effective platform market settings' })
  async readSettings() {
    return { settings: await this.settings.effectiveSettings() };
  }

  @Patch('settings')
  @PlatformOnly()
  @RequirePermissions('platform.settings.manage')
  @ApiOperation({ summary: 'Update platform market settings' })
  async updateSettings(
    @Body() dto: UpdatePlatformSettingsDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const updates: Array<[string, unknown]> = [];
    if (dto.countryCode !== undefined) updates.push([PLATFORM_SETTING_KEYS.marketCountry, dto.countryCode.toUpperCase()]);
    if (dto.currency !== undefined) updates.push([PLATFORM_SETTING_KEYS.marketCurrency, dto.currency.toUpperCase()]);
    if (dto.timezone !== undefined) updates.push([PLATFORM_SETTING_KEYS.marketTimezone, dto.timezone]);
    if (dto.defaultVatRateBp !== undefined) updates.push([PLATFORM_SETTING_KEYS.defaultVatRateBp, dto.defaultVatRateBp]);

    if (updates.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No settings were supplied.');
    }

    for (const [key, value] of updates) {
      await this.settings.setSetting(key as never, value);
    }

    await this.audit.record({
      actorUserId: principal.userId,
      action: 'platform.settings.updated',
      targetType: 'PLATFORM_SETTING',
      targetId: updates.map(([k]) => k).join(','),
      summary: `Updated ${updates.length} platform setting(s)`,
      metadata: Object.fromEntries(updates),
      ipAddress: req.ip,
    });

    return { settings: await this.settings.effectiveSettings() };
  }

  @Get('service-areas')
  @RequireAnyPermission('platform.settings.read', 'platform.settings.manage')
  @ApiOperation({ summary: 'Service-area catalogue' })
  async listServiceAreas(@Query('includeInactive') includeInactive?: string) {
    return {
      items: await this.settings.listServiceAreas({ includeInactive: includeInactive === 'true' }),
    };
  }

  @Post('service-areas')
  @PlatformOnly()
  @RequirePermissions('platform.settings.manage')
  @ApiOperation({ summary: 'Add a service area' })
  async createServiceArea(
    @Body() dto: CreateServiceAreaDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const created = await this.settings.createServiceArea(dto);
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'platform.service_area.created',
      targetType: 'SERVICE_AREA',
      targetId: created.id,
      summary: `Created service area ${created.code}`,
      ipAddress: req.ip,
    });
    return created;
  }

  @Patch('service-areas/:id')
  @PlatformOnly()
  @RequirePermissions('platform.settings.manage')
  @ApiOperation({ summary: 'Update a service area' })
  async updateServiceArea(
    @Param('id') id: string,
    @Body() dto: UpdateServiceAreaDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const updated = await this.settings.updateServiceArea(id, dto);
    if (!updated) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service area not found.');
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'platform.service_area.updated',
      targetType: 'SERVICE_AREA',
      targetId: id,
      summary: `Updated service area ${updated.code}`,
      metadata: dto as unknown as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return updated;
  }
}
