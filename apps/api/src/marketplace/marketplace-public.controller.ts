import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isValidLatitude, isValidLongitude } from '@oryx/shared';
import { Public, RequirePermissions } from '../auth/auth.decorators';
import { ERROR_CODES, badRequest } from '../common/errors';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentPrincipal, type RequestPrincipal } from '../auth/auth.decorators';
import { MarketplaceService } from './marketplace.service';
import {
  ApproveApplicationDto,
  BuildSettlementDto,
  ModerateReviewDto,
  ProviderApplicationDto,
  RejectApplicationDto,
  SetProviderImageDto,
  SetProviderLocationDto,
} from './marketplace.dto';

interface RequestLike {
  ip?: string;
}

/**
 * Public marketplace surfaces: the provider directory and provider applications.
 *
 * The directory exposes approved providers and published reviews only. Nothing
 * here reveals commission rates, settlements or applicant contact details.
 */
@ApiTags('marketplace-public')
@Controller('marketplace')
export class MarketplacePublicController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Browse approved service providers' })
  async listProviders(
    @Query('categoryKey') categoryKey?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    // Auto Map discovery (P3). Coordinates are optional; when one of them is
    // supplied both must be valid, because half a coordinate silently degrades
    // to an alphabetical list that looks like a proximity result.
    const hasLat = lat !== undefined && lat !== '';
    const hasLng = lng !== undefined && lng !== '';
    let origin: { latitude: number; longitude: number } | undefined;
    if (hasLat || hasLng) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
        throw badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          'A proximity query needs a valid lat and lng together.',
        );
      }
      origin = { latitude, longitude };
    }

    let radius: number | undefined;
    if (radiusKm !== undefined && radiusKm !== '') {
      const parsed = Number(radiusKm);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'radiusKm must be between 0 and 500.');
      }
      radius = parsed;
    }

    return this.marketplace.listPublicProviders({
      categoryKey,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
      origin,
      radiusKm: radius,
    });
  }

  @Public()
  @Get('providers/:id')
  @ApiOperation({ summary: 'Read a provider profile with listings and reviews' })
  async getProvider(@Param('id') id: string) {
    return this.marketplace.getPublicProvider(id);
  }

  /**
   * Submit a provider application.
   *
   * Public by design: a business applies before it has an ORYX account. The
   * application grants no access; approval is what creates the provider.
   */
  @Public()
  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply to become a marketplace provider' })
  async apply(@Body() dto: ProviderApplicationDto, @Req() _req: RequestLike) {
    return this.marketplace.submitApplication(dto);
  }
}

/**
 * Platform administration of the marketplace.
 *
 * Approval, commission rates and settlements are platform decisions, so every
 * route requires a platform permission rather than a tenant one.
 */
@ApiTags('marketplace-admin')
@ApiBearerAuth()
@Controller('marketplace/admin')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class MarketplaceAdminController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('applications')
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'List provider applications' })
  async listApplications(@Query('status') status?: string) {
    return this.marketplace.listApplications(status);
  }

  @Post('applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Approve an application and set the commission rate' })
  async approveApplication(
    @Param('id') id: string,
    @Body() dto: ApproveApplicationDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.marketplace.approveApplication(id, dto, principal.userId);
  }

  @Post('applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Reject a provider application' })
  async rejectApplication(
    @Param('id') id: string,
    @Body() dto: RejectApplicationDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.marketplace.rejectApplication(id, dto.note, principal.userId);
  }

  @Post('providers/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Suspend a provider' })
  async suspendProvider(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.marketplace.setProviderStatus(id, 'SUSPENDED', principal.userId);
  }

  @Post('providers/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Reinstate a suspended provider' })
  async reinstateProvider(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.marketplace.setProviderStatus(id, 'APPROVED', principal.userId);
  }

  @Post('providers/:id/image')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Set or clear a provider storefront photograph' })
  async setProviderImage(
    @Param('id') id: string,
    @Body() dto: SetProviderImageDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.marketplace.setProviderImage(id, dto.imageAssetId ?? null, principal.userId);
  }

  @Post('providers/:id/location')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Set or clear a provider Auto Map location' })
  async setProviderLocation(
    @Param('id') id: string,
    @Body() dto: SetProviderLocationDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    const hasLat = dto.latitude !== undefined && dto.latitude !== null;
    const hasLng = dto.longitude !== undefined && dto.longitude !== null;
    if (hasLat !== hasLng) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Supply latitude and longitude together, or omit both to clear the location.',
      );
    }
    return this.marketplace.setProviderLocation(
      id,
      { latitude: hasLat ? (dto.latitude as number) : null, longitude: hasLng ? (dto.longitude as number) : null },
      principal.userId,
    );
  }

  @Post('reviews/:id/moderate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Publish, hide or reject a review' })
  async moderateReview(
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.marketplace.moderateReview(id, dto.status, dto.note ?? '', principal.userId);
  }

  @Post('settlements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('erp.marketplace.commission.manage')
  @ApiOperation({ summary: 'Build a settlement draft for a provider period' })
  async buildSettlement(
    @Body() dto: BuildSettlementDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.marketplace.buildSettlement({
      providerId: dto.providerId,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      actorId: principal.userId,
    });
  }

  @Post('settlements/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.commission.manage')
  @ApiOperation({ summary: 'Approve a settlement and post the commission journal' })
  async approveSettlement(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.marketplace.approveSettlement(id, principal.userId);
  }

  @Post('settlements/:id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.commission.manage')
  @ApiOperation({ summary: 'Mark an approved settlement as paid' })
  async paySettlement(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.marketplace.markSettlementPaid(id, principal.userId);
  }

  @Get('providers/:id/settlements')
  @RequirePermissions('erp.marketplace.commission.manage')
  @ApiOperation({ summary: 'List a provider settlements' })
  async listSettlements(@Param('id') id: string) {
    return this.marketplace.listSettlements(id);
  }
}
