import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CustomerModule } from '../customer/customer.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ErpCommonModule } from '../common/erp-common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EcosystemService } from './ecosystem.service';
import { SensageAiService } from './sensage-ai.service';
import { CustomerEcosystemController } from './customer-ecosystem.controller';
import { EcosystemAdminController, ProviderEcosystemController } from './ecosystem.controller';

/**
 * The planned automotive ecosystem (P3–P7).
 *
 * `CustomerModule` supplies the consumer guard, `IntegrationsModule` supplies the
 * credential reader the SENSAGE adapter uses, and `InventoryModule` supplies the
 * shared stock ledger a consumer return moves stock through. Nothing here
 * duplicates a service that already exists.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CustomerModule,
    NotificationsModule,
    ErpCommonModule,
    InventoryModule,
    IntegrationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: Number(config.get('JWT_ACCESS_TTL') ?? 900) },
      }),
    }),
  ],
  controllers: [CustomerEcosystemController, ProviderEcosystemController, EcosystemAdminController],
  providers: [EcosystemService, SensageAiService],
  exports: [EcosystemService, SensageAiService],
})
export class EcosystemModule {}
