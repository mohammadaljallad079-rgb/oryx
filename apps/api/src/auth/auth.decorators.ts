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

export const CUSTOMER_PLANE_KEY = 'oryx:customerPlane';

/**
 * Marks a route as exempt from the CSRF double-submit check.
 *
 * Reserved for session-*establishing* endpoints (credential login, MFA
 * completion, invitation acceptance, credential recovery). Those requests carry
 * no ambient authority to abuse: the body holds the credential and the refresh
 * cookie grants nothing on its own. The check must not gate them, because a
 * stale `oryx_rt` cookie left over from a previous session is HttpOnly — page
 * script cannot delete it — and `CsrfGuard` would then reject every subsequent
 * sign-in with a 403, locking the user out of the device permanently.
 *
 * Never apply this to a route that authenticates *by* cookie (refresh, logout,
 * logout-all, change-password), where the double-submit check is the only thing
 * preventing a cross-site forced action.
 */
export const CSRF_EXEMPT_KEY = 'oryx:csrfExempt';
export const CsrfExempt = () => SetMetadata(CSRF_EXEMPT_KEY, true);

/**
 * Marks a route as belonging to the customer identity plane.
 *
 * The global staff guards (`CsrfGuard`, `PrincipalGuard`, `PermissionsGuard`,
 * `ModuleEntitlementGuard`) skip such routes, and `CustomerAuthGuard` owns them
 * instead. The marker is explicit rather than inferred from the URL so that
 * moving a controller cannot silently expose a customer route to the staff
 * pipeline or vice versa.
 */
export const CustomerPlane = () => SetMetadata(CUSTOMER_PLANE_KEY, true);

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
