import { Injectable, Logger } from '@nestjs/common';
import { basisPointsOfMinor, currencyScale } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import {
  AccountingPostingService,
  SYSTEM_ROLES,
  type Tx,
} from '../common/accounting-posting.service';
import { ERROR_CODES, badRequest, conflict, forbidden, notFound } from '../common/errors';
import { NotificationService } from '../notifications/notification.service';

export interface ProviderApplicationInput {
  legalNameEn: string;
  legalNameAr: string;
  contactEmail: string;
  contactPhone: string;
  registrationNumber?: string;
  taxNumber?: string;
  countryCode?: string;
  city?: string;
  addressLine?: string;
  categoryKeys?: string[];
}

/**
 * The automotive marketplace: provider onboarding, listings, service requests,
 * commissions, settlements, reviews and disputes.
 *
 * ## Isolation
 *
 * A provider is a marketplace participant, not a tenant. Every provider-scoped
 * method takes the provider id resolved from the caller's own membership
 * (`ProviderUser`), never from the request path alone, and asserts it matches.
 * A provider user therefore cannot read another provider's requests, settlement
 * figures or disputes.
 *
 * ## Money
 *
 * A commission is computed once, at completion, from the request's amount and
 * the provider's rate, then stored as its own row. A later rate change therefore
 * cannot rewrite settled history.
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly notifications: NotificationService,
  ) {}

  // ------------------------------------------------------------- applications

  /**
   * Submit a provider application.
   *
   * An application is deliberately separate from a provider record: an applicant
   * has no access to anything until a platform operator approves it, and the
   * application itself keeps the decision, the reviewer and the note.
   */
  async submitApplication(input: ProviderApplicationInput) {
    const email = input.contactEmail.trim().toLowerCase();

    const openApplication = await this.prisma.marketplaceApplication.findFirst({
      where: { contactEmail: email, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    });
    if (openApplication) {
      throw conflict(
        ERROR_CODES.APPLICATION_PENDING,
        'An application from this email is already awaiting review.',
      );
    }

    const code = await this.nextApplicationCode();
    const application = await this.prisma.marketplaceApplication.create({
      data: {
        code,
        legalNameEn: input.legalNameEn.trim(),
        legalNameAr: input.legalNameAr.trim(),
        contactEmail: email,
        contactPhone: input.contactPhone.trim(),
        registrationNumber: input.registrationNumber ?? null,
        taxNumber: input.taxNumber ?? null,
        countryCode: (input.countryCode ?? 'BH').toUpperCase(),
        city: input.city ?? null,
        addressLine: input.addressLine ?? null,
        categoryKeys: input.categoryKeys ?? [],
        status: 'SUBMITTED',
      },
    });

    await this.audit.record({
      action: 'marketplace.application_submitted',
      targetType: 'MARKETPLACE_APPLICATION',
      targetId: application.id,
      summary: `Provider application ${code} submitted by ${email}.`,
    });

    return application;
  }

  async listApplications(status?: string) {
    return this.prisma.marketplaceApplication.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Approve an application, creating the provider record.
   *
   * The provider's commission rate is set here, at approval, rather than by the
   * applicant. Both writes happen in one transaction so an approved application
   * always has a provider behind it.
   */
  async approveApplication(
    applicationId: string,
    input: { commissionPercentBp: number; providerCompanyId?: string | null },
    reviewerId: string,
  ) {
    const application = await this.prisma.marketplaceApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Application not found.');
    if (application.status === 'APPROVED') {
      throw conflict(ERROR_CODES.PROVIDER_STATE, 'This application is already approved.');
    }
    if (application.status === 'WITHDRAWN') {
      throw conflict(ERROR_CODES.PROVIDER_STATE, 'A withdrawn application cannot be approved.');
    }
    if (input.commissionPercentBp < 0 || input.commissionPercentBp > 10_000) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'The commission rate must be between 0 and 10000 basis points.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.marketplaceProvider.create({
        data: {
          code: application.code,
          nameEn: application.legalNameEn,
          nameAr: application.legalNameAr,
          providerCompanyId: input.providerCompanyId ?? null,
          categoryKey: application.categoryKeys[0] ?? null,
          email: application.contactEmail,
          phone: application.contactPhone,
          status: 'APPROVED',
          commissionPercentBp: input.commissionPercentBp,
          approvedAt: new Date(),
        },
      });

      await tx.marketplaceApplication.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
          providerId: provider.id,
        },
      });

      // Default availability so a new provider is bookable without extra setup.
      await tx.providerAvailability.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          providerId: provider.id,
          dayOfWeek: day,
          opensMinute: 8 * 60,
          closesMinute: 18 * 60,
          isClosed: day === 5,
          minimumNoticeMinutes: 120,
        })),
      });

      await this.audit.record({
        actorUserId: reviewerId,
        action: 'marketplace.application_approved',
        targetType: 'MARKETPLACE_PROVIDER',
        targetId: provider.id,
        summary: `Provider ${provider.code} approved with commission ${input.commissionPercentBp} bp.`,
      });

      return provider;
    });
  }

  async rejectApplication(applicationId: string, note: string, reviewerId: string) {
    const application = await this.prisma.marketplaceApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Application not found.');
    if (application.status === 'APPROVED') {
      throw conflict(ERROR_CODES.PROVIDER_STATE, 'An approved application cannot be rejected.');
    }
    return this.prisma.marketplaceApplication.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        reviewNote: note,
      },
    });
  }

  // ---------------------------------------------------------------- providers

  /** Public provider directory: approved providers only. */
  async listPublicProviders(params: {
    categoryKey?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      status: 'APPROVED' as never,
      ...(params.categoryKey ? { categoryKey: params.categoryKey } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.marketplaceProvider.findMany({
        where,
        orderBy: { nameEn: 'asc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          code: true,
          nameEn: true,
          nameAr: true,
          categoryKey: true,
          phone: true,
          email: true,
          listings: {
            where: { isActive: true },
            select: {
              id: true,
              categoryKey: true,
              nameEn: true,
              nameAr: true,
              priceMinor: true,
              currency: true,
            },
          },
          reviews: { where: { status: 'PUBLISHED' }, select: { rating: true } },
        },
      }),
      this.prisma.marketplaceProvider.count({ where }),
    ]);

    // Aggregate the rating here so the directory shows a real average rather
    // than exposing individual reviews.
    return {
      items: items.map(({ reviews, ...provider }) => {
        const ratings = reviews.map((r) => r.rating);
        return {
          ...provider,
          reviewCount: ratings.length,
          averageRating:
            ratings.length > 0
              ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
              : null,
        };
      }),
      total,
    };
  }

  async getPublicProvider(providerId: string) {
    const provider = await this.prisma.marketplaceProvider.findFirst({
      where: { id: providerId, status: 'APPROVED' },
      include: {
        listings: { where: { isActive: true }, orderBy: { nameEn: 'asc' } },
        availability: { orderBy: { dayOfWeek: 'asc' } },
        reviews: {
          where: { status: 'PUBLISHED' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            rating: true,
            title: true,
            comment: true,
            providerReply: true,
            providerRepliedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    const ratings = provider.reviews.map((r) => r.rating);
    return {
      ...provider,
      reviewCount: ratings.length,
      averageRating:
        ratings.length > 0
          ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
          : null,
    };
  }

  /**
   * Resolve the provider id for an authenticated provider user.
   *
   * This is the isolation boundary for the provider portal: a request carries a
   * user, and the provider it may act for is looked up from membership. A
   * provider id supplied by the client is never trusted on its own.
   */
  async resolveProviderForUser(userId: string, providerId?: string) {
    const memberships = await this.prisma.providerUser.findMany({
      where: { userId, isActive: true },
      include: { provider: true },
    });
    if (memberships.length === 0) {
      throw forbidden(
        ERROR_CODES.FORBIDDEN_TENANT,
        'This account is not a marketplace provider user.',
      );
    }
    if (providerId) {
      const match = memberships.find((m) => m.providerId === providerId);
      if (!match) {
        throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'You do not have access to this provider.');
      }
      return match.provider;
    }
    return memberships[0].provider;
  }

  /** Link a staff user to a provider so they can use the provider portal. */
  async addProviderUser(providerId: string, userId: string, role = 'STAFF') {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    return this.prisma.providerUser.upsert({
      where: { providerId_userId: { providerId, userId } },
      create: { providerId, userId, role },
      update: { role, isActive: true },
    });
  }

  async updateProviderProfile(
    providerId: string,
    input: { nameEn?: string; nameAr?: string; phone?: string; email?: string; categoryKey?: string },
  ) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    const data: Record<string, unknown> = {};
    for (const key of ['nameEn', 'nameAr', 'phone', 'email', 'categoryKey'] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    if (Object.keys(data).length === 0) return provider;
    return this.prisma.marketplaceProvider.update({ where: { id: providerId }, data });
  }

  /** Platform decision to suspend or reinstate a provider. */
  async setProviderStatus(providerId: string, status: 'APPROVED' | 'SUSPENDED', actorId: string) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    const updated = await this.prisma.marketplaceProvider.update({
      where: { id: providerId },
      data: { status },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'marketplace.provider_status_changed',
      targetType: 'MARKETPLACE_PROVIDER',
      targetId: providerId,
      summary: `Provider ${provider.code} set to ${status}.`,
    });

    return updated;
  }

  // ----------------------------------------------------------------- listings

  async listListings(providerId: string, includeInactive = false) {
    return this.prisma.providerServiceListing.findMany({
      where: { providerId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { nameEn: 'asc' },
    });
  }

  async createListing(
    providerId: string,
    input: {
      categoryKey: string;
      nameEn: string;
      nameAr: string;
      description?: string;
      priceMinor: number;
      currency?: string;
    },
  ) {
    if (input.priceMinor < 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A price cannot be negative.');
    }
    return this.prisma.providerServiceListing.create({
      data: {
        providerId,
        categoryKey: input.categoryKey,
        nameEn: input.nameEn.trim(),
        nameAr: input.nameAr.trim(),
        description: input.description ?? null,
        priceMinor: input.priceMinor,
        currency: input.currency ?? 'BHD',
      },
    });
  }

  async updateListing(
    providerId: string,
    listingId: string,
    input: {
      nameEn?: string;
      nameAr?: string;
      description?: string;
      priceMinor?: number;
      isActive?: boolean;
    },
  ) {
    const listing = await this.prisma.providerServiceListing.findFirst({
      where: { id: listingId, providerId },
    });
    if (!listing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Listing not found.');

    const data: Record<string, unknown> = {};
    for (const key of ['nameEn', 'nameAr', 'description', 'isActive'] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    if (input.priceMinor !== undefined) {
      if (input.priceMinor < 0) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A price cannot be negative.');
      }
      data.priceMinor = input.priceMinor;
    }
    if (Object.keys(data).length === 0) return listing;
    return this.prisma.providerServiceListing.update({ where: { id: listingId }, data });
  }

  // ------------------------------------------------------------- availability

  async getAvailability(providerId: string) {
    return this.prisma.providerAvailability.findMany({
      where: { providerId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /**
   * Replace a provider's weekly availability.
   *
   * Replaced as a set, so a day omitted from the payload is closed. The provider
   * also receives a `BookingResource` so the shared scheduling engine can see
   * its hours; the two are kept in step here rather than by a background job.
   */
  async setAvailability(
    providerId: string,
    hours: Array<{
      dayOfWeek: number;
      opensMinute: number;
      closesMinute: number;
      isClosed?: boolean;
      minimumNoticeMinutes?: number;
    }>,
  ) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    for (const row of hours) {
      if (row.dayOfWeek < 0 || row.dayOfWeek > 6) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'dayOfWeek must be between 0 and 6.');
      }
      if (!row.isClosed && row.closesMinute <= row.opensMinute) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Closing time must be after opening time.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.providerAvailability.deleteMany({ where: { providerId } });
      await tx.providerAvailability.createMany({
        data: hours.map((row) => ({
          providerId,
          dayOfWeek: row.dayOfWeek,
          opensMinute: row.opensMinute,
          closesMinute: row.closesMinute,
          isClosed: row.isClosed ?? false,
          minimumNoticeMinutes: row.minimumNoticeMinutes ?? 60,
        })),
      });
      return tx.providerAvailability.findMany({
        where: { providerId },
        orderBy: { dayOfWeek: 'asc' },
      });
    });
  }

  /**
   * The `BookingResource` that represents a provider in the scheduling engine.
   *
   * A provider's slots are keyed by this resource, which is what makes the
   * partial unique index reject a double-booking of the same provider and time.
   */
  async ensureBookingResource(providerId: string, companyId: string) {
    const existing = await this.prisma.bookingResource.findFirst({
      where: { providerId, companyId },
    });
    if (existing) return existing;

    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    return this.prisma.bookingResource.create({
      data: {
        companyId,
        resourceType: 'PROVIDER',
        code: `PROV-${provider.code}`.slice(0, 40),
        nameEn: provider.nameEn,
        nameAr: provider.nameAr,
        providerId,
        capacity: 1,
      },
    });
  }

  // ---------------------------------------------------------- service requests

  /**
   * Resolve the tenant a marketplace request belongs to.
   *
   * A consumer account may not have a default company yet (the garage assigns
   * one on first vehicle registration). Falling back to the oldest active
   * company keeps a request raisable, and the chosen company is recorded on the
   * request so routing and settlement stay deterministic.
   */
  async resolveRequestCompany(preferred: string | null): Promise<string> {
    if (preferred) {
      const company = await this.prisma.company.findUnique({ where: { id: preferred } });
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
        'No active company is available to receive this request.',
      );
    }
    return fallback.id;
  }

  /**
   * Raise a service request from the website or app.
   *
   * The request starts `NEW` and unassigned. A marketplace request does not
   * choose its own provider: assignment is either a provider accepting it or the
   * platform routing it, which is what keeps the audit trail meaningful.
   */
  async createServiceRequest(input: {
    companyId: string;
    customerAccountId: string;
    categoryKey: string;
    description?: string;
    vehicleId?: string | null;
    customerId?: string | null;
    createdById: string;
  }) {
    if (input.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, customerAccountId: input.customerAccountId },
      });
      if (!vehicle) {
        throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That vehicle is not in your garage.');
      }
    }

    const requestNumber = await this.nextRequestNumber(input.companyId);
    const request = await this.prisma.serviceRequest.create({
      data: {
        companyId: input.companyId,
        requestNumber,
        customerId: input.customerId ?? null,
        customerAccountId: input.customerAccountId,
        vehicleId: input.vehicleId ?? null,
        categoryKey: input.categoryKey,
        description: input.description ?? null,
        status: 'NEW',
        createdById: input.createdById,
      },
    });

    await this.audit.record({
      action: 'marketplace.request_created',
      companyId: input.companyId,
      targetType: 'SERVICE_REQUEST',
      targetId: request.id,
      summary: `Service request ${requestNumber} raised for category ${input.categoryKey}.`,
    });

    return request;
  }

  /**
   * Requests a provider may act on.
   *
   * Only open requests in a category the provider lists are offered, plus the
   * provider's own assigned work. A provider never sees another provider's
   * assignments.
   */
  async listProviderRequests(
    providerId: string,
    params: { status?: string; page: number; pageSize: number },
  ) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    const listings = await this.prisma.providerServiceListing.findMany({
      where: { providerId, isActive: true },
      select: { categoryKey: true },
    });
    const categories = [...new Set(listings.map((l) => l.categoryKey))];

    const where = {
      ...(params.status
        ? { status: params.status as never }
        : { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] as never[] } }),
      OR: [{ providerId }, { providerId: null, categoryKey: { in: categories } }],
    };

    const [items, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { customerAccount: { select: { fullName: true, phone: true } } },
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Accept a request.
   *
   * Assignment uses a conditional update: the request is claimed only if it is
   * still unassigned. Two providers racing to accept the same job therefore
   * cannot both win, because the second update matches no row.
   */
  async acceptRequest(providerId: string, requestId: string, actorId: string) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    if (provider.status !== 'APPROVED') {
      throw forbidden(ERROR_CODES.PROVIDER_STATE, 'Only an approved provider can accept requests.');
    }

    const result = await this.prisma.serviceRequest.updateMany({
      where: { id: requestId, providerId: null, status: 'NEW' },
      data: { providerId, status: 'ASSIGNED', assignedAt: new Date() },
    });

    if (result.count === 0) {
      const current = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
      if (!current) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service request not found.');
      throw conflict(
        ERROR_CODES.REQUEST_ALREADY_ASSIGNED,
        'This request has already been taken by another provider.',
      );
    }

    const request = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });

    await this.audit.record({
      actorUserId: actorId,
      action: 'marketplace.request_accepted',
      companyId: request.companyId,
      targetType: 'SERVICE_REQUEST',
      targetId: request.id,
      summary: `Provider ${provider.code} accepted request ${request.requestNumber}.`,
    });

    return request;
  }

  /**
   * Decline an offer.
   *
   * A decline does not consume the request: it is recorded as an audit event and
   * the request stays open for another provider. This is why the request is not
   * moved to a "declined" state.
   */
  async declineRequest(providerId: string, requestId: string, reason: string, actorId: string) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service request not found.');
    if (request.providerId === providerId) {
      throw conflict(
        ERROR_CODES.REQUEST_STATE,
        'Use the cancellation flow to release a request you have already accepted.',
      );
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'marketplace.request_declined',
      companyId: request.companyId,
      targetType: 'SERVICE_REQUEST',
      targetId: request.id,
      summary: `Provider ${providerId} declined request ${request.requestNumber}: ${reason}`,
    });

    return { declined: true };
  }

  async startRequest(providerId: string, requestId: string) {
    const request = await this.assertProviderOwnsRequest(providerId, requestId);
    if (request.status !== 'ASSIGNED') {
      throw conflict(ERROR_CODES.REQUEST_STATE, `A ${request.status} request cannot be started.`);
    }
    return this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: 'IN_PROGRESS' },
    });
  }

  /**
   * Complete a request and record the commission.
   *
   * The commission is calculated from the provider's current rate and the final
   * amount, then stored as its own row, so a later rate change does not alter
   * what is owed for this job.
   */
  async completeRequest(
    providerId: string,
    requestId: string,
    input: { finalAmountMinor: number; currency?: string },
    actorId: string,
  ) {
    const request = await this.assertProviderOwnsRequest(providerId, requestId);
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(request.status)) {
      throw conflict(ERROR_CODES.REQUEST_STATE, `A ${request.status} request cannot be completed.`);
    }
    if (input.finalAmountMinor < 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A final amount cannot be negative.');
    }

    const provider = await this.prisma.marketplaceProvider.findUniqueOrThrow({
      where: { id: providerId },
    });

    const currency = input.currency ?? 'BHD';
    const commissionMinor = basisPointsOfMinor(input.finalAmountMinor, provider.commissionPercentBp);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await tx.marketplaceCommission.create({
        data: {
          companyId: request.companyId,
          serviceRequestId: request.id,
          providerId,
          baseMinor: input.finalAmountMinor,
          rateBp: provider.commissionPercentBp,
          commissionMinor,
          currency,
          status: 'PENDING',
        },
      });

      await this.audit.record({
        actorUserId: actorId,
        action: 'marketplace.request_completed',
        companyId: request.companyId,
        targetType: 'SERVICE_REQUEST',
        targetId: request.id,
        summary: `Request ${request.requestNumber} completed; commission ${commissionMinor} minor units recorded.`,
      });

      return updated;
    });
  }

  async cancelRequest(
    requestId: string,
    reason: string,
    actorKind: 'CUSTOMER' | 'PROVIDER' | 'PLATFORM',
    actorId: string,
    customerAccountId?: string,
  ) {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service request not found.');
    if (request.status === 'COMPLETED') {
      throw conflict(ERROR_CODES.REQUEST_STATE, 'A completed request cannot be cancelled.');
    }
    // A customer may only cancel their own request.
    if (actorKind === 'CUSTOMER' && request.customerAccountId !== customerAccountId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That request does not belong to you.');
    }
    if (actorKind === 'PROVIDER' && request.providerId !== actorId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That request is not assigned to you.');
    }

    const updated = await this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });

    // The reason is recorded on the audit trail rather than overwriting the
    // customer's original description of the fault.
    await this.audit.record({
      actorUserId: actorKind === 'CUSTOMER' ? null : actorId,
      action: 'marketplace.request_cancelled',
      companyId: request.companyId,
      targetType: 'SERVICE_REQUEST',
      targetId: request.id,
      summary: `Request ${request.requestNumber} cancelled by ${actorKind}: ${reason}`,
    });

    return updated;
  }

  /** The customer's own service requests, for the website and app. */
  async listCustomerRequests(
    customerAccountId: string,
    params: { page: number; pageSize: number },
  ) {
    const where = { customerAccountId };
    const [items, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          provider: { select: { id: true, nameEn: true, nameAr: true, phone: true } },
          reviews: { select: { id: true, rating: true, status: true } },
        },
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return { items, total };
  }

  private async assertProviderOwnsRequest(providerId: string, requestId: string) {
    const request = await this.prisma.serviceRequest.findFirst({
      where: { id: requestId, providerId },
    });
    if (!request) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That request is not assigned to you.');
    }
    return request;
  }

  // ---------------------------------------------------------------- reviews

  /**
   * Leave a review.
   *
   * Only a customer who actually had the work done may review, and only once per
   * request — enforced by `@@unique([customerAccountId, serviceRequestId])`.
   * Reviews start `PENDING` and become visible when moderated.
   */
  async createReview(input: {
    customerAccountId: string;
    serviceRequestId: string;
    rating: number;
    title?: string;
    comment?: string;
  }) {
    if (input.rating < 1 || input.rating > 5) {
      throw badRequest(ERROR_CODES.REVIEW_INVALID_RATING, 'A rating must be between 1 and 5.');
    }

    const request = await this.prisma.serviceRequest.findFirst({
      where: { id: input.serviceRequestId, customerAccountId: input.customerAccountId },
    });
    if (!request) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That request does not belong to you.');
    }
    if (request.status !== 'COMPLETED') {
      throw conflict(
        ERROR_CODES.REVIEW_NOT_ELIGIBLE,
        'You can review a service only after it completes.',
      );
    }
    if (!request.providerId) {
      throw conflict(ERROR_CODES.REVIEW_NOT_ELIGIBLE, 'This request has no provider to review.');
    }

    const existing = await this.prisma.providerReview.findFirst({
      where: {
        customerAccountId: input.customerAccountId,
        serviceRequestId: input.serviceRequestId,
      },
    });
    if (existing) {
      throw conflict(
        ERROR_CODES.REVIEW_ALREADY_SUBMITTED,
        'You have already reviewed this service.',
      );
    }

    return this.prisma.providerReview.create({
      data: {
        providerId: request.providerId,
        serviceRequestId: request.id,
        customerAccountId: input.customerAccountId,
        rating: input.rating,
        title: input.title ?? null,
        comment: input.comment ?? null,
        status: 'PENDING',
      },
    });
  }

  /** Provider reply to a review. */
  async replyToReview(providerId: string, reviewId: string, reply: string) {
    const review = await this.prisma.providerReview.findFirst({
      where: { id: reviewId, providerId },
    });
    if (!review) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Review not found.');
    return this.prisma.providerReview.update({
      where: { id: reviewId },
      data: { providerReply: reply, providerRepliedAt: new Date() },
    });
  }

  async moderateReview(
    reviewId: string,
    status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED',
    note: string,
    moderatorId: string,
  ) {
    const review = await this.prisma.providerReview.findUnique({ where: { id: reviewId } });
    if (!review) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Review not found.');
    return this.prisma.providerReview.update({
      where: { id: reviewId },
      data: {
        status,
        moderatedById: moderatorId,
        moderationNote: note,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    });
  }

  async listProviderReviews(providerId: string) {
    return this.prisma.providerReview.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      include: { serviceRequest: { select: { requestNumber: true } } },
    });
  }

  // ---------------------------------------------------------------- disputes

  /** Raise a complaint against a provider. */
  async openDispute(input: {
    customerAccountId: string;
    providerId: string;
    subject: string;
    description: string;
    serviceRequestId?: string | null;
    bookingSlotId?: string | null;
  }) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: input.providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    // A dispute may only reference the customer's own request.
    if (input.serviceRequestId) {
      const request = await this.prisma.serviceRequest.findFirst({
        where: { id: input.serviceRequestId, customerAccountId: input.customerAccountId },
      });
      if (!request) {
        throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That request does not belong to you.');
      }
    }

    const code = await this.nextDisputeCode();
    const dispute = await this.prisma.marketplaceDispute.create({
      data: {
        code,
        providerId: input.providerId,
        serviceRequestId: input.serviceRequestId ?? null,
        bookingSlotId: input.bookingSlotId ?? null,
        customerAccountId: input.customerAccountId,
        subject: input.subject.trim(),
        description: input.description.trim(),
        status: 'OPEN',
        messages: {
          create: {
            authorKind: 'CUSTOMER',
            authorId: input.customerAccountId,
            body: input.description.trim(),
          },
        },
      },
    });

    await this.audit.record({
      action: 'marketplace.dispute_opened',
      targetType: 'MARKETPLACE_DISPUTE',
      targetId: dispute.id,
      summary: `Dispute ${code} opened against provider ${provider.code}.`,
    });

    return dispute;
  }

  /**
   * Add a message to a dispute thread.
   *
   * A participant may only post to a dispute they belong to, and an internal
   * note from the platform is never returned to the customer.
   */
  async addDisputeMessage(input: {
    disputeId: string;
    authorKind: 'CUSTOMER' | 'PROVIDER' | 'PLATFORM';
    authorId: string;
    body: string;
    isInternal?: boolean;
  }) {
    const dispute = await this.prisma.marketplaceDispute.findUnique({
      where: { id: input.disputeId },
    });
    if (!dispute) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Dispute not found.');

    if (input.authorKind === 'CUSTOMER' && dispute.customerAccountId !== input.authorId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That dispute does not belong to you.');
    }
    if (input.authorKind === 'PROVIDER' && dispute.providerId !== input.authorId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_TENANT, 'That dispute is not against your provider.');
    }

    return this.prisma.disputeMessage.create({
      data: {
        disputeId: input.disputeId,
        authorKind: input.authorKind,
        authorId: input.authorId,
        body: input.body,
        isInternal: input.isInternal ?? false,
      },
    });
  }

  /**
   * Resolve a dispute, optionally with compensation.
   *
   * Compensation is recorded on the dispute. It is not paid here: moving money
   * is a refund or a settlement adjustment, which has its own approval path.
   */
  async resolveDispute(
    disputeId: string,
    input: {
      status: 'RESOLVED' | 'CLOSED' | 'ESCALATED';
      resolution: string;
      compensationMinor?: number;
    },
    resolverId: string,
  ) {
    const dispute = await this.prisma.marketplaceDispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Dispute not found.');
    if (input.compensationMinor !== undefined && input.compensationMinor < 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Compensation cannot be negative.');
    }

    const updated = await this.prisma.marketplaceDispute.update({
      where: { id: disputeId },
      data: {
        status: input.status,
        resolution: input.resolution,
        compensationMinor: input.compensationMinor ?? dispute.compensationMinor,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(input.status) ? new Date() : null,
        resolvedById: resolverId,
      },
    });

    await this.audit.record({
      actorUserId: resolverId,
      action: 'marketplace.dispute_resolved',
      targetType: 'MARKETPLACE_DISPUTE',
      targetId: disputeId,
      summary: `Dispute ${dispute.code} set to ${input.status}.`,
    });

    return updated;
  }

  async listDisputes(params: {
    customerAccountId?: string;
    providerId?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(params.customerAccountId ? { customerAccountId: params.customerAccountId } : {}),
      ...(params.providerId ? { providerId: params.providerId } : {}),
      ...(params.status ? { status: params.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.marketplaceDispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          provider: { select: { nameEn: true, nameAr: true } },
          // Internal notes are filtered out: a customer must never see them.
          messages: {
            where: params.customerAccountId ? { isInternal: false } : {},
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.marketplaceDispute.count({ where }),
    ]);
    return { items, total };
  }

  // ------------------------------------------------------------- settlements

  /**
   * Build a settlement for a provider over a period.
   *
   * Gross is the sum of completed work; commission is the sum of the commission
   * rows already recorded. The net is what the provider is owed. The settlement
   * is a `DRAFT` until approved, so building one has no accounting effect.
   */
  async buildSettlement(input: {
    providerId: string;
    periodStart: Date;
    periodEnd: Date;
    actorId: string;
  }) {
    if (input.periodEnd <= input.periodStart) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The period end must be after the start.');
    }

    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { id: input.providerId },
    });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');

    // Any overlap is refused, not just an identical period: two settlements
    // that share a day would each claim the same commissions, so the period is
    // the unit of exclusivity.
    const existing = await this.prisma.providerSettlement.findFirst({
      where: {
        providerId: input.providerId,
        status: { not: 'CANCELLED' },
        periodStart: { lt: input.periodEnd },
        periodEnd: { gt: input.periodStart },
      },
    });
    if (existing) {
      throw conflict(
        ERROR_CODES.SETTLEMENT_STATE,
        'A settlement already exists for this provider and period.',
      );
    }

    const commissions = await this.prisma.marketplaceCommission.findMany({
      where: {
        providerId: input.providerId,
        status: 'PENDING',
        createdAt: { gte: input.periodStart, lte: input.periodEnd },
      },
    });

    const grossMinor = commissions.reduce((sum, row) => sum + row.baseMinor, 0);
    const commissionMinor = commissions.reduce((sum, row) => sum + row.commissionMinor, 0);
    const netMinor = grossMinor - commissionMinor;
    const currency = commissions[0]?.currency ?? 'BHD';

    return this.prisma.$transaction(async (tx) => {
      const settlement = await tx.providerSettlement.create({
        data: {
          providerId: input.providerId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          grossMinor,
          commissionMinor,
          netMinor,
          currency,
          status: 'DRAFT',
        },
      });

      // Mark the included commissions so a later settlement cannot claim them
      // again. The status changes with the settlement, keeping the two in step.
      if (commissions.length > 0) {
        await tx.marketplaceCommission.updateMany({
          where: { id: { in: commissions.map((c) => c.id) } },
          data: { status: 'INVOICED' },
        });
      }

      await this.audit.record({
        actorUserId: input.actorId,
        action: 'marketplace.settlement_built',
        targetType: 'PROVIDER_SETTLEMENT',
        targetId: settlement.id,
        summary: `Settlement draft for ${provider.code}: gross ${grossMinor}, commission ${commissionMinor}, net ${netMinor}.`,
      });

      return settlement;
    });
  }

  /**
   * Approve a settlement and post the commission revenue.
   *
   *   Dr Cost of services      (gross)
   *   Cr Provider payable      (net)
   *   Cr Marketplace commission revenue (commission)
   *
   * The source key `settlement:<id>` makes approval idempotent.
   */
  async approveSettlement(settlementId: string, actorId: string) {
    const settlement = await this.prisma.providerSettlement.findUnique({
      where: { id: settlementId },
      include: { provider: true },
    });
    if (!settlement) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Settlement not found.');
    if (settlement.status !== 'DRAFT') {
      throw conflict(
        ERROR_CODES.SETTLEMENT_STATE,
        `A ${settlement.status} settlement cannot be approved.`,
      );
    }

    const companyId = await this.resolveSettlementCompany(settlement.provider.providerCompanyId);
    if (!companyId) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'No active company is available to post the settlement against.',
      );
    }

    return this.posting.withTransaction(async (tx) => {
      await this.postCommissionJournal(tx, {
        companyId,
        settlementId: settlement.id,
        grossMinor: settlement.grossMinor,
        commissionMinor: settlement.commissionMinor,
        netMinor: settlement.netMinor,
        actorId,
      });

      await tx.marketplaceCommission.updateMany({
        where: { providerId: settlement.providerId, status: 'INVOICED' },
        data: { status: 'SETTLED' },
      });

      const updated = await tx.providerSettlement.update({
        where: { id: settlementId },
        data: { status: 'APPROVED', approvedById: actorId },
      });

      await this.audit.record({
        actorUserId: actorId,
        action: 'marketplace.settlement_approved',
        companyId,
        targetType: 'PROVIDER_SETTLEMENT',
        targetId: settlement.id,
        summary: `Settlement approved for ${settlement.provider.code}; net ${settlement.netMinor} posted.`,
      });

      return updated;
    });
  }

  private async postCommissionJournal(
    tx: Tx,
    input: {
      companyId: string;
      settlementId: string;
      grossMinor: number;
      commissionMinor: number;
      netMinor: number;
      actorId: string;
    },
  ) {
    if (input.grossMinor === 0) return null;

    const expenseAccount = await this.posting.systemAccount(tx, input.companyId, SYSTEM_ROLES.COGS);
    const payableAccount = await this.posting.systemAccount(
      tx,
      input.companyId,
      SYSTEM_ROLES.PROVIDER_PAYABLE,
    );

    const lines = [
      { accountId: expenseAccount, debit: input.grossMinor },
      { accountId: payableAccount, credit: input.netMinor },
    ];

    // Commission earned is only a credit line when there is one; a zero-rate
    // provider would otherwise produce an unbalanced, zero-value line.
    if (input.commissionMinor > 0) {
      lines.push({
        accountId: await this.posting.systemAccount(
          tx,
          input.companyId,
          SYSTEM_ROLES.MARKETPLACE_COMMISSION,
        ),
        credit: input.commissionMinor,
      });
    }

    return this.posting.postJournal(tx, {
      companyId: input.companyId,
      entryDate: new Date(),
      memo: 'Marketplace provider settlement',
      sourceType: 'PROVIDER_SETTLEMENT',
      sourceId: `settlement:${input.settlementId}`,
      actorUserId: input.actorId,
      lines,
    });
  }

  /** Record that an approved settlement has been paid out. */
  async markSettlementPaid(settlementId: string, actorId: string) {
    const settlement = await this.prisma.providerSettlement.findUnique({
      where: { id: settlementId },
    });
    if (!settlement) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Settlement not found.');
    if (settlement.status !== 'APPROVED') {
      throw conflict(ERROR_CODES.SETTLEMENT_STATE, 'Only an approved settlement can be paid.');
    }

    const updated = await this.prisma.providerSettlement.update({
      where: { id: settlementId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'marketplace.settlement_paid',
      targetType: 'PROVIDER_SETTLEMENT',
      targetId: settlementId,
      summary: `Settlement marked paid (net ${settlement.netMinor}).`,
    });

    return updated;
  }

  async listSettlements(providerId: string) {
    return this.prisma.providerSettlement.findMany({
      where: { providerId },
      orderBy: { periodEnd: 'desc' },
    });
  }

  /** The provider's own earnings summary, for the provider portal. */
  async providerEarnings(providerId: string) {
    const [pending, approved, paid] = await Promise.all([
      this.prisma.marketplaceCommission.aggregate({
        where: { providerId, status: { in: ['PENDING', 'INVOICED'] } },
        _sum: { commissionMinor: true, baseMinor: true },
        _count: { _all: true },
      }),
      this.prisma.providerSettlement.aggregate({
        where: { providerId, status: 'APPROVED' },
        _sum: { netMinor: true },
        _count: { _all: true },
      }),
      this.prisma.providerSettlement.aggregate({
        where: { providerId, status: 'PAID' },
        _sum: { netMinor: true },
        _count: { _all: true },
      }),
    ]);

    return {
      pending: {
        count: pending._count._all,
        grossMinor: pending._sum.baseMinor ?? 0,
        commissionMinor: pending._sum.commissionMinor ?? 0,
      },
      awaitingPayment: { count: approved._count._all, netMinor: approved._sum.netMinor ?? 0 },
      paidToDate: { count: paid._count._all, netMinor: paid._sum.netMinor ?? 0 },
    };
  }

  /** Resolve a company to post a settlement against. */
  private async resolveSettlementCompany(preferred: string | null): Promise<string | null> {
    if (preferred) {
      const company = await this.prisma.company.findUnique({ where: { id: preferred } });
      if (company) return company.id;
    }
    const fallback = await this.prisma.company.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }

  // ------------------------------------------------------------------ helpers

  private async nextApplicationCode(): Promise<string> {
    const count = await this.prisma.marketplaceApplication.count();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `APP-${String(count + 1 + attempt).padStart(5, '0')}`;
      const clash = await this.prisma.marketplaceApplication.findFirst({
        where: { code: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `APP-${Date.now().toString(36).toUpperCase()}`;
  }

  private async nextRequestNumber(companyId: string): Promise<string> {
    const count = await this.prisma.serviceRequest.count({ where: { companyId } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `SR-${String(count + 1 + attempt).padStart(6, '0')}`;
      const clash = await this.prisma.serviceRequest.findFirst({
        where: { companyId, requestNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `SR-${Date.now().toString(36).toUpperCase()}`;
  }

  private async nextDisputeCode(): Promise<string> {
    const count = await this.prisma.marketplaceDispute.count();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `DSP-${String(count + 1 + attempt).padStart(5, '0')}`;
      const clash = await this.prisma.marketplaceDispute.findFirst({
        where: { code: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `DSP-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Currency scale for a provider's settlement currency. */
  settlementScale(currency: string): number {
    return currencyScale(currency);
  }
}
