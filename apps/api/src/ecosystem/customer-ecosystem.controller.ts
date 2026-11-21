import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerPlane } from '../auth/auth.decorators';
import { CustomerAuthGuard, CurrentCustomer, type CustomerPrincipal } from '../customer/customer-auth.guard';
import { TenantCompanyService } from '../common/tenant-company.service';
import { EcosystemService } from './ecosystem.service';
import { SensageAiService } from './sensage-ai.service';
import {
  AddFleetVehicleDto,
  AnalyzePhotoDto,
  CancelRecoveryDto,
  CreateDriverDto,
  CreateFleetDto,
  CreateRecoveryRequestDto,
  CreateReturnDto,
  CreateRfqDto,
  SetDriverActiveDto,
} from './ecosystem.dto';

/**
 * The consumer-facing ecosystem surface (P4–P7).
 *
 * Every route is on the customer plane and requires a consumer access token. The
 * account id comes from the verified token, never from the path or the body, so
 * one consumer can never read or change another's RFQs, returns, recovery
 * requests or fleets.
 */
@ApiTags('customer-ecosystem')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer')
@UseGuards(CustomerAuthGuard)
export class CustomerEcosystemController {
  constructor(
    private readonly ecosystem: EcosystemService,
    private readonly sensage: SensageAiService,
    private readonly tenants: TenantCompanyService,
  ) {}

  // ------------------------------------------------------------------ P4 RFQ

