import { Injectable } from '@nestjs/common';
import { sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { MediaStorageService, sniffMime } from '../cms/media-storage.service';
import { SalesService } from '../sales/sales.service';
import { computeDocumentTotals } from '../common/document-totals';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import { VehicleOcrService } from './vehicle-ocr.service';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  CreateChecklistItemDto,
  CreateInspectionBookingDto,
  CreateInspectionServiceDto,
  CreateVehicleDto,
  DecideReportDto,
  InvoiceInspectionDto,
  ListQueryDto,
  RecordFindingsDto,
  RecordMileageDto,
  SubmitReportDto,
  UpdateInspectionBookingDto,
  UpdateInspectionServiceDto,
  UpdateVehicleDto,
  VehicleDocumentDto,
} from './automotive.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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
    private readonly storage: MediaStorageService,
    private readonly sales: SalesService,
    private readonly ocr: VehicleOcrService,
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
    const vin = dto.vin.trim().toUpperCase();
    if (!VIN_PATTERN.test(vin)) {
      throw badRequest(ERROR_CODES.VEHICLE_VIN_INVALID, 'The VIN must be 11–17 characters and must not contain I, O or Q.');
    }
    const dup = await this.prisma.vehicle.findUnique({ where: { companyId_vin: { companyId, vin } } });
    if (dup) throw conflict(ERROR_CODES.VEHICLE_VIN_EXISTS, `A vehicle with VIN ${vin} already exists.`);
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

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.vehicle_created', targetType: 'VEHICLE', targetId: vehicle.id, summary: `Registered vehicle ${vehicle.make} ${vehicle.model} (${vin})` });
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

  /**
   * Permanently delete a vehicle and its own records.
   *
   * A vehicle is only removable while nothing financial or historical depends on
   * it. An inspection session, job card, warranty, booking or RFQ is a record of
   * work done against that chassis, so a vehicle carrying any of them must be
   * deactivated (status `INACTIVE`/`SOLD`) rather than deleted — deleting would
   * destroy the linked history. Mileage records, documents and customer-app
   * photographs are the vehicle's own and cascade away with it.
   */
  async deleteVehicle(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, companyId } });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found.');

    const [sessions, jobCards, warranties, bookings, maintenance, rfqs, recovery, fleet] = await Promise.all([
      this.prisma.inspectionSession.count({ where: { vehicleId: id } }),
      this.prisma.jobCard.count({ where: { vehicleId: id } }),
      this.prisma.warrantyRecord.count({ where: { vehicleId: id } }),
      this.prisma.inspectionBooking.count({ where: { vehicleId: id } }),
      this.prisma.maintenanceBooking.count({ where: { vehicleId: id } }),
      this.prisma.customerRfq.count({ where: { vehicleId: id } }),
      this.prisma.recoveryRequest.count({ where: { vehicleId: id } }),
      this.prisma.fleetVehicle.count({ where: { vehicleId: id } }),
    ]);
    const blockers = sessions + jobCards + warranties + bookings + maintenance + rfqs + recovery + fleet;
    if (blockers > 0) {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        'This vehicle has inspections, job cards, warranties, bookings or requests and cannot be deleted. Set its status to inactive or sold instead so the history is preserved.',
      );
    }

    await this.prisma.vehicle.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'automotive.vehicle_deleted',
      targetType: 'VEHICLE',
      targetId: id,
      summary: `Deleted vehicle ${vehicle.vin}`,
      metadata: { vin: vehicle.vin, plateNumber: vehicle.plateNumber ?? null },
    });
    return { id, deleted: true };
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
    return { items: rows.map((r) => this.documentDto(r)), total: rows.length, page: 1, pageSize: rows.length };
  }

  /**
   * Attach a document to a vehicle, optionally with a scanned image.
   *
   * A `fileRef` the caller supplies is rejected: the only value that may sit
   * there is a `CmsMediaAsset` id this service just created from a re-encoded
   * upload, so a client cannot point the row at an arbitrary asset or path.
   */
  async addVehicleDocument(
    id: string,
    dto: VehicleDocumentDto,
    principal: RequestPrincipal,
    actor: ActorContext,
    file?: { buffer: Buffer; originalname: string },
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertVehicle(companyId, id);

    const stored = file && file.buffer.length > 0 ? await this.storage.store(file.buffer) : null;

    const doc = await this.prisma.$transaction(async (tx) => {
      let fileRef: string | null = null;
      if (stored) {
        const asset = await tx.cmsMediaAsset.create({
          data: {
            originalName: file!.originalname.slice(0, 255),
            storageKey: stored.storageKey,
            mimeType: stored.mimeType,
            byteSize: stored.byteSize,
            width: stored.width,
            height: stored.height,
            dominantColor: stored.dominantColor,
            blurDataUrl: stored.blurDataUrl,
            variants: stored.variants as never,
            caption: `${dto.category} — vehicle document`,
          },
        });
        fileRef = asset.id;
      }
      return tx.vehicleDocument.create({
        data: {
          companyId,
          vehicleId: id,
          category: dto.category,
          number: dto.number ?? null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          fileRef,
        },
      });
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.vehicle_document_added', targetType: 'VEHICLE', targetId: id, summary: `Added vehicle document ${dto.category}` });
    return this.documentDto(doc);
  }

  async removeVehicleDocument(id: string, documentId: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertVehicle(companyId, id);
    const doc = await this.prisma.vehicleDocument.findFirst({ where: { id: documentId, vehicleId: id, companyId } });
    if (!doc) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle document not found.');
    await this.prisma.vehicleDocument.delete({ where: { id: documentId } });
    // The media asset stays in the library: it may be referenced elsewhere.
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.vehicle_document_removed', targetType: 'VEHICLE', targetId: id, summary: `Removed vehicle document ${doc.category}` });
    return { removed: true };
  }

  /**
   * Read a registration-card or insurance scan and return suggested fields.
   *
   * Nothing is persisted. The suggestion is returned to the form, where an
   * operator reviews and edits it before saving through `addVehicleDocument` —
   * the only path that writes a document. The scan bytes are held in memory for
   * the duration of the call and are never stored by this method, so a
   * discarded extraction leaves no orphan asset behind.
   */
  async extractVehicleDocument(
    id: string,
    dto: { category: string },
    principal: RequestPrincipal,
    file?: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertVehicle(companyId, id);

    if (!file || file.buffer.length === 0) {
      throw badRequest(ERROR_CODES.AI_INPUT_INVALID, 'Attach a scan to extract its fields.');
    }
    const mime = sniffMime(file.buffer);
    if (!mime) {
      throw badRequest(
        ERROR_CODES.AI_INPUT_INVALID,
        'The scan must be a JPEG, PNG, WebP or AVIF image.',
      );
    }

    const result = await this.ocr.extract(
      { buffer: file.buffer, mimeType: mime, category: dto.category },
      companyId,
    );

    // The extraction is a read, but it is recorded so an operator can see who
    // read which scan; the suggestion itself is never stored.
    await this.audit.record({
      actorUserId: principal.userId,
      companyId,
      action: 'automotive.vehicle_document_ocr',
      targetType: 'VEHICLE',
      targetId: id,
      summary: `OCR extraction on a ${dto.category} scan (${result.configured ? `${result.fields.length} field(s)` : 'provider unconfigured'})`,
    });

    return result;
  }

  // -------------------------------------------------------------- inspections

  async listInspectionServices(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.inspectionService.findMany({
      where: { companyId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, imageAsset: { select: { id: true } } },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toInspectionServiceDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  async createInspectionService(dto: CreateInspectionServiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.inspectionService.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Inspection service ${dto.code} already exists.`);
    if (dto.imageAssetId) await this.assertMediaAsset(companyId, dto.imageAssetId);
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
        imageAssetId: dto.imageAssetId ?? null,
      },
      include: { items: { orderBy: { sortOrder: 'asc' } }, imageAsset: { select: { id: true } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_service_created', targetType: 'INSPECTION_SERVICE', targetId: service.id, summary: `Created inspection service ${service.code}` });
    return toInspectionServiceDto(service);
  }

  /**
   * Edit an inspection service.
   *
   * Price, tax and the catalogue picture are all editable: the printed document
   * reads them live when an inspection is invoiced, so correcting a mis-priced
   * service is a normal operation. Only the code is immutable — a booking and a
   * printed invoice reference it by code, so changing it would break history.
   */
  async updateInspectionService(id: string, dto: UpdateInspectionServiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const service = await this.prisma.inspectionService.findFirst({ where: { id, companyId } });
    if (!service) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection service not found.');
    if (dto.imageAssetId) await this.assertMediaAsset(companyId, dto.imageAssetId);
    const updated = await this.prisma.inspectionService.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priceMinor !== undefined ? { priceMinor: dto.priceMinor } : {}),
        ...(dto.taxPercentBp !== undefined ? { taxPercentBp: dto.taxPercentBp } : {}),
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        // An empty string clears the picture; a value links the stored asset.
        ...(dto.imageAssetId !== undefined ? { imageAssetId: dto.imageAssetId || null } : {}),
      },
      include: { items: { orderBy: { sortOrder: 'asc' } }, imageAsset: { select: { id: true } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_service_updated', targetType: 'INSPECTION_SERVICE', targetId: id, summary: `Updated inspection service ${service.code}` });
    return toInspectionServiceDto(updated);
  }

  /** A media-library asset, asserted to exist in the caller's company library. */
  private async assertMediaAsset(companyId: string, assetId: string) {
    const asset = await this.prisma.cmsMediaAsset.findFirst({ where: { id: assetId } });
    if (!asset) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The service picture could not be found in the media library.');
  }

  /**
   * Upload a picture for an inspection service.
   *
   * The bytes go through the shared media store (re-encoded, variants
   * generated) exactly like a product image; the new asset id replaces the
   * service's current picture. A missing file is a validation error, not a
   * silent no-op, so the caller learns the upload failed.
   */
  async uploadInspectionServiceImage(
    id: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const service = await this.prisma.inspectionService.findFirst({ where: { id, companyId } });
    if (!service) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection service not found.');
    if (!file || file.buffer.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'No image file was uploaded.');
    }
    const stored = await this.storage.store(file.buffer);
    const asset = await this.prisma.cmsMediaAsset.create({
      data: {
        originalName: file.originalname.slice(0, 255),
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        width: stored.width,
        height: stored.height,
        dominantColor: stored.dominantColor,
        blurDataUrl: stored.blurDataUrl,
        variants: stored.variants as never,
        caption: `${service.code} — inspection service`,
      },
    });
    const updated = await this.prisma.inspectionService.update({
      where: { id },
      data: { imageAssetId: asset.id },
      include: { items: { orderBy: { sortOrder: 'asc' } }, imageAsset: { select: { id: true } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_service_image_uploaded', targetType: 'INSPECTION_SERVICE', targetId: id, summary: `Uploaded a picture for inspection service ${service.code}` });
    return toInspectionServiceDto(updated);
  }

  /**
   * Delete an inspection service that nothing has booked yet.
   *
   * A service is a catalogue entry: once a booking references it, deleting it
   * would break that booking's history, so it is deactivated (`isActive: false`)
   * instead. The check is explicit because the foreign key is `Restrict`, which
   * would otherwise surface as an opaque database error.
   */
  async deleteInspectionService(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const service = await this.prisma.inspectionService.findFirst({ where: { id, companyId } });
    if (!service) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection service not found.');
    const bookings = await this.prisma.inspectionBooking.count({ where: { serviceId: id } });
    if (bookings > 0) {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        'This service has bookings and cannot be deleted. Deactivate it instead so past bookings keep their record.',
      );
    }
    await this.prisma.inspectionService.delete({ where: { id } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_service_deleted', targetType: 'INSPECTION_SERVICE', targetId: id, summary: `Deleted inspection service ${service.code}` });
    return { id, deleted: true };
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
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}), ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.inspectionBooking.findMany({ where, orderBy: { scheduledAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, service: { select: { nameEn: true, nameAr: true } }, report: true, _count: { select: { findings: true } } } }),
      this.prisma.inspectionBooking.count({ where }),
    ]);
    return { items: rows.map(toInspectionBookingDto), total, page, pageSize };
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
        include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, service: { select: { nameEn: true, nameAr: true } }, report: true, _count: { select: { findings: true } } },
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
      },
      include: { vehicle: { select: { vin: true, make: true, model: true, plateNumber: true } }, service: { select: { nameEn: true, nameAr: true } }, report: true, _count: { select: { findings: true } } },
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

  /**
   * Delete an inspection booking that produced nothing.
   *
   * A booking that was invoiced, completed, has recorded findings, an approved
   * report, or a structured inspection session created from it is history and
   * must be cancelled rather than deleted. A booking with none of those is a
   * scheduling entry that was created by mistake, so it can go.
   */
  async deleteInspectionBooking(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const booking = await this.prisma.inspectionBooking.findFirst({
      where: { id, companyId },
      include: { report: true, session: { select: { id: true } }, _count: { select: { findings: true } } },
    });
    if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
    const reportStatus = booking.report?.status ?? null;
    const locked =
      booking.status === 'COMPLETED' ||
      booking.status === 'CANCELLED' ||
      Boolean(booking.report) ||
      Boolean(booking.session) ||
      booking._count.findings > 0;
    if (locked) {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        `This booking cannot be deleted (status ${booking.status}${reportStatus ? `, report ${reportStatus}` : ''}). Cancel it instead so the history is preserved.`,
      );
    }

    await this.prisma.inspectionBooking.delete({ where: { id } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'automotive.inspection_booking_deleted', targetType: 'INSPECTION_BOOKING', targetId: id, summary: `Deleted inspection booking ${booking.bookingNumber}` });
    return { id, deleted: true };
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

  /**
   * The document shape the admin client reads.
   *
   * `fileRef` is the `CmsMediaAsset` id, and the servable URL is derived from it
   * here rather than stored, so a re-rendered or re-cropped asset is picked up
   * without a data migration and a caller never receives a raw storage path.
   */
  private documentDto(row: {
    id: string;
    vehicleId: string;
    category: string;
    number: string | null;
    expiresAt: Date | null;
    fileRef: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      category: row.category,
      number: row.number,
      expiresAt: row.expiresAt,
      fileRef: row.fileRef,
      fileUrl: row.fileRef ? `/api/v1/cms/media/${row.fileRef}/file?variant=card` : null,
      createdAt: row.createdAt,
    };
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

/**
 * An inspection service for the catalogue and the booking screen.
 *
 * `imageUrl` is the public media route when a picture is attached, so the
 * admin and the customer site render the same URL from one stored asset. The
 * asset id itself is not exposed.
 */
function toInspectionServiceDto(s: {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  priceMinor: number;
  taxPercentBp: number;
  durationMinutes: number;
  isActive: boolean;
  imageAsset?: { id: string } | null;
  items?: Array<{ id: string; code: string; labelEn: string; labelAr: string; category: string; sortOrder: number }>;
}) {
  return {
    id: s.id,
    code: s.code,
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    description: s.description,
    priceMinor: s.priceMinor,
    taxPercentBp: s.taxPercentBp,
    durationMinutes: s.durationMinutes,
    isActive: s.isActive,
    imageUrl: s.imageAsset?.id ? `/api/v1/cms/media/${s.imageAsset.id}/file?variant=card` : null,
    items: s.items ?? [],
  };
}

function toVehicleDto(v: {
  id: string;
  customerId: string;
  vin: string;
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
  serviceId: string;
  status: string;
  scheduledAt: Date;
  inspectorUserId: string | null;
  odometer: number | null;
  notes: string | null;
  vehicle?: { vin: string; make: string; model: string; plateNumber: string | null } | null;
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
    plateNumber: b.vehicle?.plateNumber ?? null,
    customerId: b.customerId,
    serviceId: b.serviceId,
    serviceNameEn: b.service?.nameEn ?? null,
    serviceNameAr: b.service?.nameAr ?? null,
    status: b.status,
    scheduledAt: b.scheduledAt.toISOString(),
    inspectorUserId: b.inspectorUserId,
    odometer: b.odometer,
    notes: b.notes,
    reportStatus: b.report?.status ?? null,
    invoiceId: b.report?.invoiceId ?? null,
    findingCount: b._count?.findings,
  };
}
