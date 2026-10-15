import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { NotificationService } from './notification.service';
import { CustomerAuthGuard, CurrentCustomer, type CustomerPrincipal } from '../customer/customer-auth.guard';
import { CustomerPlane } from '../auth/auth.decorators';

class MarkReadDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * Customer notification centre.
 *
 * Only the customer's own in-app notifications are exposed here. Delivery
 * diagnostics for operators live on the staff plane, because they include
 * recipient addresses and provider errors.
 */
@ApiTags('customer-notifications')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/notifications')
@UseGuards(CustomerAuthGuard)
export class CustomerNotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications' })
  async list(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.listForCustomer(customer.accountId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark specific notifications as read' })
  async markRead(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: MarkReadDto) {
    const updated = await this.notifications.markRead(customer.accountId, dto.ids);
    return { updated };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every notification as read' })
  async markAllRead(@CurrentCustomer() customer: CustomerPrincipal) {
    const updated = await this.notifications.markAllRead(customer.accountId);
    return { updated };
  }
}
