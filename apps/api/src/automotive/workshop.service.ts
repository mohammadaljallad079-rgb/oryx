import { nextMasterCode } from '../common/master-code';
import { Injectable } from '@nestjs/common';
import { hoursAmountMinor, hoursToQuantity, sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { SalesService } from '../sales/sales.service';
import { computeDocumentTotals } from '../common/document-totals';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  AddLabourDto,
  ApproveEstimateDto,
  AssignProviderDto,
  CreateCompatibilityDto,
  CreateEstimateDto,
  CreateJobCardDto,
  CreateListingDto,
  CreateMaintenanceBookingDto,
  CreateMaintenanceServiceDto,
  UpdateMaintenanceServiceDto,
  CreatePartReferenceDto,
  CreateProviderDto,
  CreateReservationDto,
  CreateServiceRequestDto,
  CreateSettlementDto,
  CreateWarrantyDto,
  CreateWorkshopBayDto,
  InvoiceJobCardDto,
  IssueReservationDto,
  ListQueryDto,
  ReservedStockQueryDto,
  UpdateJobCardDto,
  UpdateMaintenanceBookingDto,
  UpdateServiceRequestDto,
  ApproveProviderDto,
} from './automotive.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Legal job-card transitions. */
const JOB_CARD_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['AWAITING_APPROVAL', 'IN_PROGRESS', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'OPEN', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['INVOICED'],
  INVOICED: [],
  CANCELLED: [],
};

