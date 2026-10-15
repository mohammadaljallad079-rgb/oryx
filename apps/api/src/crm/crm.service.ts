import { Injectable } from '@nestjs/common';
import { computeDocumentTotals, type PricedLineInput } from '../common/document-totals';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  CompleteActivityDto,
  ConvertOpportunityDto,
  CreateActivityDto,
  CreateContactDto,
  CreateLeadDto,
  CreateLeadSourceDto,
  CreateOpportunityDto,
  CreatePipelineDto,
  CreateSegmentDto,
  CreateSlaDto,
  CreateStagesDto,
  CreateTicketDto,
  ListQueryDto,
  MoveStageDto,
  SegmentMemberDto,
  TicketMessageDto,
  UpdateLeadDto,
  UpdateTicketDto,
} from './crm.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
  ) {}

  // ------------------------------------------------------------ lead sources

  async listLeadSources(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.leadSource.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createLeadSource(dto: CreateLeadSourceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.leadSource.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Lead source ${dto.code} already exists.`);
    const source = await this.prisma.leadSource.create({ data: { companyId, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.lead_source_created', targetType: 'LEAD_SOURCE', targetId: source.id, summary: `Created lead source ${source.code}` });
    return source;
  }

  // -------------------------------------------------------------------- leads

  async listLeads(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { nameEn: { contains: query.search, mode: 'insensitive' as const } },
              { nameAr: { contains: query.search } },
              { contactName: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { source: { select: { nameEn: true, nameAr: true } } } }),
      this.prisma.lead.count({ where }),
    ]);
    return { items: rows.map(toLeadDto), total, page, pageSize };
  }

  async createLead(dto: CreateLeadDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.lead.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Lead code ${dto.code} already exists.`);
    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        sourceId: dto.sourceId ?? null,
        estimatedValueMinor: dto.estimatedValueMinor ?? 0,
        ownerUserId: dto.ownerUserId ?? null,
        notes: dto.notes ?? null,
      },
      include: { source: { select: { nameEn: true, nameAr: true } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.lead_created', targetType: 'LEAD', targetId: lead.id, summary: `Created lead ${lead.code}` });
    return toLeadDto(lead);
  }

  async updateLead(id: string, dto: UpdateLeadDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Lead not found.');
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { source: { select: { nameEn: true, nameAr: true } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.lead_updated', targetType: 'LEAD', targetId: id, summary: `Updated lead ${updated.code}` });
    return toLeadDto(updated);
  }

  // ---------------------------------------------------------------- pipelines

  async listPipelines(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.pipeline.findMany({ where: { companyId }, orderBy: { code: 'asc' }, include: { stages: { orderBy: { sortOrder: 'asc' } } } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createPipeline(dto: CreatePipelineDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.pipeline.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Pipeline ${dto.code} already exists.`);
    const pipeline = await this.prisma.pipeline.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        isDefault: dto.isDefault ?? false,
        // Seed a conventional set of stages so the pipeline is usable at once.
        stages: {
          create: [
            { companyId, code: 'NEW', nameEn: 'New', nameAr: 'جديد', sortOrder: 1, probabilityBp: 1000 },
            { companyId, code: 'QUALIFIED', nameEn: 'Qualified', nameAr: 'مؤهل', sortOrder: 2, probabilityBp: 3000 },
            { companyId, code: 'PROPOSAL', nameEn: 'Proposal', nameAr: 'عرض', sortOrder: 3, probabilityBp: 6000 },
            { companyId, code: 'WON', nameEn: 'Won', nameAr: 'مكسوب', sortOrder: 4, probabilityBp: 10000, isWon: true },
            { companyId, code: 'LOST', nameEn: 'Lost', nameAr: 'مفقود', sortOrder: 5, probabilityBp: 0, isLost: true },
          ],
        },
      },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.pipeline_created', targetType: 'PIPELINE', targetId: pipeline.id, summary: `Created pipeline ${pipeline.code}` });
    return pipeline;
  }

  async setStages(pipelineId: string, dto: CreateStagesDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const pipeline = await this.prisma.pipeline.findFirst({ where: { id: pipelineId, companyId } });
    if (!pipeline) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Pipeline not found.');
    const stages = await this.posting.withTransaction(async (tx) => {
      await tx.pipelineStage.deleteMany({ where: { pipelineId, opportunities: { none: {} } } });
      for (const [i, s] of dto.stages.entries()) {
        await tx.pipelineStage.upsert({
          where: { pipelineId_code: { pipelineId, code: s.code } },
          create: { companyId, pipelineId, code: s.code, nameEn: s.nameEn, nameAr: s.nameAr, sortOrder: i, probabilityBp: s.probabilityBp ?? 0, isWon: s.isWon ?? false, isLost: s.isLost ?? false },
          update: { nameEn: s.nameEn, nameAr: s.nameAr, sortOrder: i, probabilityBp: s.probabilityBp ?? 0, isWon: s.isWon ?? false, isLost: s.isLost ?? false },
        });
      }
      return tx.pipelineStage.findMany({ where: { pipelineId }, orderBy: { sortOrder: 'asc' } });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.pipeline_stages_set', targetType: 'PIPELINE', targetId: pipelineId, summary: `Set ${stages.length} stages` });
    return stages;
  }

  // ------------------------------------------------------------ opportunities

  async listOpportunities(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { stage: { select: { nameEn: true, nameAr: true, probabilityBp: true, isWon: true, isLost: true } }, pipeline: { select: { nameEn: true, nameAr: true } } },
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items: rows.map(toOpportunityDto), total, page, pageSize };
  }

  async createOpportunity(dto: CreateOpportunityDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.opportunity.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Opportunity code ${dto.code} already exists.`);
    const pipeline = await this.prisma.pipeline.findFirst({ where: { id: dto.pipelineId, companyId }, include: { stages: { orderBy: { sortOrder: 'asc' } } } });
    if (!pipeline) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Pipeline not found.');
    const stageId = dto.stageId ?? pipeline.stages[0]?.id;
    if (!stageId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The pipeline has no stages.');
    if (dto.customerId) await this.assertCustomer(companyId, dto.customerId);

    const opportunity = await this.prisma.opportunity.create({
      data: {
        companyId,
        code: dto.code,
        title: dto.title,
        pipelineId: dto.pipelineId,
        stageId,
        customerId: dto.customerId ?? null,
        leadId: dto.leadId ?? null,
        ownerUserId: dto.ownerUserId ?? null,
        amountMinor: dto.amountMinor,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        notes: dto.notes ?? null,
      },
      include: { stage: true, pipeline: true },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.opportunity_created', targetType: 'OPPORTUNITY', targetId: opportunity.id, summary: `Created opportunity ${opportunity.code}` });
    return toOpportunityDto(opportunity);
  }

  /** Move an opportunity between stages, closing it when the stage is won/lost. */
  async moveStage(id: string, dto: MoveStageDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const opportunity = await this.prisma.opportunity.findFirst({ where: { id, companyId } });
    if (!opportunity) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Opportunity not found.');
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: dto.stageId, companyId } });
    if (!stage) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Stage not found.');
    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        stageId: dto.stageId,
        status: stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN',
        closedAt: stage.isWon || stage.isLost ? new Date() : null,
      },
      include: { stage: true, pipeline: true },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.opportunity_stage_changed', targetType: 'OPPORTUNITY', targetId: id, summary: `Moved opportunity to ${stage.nameEn}` });
    return toOpportunityDto(updated);
  }

  /**
   * Convert a won opportunity into a sales quotation.
   *
   * The quotation is created through the sales module's own table so the two
   * modules share one quotation record. Conversion happens once; a second
   * attempt is refused.
   */
  async convertOpportunity(id: string, dto: ConvertOpportunityDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const result = await this.posting.withTransaction(async (tx) => {
      const opportunity = await tx.opportunity.findFirst({ where: { id, companyId } });
      if (!opportunity) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Opportunity not found.');
      if (opportunity.quotationId) throw badRequest(ERROR_CODES.OPPORTUNITY_ALREADY_CONVERTED, 'This opportunity has already been converted.');
      if (!opportunity.customerId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'The opportunity has no customer to quote.');

      const quoteNumber = await this.sequences.next(tx, companyId, 'quotation');
      const lineInput: PricedLineInput & { description: string } = {
        quantity: 10000,
        unitPriceMinor: opportunity.amountMinor,
        discountPercentBp: 0,
        taxPercentBp: 0,
        description: opportunity.title,
      };
      const totals = computeDocumentTotals([lineInput]);
      const quotation = await tx.quotation.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          quoteNumber,
          customerId: opportunity.customerId,
          status: 'DRAFT',
          issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: opportunity.currency,
          notes: `From opportunity ${opportunity.code}`,
          createdById: actor.userId,
          lines: {
            create: [
              {
                productId: null,
                description: lineInput.description,
                quantity: lineInput.quantity,
                unitPriceMinor: lineInput.unitPriceMinor,
                discountPercentBp: 0,
                taxPercentBp: 0,
                lineTotalMinor: totals.lines[0].lineTotalMinor,
                sortOrder: 0,
              },
            ],
          },
        },
      });
      await tx.opportunity.update({ where: { id }, data: { quotationId: quotation.id, status: 'WON', closedAt: new Date() } });
      return quotation;
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.opportunity_converted', targetType: 'QUOTATION', targetId: result.id, summary: `Converted opportunity to quotation ${result.quoteNumber}` });
    return { id: result.id, quoteNumber: result.quoteNumber, totalMinor: result.totalMinor, currency: result.currency };
  }

  // ---------------------------------------------------------------- contacts

  async listContacts(customerId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertCustomer(companyId, customerId);
    const rows = await this.prisma.customerContact.findMany({ where: { companyId, customerId }, orderBy: { createdAt: 'desc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createContact(customerId: string, dto: CreateContactDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertCustomer(companyId, customerId);
    const contact = await this.prisma.customerContact.create({
      data: { companyId, customerId, nameEn: dto.nameEn, nameAr: dto.nameAr, email: dto.email ?? null, phone: dto.phone ?? null, role: dto.role ?? null, isPrimary: dto.isPrimary ?? false },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.contact_created', targetType: 'CUSTOMER_CONTACT', targetId: contact.id, summary: `Added contact ${contact.nameEn}` });
    return contact;
  }

  /**
   * Create a CRM customer master record, refusing an obvious duplicate.
   *
   * A duplicate is a same-company customer with the same tax number, or the same
   * normalised email/phone. This keeps the customer master from fragmenting
   * without blocking a legitimately different customer.
   */
  async createCustomer(body: {
    code: string;
    nameEn: string;
    nameAr: string;
    email?: string;
    phone?: string;
    taxNumber?: string;
    creditLimitMinor?: number;
    paymentTermsDays?: number;
  }, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.findDuplicateCustomer(companyId, body);
    if (dup) throw conflict(ERROR_CODES.DUPLICATE_CUSTOMER, `A matching customer already exists (${dup.code} ${dup.nameEn}).`);
    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        code: body.code,
        nameEn: body.nameEn,
        nameAr: body.nameAr,
        email: body.email ?? null,
        phone: body.phone ?? null,
        taxNumber: body.taxNumber ?? null,
        creditLimitMinor: body.creditLimitMinor ?? 0,
        paymentTermsDays: body.paymentTermsDays ?? 0,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.customer_created', targetType: 'CUSTOMER', targetId: customer.id, summary: `Created customer ${customer.code}` });
    return customer;
  }

  private async findDuplicateCustomer(
    companyId: string,
    body: { taxNumber?: string; email?: string; phone?: string; nameEn?: string },
  ) {
    const or: Array<Record<string, unknown>> = [];
    if (body.taxNumber) or.push({ taxNumber: body.taxNumber });
    if (body.email) or.push({ email: { equals: body.email, mode: 'insensitive' } });
    if (body.phone) or.push({ phone: body.phone });
    if (or.length === 0) return null;
    return this.prisma.customer.findFirst({ where: { companyId, OR: or }, select: { id: true, code: true, nameEn: true } });
  }

  // -------------------------------------------------------------- activities

  async listActivities(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.crmActivity.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createActivity(dto: CreateActivityDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const activity = await this.prisma.crmActivity.create({
      data: {
        companyId,
        type: dto.type as never,
        subject: dto.subject,
        notes: dto.notes ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        ownerUserId: dto.ownerUserId ?? null,
        customerId: dto.customerId ?? null,
        leadId: dto.leadId ?? null,
        opportunityId: dto.opportunityId ?? null,
        ticketId: dto.ticketId ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.activity_created', targetType: 'CRM_ACTIVITY', targetId: activity.id, summary: `Created ${dto.type.toLowerCase()} activity` });
    return activity;
  }

  async completeActivity(id: string, dto: CompleteActivityDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const activity = await this.prisma.crmActivity.findFirst({ where: { id, companyId } });
    if (!activity) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Activity not found.');
    const updated = await this.prisma.crmActivity.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), ...(dto.notes !== undefined ? { notes: dto.notes } : {}) },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.activity_completed', targetType: 'CRM_ACTIVITY', targetId: id, summary: 'Completed activity' });
    return updated;
  }

  // ----------------------------------------------------------------- tickets

  async listSlaPolicies(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.slaPolicy.findMany({ where: { companyId } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async setSlaPolicy(dto: CreateSlaDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const policy = await this.prisma.slaPolicy.upsert({
      where: { companyId_priority: { companyId, priority: dto.priority as never } },
      create: {
        companyId,
        name: dto.name ?? `${dto.priority} response`,
        priority: dto.priority as never,
        responseMinutes: dto.responseMinutes,
        resolutionMinutes: dto.resolutionMinutes,
      },
      update: { ...(dto.name ? { name: dto.name } : {}), responseMinutes: dto.responseMinutes, resolutionMinutes: dto.resolutionMinutes },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.sla_policy_set', targetType: 'SLA_POLICY', targetId: policy.id, summary: `Set SLA for ${dto.priority}` });
    return policy;
  }

  async listTickets(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search ? { subject: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { messages: true } } } }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: rows.map(toTicketDto), total, page, pageSize };
  }

  /** Create a ticket and derive its SLA targets from the matching policy. */
  async createTicket(dto: CreateTicketDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const priority = (dto.priority ?? 'NORMAL') as never;
    const policy = await this.prisma.slaPolicy.findUnique({ where: { companyId_priority: { companyId, priority } } });
    const now = Date.now();
    const ticket = await this.posting.withTransaction(async (tx) => {
      const ticketNumber = await this.sequences.next(tx, companyId, 'supportTicket');
      return tx.supportTicket.create({
        data: {
          companyId,
          ticketNumber,
          subject: dto.subject,
          description: dto.description ?? null,
          customerId: dto.customerId ?? null,
          contactId: dto.contactId ?? null,
          category: dto.category ?? null,
          priority,
          assignedToUserId: dto.assignedToUserId ?? null,
          responseDueAt: policy ? new Date(now + policy.responseMinutes * 60_000) : null,
          resolutionDueAt: policy ? new Date(now + policy.resolutionMinutes * 60_000) : null,
          createdById: actor.userId,
        },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.ticket_created', targetType: 'SUPPORT_TICKET', targetId: ticket.id, summary: `Created ticket ${ticket.ticketNumber}` });
    return ticket;
  }

  async getTicket(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, companyId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!ticket) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Ticket not found.');
    return ticket;
  }

  async addTicketMessage(id: string, dto: TicketMessageDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, companyId } });
    if (!ticket) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Ticket not found.');
    const message = await this.posting.withTransaction(async (tx) => {
      const created = await tx.ticketMessage.create({
        data: { companyId, ticketId: id, authorUserId: actor.userId, body: dto.body, isInternal: dto.isInternal ?? false },
      });
      // The first non-internal reply records the first-response time.
      if (!ticket.firstResponseAt && !dto.isInternal) {
        await tx.supportTicket.update({ where: { id }, data: { firstResponseAt: new Date(), status: ticket.status === 'NEW' ? 'OPEN' : ticket.status } });
      }
      return created;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.ticket_message_added', targetType: 'SUPPORT_TICKET', targetId: id, summary: 'Added a ticket message' });
    return message;
  }

  async updateTicket(id: string, dto: UpdateTicketDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, companyId } });
    if (!ticket) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Ticket not found.');
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as never } : {}),
        ...(dto.assignedToUserId !== undefined ? { assignedToUserId: dto.assignedToUserId } : {}),
        ...(dto.satisfactionScore !== undefined ? { satisfactionScore: dto.satisfactionScore } : {}),
        ...(dto.status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
        ...(dto.status === 'CLOSED' ? { closedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.ticket_updated', targetType: 'SUPPORT_TICKET', targetId: id, summary: `Ticket ${updated.ticketNumber} updated` });
    return updated;
  }

  // ---------------------------------------------------------------- segments

  async listSegments(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.customerSegment.findMany({ where: { companyId }, include: { _count: { select: { members: true } } } });
    return { items: rows.map((s) => ({ ...s, memberCount: s._count.members })), total: rows.length, page: 1, pageSize: rows.length };
  }

  async createSegment(dto: CreateSegmentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.customerSegment.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Segment ${dto.code} already exists.`);
    const segment = await this.prisma.customerSegment.create({ data: { companyId, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr, description: dto.description ?? null } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.segment_created', targetType: 'CUSTOMER_SEGMENT', targetId: segment.id, summary: `Created segment ${segment.code}` });
    return segment;
  }

  async addSegmentMember(segmentId: string, dto: SegmentMemberDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const segment = await this.prisma.customerSegment.findFirst({ where: { id: segmentId, companyId } });
    if (!segment) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Segment not found.');
    await this.assertCustomer(companyId, dto.customerId);
    const member = await this.prisma.customerSegmentMember.upsert({
      where: { segmentId_customerId: { segmentId, customerId: dto.customerId } },
      create: { companyId, segmentId, customerId: dto.customerId },
      update: {},
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'crm.segment_member_added', targetType: 'CUSTOMER_SEGMENT', targetId: segmentId, summary: 'Added a customer to a segment' });
    return member;
  }

  // --------------------------------------------------------------- reporting

  async crmDashboard(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const [leads, openOpps, wonOpps, tickets, openTickets, segments, activitiesDue] = await Promise.all([
      this.prisma.lead.count({ where: { companyId } }),
      this.prisma.opportunity.findMany({ where: { companyId, status: 'OPEN' } }),
      this.prisma.opportunity.count({ where: { companyId, status: 'WON' } }),
      this.prisma.supportTicket.count({ where: { companyId } }),
      this.prisma.supportTicket.count({ where: { companyId, status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
      this.prisma.customerSegment.count({ where: { companyId } }),
      this.prisma.crmActivity.count({ where: { companyId, status: 'OPEN', dueAt: { lte: new Date() } } }),
    ]);
    const pipelineValue = openOpps.reduce((sum, o) => sum + o.amountMinor, 0);
    const csat = await this.prisma.supportTicket.aggregate({ where: { companyId, satisfactionScore: { not: null } }, _avg: { satisfactionScore: true } });
    return {
      totalLeads: leads,
      openOpportunities: openOpps.length,
      wonOpportunities: wonOpps,
      pipelineValueMinor: pipelineValue,
      totalTickets: tickets,
      openTickets,
      overdueActivities: activitiesDue,
      segmentCount: segments,
      averageSatisfaction: csat._avg.satisfactionScore ?? null,
    };
  }

  // ----------------------------------------------------------------- helpers

  private async assertCustomer(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found in this company.');
  }
}

// ---------------------------------------------------------------- mappers

function toLeadDto(l: {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  estimatedValueMinor: number;
  currency: string;
  ownerUserId: string | null;
  notes: string | null;
  customerId: string | null;
  source?: { nameEn: string; nameAr: string } | null;
  createdAt: Date;
}) {
  return {
    id: l.id,
    code: l.code,
    nameEn: l.nameEn,
    nameAr: l.nameAr,
    contactName: l.contactName,
    email: l.email,
    phone: l.phone,
    status: l.status,
    estimatedValueMinor: l.estimatedValueMinor,
    currency: l.currency,
    ownerUserId: l.ownerUserId,
    notes: l.notes,
    customerId: l.customerId,
    sourceNameEn: l.source?.nameEn ?? null,
    sourceNameAr: l.source?.nameAr ?? null,
    createdAt: l.createdAt.toISOString(),
  };
}

function toOpportunityDto(o: {
  id: string;
  code: string;
  title: string;
  pipelineId: string;
  stageId: string;
  customerId: string | null;
  leadId: string | null;
  ownerUserId: string | null;
  amountMinor: number;
  currency: string;
  expectedCloseDate: Date | null;
  status: string;
  quotationId: string | null;
  closedAt: Date | null;
  stage?: { nameEn: string; nameAr: string; probabilityBp: number; isWon: boolean; isLost: boolean } | null;
  pipeline?: { nameEn: string; nameAr: string } | null;
}) {
  return {
    id: o.id,
    code: o.code,
    title: o.title,
    pipelineId: o.pipelineId,
    pipelineNameEn: o.pipeline?.nameEn ?? null,
    pipelineNameAr: o.pipeline?.nameAr ?? null,
    stageId: o.stageId,
    stageNameEn: o.stage?.nameEn ?? null,
    stageNameAr: o.stage?.nameAr ?? null,
    probabilityBp: o.stage?.probabilityBp ?? 0,
    customerId: o.customerId,
    leadId: o.leadId,
    ownerUserId: o.ownerUserId,
    amountMinor: o.amountMinor,
    currency: o.currency,
    expectedCloseDate: o.expectedCloseDate?.toISOString() ?? null,
    status: o.status,
    quotationId: o.quotationId,
    closedAt: o.closedAt?.toISOString() ?? null,
  };
}

function toTicketDto(t: {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  customerId: string | null;
  assignedToUserId: string | null;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstResponseAt: Date | null;
  satisfactionScore: number | null;
  _count?: { messages: number };
  createdAt: Date;
}) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    customerId: t.customerId,
    assignedToUserId: t.assignedToUserId,
    responseDueAt: t.responseDueAt?.toISOString() ?? null,
    resolutionDueAt: t.resolutionDueAt?.toISOString() ?? null,
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    satisfactionScore: t.satisfactionScore,
    messageCount: t._count?.messages,
    createdAt: t.createdAt.toISOString(),
  };
}
