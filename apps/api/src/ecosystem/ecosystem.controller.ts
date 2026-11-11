import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/auth.decorators';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentPrincipal, type RequestPrincipal } from '../auth/auth.decorators';
import { EcosystemService } from './ecosystem.service';
import { AdvanceRecoveryDto, DecideReturnDto, ReviewAiSuggestionDto, SubmitRfqQuoteDto } from './ecosystem.dto';

/**
 * Provider-side ecosystem surface (P4–P7).
 *
 * The provider a request acts for is resolved from `ProviderUser` membership for
 * the authenticated staff user, never from the URL, so a provider user cannot
 * read or act on another provider's RFQ quotes or recovery jobs.
 */
@ApiTags('provider-ecosystem')
@ApiBearerAuth()
@Controller('provider')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class ProviderEcosystemController {
  constructor(private readonly ecosystem: EcosystemService) {}

  // ------------------------------------------------------------- P4 RFQ quotes

  @Get('rfqs')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Open consumer requests for quotation' })
  async listRfqs(@CurrentPrincipal() principal: RequestPrincipal) {
    return this.ecosystem.listProviderRfqs(principal.userId);
  }

  @Post('rfqs/:id/quotes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Submit a quote on a consumer request' })
  async submitQuote(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: SubmitRfqQuoteDto,
  ) {
    return this.ecosystem.submitRfqQuote(principal.userId, id, {
      priceMinor: dto.priceMinor,
      leadTimeDays: dto.leadTimeDays ?? null,
      note: dto.note ?? null,
    });
  }

  @Get('quotes')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Your submitted quotes' })
  async listQuotes(@CurrentPrincipal() principal: RequestPrincipal) {
    return this.ecosystem.listProviderQuotes(principal.userId);
  }

  @Post('quotes/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Withdraw a submitted quote' })
  async withdrawQuote(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    return this.ecosystem.withdrawRfqQuote(principal.userId, id);
  }

  // ------------------------------------------------------------- P5 recovery

  @Get('recovery')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Recovery jobs assigned to your provider' })
  async listRecovery(@CurrentPrincipal() principal: RequestPrincipal) {
    return this.ecosystem.listProviderRecoveryRequests(principal.userId);
  }

  @Post('recovery/:id/advance')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Advance a recovery job you are assigned to' })
  async advanceRecovery(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: AdvanceRecoveryDto,
  ) {
    return this.ecosystem.advanceRecovery(principal.userId, id, {
      status: dto.status,
      note: dto.note ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });
  }
}

/**
 * Staff-side ecosystem surface (P4–P7).
 *
 * Returns queue, recovery dispatch and AI suggestion review. Every route is
 * gated by a permission and scoped to the active company from the principal, so
 * an operator only sees their own tenant's rows.
 */
@ApiTags('ecosystem-admin')
@ApiBearerAuth()
@Controller('ecosystem')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class EcosystemAdminController {
  constructor(private readonly ecosystem: EcosystemService) {}

  // -------------------------------------------------------------- P4 returns

  @Get('returns')
  @RequirePermissions('erp.customer_portal.read')
  @ApiOperation({ summary: 'Consumer return queue' })
  async listReturns(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('status') status?: string,
  ) {
    return this.ecosystem.listCompanyReturns(principal.activeCompanyId ?? null, status);
  }

  @Post('returns/:id/decide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.customer_portal.manage')
  @ApiOperation({ summary: 'Approve or reject a consumer return' })
  async decideReturn(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: DecideReturnDto,
  ) {
    return this.ecosystem.decideReturn(id, dto.decision, dto.note ?? '', principal.userId);
  }

  @Post('returns/:id/receive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.customer_portal.manage')
  @ApiOperation({ summary: 'Receive returned goods into stock' })
  async receiveReturn(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    return this.ecosystem.receiveReturn(id, principal.userId);
  }

  @Post('returns/:id/refund')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.customer_portal.manage')
  @ApiOperation({ summary: 'Mark a received return as refunded' })
  async refundReturn(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    return this.ecosystem.refundReturn(id, principal.userId);
  }

  // ------------------------------------------------------------- P5 recovery

  @Get('recovery')
  @RequirePermissions('erp.marketplace.request.manage')
  @ApiOperation({ summary: 'Recovery dispatch queue' })
  async listRecovery(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('status') status?: string,
  ) {
    return this.ecosystem.listCompanyRecoveryRequests(principal.activeCompanyId ?? null, status);
  }

  @Post('recovery/:id/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.marketplace.request.manage')
  @ApiOperation({ summary: 'Assign a provider to a recovery request' })
  async assignRecovery(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() body: { providerId: string },
  ) {
    return this.ecosystem.assignRecovery(id, body.providerId, principal.userId);
  }

  // ------------------------------------------------------------ P7 SENSAGE AI

  @Get('sensage/suggestions')
  @RequirePermissions('erp.customer_portal.read')
  @ApiOperation({ summary: 'AI suggestion review queue' })
  async listSuggestions(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('status') status?: string,
  ) {
    return this.ecosystem.listCompanySuggestions(principal.activeCompanyId ?? null, status);
  }

  @Post('sensage/suggestions/:id/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.customer_portal.manage')
  @ApiOperation({ summary: 'Approve or reject an AI suggestion' })
  async reviewSuggestion(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: ReviewAiSuggestionDto,
  ) {
    return this.ecosystem.reviewSuggestion(id, dto.decision, dto.note ?? '', principal.userId);
  }
}
