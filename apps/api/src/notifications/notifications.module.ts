import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import {
  EmailAdapter,
  InAppAdapter,
  PushAdapter,
  SmsAdapter,
  WhatsAppAdapter,
} from './notification-adapters';
import { NotificationService } from './notification.service';
import { CustomerNotificationController } from './customer-notification.controller';

/**
 * Notification transport and delivery tracking.
 *
 * Adapters are registered as providers so `NotificationService` can report their
 * configuration state; the module is global in spirit (imported wherever a
 * message is produced) and therefore exports the service.
 */
@Module({
  imports: [CustomerModule],
  controllers: [CustomerNotificationController],
  providers: [
    NotificationService,
    InAppAdapter,
    EmailAdapter,
    SmsAdapter,
    WhatsAppAdapter,
    PushAdapter,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
