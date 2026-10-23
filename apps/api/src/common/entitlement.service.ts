import { Injectable } from '@nestjs/common';
import { MODULE_KEYS } from '@oryx/shared';
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
  /**
   * True for an ORYX internal company (company type `INTERNAL`), which is
   * governed by the group rather than sold as a subscription. Such a company is
   * never plan-gated or limit-gated.
   */
  isInternal: boolean;
}

/** A company with no active subscription has zero capacity. */
const NO_LIMITS = {
  maxCompanies: 0,
  maxBranches: 0,
  maxUsers: 0,
  storageMb: 0,
  apiRequestsPerMonth: 0,
};

/** `-1` is the platform's explicit "unlimited" for every plan limit. */
const UNLIMITED_LIMITS = {
  maxCompanies: -1,
  maxBranches: -1,
  maxUsers: -1,
  storageMb: -1,
  apiRequestsPerMonth: -1,
};

/**
 * Resolves the effective entitlement set for a company.
 *
 * This is the single authority for "which modules is this company allowed to
 * use". Guards, navigation and CRUD all read from here so they cannot diverge.
 *
 * ORYX runs two distinct company models and they must never be conflated:
 *
 *  - **TYPE 1 — ORYX internal company** (`Company.type = INTERNAL`): owned by
 *    the ORYX group and governed by the Platform Super Admin. It is not a
 *    customer, so it is never subscription-limited: every catalogued module is
 *    available and no plan limit applies. Seeding a plan against an internal
 *    company (as the seed once did) must not narrow it.
 *  - **TYPE 2 — SaaS tenant** (`Company.type = SAAS_TENANT`): a paying customer
 *    whose entitlements are exactly its subscription snapshot.
 *
 * Deciding this in one place is what keeps the guards, the module catalogue and
 * the admin navigation in agreement; a per-call-site exception would drift.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async forCompany(companyId: string): Promise<CompanyEntitlements> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { type: true, status: true },
    });

    if (company?.type === 'INTERNAL') {
      return {
        companyId,
        planId: null,
        planCode: null,
        subscriptionId: null,
        status: 'INTERNAL',
        licensedModules: [...MODULE_KEYS],
        limits: { ...UNLIMITED_LIMITS },
        // Suspension and archival remain real governance actions even for an
        // internal company; only subscription gating is bypassed.
        isActive: company.status === 'ACTIVE',
        isInternal: true,
      };
    }

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
        isInternal: false,
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
      isInternal: false,
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
