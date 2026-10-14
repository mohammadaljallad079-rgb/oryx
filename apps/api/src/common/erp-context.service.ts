import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { forbidden, ERROR_CODES, badRequest } from './errors';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type { ActorContext } from '../organizations/organizations.service';

export interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

export function actorFrom(principal: RequestPrincipal, req: RequestLike): ActorContext {
  const ua = req.headers['user-agent'];
  return {
    userId: principal.userId,
    kind: principal.kind,
    companyId: principal.company?.companyId,
    isSuperAdmin: principal.kind === 'PLATFORM',
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

/**
 * Resolves the effective company (and optional branch) scope for an ERP request.
 *
 * A company principal is always pinned to its own company — a `companyId` in the
 * query string can never widen its scope. A platform principal must name the
 * company it is acting on, and reaches it only through an explicit support
 * session or a selected company context, exactly like the dashboard.
 */
@Injectable()
export class ErpContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param principal the resolved request principal
   * @param requestedCompanyId an explicit company from the request, if any
   */
  async resolveCompanyScope(
    principal: RequestPrincipal,
    requestedCompanyId?: string | null,
  ): Promise<{ companyId: string; branchIds: string[] }> {
    if (principal.kind === 'COMPANY') {
      const companyId = principal.company?.companyId;
      if (!companyId) throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'No company context.');
      if (requestedCompanyId && requestedCompanyId !== companyId) {
        throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
      }
      return { companyId, branchIds: [...(principal.company?.branchIds ?? [])] };
    }

    // Platform principal: must operate inside an explicit tenant context.
    const companyId = principal.supportSessionCompanyId ?? principal.activeCompanyId ?? requestedCompanyId ?? undefined;
    if (!companyId) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'A platform administrator must select a company context (or open a support session) to use ERP modules.',
      );
    }
    const exists = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!exists) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unknown company context.');
    return { companyId, branchIds: [] };
  }

  /**
   * Assert that `branchId` belongs to `companyId` and is inside the principal's
   * branch scope. An empty `scope` means company-wide access.
   */
  async assertBranchScope(companyId: string, branchId: string, scope: readonly string[]): Promise<void> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unknown branch.');
    if (branch.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Branch belongs to another company.');
    }
    if (scope.length > 0 && !scope.includes(branchId)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_BRANCH, 'Requested branch is outside your assigned scope.');
    }
  }
}
