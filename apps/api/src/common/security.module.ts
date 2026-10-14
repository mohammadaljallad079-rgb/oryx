import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { CsrfGuard } from '../auth/csrf.guard';
import { PrincipalGuard, TenantBoundaryInterceptor } from '../auth/principal.guard';
import { ModuleEntitlementGuard, PermissionsGuard } from '../auth/permissions.guard';

/**
 * Registers the global security pipeline. Order matters:
 *   1. CsrfGuard protects cookie-authenticated state changes.
 *   2. PrincipalGuard resolves identity + effective permissions.
 *   3. PermissionsGuard enforces permission and platform-only requirements.
 *   4. ModuleEntitlementGuard enforces plan module licensing.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleEntitlementGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantBoundaryInterceptor },
  ],
})
export class SecurityModule {}
