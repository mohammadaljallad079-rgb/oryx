import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Principal } from '@oryx/shared';

export const IS_PUBLIC_KEY = 'oryx:isPublic';
/** Marks a route as reachable without an access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'oryx:permissions';
/** Require ALL listed permission codes. */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const ANY_PERMISSIONS_KEY = 'oryx:anyPermissions';
/**
 * Require AT LEAST ONE of the listed permission codes.
 *
 * Used on surfaces that a platform administrator and a company administrator
 * both legitimately reach through different permission codes, e.g. listing
 * companies via `platform.company.read` (platform) or `company.read` (tenant).
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export const PLATFORM_KEY = 'oryx:platformOnly';
/** Require a platform (Super Admin) principal. */
export const PlatformOnly = () => SetMetadata(PLATFORM_KEY, true);

export const MODULE_KEY = 'oryx:requiredModule';
/** Require the company's subscription to license this ERP module. */
export const RequireModule = (moduleKey: string) => SetMetadata(MODULE_KEY, moduleKey);

export interface RequestPrincipal extends Principal {
  /** Populated when a platform user operates inside a tenant via support access. */
  supportSessionCompanyId?: string;
  /** Selected company/branch context from request headers. */
  activeCompanyId?: string;
  activeBranchId?: string;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestPrincipal => {
    const req = ctx.switchToHttp().getRequest<{ principal?: RequestPrincipal }>();
    if (!req.principal) throw new Error('Principal not resolved for this route');
    return req.principal;
  },
);
