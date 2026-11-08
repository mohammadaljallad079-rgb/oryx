import { Injectable } from '@nestjs/common';
import { sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { SalesService } from '../sales/sales.service';
import { computeDocumentTotals } from '../common/document-totals';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  CreateChecklistItemDto,
  CreateInspectionBookingDto,
  CreateInspectionIntakeDto,
  CreateInspectionServiceDto,
  CreateVehicleDto,
  DecideReportDto,
  InvoiceInspectionDto,
  ListQueryDto,
  RecordFindingsDto,
  RecordMileageDto,
  SubmitReportDto,
  UpdateInspectionBookingDto,
  UpdateVehicleDto,
  VehicleDocumentDto,
} from './automotive.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Relations every inspection booking is returned with. */
const BOOKING_INCLUDE = {
  vehicle: { select: { vin: true, make: true, model: true, modelYear: true, color: true, plateNumber: true } },
  customer: { select: { code: true, nameEn: true, nameAr: true, phone: true } },
  service: { select: { nameEn: true, nameAr: true } },
  report: true,
  _count: { select: { findings: true } },
} as const;

/** Canonical report sections, in the order the report presents them. */
const INSPECTION_TYPE_ORDER = ['PAINT', 'CHASSIS', 'COMPREHENSIVE'] as const;

/** De-duplicate and order the selected inspection types. */
function normalizeInspectionTypes(types: readonly string[]): string[] {
  const set = new Set(types.map((t) => t.toUpperCase()));
  return INSPECTION_TYPE_ORDER.filter((t) => set.has(t));
}

/**
 * VIN validation.
 *
 * A real VIN is 17 characters from a restricted alphabet that excludes I, O and
 * Q (so they cannot be confused with 1 and 0). We accept 11–17 characters to
 * accommodate older chassis numbers, but reject the ambiguous letters and
 * enforce uniqueness per company.
 */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{11,17}$/;

