import { Injectable } from '@nestjs/common';
import { DEFAULT_COUNTRY_CODE } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { TenantCompanyService } from '../common/tenant-company.service';
import { ERROR_CODES, badRequest, conflict, notFound } from '../common/errors';

/**
 * Customer-owned data: addresses, privacy, notification preferences, the vehicle
 * garage and support intake.
 *
 * **Ownership is the invariant of this service.** Every method takes the
 * `accountId` from the authenticated principal and scopes the query by it, so a
 * request cannot reach another customer's row even if it guesses a valid id.
 * Nothing here accepts an account id from the request body.
 */

/** The privacy switches a customer may change. Absent fields are left alone. */
export interface CustomerPrivacyInput {
  shareContactWithProvider?: boolean;
  allowVehicleDiscovery?: boolean;
  allowMarketingEmails?: boolean;
  allowMarketingSms?: boolean;
  allowMarketingWhatsapp?: boolean;
  allowPushNotifications?: boolean;
  allowAnalytics?: boolean;
  allowThirdPartySharing?: boolean;
}

@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenants: TenantCompanyService,
  ) {}

  // ------------------------------------------------------------------ addresses

  async listAddresses(accountId: string) {
    return this.prisma.customerAddress.findMany({
      where: { accountId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(
    accountId: string,
    input: {
      label?: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      area?: string;
      countryCode?: string;
      postalCode?: string;
      latitude?: number;
      longitude?: number;
      isDefault?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.customerAddress.updateMany({
          where: { accountId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const count = await tx.customerAddress.count({ where: { accountId } });
      return tx.customerAddress.create({
        data: {
          accountId,
          label: input.label ?? null,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          city: input.city,
          area: input.area ?? null,
          countryCode: (input.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase(),
          postalCode: input.postalCode ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          // The first address is the default, so a customer always has one.
          isDefault: input.isDefault ?? count === 0,
        },
      });
    });
  }

  async updateAddress(
    accountId: string,
    addressId: string,
    input: Partial<{
      label: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      area: string;
      countryCode: string;
      postalCode: string;
      latitude: number;
      longitude: number;
      isDefault: boolean;
    }>,
  ) {
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, accountId },
    });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Address not found.');

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.customerAddress.updateMany({
          where: { accountId, isDefault: true, id: { not: addressId } },
          data: { isDefault: false },
        });
      }
      const data: Record<string, unknown> = {};
      for (const key of [
        'label',
        'addressLine1',
        'addressLine2',
        'city',
        'area',
        'postalCode',
      ] as const) {
        if (input[key] !== undefined) data[key] = input[key];
      }
      if (input.countryCode !== undefined) data.countryCode = input.countryCode.toUpperCase();
      if (input.latitude !== undefined) data.latitude = input.latitude;
      if (input.longitude !== undefined) data.longitude = input.longitude;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      return tx.customerAddress.update({ where: { id: addressId }, data });
    });
  }

  async deleteAddress(accountId: string, addressId: string): Promise<void> {
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, accountId },
    });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Address not found.');
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
  }

  // -------------------------------------------------------------------- privacy

  /**
   * Read privacy settings, creating the row on first access so the caller always
   * receives concrete values rather than having to interpret absence.
   */
  async getPrivacy(accountId: string) {
    const existing = await this.prisma.customerPrivacySetting.findUnique({ where: { accountId } });
    if (existing) return existing;
    return this.prisma.customerPrivacySetting.create({ data: { accountId } });
  }

  async updatePrivacy(accountId: string, input: CustomerPrivacyInput) {
    const allowed = [
      'shareContactWithProvider',
      'allowVehicleDiscovery',
      'allowMarketingEmails',
      'allowMarketingSms',
      'allowMarketingWhatsapp',
      'allowPushNotifications',
      'allowAnalytics',
      'allowThirdPartySharing',
    ] as const;

    const data: Record<string, boolean> = {};
    for (const key of allowed) {
      if (input[key] !== undefined) data[key] = input[key] as boolean;
    }

    await this.getPrivacy(accountId);
    if (Object.keys(data).length === 0) return this.getPrivacy(accountId);

    const updated = await this.prisma.customerPrivacySetting.update({
      where: { accountId },
      data,
    });

    await this.audit.record({
      action: 'customer.privacy_updated',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: accountId,
      summary: 'Customer updated privacy settings.',
      metadata: data,
    });

    return updated;
  }

  /**
   * Record a data-export or deletion request.
   *
   * The platform records the request and surfaces it to operators; it does not
   * silently erase financial records, which must be retained for accounting.
   */
  async requestDataAction(accountId: string, kind: 'EXPORT' | 'DELETION') {
    const field = kind === 'EXPORT' ? 'dataExportRequestedAt' : 'deletionRequestedAt';
    await this.getPrivacy(accountId);
    const updated = await this.prisma.customerPrivacySetting.update({
      where: { accountId },
      data: { [field]: new Date() },
    });
    await this.audit.record({
      action: kind === 'EXPORT' ? 'customer.data_export_requested' : 'customer.deletion_requested',
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: accountId,
      summary: `Customer requested ${kind.toLowerCase()}.`,
    });
    return updated;
  }

  // ----------------------------------------------------- notification preferences

  async listNotificationPreferences(accountId: string) {
    const rows = await this.prisma.customerNotificationPreference.findMany({
      where: { accountId },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
    });
    return rows;
  }

  async setNotificationPreferences(
    accountId: string,
    preferences: Array<{ channel: string; category: string; enabled: boolean }>,
  ) {
    for (const pref of preferences) {
      await this.prisma.customerNotificationPreference.upsert({
        where: {
          accountId_channel_category: {
            accountId,
            channel: pref.channel as never,
            category: pref.category,
          },
        },
        create: {
          accountId,
          channel: pref.channel as never,
          category: pref.category,
          enabled: pref.enabled,
        },
        update: { enabled: pref.enabled },
      });
    }
    return this.listNotificationPreferences(accountId);
  }

  // --------------------------------------------------------------- vehicle garage

  /**
   * The customer's garage.
   *
   * A vehicle lives inside a tenant (`companyId` + `customerId` are required by
   * the Execution 03 schema), so registering a vehicle from the app also needs a
   * tenant customer record. The service resolves that record for the account's
   * default company and links it, which is what lets the workshop and inspection
   * modules see the same vehicle the customer sees.
   */
  async listVehicles(accountId: string) {
    return this.prisma.vehicle.findMany({
      where: { customerAccountId: accountId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { inspections: true, maintenance: true, jobCards: true } },
      },
    });
  }

  async getVehicle(accountId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, customerAccountId: accountId },
      include: {
        mileageRecords: { orderBy: { recordedAt: 'desc' }, take: 20 },
        // Only the customer's own vehicle documents are returned, and only
        // metadata: `fileRef` points at private storage and is not exposed here.
        documents: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, category: true, number: true, expiresAt: true },
        },
      },
    });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');
    return vehicle;
  }

  async createVehicle(
    accountId: string,
    input: {
      vin: string;
      plateNumber?: string;
      make: string;
      model: string;
      modelYear: number;
      color?: string;
      mileage?: number;
      notes?: string;
    },
  ) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');

    const companyId = await this.resolveCompanyForAccount(account.defaultCompanyId);

    const vin = input.vin.trim().toUpperCase();
    const duplicate = await this.prisma.vehicle.findFirst({
      where: { companyId, vin, customerAccountId: accountId },
    });
    if (duplicate) {
      throw conflict(ERROR_CODES.VEHICLE_VIN_EXISTS, 'This vehicle is already in your garage.');
    }

    // The vehicle is owned by a tenant customer record so the ERP sees it too.
    const customer = await this.resolveTenantCustomer(companyId, account);

    let vehicle;
    try {
      vehicle = await this.prisma.vehicle.create({
        data: {
          companyId,
          customerId: customer.id,
          customerAccountId: accountId,
          vin,
          plateNumber: input.plateNumber?.trim() ?? null,
          make: input.make.trim(),
          model: input.model.trim(),
          modelYear: input.modelYear,
          color: input.color?.trim() ?? null,
          mileage: input.mileage ?? 0,
          notes: input.notes ?? null,
        },
      });
    } catch (error) {
      // `(companyId, vin)` is unique across the whole tenant, not per account, so
      // a VIN another customer already registered reaches the insert. Answer with
      // a conflict rather than letting the constraint surface as a 500; the
      // message deliberately does not reveal whose record holds the VIN.
      if (this.isUniqueViolation(error)) {
        throw conflict(
          ERROR_CODES.VEHICLE_VIN_EXISTS,
          'A vehicle with this VIN is already registered.',
        );
      }
      throw error;
    }

    await this.audit.record({
      action: 'customer.vehicle_added',
      companyId,
      targetType: 'VEHICLE',
      targetId: vehicle.id,
      summary: `Customer added vehicle ${vin} to their garage.`,
    });

    return vehicle;
  }

  /**
   * Resolve the tenant customer record backing this consumer account, creating a
   * matching `Customer` row in the tenant on first use.
   *
   * The consumer identity remains the owner: `Vehicle.customerAccountId` is the
   * access boundary, and the tenant customer row exists so invoices, job cards
   * and inspections can reference a customer as the ERP expects.
   */
  private async resolveTenantCustomer(
    companyId: string,
    account: { id: string; email: string; fullName: string; phone: string | null },
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: { companyId, email: account.email },
    });
    if (existing) return existing;

    const count = await this.prisma.customer.count({ where: { companyId } });
    return this.prisma.customer.create({
      data: {
        companyId,
        code: `WEB-${String(count + 1).padStart(6, '0')}`,
        nameEn: account.fullName,
        nameAr: account.fullName,
        email: account.email,
        phone: account.phone,
        isActive: true,
      },
    });
  }

  /** Fall back to a company that can actually serve a consumer. */
  private resolveCompanyForAccount(defaultCompanyId: string | null): Promise<string> {
    return this.tenants.resolveForCustomer(defaultCompanyId);
  }

  async updateVehicle(
    accountId: string,
    vehicleId: string,
    input: { plateNumber?: string; color?: string; mileage?: number; notes?: string },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, customerAccountId: accountId },
    });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');

    const data: Record<string, unknown> = {};
    if (input.plateNumber !== undefined) data.plateNumber = input.plateNumber.trim() || null;
    if (input.color !== undefined) data.color = input.color.trim() || null;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.mileage !== undefined) {
      if (input.mileage < vehicle.mileage) {
        throw badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          'The odometer reading cannot be lower than the recorded mileage.',
        );
      }
      data.mileage = input.mileage;
    }

    if (Object.keys(data).length === 0) return vehicle;
    return this.prisma.vehicle.update({ where: { id: vehicleId }, data });
  }

  /**
   * Remove a vehicle from the garage.
   *
   * Vehicles with service history are deactivated rather than deleted, because
   * job cards, inspections and invoices reference them and must keep resolving.
   */
  async removeVehicle(accountId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, customerAccountId: accountId },
    });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');

    const [inspections, maintenance, jobCards] = await Promise.all([
      this.prisma.inspectionBooking.count({ where: { vehicleId } }),
      this.prisma.maintenanceBooking.count({ where: { vehicleId } }),
      this.prisma.jobCard.count({ where: { vehicleId } }),
    ]);
    const hasHistory = inspections + maintenance + jobCards > 0;

    if (hasHistory) {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'INACTIVE', customerAccountId: null },
      });
      return { removed: true, retainedHistory: true };
    }

    await this.prisma.vehicle.delete({ where: { id: vehicleId } });
    return { removed: true, retainedHistory: false };
  }

  /** Service history for one owned vehicle, assembled from the ERP records. */
  async vehicleServiceHistory(accountId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, customerAccountId: accountId },
      select: { id: true, vin: true, make: true, model: true, modelYear: true },
    });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');

    const [inspections, maintenance, jobCards, warranties] = await Promise.all([
      this.prisma.inspectionBooking.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          scheduledAt: true,
          odometer: true,
          createdAt: true,
          report: { select: { id: true, status: true, invoiceId: true, approvedAt: true } },
        },
      }),
      this.prisma.maintenanceBooking.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          scheduledAt: true,
          complaint: true,
          createdAt: true,
        },
      }),
      this.prisma.jobCard.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          jobNumber: true,
          status: true,
          complaint: true,
          odometer: true,
          invoiceId: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.warrantyRecord.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          description: true,
          terms: true,
          isActive: true,
          startsAt: true,
          expiresAt: true,
        },
      }),
    ]);

    return { vehicle, inspections, maintenance, jobCards, warranties };
  }

  /** Prisma reports a unique-constraint failure as P2002. */
  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
