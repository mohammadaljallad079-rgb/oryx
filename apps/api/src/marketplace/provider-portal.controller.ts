import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/auth.decorators';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentPrincipal, type RequestPrincipal } from '../auth/auth.decorators';
import { MarketplaceService } from './marketplace.service';
import { CustomerOrderService } from './customer-order.service';
import { DocumentsService } from '../documents/documents.service';
import { actorFrom } from '../common/erp-context.service';
import { ERROR_CODES, notFound } from '../common/errors';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}
import {
  CancelRequestDto,
  CompleteServiceRequestDto,
  DeclineRequestDto,
  DisputeMessageDto,
  OrderStatusDto,
  ProviderListingDto,
  ProviderOfferDto,
  ReviewReplyDto,
  SetAvailabilityDto,
  UpdateProviderListingDto,
  UpdateProviderOfferDto,
  UpdateProviderProfileDto,
} from './marketplace.dto';

/**
 * The provider portal.
 *
 * ## Isolation
 *
 * The provider a request acts on is resolved from `ProviderUser` membership for
 * the authenticated staff user — never from the URL. A provider id in the path
 * is treated as a *claim* and is checked against membership by
 * `resolveProviderForUser`, so a provider user cannot read or change another
 * provider's bookings, listings, earnings or disputes.
 *
 * Provider users are staff accounts with marketplace permissions. They are not
 * consumer accounts, because a provider operates a business and must be subject
 * to the staff audit and session rules.
 */
