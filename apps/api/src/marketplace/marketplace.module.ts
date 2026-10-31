import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MarketplaceService } from './marketplace.service';
import {
  MarketplaceAdminController,
  MarketplacePublicController,
} from './marketplace-public.controller';
import { CustomerMarketplaceController } from './customer-marketplace.controller';
import { ProviderPortalController } from './provider-portal.controller';
import { CustomerHomepageController } from './customer-homepage.controller';
import { CustomerHomepageService } from './customer-homepage.service';
import { CustomerCartController } from './customer-cart.controller';
import { CustomerCartService } from './customer-cart.service';
import { CustomerOrderController } from './customer-order.controller';
import { CustomerOrderService } from './customer-order.service';
import { CustomerCatalogController } from './customer-catalog.controller';
import { CustomerCatalogService } from './customer-catalog.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CustomerModule } from '../customer/customer.module';
import { ErpCommonModule } from '../common/erp-common.module';
import { InventoryModule } from '../inventory/inventory.module';

/**
 * The automotive marketplace and provider portal.
 *
 * `CustomerModule` is imported for `CustomerAuthGuard`, which the customer-facing
 * marketplace controller uses. The public and staff controllers use the standard
 * staff pipeline instead.
 */
@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    CustomerModule,
    ErpCommonModule,
    InventoryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: Number(config.get('JWT_ACCESS_TTL') ?? 900) },
      }),
    }),
  ],
  controllers: [
    MarketplacePublicController,
    MarketplaceAdminController,
    CustomerMarketplaceController,
    ProviderPortalController,
    CustomerHomepageController,
    CustomerCartController,
    CustomerOrderController,
    CustomerCatalogController,
  ],
  providers: [
    MarketplaceService,
    CustomerHomepageService,
    CustomerCartService,
    CustomerOrderService,
    CustomerCatalogService,
  ],
  exports: [
    MarketplaceService,
    CustomerHomepageService,
    CustomerCartService,
    CustomerOrderService,
    CustomerCatalogService,
  ],
})
export class MarketplaceModule {}