@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
    private readonly inventory: InventoryService,
    private readonly sales: SalesService,
  ) {}

  // ------------------------------------------------------ maintenance services

  async listMaintenanceServices(principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    return this.prisma.maintenanceService.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
  }

  private async validateServiceBranches(companyId: string, branchIds: string[]) {
    if (!branchIds.length) return;
    const unique = [...new Set(branchIds)];
    if (unique.length !== branchIds.length) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Duplicate service branches are not allowed.');
    }
    const found = await this.prisma.branch.count({ where: { companyId, id: { in: unique } } });
    if (found !== unique.length) throw forbidden(ERROR_CODES.VALIDATION_FAILED, 'Service branches must belong to this company.');
  }

  async createMaintenanceService(dto: CreateMaintenanceServiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.validateServiceBranches(companyId, dto.branchIds ?? []);
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Service code must use letters, numbers, underscores or hyphens.');
    }
    const service = await this.prisma.maintenanceService.create({
      data: {
        companyId, code, nameEn: dto.nameEn, nameAr: dto.nameAr,
        descriptionEn: dto.descriptionEn ?? null, descriptionAr: dto.descriptionAr ?? null,
        priceMinor: dto.priceMinor, durationMinutes: dto.durationMinutes,
        imageUrl: dto.imageUrl ?? null, branchIds: dto.branchIds ?? [],
        isActive: dto.isActive ?? true, isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.maintenance_service_created', targetType: 'MAINTENANCE_SERVICE', targetId: service.id, summary: `Created maintenance service ${code}` });
    return service;
  }

  async updateMaintenanceService(id: string, dto: UpdateMaintenanceServiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.maintenanceService.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Maintenance service not found.');
    if (dto.branchIds) await this.validateServiceBranches(companyId, dto.branchIds);
    const updated = await this.prisma.maintenanceService.update({
      where: { id }, data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.priceMinor !== undefined ? { priceMinor: dto.priceMinor } : {}),
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.branchIds !== undefined ? { branchIds: dto.branchIds } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.maintenance_service_updated', targetType: 'MAINTENANCE_SERVICE', targetId: id, summary: `Updated maintenance service ${updated.code}` });
    return updated;
  }

  async deleteMaintenanceService(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.maintenanceService.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Maintenance service not found.');
    await this.prisma.maintenanceService.delete({ where: { id } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.maintenance_service_deleted', targetType: 'MAINTENANCE_SERVICE', targetId: id, summary: `Deleted maintenance service ${existing.code}` });
    return { id, deleted: true };
  }

  // ------------------------------------------------------------------ bays

  /**
   * The workshop dashboard: live counts for the workshop landing screen.
   *
   * Every figure is a count from the tenant's own rows, so the screen shows
   * what the database holds rather than a cached total. `openJobCards` counts
   * the states that still need workshop attention, which is the number an
   * operator acts on, not the lifetime total.
   */
  async dashboard(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const [
      bays,
      activeBays,
      jobCards,
      openJobCards,
      awaitingApproval,
      completedJobCards,
      invoicedJobCards,
      bookings,
      scheduledBookings,
      reservations,
      outstandingReservations,
      warranties,
      activeWarranties,
    ] = await Promise.all([
      this.prisma.workshopBay.count({ where: { companyId } }),
      this.prisma.workshopBay.count({ where: { companyId, isActive: true } }),
      this.prisma.jobCard.count({ where: { companyId } }),
      this.prisma.jobCard.count({ where: { companyId, status: { in: ['OPEN', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'] } } }),
      this.prisma.jobCard.count({ where: { companyId, status: 'AWAITING_APPROVAL' } }),
      this.prisma.jobCard.count({ where: { companyId, status: 'COMPLETED' } }),
      this.prisma.jobCard.count({ where: { companyId, status: 'INVOICED' } }),
      this.prisma.maintenanceBooking.count({ where: { companyId } }),
      this.prisma.maintenanceBooking.count({ where: { companyId, status: { in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.partsReservation.count({ where: { companyId } }),
      this.prisma.partsReservation.count({ where: { companyId, status: { in: ['RESERVED', 'PARTIALLY_ISSUED'] } } }),
      this.prisma.warrantyRecord.count({ where: { companyId } }),
      this.prisma.warrantyRecord.count({ where: { companyId, isActive: true } }),
    ]);
    return {
      bays,
      activeBays,
      jobCards,
      openJobCards,
      awaitingApproval,
      completedJobCards,
      invoicedJobCards,
      bookings,
      scheduledBookings,
      reservations,
      outstandingReservations,
      warranties,
      activeWarranties,
    };
  }

  async listBays(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.workshopBay.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createBay(dto: CreateWorkshopBayDto, principal: RequestPrincipal, actor: ActorContext) {
    // Server allocates the code when a form omits it; legacy imports may supply their own.
    const code = dto.code?.trim() || await nextMasterCode(this.prisma, 'BAY');
    const names = { nameEn: dto.nameEn?.trim() || dto.nameAr?.trim() || '', nameAr: dto.nameAr?.trim() || dto.nameEn?.trim() || '' };
    if (!names.nameEn) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Name required in Arabic or English.');
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.workshopBay.findUnique({ where: { companyId_code: { companyId, code: code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Bay ${code} already exists.`);
    const bay = await this.prisma.workshopBay.create({ data: { companyId, branchId: dto.branchId ?? null, code: code, ...names } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.bay_created', targetType: 'WORKSHOP_BAY', targetId: bay.id, summary: `Created bay ${bay.code}` });
    return bay;
  }

  // ------------------------------------------------- maintenance bookings

  async listMaintenanceBookings(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.maintenanceBooking.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
      include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, _count: { select: { jobCards: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createMaintenanceBooking(dto: CreateMaintenanceBookingDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const vehicle = await this.assertVehicle(companyId, dto.vehicleId);
    const booking = await this.posting.withTransaction(async (tx) => {
      const bookingNumber = await this.sequences.next(tx, companyId, 'maintenanceBooking');
      return tx.maintenanceBooking.create({
        data: {
          companyId,
          bookingNumber,
          vehicleId: dto.vehicleId,
          customerId: vehicle.customerId,
          branchId: dto.branchId ?? null,
          bayId: dto.bayId ?? null,
          scheduledAt: new Date(dto.scheduledAt),
          status: 'SCHEDULED',
          complaint: dto.complaint ?? null,
          notes: dto.notes ?? null,
          createdById: actor.userId,
        },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.maintenance_booked', targetType: 'MAINTENANCE_BOOKING', targetId: booking.id, summary: `Booked maintenance ${booking.bookingNumber}` });
    return booking;
  }

  async updateMaintenanceBooking(id: string, dto: UpdateMaintenanceBookingDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.maintenanceBooking.findFirst({ where: { id, companyId } });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Maintenance booking not found.');
    const updated = await this.prisma.maintenanceBooking.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.bayId !== undefined ? { bayId: dto.bayId } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.complaint !== undefined ? { complaint: dto.complaint } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.maintenance_updated', targetType: 'MAINTENANCE_BOOKING', targetId: id, summary: `Maintenance ${updated.bookingNumber} -> ${updated.status}` });
    return updated;
  }

  // ---------------------------------------------------------------- job cards

  async listJobCards(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.search
        ? {
            OR: [
              { jobNumber: { contains: query.search, mode: 'insensitive' as const } },
              { complaint: { contains: query.search, mode: 'insensitive' as const } },
              { vehicle: { vin: { contains: query.search, mode: 'insensitive' as const } } },
              { vehicle: { plateNumber: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.jobCard.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } },
          _count: { select: { labour: true, estimates: true, reservations: true } },
        },
      }),
      this.prisma.jobCard.count({ where }),
    ]);
    return { items: await this.decorateJobCards(rows), total, page, pageSize };
  }

  /**
   * Resolve the customer and technician names for a page of job cards in two
   * batched queries rather than joining per row. The JobCard model deliberately
   * carries raw ids for these (no relation), so the names are looked up here.
   */
  private async decorateJobCards<T extends {
    id: string;
    jobNumber: string;
    vehicleId: string;
    customerId: string;
    status: string;
    technicianUserId: string | null;
    odometer: number | null;
    complaint: string | null;
    diagnosis: string | null;
    invoiceId: string | null;
    vehicle?: { vin: string; make: string; model: string; plateNumber: string | null } | null;
    _count?: { labour: number; estimates: number; reservations: number };
    createdAt: Date;
  }>(rows: T[]) {
    const customerIds = [...new Set(rows.map((r) => r.customerId))];
    const technicianIds = [...new Set(rows.map((r) => r.technicianUserId).filter((v): v is string => Boolean(v)))];
    const [customers, technicians] = await Promise.all([
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, nameEn: true, nameAr: true, phone: true },
          })
        : Promise.resolve([]),
      technicianIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: technicianIds } },
            select: { id: true, fullNameEn: true, fullNameAr: true },
          })
        : Promise.resolve([]),
    ]);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const technicianById = new Map(technicians.map((u) => [u.id, u]));
    return rows.map((r) => {
      const customer = customerById.get(r.customerId);
      const technician = r.technicianUserId ? technicianById.get(r.technicianUserId) : undefined;
      return {
        ...toJobCardDto(r),
        customerNameEn: customer?.nameEn ?? null,
        customerNameAr: customer?.nameAr ?? null,
        customerPhone: customer?.phone ?? null,
        technicianNameEn: technician?.fullNameEn ?? null,
        technicianNameAr: technician?.fullNameAr ?? null,
      };
    });
  }

  async getJobCard(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const job = await this.prisma.jobCard.findFirst({
      where: { id, companyId },
      include: {
        vehicle: true,
        labour: { orderBy: { sortOrder: 'asc' } },
        estimates: { include: { lines: true }, orderBy: { createdAt: 'desc' } },
        reservations: { include: { lines: true }, orderBy: { reservedAt: 'desc' } },
        warranties: true,
      },
    });
    if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
    return job;
  }

  async createJobCard(dto: CreateJobCardDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const vehicle = await this.assertVehicle(companyId, dto.vehicleId);
    if (dto.bookingId) {
      const booking = await this.prisma.maintenanceBooking.findFirst({ where: { id: dto.bookingId, companyId } });
      if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Maintenance booking not found.');
    }
    const job = await this.posting.withTransaction(async (tx) => {
      const jobNumber = await this.sequences.next(tx, companyId, 'jobCard');
      return tx.jobCard.create({
        data: {
          companyId,
          jobNumber,
          vehicleId: dto.vehicleId,
          bookingId: dto.bookingId ?? null,
          customerId: vehicle.customerId,
          branchId: dto.branchId ?? null,
          bayId: dto.bayId ?? null,
          technicianUserId: dto.technicianUserId ?? null,
          status: 'OPEN',
          // Read the mileage from the existing vehicle record, not a second job-card form field.
          odometer: vehicle.mileage,
          complaint: dto.complaint ?? null,
          diagnosis: dto.diagnosis ?? null,
          createdById: actor.userId,
        },
        include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, _count: { select: { labour: true, estimates: true, reservations: true } } },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.job_card_created', targetType: 'JOB_CARD', targetId: job.id, summary: `Opened job card ${job.jobNumber}` });
    return toJobCardDto(job);
  }

  /** Change a job card's status, enforcing the transition graph. */
  async updateJobCard(id: string, dto: UpdateJobCardDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const job = await this.prisma.jobCard.findFirst({ where: { id, companyId } });
    if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
    if (dto.status && dto.status !== job.status) {
      const allowed = JOB_CARD_TRANSITIONS[job.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw badRequest(ERROR_CODES.JOB_CARD_STATE, `Cannot move a job card from ${job.status} to ${dto.status}.`, { from: job.status, to: dto.status, allowed });
      }
      // Work items are entered directly by the operator; no separate estimate approval
      // is required. Prevent completion when no billable lines were recorded.
      if (dto.status === 'COMPLETED') {
        const items = await this.prisma.repairEstimateLine.count({ where: { estimate: { jobCardId: id } } });
        if (items === 0) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Add at least one service or part before completing the job.');
      }
    }
    const updated = await this.prisma.jobCard.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.technicianUserId !== undefined ? { technicianUserId: dto.technicianUserId } : {}),
        ...(dto.bayId !== undefined ? { bayId: dto.bayId } : {}),
        ...(dto.diagnosis !== undefined ? { diagnosis: dto.diagnosis } : {}),
        ...(dto.odometer !== undefined ? { odometer: dto.odometer } : {}),
        ...(dto.status === 'IN_PROGRESS' && !job.startedAt ? { startedAt: new Date() } : {}),
        ...(dto.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
      include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, _count: { select: { labour: true, estimates: true, reservations: true } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.job_card_updated', targetType: 'JOB_CARD', targetId: id, summary: `Job card ${updated.jobNumber} -> ${updated.status}` });
    return toJobCardDto(updated);
  }

  async addLabour(id: string, dto: AddLabourDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const job = await this.prisma.jobCard.findFirst({ where: { id, companyId } });
    if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
    const count = await this.prisma.labourOperation.count({ where: { jobCardId: id } });
    const rows = await this.posting.withTransaction(async (tx) => {
      const created = [];
      for (const [i, op] of dto.operations.entries()) {
        created.push(
          await tx.labourOperation.create({
            data: { companyId, jobCardId: id, description: op.description, hours: op.hours, rateMinor: op.rateMinor, amountMinor: hoursAmountMinor(op.hours, op.rateMinor), sortOrder: count + i },
          }),
        );
      }
      return created;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.labour_added', targetType: 'JOB_CARD', targetId: id, summary: `Added ${rows.length} labour operations` });
    return { items: rows, total: rows.length };
  }

  // ---------------------------------------------------------------- estimates

  async createEstimate(jobCardId: string, dto: CreateEstimateDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const job = await this.prisma.jobCard.findFirst({ where: { id: jobCardId, companyId } });
    if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
    const totals = computeDocumentTotals(dto.lines.map((l) => ({ quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, discountPercentBp: 0, taxPercentBp: l.taxPercentBp ?? 0 })));

    const estimate = await this.posting.withTransaction(async (tx) => {
      const estimateNumber = await this.sequences.next(tx, companyId, 'repairEstimate');
      return tx.repairEstimate.create({
        data: {
          companyId,
          jobCardId,
          estimateNumber,
          status: 'SENT', // Preserve legacy estimate semantics; the new work-items endpoint uses APPROVED.
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: {
            create: dto.lines.map((l, i) => ({
              companyId,
              type: l.type as never,
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              unitPriceMinor: l.unitPriceMinor,
              taxPercentBp: l.taxPercentBp ?? 0,
              lineTotalMinor: totals.lines[i].lineTotalMinor,
              sortOrder: i,
            })),
          },
        },
        include: { lines: true },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.estimate_created', targetType: 'REPAIR_ESTIMATE', targetId: estimate.id, summary: `Created estimate ${estimate.estimateNumber}` });
    return estimate;
  }

  /**
   * Save the job card's complete billable service/part set in one transaction.
   * The legacy RepairEstimate tables are deliberately reused for existing
   * invoice/reports compatibility; no approval step is exposed to operators.
   * Replacing items instead of creating a new estimate on every Save preserves
   * edits and prevents previously entered lines disappearing from the invoice.
   */
  async saveWorkItems(jobCardId: string, dto: CreateEstimateDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const job = await this.prisma.jobCard.findFirst({ where: { id: jobCardId, companyId } });
    if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
    if (job.status === 'COMPLETED' || job.status === 'INVOICED' || job.status === 'CANCELLED') {
      throw badRequest(ERROR_CODES.JOB_CARD_STATE, 'Work items cannot be changed after job completion or cancellation.');
    }
    if (dto.lines.length === 0 || dto.lines.some((line) => line.type !== 'SERVICE' && line.type !== 'PART')) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Provide at least one service or part line.');
    }

    const totals = computeDocumentTotals(dto.lines.map((line) => ({
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountPercentBp: 0,
      taxPercentBp: line.taxPercentBp ?? 0,
    })));
    const saved = await this.posting.withTransaction(async (tx) => {
      const existing = await tx.repairEstimate.findFirst({
        where: { companyId, jobCardId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const lines = dto.lines.map((line, index) => ({
        companyId,
        type: line.type as never,
        productId: line.productId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxPercentBp: line.taxPercentBp ?? 0,
        lineTotalMinor: totals.lines[index].lineTotalMinor,
        sortOrder: index,
      }));
      if (existing) {
        return tx.repairEstimate.update({
          where: { id: existing.id },
          data: {
            status: 'APPROVED',
            subtotalMinor: totals.subtotalMinor,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
            lines: { deleteMany: {}, create: lines },
          },
          include: { lines: true },
        });
      }
      const estimateNumber = await this.sequences.next(tx, companyId, 'repairEstimate');
      return tx.repairEstimate.create({
        data: {
          companyId,
          jobCardId,
          estimateNumber,
          status: 'APPROVED',
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          createdById: actor.userId,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'automotive.job_work_items_saved',
      targetType: 'JOB_CARD',
      targetId: jobCardId,
      summary: `Saved ${saved.lines.length} service/part items for job ${job.jobNumber}`,
    });
    return saved;
  }

  /** Record the customer's decision on an estimate. */
  async decideEstimate(id: string, approved: boolean, dto: ApproveEstimateDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const estimate = await this.prisma.repairEstimate.findFirst({ where: { id, companyId } });
    if (!estimate) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Estimate not found.');
    if (estimate.status === 'APPROVED') throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'This estimate is already approved.');
    const updated = await this.prisma.repairEstimate.update({
      where: { id },
      data: { status: approved ? 'APPROVED' : 'REJECTED', customerApprovedById: actor.userId, approvedAt: new Date(), ...(dto.note ? { notes: dto.note } : {}) },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.estimate_decided', targetType: 'REPAIR_ESTIMATE', targetId: id, summary: `Estimate ${estimate.estimateNumber} ${approved ? 'approved' : 'rejected'}` });
    return updated;
  }

  // ------------------------------------------------------- parts reservations

  async listReservations(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.partsReservation.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { reservedAt: 'desc' },
      take: 200,
      include: { lines: true, jobCard: { select: { jobNumber: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  /**
   * Reserve parts for a job card.
   *
   * A reservation only records intent; it does **not** touch the stock ledger.
   * Stock actually moves when the reservation is issued, through the shared
   * inventory service, so there is exactly one stock ledger.
   */
  async createReservation(dto: CreateReservationDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const job = await this.prisma.jobCard.findFirst({ where: { id: dto.jobCardId, companyId } });
    if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found.');

    const reservation = await this.posting.withTransaction(async (tx) => {
      for (const line of dto.lines) {
        const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
        if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found in this company.');
      }
      return tx.partsReservation.create({
        data: {
          companyId,
          jobCardId: dto.jobCardId,
          warehouseId: dto.warehouseId,
          status: 'RESERVED',
          createdById: actor.userId,
          lines: { create: dto.lines.map((l) => ({ companyId, productId: l.productId, quantity: l.quantity })) },
        },
        include: { lines: true },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.parts_reserved', targetType: 'PARTS_RESERVATION', targetId: reservation.id, summary: `Reserved ${dto.lines.length} part lines for ${job.jobNumber}` });
    return reservation;
  }

  /**
   * Issue reserved parts and consume the shared stock ledger.
   *
   * Each line is issued through `InventoryService.recordMovement`, so the
   * moving-average valuation, the negative-stock guard and the row lock all
   * apply exactly as they do for a sales issue.
   */
  async issueReservation(id: string, dto: IssueReservationDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const reservation = await tx.partsReservation.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!reservation) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Reservation not found.');
      if (reservation.status === 'ISSUED' || reservation.status === 'CANCELLED') {
        throw badRequest(ERROR_CODES.RESERVATION_ALREADY_ISSUED, 'This reservation is already issued or cancelled.');
      }
      const requested = dto.lines ?? reservation.lines.map((l) => ({ productId: l.productId, quantity: l.quantity - l.issuedQuantity }));
      let issuedAny = false;

      for (const req of requested) {
        const line = reservation.lines.find((l) => l.productId === req.productId);
        if (!line) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The requested product is not on this reservation.');
        const remaining = line.quantity - line.issuedQuantity;
        if (req.quantity > remaining) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Issue quantity exceeds the reserved quantity.');
        await this.inventory.recordMovement(tx, {
          companyId,
          branchId: null,
          warehouseId: reservation.warehouseId,
          productId: req.productId,
          movementType: 'ISSUE',
          quantity: -req.quantity,
          source: 'MANUAL',
          sourceId: reservation.id,
          memo: 'Workshop parts issue',
          occurredAt: new Date(),
          actorUserId: actor.userId,
        });
        await tx.partsReservationLine.update({ where: { id: line.id }, data: { issuedQuantity: line.issuedQuantity + req.quantity } });
        issuedAny = true;
      }

      const refreshed = await tx.partsReservationLine.findMany({ where: { reservationId: id } });
      const fullyIssued = refreshed.every((l) => l.issuedQuantity >= l.quantity);
      const status = fullyIssued ? 'ISSUED' : issuedAny ? 'PARTIALLY_ISSUED' : reservation.status;
      return tx.partsReservation.update({ where: { id }, data: { status, ...(fullyIssued ? { issuedAt: new Date() } : {}) }, include: { lines: true } });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.parts_issued', targetType: 'PARTS_RESERVATION', targetId: id, summary: 'Issued reserved parts to the stock ledger' });
    return result;
  }

  /**
   * Cancel a parts reservation.
   *
   * Only a reservation that has not been issued (or partially issued) can be
   * cancelled: once stock has left the ledger through `issueReservation`, the
   * movement is permanent and must be reversed through the inventory module
   * rather than silently dropped. A cancelled reservation releases the
   * reserved quantity for other work orders.
   */
  async cancelReservation(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const reservation = await tx.partsReservation.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!reservation) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Reservation not found.');
      if (reservation.status === 'CANCELLED') {
        throw badRequest(ERROR_CODES.RESERVATION_ALREADY_ISSUED, 'This reservation is already cancelled.');
      }
      const issued = reservation.lines.some((l) => l.issuedQuantity > 0);
      if (issued) {
        throw badRequest(
          ERROR_CODES.RESERVATION_ALREADY_ISSUED,
          'Parts have already been issued from this reservation; reverse the stock movement instead of cancelling.',
        );
      }
      return tx.partsReservation.update({ where: { id }, data: { status: 'CANCELLED' }, include: { lines: true } });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.parts_reservation_cancelled', targetType: 'PARTS_RESERVATION', targetId: id, summary: 'Cancelled a parts reservation' });
    return result;
  }

  /**
   * Outstanding reserved quantity per product and warehouse.
   *
   * A reservation does not touch the stock ledger, so `StockLevel.quantity` is
   * on-hand only. This reports the quantity that is promised to open job cards
   * but not yet issued, so a workshop can see what is genuinely available.
   */
  async reservedStock(query: ReservedStockQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const lines = await this.prisma.partsReservationLine.findMany({
      where: {
        companyId,
        ...(query.productId ? { productId: query.productId } : {}),
        reservation: {
          status: { in: ['RESERVED', 'PARTIALLY_ISSUED'] },
          ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        },
      },
      include: {
        reservation: { select: { warehouseId: true, status: true } },
        product: { select: { sku: true, nameEn: true } },
      },
    });

    const byKey = new Map<string, { warehouseId: string; productId: string; sku: string; nameEn: string; reservedQuantity: number }>();
    for (const line of lines) {
      const outstanding = line.quantity - line.issuedQuantity;
      if (outstanding <= 0) continue;
      const key = `${line.reservation.warehouseId}:${line.productId}`;
      const entry = byKey.get(key) ?? {
        warehouseId: line.reservation.warehouseId,
        productId: line.productId,
        sku: line.product.sku,
        nameEn: line.product.nameEn,
        reservedQuantity: 0,
      };
      entry.reservedQuantity += outstanding;
      byKey.set(key, entry);
    }

    const items = [...byKey.values()].sort((a, b) => a.sku.localeCompare(b.sku));
    return { items, total: items.length, page: 1, pageSize: items.length };
  }

  // ----------------------------------------------------------------- invoicing

  /**
   * Invoice a completed job card.
   *
   * The invoice is raised through the sales module, so revenue, VAT, the
   * receivable and any COGS entry are posted by the one ledger. Parts consumed
   * by the job were already issued from stock when the reservation was issued;
   * here they are billed as a line, not issued a second time.
   */
  async invoiceJobCard(id: string, dto: InvoiceJobCardDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      // Serialise double-clicks and concurrent requests for the same job across
      // API instances. The financial document must never be posted twice.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('oryx-workshop-invoice'), hashtext(${id}))`;
      const job = await tx.jobCard.findFirst({
        where: { id, companyId },
        include: { labour: true, estimates: { include: { lines: true }, where: { status: { in: ['APPROVED', 'SENT'] } }, orderBy: { createdAt: 'desc' }, take: 1 }, reservations: { include: { lines: true } } },
      });
      if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
      if (job.status === 'INVOICED') {
        if (!job.invoiceId) throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'Invoiced job has no linked sales document.');
        const existing = await tx.salesInvoice.findFirst({ where: { id: job.invoiceId, companyId } });
        if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Linked invoice was not found.');
        return { invoice: existing, created: false };
      }
      if (job.status !== 'COMPLETED') throw badRequest(ERROR_CODES.JOB_CARD_STATE, 'Only a completed job card can be invoiced.');

      // Bill the latest saved work items, retaining legacy labour fallback for old jobs.
      const lines: Array<{ productId: string | null; description: string; quantity: number; unitPriceMinor: number; taxPercentBp: number }> = [];
      const estimate = job.estimates[0];
      if (estimate) {
        for (const l of estimate.lines) {
          lines.push({ productId: l.productId, description: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, taxPercentBp: l.taxPercentBp });
        }
      } else {
        for (const op of job.labour) {
          // `op.hours` is hundredths of an hour; invoice lines carry quantities
          // scaled by QUANTITY_SCALE (10^4), so rescale before pricing.
          lines.push({ productId: null, description: op.description, quantity: hoursToQuantity(op.hours), unitPriceMinor: op.rateMinor, taxPercentBp: 0 });
        }
      }
      if (lines.length === 0) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The job card has no billable lines.');

      const invoice = await this.sales.issueInvoice(tx, {
        companyId,
        branchId: job.branchId,
        customerId: job.customerId,
        warehouseId: dto.warehouseId ?? null,
        entryDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        sourceType: 'WORKSHOP_INVOICE',
        sourceId: job.id,
        actorUserId: actor.userId,
        notes: `Workshop job ${job.jobNumber}`,
        // Parts were already issued from stock when the reservation was issued.
        issueStock: false,
        lines,
      });
      await tx.jobCard.update({ where: { id }, data: { status: 'INVOICED', invoiceId: invoice.id } });
      return { invoice, created: true };
    });
    if (result.created) await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.job_card_invoiced', targetType: 'JOB_CARD', targetId: id, summary: `Invoiced job card ${result.invoice.invoiceNumber}` });
    return result.invoice;
  }

  // --------------------------------------------------------------- warranties

  async listWarranties(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.warrantyRecord.findMany({
      where: { companyId, ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { vehicle: { select: { vin: true, make: true, model: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createWarranty(dto: CreateWarrantyDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertVehicle(companyId, dto.vehicleId);
    const warranty = await this.prisma.warrantyRecord.create({
      data: { companyId, vehicleId: dto.vehicleId, jobCardId: dto.jobCardId ?? null, description: dto.description, terms: dto.terms ?? null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.warranty_created', targetType: 'WARRANTY_RECORD', targetId: warranty.id, summary: `Recorded warranty for vehicle` });
    return warranty;
  }

  // --------------------------------------------------------------- parts data

  /**
   * Part numbers with an optional free-text search.
   *
   * A workshop looks a part up by number, brand or the linked product's SKU or
   * name, so the filter spans all four rather than the part number alone.
   */
  async listPartReferences(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const search = query.search?.trim();
    const rows = await this.prisma.partReference.findMany({
      where: {
        companyId,
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.status ? { type: query.status as never } : {}),
        ...(search
          ? {
              OR: [
                { partNumber: { contains: search, mode: 'insensitive' as const } },
                { brand: { contains: search, mode: 'insensitive' as const } },
                { product: { sku: { contains: search, mode: 'insensitive' as const } } },
                { product: { nameEn: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      orderBy: { partNumber: 'asc' },
      include: { product: { select: { sku: true, nameEn: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createPartReference(dto: CreatePartReferenceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, companyId } });
    if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found in this company.');
    const dup = await this.prisma.partReference.findUnique({ where: { companyId_partNumber_type: { companyId, partNumber: dto.partNumber, type: (dto.type as never) ?? 'OEM' } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Part number ${dto.partNumber} already exists for this type.`);
    const ref = await this.prisma.partReference.create({
      data: { companyId, productId: dto.productId, partNumber: dto.partNumber, type: (dto.type as never) ?? 'OEM', brand: dto.brand ?? null },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.part_reference_created', targetType: 'PART_REFERENCE', targetId: ref.id, summary: `Added part number ${ref.partNumber}` });
    return ref;
  }

  async listCompatibility(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.partCompatibility.findMany({ where: { companyId }, include: { product: { select: { sku: true, nameEn: true } } }, take: 500 });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createCompatibility(dto: CreateCompatibilityDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, companyId } });
    if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found in this company.');
    const compat = await this.prisma.partCompatibility.create({
      data: { companyId, productId: dto.productId, make: dto.make, model: dto.model, yearFrom: dto.yearFrom, yearTo: dto.yearTo ?? null, notes: dto.notes ?? null },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.compatibility_created', targetType: 'PART_COMPATIBILITY', targetId: compat.id, summary: `Mapped ${product.sku} to ${dto.make} ${dto.model}` });
    return compat;
  }

  /** Parts compatible with a given vehicle, resolved through the shared catalog. */
  async compatibleParts(make: string, model: string, year: number, principal: RequestPrincipal, companyIdInput?: string) {
    // Guard the numeric filter even though the controller validates: a NaN
    // reaching Prisma raises a 500, and this method is callable from elsewhere.
    if (!Number.isInteger(year)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A model year is required.');
    }
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const rows = await this.prisma.partCompatibility.findMany({
      where: { companyId, make: { equals: make, mode: 'insensitive' }, model: { equals: model, mode: 'insensitive' }, yearFrom: { lte: year }, OR: [{ yearTo: null }, { yearTo: { gte: year } }] },
      include: { product: { select: { id: true, sku: true, nameEn: true, nameAr: true, salesPriceMinor: true, costPriceMinor: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  // ------------------------------------------------------------- marketplace

  async listProviders(query: ListQueryDto, principal: RequestPrincipal) {
    const rows = await this.prisma.marketplaceProvider.findMany({
      where: { ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { code: 'asc' },
      include: { _count: { select: { listings: true, requests: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createProvider(dto: CreateProviderDto, principal: RequestPrincipal, actor: ActorContext) {
    // Server allocates the code when a form omits it; legacy imports may supply their own.
    const code = dto.code?.trim() || await nextMasterCode(this.prisma, 'PRV');
    const names = { nameEn: dto.nameEn?.trim() || dto.nameAr?.trim() || '', nameAr: dto.nameAr?.trim() || dto.nameEn?.trim() || '' };
    if (!names.nameEn) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Name required in Arabic or English.');
    const dup = await this.prisma.marketplaceProvider.findUnique({ where: { code: code } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Provider ${code} already exists.`);
    const provider = await this.prisma.marketplaceProvider.create({
      data: {
        code: code,
        ...names,
        categoryKey: dto.categoryKey ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        providerCompanyId: dto.providerCompanyId ?? null,
        commissionPercentBp: dto.commissionPercentBp ?? 0,
        status: 'PENDING',
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId: null, action: 'marketplace.provider_created', targetType: 'MARKETPLACE_PROVIDER', targetId: provider.id, summary: `Created provider ${provider.code}` });
    return provider;
  }

  /** Approve, suspend or reject a provider. Only an approved provider is assignable. */
  async decideProvider(id: string, dto: ApproveProviderDto, principal: RequestPrincipal, actor: ActorContext) {
    const provider = await this.prisma.marketplaceProvider.findUnique({ where: { id } });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    const updated = await this.prisma.marketplaceProvider.update({
      where: { id },
      data: { status: dto.decision as never, approvedAt: dto.decision === 'APPROVED' ? new Date() : provider.approvedAt, notes: dto.note ?? provider.notes },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId: null, action: 'marketplace.provider_decided', targetType: 'MARKETPLACE_PROVIDER', targetId: id, summary: `Provider ${provider.code} ${dto.decision.toLowerCase()}` });
    return updated;
  }

  async listListings(providerId: string, principal: RequestPrincipal) {
    const rows = await this.prisma.providerServiceListing.findMany({ where: { providerId }, orderBy: { createdAt: 'desc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createListing(providerId: string, dto: CreateListingDto, principal: RequestPrincipal, actor: ActorContext) {
    const names = { nameEn: dto.nameEn?.trim() || dto.nameAr?.trim() || '', nameAr: dto.nameAr?.trim() || dto.nameEn?.trim() || '' };
    if (!names.nameEn) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Name required in Arabic or English.');
    const provider = await this.prisma.marketplaceProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    const listing = await this.prisma.providerServiceListing.create({
      data: { providerId, categoryKey: dto.categoryKey, ...names, description: dto.description ?? null, priceMinor: dto.priceMinor ?? 0 },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId: null, action: 'marketplace.listing_created', targetType: 'PROVIDER_SERVICE_LISTING', targetId: listing.id, summary: `Created listing ${listing.nameEn}` });
    return listing;
  }

  async listServiceRequests(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.serviceRequest.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { provider: { select: { code: true, nameEn: true, nameAr: true, status: true } } },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createServiceRequest(dto: CreateServiceRequestDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const request = await this.posting.withTransaction(async (tx) => {
      const requestNumber = await this.sequences.next(tx, companyId, 'serviceRequest');
      return tx.serviceRequest.create({
        data: {
          companyId,
          requestNumber,
          customerId: dto.customerId ?? null,
          vehicleId: dto.vehicleId ?? null,
          categoryKey: dto.categoryKey,
          description: dto.description ?? null,
          providerId: dto.providerId ?? null,
          status: dto.providerId ? 'ASSIGNED' : 'NEW',
          createdById: actor.userId,
        },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'marketplace.service_request_created', targetType: 'SERVICE_REQUEST', targetId: request.id, summary: `Created service request ${request.requestNumber}` });
    return request;
  }

  /** Assign a request to an approved provider and accrue the commission. */
  async assignProvider(id: string, dto: AssignProviderDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const request = await this.prisma.serviceRequest.findFirst({ where: { id, companyId } });
    if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service request not found.');
    const provider = await this.prisma.marketplaceProvider.findUnique({ where: { id: dto.providerId } });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    if (provider.status !== 'APPROVED') throw forbidden(ERROR_CODES.PROVIDER_NOT_APPROVED, 'Only an approved provider can be assigned.');
    const updated = await this.prisma.serviceRequest.update({ where: { id }, data: { providerId: provider.id, status: 'ASSIGNED', assignedAt: new Date() } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'marketplace.provider_assigned', targetType: 'SERVICE_REQUEST', targetId: id, summary: `Assigned request to ${provider.code}` });
    return updated;
  }

  async updateServiceRequest(id: string, dto: UpdateServiceRequestDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const request = await this.prisma.serviceRequest.findFirst({ where: { id, companyId } });
    if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service request not found.');
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: { ...(dto.status !== undefined ? { status: dto.status as never } : {}), ...(dto.status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'marketplace.service_request_updated', targetType: 'SERVICE_REQUEST', targetId: id, summary: `Service request ${updated.requestNumber} -> ${updated.status}` });
    return updated;
  }

  /** Record a commission for a service request, applying the provider's rate. */
  async recordCommission(serviceRequestId: string, baseMinor: number, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const request = await this.prisma.serviceRequest.findFirst({ where: { id: serviceRequestId, companyId } });
    if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Service request not found.');
    if (!request.providerId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The request has no provider.');
    const provider = await this.prisma.marketplaceProvider.findUniqueOrThrow({ where: { id: request.providerId } });
    const commissionMinor = Math.round((baseMinor * provider.commissionPercentBp) / 10000);
    const commission = await this.prisma.marketplaceCommission.create({
      data: { companyId, serviceRequestId, providerId: provider.id, baseMinor, rateBp: provider.commissionPercentBp, commissionMinor },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'marketplace.commission_recorded', targetType: 'MARKETPLACE_COMMISSION', targetId: commission.id, summary: `Recorded commission ${commissionMinor}` });
    return commission;
  }

  /**
   * Prepare a provider settlement for a period from its pending commissions.
   * Settlement is a foundation: it aggregates and marks commissions invoiced,
   * and records the net payable. No payment is executed.
   */
  async createSettlement(dto: CreateSettlementDto, principal: RequestPrincipal, actor: ActorContext) {
    const provider = await this.prisma.marketplaceProvider.findUnique({ where: { id: dto.providerId } });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    return this.posting.withTransaction(async (tx) => {
      const commissions = await tx.marketplaceCommission.findMany({
        where: { providerId: provider.id, status: 'PENDING', createdAt: { gte: periodStart, lte: periodEnd } },
      });
      const gross = sumMinor(commissions.map((c) => c.baseMinor));
      const commissionTotal = sumMinor(commissions.map((c) => c.commissionMinor));
      const settlement = await tx.providerSettlement.create({
        data: {
          providerId: provider.id,
          periodStart,
          periodEnd,
          grossMinor: gross,
          commissionMinor: commissionTotal,
          netMinor: gross - commissionTotal,
          status: 'DRAFT',
        },
      });
      if (commissions.length > 0) {
        await tx.marketplaceCommission.updateMany({ where: { id: { in: commissions.map((c) => c.id) } }, data: { status: 'INVOICED' } });
      }
      await this.audit.record({ actorUserId: actor.userId, companyId: null, action: 'marketplace.settlement_created', targetType: 'PROVIDER_SETTLEMENT', targetId: settlement.id, summary: `Prepared settlement for ${provider.code}` });
      return settlement;
    });
  }

  async listSettlements(query: ListQueryDto, principal: RequestPrincipal) {
    const rows = await this.prisma.providerSettlement.findMany({
      where: { ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { provider: { select: { code: true, nameEn: true } } },
      take: 200,
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  // ----------------------------------------------------------------- helpers

  private async assertVehicle(companyId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, companyId } });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found in this company.');
    return vehicle;
  }
}

// ---------------------------------------------------------------- mappers

function toJobCardDto(j: {
  id: string;
  jobNumber: string;
  vehicleId: string;
  customerId: string;
  status: string;
  technicianUserId: string | null;
  odometer: number | null;
  complaint: string | null;
  diagnosis: string | null;
  invoiceId: string | null;
  vehicle?: { vin: string; make: string; model: string; plateNumber: string | null } | null;
  _count?: { labour: number; estimates: number; reservations: number };
  createdAt: Date;
}) {
  return {
    id: j.id,
    jobNumber: j.jobNumber,
    vehicleId: j.vehicleId,
    vin: j.vehicle?.vin ?? null,
    make: j.vehicle?.make ?? null,
    model: j.vehicle?.model ?? null,
    plateNumber: j.vehicle?.plateNumber ?? null,
    customerId: j.customerId,
    status: j.status,
    technicianUserId: j.technicianUserId,
    odometer: j.odometer,
    complaint: j.complaint,
    diagnosis: j.diagnosis,
    invoiceId: j.invoiceId,
    labourCount: j._count?.labour,
    estimateCount: j._count?.estimates,
    reservationCount: j._count?.reservations,
    createdAt: j.createdAt.toISOString(),
  };
}
