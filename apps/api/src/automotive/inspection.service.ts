import { Injectable } from '@nestjs/common';
import {
  CHASSIS_REGIONS,
  INSPECTION_SECTION_SPECS,
  INSPECTION_SECTION_KEYS,
  areasForTypes,
  chassisRegionSpec,
  inspectionResultsFor,
  inspectionSectionSpec,
  isInspectionEditable,
  isInspectionSectionKey,
  typesForAreas,
  type InspectionSectionKey,
  type InspectionTypeKey,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { MediaStorageService } from '../cms/media-storage.service';
import { badRequest, conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  BodyMarkerInputDto,
  ChassisRegionInputDto,
  CreateAttachmentDto,
  CreateDiagnosticEntryDto,
  CreateInspectionSessionDto,
  InspectionItemResultInputDto,
  InspectionListQueryDto,
  ReviewInspectionDto,
  SaveInspectionSectionDto,
  UpdateInspectionSessionDto,
} from './inspection.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** The statuses in which a submitted inspection may still be reviewed. */
const REVIEWABLE = ['PENDING_REVIEW'];

/**
 * The structured inspection engine.
 *
 * ## Why the sections are separate
 *
 * A customer who buys a paint inspection must not be asked about the engine.
 * `InspectionSession.selectedAreas` records what was bought, and every write is
 * checked against it: saving a section that was not selected is a 400, and a
 * submitted inspection is only validated against the *selected* sections. That
 * single rule is what keeps unrelated inspection types out of a job.
 *
 * ## Structured, not a document
 *
 * Every result is a row — an item result, a marker, a region, a diagnostic entry
 * — so the same data can render the interactive screen, the approved report and
 * a future analytics query. Nothing is stored only as a rendered PDF.
 *
 * ## Coordinates
 *
 * Marker positions are stored normalised (0–1) against the diagram box and
 * unmirrored. The Arabic layout flips `x` when drawing, so a marker placed on
 * the left of the car in the RTL view reopens on the same physical panel in the
 * English view. Storing screen pixels would break on a different tablet.
 */
@Injectable()
export class InspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
    private readonly storage: MediaStorageService,
  ) {}

  // ------------------------------------------------------------------ helpers

  /** A marker's URL is always built from the asset id, never a stored path. */
  private assetUrl(assetId: string | null): string | null {
    if (!assetId) return null;
    return `/api/v1/cms/media/${assetId}/file?variant=card`;
  }

  /** Load a session inside the caller's company, or fail with a 404. */
  private async requireSession(id: string, companyId: string) {
    const session = await this.prisma.inspectionSession.findFirst({ where: { id, companyId } });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    return session;
  }

  /** An approved inspection is frozen: the results may not be rewritten. */
  private assertEditable(status: string) {
    if (!isInspectionEditable(status as never)) {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        `An inspection in ${status} state cannot be edited. Return it for correction first.`,
      );
    }
  }

  private assertAreaSelected(selected: string[], area: string) {
    if (!selected.includes(area)) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `${area} was not selected for this inspection, so it has nothing to record.`,
      );
    }
  }

  /** Resolve a selected section row, creating the empty row on first access. */
  private async sectionRow(session: { id: string; companyId: string; selectedAreas: string[] }, area: InspectionSectionKey) {
    this.assertAreaSelected(session.selectedAreas, area);
    const existing = await this.prisma.inspectionSectionResult.findUnique({
      where: { sessionId_area: { sessionId: session.id, area } },
    });
    if (existing) return existing;
    return this.prisma.inspectionSectionResult.create({
      data: { companyId: session.companyId, sessionId: session.id, area },
    });
  }

  /**
   * Ensure every selected area has a section row. Called on create and whenever
   * the selection changes, so the screen can render a section that has not been
   * opened yet without a special case.
   */
  private async ensureSections(sessionId: string, companyId: string, areas: string[]) {
    for (const area of areas) {
      await this.prisma.inspectionSectionResult.upsert({
        where: { sessionId_area: { sessionId, area: area as never } },
        create: { companyId, sessionId, area: area as never },
        update: {},
      });
    }
  }

  // ------------------------------------------------------------------- create

  async list(query: InspectionListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.search
        ? {
            OR: [
              { jobNumber: { contains: query.search, mode: 'insensitive' as const } },
              { customerName: { contains: query.search, mode: 'insensitive' as const } },
              { vin: { contains: query.search, mode: 'insensitive' as const } },
              { plateNumber: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.inspectionSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inspectionSession.count({ where }),
    ]);
    return { items: rows.map(toSummaryDto), total, page, pageSize };
  }

  async get(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.prisma.inspectionSession.findFirst({
      where: { id, companyId },
      include: {
        sections: {
          include: {
            items: true,
            markers: { orderBy: { createdAt: 'asc' } },
            chassisRegions: true,
            diagnostics: { orderBy: { createdAt: 'asc' } },
          },
        },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    return toSessionDto(session, (assetId) => this.assetUrl(assetId));
  }

  /**
   * Create an inspection.
   *
   * The vehicle and customer are resolved inside the tenant first, so a vehicle
   * id from another company can never be attached. Vehicle and customer fields
   * are then copied onto the session as a snapshot: editing the vehicle later
   * must not rewrite what was inspected.
   */
  async create(dto: CreateInspectionSessionDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);

    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, companyId } });
    if (!vehicle) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Vehicle not found in this company.');
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId } });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found in this company.');

    // A vehicle belongs to a customer; the two must agree or the inspection would
    // name one owner and inspect another's car.
    if (vehicle.customerId !== customer.id) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'That vehicle is not registered to that customer.');
    }

    if (dto.bookingId) {
      const booking = await this.prisma.inspectionBooking.findFirst({
        where: { id: dto.bookingId, companyId },
        select: { id: true, vehicleId: true, customerId: true, branchId: true, session: { select: { id: true } } },
      });
      if (!booking) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection booking not found.');
      if (booking.session) {
        throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'That booking already has an inspection.');
      }
      if (booking.vehicleId !== dto.vehicleId || booking.customerId !== dto.customerId) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The booking names a different vehicle or customer.');
      }
    }

    const areas = resolveSelectedAreas(dto);
    if (areas.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Select at least one inspection type.');
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const jobNumber = await this.sequences.next(tx, companyId, 'inspectionSession');
      return tx.inspectionSession.create({
        data: {
          companyId,
          jobNumber,
          bookingId: dto.bookingId ?? null,
          customerId: customer.id,
          vehicleId: vehicle.id,
          branchId: dto.branchId ?? null,
          selectedAreas: areas as never,
          // Explicit values win; otherwise snapshot from the record.
          customerName: dto.customerName?.trim() || customer.nameEn || customer.nameAr || customer.code,
          contactNumber: dto.contactNumber ?? customer.phone ?? null,
          plateNumber: dto.plateNumber ?? vehicle.plateNumber ?? null,
          make: dto.make ?? vehicle.make,
          model: dto.model ?? vehicle.model,
          modelYear: dto.modelYear ?? vehicle.modelYear,
          odometer: dto.odometer ?? vehicle.mileage ?? null,
          color: dto.color ?? vehicle.color ?? null,
          vin: dto.vin ?? vehicle.vin,
          generalRemarks: dto.generalRemarks ?? null,
          interiorRemarks: dto.interiorRemarks ?? null,
          exteriorRemarks: dto.exteriorRemarks ?? null,
          engineRemarks: dto.engineRemarks ?? null,
          roadTestRemarks: dto.roadTestRemarks ?? null,
          finalAssessment: dto.finalAssessment ?? null,
          inspectorUserId: actor.userId,
          createdById: actor.userId,
          status: 'DRAFT',
        },
      });
    });

    await this.ensureSections(session.id, companyId, areas);

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.session_created',
      targetType: 'INSPECTION_SESSION',
      targetId: session.id,
      summary: `Created inspection ${session.jobNumber} (${areas.join(', ')})`,
      metadata: { selectedAreas: areas, vehicleId: vehicle.id },
    });

    return this.get(session.id, principal);
  }

  async update(id: string, dto: UpdateInspectionSessionDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);

    // Only recompute the areas when the caller actually changes the selection;
    // an edit that touches only the header must not drop the recorded sections.
    const areas =
      dto.selectedTypes || dto.selectedAreas ? resolveSelectedAreas(dto) : null;
    if (areas && areas.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Select at least one inspection type.');
    }

    const updated = await this.prisma.inspectionSession.update({
      where: { id },
      data: {
        ...(dto.customerName !== undefined ? { customerName: dto.customerName } : {}),
        ...(dto.contactNumber !== undefined ? { contactNumber: dto.contactNumber } : {}),
        ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
        ...(dto.make !== undefined ? { make: dto.make } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.modelYear !== undefined ? { modelYear: dto.modelYear } : {}),
        ...(dto.odometer !== undefined ? { odometer: dto.odometer } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.vin !== undefined ? { vin: dto.vin } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(areas ? { selectedAreas: areas as never } : {}),
        ...(dto.generalRemarks !== undefined ? { generalRemarks: dto.generalRemarks } : {}),
        ...(dto.interiorRemarks !== undefined ? { interiorRemarks: dto.interiorRemarks } : {}),
        ...(dto.exteriorRemarks !== undefined ? { exteriorRemarks: dto.exteriorRemarks } : {}),
        ...(dto.engineRemarks !== undefined ? { engineRemarks: dto.engineRemarks } : {}),
        ...(dto.roadTestRemarks !== undefined ? { roadTestRemarks: dto.roadTestRemarks } : {}),
        ...(dto.finalAssessment !== undefined ? { finalAssessment: dto.finalAssessment } : {}),
        // A first edit past DRAFT moves the job to IN_PROGRESS so the list shows
        // it as started rather than untouched.
        ...(session.status === 'DRAFT' ? { status: 'IN_PROGRESS' } : {}),
      },
    });

    if (areas) {
      await this.ensureSections(id, companyId, areas);
      // Removing an area drops its recorded results: keeping rows for a section
      // the customer did not buy would leak an unrelated inspection into the job.
      await this.prisma.inspectionSectionResult.deleteMany({
        where: { sessionId: id, area: { notIn: areas as never } },
      });
    }

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.session_updated',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Updated inspection ${updated.jobNumber}`,
    });

    return this.get(id, principal);
  }

  // ------------------------------------------------------------------ section

  /**
   * Save one section's item results and remarks.
   *
   * Item keys are validated against the catalogue for that area, so a key from a
   * different section is rejected rather than stored as an orphan row.
   */
  async saveSection(
    id: string,
    area: string,
    dto: SaveInspectionSectionDto,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);
    if (!isInspectionSectionKey(area)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown inspection section ${area}.`);
    }
    const section = await this.sectionRow(session, area);
    const spec = inspectionSectionSpec(area);
    const allowed = new Set(spec.items.map((i) => i.key));

    for (const item of dto.items ?? []) {
      if (!allowed.has(item.itemKey)) {
        throw badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          `Item ${item.itemKey} does not belong to section ${area}.`,
        );
      }
      const permitted = inspectionResultsFor(spec);
      if (!permitted.includes(item.result as never)) {
        throw badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          `Result ${item.result} is not valid for ${area}; expected ${permitted.join(', ')}.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inspectionSectionResult.update({
        where: { id: section.id },
        data: {
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          ...(dto.noFindings !== undefined ? { noFindings: dto.noFindings } : {}),
        },
      });
      for (const item of dto.items ?? []) {
        await tx.inspectionItemResult.upsert({
          where: { sessionId_itemKey: { sessionId: id, itemKey: item.itemKey } },
          create: {
            companyId,
            sessionId: id,
            sectionId: section.id,
            itemKey: item.itemKey,
            result: item.result as never,
            note: item.note ?? null,
          },
          update: { result: item.result as never, note: item.note ?? null },
        });
      }
    });

    await this.touchProgress(id, companyId);
    return this.get(id, principal);
  }

  /**
   * Replace the marker set for the paint diagram.
   *
   * Coordinates are clamped to 0–1 before storage so a marker can never be saved
   * outside the diagram, even if a client sends one. Ids that are not already in
   * this session's marker set are treated as new, which stops a crafted id from
   * rewriting another session's marker.
   */
  async saveBodyMarkers(
    id: string,
    markers: BodyMarkerInputDto[],
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);
    const section = await this.sectionRow(session, 'PAINT_BODY');

    const existing = await this.prisma.inspectionBodyMarker.findMany({
      where: { sessionId: id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((m) => m.id));

    await this.prisma.$transaction(async (tx) => {
      const kept: string[] = [];
      for (const marker of markers) {
        const data = {
          condition: marker.condition as never,
          x: clamp01(marker.x),
          y: clamp01(marker.y),
          panelKey: marker.panelKey ?? null,
          note: marker.note ?? null,
        };
        if (marker.id && existingIds.has(marker.id)) {
          await tx.inspectionBodyMarker.update({ where: { id: marker.id }, data });
          kept.push(marker.id);
        } else {
          const created = await tx.inspectionBodyMarker.create({
            data: { companyId, sessionId: id, sectionId: section.id, ...data },
          });
          kept.push(created.id);
        }
      }
      // Anything the client did not send was deleted on the diagram.
      await tx.inspectionBodyMarker.deleteMany({
        where: { sessionId: id, id: { notIn: kept.length ? kept : ['__none__'] } },
      });
    });

    await this.touchProgress(id, companyId);
    return this.get(id, principal);
  }

  /** Replace the chassis region assessments for the section. */
  async saveChassisRegions(
    id: string,
    regions: ChassisRegionInputDto[],
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);
    const section = await this.sectionRow(session, 'CHASSIS_UNDERCARRIAGE');

    const known = new Set(CHASSIS_REGIONS.map((r) => r.key));
    for (const region of regions) {
      if (!known.has(region.regionKey as never)) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown chassis region ${region.regionKey}.`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const region of regions) {
        await tx.inspectionChassisRegion.upsert({
          where: { sessionId_regionKey: { sessionId: id, regionKey: region.regionKey } },
          create: {
            companyId,
            sessionId: id,
            sectionId: section.id,
            regionKey: region.regionKey,
            condition: region.condition as never,
            note: region.note ?? null,
          },
          update: { condition: region.condition as never, note: region.note ?? null },
        });
      }
    });

    await this.touchProgress(id, companyId);
    return this.get(id, principal);
  }

  // -------------------------------------------------------------- diagnostics

  async addDiagnostic(
    id: string,
    dto: CreateDiagnosticEntryDto,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);
    const section = await this.sectionRow(session, 'COMPUTER_UNIT');

    const entry = await this.prisma.inspectionDiagnosticEntry.create({
      data: {
        companyId,
        sessionId: id,
        sectionId: section.id,
        module: dto.module,
        faultCode: dto.faultCode ?? null,
        description: dto.description,
        observation: dto.observation ?? null,
        severity: (dto.severity ?? 'INFO') as never,
      },
    });
    await this.touchProgress(id, companyId);
    return entry;
  }

  async removeDiagnostic(id: string, entryId: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);
    const entry = await this.prisma.inspectionDiagnosticEntry.findFirst({ where: { id: entryId, sessionId: id } });
    if (!entry) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Diagnostic entry not found.');
    await this.prisma.inspectionDiagnosticEntry.delete({ where: { id: entryId } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.diagnostic_removed',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Removed diagnostic entry from ${session.jobNumber}`,
    });
    return { removed: true };
  }

  // -------------------------------------------------------------- attachments

  async addAttachment(
    id: string,
    file: { buffer: Buffer; originalname: string },
    dto: CreateAttachmentDto,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);

    if (dto.sectionArea) this.assertAreaSelected(session.selectedAreas, dto.sectionArea);

    // MediaStorageService sniffs the real type, re-encodes to strip EXIF, and
    // derives the key from a UUID — a client never chooses a path.
    const stored = await this.storage.store(file.buffer);

    const attachment = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.cmsMediaAsset.create({
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
          caption: dto.caption ?? null,
        },
      });
      return tx.inspectionAttachment.create({
        data: {
          companyId,
          sessionId: id,
          mediaAssetId: asset.id,
          sectionArea: (dto.sectionArea ?? null) as never,
          itemKey: dto.itemKey ?? null,
          originalName: asset.originalName,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          width: asset.width,
          height: asset.height,
          caption: dto.caption ?? null,
          uploadedById: actor.userId,
        },
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.attachment_added',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Attachment added to ${session.jobNumber} (${attachment.byteSize} bytes)`,
      metadata: { sectionArea: dto.sectionArea ?? null, itemKey: dto.itemKey ?? null },
    });
    return { ...attachment, url: this.assetUrl(attachment.mediaAssetId) };
  }

  async removeAttachment(id: string, attachmentId: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    this.assertEditable(session.status);
    const attachment = await this.prisma.inspectionAttachment.findFirst({
      where: { id: attachmentId, sessionId: id },
    });
    if (!attachment) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Attachment not found.');
    await this.prisma.inspectionAttachment.delete({ where: { id: attachmentId } });
    // The media asset stays in the library: it may be referenced elsewhere, and
    // deleting it here could blank an unrelated page.
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.attachment_removed',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Attachment removed from ${session.jobNumber}`,
    });
    return { removed: true };
  }

  // -------------------------------------------------------------- progress

  /**
   * The completion state of the *selected* sections only.
   *
   * An unset item is outstanding, so a section is never reported complete while
   * an inspector has not looked at something. A diagram section counts its
   * markers or regions, or an explicit "nothing to report".
   */
  async progress(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.prisma.inspectionSession.findFirst({
      where: { id, companyId },
      include: {
        sections: {
          include: { items: true, markers: true, chassisRegions: true, diagnostics: true },
        },
      },
    });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    return buildProgress(session.selectedAreas as string[], session.sections);
  }

  // -------------------------------------------------------------- workflow

  /**
   * Submit for approval.
   *
   * The gate is the selected sections and nothing else. Every item in a selected
   * checklist section must have a decision, every selected diagram section must
   * carry a marker, a region assessment or an explicit "nothing to report", and
   * a diagnostic section must carry an entry or that acknowledgement. A section
   * the customer did not buy is never consulted.
   */
  async submit(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.prisma.inspectionSession.findFirst({
      where: { id, companyId },
      include: {
        sections: {
          include: { items: true, markers: true, chassisRegions: true, diagnostics: true },
        },
      },
    });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    if (session.status === 'PENDING_REVIEW') {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'This inspection is already awaiting review.');
    }
    if (session.status === 'APPROVED') {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'This inspection is already approved.');
    }

    const progress = buildProgress(session.selectedAreas as string[], session.sections);
    if (!progress.complete) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `The inspection is incomplete: ${progress.outstanding.length} item(s) still need a result.`,
        { outstanding: progress.outstanding },
      );
    }

    const updated = await this.prisma.inspectionSession.update({
      where: { id },
      data: { status: 'PENDING_REVIEW', submittedById: actor.userId, submittedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.submitted',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Submitted inspection ${updated.jobNumber} for review`,
    });
    return this.get(id, principal);
  }

  /** Approve or return a submitted inspection. */
  async review(id: string, dto: ReviewInspectionDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    if (!REVIEWABLE.includes(session.status)) {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        `Only an inspection awaiting review can be decided; this one is ${session.status}.`,
      );
    }

    const approve = dto.decision === 'APPROVE';
    const updated = await this.prisma.inspectionSession.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        reviewNotes: dto.notes ?? null,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: approve ? 'inspection.approved' : 'inspection.returned',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: approve
        ? `Approved inspection ${updated.jobNumber}`
        : `Returned inspection ${updated.jobNumber} for correction`,
      metadata: dto.notes ? { notes: dto.notes } : null,
    });
    return this.get(id, principal);
  }

  /**
   * Permanently delete an inspection and everything it owns.
   *
   * A draft created by mistake must be removable, but an approved report is a
   * signed document: deleting it would silently rewrite history and orphan the
   * issued PDF, so an approved one must be cancelled instead. The children
   * (sections, item results, markers, chassis regions, diagnostics and
   * attachments) cascade at the database level. As with `removeAttachment`, the
   * underlying media assets stay in the library — they may be referenced
   * elsewhere, and deleting them here could blank an unrelated page.
   */
  async delete(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.prisma.inspectionSession.findFirst({ where: { id, companyId } });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');
    if (session.status === 'APPROVED') {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        'An approved inspection cannot be deleted. Cancel or archive the report instead.',
      );
    }

    await this.prisma.inspectionSession.delete({ where: { id } });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.deleted',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Deleted inspection ${session.jobNumber}`,
      metadata: { jobNumber: session.jobNumber, status: session.status },
    });
    return { id, deleted: true };
  }

  /** Cancel an inspection that has not been approved. */
  async cancel(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.requireSession(id, companyId);
    if (session.status === 'APPROVED') {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'An approved inspection cannot be cancelled.');
    }
    const updated = await this.prisma.inspectionSession.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inspection.cancelled',
      targetType: 'INSPECTION_SESSION',
      targetId: id,
      summary: `Cancelled inspection ${updated.jobNumber}`,
    });
    return this.get(id, principal);
  }

  /**
   * Move a DRAFT to IN_PROGRESS when a section is saved, and stamp the section's
   * completion time once it has everything it needs.
   */
  private async touchProgress(sessionId: string, companyId: string) {
    const session = await this.prisma.inspectionSession.findFirst({
      where: { id: sessionId, companyId },
      include: {
        sections: {
          include: { items: true, markers: true, chassisRegions: true, diagnostics: true },
        },
      },
    });
    if (!session) return;
    const progress = buildProgress(session.selectedAreas as string[], session.sections);
    await this.prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { ...(session.status === 'DRAFT' ? { status: 'IN_PROGRESS' } : {}) },
    });
    for (const section of progress.sections) {
      await this.prisma.inspectionSectionResult.updateMany({
        where: { sessionId, area: section.area as never },
        data: { completedAt: section.complete ? new Date() : null },
      });
    }
  }
}

