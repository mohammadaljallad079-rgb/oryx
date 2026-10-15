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
import { Public, RequirePermissions } from '../auth/auth.decorators';
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
  ) {
    return this.marketplace.listPublicProviders({
      categoryKey,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
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
