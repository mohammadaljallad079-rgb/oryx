import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { basisPointsOfMinor, lineAmountMinor } from '@oryx/shared';
import {
  CHASSIS_REGIONS,
  INSPECTION_SECTION_SPECS,
  isDocumentDownloadable,
  officialDocumentSpec,
  verificationStatusFor,
  type DocumentVerificationView,
  type ChassisRegionKey,
  type InspectionSectionKey,
  type OfficialDocumentType,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService, type RequestLike } from '../common/erp-context.service';
import { conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { DocumentStorageService } from './document-storage.service';
import { PdfRendererService } from './pdf/pdf-renderer.service';
import { QrService } from './pdf/qr.service';
import { renderInspectionReportHtml } from './templates/report-html';
import { renderFinancialDocumentHtml } from './templates/financial-document.template';
import type {
  DocumentIssuer,
  DocumentPayload,
  DocumentVerification,
  FinancialDocumentPayload,
  InspectionReportAttachment,
  InspectionReportPayload,
  InspectionReportSection,
} from './document-payload';

/**
 * The official-document service.
 *
 * A document is issued once and its rendered bytes are frozen. The flow is:
 *
 *   1. resolve the tenant and the source record, tenant-scoped;
 *   2. build an immutable payload snapshot from the record;
 *   3. render the payload to PDF through Chromium;
 *   4. store the bytes and insert the document row with its verification token.
 *
 * Re-issuing bumps the version and marks the previous version `SUPERSEDED`
 * rather than overwriting it, so a document already in a customer's hands stays
 * explainable: a scan of the old copy reports "superseded", not "not found".
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: ErpContextService,
    private readonly storage: DocumentStorageService,
    private readonly renderer: PdfRendererService,
    private readonly qr: QrService,
  ) {}

  // ------------------------------------------------------------------ issuing

  /**
   * Issues a vehicle inspection report for a session.
   *
   * Only a completed inspection is reportable: a draft has unfilled items, and
   * printing it would produce an official-looking document whose blanks read as
   * "nothing found". The status gate is here rather than in the controller so
   * every entry point shares it.
   */
  async issueInspectionReport(
    sessionId: string,
    principal: RequestPrincipal,
    actor: ActorContext,
    req?: RequestLike,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const session = await this.prisma.inspectionSession.findFirst({
      where: { id: sessionId, companyId },
      include: {
        sections: {
          include: {
            items: true,
            markers: { orderBy: { createdAt: 'asc' } },
            chassisRegions: true,
            diagnostics: { orderBy: { createdAt: 'asc' } },
          },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Inspection not found.');

    if (session.status !== 'APPROVED') {
      throw conflict(
        ERROR_CODES.DOCUMENT_IMMUTABLE,
        `Only an approved inspection can be issued as a report (current status: ${session.status}).`,
      );
    }

    const issuer = await this.issuerFor(companyId);
    const payload = await this.buildInspectionPayload(companyId, session);

    return this.issue({
      companyId,
      type: 'VEHICLE_INSPECTION_REPORT',
      documentNumber: session.jobNumber,
      sourceType: 'InspectionSession',
      sourceId: session.id,
      payload,
      issuer,
      actor,
      req,
      render: (verification) =>
        renderInspectionReportHtml({
          issuer,
          payload,
          documentNumber: session.jobNumber,
          issuedAt: new Date(),
          version: 1,
          verification,
          baseCss: '',
        }),
    });
  }

  /**
   * Issues a financial document (invoice, quotation, order, receipt, voucher)
   * for a sales or purchasing record.
   *
   * The source record is looked up by type inside the tenant. A caller cannot
   * pass an arbitrary payload — the amounts always come from the stored record,
   * so a printed total can never disagree with the ledger.
   */
  async issueFinancialDocument(
    type: OfficialDocumentType,
    sourceId: string,
    principal: RequestPrincipal,
    actor: ActorContext,
    req?: RequestLike,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const source = await this.loadFinancialSource(companyId, type, sourceId);
    if (!source) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document source not found.');

    const issuer = await this.issuerFor(companyId);
    const payload = source.payload;

    return this.issue({
      companyId,
      type,
      documentNumber: source.documentNumber,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      payload,
      issuer,
      actor,
      req,
      render: (verification) =>
        renderFinancialDocumentHtml({
          issuer,
          payload,
          documentNumber: source.documentNumber,
          issuedAt: new Date(),
          verification,
          baseCss: '',
        }),
    });
  }

  /**
   * The shared issue path: snapshot, render, store, record.
   *
   * A re-issue supersedes the prior version in the same transaction that creates
   * the new one, so the series can never briefly show two current versions.
   */
  private async issue(args: {
    companyId: string;
    type: OfficialDocumentType;
    documentNumber: string;
    sourceType: string;
    sourceId: string;
    payload: DocumentPayload;
    issuer: DocumentIssuer;
    actor: ActorContext;
    req?: RequestLike;
    render: (verification: DocumentVerification) => string;
  }) {
    const spec = officialDocumentSpec(args.type);

    const prior = await this.prisma.officialDocument.findFirst({
      where: {
        companyId: args.companyId,
        type: args.type,
        documentNumber: args.documentNumber,
      },
      orderBy: { version: 'desc' },
    });
    const version = (prior?.version ?? 0) + 1;
    const seriesId = prior?.seriesId ?? undefined;

    const token = this.qr.newToken();
    const url = this.qr.verificationUrl(token);
    const qrDataUri = await this.qr.dataUri(url);
    const verification: DocumentVerification = { token, url, qrDataUri };

    const baseCss = await this.renderer.baseStyles();
    const bodyHtml = args.render(verification);
    // The financial template receives an empty `baseCss` and needs the shared
    // faces injected; the report template already embeds them itself.
    const html = bodyHtml.includes('@font-face')
      ? bodyHtml
      : bodyHtml.replace('<style>', `<style>${baseCss}\n`);

    const { pdf, pageCount } = await this.renderer.render(html);

    const documentId = newDocumentId();
    const storageKey = this.storage.keyFor(args.companyId, documentId, version);
    await this.storage.write(storageKey, pdf);

    const created = await this.prisma.$transaction(async (tx) => {
      if (prior && prior.status === 'ISSUED') {
        await tx.officialDocument.update({
          where: { id: prior.id },
          data: { status: 'SUPERSEDED', supersededAt: new Date() },
        });
        await tx.officialDocumentEvent.create({
          data: {
            companyId: args.companyId,
            documentId: prior.id,
            event: 'SUPERSEDED',
            detail: `Superseded by version ${version}`,
            actorId: args.actor.userId ?? null,
          },
        });
      }

      return tx.officialDocument.create({
        data: {
          id: documentId,
          companyId: args.companyId,
          type: args.type,
          documentNumber: args.documentNumber,
          status: 'ISSUED',
          version,
          seriesId: seriesId ?? documentId,
          verificationToken: token,
          sourceType: args.sourceType,
          sourceId: args.sourceId,
          payload: args.payload as never,
          storageKey,
          byteSize: pdf.byteLength,
          pageCount,
          issuerNameEn: args.issuer.nameEn,
          issuerNameAr: args.issuer.nameAr,
          issuerCode: args.issuer.code,
          issuedById: args.actor.userId ?? null,
          events: {
            create: {
              companyId: args.companyId,
              event: prior ? 'REISSUED' : 'ISSUED',
              detail: prior ? `Version ${version}` : 'Initial issue',
              actorId: args.actor.userId ?? null,
            },
          },
        },
      });
    });

    await this.audit.record({
      actorUserId: args.actor.userId,
      companyId: args.companyId,
      action: 'document.issued',
      targetType: 'OFFICIAL_DOCUMENT',
      targetId: created.id,
      summary: `Issued ${spec.labelEn} ${args.documentNumber} v${version}`,
      metadata: { type: args.type, documentNumber: args.documentNumber, version, pageCount },
      ipAddress: args.req?.ip,
      userAgent: this.userAgent(args.req),
    });

    this.logger.log(`Issued ${args.type} ${args.documentNumber} v${version} (${pageCount}p)`);
    return this.toDto(created);
  }

  // ------------------------------------------------------------------ reading

  /** The issued documents for a source record, newest version first. */
  async listForSource(
    sourceType: string,
    sourceId: string,
    principal: RequestPrincipal,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const rows = await this.prisma.officialDocument.findMany({
      where: { companyId, sourceType, sourceId },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  /** One issued document, tenant-scoped. */
  async get(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const row = await this.prisma.officialDocument.findFirst({
      where: { id, companyId },
      include: { events: { orderBy: { createdAt: 'desc' } } },
    });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    return {
      ...this.toDto(row),
      events: row.events.map((e) => ({
        id: e.id,
        event: e.event,
        detail: e.detail,
        actorId: e.actorId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /** The stored PDF bytes, tenant-scoped and downloadability-checked. */
  async download(
    id: string,
    principal: RequestPrincipal,
    actor: ActorContext,
    req?: RequestLike,
  ): Promise<{ bytes: Buffer; filename: string; contentType: string }> {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const row = await this.prisma.officialDocument.findFirst({ where: { id, companyId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    if (!row.storageKey || !isDocumentDownloadable(row.status)) {
      throw conflict(
        ERROR_CODES.DOCUMENT_IMMUTABLE,
        `A ${row.status.toLowerCase()} document has no downloadable copy.`,
      );
    }

    const bytes = await this.storage.read(row.storageKey);

    await this.prisma.officialDocumentEvent.create({
      data: {
        companyId,
        documentId: row.id,
        event: 'DOWNLOADED',
        actorId: actor.userId ?? null,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'document.downloaded',
      targetType: 'OFFICIAL_DOCUMENT',
      targetId: row.id,
      summary: `Downloaded ${row.type} ${row.documentNumber} v${row.version}`,
      ipAddress: req?.ip,
      userAgent: this.userAgent(req),
    });

    return {
      bytes,
      filename: `${row.documentNumber}-v${row.version}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /**
   * Revokes a document.
   *
   * A revoked document is never deleted: the row and the file stay so the
   * verification page can explain what happened to a scan of a printed copy. The
   * PDF is left in place but is no longer downloadable through the API.
   */
  async revoke(
    id: string,
    reason: string,
    principal: RequestPrincipal,
    actor: ActorContext,
    req?: RequestLike,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const row = await this.prisma.officialDocument.findFirst({ where: { id, companyId } });
    if (!row) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Document not found.');
    if (row.status === 'REVOKED' || row.status === 'CANCELLED') {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'The document is already withdrawn.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.officialDocument.update({
        where: { id: row.id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason },
      });
      await tx.officialDocumentEvent.create({
        data: {
          companyId,
          documentId: row.id,
          event: 'REVOKED',
          detail: reason,
          actorId: actor.userId ?? null,
        },
      });
      return next;
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'document.revoked',
      targetType: 'OFFICIAL_DOCUMENT',
      targetId: row.id,
      summary: `Revoked ${row.type} ${row.documentNumber} v${row.version}: ${reason}`,
      ipAddress: req?.ip,
      userAgent: this.userAgent(req),
    });

    return this.toDto(updated);
  }

  // -------------------------------------------------------------- verification

  /**
   * The public verification lookup.
   *
   * Reachable without authentication, so it returns the minimum needed to
   * answer "is this real and which document is it" — never amounts, line items
   * or the customer's contact details. An unknown token returns `null` and the
   * caller answers 404; the token itself is the only credential, so it is never
   * logged.
   */
  async verifyPublic(token: string): Promise<DocumentVerificationView | null> {
    if (!token || token.length < 16 || token.length > 128) return null;
    const row = await this.prisma.officialDocument.findUnique({
      where: { verificationToken: token },
    });
    if (!row) return null;

    const spec = officialDocumentSpec(row.type);
    const payload = row.payload as unknown as DocumentPayload;

    const view: DocumentVerificationView = {
      status: verificationStatusFor(row.status),
      type: row.type,
      typeLabelEn: spec.labelEn,
      typeLabelAr: spec.labelAr,
      documentNumber: row.documentNumber,
      version: row.version,
      issuerNameEn: row.issuerNameEn,
      issuerNameAr: row.issuerNameAr,
      issuerCode: row.issuerCode,
      issuedAt: row.issuedAt.toISOString(),
    };

    if (payload?.kind === 'INSPECTION_REPORT') {
      view.subject = {
        jobNumber: payload.jobNumber,
        plateNumber: payload.vehicle.plateNumber,
        vinMasked: maskVinSafe(payload.vehicle.vin),
        make: payload.vehicle.make,
        model: payload.vehicle.model,
        modelYear: payload.vehicle.modelYear,
      };
    }

    return view;
  }

  // ------------------------------------------------------------------ helpers

  /** The issuer identity for a company, with its branding logo inlined. */
  private async issuerFor(companyId: string): Promise<DocumentIssuer> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { branding: { include: { logoAsset: true } } },
    });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');

    let logoDataUri: string | null = null;
    const logoKey = company.branding?.logoAsset?.storageKey;
    if (logoKey) {
      logoDataUri = await this.inlineImage(logoKey, company.branding?.logoAsset?.mimeType);
    }

    return {
      companyId,
      nameEn: company.branding?.nameEn ?? company.nameEn,
      nameAr: company.branding?.nameAr ?? company.nameAr,
      code: company.code,
      legalNameEn: company.legalNameEn,
      taxNumber: company.taxNumber,
      countryCode: company.countryCode,
      currency: company.currency,
      logoDataUri,
      primaryColor: company.branding?.primaryColor ?? null,
      accentColor: company.branding?.accentColor ?? null,
    };
  }

  /**
   * Reads an image asset and returns it as a data URI for embedding.
   *
   * The document is rendered from a `setContent` string with no page origin, so
   * a relative URL would not resolve and a network fetch to the API would fail
   * in the renderer. Inlining the bytes is the only reliable option, and it also
   * means the stored PDF is self-contained.
   */
  private async inlineImage(storageKey: string, mimeType?: string | null): Promise<string | null> {
    try {
      const root = resolve(process.env.MEDIA_ROOT ?? join(process.cwd(), '.media'));
      const path = resolve(root, storageKey);
      if (!path.startsWith(root + sep)) return null;
      const bytes = await readFile(path);
      const mime = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/png';
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      return null;
    }
  }

  /** Builds the immutable inspection payload from the stored session. */
  private async buildInspectionPayload(
    companyId: string,
    session: {
      id: string;
      jobNumber: string;
      inspectedAt: Date;
      status: string;
      customerName: string;
      contactNumber: string | null;
      make: string;
      model: string;
      modelYear: number;
      plateNumber: string | null;
      vin: string;
      color: string | null;
      odometer: number | null;
      branchId: string | null;
      inspectorUserId: string | null;
      selectedAreas: string[];
      generalRemarks: string | null;
      interiorRemarks: string | null;
      exteriorRemarks: string | null;
      engineRemarks: string | null;
      roadTestRemarks: string | null;
      finalAssessment: string | null;
      reviewedById: string | null;
      reviewedAt: Date | null;
      sections: Array<{
        area: string;
        remarks: string | null;
        noFindings: boolean;
        items: Array<{ itemKey: string; result: string; note: string | null }>;
        markers: Array<{ condition: string; x: number; y: number; panelKey: string | null; note: string | null }>;
        chassisRegions: Array<{ regionKey: string; condition: string; note: string | null }>;
        diagnostics: Array<{
          module: string;
          faultCode: string | null;
          description: string;
          observation: string | null;
          severity: string;
        }>;
      }>;
      attachments: Array<{
        id: string;
        mediaAssetId: string | null;
        sectionArea: string | null;
        caption: string | null;
        originalName: string;
        mimeType: string;
      }>;
    },
  ): Promise<InspectionReportPayload> {
    const branch = session.branchId
      ? await this.prisma.branch.findFirst({ where: { id: session.branchId, companyId } })
      : null;
    const inspector = session.inspectorUserId
      ? await this.prisma.user.findUnique({ where: { id: session.inspectorUserId } })
      : null;
    const reviewer = session.reviewedById
      ? await this.prisma.user.findUnique({ where: { id: session.reviewedById } })
      : null;

    const selected = session.selectedAreas as InspectionSectionKey[];

    const sections: InspectionReportSection[] = INSPECTION_SECTION_SPECS.filter((spec) =>
      selected.includes(spec.key),
    ).map((spec) => {
      const row = session.sections.find((s) => s.area === spec.key);
      const labelFor = (key: string) => spec.items.find((i) => i.key === key);
      return {
        area: spec.key,
        labelEn: spec.labelEn,
        labelAr: spec.labelAr,
        kind: spec.kind,
        remarks: row?.remarks ?? null,
        remarksLabelEn: spec.remarksLabelEn,
        remarksLabelAr: spec.remarksLabelAr,
        noFindings: row?.noFindings ?? false,
        // Items are drawn from the catalogue, so an item the inspector never
        // touched prints as UNSET rather than being silently dropped — a missing
        // row in a checklist reads as "checked and fine".
        items: spec.items.map((item) => {
          const result = row?.items.find((i) => i.itemKey === item.key);
          return {
            itemKey: item.key,
            labelEn: labelFor(item.key)?.labelEn ?? item.labelEn,
            labelAr: labelFor(item.key)?.labelAr ?? item.labelAr,
            result: (result?.result as 'PASS' | 'FAIL' | 'NA' | 'UNSET') ?? 'UNSET',
            note: result?.note ?? null,
          };
        }),
        markers: (row?.markers ?? []).map((m) => ({
          condition: m.condition as 'PAINT' | 'FILLER' | 'CHANGE' | 'SECTIONED',
          x: m.x,
          y: m.y,
          panelKey: m.panelKey,
          note: m.note,
        })),
        chassisRegions: (row?.chassisRegions ?? []).map((r) => {
          const regionSpec = CHASSIS_LOOKUP.get(r.regionKey as ChassisRegionKey);
          return {
            regionKey: r.regionKey,
            labelEn: regionSpec?.labelEn ?? r.regionKey,
            labelAr: regionSpec?.labelAr ?? r.regionKey,
            condition: r.condition as 'OK' | 'DAMAGE' | 'UNSET',
            note: r.note,
            x: regionSpec?.x ?? 0,
            y: regionSpec?.y ?? 0,
          };
        }),
        diagnostics: (row?.diagnostics ?? []).map((d) => ({
          module: d.module,
          faultCode: d.faultCode,
          description: d.description,
          observation: d.observation,
          severity: d.severity as 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        })),
        attachments: [],
      };
    });

    // Attachments are inlined after the sections, so a failed image read drops
    // that one photograph rather than failing the whole report.
    const attachmentsByArea = new Map<string, InspectionReportAttachment[]>();
    for (const attachment of session.attachments) {
      const area = (attachment.sectionArea ?? null) as InspectionSectionKey | null;
      if (!area) continue;
      const dataUri = await this.inlineAttachment(attachment.mediaAssetId);
      if (!dataUri) continue;
      const list = attachmentsByArea.get(area) ?? [];
      list.push({ id: attachment.id, dataUri, caption: attachment.caption, sectionArea: area });
      attachmentsByArea.set(area, list);
    }
    for (const section of sections) {
      section.attachments = attachmentsByArea.get(section.area) ?? [];
    }

    return {
      kind: 'INSPECTION_REPORT',
      jobNumber: session.jobNumber,
      inspectedAt: session.inspectedAt.toISOString(),
      status: session.status,
      customerName: session.customerName,
      contactNumber: session.contactNumber,
      vehicle: {
        make: session.make,
        model: session.model,
        modelYear: session.modelYear,
        plateNumber: session.plateNumber,
        vin: session.vin,
        color: session.color,
        odometer: session.odometer,
      },
      branchName: branch?.nameEn ?? branch?.nameAr ?? null,
      inspectorName: inspector?.fullNameEn ?? inspector?.fullNameAr ?? null,
      selectedAreas: selected,
      generalRemarks: session.generalRemarks,
      interiorRemarks: session.interiorRemarks,
      exteriorRemarks: session.exteriorRemarks,
      engineRemarks: session.engineRemarks,
      roadTestRemarks: session.roadTestRemarks,
      finalAssessment: session.finalAssessment,
      reviewedByName: reviewer?.fullNameEn ?? reviewer?.fullNameAr ?? null,
      reviewedAt: session.reviewedAt?.toISOString() ?? null,
      sections,
    };
  }

  /**
   * Inlines an inspection attachment's photograph.
   *
   * The attachment stores the media asset id directly, so the asset is read by
   * primary key rather than by guessing at a name match. An attachment with no
   * asset (a record-only note) simply contributes no photograph.
   */
  private async inlineAttachment(mediaAssetId: string | null): Promise<string | null> {
    if (!mediaAssetId) return null;
    const asset = await this.prisma.cmsMediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) return null;
    return this.inlineImage(asset.storageKey, asset.mimeType);
  }

  /**
   * Loads and maps a financial source record to its payload.
   *
   * Returns `null` when the record is absent in the tenant. Each supported type
   * is mapped explicitly — there is no generic reflection over a table name,
   * which would be a tenant-scope hole waiting to happen.
   */
  private async loadFinancialSource(
    companyId: string,
    type: OfficialDocumentType,
    sourceId: string,
  ): Promise<{
    documentNumber: string;
    sourceType: string;
    sourceId: string;
    payload: FinancialDocumentPayload;
  } | null> {
    const spec = officialDocumentSpec(type);
    const currencyOf = async () => this.context.companyCurrency(companyId);

    if (type === 'SALES_INVOICE' || type === 'SALES_ORDER' || type === 'QUOTATION' || type === 'SALES_RETURN') {
      if (type === 'SALES_INVOICE') {
        const invoice = await this.prisma.salesInvoice.findFirst({
          where: { id: sourceId, companyId },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, customer: true },
        });
        if (!invoice) return null;
        return {
          documentNumber: invoice.invoiceNumber,
          sourceType: 'SalesInvoice',
          sourceId: invoice.id,
          payload: {
            kind: 'FINANCIAL',
            titleEn: spec.labelEn,
            titleAr: spec.labelAr,
            documentNumber: invoice.invoiceNumber,
            documentDate: invoice.invoiceDate.toISOString(),
            dueDate: invoice.dueDate?.toISOString() ?? null,
            status: invoice.status,
            counterparty: counterparty(invoice.customer),
            lines: invoice.lines.map((l) => ({
              description: l.description,
              sku: null,
              quantity: l.quantity,
              unitPriceMinor: l.unitPriceMinor,
              discountMinor: l.discountMinor,
              taxMinor: l.taxMinor,
              lineTotalMinor: l.lineTotalMinor,
            })),
            subtotalMinor: invoice.subtotalMinor,
            discountMinor: invoice.discountMinor,
            taxMinor: invoice.taxMinor,
            totalMinor: invoice.totalMinor,
            paidMinor: invoice.amountPaidMinor,
            balanceMinor: invoice.totalMinor - invoice.amountPaidMinor,
            currency: invoice.currency || (await currencyOf()),
            notes: invoice.notes,
          },
        };
      }

      if (type === 'QUOTATION') {
        const quotation = await this.prisma.quotation.findFirst({
          where: { id: sourceId, companyId },
          include: { lines: true, customer: true },
        });
        if (!quotation) return null;
        return {
          documentNumber: quotation.quoteNumber,
          sourceType: 'Quotation',
          sourceId: quotation.id,
          payload: {
            kind: 'FINANCIAL',
            titleEn: spec.labelEn,
            titleAr: spec.labelAr,
            documentNumber: quotation.quoteNumber,
            documentDate: quotation.issueDate.toISOString(),
            dueDate: quotation.validUntil?.toISOString() ?? null,
            status: quotation.status,
            counterparty: counterparty(quotation.customer),
            lines: quotation.lines.map((l) => percentLine(l)),
            subtotalMinor: quotation.subtotalMinor,
            discountMinor: quotation.discountMinor,
            taxMinor: quotation.taxMinor,
            totalMinor: quotation.totalMinor,
            paidMinor: 0,
            balanceMinor: quotation.totalMinor,
            currency: quotation.currency || (await currencyOf()),
            notes: quotation.notes,
          },
        };
      }

      if (type === 'SALES_ORDER') {
        const order = await this.prisma.salesOrder.findFirst({
          where: { id: sourceId, companyId },
          include: { lines: true, customer: true },
        });
        if (!order) return null;
        return {
          documentNumber: order.orderNumber,
          sourceType: 'SalesOrder',
          sourceId: order.id,
          payload: {
            kind: 'FINANCIAL',
            titleEn: spec.labelEn,
            titleAr: spec.labelAr,
            documentNumber: order.orderNumber,
            documentDate: order.orderDate.toISOString(),
            dueDate: null,
            status: order.status,
            counterparty: counterparty(order.customer),
            lines: order.lines.map((l) => percentLine(l)),
            subtotalMinor: order.subtotalMinor,
            discountMinor: order.discountMinor,
            taxMinor: order.taxMinor,
            totalMinor: order.totalMinor,
            paidMinor: 0,
            balanceMinor: order.totalMinor,
            currency: order.currency || (await currencyOf()),
            notes: order.notes,
          },
        };
      }
    }

    if (type === 'PAYMENT_RECEIPT' || type === 'PAYMENT_VOUCHER') {
      const payment = await this.prisma.payment.findFirst({
        where: { id: sourceId, companyId },
        include: { customer: true },
      });
      if (!payment) return null;
      return {
        documentNumber: payment.paymentNumber,
        sourceType: 'Payment',
        sourceId: payment.id,
        payload: {
          kind: 'FINANCIAL',
          titleEn: spec.labelEn,
          titleAr: spec.labelAr,
          documentNumber: payment.paymentNumber,
          documentDate: payment.paidAt.toISOString(),
          dueDate: null,
          status: payment.journalEntryId ? 'POSTED' : 'RECORDED',
          counterparty: payment.customer
            ? counterparty(payment.customer)
            : {
                nameEn: 'Walk-in',
                nameAr: 'عميل نقدي',
                code: '—',
                taxNumber: null,
                email: null,
                phone: null,
                addressLine: null,
                city: null,
              },
          lines: [
            {
              description: payment.notes ?? 'Payment received',
              sku: null,
              quantity: 1,
              unitPriceMinor: payment.amountMinor,
              discountMinor: 0,
              taxMinor: 0,
              lineTotalMinor: payment.amountMinor,
            },
          ],
          subtotalMinor: payment.amountMinor,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: payment.amountMinor,
          paidMinor: payment.amountMinor,
          balanceMinor: 0,
          currency: payment.currency || (await currencyOf()),
          notes: payment.notes,
          payment: {
            method: payment.method,
            reference: payment.reference,
            receivedByName: null,
            paidAt: payment.paidAt.toISOString(),
          },
        },
      };
    }

    return null;
  }

  private toDto(row: {
    id: string;
    type: string;
    documentNumber: string;
    status: string;
    version: number;
    verificationToken: string;
    sourceType: string;
    sourceId: string;
    pageCount: number | null;
    byteSize: number | null;
    issuedAt: Date;
    issuerNameEn: string;
    issuerNameAr: string;
    issuerCode: string;
    supersededAt: Date | null;
    revokedAt: Date | null;
    revokeReason: string | null;
  }) {
    return {
      id: row.id,
      type: row.type,
      documentNumber: row.documentNumber,
      status: row.status,
      version: row.version,
      verificationToken: row.verificationToken,
      verificationUrl: this.qr.verificationUrl(row.verificationToken),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      pageCount: row.pageCount,
      byteSize: row.byteSize,
      issuedAt: row.issuedAt.toISOString(),
      issuerNameEn: row.issuerNameEn,
      issuerNameAr: row.issuerNameAr,
      issuerCode: row.issuerCode,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokeReason: row.revokeReason,
      downloadable: isDocumentDownloadable(row.status),
    };
  }

  private userAgent(req?: RequestLike): string | undefined {
    const ua = req?.headers['user-agent'];
    return Array.isArray(ua) ? ua[0] : ua;
  }
}

/** Maps a customer row onto the payload's counterparty shape. */
function counterparty(customer: {
  nameEn: string;
  nameAr: string;
  code: string;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
}) {
  return {
    nameEn: customer.nameEn,
    nameAr: customer.nameAr,
    code: customer.code,
    taxNumber: customer.taxNumber,
    email: customer.email,
    phone: customer.phone,
    addressLine: customer.addressLine,
    city: customer.city,
  };
}

/** Masks a VIN for the public verification page. */
function maskVinSafe(vin: string): string {
  if (vin.length <= 4) return vin;
  return `${'•'.repeat(vin.length - 4)}${vin.slice(-4)}`;
}

/** A cu id generated locally so the storage key can be derived before insert. */
function newDocumentId(): string {
  // `cuid`-shaped is not required; any collision-resistant id works, and Prisma
  // accepts an explicit id on create.
  const random = Math.random().toString(36).slice(2, 12);
  return `doc${Date.now().toString(36)}${random}`;
}

/**
 * Maps a line that stores percentages to one that carries amounts.
 *
 * A quotation and an order line keep a discount and a tax *rate*, not the
 * resolved amounts, because the amounts depend on the line's own subtotal. They
 * are computed here with the shared money helpers rather than re-derived, so the
 * printed figures use the same rounding as the ledger.
 */
function percentLine(l: {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercentBp: number;
  taxPercentBp: number;
  lineTotalMinor: number;
}) {
  const gross = lineAmountMinor(l.quantity, l.unitPriceMinor);
  const discount = basisPointsOfMinor(gross, l.discountPercentBp);
  const tax = basisPointsOfMinor(gross - discount, l.taxPercentBp);
  return {
    description: l.description,
    sku: null,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    discountMinor: discount,
    taxMinor: tax,
    lineTotalMinor: l.lineTotalMinor,
  };
}

const CHASSIS_LOOKUP = new Map(CHASSIS_REGIONS.map((r) => [r.key, r]));
