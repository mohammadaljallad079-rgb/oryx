import {
  CanActivate,
  ExecutionContext,
  Injectable,
  type CallHandler,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Observable } from 'rxjs';
import {
  canAccessCompany,
  resolveEffectivePermissions,
  type Principal,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { ERROR_CODES, forbidden, unauthorized } from '../common/errors';
import { IS_PUBLIC_KEY, type RequestPrincipal } from './auth.decorators';
import type { AccessTokenPayload } from './auth.service';

export const COMPANY_HEADER = 'x-oryx-company-id';
export const BRANCH_HEADER = 'x-oryx-branch-id';
export const SUPPORT_HEADER = 'x-oryx-support-session';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  principal?: RequestPrincipal;
}

/**
 * Resolves the request principal from the bearer token, applies the selected
 * company/branch context, and computes the effective permission set.
 *
 * This guard is the single place where "who is this and what may they do" is
 * decided, so every downstream guard and controller sees an identical view.
 */
@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<RequestLike>();
    const token = extractBearer(req);
    if (!token) {
      if (isPublic) return true;
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Missing access token.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      if (isPublic) return true;
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Access token is invalid or expired.');
    }

    const principal = await this.buildPrincipal(payload, req);
    req.principal = principal;
    return true;
  }

  private async buildPrincipal(payload: AccessTokenPayload, req: RequestLike): Promise<RequestPrincipal> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'DISABLED') {
      throw unauthorized(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 'Account is not active.');
    }

    const requestedCompanyId = headerValue(req, COMPANY_HEADER);
    const requestedBranchId = headerValue(req, BRANCH_HEADER);
    const supportToken = headerValue(req, SUPPORT_HEADER);

    // ------------------------------------------------------------ platform
    if (user.isSuperAdmin) {
      const role = await this.prisma.role.findFirst({
        where: { isPlatform: true, code: 'platform_super_admin' },
        include: { permissions: { select: { permissionCode: true } } },
      });
      const granted = role?.permissions.map((p) => p.permissionCode) ?? [];
      const base: Principal = { kind: 'PLATFORM', userId: user.id, grantedPermissions: granted };

      let supportSessionCompanyId: string | undefined;
      let companyScope: Principal['company'] | undefined;

      if (supportToken) {
        const session = await this.prisma.supportSession.findFirst({
          where: { actorUserId: user.id, companyId: supportToken, status: 'ACTIVE' },
        });
        if (!session || session.expiresAt < new Date()) {
          throw forbidden(ERROR_CODES.FORBIDDEN_SUPPORT_SESSION, 'Support session is not active or has expired.');
        }
        supportSessionCompanyId = session.companyId;
        const ent = await this.entitlements.forCompany(session.companyId);
        companyScope = {
          companyId: session.companyId,
          licensedModuleKeys: ent.licensedModules,
          branchIds: [],
          membershipActive: true,
        };
      } else if (requestedCompanyId) {
        // Platform user selecting a company for context (dashboard filters).
        const exists = await this.prisma.company.findUnique({ where: { id: requestedCompanyId } });
        if (!exists) throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Unknown company context.');
        const ent = await this.entitlements.forCompany(requestedCompanyId);
        companyScope = {
          companyId: requestedCompanyId,
          licensedModuleKeys: ent.licensedModules,
          branchIds: [],
          membershipActive: true,
        };
      }

      const effective = resolveEffectivePermissions({ ...base, company: companyScope });
      return {
        ...base,
        company: companyScope,
        grantedPermissions: effective.permissions,
        supportSessionCompanyId,
        activeCompanyId: requestedCompanyId,
        activeBranchId: requestedBranchId,
      } satisfies RequestPrincipal;
    }

    // ------------------------------------------------------------- company
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, isActive: true },
      include: { company: true, role: { include: { permissions: { select: { permissionCode: true } } } }, branches: true },
    });
    if (memberships.length === 0) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'No active company membership.');
    }

    // Pick the requested company if the user is a member, otherwise the first.
    const membership =
      (requestedCompanyId ? memberships.find((m) => m.companyId === requestedCompanyId) : undefined) ??
      memberships[0];

    if (requestedCompanyId && membership.companyId !== requestedCompanyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'You are not a member of the requested company.');
    }

    const ent = await this.entitlements.forCompany(membership.companyId);
    if (!ent.isActive) {
      throw forbidden(ERROR_CODES.PLAN_NOT_ACTIVE, 'The company subscription is not active.');
    }

    let branchIds = membership.branches.map((b) => b.branchId);
    if (requestedBranchId) {
      if (branchIds.length > 0 && !branchIds.includes(requestedBranchId)) {
        throw forbidden(ERROR_CODES.FORBIDDEN_BRANCH, 'Requested branch is outside your assigned scope.');
      }
      const branch = await this.prisma.branch.findUnique({ where: { id: requestedBranchId } });
      if (!branch) throw forbidden(ERROR_CODES.FORBIDDEN_BRANCH, 'Unknown branch.');
      if (branch.companyId !== membership.companyId) {
        throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Branch belongs to another company.');
      }
    }

    const base: Principal = {
      kind: 'COMPANY',
      userId: user.id,
      grantedPermissions: membership.role.permissions.map((p) => p.permissionCode),
      company: {
        companyId: membership.companyId,
        licensedModuleKeys: ent.licensedModules,
        branchIds,
        membershipActive: true,
      },
    };

    const effective = resolveEffectivePermissions(base);
    return {
      ...base,
      grantedPermissions: effective.permissions,
      activeCompanyId: membership.companyId,
      activeBranchId: requestedBranchId,
    } satisfies RequestPrincipal;
  }
}

export function extractBearer(req: RequestLike): string | undefined {
  const raw = req.headers['authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const [scheme, token] = value.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}

export function headerValue(req: RequestLike, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}

/** Ensures a platform principal cannot silently reach tenant data. */
@Injectable()
export class TenantBoundaryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestLike & { params: Record<string, string> }>();
    const principal = req.principal;
    const targetCompanyId = req.params?.companyId;
    if (principal && principal.kind === 'COMPANY' && targetCompanyId) {
      const check = canAccessCompany(principal, targetCompanyId);
      if (!check.ok) {
        throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
      }
    }
    return next.handle();
  }
}
