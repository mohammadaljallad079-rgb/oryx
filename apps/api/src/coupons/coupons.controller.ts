import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentPrincipal,
  PlatformOnly,
  Public,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { AuditService } from '../common/audit.service';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './coupons.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Platform discount coupons.
 *
 * Authoring is a Super Admin action (`platform.coupon.manage`). Validation is
 * public because the checkout on the consumer plane calls it before a customer
 * has any staff identity; it returns only whether a code applies and what it is
 * worth, never the coupon catalogue.
 */
@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly coupons: CouponsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @PlatformOnly()
  @RequireAnyPermission('platform.coupon.read', 'platform.coupon.manage')
  @ApiOperation({ summary: 'List coupons' })
  async list(@Query('includeInactive') includeInactive?: string, @Query('companyId') companyId?: string) {
    return {
      items: await this.coupons.list({
        includeInactive: includeInactive === 'true',
        companyId: companyId || undefined,
      }),
    };
  }

  @Get(':id')
  @PlatformOnly()
  @RequireAnyPermission('platform.coupon.read', 'platform.coupon.manage')
  @ApiOperation({ summary: 'Read one coupon' })
  async get(@Param('id') id: string) {
    return this.coupons.get(id);
  }

  @Post()
  @PlatformOnly()
  @RequirePermissions('platform.coupon.manage')
  @ApiOperation({ summary: 'Create a coupon' })
  async create(
    @Body() dto: CreateCouponDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const created = await this.coupons.create({ ...dto, createdById: principal.userId });
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'platform.coupon.created',
      targetType: 'COUPON',
      targetId: created.id,
      summary: `Created coupon ${created.code}`,
      metadata: { discountType: created.discountType, percentOffBp: created.percentOffBp },
      ipAddress: req.ip,
    });
    return created;
  }

  @Patch(':id')
  @PlatformOnly()
  @RequirePermissions('platform.coupon.manage')
  @ApiOperation({ summary: 'Update a coupon' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const updated = await this.coupons.update(id, dto);
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'platform.coupon.updated',
      targetType: 'COUPON',
      targetId: id,
      summary: `Updated coupon ${updated.code}`,
      metadata: dto as unknown as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return updated;
  }

  @Delete(':id')
  @PlatformOnly()
  @RequirePermissions('platform.coupon.manage')
  @ApiOperation({ summary: 'Delete a coupon' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    await this.coupons.remove(id);
    await this.audit.record({
      actorUserId: principal.userId,
      action: 'platform.coupon.deleted',
      targetType: 'COUPON',
      targetId: id,
      summary: 'Deleted a coupon',
      ipAddress: req.ip,
    });
    return { deleted: true };
  }

  @Post('validate')
  @Public()
  @ApiOperation({ summary: 'Validate a coupon code against a subtotal (public)' })
  async validate(@Body() dto: ValidateCouponDto) {
    return this.coupons.validate(dto.code, {
      companyId: dto.companyId ?? null,
      subtotalMinor: dto.subtotalMinor,
    });
  }
}