// --------------------------------------------------------------------- helpers

/** Clamp a normalised coordinate into the diagram. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Keep the catalogue order and drop duplicates, so a repeated area is one job. */
function dedupeAreas(areas: string[]): InspectionSectionKey[] {
  return INSPECTION_SECTION_KEYS.filter((key) => areas.includes(key));
}

/**
 * Resolve the stored areas from a request that names either the four selectable
 * inspection types or the underlying areas.
 *
 * `selectedTypes` is the operator-facing vocabulary and is preferred; it expands
 * to the areas each type records. `selectedAreas` is kept for the existing API
 * clients and internal callers. An empty result is rejected by the caller, so a
 * job can never be created with nothing to inspect.
 */
function resolveSelectedAreas(dto: {
  selectedTypes?: string[];
  selectedAreas?: string[];
}): InspectionSectionKey[] {
  if (dto.selectedTypes && dto.selectedTypes.length > 0) {
    return areasForTypes(dto.selectedTypes as InspectionTypeKey[]);
  }
  return dedupeAreas(dto.selectedAreas ?? []);
}

interface SectionShape {
  id?: string;
  area: string;
  remarks: string | null;
  noFindings: boolean;
  completedAt: Date | null;
  items: Array<{ itemKey: string; result: string; note: string | null }>;
  markers: Array<{ id: string; condition: string; x: number; y: number; panelKey: string | null; note: string | null }>;
  chassisRegions: Array<{ id: string; regionKey: string; condition: string; note: string | null }>;
  diagnostics: Array<{
    id: string;
    module: string;
    faultCode: string | null;
    description: string;
    observation: string | null;
    severity: string;
  }>;
}

