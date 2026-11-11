import { Injectable } from '@nestjs/common';
import type { Prisma } from '@oryx/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type { CreateTaxRateDto, ListTaxRateQueryDto, UpdateTaxRateDto } from './tax.dto';

/**
 * Tenant-managed taxes.
 *
 * The operator picks a saved tax from a dropdown instead of typing a percentage
 * into every line. The rate is stored in basis points, the same unit the
 * document lines and the company default already use, so no conversion happens
 * at the boundary.
 *
 * Nothing here rewrites an issued document: a line stores its own `taxPercentBp`
 * at issue time, so editing a tax only affects documents created afterwards.
 */
@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: ErpContextService,
  ) {}

  async list(query: ListTaxRateQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const includeInactive = query.includeInactive === 'true';
    const rows = await this.prisma.taxRate.findMany({
      where: {
        companyId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(query.scope && query.scope !== 'BOTH'
          ? { scope: { in: [query.scope, 'BOTH'] } }
          : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { nameEn: { contains: query.search, mode: 'insensitive' } },
                { nameAr: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async create(dto: CreateTaxRateDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.taxRate.findUnique({
      where: { companyId_code: { companyId, code: dto.code } },
    });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Tax ${dto.code} already exists.`);

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, companyId);
      return tx.taxRate.create({
        data: {
          companyId,
          code: dto.code,
          nameEn: dto.nameEn,
          nameAr: dto.nameAr,
          rateBp: dto.rateBp,
          scope: dto.scope ?? 'BOTH',
          applicationLevel: dto.applicationLevel ?? 'LINE',
          pricesIncludeTax: dto.pricesIncludeTax ?? false,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    });

    if (row.isDefault) await this.syncCompanyDefault(companyId, row.rateBp);
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'tax.created',
      targetType: 'TAX_RATE',
      targetId: row.id,
      summary: `Created tax ${row.code} at ${row.rateBp / 100}%`,
    });
    return row;
  }

  async update(id: string, dto: UpdateTaxRateDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.taxRate.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Tax not found.');

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await this.clearDefault(tx, companyId, id);
      return tx.taxRate.update({
        where: { id },
        data: {
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.rateBp !== undefined ? { rateBp: dto.rateBp } : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
          ...(dto.applicationLevel !== undefined ? { applicationLevel: dto.applicationLevel } : {}),
          ...(dto.pricesIncludeTax !== undefined ? { pricesIncludeTax: dto.pricesIncludeTax } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
    });

    if (row.isDefault) await this.syncCompanyDefault(companyId, row.rateBp);
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'tax.updated',
      targetType: 'TAX_RATE',
      targetId: row.id,
      summary: `Updated tax ${row.code}`,
    });
    return row;
  }

  async setActive(id: string, isActive: boolean, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.taxRate.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Tax not found.');
    // A default tax that is switched off would leave new lines without a
    // pre-selected rate, so the flag is cleared with the deactivation.
    const row = await this.prisma.taxRate.update({
      where: { id },
      data: { isActive, ...(isActive ? {} : { isDefault: false }) },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: isActive ? 'tax.activated' : 'tax.deactivated',
      targetType: 'TAX_RATE',
      targetId: row.id,
      summary: `${isActive ? 'Activated' : 'Deactivated'} tax ${row.code}`,
    });
    return row;
  }

  async remove(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.taxRate.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Tax not found.');
    await this.prisma.taxRate.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'tax.deleted',
      targetType: 'TAX_RATE',
      targetId: id,
      summary: `Deleted tax ${existing.code}`,
    });
    return { deleted: true };
  }

  /** At most one default per company; a partial unique index enforces it. */
  private async clearDefault(
    tx: Prisma.TransactionClient,
    companyId: string,
    exceptId?: string,
  ) {
    await tx.taxRate.updateMany({
      where: { companyId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  /**
   * Mirror the default tax onto the company's `defaultTaxRateBp`, which seeds a
   * new line before the operator picks anything. A rate the operator set by hand
   * on the company row is only overwritten when they explicitly mark a tax as
   * the default, so the two never silently diverge.
   */
  private async syncCompanyDefault(companyId: string, rateBp: number) {
    if (rateBp < 0) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Tax rate cannot be negative.');
    await this.prisma.company.update({
      where: { id: companyId },
      data: { defaultTaxRateBp: rateBp },
    });
  }
}
