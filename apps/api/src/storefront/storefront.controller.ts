import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { CustomerPlane } from '../auth/auth.decorators';
import { BookingService } from '../customer/booking.service';
import {
  CurrentCustomer,
  CustomerAuthGuard,
  type CustomerPrincipal,
} from '../customer/customer-auth.guard';
import { ERROR_CODES, unauthorized } from '../common/errors';
import { StorefrontService } from './storefront.service';
import {
  ContactMessageDto,
  CreateWebOrderDto,
  ProductQueryDto,
  PublicBookingDto,
  QuoteCartDto,
  SuggestQueryDto,
} from './storefront.dto';

/**
 * The public ORYX Auto Services storefront.
 *
 * Every read route here is `@Public()` — a visitor browsing services, spare
 * parts, branches or offers has no session. The write routes are `@CustomerPlane()`
 * so they resolve a consumer identity through `CustomerAuthGuard` and never the
 * staff pipeline: an anonymous visitor can send a contact message or an
 * appointment request, but placing an order or saving a wishlist item needs an
 * account, and that account is taken from the token, never from the body.
 */
@ApiTags('storefront')
@Controller('storefront')
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly bookings: BookingService,
  ) {}

  // ------------------------------------------------------------ public reads

  @Public()
  @Get('context')
  @ApiOperation({ summary: 'Public storefront context (company, currency)' })
  context() {
    return this.storefront.context();
  }

  @Public()
  @Get('services')
  @ApiOperation({ summary: 'Services offered, with the branches that deliver them' })
  services() {
    return this.storefront.services();
  }

  @Public()
  @Get('branches')
  @ApiOperation({ summary: 'Published branches with contact details and hours' })
  branches() {
    return this.storefront.branches();
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Spare-parts aisles with live product counts' })
  categories() {
    return this.storefront.categories();
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Search and filter the published spare-parts catalogue' })
  products(@Query() query: ProductQueryDto) {
    return this.storefront.listProducts(query);
  }

  @Public()
  @Get('products/facets')
  @ApiOperation({ summary: 'Filter options derived from the live catalogue' })
  facets() {
    return this.storefront.facets();
  }

  @Public()
  @Get('products/suggest')
  @ApiOperation({ summary: 'Autocomplete suggestions from real catalogue records' })
  suggest(@Query() query: SuggestQueryDto) {
    return this.storefront.suggest(query.q, query.limit ?? 8);
  }

  @Public()
  @Get('products/featured')
  @ApiOperation({ summary: 'Featured products for the homepage' })
  featured(@Query('limit') limit?: string) {
    return this.storefront.featured(Math.min(16, Math.max(1, Number(limit) || 8)));
  }

  @Public()
  @Get('offers')
  @ApiOperation({ summary: 'Products currently on offer' })
  offers(@Query('limit') limit?: string) {
    return this.storefront.offers(Math.min(24, Math.max(1, Number(limit) || 8)));
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'A published product by id or SKU' })
  product(@Param('id') id: string) {
    return this.storefront.product(id);
  }

  @Public()
  @Get('products/:id/related')
  @ApiOperation({ summary: 'Related products from the same aisle' })
  related(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.storefront.relatedProducts(id, Math.min(12, Math.max(1, Number(limit) || 4)));
  }

  @Public()
  @Get('availability')
  @ApiOperation({ summary: 'Real bookable appointment times for a branch and day' })
  availability(
    @Query('date') date: string,
    @Query('durationMinutes') durationMinutes: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.storefront.availability({
      branchId: branchId ?? null,
      date,
      durationMinutes: Math.max(15, Math.min(1440, Number(durationMinutes) || 60)),
      bookings: this.bookings,
    });
  }

  @Public()
  @Get('availability/days')
  @ApiOperation({ summary: 'Free-slot counts per day for the next N days' })
  availabilityDays(
    @Query('days') days: string,
    @Query('durationMinutes') durationMinutes: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.storefront.availabilityDays({
      branchId: branchId ?? null,
      days: Math.max(1, Math.min(60, Number(days) || 14)),
      durationMinutes: Math.max(15, Math.min(1440, Number(durationMinutes) || 60)),
      bookings: this.bookings,
    });
  }

  // --------------------------------------------------------------- public writes

  @Public()
  @Post('cart/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Price a basket server-side for a visitor' })
  quote(@Body() dto: QuoteCartDto) {
    return this.storefront.quote(dto.lines);
  }

  @Public()
  @Post('contact')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a contact message to ORYX Auto Services' })
  contact(@Body() dto: ContactMessageDto) {
    return this.storefront.createContactMessage(dto);
  }

  @Public()
  @Post('appointments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a service appointment as a visitor or a customer' })
  appointment(@Body() dto: PublicBookingDto) {
    return this.storefront.createAppointment({
      accountId: null,
      customerName: dto.customerName,
      phone: dto.phone,
      email: dto.email ?? null,
      vehicleMake: dto.vehicleMake ?? null,
      vehicleModel: dto.vehicleModel ?? null,
      vehicleYear: dto.vehicleYear ?? null,
      plateNumber: dto.plateNumber ?? null,
      serviceRef: dto.serviceRef,
      branchId: dto.branchId ?? null,
      startsAt: dto.startsAt,
      durationMinutes: dto.durationMinutes,
      notes: dto.notes ?? null,
      bookingType: dto.bookingType,
      bookings: this.bookings,
    });
  }
}

