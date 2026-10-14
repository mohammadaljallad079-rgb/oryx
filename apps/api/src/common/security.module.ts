import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PrincipalGuard, TenantBoundaryInterceptor } from '../auth/principal.guard';
import { ModuleEntitlementGuard, PermissionsGuard } from '../auth/permissions.guard';

/**
 * Registers the global security pipeline. Order matters:
 *   1. PrincipalGuard resolves identity + effective permissions.
 *   2. PermissionsGuard enforces permission and platform-only requirements.
 *   3. ModuleEntitlementGuard enforces plan module licensing.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleEntitlementGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantBoundaryInterceptor },
  ],
})
export class SecurityModule {}
