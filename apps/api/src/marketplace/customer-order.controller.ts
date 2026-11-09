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
import { CustomerOrderService } from './customer-order.service';
import { CancelOrderDto, PlaceOrderDto } from './customer-order.dto';

/**
 * The consumer order surface.
 *
 * Every route is behind `CustomerAuthGuard`, and every method reads the caller
 * from `@CurrentCustomer()` — the principal the guard resolved from the access
 * token. No customer id is accepted from the request, so one account cannot name
 * another's order, and a foreign order id is a 404 rather than a leak.
 */
@ApiTags('customer-orders')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/orders')
@UseGuards(CustomerAuthGuard)
export class CustomerOrderController {
  constructor(private readonly orders: CustomerOrderService) {}

  @Get()
  @ApiOperation({ summary: 'Your order history' })
  list(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
  ) {
    return this.orders.listOrders(customer.accountId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
      status,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place an order from your cart' })
  place(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: PlaceOrderDto) {
    return this.orders.placeOrder(customer.accountId, {
      addressId: dto.addressId ?? null,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes ?? null,
      idempotencyKey: dto.idempotencyKey ?? null,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one of your own orders' })
  detail(@Param('id') id: string, @CurrentCustomer() customer: CustomerPrincipal) {
    return this.orders.getOrder(customer.accountId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel your own order while it is still cancellable' })
  cancel(
    @Param('id') id: string,
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelOrder(customer.accountId, id, dto.reason ?? null);
  }
}
