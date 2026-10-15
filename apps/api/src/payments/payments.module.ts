import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PaymentController, PaymentWebhookController } from './payment.controller';
import { CustomerPaymentController } from './customer-payment.controller';
import {
  BankTransferGateway,
  BenefitPayGateway,
  CardTerminalGateway,
  CashGateway,
  OnlineCardGateway,
} from './payment-gateways';
import { CustomerModule } from '../customer/customer.module';
import { ErpCommonModule } from '../common/erp-common.module';

/**
 * Payment intents, gateways, refunds, webhooks and reconciliation.
 *
 * `CustomerModule` is imported for `CustomerAuthGuard` on the customer-facing
 * payment-history controller.
 */
@Module({
  imports: [ConfigModule, CustomerModule, ErpCommonModule],
  controllers: [PaymentController, PaymentWebhookController, CustomerPaymentController],
  providers: [
    PaymentService,
    CashGateway,
    BankTransferGateway,
    CardTerminalGateway,
    BenefitPayGateway,
    OnlineCardGateway,
  ],
  exports: [PaymentService],
})
export class PaymentsModule {}
