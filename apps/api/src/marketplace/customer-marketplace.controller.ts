import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerPlane } from '../auth/auth.decorators';
import { CustomerAuthGuard, CurrentCustomer, type CustomerPrincipal } from '../customer/customer-auth.guard';
import { MarketplaceService } from './marketplace.service';
import {
  CancelRequestDto,
  CreateReviewDto,
  CreateServiceRequestDto,
  DisputeMessageDto,
  OpenDisputeDto,
} from './marketplace.dto';

/**
 * The customer side of the marketplace: service requests, reviews and complaints.
 *
 * Every route is scoped to the authenticated consumer account. A customer id is
 * never read from the request, so one customer cannot act on another's request,
 * review or dispute.
 */
@ApiTags('customer-marketplace')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/marketplace')
@UseGuards(CustomerAuthGuard)
export class CustomerMarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Post('requests')
  @ApiOperation({ summary: 'Raise a service request' })
  async createRequest(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CreateServiceRequestDto,
  ) {
    const companyId = await this.marketplace.resolveRequestCompany(
      dto.companyId ?? customer.defaultCompanyId,
    );
    return this.marketplace.createServiceRequest({
      companyId,
      customerAccountId: customer.accountId,
      categoryKey: dto.categoryKey,
      description: dto.description,
      vehicleId: dto.vehicleId ?? null,
      createdById: customer.accountId,
    });
  }

  @Get('requests')
  @ApiOperation({ summary: 'List your service requests' })
  async listRequests(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.marketplace.listCustomerRequests(customer.accountId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel your own service request' })
  async cancelRequest(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
  ) {
    return this.marketplace.cancelRequest(id, dto.reason, 'CUSTOMER', customer.accountId, customer.accountId);
  }

  @Post('reviews')
  @ApiOperation({ summary: 'Review a completed service' })
  async createReview(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CreateReviewDto,
  ) {
    return this.marketplace.createReview({
      customerAccountId: customer.accountId,
      serviceRequestId: dto.serviceRequestId,
      rating: dto.rating,
      title: dto.title,
      comment: dto.comment,
    });
  }

  @Post('disputes')
  @ApiOperation({ summary: 'Open a complaint against a provider' })
  async openDispute(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: OpenDisputeDto) {
    return this.marketplace.openDispute({
      customerAccountId: customer.accountId,
      providerId: dto.providerId,
      subject: dto.subject,
      description: dto.description,
      serviceRequestId: dto.serviceRequestId ?? null,
      bookingSlotId: dto.bookingSlotId ?? null,
    });
  }

  @Get('disputes')
  @ApiOperation({ summary: 'List your complaints' })
  async listDisputes(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.marketplace.listDisputes({
      customerAccountId: customer.accountId,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }

  @Post('disputes/:id/messages')
  @ApiOperation({ summary: 'Add a message to your complaint thread' })
  async addMessage(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: DisputeMessageDto,
  ) {
    // A customer can never post an internal note, so `isInternal` is ignored.
    return this.marketplace.addDisputeMessage({
      disputeId: id,
      authorKind: 'CUSTOMER',
      authorId: customer.accountId,
      body: dto.body,
      isInternal: false,
    });
  }
}
