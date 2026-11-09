import { Injectable } from '@nestjs/common';
import { DEFAULT_CURRENCY, isKnownModule } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type {
  AssignSubscriptionDto,
  ChangeSubscriptionStatusDto,
  CreatePlanDto,
  UpdatePlanDto,
} from './plans.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertPlatform(actor: ActorContext) {
    if (actor.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Only a platform administrator may manage plans.');
    }
  }

  async listPlans(includeInactive = true) {
    const plans = await this.prisma.plan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
      include: {
        modules: { include: { module: true } },
        _count: { select: { subscriptions: true } },
      },
    });
    return plans.map((p) => this.toPlanDto(p));
  }

  async getPlan(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        modules: { include: { module: true } },
        _count: { select: { subscriptions: true } },
      },
    });
    if (!plan) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Plan not found.');
    return this.toPlanDto(plan);
  }

  async createPlan(dto: CreatePlanDto, actor: ActorContext) {
    this.assertPlatform(actor);
    const existing = await this.prisma.plan.findUnique({ where: { code: dto.code } });
    if (existing) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Plan code "${dto.code}" already exists.`);
    this.assertModulesExist(dto.modules);

    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        descriptionEn: dto.descriptionEn ?? '',
        descriptionAr: dto.descriptionAr ?? '',
        monthlyPrice: dto.monthlyPrice.toFixed(2),
        annualPrice: dto.annualPrice.toFixed(2),
        currency: dto.currency ?? DEFAULT_CURRENCY,
        isPublic: dto.isPublic ?? true,
        isActive: dto.isActive ?? true,
        trialDays: dto.trialDays ?? 14,
        maxCompanies: dto.maxCompanies,
        maxBranches: dto.maxBranches,
        maxUsers: dto.maxUsers,
        storageMb: dto.storageMb,
        apiRequestsPerMonth: dto.apiRequestsPerMonth ?? 10000,
        modules: { create: dto.modules.map((moduleKey) => ({ moduleKey })) },
      },
      include: { modules: { include: { module: true } }, _count: { select: { subscriptions: true } } },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: 'plan.created',
      targetType: 'PLAN',
      targetId: plan.id,
      summary: `Created plan ${plan.nameEn} (${plan.code})`,
      metadata: { modules: dto.modules, monthlyPrice: dto.monthlyPrice },
    });

    return this.toPlanDto(plan);
  }

  async updatePlan(id: string, dto: UpdatePlanDto, actor: ActorContext) {
    this.assertPlatform(actor);
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Plan not found.');
    if (dto.modules) this.assertModulesExist(dto.modules);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.modules) {
        await tx.planModule.deleteMany({ where: { planId: id } });
        if (dto.modules.length > 0) {
          await tx.planModule.createMany({ data: dto.modules.map((moduleKey) => ({ planId: id, moduleKey })) });
        }
      }
      return tx.plan.update({
        where: { id },
        data: {
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
          ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
          ...(dto.monthlyPrice !== undefined ? { monthlyPrice: dto.monthlyPrice.toFixed(2) } : {}),
          ...(dto.annualPrice !== undefined ? { annualPrice: dto.annualPrice.toFixed(2) } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
          ...(dto.maxCompanies !== undefined ? { maxCompanies: dto.maxCompanies } : {}),
          ...(dto.maxBranches !== undefined ? { maxBranches: dto.maxBranches } : {}),
          ...(dto.maxUsers !== undefined ? { maxUsers: dto.maxUsers } : {}),
          ...(dto.storageMb !== undefined ? { storageMb: dto.storageMb } : {}),
          ...(dto.apiRequestsPerMonth !== undefined
            ? { apiRequestsPerMonth: dto.apiRequestsPerMonth }
            : {}),
        },
        include: { modules: { include: { module: true } }, _count: { select: { subscriptions: true } } },
      });
    });

    // Existing subscriptions keep their licensedModules snapshot: plan edits
    // must never retroactively change a live tenant's entitlements.
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'plan.updated',
      targetType: 'PLAN',
      targetId: id,
      summary: `Updated plan ${updated.nameEn}`,
      metadata: dto as unknown as Record<string, unknown>,
    });

    return this.toPlanDto(updated);
  }

  private assertModulesExist(moduleKeys: string[]) {
    for (const key of moduleKeys) {
      if (!isKnownModule(key)) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown module key: ${key}`);
      }
    }
  }

  // ------------------------------------------------------------- subscriptions

  async listSubscriptions(query: { companyId?: string; status?: string }) {
    const subs = await this.prisma.subscription.findMany({
      where: {
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, company: true, events: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    return subs.map((s) => ({
      id: s.id,
      companyId: s.companyId,
      companyNameEn: s.company.nameEn,
      companyNameAr: s.company.nameAr,
      planId: s.planId,
      planNameEn: s.plan.nameEn,
      planNameAr: s.plan.nameAr,
      status: s.status,
      billingPeriod: s.billingPeriod,
      price: Number(s.price),
      currency: s.currency,
      startedAt: s.startedAt.toISOString(),
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      cancelledAt: s.cancelledAt?.toISOString() ?? null,
      licensedModules: s.licensedModules,
      events: s.events.map((e) => ({
        id: e.id,
        type: e.type,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        fromPlanId: e.fromPlanId,
        toPlanId: e.toPlanId,
        amount: e.amount ? Number(e.amount) : null,
        currency: e.currency,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
    }));
  }

  /** Assign or change a company's subscription. Writes an immutable event row. */
  async assignSubscription(companyId: string, dto: AssignSubscriptionDto, actor: ActorContext) {
    this.assertPlatform(actor);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
      include: { modules: true },
    });
    if (!plan) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Plan not found.');
    if (!plan.isActive) throw badRequest(ERROR_CODES.PLAN_NOT_ACTIVE, 'Selected plan is not active.');

    const price = dto.billingPeriod === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (dto.billingPeriod === 'ANNUAL' ? 12 : 1));
    const status = dto.status ?? (plan.trialDays > 0 ? 'TRIAL' : 'ACTIVE');

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        const updated = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            planId: plan.id,
            status,
            billingPeriod: dto.billingPeriod,
            price,
            currency: plan.currency,
            currentPeriodEnd: periodEnd,
            cancelledAt: null,
            licensedModules: plan.modules.map((m) => m.moduleKey),
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: updated.id,
            type: existing.planId === plan.id ? 'STATUS_CHANGED' : 'PLAN_CHANGED',
            fromStatus: existing.status,
            toStatus: status,
            fromPlanId: existing.planId,
            toPlanId: plan.id,
            amount: price,
            currency: plan.currency,
            note: dto.note ?? 'Subscription updated by platform administrator.',
            actorUserId: actor.userId,
          },
        });
        return updated;
      }

      const created = await tx.subscription.create({
        data: {
          companyId,
          planId: plan.id,
          status,
          billingPeriod: dto.billingPeriod,
          price,
          currency: plan.currency,
          currentPeriodEnd: periodEnd,
          licensedModules: plan.modules.map((m) => m.moduleKey),
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: created.id,
          type: 'CREATED',
          toStatus: status,
          toPlanId: plan.id,
          amount: price,
          currency: plan.currency,
          note: dto.note ?? 'Subscription assigned by platform administrator.',
          actorUserId: actor.userId,
        },
      });
      return created;
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'subscription.assigned',
      targetType: 'SUBSCRIPTION',
      targetId: result.id,
      summary: `Assigned plan ${plan.nameEn} (${dto.billingPeriod}) to ${company.nameEn}`,
      metadata: { planId: plan.id, billingPeriod: dto.billingPeriod, status },
    });

    return { id: result.id, status: result.status, licensedModules: result.licensedModules };
  }

  async changeSubscriptionStatus(
    subscriptionId: string,
    dto: ChangeSubscriptionStatusDto,
    actor: ActorContext,
  ) {
    this.assertPlatform(actor);
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: { include: { modules: true } } },
    });
    if (!subscription) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Subscription not found.');

    const isActive = dto.status === 'ACTIVE' || dto.status === 'TRIAL';
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: dto.status,
          cancelledAt: dto.status === 'CANCELLED' ? new Date() : null,
          // Entitlements are revoked immediately when the subscription stops.
          licensedModules: isActive ? subscription.plan.modules.map((m) => m.moduleKey) : [],
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          type: 'STATUS_CHANGED',
          fromStatus: subscription.status,
          toStatus: dto.status,
          fromPlanId: subscription.planId,
          toPlanId: subscription.planId,
          note: dto.note ?? null,
          actorUserId: actor.userId,
        },
      });
      return next;
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId: subscription.companyId,
      action: 'subscription.status_changed',
      targetType: 'SUBSCRIPTION',
      targetId: subscriptionId,
      summary: `Subscription status ${subscription.status} -> ${dto.status}`,
      metadata: { note: dto.note ?? null },
    });

    return { id: updated.id, status: updated.status, licensedModules: updated.licensedModules };
  }

  private toPlanDto(p: {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    descriptionEn: string;
    descriptionAr: string;
    monthlyPrice: unknown;
    annualPrice: unknown;
    currency: string;
    isPublic: boolean;
    isActive: boolean;
    trialDays: number;
    maxCompanies: number;
    maxBranches: number;
    maxUsers: number;
    storageMb: number;
    apiRequestsPerMonth: number;
    modules: Array<{ moduleKey: string; module: { nameEn: string; nameAr: string; group: string } }>;
    _count?: { subscriptions: number };
  }) {
    return {
      id: p.id,
      code: p.code,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      descriptionEn: p.descriptionEn,
      descriptionAr: p.descriptionAr,
      monthlyPrice: Number(p.monthlyPrice),
      annualPrice: Number(p.annualPrice),
      currency: p.currency,
      isPublic: p.isPublic,
      isActive: p.isActive,
      trialDays: p.trialDays,
      maxCompanies: p.maxCompanies,
      maxBranches: p.maxBranches,
      maxUsers: p.maxUsers,
      storageMb: p.storageMb,
      apiRequestsPerMonth: p.apiRequestsPerMonth,
      modules: p.modules.map((m) => ({
        moduleKey: m.moduleKey,
        nameEn: m.module.nameEn,
        nameAr: m.module.nameAr,
        group: m.module.group,
      })),
      subscriberCount: p._count?.subscriptions,
    };
  }
}
