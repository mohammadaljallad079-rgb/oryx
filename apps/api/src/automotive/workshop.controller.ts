import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { WorkshopService } from './workshop.service';
import {
  AddLabourDto,
  ApproveEstimateDto,
  ApproveProviderDto,
  AssignProviderDto,
  CreateCompatibilityDto,
  CreateEstimateDto,
  CreateJobCardDto,
  CreateListingDto,
  CreateMaintenanceBookingDto,
  CreatePartReferenceDto,
  CreateProviderDto,
  CreateReservationDto,
  CreateServiceRequestDto,
  CreateSettlementDto,
  CreateWarrantyDto,
  CreateWorkshopBayDto,
  InvoiceJobCardDto,
  IssueReservationDto,
  ListQueryDto,
  UpdateJobCardDto,
  UpdateMaintenanceBookingDto,
  UpdateServiceRequestDto,
} from './automotive.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('automotive-workshop')
@ApiBearerAuth()
@Controller('automotive')
export class WorkshopController {
  constructor(private readonly workshop: WorkshopService) {}

  // -------------------------------------------------------------- bays
  @Get('bays')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.maintenance.read', 'erp.maintenance.booking.manage')
  @ApiOperation({ summary: 'List workshop bays' })
  bays(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listBays(query, p);
  }

