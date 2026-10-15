import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { BookingService } from './booking.service';
import { BookingController, CustomerBookingController } from './booking.controller';
import { CustomerPlatformController } from './customer-platform.controller';
import { CustomerPlatformService } from './customer-platform.service';

/**
 * The customer identity plane.
 *
 * `JwtModule` is registered with the same access secret as `AuthModule` because
 * both planes sign with `JWT_ACCESS_SECRET`; the audience discriminator in the
 * payload (`typ`) is what keeps the planes apart, not a separate key.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
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
    CustomerAuthController,
    CustomerProfileController,
    BookingController,
    CustomerBookingController,
    CustomerPlatformController,
  ],
  providers: [
    CustomerAuthService,
    CustomerProfileService,
    CustomerAuthGuard,
    BookingService,
    CustomerPlatformService,
  ],
  exports: [
    CustomerAuthService,
    CustomerProfileService,
    CustomerAuthGuard,
    BookingService,
    CustomerPlatformService,
    JwtModule,
  ],
})
export class CustomerModule {}