/**
 * Build the progress report for the selected areas.
 *
 * Only the selected areas are visited. A checklist section is complete when every
 * one of its catalogue items has a result other than UNSET; a diagram or
 * diagnostic section is complete when it has at least one recorded row or the
 * inspector explicitly said there is nothing to report.
 */
export function buildProgress(selectedAreas: string[], sections: SectionShape[]) {
  const result: {
    sections: Array<{
      area: string;
      labelEn: string;
      labelAr: string;
      totalItems: number;
      completedItems: number;
      recorded: number;
      complete: boolean;
    }>;
    complete: boolean;
    outstanding: string[];
  } = { sections: [], complete: true, outstanding: [] };

  for (const area of dedupeAreas(selectedAreas)) {
    const spec = inspectionSectionSpec(area);
    const section = sections.find((s) => s.area === area);
    const byKey = new Map((section?.items ?? []).map((i) => [i.itemKey, i]));
    let completedItems = 0;
    for (const item of spec.items) {
      const row = byKey.get(item.key);
      if (row && row.result !== 'UNSET') completedItems += 1;
      else result.outstanding.push(`${area}:${item.key}`);
    }
    const recorded =
      spec.kind === 'DIAGRAM_PAINT'
        ? section?.markers.length ?? 0
        : spec.kind === 'DIAGRAM_CHASSIS'
          ? (section?.chassisRegions.filter((r) => r.condition !== 'UNSET').length ?? 0)
          : spec.kind === 'DIAGNOSTIC'
            ? section?.diagnostics.length ?? 0
            : 0;

    const itemsComplete = spec.items.length === 0 || completedItems === spec.items.length;
    const payloadComplete = spec.kind === 'ITEMS' ? true : recorded > 0 || Boolean(section?.noFindings);
    const complete = itemsComplete && payloadComplete;
    if (!complete) {
      result.complete = false;
      if (spec.kind !== 'ITEMS' && !payloadComplete) result.outstanding.push(`${area}:<none recorded>`);
    }

    result.sections.push({
      area,
      labelEn: spec.labelEn,
      labelAr: spec.labelAr,
      totalItems: spec.items.length,
      completedItems,
      recorded,
      complete,
    });
  }
  return result;
}