  @Post('bays')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.booking.manage')
  @ApiOperation({ summary: 'Create a workshop bay' })
  createBay(@Body() dto: CreateWorkshopBayDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createBay(dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------- maintenance bookings
  @Get('maintenance-bookings')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.maintenance.read', 'erp.maintenance.booking.manage')
  @ApiOperation({ summary: 'List maintenance bookings' })
  bookings(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listMaintenanceBookings(query, p);
  }

  @Post('maintenance-bookings')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.booking.manage')
  @ApiOperation({ summary: 'Book maintenance work' })
  book(@Body() dto: CreateMaintenanceBookingDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createMaintenanceBooking(dto, p, actorFrom(p, req));
  }

  @Patch('maintenance-bookings/:id')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.booking.manage')
  @ApiOperation({ summary: 'Update a maintenance booking' })
  updateBooking(@Param('id') id: string, @Body() dto: UpdateMaintenanceBookingDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.updateMaintenanceBooking(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- job cards
  @Get('job-cards')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.maintenance.read', 'erp.maintenance.jobcard.manage')
  @ApiOperation({ summary: 'List job cards' })
  jobCards(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listJobCards(query, p);
  }

  @Get('job-cards/:id')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.maintenance.read', 'erp.maintenance.jobcard.manage')
  @ApiOperation({ summary: 'Job card detail with labour, estimates and reservations' })
  jobCard(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.getJobCard(id, p);
  }

  @Post('job-cards')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.jobcard.manage')
  @ApiOperation({ summary: 'Open a job card' })
  createJobCard(@Body() dto: CreateJobCardDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createJobCard(dto, p, actorFrom(p, req));
  }

  @Patch('job-cards/:id')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.jobcard.manage')
  @ApiOperation({ summary: 'Update a job card (transitions enforced; completion needs an approved estimate)' })
  updateJobCard(@Param('id') id: string, @Body() dto: UpdateJobCardDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.updateJobCard(id, dto, p, actorFrom(p, req));
  }

  @Post('job-cards/:id/labour')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.jobcard.manage')
  @ApiOperation({ summary: 'Add labour operations' })
  addLabour(@Param('id') id: string, @Body() dto: AddLabourDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.addLabour(id, dto, p, actorFrom(p, req));
  }

  @Post('job-cards/:id/estimates')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.estimate.manage')
  @ApiOperation({ summary: 'Create a repair estimate' })
  createEstimate(@Param('id') id: string, @Body() dto: CreateEstimateDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createEstimate(id, dto, p, actorFrom(p, req));
  }

  @Post('estimates/:id/approve')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.estimate.manage')
  @ApiOperation({ summary: 'Record customer approval of an estimate' })
  approveEstimate(@Param('id') id: string, @Body() dto: ApproveEstimateDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.decideEstimate(id, true, dto, p, actorFrom(p, req));
  }

  @Post('estimates/:id/reject')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.estimate.manage')
  @ApiOperation({ summary: 'Record customer rejection of an estimate' })
  rejectEstimate(@Param('id') id: string, @Body() dto: ApproveEstimateDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.decideEstimate(id, false, dto, p, actorFrom(p, req));
  }

  @Post('job-cards/:id/invoice')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.invoice')
  @ApiOperation({ summary: 'Invoice a completed job card through the sales module' })
  invoice(@Param('id') id: string, @Body() dto: InvoiceJobCardDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.invoiceJobCard(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------- parts reservations
  @Get('reservations')
  @RequireModule('spare_parts')
  @RequireAnyPermission('erp.parts.reserve', 'erp.parts.issue', 'erp.spare_parts.read')
  @ApiOperation({ summary: 'List parts reservations' })
  reservations(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listReservations(query, p);
  }

  @Post('reservations')
  @RequireModule('spare_parts')
  @RequirePermissions('erp.parts.reserve')
  @ApiOperation({ summary: 'Reserve parts for a job card' })
  reserve(@Body() dto: CreateReservationDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createReservation(dto, p, actorFrom(p, req));
  }

  @Post('reservations/:id/issue')
  @RequireModule('spare_parts')
  @RequirePermissions('erp.parts.issue')
  @ApiOperation({ summary: 'Issue reserved parts to the shared stock ledger' })
  issue(@Param('id') id: string, @Body() dto: IssueReservationDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.issueReservation(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------- warranties
  @Get('warranties')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.maintenance.read', 'erp.maintenance.warranty.manage')
  @ApiOperation({ summary: 'List warranty records' })
  warranties(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listWarranties(query, p);
  }

  @Post('warranties')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.maintenance.warranty.manage')
  @ApiOperation({ summary: 'Record a warranty' })
  createWarranty(@Body() dto: CreateWarrantyDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createWarranty(dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- parts data
  @Get('part-references')
  @RequireModule('spare_parts')
  @RequireAnyPermission('erp.spare_parts.read', 'erp.parts.reference.manage')
  @ApiOperation({ summary: 'List part numbers (OEM/aftermarket/cross-reference)' })
  partReferences(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listPartReferences(query, p);
  }

  @Post('part-references')
  @RequireModule('spare_parts')
  @RequirePermissions('erp.parts.reference.manage')
  @ApiOperation({ summary: 'Add a part number' })
  createPartReference(@Body() dto: CreatePartReferenceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createPartReference(dto, p, actorFrom(p, req));
  }

  @Get('compatibility')
  @RequireModule('spare_parts')
  @RequireAnyPermission('erp.spare_parts.read', 'erp.parts.compatibility.manage')
  @ApiOperation({ summary: 'List vehicle compatibility mappings' })
  compatibility(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listCompatibility(query, p);
  }

  @Post('compatibility')
  @RequireModule('spare_parts')
  @RequirePermissions('erp.parts.compatibility.manage')
  @ApiOperation({ summary: 'Map a part to a vehicle make/model/year' })
  createCompatibility(@Body() dto: CreateCompatibilityDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createCompatibility(dto, p, actorFrom(p, req));
  }

  @Get('compatible-parts')
  @RequireModule('spare_parts')
  @RequireAnyPermission('erp.spare_parts.read', 'erp.parts.compatibility.manage')
  @ApiOperation({ summary: 'Parts compatible with a given make/model/year' })
  compatibleParts(
    @Query('make') make: string,
    @Query('model') model: string,
    @Query('year') year: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    return this.workshop.compatibleParts(make, model, Number(year), p, companyId);
  }

  // ------------------------------------------------------------- marketplace
  @Get('providers')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'List marketplace providers' })
  providers(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listProviders(query, p);
  }

  @Post('providers')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Create a marketplace provider' })
  createProvider(@Body() dto: CreateProviderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createProvider(dto, p, actorFrom(p, req));
  }

  @Post('providers/:id/decide')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.provider.manage')
  @ApiOperation({ summary: 'Approve, suspend or reject a provider' })
  decideProvider(@Param('id') id: string, @Body() dto: ApproveProviderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.decideProvider(id, dto, p, actorFrom(p, req));
  }

  @Get('providers/:id/listings')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.marketplace.provider.manage', 'erp.marketplace.listing.manage')
  @ApiOperation({ summary: 'List a provider service listings' })
  listings(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listListings(id, p);
  }

  @Post('providers/:id/listings')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.listing.manage')
  @ApiOperation({ summary: 'Create a provider service listing' })
  createListing(@Param('id') id: string, @Body() dto: CreateListingDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createListing(id, dto, p, actorFrom(p, req));
  }

  @Get('service-requests')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.marketplace.request.manage')
  @ApiOperation({ summary: 'List marketplace service requests' })
  serviceRequests(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listServiceRequests(query, p);
  }

  @Post('service-requests')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.request.manage')
  @ApiOperation({ summary: 'Create a service request' })
  createServiceRequest(@Body() dto: CreateServiceRequestDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createServiceRequest(dto, p, actorFrom(p, req));
  }

  @Post('service-requests/:id/assign')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.request.manage')
  @ApiOperation({ summary: 'Assign a request to an approved provider' })
  assign(@Param('id') id: string, @Body() dto: AssignProviderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.assignProvider(id, dto, p, actorFrom(p, req));
  }

  @Patch('service-requests/:id')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.request.manage')
  @ApiOperation({ summary: 'Update a service request status' })
  updateRequest(@Param('id') id: string, @Body() dto: UpdateServiceRequestDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.updateServiceRequest(id, dto, p, actorFrom(p, req));
  }

  @Get('settlements')
  @RequireModule('automotive_maintenance')
  @RequireAnyPermission('erp.marketplace.commission.manage')
  @ApiOperation({ summary: 'List provider settlements' })
  settlements(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.workshop.listSettlements(query, p);
  }

  @Post('settlements')
  @RequireModule('automotive_maintenance')
  @RequirePermissions('erp.marketplace.commission.manage')
  @ApiOperation({ summary: 'Prepare a provider settlement for a period' })
  createSettlement(@Body() dto: CreateSettlementDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.workshop.createSettlement(dto, p, actorFrom(p, req));
  }
}
