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
import { CustomerPlane, RequirePermissions } from '../auth/auth.decorators';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentPrincipal, type RequestPrincipal } from '../auth/auth.decorators';
import { BookingService } from './booking.service';
import { CustomerAuthGuard, CurrentCustomer, type CustomerPrincipal } from './customer-auth.guard';
import {
  AvailabilityQueryDto,
  CancelBookingDto,
  CreateBookingDto,
  RescheduleBookingDto,
  ResourceDto,
  ResourceExceptionDto,
  SetWorkingHoursDto,
} from './booking.dto';

/** Resolve a local date to the UTC instant of its midnight. */
function dayStartFrom(date: string): Date {
  const parsed = new Date(date);
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

/**
 * The staff side of the shared booking engine.
 *
 * These routes power the operations calendar: staff can see availability, book
 * on a customer's behalf, move a booking and manage resources and hours.
 */
@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Get('availability')
  @RequirePermissions('erp.booking.read')
  @ApiOperation({ summary: 'List bookable slots for a day' })
  async availability(
    @Query() query: AvailabilityQueryDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    const companyId = principal.company?.companyId ?? '';
    return this.bookings.availableSlots({
      companyId,
      branchId: query.branchId ?? null,
      resourceId: query.resourceId ?? null,
      serviceRef: query.serviceRef ?? null,
      dayStart: dayStartFrom(query.date),
      durationMinutes: query.durationMinutes,
      stepMinutes: query.stepMinutes,
      minimumNoticeMinutes: query.minimumNoticeMinutes,
      bufferMinutes: query.bufferMinutes,
    });
  }

  @Post()
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Create a booking' })
  async create(@Body() dto: CreateBookingDto, @CurrentPrincipal() principal: RequestPrincipal) {
    const companyId = principal.company?.companyId ?? dto.companyId ?? '';
    const startsAt = new Date(dto.startsAt);

    // Validate against opening hours and existing bookings first, so the common
    // rejection is a clear conflict rather than a database error.
    await this.bookings.assertSlotBookable({
      companyId,
      branchId: dto.branchId ?? null,
      resourceId: dto.resourceId ?? null,
      serviceRef: dto.serviceRef ?? null,
      startsAt,
      durationMinutes: dto.durationMinutes,
    });

    return this.bookings.createBooking({
      companyId,
      branchId: dto.branchId ?? null,
      resourceId: dto.resourceId ?? null,
      bookingType: dto.bookingType,
      serviceRef: dto.serviceRef ?? null,
      startsAt,
      durationMinutes: dto.durationMinutes,
      vehicleId: dto.vehicleId ?? null,
      notes: dto.notes ?? null,
      createdById: principal.userId,
      hold: dto.hold ?? false,
    });
  }

  @Get()
  @RequirePermissions('erp.booking.read')
  @ApiOperation({ summary: 'List bookings with filters' })
  async list(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('status') status?: string,
    @Query('bookingType') bookingType?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.bookings.listBookings({
      companyId: principal.company?.companyId ?? '',
      status,
      bookingType,
      branchId: branchId ?? null,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
    });
  }

  @Get('calendar')
  @RequirePermissions('erp.booking.read')
  @ApiOperation({ summary: 'Bookings grouped by day for a date range' })
  async calendar(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.bookings.calendar(
      principal.company?.companyId ?? '',
      new Date(from),
      new Date(to),
      resourceId ?? null,
    );
  }

  @Get(':id')
  @RequirePermissions('erp.booking.read')
  @ApiOperation({ summary: 'Read a booking with its event trail' })
  async detail(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.bookings.getSlotDetail(principal.company?.companyId ?? '', id);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Confirm a held booking' })
  async confirm(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.bookings.confirmBooking(principal.company?.companyId ?? '', id, principal.userId);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Move a booking to a new time' })
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.bookings.rescheduleBooking(
      principal.company?.companyId ?? '',
      id,
      new Date(dto.startsAt),
      dto.durationMinutes,
      principal.userId,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Cancel a booking and release the slot' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.bookings.cancelBooking(
      principal.company?.companyId ?? '',
      id,
      dto.reason,
      principal.userId,
    );
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Start work on a booking' })
  async start(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.bookings.startBooking(principal.company?.companyId ?? '', id, principal.userId);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Complete a booking' })
  async complete(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.bookings.completeBooking(principal.company?.companyId ?? '', id, principal.userId);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.manage')
  @ApiOperation({ summary: 'Mark a booking as a no-show' })
  async noShow(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.bookings.markNoShow(principal.company?.companyId ?? '', id, principal.userId);
  }

  // ---------------------------------------------------------------- resources

  @Get('resources/list')
  @RequirePermissions('erp.booking.read')
  @ApiOperation({ summary: 'List bookable resources' })
  async resources(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('branchId') branchId?: string,
  ) {
    return this.bookings.listResources(principal.company?.companyId ?? '', branchId ?? null);
  }

  @Post('resources')
  @RequirePermissions('erp.booking.resource.manage')
  @ApiOperation({ summary: 'Create a bookable resource' })
  async createResource(@Body() dto: ResourceDto, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.bookings.createResource({
      companyId: principal.company?.companyId ?? '',
      ...dto,
    });
  }

  @Post('resources/:id/hours')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.resource.manage')
  @ApiOperation({ summary: 'Replace a resource weekly working hours' })
  async setHours(
    @Param('id') id: string,
    @Body() dto: SetWorkingHoursDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.bookings.setWorkingHours(principal.company?.companyId ?? '', id, dto.hours);
  }

  @Post('resources/:id/exceptions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.booking.resource.manage')
  @ApiOperation({ summary: 'Set a closure or special hours for a date' })
  async setException(
    @Param('id') id: string,
    @Body() dto: ResourceExceptionDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.bookings.setResourceException(principal.company?.companyId ?? '', id, {
      date: new Date(dto.date),
      isClosed: dto.isClosed,
      opensMinute: dto.opensMinute ?? null,
      closesMinute: dto.closesMinute ?? null,
      reason: dto.reason,
    });
  }
}

/**
 * The customer side of the booking engine.
 *
 * A customer books against a service and their own vehicle. The booking is
 * created as a hold and confirmed once payment or operator review completes,
 * which is what keeps a slot from being consumed by an abandoned checkout.
 */
@ApiTags('customer-bookings')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/bookings')
@UseGuards(CustomerAuthGuard)
export class CustomerBookingController {
  constructor(private readonly bookings: BookingService) {}

  @Get('availability')
  @ApiOperation({ summary: 'List bookable slots for a day' })
  async availability(
    @Query() query: AvailabilityQueryDto,
    @CurrentCustomer() customer: CustomerPrincipal,
  ) {
    return this.bookings.availableSlots({
      companyId: customer.defaultCompanyId ?? '',
      branchId: query.branchId ?? null,
      resourceId: query.resourceId ?? null,
      serviceRef: query.serviceRef ?? null,
      dayStart: dayStartFrom(query.date),
      durationMinutes: query.durationMinutes,
      stepMinutes: query.stepMinutes,
      minimumNoticeMinutes: query.minimumNoticeMinutes,
      bufferMinutes: query.bufferMinutes,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Book an inspection or maintenance slot' })
  async create(@Body() dto: CreateBookingDto, @CurrentCustomer() customer: CustomerPrincipal) {
    const companyId = dto.companyId ?? customer.defaultCompanyId ?? '';
    const startsAt = new Date(dto.startsAt);

    await this.bookings.assertSlotBookable({
      companyId,
      branchId: dto.branchId ?? null,
      resourceId: dto.resourceId ?? null,
      serviceRef: dto.serviceRef ?? null,
      startsAt,
      durationMinutes: dto.durationMinutes,
    });

    // A customer booking always starts as a hold: the slot is reserved while the
    // confirmation step completes, and an abandoned checkout releases it.
    return this.bookings.createBooking({
      companyId,
      branchId: dto.branchId ?? null,
      resourceId: dto.resourceId ?? null,
      bookingType: dto.bookingType,
      serviceRef: dto.serviceRef ?? null,
      startsAt,
      durationMinutes: dto.durationMinutes,
      customerAccountId: customer.accountId,
      vehicleId: dto.vehicleId ?? null,
      notes: dto.notes ?? null,
      hold: true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List your bookings' })
  async list(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.bookings.listCustomerBookings(customer.accountId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel your own booking' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentCustomer() customer: CustomerPrincipal,
  ) {
    return this.bookings.cancelCustomerBooking(customer.accountId, id, dto.reason);
  }
}
