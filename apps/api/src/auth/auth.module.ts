import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { MfaEnrollmentService } from './mfa-enrollment.service';
import { MfaService, SecretCipher } from './mfa.service';
import { CsrfGuard } from './csrf.guard';
import { PrincipalGuard } from './principal.guard';
import { ModuleEntitlementGuard, PermissionsGuard } from './permissions.guard';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: Number(config.get('JWT_ACCESS_TTL') ?? 900) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CookieService,
    SecretCipher,
    MfaService,
    MfaEnrollmentService,
    CsrfGuard,
    PrincipalGuard,
    PermissionsGuard,
    ModuleEntitlementGuard,
  ],
  exports: [
    AuthService,
    CookieService,
    MfaService,
    MfaEnrollmentService,
    CsrfGuard,
    PrincipalGuard,
    PermissionsGuard,
    ModuleEntitlementGuard,
    JwtModule,
  ],
})
export class AuthModule {}
