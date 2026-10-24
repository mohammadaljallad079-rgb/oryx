import { Injectable } from '@nestjs/common';
import { checkLimit, DEFAULT_COUNTRY_CODE, DEFAULT_CURRENCY, DEFAULT_TIMEZONE, type PlanLimits } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { AuditService } from '../common/audit.service';
import {
  badRequest,
  conflict,
  ERROR_CODES,
  forbidden,
  notFound,
} from '../common/errors';
import type {
  CreateBranchDto,
  CreateCompanyDto,
  ListQueryDto,
  UpdateBranchDto,
  UpdateCompanyDto,
} from './organizations.dto';
import type { BranchDto, CompanyDto } from '@oryx/shared';
import { DEFAULT_COMPANY_ROLE_TEMPLATES } from '../common/role-templates';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface ActorContext {
  userId: string;
  kind: 'PLATFORM' | 'COMPANY';
  companyId?: string;
  isSuperAdmin: boolean;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ companies

  async listCompanies(query: ListQueryDto, actor: ActorContext) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    // A company principal may only ever see its own company.
    const where = {
      ...(actor.kind === 'COMPANY' ? { id: actor.companyId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.search
        ? {
            OR: [
              { nameEn: { contains: query.search, mode: 'insensitive' as const } },
              { nameAr: { contains: query.search } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: [{ type: 'asc' }, { nameEn: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          parent: { select: { nameEn: true } },
          _count: { select: { branches: true, memberships: true } },
          subscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: true },
          },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items: rows.map((c) => this.toCompanyDto(c)),
      total,
      page,
      pageSize,
    };
  }

  async getCompany(id: string, actor: ActorContext) {
    this.assertCompanyAccess(id, actor);
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        parent: { select: { nameEn: true } },
        _count: { select: { branches: true, memberships: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
      },
    });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');
    return this.toCompanyDto(company);
  }

  async createCompany(dto: CreateCompanyDto, actor: ActorContext) {
    if (actor.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Only a platform administrator may create companies.');
    }
    const existing = await this.prisma.company.findUnique({ where: { code: dto.code } });
    if (existing) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Company code "${dto.code}" already exists.`);

    if (dto.parentCompanyId) {
      const parent = await this.prisma.company.findUnique({ where: { id: dto.parentCompanyId } });
      if (!parent) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Parent company not found.');
    }

    // The two company models are distinct and must not be conflated. A SaaS
    // tenant is provisioned against a plan; an ORYX internal company is owned by
    // the group, governed by the Platform Super Admin, and is never
    // subscription-limited, so attaching a plan to it is a modelling error.
    if (dto.type === 'INTERNAL' && dto.planId) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'An internal company is not subscription-limited and must not be given a plan.',
      );
    }

    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Plan not found.');
      if (!plan.isActive) throw badRequest(ERROR_CODES.PLAN_NOT_ACTIVE, 'Selected plan is not active.');
    }

    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          code: dto.code,
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          legalNameEn: dto.legalNameEn ?? null,
          type: dto.type,
          status: 'ACTIVE',
          industry: dto.industry ?? null,
          countryCode: dto.countryCode ?? DEFAULT_COUNTRY_CODE,
          currency: dto.currency ?? DEFAULT_CURRENCY,
          parentCompanyId: dto.parentCompanyId ?? null,
          notes: dto.notes ?? null,
        },
      });

      // Default system roles for the new tenant.
      await this.createDefaultRoles(tx, created.id);

      if (dto.planId) {
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: dto.planId } });
        const planModules = await tx.planModule.findMany({ where: { planId: plan.id } });
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + (plan.trialDays > 0 ? 0 : 1));
        const subscription = await tx.subscription.create({
          data: {
            companyId: created.id,
            planId: plan.id,
            status: plan.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
            billingPeriod: 'MONTHLY',
            price: plan.monthlyPrice,
            currency: plan.currency,
            currentPeriodEnd: periodEnd,
            licensedModules: planModules.map((m) => m.moduleKey),
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: subscription.id,
            type: 'CREATED',
            toStatus: subscription.status,
            toPlanId: plan.id,
            amount: plan.monthlyPrice,
            currency: plan.currency,
            note: 'Subscription created during company provisioning.',
            actorUserId: actor.userId,
          },
        });
      }

      return created;
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId: company.id,
      action: 'company.created',
      targetType: 'COMPANY',
      targetId: company.id,
      summary: `Created ${dto.type === 'INTERNAL' ? 'internal company' : 'SaaS tenant'} ${dto.nameEn} (${dto.code})`,
      metadata: { type: dto.type, planId: dto.planId ?? null },
      ipAddress: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });

    // Optionally invite the first company administrator.
    if (dto.adminEmail) {
      return { company: await this.getCompany(company.id, actor), adminEmail: dto.adminEmail };
    }
    return { company: await this.getCompany(company.id, actor) };
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, actor: ActorContext) {
    this.assertCompanyAccess(id, actor);
    if (actor.kind !== 'PLATFORM') {
      // Company admins may edit profile fields but never hierarchy.
      if (dto.parentCompanyId !== undefined) {
        throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Only a platform administrator may change hierarchy.');
      }
    }
    if (dto.parentCompanyId) {
      if (dto.parentCompanyId === id) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A company cannot be its own parent.');
      }
      const parent = await this.prisma.company.findUnique({ where: { id: dto.parentCompanyId } });
      if (!parent) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Parent company not found.');
      const cycle = await this.wouldCreateCycle(id, dto.parentCompanyId);
      if (cycle) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'This parent selection creates a hierarchy cycle.');
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.legalNameEn !== undefined ? { legalNameEn: dto.legalNameEn } : {}),
        ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber } : {}),
        ...(dto.parentCompanyId !== undefined ? { parentCompanyId: dto.parentCompanyId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId: id,
      action: 'company.updated',
      targetType: 'COMPANY',
      targetId: id,
      summary: `Updated company ${updated.nameEn}`,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return this.getCompany(id, actor);
  }

  async setCompanyStatus(id: string, status: string, reason: string | undefined, actor: ActorContext) {
    if (actor.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Only a platform administrator may change company status.');
    }
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');

    await this.prisma.company.update({ where: { id }, data: { status: status as never } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: id,
      action: 'company.status_changed',
      targetType: 'COMPANY',
      targetId: id,
      summary: `Company ${company.nameEn} status changed ${company.status} -> ${status}`,
      metadata: { from: company.status, to: status, reason: reason ?? null },
    });
    return this.getCompany(id, actor);
  }

  // -------------------------------------------------------------------- branches

  async listBranches(companyId: string, query: ListQueryDto, actor: ActorContext) {
    this.assertCompanyAccess(companyId, actor);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const where = {
      companyId,
      ...(query.search
        ? {
            OR: [
              { nameEn: { contains: query.search, mode: 'insensitive' as const } },
              { nameAr: { contains: query.search } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        orderBy: { nameEn: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { company: { select: { nameEn: true } }, _count: { select: { memberships: true } } },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { items: rows.map((b) => this.toBranchDto(b)), total, page, pageSize };
  }

  async createBranch(companyId: string, dto: CreateBranchDto, actor: ActorContext) {
    this.assertCompanyAccess(companyId, actor);

    const duplicate = await this.prisma.branch.findUnique({
      where: { companyId_code: { companyId, code: dto.code } },
    });
    if (duplicate) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Branch code "${dto.code}" already exists in this company.`);

    // Plan limit enforcement — never trust the UI.
    const ent = await this.entitlements.forCompany(companyId);
    const usage = await this.entitlements.usageFor(companyId);
    const limits: PlanLimits = {
      maxCompanies: ent.limits.maxCompanies,
      maxBranches: ent.limits.maxBranches,
      maxUsers: ent.limits.maxUsers,
      storageMb: ent.limits.storageMb,
      apiRequestsPerMonth: ent.limits.apiRequestsPerMonth,
    };
    const check = checkLimit(limits, 'maxBranches', usage.branches, 1);
    if (!check.ok) {
      throw forbidden(ERROR_CODES.PLAN_LIMIT_EXCEEDED, `Plan branch limit reached (${check.limit}).`, {
        limit: check.limit,
        current: check.current,
        limitName: 'maxBranches',
      });
    }

    const branch = await this.prisma.branch.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        city: dto.city ?? null,
        countryCode: dto.countryCode ?? DEFAULT_COUNTRY_CODE,
        addressLine: dto.addressLine ?? null,
        phone: dto.phone ?? null,
        timezone: dto.timezone ?? DEFAULT_TIMEZONE,
      },
      include: { company: { select: { nameEn: true } }, _count: { select: { memberships: true } } },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'branch.created',
      targetType: 'BRANCH',
      targetId: branch.id,
      summary: `Created branch ${branch.nameEn} (${branch.code})`,
    });

    return this.toBranchDto(branch);
  }

  async updateBranch(branchId: string, dto: UpdateBranchDto, actor: ActorContext) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Branch not found.');
    this.assertCompanyAccess(branch.companyId, actor);

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.addressLine !== undefined ? { addressLine: dto.addressLine } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { company: { select: { nameEn: true } }, _count: { select: { memberships: true } } },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId: branch.companyId,
      action: 'branch.updated',
      targetType: 'BRANCH',
      targetId: branchId,
      summary: `Updated branch ${updated.nameEn}`,
    });

    return this.toBranchDto(updated);
  }

  async deleteBranch(branchId: string, actor: ActorContext) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Branch not found.');
    this.assertCompanyAccess(branch.companyId, actor);

    // Soft delete preserves referential history.
    const updated = await this.prisma.branch.update({ where: { id: branchId }, data: { isActive: false } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId: branch.companyId,
      action: 'branch.deactivated',
      targetType: 'BRANCH',
      targetId: branchId,
      summary: `Deactivated branch ${updated.nameEn}`,
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------- helpers

  private assertCompanyAccess(companyId: string, actor: ActorContext): void {
    if (actor.kind === 'PLATFORM') return;
    if (actor.companyId !== companyId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'Cross-tenant access is not permitted.');
    }
  }

  private async wouldCreateCycle(companyId: string, proposedParentId: string): Promise<boolean> {
    let cursor: string | null = proposedParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === companyId) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const parent: { parentCompanyId: string | null } | null = await this.prisma.company.findUnique({
        where: { id: cursor },
        select: { parentCompanyId: true },
      });
      cursor = parent?.parentCompanyId ?? null;
    }
    return false;
  }

  private async createDefaultRoles(tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0], companyId: string) {
    for (const t of DEFAULT_COMPANY_ROLE_TEMPLATES) {
      const role = await tx.role.create({
        data: {
          companyId,
          code: t.code,
          nameEn: t.nameEn,
          nameAr: t.nameAr,
          descriptionEn: t.descriptionEn,
          isSystem: true,
        },
      });
      for (const permissionCode of t.permissions) {
        await tx.rolePermission.create({ data: { roleId: role.id, permissionCode } });
      }
    }
  }

  private toCompanyDto(c: {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    legalNameEn: string | null;
    type: string;
    status: string;
    industry: string | null;
    countryCode: string | null;
    currency: string;
    parentCompanyId: string | null;
    createdAt: Date;
    parent?: { nameEn: string } | null;
    _count?: { branches: number; memberships: number };
    subscriptions?: Array<{
      id: string;
      planId: string;
      status: string;
      billingPeriod: string;
      price: unknown;
      currency: string;
      startedAt: Date;
      currentPeriodEnd: Date | null;
      cancelledAt: Date | null;
      licensedModules: string[];
      plan: { nameEn: string; nameAr: string };
    }>;
  }): CompanyDto {
    const sub = c.subscriptions?.[0];
    return {
      id: c.id,
      code: c.code,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      legalNameEn: c.legalNameEn,
      type: c.type as CompanyDto['type'],
      status: c.status as CompanyDto['status'],
      industry: c.industry,
      countryCode: c.countryCode,
      currency: c.currency,
      parentCompanyId: c.parentCompanyId,
      parentCompanyNameEn: c.parent?.nameEn ?? null,
      createdAt: c.createdAt.toISOString(),
      branchCount: c._count?.branches,
      userCount: c._count?.memberships,
      subscription: sub
        ? {
            id: sub.id,
            companyId: c.id,
            companyNameEn: c.nameEn,
            companyNameAr: c.nameAr,
            planId: sub.planId,
            planNameEn: sub.plan.nameEn,
            planNameAr: sub.plan.nameAr,
            status: sub.status as never,
            billingPeriod: sub.billingPeriod as never,
            price: Number(sub.price),
            currency: sub.currency,
            startedAt: sub.startedAt.toISOString(),
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            cancelledAt: sub.cancelledAt?.toISOString() ?? null,
            licensedModules: sub.licensedModules,
          }
        : null,
    };
  }

  private toBranchDto(b: {
    id: string;
    companyId: string;
    code: string;
    nameEn: string;
    nameAr: string;
    city: string | null;
    countryCode: string | null;
    timezone: string;
    isActive: boolean;
    createdAt: Date;
    company?: { nameEn: string };
    _count?: { memberships: number };
  }): BranchDto {
    return {
      id: b.id,
      companyId: b.companyId,
      companyNameEn: b.company?.nameEn ?? '',
      code: b.code,
      nameEn: b.nameEn,
      nameAr: b.nameAr,
      city: b.city,
      countryCode: b.countryCode,
      timezone: b.timezone,
      isActive: b.isActive,
      createdAt: b.createdAt.toISOString(),
      userCount: b._count?.memberships,
    };
  }
}
