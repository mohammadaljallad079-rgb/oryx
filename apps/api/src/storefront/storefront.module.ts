import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import { StorefrontController, CustomerStorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

/**
 * The public ORYX Auto Services storefront.
 *
 * `CustomerModule` supplies `BookingService`, so the storefront schedules real
 * appointments through the same engine the operations calendar and the mobile
 * app use — there is no second scheduler. `PrismaModule` and `AuditModule` are
 * global.
 */
@Module({
  imports: [CustomerModule],
  controllers: [StorefrontController, CustomerStorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
