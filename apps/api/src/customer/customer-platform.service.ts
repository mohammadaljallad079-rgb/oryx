import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ERROR_CODES, notFound } from '../common/errors';

/**
 * The staff-facing view of the customer platform.
 *
 * The consumer plane owns its own rows and enforces ownership from the bearer
 * token. This service is the other half of the `customer_portal` module: it lets
 * an operator see the consumers registered against their company, the vehicles
 * they hold in the garage, and the marketplace and booking activity they
 * generated — without ever being able to read a password hash, an MFA secret or
 * another tenant's consumer.
 *
 * **Tenant scoping is the invariant here.** Every query is filtered by the
 * caller's `companyId`, which the controller takes from the principal and never
 * from the request. A consumer with no linked company appears in no tenant's
 * list, because `defaultCompanyId` is what ties them to a tenant.
 */

/** Fields safe to return to staff. Never a hash, a secret or a reset token. */
const ACCOUNT_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  preferredLocale: true,
  preferredTheme: true,
  defaultCompanyId: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  lastLoginAt: true,
  lockedUntil: true,
  mfaEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CustomerPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List consumers linked to a company.
   *
   * `defaultCompanyId` is the tenant link. A consumer that never registered a
   * vehicle or made a booking has no company yet, so they are simply absent
   * rather than exposed to every tenant.
   */
  async listAccounts(params: {
    companyId: string;
    search?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const search = params.search?.trim();
    const where = {
      defaultCompanyId: params.companyId,
      ...(params.status ? { status: params.status as never } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customerAccount.findMany({
        where,
        select: {
          ...ACCOUNT_SELECT,
          _count: { select: { vehicles: true, bookings: true, serviceRequests: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.customerAccount.count({ where }),
    ]);

    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  /**
   * One consumer with their garage and recent activity.
   *
   * Scoped by company, so an id from another tenant resolves to nothing.
   */
  async getAccount(companyId: string, accountId: string) {
    const account = await this.prisma.customerAccount.findFirst({
      where: { id: accountId, defaultCompanyId: companyId },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer account not found.');

    const [vehicles, bookings, addresses, requests] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { customerAccountId: accountId, companyId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vin: true,
          plateNumber: true,
          make: true,
          model: true,
          modelYear: true,
          color: true,
          mileage: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.bookingSlot.findMany({
        where: { customerAccountId: accountId, companyId },
        orderBy: { startsAt: 'desc' },
        take: 25,
        select: {
          id: true,
          bookingType: true,
          status: true,
          serviceRef: true,
          startsAt: true,
          durationMinutes: true,
          resource: { select: { code: true, nameEn: true, nameAr: true } },
        },
      }),
      this.prisma.customerAddress.findMany({
        where: { accountId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          label: true,
          addressLine1: true,
          city: true,
          area: true,
          countryCode: true,
          isDefault: true,
        },
      }),
      this.prisma.serviceRequest.findMany({
        where: { customerAccountId: accountId, companyId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          requestNumber: true,
          categoryKey: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return { ...account, vehicles, bookings, addresses, requests };
  }

  /**
   * Link a consumer account to a tenant customer record.
   *
   * Used when an operator confirms that a website account and an ERP customer
   * are the same person. The account's `defaultCompanyId` is what makes the
   * consumer visible to this tenant afterwards.
   */
  async linkToCustomer(
    companyId: string,
    accountId: string,
    input: { customerId: string; actorUserId: string },
  ) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer account not found.');

    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, companyId },
    });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found.');

    const updated = await this.prisma.customerAccount.update({
      where: { id: accountId },
      data: { defaultCompanyId: companyId },
      select: ACCOUNT_SELECT,
    });

    await this.audit.record({
      actorUserId: input.actorUserId,
      companyId,
      action: 'customer_portal.account.link',
      targetType: 'CustomerAccount',
      targetId: accountId,
      summary: `Linked consumer ${account.email} to customer ${customer.code}`,
      metadata: { customerId: customer.id },
    });

    return updated;
  }

  /**
   * Suspend or reinstate a consumer account.
   *
   * A suspended account cannot sign in; the check lives in `CustomerAuthService`.
   * Revoking the refresh tokens here means an already-open session ends too,
   * rather than lingering until its access token expires.
   */
  async setAccountStatus(
    companyId: string,
    accountId: string,
    input: { status: 'ACTIVE' | 'SUSPENDED'; reason: string; actorUserId: string },
  ) {
    const account = await this.prisma.customerAccount.findFirst({
      where: { id: accountId, defaultCompanyId: companyId },
    });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer account not found.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.customerAccount.update({
        where: { id: accountId },
        data: { status: input.status },
        select: ACCOUNT_SELECT,
      });
      if (input.status === 'SUSPENDED') {
        await tx.customerRefreshToken.updateMany({
          where: { accountId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return next;
    });

    await this.audit.record({
      actorUserId: input.actorUserId,
      companyId,
      action: `customer_portal.account.${input.status === 'SUSPENDED' ? 'suspend' : 'reinstate'}`,
      targetType: 'CustomerAccount',
      targetId: accountId,
      summary: `${input.status === 'SUSPENDED' ? 'Suspended' : 'Reinstated'} consumer ${account.email}`,
      metadata: { reason: input.reason },
    });

    return updated;
  }

  /** Counters for the customer platform dashboard tiles. */
  async summary(companyId: string) {
    const [accounts, active, vehicles, bookings, openRequests] = await Promise.all([
      this.prisma.customerAccount.count({ where: { defaultCompanyId: companyId } }),
      this.prisma.customerAccount.count({
        where: { defaultCompanyId: companyId, status: 'ACTIVE' },
      }),
      this.prisma.vehicle.count({ where: { companyId, customerAccountId: { not: null } } }),
      this.prisma.bookingSlot.count({ where: { companyId, customerAccountId: { not: null } } }),
      this.prisma.serviceRequest.count({
        where: {
          companyId,
          customerAccountId: { not: null },
          status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] },
        },
      }),
    ]);

    return { accounts, active, vehicles, bookings, openRequests };
  }
}
