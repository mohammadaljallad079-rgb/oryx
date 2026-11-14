import { Injectable } from '@nestjs/common';
import {
  SETTING_NAMESPACES,
  defaultSettingsFor,
  mergeSettings,
  sanitizeSettings,
  SettingsValidationError,
  type CompanySettingsMap,
  type SettingNamespace,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, ERROR_CODES } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';

/**
 * Per-company settings.
 *
 * Every read and write is scoped to a single company, resolved through
 * `ErpContextService` so a company principal can never name another tenant and a
 * platform principal must be inside an explicit context. This is the isolation
 * boundary for settings: it lives in the query, not in the UI.
 *
 * The stored value for a namespace is a full, validated object. Reads merge it
 * over the shared defaults, so a company that has never saved a namespace still
 * reads a complete, usable set of values rather than `undefined`.
 */
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: ErpContextService,
  ) {}

  /** Resolve the company scope for the caller and return it. */
  async resolveCompanyId(principal: RequestPrincipal, requestedCompanyId?: string | null): Promise<string> {
    const { companyId } = await this.context.resolveCompanyScope(principal, requestedCompanyId);
    return companyId;
  }

  /** All namespaces, merged over their defaults. */
  async all(companyId: string): Promise<CompanySettingsMap> {
    const rows = await this.prisma.companySetting.findMany({ where: { companyId } });
    const stored = new Map(rows.map((r) => [r.namespace as SettingNamespace, r.value]));
    const out = {} as CompanySettingsMap;
    for (const ns of SETTING_NAMESPACES) {
      out[ns] = mergeSettings(ns, stored.get(ns) as never) as never;
    }
    return out;
  }

  async get<N extends SettingNamespace>(companyId: string, namespace: N): Promise<CompanySettingsMap[N]> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_namespace: { companyId, namespace } },
    });
    return mergeSettings(namespace, row?.value as never);
  }

  /**
   * Save one namespace.
   *
   * The incoming value is sanitised against the shared schema before it is
   * stored, and the previous value is appended to the revision history in the
   * same transaction so a change can always be traced.
   */
  async update<N extends SettingNamespace>(
    companyId: string,
    namespace: N,
    value: unknown,
    actor: ActorContext,
  ): Promise<CompanySettingsMap[N]> {
    if (!SETTING_NAMESPACES.includes(namespace)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown settings namespace ${namespace}.`);
    }
    let clean: CompanySettingsMap[N];
    try {
      clean = sanitizeSettings(namespace, value);
    } catch (err) {
      if (err instanceof SettingsValidationError) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, err.message);
      }
      throw err;
    }

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.companySetting.findUnique({
        where: { companyId_namespace: { companyId, namespace } },
      });
      if (previous) {
        await tx.companySettingRevision.create({
          data: {
            companyId,
            namespace,
            value: previous.value as never,
            changedById: actor.userId,
          },
        });
      }
      await tx.companySetting.upsert({
        where: { companyId_namespace: { companyId, namespace } },
        create: { companyId, namespace, value: clean as never, updatedById: actor.userId },
        update: { value: clean as never, updatedById: actor.userId },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'settings.update',
      targetType: 'CompanySetting',
      targetId: `${companyId}:${namespace}`,
      summary: `Updated ${namespace} settings`,
      metadata: { namespace },
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });

    return clean;
  }

  /** Change history for a namespace, newest first. */
  async history(companyId: string, namespace?: SettingNamespace, take = 25) {
    return this.prisma.companySettingRevision.findMany({
      where: { companyId, ...(namespace ? { namespace } : {}) },
      orderBy: { changedAt: 'desc' },
      take,
    });
  }

  /** Reset a namespace to the shared defaults, recording the previous value. */
  async reset(companyId: string, namespace: SettingNamespace, actor: ActorContext) {
    return this.update(companyId, namespace, defaultSettingsFor(namespace), actor);
  }
}