function toSummaryDto(s: {
  id: string;
  jobNumber: string;
  status: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  make: string;
  model: string;
  modelYear: number;
  plateNumber: string | null;
  vin: string;
  selectedAreas: string[];
  inspectorUserId: string | null;
  inspectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    jobNumber: s.jobNumber,
    status: s.status,
    customerId: s.customerId,
    customerName: s.customerName,
    vehicleId: s.vehicleId,
    make: s.make,
    model: s.model,
    modelYear: s.modelYear,
    plateNumber: s.plateNumber,
    vin: s.vin,
    selectedAreas: s.selectedAreas,
    // The four operator-facing types the stored areas map back to, so the screen
    // and the printed plan speak the report's own vocabulary.
    selectedTypes: typesForAreas(s.selectedAreas as InspectionSectionKey[]),
    inspectorUserId: s.inspectorUserId,
    inspectedAt: s.inspectedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function toSessionDto(
  s: Parameters<typeof toSummaryDto>[0] & {
    contactNumber: string | null;
    color: string | null;
    branchId: string | null;
    bookingId: string | null;
    odometer: number | null;
    generalRemarks: string | null;
    interiorRemarks: string | null;
    exteriorRemarks: string | null;
    engineRemarks: string | null;
    roadTestRemarks: string | null;
    finalAssessment: string | null;
    submittedById: string | null;
    submittedAt: Date | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
    reviewNotes: string | null;
    createdById: string;
    sections: SectionShape[];
    attachments: Array<{
      id: string;
      mediaAssetId: string | null;
      sectionArea: string | null;
      itemKey: string | null;
      originalName: string;
      mimeType: string;
      byteSize: number;
      width: number | null;
      height: number | null;
      caption: string | null;
      createdAt: Date;
    }>;
  },
  assetUrl: (id: string | null) => string | null,
) {
  return {
    ...toSummaryDto(s),
    identity: {
      jobNumber: s.jobNumber,
      inspectedAt: s.inspectedAt.toISOString(),
      make: s.make,
      model: s.model,
      modelYear: s.modelYear,
      plateNumber: s.plateNumber,
      vin: s.vin,
      odometer: s.odometer,
    },
    contactNumber: s.contactNumber,
    color: s.color,
    branchId: s.branchId,
    bookingId: s.bookingId,
    odometer: s.odometer,
    generalRemarks: s.generalRemarks,
    interiorRemarks: s.interiorRemarks,
    exteriorRemarks: s.exteriorRemarks,
    engineRemarks: s.engineRemarks,
    roadTestRemarks: s.roadTestRemarks,
    finalAssessment: s.finalAssessment,
    submittedById: s.submittedById,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    reviewedById: s.reviewedById,
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    reviewNotes: s.reviewNotes,
    createdById: s.createdById,
    sections: s.sections
      .slice()
      .sort((a, b) => INSPECTION_SECTION_KEYS.indexOf(a.area as never) - INSPECTION_SECTION_KEYS.indexOf(b.area as never))
      .map((section) => ({
        id: section.id ?? '',
        area: section.area,
        remarks: section.remarks,
        noFindings: section.noFindings,
        completedAt: section.completedAt?.toISOString() ?? null,
        items: section.items.map((i) => ({ itemKey: i.itemKey, result: i.result, note: i.note })),
        markers: section.markers.map((m) => ({
          id: m.id,
          condition: m.condition,
          x: m.x,
          y: m.y,
          panelKey: m.panelKey,
          note: m.note,
        })),
        chassisRegions: section.chassisRegions.map((r) => ({
          id: r.id,
          regionKey: r.regionKey,
          condition: r.condition,
          note: r.note,
        })),
        diagnostics: section.diagnostics.map((d) => ({
          id: d.id,
          module: d.module,
          faultCode: d.faultCode,
          description: d.description,
          observation: d.observation,
          severity: d.severity,
        })),
      })),
    attachments: s.attachments.map((a) => ({
      id: a.id,
      url: assetUrl(a.mediaAssetId),
      sectionArea: a.sectionArea,
      itemKey: a.itemKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      width: a.width,
      height: a.height,
      caption: a.caption,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/** The chassis region list for a session, always all eight in report order. */
export function chassisRegionDefaults() {
  return CHASSIS_REGIONS.map((r) => ({ ...r, spec: chassisRegionSpec(r.key) }));
}
