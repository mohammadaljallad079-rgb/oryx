import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/customer.module';
import { ErpCommonModule } from '../common/erp-common.module';
import { PlatformModule } from '../platform/platform.module';
import { StorefrontController, CustomerStorefrontController, StorefrontAdminController } from './storefront.controller';
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
  imports: [CustomerModule, ErpCommonModule, PlatformModule],
  controllers: [StorefrontController, CustomerStorefrontController, StorefrontAdminController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