@ApiTags('provider-portal')
@ApiBearerAuth()
@Controller('provider')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class ProviderPortalController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly orders: CustomerOrderService,
    private readonly documents: DocumentsService,
  ) {}

  /** Resolve and authorise the provider this request acts for. */
  private async provider(principal: RequestPrincipal, claimedId?: string) {
    return this.marketplace.resolveProviderForUser(principal.userId, claimedId);
  }

  @Get('profile')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Read the provider profile' })
  async profile(@CurrentPrincipal() principal: RequestPrincipal) {
    const provider = await this.provider(principal);
    return provider;
  }

  @Patch('profile')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Update the provider profile' })
  async updateProfile(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Body() dto: UpdateProviderProfileDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.updateProviderProfile(provider.id, dto);
  }

  // ---------------------------------------------------------------- listings

  @Get('listings')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List the provider service listings' })
  async listListings(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.listListings(provider.id, includeInactive === 'true');
  }

  @Post('listings')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Create a service listing' })
  async createListing(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Body() dto: ProviderListingDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.createListing(provider.id, dto);
  }

  @Patch('listings/:id')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Update a service listing' })
  async updateListing(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateProviderListingDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.updateListing(provider.id, id, dto);
  }

  // ---------------------------------------------------------------- offers

  @Get('offers')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List the provider promotional offers' })
  async listOffers(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.listOffers(provider.id, includeInactive === 'true');
  }

  @Post('offers')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Publish a promotional offer' })
  async createOffer(@CurrentPrincipal() principal: RequestPrincipal, @Body() dto: ProviderOfferDto) {
    const provider = await this.provider(principal);
    return this.marketplace.createOffer(provider.id, dto);
  }

  @Patch('offers/:id')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Update or withdraw a promotional offer' })
  async updateOffer(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateProviderOfferDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.updateOffer(provider.id, id, dto);
  }

  // ------------------------------------------------------------ availability

  @Get('availability')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Read the weekly availability' })
  async availability(@CurrentPrincipal() principal: RequestPrincipal) {
    const provider = await this.provider(principal);
    return this.marketplace.getAvailability(provider.id);
  }

  @Post('availability')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Replace the weekly availability' })
  async setAvailability(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Body() dto: SetAvailabilityDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.setAvailability(provider.id, dto.hours);
  }

  // ---------------------------------------------------------- service requests

  @Get('requests')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List requests offered to or assigned to the provider' })
  async listRequests(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.listProviderRequests(provider.id, {
      status,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Accept an offered request' })
  async accept(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.acceptRequest(provider.id, id, principal.userId);
  }

  @Post('requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Decline an offered request' })
  async decline(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: DeclineRequestDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.declineRequest(provider.id, id, dto.reason, principal.userId);
  }

  @Post('requests/:id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Start work on an assigned request' })
  async start(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    const provider = await this.provider(principal);
    return this.marketplace.startRequest(provider.id, id);
  }

  @Post('requests/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Complete a request and record the commission' })
  async complete(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: CompleteServiceRequestDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.completeRequest(provider.id, id, dto, principal.userId);
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Release an assigned request' })
  async cancel(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.cancelRequest(
      id,
      dto.reason,
      'PROVIDER',
      provider.id,
    );
  }

  // -------------------------------------------------------------- earnings

  @Get('earnings')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Earnings summary: pending, awaiting payment and paid' })
  async earnings(@CurrentPrincipal() principal: RequestPrincipal) {
    const provider = await this.provider(principal);
    return this.marketplace.providerEarnings(provider.id);
  }

  @Get('settlements')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'List the provider settlements' })
  async settlements(@CurrentPrincipal() principal: RequestPrincipal) {
    const provider = await this.provider(principal);
    return this.marketplace.listSettlements(provider.id);
  }

  // ---------------------------------------------------------------- reviews

  @Get('reviews')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List reviews received by the provider' })
  async reviews(@CurrentPrincipal() principal: RequestPrincipal) {
    const provider = await this.provider(principal);
    return this.marketplace.listProviderReviews(provider.id);
  }

  @Post('reviews/:id/reply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Reply to a review' })
  async reply(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: ReviewReplyDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.replyToReview(provider.id, id, dto.reply);
  }

  // --------------------------------------------------------------- disputes

  @Get('disputes')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List complaints against the provider' })
  async disputes(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.listDisputes({
      providerId: provider.id,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }

  @Post('disputes/:id/messages')
  @RequirePermissions('erp.provider_portal.read')
  @ApiOperation({ summary: 'Add a message to a complaint thread' })
  async disputeMessage(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: DisputeMessageDto,
  ) {
    const provider = await this.provider(principal);
    return this.marketplace.addDisputeMessage({
      disputeId: id,
      authorKind: 'PROVIDER',
      authorId: provider.id,
      body: dto.body,
      // A provider can never post a platform-internal note.
      isInternal: false,
    });
  }

  // ----------------------------------------------------------------- orders

  /**
   * Consumer orders placed against the provider's own catalogue.
   *
   * The company is resolved from the provider's membership, so a merchant sees
   * only orders for its own tenant. A merchant with no linked company sees an
   * empty list rather than every order on the platform.
   */
  @Get('orders')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List consumer orders for the provider company' })
  async listOrders(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
  ) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) {
      return { items: [], total: 0, page: 1, pageSize: 20 };
    }
    return this.orders.listForCompany(provider.providerCompanyId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
      status,
    });
  }

  @Get('orders/:id')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Read one consumer order for the provider company' })
  async order(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    return this.orders.getForCompany(provider.providerCompanyId, id);
  }

  @Post('orders/:id/status')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Advance a consumer order through its status machine' })
  async setOrderStatus(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Body() dto: OrderStatusDto,
  ) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    return this.orders.transition(id, dto.status, 'MERCHANT', dto.note ?? null, {
      companyId: provider.providerCompanyId,
    });
  }

  // -------------------------------------------------------------- documents

  /**
   * The merchant's own issued documents.
   *
   * A merchant reads the official documents — invoices, quotations, receipts,
   * inspection reports — that the platform issued for *its* company. The company
   * comes from `ProviderUser` membership, never from the URL, so one provider
   * can never list another provider's documents. A provider with no linked
   * company sees an empty register rather than the whole platform's.
   */
  @Get('documents')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'List the issued documents for the provider company' })
  async listDocuments(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) {
      return { items: [], total: 0, page: 1, pageSize: 20 };
    }
    return this.documents.listForCompany(provider.providerCompanyId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
      search,
      type,
      status,
      sourceType,
    });
  }

  @Get('documents/:id')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Read one issued document with its trail' })
  async getDocument(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    }
    return this.documents.getForCompany(provider.providerCompanyId, id);
  }

  @Get('documents/:id/verification')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'The QR verification view for one document' })
  async verifyDocument(@CurrentPrincipal() principal: RequestPrincipal, @Param('id') id: string) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    }
    return this.documents.verifyForCompany(provider.providerCompanyId, id);
  }

  /**
   * The stored PDF for one of the provider company's documents.
   *
   * Served inline so a merchant can preview and print it in the browser. The
   * company scope is applied inside `downloadForCompany`, so the file of another
   * tenant is a `404`, not a leaked download.
   */
  @Get('documents/:id/file')
  @RequirePermissions('erp.provider_portal.manage')
  @ApiOperation({ summary: 'Download the stored PDF for the provider company' })
  async documentFile(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Param('id') id: string,
    @Req() req: RequestLike,
    @Res() res: Response,
  ) {
    const provider = await this.provider(principal);
    if (!provider.providerCompanyId) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    }
    const { bytes, filename, contentType } = await this.documents.downloadForCompany(
      provider.providerCompanyId,
      id,
      actorFrom(principal, req),
      req,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(bytes);
  }
}
