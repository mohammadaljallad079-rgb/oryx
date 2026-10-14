import { Injectable } from '@nestjs/common';
import { lineAmountMinor, sumMinor } from '@oryx/shared';
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

  // ------------------------------------------------------------------ bays

  async listBays(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.workshopBay.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createBay(dto: CreateWorkshopBayDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.workshopBay.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Bay ${dto.code} already exists.`);
    const bay = await this.prisma.workshopBay.create({ data: { companyId, branchId: dto.branchId ?? null, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr } });
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
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}), ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.jobCard.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, _count: { select: { labour: true, estimates: true, reservations: true } } },
      }),
      this.prisma.jobCard.count({ where }),
    ]);
    return { items: rows.map(toJobCardDto), total, page, pageSize };
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
          odometer: dto.odometer ?? null,
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
      // Completion requires an approved estimate, so work is not billed unapproved.
      if (dto.status === 'COMPLETED') {
        const approved = await this.prisma.repairEstimate.count({ where: { jobCardId: id, status: 'APPROVED' } });
        if (approved === 0) throw forbidden(ERROR_CODES.ESTIMATE_NOT_APPROVED, 'The customer must approve an estimate before the job is completed.');
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
            data: { companyId, jobCardId: id, description: op.description, hours: op.hours, rateMinor: op.rateMinor, amountMinor: lineAmountMinor(op.hours, op.rateMinor), sortOrder: count + i },
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
          status: 'SENT',
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
      const job = await tx.jobCard.findFirst({
        where: { id, companyId },
        include: { labour: true, estimates: { include: { lines: true }, where: { status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 1 }, reservations: { include: { lines: true } } },
      });
      if (!job) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Job card not found.');
      if (job.status === 'INVOICED') throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'This job card is already invoiced.');
      if (job.status !== 'COMPLETED') throw badRequest(ERROR_CODES.JOB_CARD_STATE, 'Only a completed job card can be invoiced.');

      // Prefer the approved estimate; fall back to the recorded labour.
      const lines: Array<{ productId: string | null; description: string; quantity: number; unitPriceMinor: number; taxPercentBp: number }> = [];
      const estimate = job.estimates[0];
      if (estimate) {
        for (const l of estimate.lines) {
          lines.push({ productId: l.productId, description: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, taxPercentBp: l.taxPercentBp });
        }
      } else {
        for (const op of job.labour) {
          lines.push({ productId: null, description: op.description, quantity: op.hours, unitPriceMinor: op.rateMinor, taxPercentBp: 0 });
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
      return invoice;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.job_card_invoiced', targetType: 'JOB_CARD', targetId: id, summary: `Invoiced job card ${result.invoiceNumber}` });
    return result;
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

  async listPartReferences(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.partReference.findMany({ where: { companyId }, orderBy: { partNumber: 'asc' }, include: { product: { select: { sku: true, nameEn: true } } } });
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
    const dup = await this.prisma.marketplaceProvider.findUnique({ where: { code: dto.code } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Provider ${dto.code} already exists.`);
    const provider = await this.prisma.marketplaceProvider.create({
      data: {
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
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
    const provider = await this.prisma.marketplaceProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Provider not found.');
    const listing = await this.prisma.providerServiceListing.create({
      data: { providerId, categoryKey: dto.categoryKey, nameEn: dto.nameEn, nameAr: dto.nameAr, description: dto.description ?? null, priceMinor: dto.priceMinor ?? 0 },
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
    invoiceId: j.invoiceId,
    labourCount: j._count?.labour,
    estimateCount: j._count?.estimates,
    reservationCount: j._count?.reservations,
    createdAt: j.createdAt.toISOString(),
  };
}
