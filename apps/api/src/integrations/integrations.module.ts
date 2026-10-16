import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CustomerModule } from '../customer/customer.module';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { CustomerCapabilitiesController } from './customer-capabilities.controller';

/**
 * External Integrations Center.
 *
 * `AuthModule` supplies `SecretCipher` for sealing credentials and the guards
 * used on the Super Admin routes; `CustomerModule` supplies the customer guard
 * for the capability endpoint the website and mobile app read.
 */
@Module({
  imports: [ConfigModule, AuthModule, CustomerModule],
  controllers: [IntegrationsController, CustomerCapabilitiesController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
