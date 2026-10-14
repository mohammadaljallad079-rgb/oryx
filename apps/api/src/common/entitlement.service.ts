import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface CompanyEntitlements {
  companyId: string;
  planId: string | null;
  planCode: string | null;
  subscriptionId: string | null;
  status: string | null;
  licensedModules: string[];
  limits: {
    maxCompanies: number;
    maxBranches: number;
    maxUsers: number;
    storageMb: number;
    apiRequestsPerMonth: number;
  };
  /** True when the subscription currently grants access (ACTIVE or TRIAL). */
  isActive: boolean;
}

const NO_LIMITS = {
  maxCompanies: 0,
  maxBranches: 0,
  maxUsers: 0,
  storageMb: 0,
  apiRequestsPerMonth: 0,
};

/**
 * Resolves the effective entitlement set for a company from its subscription.
 *
 * This is the single authority for "which modules is this company allowed to
 * use". Guards, navigation and CRUD all read from here so they cannot diverge.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async forCompany(companyId: string): Promise<CompanyEntitlements> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!subscription) {
      return {
        companyId,
        planId: null,
        planCode: null,
        subscriptionId: null,
        status: null,
        licensedModules: [],
        limits: { ...NO_LIMITS },
        isActive: false,
      };
    }

    const isActive = subscription.status === 'ACTIVE' || subscription.status === 'TRIAL';

    // Entitlements come from the subscription's own snapshot, never from a live
    // plan lookup: editing a plan must not retroactively change an existing
    // tenant's licensed modules.
    return {
      companyId,
      planId: subscription.planId,
      planCode: subscription.plan.code,
      subscriptionId: subscription.id,
      status: subscription.status,
      licensedModules: isActive ? [...subscription.licensedModules] : [],
      limits: {
        maxCompanies: subscription.plan.maxCompanies,
        maxBranches: subscription.plan.maxBranches,
        maxUsers: subscription.plan.maxUsers,
        storageMb: subscription.plan.storageMb,
        apiRequestsPerMonth: subscription.plan.apiRequestsPerMonth,
      },
      isActive,
    };
  }

  async licensedModulesFor(companyId: string): Promise<string[]> {
    const e = await this.forCompany(companyId);
    return e.licensedModules;
  }

  /** Counts used by plan limit enforcement. */
  async usageFor(companyId: string): Promise<{ branches: number; users: number; companies: number }> {
    const [branches, users, children] = await Promise.all([
      this.prisma.branch.count({ where: { companyId, isActive: true } }),
      this.prisma.membership.count({ where: { companyId, isActive: true } }),
      this.prisma.company.count({ where: { parentCompanyId: companyId, status: { not: 'ARCHIVED' } } }),
    ]);
    return { branches, users, companies: children + 1 };
  }
}