/**
 * Storefront routes that need a customer session.
 *
 * The account is always taken from the bearer token. A request that names
 * another account's order id, wishlist item or vehicle is refused because the
 * query is scoped to the resolved account, not to the supplied id.
 */
@ApiTags('storefront')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/storefront')
@UseGuards(CustomerAuthGuard)
export class CustomerStorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly bookings: BookingService,
  ) {}

  @Post('cart/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Price a cart server-side from the published catalogue' })
  quote(@Body() dto: QuoteCartDto) {
    return this.storefront.quote(dto.lines);
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a spare-parts order for the signed-in customer' })
  createOrder(@Body() dto: CreateWebOrderDto, @CurrentCustomer() customer: CustomerPrincipal) {
    return this.storefront.createOrder({
      accountId: customer.accountId,
      lines: dto.lines,
      fulfilment: dto.fulfilment,
      branchId: dto.branchId ?? null,
      address: dto.address ? { ...dto.address } : null,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail ?? null,
      notes: dto.notes ?? null,
    });
  }

  @Get('orders')
  @ApiOperation({ summary: 'List the signed-in customer’s orders' })
  orders(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.storefront.listOrders(customer.accountId, Number(page) || 1, Number(pageSize) || 20);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Read one of the signed-in customer’s orders' })
  async order(@Param('id') id: string, @CurrentCustomer() customer: CustomerPrincipal) {
    const order = await this.storefront.getOrder(customer.accountId, id);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      fulfilment: order.fulfilment,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      contactEmail: order.contactEmail,
      deliveryAddress: order.deliveryAddress,
      notes: order.notes,
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      currency: order.currency,
      currencyScale: order.currencyScale,
      createdAt: order.createdAt,
      lines: order.lines.map((line) => ({
        sku: line.sku,
        nameEn: line.nameEn,
        nameAr: line.nameAr,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };
  }

  @Get('wishlist')
  @ApiOperation({ summary: 'List the signed-in customer’s saved products' })
  wishlist(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.storefront.wishlist(customer.accountId);
  }

  @Get('wishlist/ids')
  @ApiOperation({ summary: 'Product ids the customer has saved' })
  wishlistIds(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.storefront.wishlistIds(customer.accountId);
  }

  @Post('wishlist/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save or remove a product from the wishlist' })
  toggleWishlist(@Param('productId') productId: string, @CurrentCustomer() customer: CustomerPrincipal) {
    return this.storefront.toggleWishlist(customer.accountId, productId);
  }

  @Delete('wishlist/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a product from the wishlist' })
  async removeWishlist(
    @Param('productId') productId: string,
    @CurrentCustomer() customer: CustomerPrincipal,
  ) {
    const saved = await this.storefront.toggleWishlist(customer.accountId, productId);
    return { saved: saved.saved };
  }

  @Post('appointments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book an appointment as the signed-in customer' })
  appointment(@Body() dto: PublicBookingDto, @CurrentCustomer() customer: CustomerPrincipal) {
    return this.storefront.createAppointment({
      accountId: customer.accountId,
      customerName: dto.customerName || customer.fullName,
      phone: dto.phone,
      email: dto.email ?? customer.email,
      vehicleId: dto.vehicleId ?? null,
      vehicleMake: dto.vehicleMake ?? null,
      vehicleModel: dto.vehicleModel ?? null,
      vehicleYear: dto.vehicleYear ?? null,
      plateNumber: dto.plateNumber ?? null,
      serviceRef: dto.serviceRef,
      branchId: dto.branchId ?? null,
      startsAt: dto.startsAt,
      durationMinutes: dto.durationMinutes,
      notes: dto.notes ?? null,
      bookingType: dto.bookingType,
      bookings: this.bookings,
    });
  }

  @Get('appointments')
  @ApiOperation({ summary: 'List the signed-in customer’s appointments' })
  appointments(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    if (!customer.accountId) {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'A customer session is required.');
    }
    return this.storefront.listAppointments(
      customer.accountId,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }
}
