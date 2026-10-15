import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ERROR_CODES, badRequest } from './errors';

/**
 * Resolves which tenant company a consumer-facing action belongs to.
 *
 * A customer account is not itself tenant-scoped: it may hold a
 * `defaultCompanyId` once it has been linked, and otherwise the platform has to
 * choose. Choosing the *oldest* active company is wrong — the oldest row is an
 * internal ORYX company (the holding entity, or a non-automotive line of
 * business) that publishes no marketplace providers and keeps no booking
 * resources, so the consumer sees an empty directory and no available slots.
 *
 * The rule here is therefore: prefer the requested company, else the oldest
 * active company that can actually serve a customer, else the oldest active
 * company, so a fresh install without any published provider still works.
 */
@Injectable()
export class TenantCompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pick the company for a consumer action.
   *
   * `preferred` is honoured only when it exists and is active, so a stale
   * `defaultCompanyId` pointing at a suspended or archived tenant cannot be
   * used to reach data.
   */
  async resolveForCustomer(preferred?: string | null): Promise<string> {
    if (preferred) {
      const company = await this.prisma.company.findFirst({
        where: { id: preferred, status: 'ACTIVE' },
        select: { id: true },
      });
      if (company) return company.id;
    }

    for (const ids of await this.customerFacingCompanyIds()) {
      if (ids.length === 0) continue;
      const company = await this.prisma.company.findFirst({
        where: { status: 'ACTIVE', id: { in: ids } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (company) return company.id;
    }

    const fallback = await this.prisma.company.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!fallback) {
      throw badRequest(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        'No active company is available to serve this request.',
      );
    }
    return fallback.id;
  }

  /**
   * Candidate companies in priority order.
   *
   * Scheduling comes first: a company that operates bookable resources can offer
   * slots, which is what a consumer booking needs. A company that merely owns an
   * approved provider is a valid marketplace destination but may keep no working
   * hours at all, so it is only a second choice. Each tier is a separate list so
   * an empty higher tier falls through instead of blocking the lower one.
   *
   * `MarketplaceProvider.providerCompanyId` is a plain column without a relation,
   * so it is read directly rather than through a nested filter.
   */
  private async customerFacingCompanyIds(): Promise<string[][]> {
    const [resources, providers] = await Promise.all([
      this.prisma.bookingResource.findMany({
        where: { isActive: true },
        select: { companyId: true },
        distinct: ['companyId'],
      }),
      this.prisma.marketplaceProvider.findMany({
        where: { status: 'APPROVED', providerCompanyId: { not: null } },
        select: { providerCompanyId: true },
      }),
    ]);

    return [
      resources.map((row) => row.companyId),
      providers
        .map((row) => row.providerCompanyId)
        .filter((id): id is string => typeof id === 'string'),
    ];
  }
}
