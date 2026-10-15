import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerPlane } from '../auth/auth.decorators';
import { CustomerAuthGuard, CurrentCustomer, type CustomerPrincipal } from '../customer/customer-auth.guard';
import { PaymentService } from './payment.service';

/**
 * The customer's payment history.
 *
 * Read-only: a customer cannot create or settle an intent directly. Payment is
 * initiated by the document being paid (an invoice or a booking), which is what
 * keeps the amount tied to a real obligation.
 */
@ApiTags('customer-payments')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/payments')
@UseGuards(CustomerAuthGuard)
export class CustomerPaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get()
  @ApiOperation({ summary: 'Payment history with refunds' })
  async history(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.payments.customerPaymentHistory(customer.accountId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }
}
