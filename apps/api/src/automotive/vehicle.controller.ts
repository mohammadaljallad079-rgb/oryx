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
import { VehicleService } from './vehicle.service';
import {
  CreateChecklistItemDto,
  CreateInspectionBookingDto,
  CreateInspectionServiceDto,
  CreateVehicleDto,
  DecideReportDto,
  InvoiceInspectionDto,
  ListQueryDto,
  RecordFindingsDto,
  RecordMileageDto,
  SubmitReportDto,
  UpdateInspectionBookingDto,
  UpdateVehicleDto,
  VehicleDocumentDto,
} from './automotive.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('automotive')
@ApiBearerAuth()
@Controller('automotive')
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  // ---------------------------------------------------------------- vehicles
  @Get('vehicles')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.vehicle.read', 'erp.vehicle.manage')
  @ApiOperation({ summary: 'List vehicles' })
  listVehicles(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.listVehicles(query, p);
  }

  @Get('vehicles/:id')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.vehicle.read', 'erp.vehicle.manage')
  @ApiOperation({ summary: 'Vehicle detail with service history' })
  getVehicle(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.getVehicle(id, p);
  }

  @Post('vehicles')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.vehicle.manage')
  @ApiOperation({ summary: 'Register a vehicle (VIN validated and unique per company)' })
  createVehicle(@Body() dto: CreateVehicleDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.createVehicle(dto, p, actorFrom(p, req));
  }

  @Patch('vehicles/:id')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.vehicle.manage')
  @ApiOperation({ summary: 'Update a vehicle' })
  updateVehicle(@Param('id') id: string, @Body() dto: UpdateVehicleDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.updateVehicle(id, dto, p, actorFrom(p, req));
  }

  @Post('vehicles/:id/mileage')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.vehicle.manage')
  @ApiOperation({ summary: 'Record a mileage reading' })
  recordMileage(@Param('id') id: string, @Body() dto: RecordMileageDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.recordMileage(id, dto, p, actorFrom(p, req));
  }

  @Get('vehicles/:id/documents')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.vehicle.read', 'erp.vehicle.manage')
  @ApiOperation({ summary: 'List vehicle documents' })
  documents(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.listVehicleDocuments(id, p);
  }

  @Post('vehicles/:id/documents')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.vehicle.manage')
  @ApiOperation({ summary: 'Add a vehicle document' })
  addDocument(@Param('id') id: string, @Body() dto: VehicleDocumentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.addVehicleDocument(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------- inspections
  @Get('inspection-services')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.inspection.read', 'erp.inspection.service.manage')
  @ApiOperation({ summary: 'List the inspection service catalog' })
  services(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.listInspectionServices(query, p);
  }

  @Post('inspection-services')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.service.manage')
  @ApiOperation({ summary: 'Create an inspection service' })
  createService(@Body() dto: CreateInspectionServiceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.createInspectionService(dto, p, actorFrom(p, req));
  }

  @Post('inspection-checklist-items')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.service.manage')
  @ApiOperation({ summary: 'Add a checklist item' })
  addChecklist(@Body() dto: CreateChecklistItemDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.addChecklistItem(dto, p, actorFrom(p, req));
  }

  @Get('inspection-bookings')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.inspection.read', 'erp.inspection.booking.manage')
  @ApiOperation({ summary: 'List inspection bookings' })
  bookings(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.listInspectionBookings(query, p);
  }

  @Post('inspection-bookings')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.booking.manage')
  @ApiOperation({ summary: 'Book an inspection' })
  book(@Body() dto: CreateInspectionBookingDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.createInspectionBooking(dto, p, actorFrom(p, req));
  }

  @Patch('inspection-bookings/:id')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.booking.manage')
  @ApiOperation({ summary: 'Update an inspection booking' })
  updateBooking(@Param('id') id: string, @Body() dto: UpdateInspectionBookingDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.updateInspectionBooking(id, dto, p, actorFrom(p, req));
  }

  @Post('inspection-bookings/:id/findings')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.booking.manage')
  @ApiOperation({ summary: 'Record inspection findings' })
  findings(@Param('id') id: string, @Body() dto: RecordFindingsDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.recordFindings(id, dto, p, actorFrom(p, req));
  }

  @Get('inspection-bookings/:id/report')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.inspection.read', 'erp.inspection.booking.manage')
  @ApiOperation({ summary: 'Report data (PDF-ready payload)' })
  report(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.getBookingReport(id, p);
  }

  @Post('inspection-bookings/:id/report/submit')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.booking.manage')
  @ApiOperation({ summary: 'Submit the inspection report for approval' })
  submit(@Param('id') id: string, @Body() dto: SubmitReportDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.submitReport(id, dto, p, actorFrom(p, req));
  }

  @Post('inspection-bookings/:id/report/decide')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.report.approve')
  @ApiOperation({ summary: 'Approve or reject the inspection report' })
  decide(@Param('id') id: string, @Body() dto: DecideReportDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.decideReport(id, dto, p, actorFrom(p, req));
  }

  @Post('inspection-bookings/:id/invoice')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.invoice')
  @ApiOperation({ summary: 'Invoice an approved inspection through the sales module' })
  invoice(@Param('id') id: string, @Body() dto: InvoiceInspectionDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.vehicles.invoiceInspection(id, dto, p, actorFrom(p, req));
  }

  @Get('dashboard')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.vehicle.read', 'erp.inspection.read')
  @ApiOperation({ summary: 'Automotive dashboard' })
  dashboard(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.vehicles.automotiveDashboard(p, companyId);
  }
}