@Injectable()
export class VehicleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
    private readonly sales: SalesService,
  ) {}

  // ------------------------------------------------------------------ vehicles

  async listVehicles(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { vin: { contains: query.search, mode: 'insensitive' as const } },
              { plateNumber: { contains: query.search, mode: 'insensitive' as const } },
              { make: { contains: query.search, mode: 'insensitive' as const } },
              { model: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { code: true, nameEn: true, nameAr: true } } } }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items: rows.map(toVehicleDto), total, page, pageSize };
  }

  async getVehicle(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { code: true, nameEn: true, nameAr: true } },
        mileageRecords: { orderBy: { recordedAt: 'desc' }, take: 50 },
        documents: { orderBy: { createdAt: 'desc' } },
        inspections: { orderBy: { scheduledAt: 'desc' }, take: 20, include: { report: true } },
        maintenance: { orderBy: { scheduledAt: 'desc' }, take: 20 },
        jobCards: { orderBy: { createdAt: 'desc' }, take: 20 },
        warranties: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');
    return vehicle;
  }

  async createVehicle(dto: CreateVehicleDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const vin = dto.vin ? dto.vin.trim().toUpperCase() : null;
    if (vin && !VIN_PATTERN.test(vin)) {
      throw badRequest(ERROR_CODES.VEHICLE_VIN_INVALID, 'The VIN must be 11–17 characters and must not contain I, O or Q.');
    }
    if (vin) {
      const dup = await this.prisma.vehicle.findUnique({ where: { companyId_vin: { companyId, vin } } });
      if (dup) throw conflict(ERROR_CODES.VEHICLE_VIN_EXISTS, `A vehicle with VIN ${vin} already exists.`);
    }
    await this.assertCustomer(companyId, dto.customerId);

    const vehicle = await this.posting.withTransaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          companyId,
          customerId: dto.customerId,
          vin,
          plateNumber: dto.plateNumber ?? null,
          make: dto.make,
          model: dto.model,
          modelYear: dto.modelYear,
          color: dto.color ?? null,
          mileage: dto.mileage ?? 0,
          registrationExpiresAt: dto.registrationExpiresAt ? new Date(dto.registrationExpiresAt) : null,
          notes: dto.notes ?? null,
        },
      });
      if (dto.mileage && dto.mileage > 0) {
        await tx.vehicleMileageRecord.create({ data: { companyId, vehicleId: created.id, mileage: dto.mileage, source: 'REGISTRATION' } });
      }
      return created;
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.vehicle_created', targetType: 'VEHICLE', targetId: vehicle.id, summary: `Registered vehicle ${vehicle.make} ${vehicle.model}${vin ? ` (${vin})` : ''}` });
    return toVehicleDto(vehicle);
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, companyId } });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
        ...(dto.make !== undefined ? { make: dto.make } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.modelYear !== undefined ? { modelYear: dto.modelYear } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.registrationExpiresAt !== undefined ? { registrationExpiresAt: new Date(dto.registrationExpiresAt) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.vehicle_updated', targetType: 'VEHICLE', targetId: id, summary: `Updated vehicle ${updated.vin}` });
    return toVehicleDto(updated);
  }

  /** Record mileage; the vehicle's current mileage only ever increases. */
  async recordMileage(id: string, dto: RecordMileageDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, companyId } });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');
    if (dto.mileage < vehicle.mileage) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Mileage cannot decrease (current ${vehicle.mileage}).`);
    }
    const result = await this.posting.withTransaction(async (tx) => {
      const record = await tx.vehicleMileageRecord.create({ data: { companyId, vehicleId: id, mileage: dto.mileage, source: dto.source ?? 'MANUAL' } });
      await tx.vehicle.update({ where: { id }, data: { mileage: dto.mileage } });
      return record;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.mileage_recorded', targetType: 'VEHICLE', targetId: id, summary: `Mileage recorded at ${dto.mileage}` });
    return result;
  }

  async listVehicleDocuments(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertVehicle(companyId, id);
    const rows = await this.prisma.vehicleDocument.findMany({ where: { companyId, vehicleId: id }, orderBy: { createdAt: 'desc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async addVehicleDocument(id: string, dto: VehicleDocumentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertVehicle(companyId, id);
    const doc = await this.prisma.vehicleDocument.create({
      data: { companyId, vehicleId: id, category: dto.category, number: dto.number ?? null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, fileRef: dto.fileRef ?? null },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.vehicle_document_added', targetType: 'VEHICLE', targetId: id, summary: `Added vehicle document ${dto.category}` });
    return doc;
  }

  // -------------------------------------------------------------- inspections

  async listInspectionServices(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.inspectionService.findMany({ where: { companyId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createInspectionService(dto: CreateInspectionServiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.inspectionService.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Inspection service ${dto.code} already exists.`);
    const service = await this.prisma.inspectionService.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        description: dto.description ?? null,
        priceMinor: dto.priceMinor ?? 0,
        taxPercentBp: dto.taxPercentBp ?? 0,
        durationMinutes: dto.durationMinutes ?? 60,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_service_created', targetType: 'INSPECTION_SERVICE', targetId: service.id, summary: `Created inspection service ${service.code}` });
    return service;
  }

  async addChecklistItem(dto: CreateChecklistItemDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const count = await this.prisma.inspectionChecklistItem.count({ where: { companyId, serviceId: dto.serviceId ?? null } });
    const item = await this.prisma.inspectionChecklistItem.create({
      data: { companyId, serviceId: dto.serviceId ?? null, code: dto.code, labelEn: dto.labelEn, labelAr: dto.labelAr, category: dto.category, sortOrder: count },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.checklist_item_created', targetType: 'INSPECTION_CHECKLIST_ITEM', targetId: item.id, summary: `Added checklist item ${item.code}` });
    return item;
  }

  async listInspectionBookings(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { bookingNumber: { contains: query.search, mode: 'insensitive' as const } },
              { vehicle: { vin: { contains: query.search, mode: 'insensitive' as const } } },
              { vehicle: { plateNumber: { contains: query.search, mode: 'insensitive' as const } } },
              { vehicle: { make: { contains: query.search, mode: 'insensitive' as const } } },
              { vehicle: { model: { contains: query.search, mode: 'insensitive' as const } } },
              { customer: { nameEn: { contains: query.search, mode: 'insensitive' as const } } },
              { customer: { nameAr: { contains: query.search } } },
              { customer: { phone: { contains: query.search } } },
              { customer: { code: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.inspectionBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vehicle: { select: { vin: true, make: true, model: true, modelYear: true, color: true, plateNumber: true } },
          customer: { select: { code: true, nameEn: true, nameAr: true, phone: true } },
          service: { select: { nameEn: true, nameAr: true } },
          report: true,
          _count: { select: { findings: true } },
        },
      }),
      this.prisma.inspectionBooking.count({ where }),
    ]);
    return { items: rows.map(toInspectionBookingDto), total, page, pageSize };
  }

  /**
   * Create an inspection from the intake form.
   *
   * The vehicle and customer must belong to the caller's company (enforced by
   * `assertVehicle`/`assertCustomer`), so a cross-tenant pair is rejected. The
   * inspection starts as DRAFT when `saveDraft` is set, otherwise it is
   * scheduled for the requested time.
   */
  async createInspectionIntake(dto: CreateInspectionIntakeDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const vehicle = await this.assertVehicle(companyId, dto.vehicleId);
    await this.assertCustomer(companyId, dto.customerId);
    if (vehicle.customerId !== dto.customerId) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The selected vehicle does not belong to the selected customer.');
    }
    if (dto.serviceId) {
      const service = await this.prisma.inspectionService.findFirst({ where: { id: dto.serviceId, companyId } });
      if (!service) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection service not found.');
    }
    const inspectionTypes = normalizeInspectionTypes(dto.inspectionTypes);
    if (inspectionTypes.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Select at least one inspection type.');
    }

    const booking = await this.posting.withTransaction(async (tx) => {
      const bookingNumber = await this.sequences.next(tx, companyId, 'inspectionBooking');
      return tx.inspectionBooking.create({
        data: {
          companyId,
          bookingNumber,
          vehicleId: dto.vehicleId,
          customerId: dto.customerId,
          serviceId: dto.serviceId ?? null,
          branchId: dto.branchId ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
          status: dto.saveDraft ? 'DRAFT' : 'SCHEDULED',
          inspectorUserId: dto.inspectorUserId ?? null,
          odometer: dto.odometer ?? null,
          inspectionTypes,
          notes: dto.notes ?? null,
          createdById: actor.userId,
        },
        include: BOOKING_INCLUDE,
      });
    });
    // The inspection's own odometer reading is a point-in-time snapshot. It only
    // ever advances the vehicle's stored mileage; it never rewrites history.
    if (dto.odometer && dto.odometer > 0) {
      await this.posting.withTransaction(async (tx) => {
        await tx.vehicleMileageRecord.create({ data: { companyId, vehicleId: dto.vehicleId, mileage: dto.odometer!, source: 'INSPECTION' } });
        await tx.vehicle.updateMany({ where: { id: dto.vehicleId, companyId, mileage: { lt: dto.odometer! } }, data: { mileage: dto.odometer! } });
      });
    }
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'automotive.inspection_created',
      targetType: 'INSPECTION_BOOKING',
      targetId: booking.id,
      summary: `Created inspection ${booking.bookingNumber} (${inspectionTypes.join('+')})`,
    });
    return toInspectionBookingDto(booking);
  }

  /** Re-open a saved inspection, with everything the intake screen needs. */
  async getInspectionIntake(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({
      where: { id, companyId },
      include: {
        ...BOOKING_INCLUDE,
        vehicle: true,
        customer: { select: { id: true, code: true, nameEn: true, nameAr: true, phone: true } },
        findings: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    return {
      booking: toInspectionBookingDto(booking as never),
      vehicle: booking.vehicle,
      customer: booking.customer,
      findings: booking.findings,
      report: booking.report,
    };
  }

  /**
   * Edit a saved inspection.
   *
   * An approved report is immutable; everything else — including a draft that is
   * being completed — can be re-saved. The customer/vehicle pairing is fixed
   * once the inspection exists.
   */
  async updateInspectionIntake(id: string, dto: UpdateInspectionBookingDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({ where: { id, companyId }, include: { report: true } });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    if (booking.report?.status === 'APPROVED') {
      throw badRequest(ERROR_CODES.INSPECTION_ALREADY_APPROVED, 'An approved inspection cannot be edited.');
    }
    if (dto.status === 'COMPLETED') {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'An inspection is completed by approving its report.');
    }
    const updated = await this.prisma.inspectionBooking.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.inspectorUserId !== undefined ? { inspectorUserId: dto.inspectorUserId } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.odometer !== undefined ? { odometer: dto.odometer } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.inspectionTypes !== undefined ? { inspectionTypes: normalizeInspectionTypes(dto.inspectionTypes) } : {}),
      },
      include: BOOKING_INCLUDE,
    });
    // Advancing the odometer records a new mileage point; history is untouched.
    if (dto.odometer && dto.odometer > 0 && (!booking.odometer || dto.odometer > booking.odometer)) {
      await this.posting.withTransaction(async (tx) => {
        await tx.vehicleMileageRecord.create({ data: { companyId, vehicleId: booking.vehicleId, mileage: dto.odometer!, source: 'INSPECTION' } });
        await tx.vehicle.updateMany({ where: { id: booking.vehicleId, companyId, mileage: { lt: dto.odometer! } }, data: { mileage: dto.odometer! } });
      });
    }
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'automotive.inspection_updated',
      targetType: 'INSPECTION_BOOKING',
      targetId: id,
      summary: `Updated inspection ${updated.bookingNumber}`,
    });
    return toInspectionBookingDto(updated);
  }

  async createInspectionBooking(dto: CreateInspectionBookingDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const vehicle = await this.assertVehicle(companyId, dto.vehicleId);
    const service = await this.prisma.inspectionService.findFirst({ where: { id: dto.serviceId, companyId } });
    if (!service) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection service not found.');

    const booking = await this.posting.withTransaction(async (tx) => {
      const bookingNumber = await this.sequences.next(tx, companyId, 'inspectionBooking');
      return tx.inspectionBooking.create({
        data: {
          companyId,
          bookingNumber,
          vehicleId: dto.vehicleId,
          customerId: vehicle.customerId,
          serviceId: dto.serviceId,
          branchId: dto.branchId ?? null,
          scheduledAt: new Date(dto.scheduledAt),
          status: 'SCHEDULED',
          inspectorUserId: dto.inspectorUserId ?? null,
          odometer: dto.odometer ?? null,
          notes: dto.notes ?? null,
          createdById: actor.userId,
        },
        include: BOOKING_INCLUDE,
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_booked', targetType: 'INSPECTION_BOOKING', targetId: booking.id, summary: `Booked inspection ${booking.bookingNumber}` });
    return toInspectionBookingDto(booking);
  }

  async updateInspectionBooking(id: string, dto: UpdateInspectionBookingDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({ where: { id, companyId } });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
    const updated = await this.prisma.inspectionBooking.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.inspectorUserId !== undefined ? { inspectorUserId: dto.inspectorUserId } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.odometer !== undefined ? { odometer: dto.odometer } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.inspectionTypes !== undefined ? { inspectionTypes: normalizeInspectionTypes(dto.inspectionTypes) } : {}),
      },
      include: BOOKING_INCLUDE,
    });
    // A recorded odometer reading also advances the vehicle mileage.
    if (dto.odometer && dto.odometer >= booking.odometer!) {
      if (dto.odometer > 0) {
        await this.prisma.vehicle.updateMany({ where: { id: booking.vehicleId, companyId, mileage: { lt: dto.odometer } }, data: { mileage: dto.odometer } });
      }
    }
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_updated', targetType: 'INSPECTION_BOOKING', targetId: id, summary: `Inspection ${updated.bookingNumber} -> ${updated.status}` });
    return toInspectionBookingDto(updated);
  }

  /** Record findings for a booking, replacing any previous set. */
  async recordFindings(id: string, dto: RecordFindingsDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({ where: { id, companyId } });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
    if (booking.status === 'COMPLETED') throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'This inspection is already completed.');

    const findings = await this.posting.withTransaction(async (tx) => {
      await tx.inspectionFinding.deleteMany({ where: { bookingId: id } });
      for (const f of dto.findings) {
        await tx.inspectionFinding.create({
          data: {
            companyId,
            bookingId: id,
            checklistItemId: f.checklistItemId ?? null,
            category: f.category,
            severity: f.severity as never,
            description: f.description,
            isDefect: f.isDefect ?? f.severity !== 'INFO',
            recommendation: f.recommendation ?? null,
          },
        });
      }
      return tx.inspectionFinding.findMany({ where: { bookingId: id } });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.findings_recorded', targetType: 'INSPECTION_BOOKING', targetId: id, summary: `Recorded ${findings.length} findings` });
    return { items: findings, total: findings.length };
  }

  async getBookingReport(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({
      where: { id, companyId },
      include: { vehicle: true, service: true, findings: true, report: true },
    });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
    // Attachments are stored polymorphically, so they are fetched by entity.
    const attachments = await this.prisma.entityAttachment.findMany({
      where: { companyId, entityType: 'INSPECTION_BOOKING', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    // The report payload is complete enough for a future PDF renderer.
    return {
      booking: toInspectionBookingDto(booking as never),
      vehicle: booking.vehicle,
      service: booking.service,
      findings: booking.findings,
      report: booking.report,
      attachments,
      defects: booking.findings.filter((f) => f.isDefect).length,
      critical: booking.findings.filter((f) => f.severity === 'CRITICAL').length,
    };
  }

  /** Submit the report for approval. Requires at least one finding. */
  async submitReport(id: string, dto: SubmitReportDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({ where: { id, companyId }, include: { findings: true, report: true } });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
    if (booking.report?.status === 'APPROVED') throw badRequest(ERROR_CODES.INSPECTION_ALREADY_APPROVED, 'This report is already approved.');
    if (booking.findings.length === 0) throw badRequest(ERROR_CODES.INSPECTION_NOT_COMPLETE, 'Record findings before submitting the report.');

    const report = await this.prisma.inspectionReport.upsert({
      where: { bookingId: id },
      create: { companyId, bookingId: id, summary: dto.summary ?? null, overallCondition: dto.overallCondition ?? null, status: 'DRAFT' },
      update: { summary: dto.summary ?? null, overallCondition: dto.overallCondition ?? null, status: 'DRAFT' },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.report_submitted', targetType: 'INSPECTION_BOOKING', targetId: id, summary: 'Submitted inspection report' });
    return report;
  }

  async decideReport(id: string, dto: DecideReportDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({ where: { id, companyId }, include: { report: true } });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
    if (!booking.report) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No report has been submitted.');
    if (booking.report.status === 'APPROVED') throw badRequest(ERROR_CODES.INSPECTION_ALREADY_APPROVED, 'This report is already approved.');
    const approved = dto.decision === 'APPROVED';
    const report = await this.posting.withTransaction(async (tx) => {
      const updated = await tx.inspectionReport.update({
        where: { bookingId: id },
        data: { status: approved ? 'APPROVED' : 'REJECTED', approvedById: actor.userId, approvedAt: new Date() },
      });
      if (approved) await tx.inspectionBooking.update({ where: { id }, data: { status: 'COMPLETED' } });
      return updated;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.report_decided', targetType: 'INSPECTION_BOOKING', targetId: id, summary: `Inspection report ${dto.decision.toLowerCase()}` });
    return report;
  }

  /**
   * Invoice an approved inspection through the sales module.
   *
   * The invoice, its ledger entry and its VAT come from the shared sales path,
   * so the inspection fee is posted exactly like any other sale.
   */
  async invoiceInspection(id: string, dto: InvoiceInspectionDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const result = await this.posting.withTransaction(async (tx) => {
      const booking = await tx.inspectionBooking.findFirst({ where: { id, companyId }, include: { report: true, service: true } });
      if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
      if (booking.report?.status !== 'APPROVED') throw forbidden(ERROR_CODES.INSPECTION_NOT_COMPLETE, 'Only an approved inspection can be invoiced.');
      if (booking.report.invoiceId) throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'This inspection has already been invoiced.');
      if (!booking.service) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'This inspection has no priced service to invoice.');

      const invoice = await this.sales.issueInvoice(tx, {
        companyId,
        branchId: dto.branchId ?? booking.branchId,
        customerId: booking.customerId,
        warehouseId: dto.warehouseId ?? null,
        entryDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        sourceType: 'INSPECTION_INVOICE',
        sourceId: booking.id,
        actorUserId: actor.userId,
        notes: `Inspection ${booking.bookingNumber}`,
        issueStock: false,
        lines: [
          {
            productId: null,
            description: `${booking.service.nameEn} — inspection ${booking.bookingNumber}`,
            quantity: 10000,
            unitPriceMinor: booking.service.priceMinor,
            discountPercentBp: 0,
            taxPercentBp: booking.service.taxPercentBp,
          },
        ],
      });
      await tx.inspectionReport.update({ where: { bookingId: id }, data: { invoiceId: invoice.id } });
      return invoice;
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_invoiced', targetType: 'INSPECTION_BOOKING', targetId: id, summary: `Invoiced inspection ${result.invoiceNumber}` });
    return result;
  }

  // ----------------------------------------------------------------- helpers

  private async assertVehicle(companyId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, companyId } });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found in this company.');
    return vehicle;
  }

  private async assertCustomer(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found in this company.');
  }

  // --------------------------------------------------------------- reporting

  async automotiveDashboard(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const [vehicles, inspections, pendingReports, jobCards, openJobs] = await Promise.all([
      this.prisma.vehicle.count({ where: { companyId } }),
      this.prisma.inspectionBooking.count({ where: { companyId } }),
      this.prisma.inspectionReport.count({ where: { companyId, status: 'DRAFT' } }),
      this.prisma.jobCard.count({ where: { companyId } }),
      this.prisma.jobCard.count({ where: { companyId, status: { in: ['OPEN', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'] } } }),
    ]);
    return { totalVehicles: vehicles, totalInspections: inspections, pendingReports, totalJobCards: jobCards, openJobCards: openJobs };
  }
}

// ---------------------------------------------------------------- mappers

function toVehicleDto(v: {
  id: string;
  customerId: string;
  vin: string | null;
  plateNumber: string | null;
  make: string;
  model: string;
  modelYear: number;
  color: string | null;
  mileage: number;
  status: string;
  registrationExpiresAt: Date | null;
  notes: string | null;
  customer?: { code: string; nameEn: string; nameAr: string } | null;
  createdAt: Date;
}) {
  return {
    id: v.id,
    customerId: v.customerId,
    customerCode: v.customer?.code ?? null,
    customerNameEn: v.customer?.nameEn ?? null,
    customerNameAr: v.customer?.nameAr ?? null,
    vin: v.vin,
    plateNumber: v.plateNumber,
    make: v.make,
    model: v.model,
    modelYear: v.modelYear,
    color: v.color,
    mileage: v.mileage,
    status: v.status,
    registrationExpiresAt: v.registrationExpiresAt?.toISOString() ?? null,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
  };
}

function toInspectionBookingDto(b: {
  id: string;
  bookingNumber: string;
  vehicleId: string;
  customerId: string;
  serviceId: string | null;
  status: string;
  scheduledAt: Date;
  inspectorUserId: string | null;
  odometer: number | null;
  inspectionTypes: string[];
  notes: string | null;
  createdAt: Date;
  vehicle?: { vin: string | null; make: string; model: string; modelYear?: number; color?: string | null; plateNumber: string | null } | null;
  customer?: { code: string; nameEn: string; nameAr: string; phone: string | null } | null;
  service?: { nameEn: string; nameAr: string } | null;
  report?: { status: string; invoiceId: string | null } | null;
  _count?: { findings: number };
}) {
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    vehicleId: b.vehicleId,
    vin: b.vehicle?.vin ?? null,
    make: b.vehicle?.make ?? null,
    model: b.vehicle?.model ?? null,
    modelYear: b.vehicle?.modelYear ?? null,
    color: b.vehicle?.color ?? null,
    plateNumber: b.vehicle?.plateNumber ?? null,
    customerId: b.customerId,
    customerCode: b.customer?.code ?? null,
    customerNameEn: b.customer?.nameEn ?? null,
    customerNameAr: b.customer?.nameAr ?? null,
    contactNo: b.customer?.phone ?? null,
    serviceId: b.serviceId,
    serviceNameEn: b.service?.nameEn ?? null,
    serviceNameAr: b.service?.nameAr ?? null,
    status: b.status,
    scheduledAt: b.scheduledAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
    inspectorUserId: b.inspectorUserId,
    odometer: b.odometer,
    inspectionTypes: b.inspectionTypes ?? [],
    notes: b.notes,
    reportStatus: b.report?.status ?? null,
    invoiceId: b.report?.invoiceId ?? null,
    findingCount: b._count?.findings,
  };
}
