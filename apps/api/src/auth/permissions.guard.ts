import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getPermission, isKnownModule } from '@oryx/shared';
import { EntitlementService } from '../common/entitlement.service';
import { ERROR_CODES, forbidden } from '../common/errors';
import {
  MODULE_KEY,
  PERMISSIONS_KEY,
  PLATFORM_KEY,
  IS_PUBLIC_KEY,
  ANY_PERMISSIONS_KEY,
  type RequestPrincipal,
} from './auth.decorators';

interface RequestLike {
  principal?: RequestPrincipal;
}

/**
 * Permission guard. Evaluates against the effective permission set that
 * PrincipalGuard already computed (entitlement gating included).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyOf = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<RequestLike>();
    const principal = req.principal;
    if (!principal) {
      // Public routes legitimately have no principal.
      if (isPublic) return true;
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'No authenticated principal.');
    }

    if (platformOnly && principal.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'This operation requires a platform administrator.');
    }

    if (anyOf && anyOf.length > 0) {
      for (const code of anyOf) {
        if (!getPermission(code)) {
          throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, `Unknown permission requirement: ${code}`);
        }
      }
      if (!anyOf.some((code) => principal.grantedPermissions.includes(code))) {
        throw forbidden(
          ERROR_CODES.FORBIDDEN_PERMISSION,
          `Missing any of the required permissions: ${anyOf.join(', ')}`,
          { permissions: anyOf },
        );
      }
    }

    if (!required || required.length === 0) return true;

    for (const code of required) {
      if (!getPermission(code)) {
        throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, `Unknown permission requirement: ${code}`);
      }
      if (!principal.grantedPermissions.includes(code)) {
        throw forbidden(
          ERROR_CODES.FORBIDDEN_PERMISSION,
          `Missing required permission: ${code}`,
          { permission: code },
        );
      }
    }
    return true;
  }
}

/**
 * Module entitlement guard. Verifies the active company subscription licenses
 * the module. Platform principals bypass only when they are not in tenant
 * context, because platform governance is not plan-limited.
 */
@Injectable()
export class ModuleEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleKey) return true;
    if (!isKnownModule(moduleKey)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, `Unknown module: ${moduleKey}`);
    }

    const req = context.switchToHttp().getRequest<RequestLike>();
    const principal = req.principal;
    if (!principal) throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'No authenticated principal.');

    if (principal.kind === 'PLATFORM' && !principal.company) return true;
    const companyId = principal.company?.companyId;
    if (!companyId) throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'No company context for module access.');

    const licensed = await this.entitlements.licensedModulesFor(companyId);
    if (!licensed.includes(moduleKey)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_MODULE_NOT_LICENSED, `Module "${moduleKey}" is not licensed for this company.`, {
        module: moduleKey,
      });
    }
    return true;
  }
}
