import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CustomerPlane } from '../auth/auth.decorators';
import { CustomerAuthGuard, CurrentCustomer, type CustomerPrincipal } from '../customer/customer-auth.guard';
import { CustomerCartService } from './customer-cart.service';
import { AddCartItemDto, FavoriteDto, SetQuantityDto } from './customer-cart.dto';

/**
 * The consumer cart and favourites.
 *
 * Every route is behind `CustomerAuthGuard`, and every method reads the caller
 * from `@CurrentCustomer()` — the principal the guard resolved from the access
 * token. No customer id is accepted from the request, so one account cannot name
 * another's cart or favourites.
 *
 * `companyId` is taken from the principal rather than the body for the same
 * reason: a client must not be able to point a cart at a tenant it does not
 * belong to.
 */
@ApiTags('customer-cart')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer')
@UseGuards(CustomerAuthGuard)
export class CustomerCartController {
  constructor(private readonly cart: CustomerCartService) {}

  @Get('cart')
  @ApiOperation({ summary: 'The caller\'s cart' })
  getCart(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.cart.getCart(customer.accountId);
  }

  @Post('cart/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a product, or increase its quantity' })
  addItem(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(customer.accountId, dto.productId, dto.quantity ?? 1, customer.defaultCompanyId);
  }

  @Patch('cart/items/:productId')
  @ApiOperation({ summary: 'Set a line quantity; zero removes it' })
  setQuantity(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('productId') productId: string,
    @Body() dto: SetQuantityDto,
  ) {
    return this.cart.setQuantity(customer.accountId, productId, dto.quantity, customer.defaultCompanyId);
  }

  @Delete('cart/items/:productId')
  @ApiOperation({ summary: 'Remove a line' })
  removeItem(@CurrentCustomer() customer: CustomerPrincipal, @Param('productId') productId: string) {
    return this.cart.removeItem(customer.accountId, productId);
  }

  @Delete('cart')
  @ApiOperation({ summary: 'Empty the cart' })
  clearCart(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.cart.clearCart(customer.accountId);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'The caller\'s favourites' })
  listFavorites(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.cart.listFavorites(customer.accountId);
  }

  @Post('favorites')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a product to favourites' })
  addFavorite(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: FavoriteDto) {
    return this.cart.addFavorite(customer.accountId, dto.productId);
  }

  @Delete('favorites/:productId')
  @ApiOperation({ summary: 'Remove a favourite' })
  removeFavorite(@CurrentCustomer() customer: CustomerPrincipal, @Param('productId') productId: string) {
    return this.cart.removeFavorite(customer.accountId, productId);
  }
}
