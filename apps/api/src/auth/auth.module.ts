import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
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
  providers: [AuthService, PrincipalGuard, PermissionsGuard, ModuleEntitlementGuard],
  exports: [AuthService, PrincipalGuard, PermissionsGuard, ModuleEntitlementGuard, JwtModule],
})
export class AuthModule {}