  @Post('rfqs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a spare-part request for quotation' })
  async createRfq(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: CreateRfqDto) {
    const companyId = await this.tenants.resolveForCustomer(customer.defaultCompanyId);
    return this.ecosystem.createRfq({
      customerAccountId: customer.accountId,
      companyId,
      categoryKey: dto.categoryKey,
      description: dto.description,
      quantity: dto.quantity ?? 1,
      vehicleId: dto.vehicleId ?? null,
      validDays: dto.validDays ?? 7,
    });
  }

  @Get('rfqs')
  @ApiOperation({ summary: 'List your requests for quotation' })
  async listRfqs(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.ecosystem.listRfqs(customer.accountId);
  }

  @Get('rfqs/:id')
  @ApiOperation({ summary: 'Read one of your requests for quotation' })
  async getRfq(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.getRfq(customer.accountId, id);
  }

  @Post('rfqs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel one of your open requests' })
  async cancelRfq(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.cancelRfq(customer.accountId, id);
  }

  @Post('rfqs/:id/quotes/:quoteId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a quote on one of your requests' })
  async acceptQuote(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
  ) {
    return this.ecosystem.acceptRfqQuote(customer.accountId, id, quoteId);
  }

  // -------------------------------------------------------------- P4 returns

  @Post('orders/:orderId/returns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a return on one of your orders' })
  async createReturn(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReturnDto,
  ) {
    return this.ecosystem.createReturn({
      customerAccountId: customer.accountId,
      orderId,
      reason: dto.reason,
      lines: dto.lines,
    });
  }

  @Get('returns')
  @ApiOperation({ summary: 'List your returns' })
  async listReturns(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.ecosystem.listReturns(customer.accountId);
  }

  @Get('returns/:id')
  @ApiOperation({ summary: 'Read one of your returns' })
  async getReturn(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.getReturn(customer.accountId, id);
  }

  @Post('returns/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending return' })
  async cancelReturn(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.cancelReturn(customer.accountId, id);
  }

  // ------------------------------------------------------------- P5 recovery

  @Post('recovery')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request roadside recovery / SOS' })
  async createRecovery(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CreateRecoveryRequestDto,
  ) {
    const companyId = await this.tenants.resolveForCustomer(customer.defaultCompanyId);
    return this.ecosystem.createRecoveryRequest({
      customerAccountId: customer.accountId,
      companyId,
      vehicleId: dto.vehicleId ?? null,
      pickupLatitude: dto.pickupLatitude,
      pickupLongitude: dto.pickupLongitude,
      pickupLabel: dto.pickupLabel ?? null,
      contactPhone: dto.contactPhone,
      issue: dto.issue,
      urgency: dto.urgency ?? 'STANDARD',
    });
  }

  @Get('recovery')
  @ApiOperation({ summary: 'List your recovery requests' })
  async listRecovery(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.ecosystem.listRecoveryRequests(customer.accountId);
  }

  @Get('recovery/:id')
  @ApiOperation({ summary: 'Track one of your recovery requests' })
  async getRecovery(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.getRecoveryRequest(customer.accountId, id);
  }

  @Post('recovery/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a recovery request' })
  async cancelRecovery(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: CancelRecoveryDto,
  ) {
    return this.ecosystem.cancelRecoveryRequest(customer.accountId, id, dto.reason);
  }

  // ---------------------------------------------------------------- P6 fleet

  @Post('fleets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a fleet account' })
  async createFleet(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: CreateFleetDto) {
    return this.ecosystem.createFleet({
      customerAccountId: customer.accountId,
      name: dto.name,
      contactName: dto.contactName ?? null,
      contactPhone: dto.contactPhone ?? null,
      contactEmail: dto.contactEmail ?? null,
    });
  }

  @Get('fleets')
  @ApiOperation({ summary: 'List your fleets' })
  async listFleets(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.ecosystem.listFleets(customer.accountId);
  }

  @Get('fleets/:id')
  @ApiOperation({ summary: 'Read one of your fleets' })
  async getFleet(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.getFleet(customer.accountId, id);
  }

  @Post('fleets/:id/vehicles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add one of your vehicles to a fleet' })
  async addFleetVehicle(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: AddFleetVehicleDto,
  ) {
    return this.ecosystem.addFleetVehicle(customer.accountId, id, dto.vehicleId);
  }

  @Post('fleets/:id/vehicles/:vehicleId/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a vehicle from a fleet' })
  async removeFleetVehicle(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.ecosystem.removeFleetVehicle(customer.accountId, id, vehicleId);
  }

  @Post('fleets/:id/drivers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a driver to a fleet' })
  async createDriver(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: CreateDriverDto,
  ) {
    return this.ecosystem.createDriver(customer.accountId, id, {
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email ?? null,
      licenceNumber: dto.licenceNumber ?? null,
    });
  }

  @Post('fleets/:id/drivers/:driverId/active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate or deactivate a driver' })
  async setDriverActive(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Param('driverId') driverId: string,
    @Body() dto: SetDriverActiveDto,
  ) {
    return this.ecosystem.setDriverActive(customer.accountId, id, driverId, dto.isActive);
  }

  // ------------------------------------------------------------ P7 SENSAGE AI

  @Get('sensage/status')
  @ApiOperation({ summary: 'Report whether SENSAGE AI is configured' })
  async sensageStatus(@CurrentCustomer() customer: CustomerPrincipal) {
    const configured = await this.sensage.isConfigured(customer.defaultCompanyId);
    return {
      providerKey: 'SENSAGE_AI',
      configured,
      // Stated plainly so the client never presents demo output as a result.
      message: configured
        ? 'SENSAGE AI is configured. Results are suggestions that a reviewer approves.'
        : 'SENSAGE AI is not configured. No analysis will be produced.',
    };
  }

  @Post('sensage/analyze')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Analyse one of your inspection photographs' })
  async analyze(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: AnalyzePhotoDto) {
    return this.ecosystem.analyzePhoto(
      customer.accountId,
      { photoId: dto.photoId, focus: dto.focus ?? null, vehicleId: dto.vehicleId ?? null },
      customer.defaultCompanyId,
    );
  }

  @Get('sensage/suggestions')
  @ApiOperation({ summary: 'List your AI suggestions' })
  async listSuggestions(@CurrentCustomer() customer: CustomerPrincipal, @Query('photoId') photoId?: string) {
    return this.ecosystem.listSuggestions(customer.accountId, photoId);
  }

  @Get('sensage/suggestions/:id')
  @ApiOperation({ summary: 'Read one of your AI suggestions' })
  async getSuggestion(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.ecosystem.getSuggestion(customer.accountId, id);
  }

  // ------------------------------------------------------------- P4 fitment

  @Get('fitment')
  @ApiOperation({ summary: 'Check whether a part fits one of your vehicles' })
  async checkFitment(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('vehicleId') vehicleId: string,
    @Query('productId') productId: string,
  ) {
    return this.ecosystem.checkFitment(customer.accountId, vehicleId, productId);
  }
}
