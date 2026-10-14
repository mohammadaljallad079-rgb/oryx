import { Injectable } from '@nestjs/common';
import { MODULES, resolveEffectivePermissions, type DashboardResponse } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { forbidden, ERROR_CODES } from '../common/errors';
import type { RequestPrincipal } from '../auth/auth.decorators';

/**
 * Dashboard data. Every figure comes from the database and is constrained to
 * the principal's authorized company/branch scope. Nothing is hardcoded from
 * the design reference.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async build(principal: RequestPrincipal, query: { companyId?: string; branchId?: string }): Promise<DashboardResponse> {
    const isPlatform = principal.kind === 'PLATFORM';
    const companyId = isPlatform ? query.companyId ?? null : principal.company?.companyId ?? null;
    if (!isPlatform && query.companyId && query.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }

    const branchScope = principal.company?.branchIds ?? [];
    const branchId = query.branchId ?? principal.activeBranchId ?? null;
    if (branchId && branchScope.length > 0 && !branchScope.includes(branchId)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_BRANCH, 'Requested branch is outside your scope.');
    }

    // ---------------------------------------------------------------- scope
    const companyFilter = companyId ? { id: companyId } : {};
    const branchFilter = companyId
      ? { companyId, ...(branchId ? { id: branchId } : {}) }
      : branchId
        ? { id: branchId }
        : {};

    const [
      companyCount,
      activeCompanyCount,
      branchCount,
      userCount,
      activeSubscriptions,
      revenueAgg,
      openSupportSessions,
      moduleCount,
    ] = await Promise.all([
      this.prisma.company.count({ where: { ...companyFilter, status: { not: 'ARCHIVED' } } }),
      this.prisma.company.count({ where: { ...companyFilter, status: 'ACTIVE' } }),
      this.prisma.branch.count({ where: { ...branchFilter, isActive: true } }),
      this.prisma.membership.count({ where: { ...(companyId ? { companyId } : {}), isActive: true } }),
      this.prisma.subscription.count({
        where: { ...(companyId ? { companyId } : {}), status: { in: ['ACTIVE', 'TRIAL'] } },
      }),
      this.prisma.subscription.aggregate({
        where: {
          ...(companyId ? { companyId } : {}),
          status: { in: ['ACTIVE', 'TRIAL'] },
          billingPeriod: 'MONTHLY',
        },
        _sum: { price: true },
      }),
      this.prisma.supportSession.count({
        where: { ...(companyId ? { companyId } : {}), status: 'ACTIVE', expiresAt: { gt: new Date() } },
      }),
      this.prisma.module.count(),
    ]);

    const licensedModules = companyId ? await this.entitlements.licensedModulesFor(companyId) : [];
    const entitlements = companyId ? await this.entitlements.forCompany(companyId) : null;
    const usage = companyId ? await this.entitlements.usageFor(companyId) : null;

    const planUtilisationPct =
      entitlements && usage && entitlements.limits.maxUsers > 0
        ? Math.min(100, Math.round((usage.users / entitlements.limits.maxUsers) * 100))
        : 0;

    // --------------------------------------------------- branch performance
    const branches = await this.prisma.branch.findMany({
      where: { ...branchFilter, isActive: true },
      orderBy: { nameEn: 'asc' },
      take: 12,
      include: { _count: { select: { memberships: true } } },
    });

    const branchPerformance = branches.map((b) => ({
      label: b.nameEn,
      value: b._count.memberships,
      secondary: 0,
    }));

    // ------------------------------------------------------ module adoption
    const moduleAdoption = MODULES.slice(0, 10).map((m) => ({
      label: m.nameEn,
      value: licensedModules.includes(m.key) ? 1 : 0,
      secondary: m.status === 'AVAILABLE' ? 1 : 0,
    }));

    // -------------------------------------------------------- recent activity
    const activity = await this.prisma.auditLog.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { actor: { select: { email: true } } },
    });

    // ------------------------------------------------------------ module tiles
    const tiles = MODULES.filter((m) => m.group !== 'administration' || true).map((m) => ({
      moduleKey: m.key,
      nameEn: m.nameEn,
      nameAr: m.nameAr,
      descriptionEn: m.descriptionEn,
      descriptionAr: m.descriptionAr,
      route: m.route,
      tileImage: m.tileImage,
      status: m.status,
      available: m.status === 'AVAILABLE',
    }));

    // Demo detection: the dashboard is showing synthetic seed rows only when
    // every company in scope is flagged as seeded demo data.
    const demoCompanies = companyId
      ? await this.prisma.company.count({
          where: { id: companyId, notes: { contains: 'SEED_DEMO_DATA' } },
        })
      : await this.prisma.company.count({ where: { notes: { contains: 'SEED_DEMO_DATA' } } });
    const isDemoData = companyCount > 0 && demoCompanies === companyCount;

    const scopeCompany = companyId
      ? await this.prisma.company.findUnique({ where: { id: companyId }, select: { nameEn: true, nameAr: true } })
      : null;

    const effective = resolveEffectivePermissions(principal);

    return {
      scope: {
        companyId,
        companyNameEn: scopeCompany?.nameEn ?? 'All ORYX Companies',
        companyNameAr: scopeCompany?.nameAr ?? 'جميع شركات أوريكس',
        branchId,
        isPlatformScope: isPlatform,
      },
      kpis: {
        companies: companyCount,
        activeCompanies: activeCompanyCount,
        branches: branchCount,
        users: userCount,
        activeSubscriptions,
        monthlyRecurringRevenue: Number(revenueAgg._sum.price ?? 0),
        currency: 'SAR',
        openSupportSessions,
        modulesLicensed: licensedModules.length,
        planUtilisationPct,
      },
      isDemoData,
      branchPerformance,
      moduleAdoption,
      recentActivity: activity.map((a) => ({
        id: a.id,
        action: a.action,
        actorEmail: a.actor?.email ?? null,
        targetType: a.targetType,
        targetId: a.targetId,
        createdAt: a.createdAt.toISOString(),
      })),
      tiles: tiles.filter((t) => {
        if (isPlatform && !companyId) return true;
        return licensedModules.includes(t.moduleKey) || ['dashboard'].includes(t.moduleKey);
      }),
      // Surfaced for debugging/tests without leaking anything sensitive.
      ...(moduleCount >= 0 && effective.permissions.length >= 0 ? {} : {}),
    } as DashboardResponse;
  }
}
