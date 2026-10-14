import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { CrmService } from './crm.service';
import {
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

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

class CreateCustomerBodyDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) taxNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) creditLimitMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paymentTermsDays?: number;
}

@ApiTags('crm')
@ApiBearerAuth()
@RequireModule('crm')
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // ------------------------------------------------------------ lead sources
  @Get('lead-sources')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.lead.manage')
  @ApiOperation({ summary: 'List lead sources' })
  leadSources(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listLeadSources(query, p);
  }

  @Post('lead-sources')
  @RequirePermissions('erp.crm.lead.manage')
  @ApiOperation({ summary: 'Create a lead source' })
  createLeadSource(@Body() dto: CreateLeadSourceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createLeadSource(dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------------ leads
  @Get('leads')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.lead.manage')
  @ApiOperation({ summary: 'List leads' })
  leads(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listLeads(query, p);
  }

  @Post('leads')
  @RequirePermissions('erp.crm.lead.manage')
  @ApiOperation({ summary: 'Create a lead' })
  createLead(@Body() dto: CreateLeadDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createLead(dto, p, actorFrom(p, req));
  }

  @Patch('leads/:id')
  @RequirePermissions('erp.crm.lead.manage')
  @ApiOperation({ summary: 'Update a lead' })
  updateLead(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.updateLead(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- pipelines
  @Get('pipelines')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.opportunity.manage')
  @ApiOperation({ summary: 'List pipelines with stages' })
  pipelines(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listPipelines(query, p);
  }

  @Post('pipelines')
  @RequirePermissions('erp.crm.opportunity.manage')
  @ApiOperation({ summary: 'Create a pipeline with a default stage set' })
  createPipeline(@Body() dto: CreatePipelineDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createPipeline(dto, p, actorFrom(p, req));
  }

  @Post('pipelines/:id/stages')
  @RequirePermissions('erp.crm.opportunity.manage')
  @ApiOperation({ summary: 'Replace the stages of a pipeline' })
  setStages(@Param('id') id: string, @Body() dto: CreateStagesDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.setStages(id, dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------- opportunities
  @Get('opportunities')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.opportunity.manage')
  @ApiOperation({ summary: 'List opportunities' })
  opportunities(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listOpportunities(query, p);
  }

  @Post('opportunities')
  @RequirePermissions('erp.crm.opportunity.manage')
  @ApiOperation({ summary: 'Create an opportunity' })
  createOpportunity(@Body() dto: CreateOpportunityDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createOpportunity(dto, p, actorFrom(p, req));
  }

  @Post('opportunities/:id/stage')
  @RequirePermissions('erp.crm.opportunity.manage')
  @ApiOperation({ summary: 'Move an opportunity to another stage' })
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.moveStage(id, dto, p, actorFrom(p, req));
  }

  @Post('opportunities/:id/convert')
  @RequirePermissions('erp.crm.opportunity.convert')
  @ApiOperation({ summary: 'Convert a won opportunity into a sales quotation' })
  convertOpportunity(@Param('id') id: string, @Body() dto: ConvertOpportunityDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.convertOpportunity(id, dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------------- customers
  @Post('customers')
  @RequirePermissions('erp.crm.contact.manage')
  @ApiOperation({ summary: 'Create a customer master record (duplicate-protected)' })
  createCustomer(@Body() dto: CreateCustomerBodyDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createCustomer(dto, p, actorFrom(p, req));
  }

  @Get('customers/:id/contacts')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.contact.manage')
  @ApiOperation({ summary: 'List customer contacts' })
  contacts(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listContacts(id, p);
  }

  @Post('customers/:id/contacts')
  @RequirePermissions('erp.crm.contact.manage')
  @ApiOperation({ summary: 'Add a customer contact' })
  createContact(@Param('id') id: string, @Body() dto: CreateContactDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createContact(id, dto, p, actorFrom(p, req));
  }

  // --------------------------------------------------------------- activities
  @Get('activities')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.activity.manage')
  @ApiOperation({ summary: 'List activities and follow-ups' })
  activities(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listActivities(query, p);
  }

  @Post('activities')
  @RequirePermissions('erp.crm.activity.manage')
  @ApiOperation({ summary: 'Create an activity, follow-up or reminder' })
  createActivity(@Body() dto: CreateActivityDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createActivity(dto, p, actorFrom(p, req));
  }

  @Post('activities/:id/complete')
  @RequirePermissions('erp.crm.activity.manage')
  @ApiOperation({ summary: 'Complete an activity' })
  completeActivity(@Param('id') id: string, @Body() dto: CompleteActivityDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.completeActivity(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------------ tickets
  @Get('sla-policies')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.sla.manage')
  @ApiOperation({ summary: 'List SLA policies' })
  slaPolicies(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listSlaPolicies(query, p);
  }

  @Post('sla-policies')
  @RequirePermissions('erp.crm.sla.manage')
  @ApiOperation({ summary: 'Set the SLA policy for a priority' })
  setSlaPolicy(@Body() dto: CreateSlaDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.setSlaPolicy(dto, p, actorFrom(p, req));
  }

  @Get('tickets')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.ticket.manage')
  @ApiOperation({ summary: 'List support tickets' })
  tickets(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listTickets(query, p);
  }

  @Get('tickets/:id')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.ticket.manage')
  @ApiOperation({ summary: 'Ticket detail with messages' })
  ticket(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.getTicket(id, p);
  }

  @Post('tickets')
  @RequirePermissions('erp.crm.ticket.manage')
  @ApiOperation({ summary: 'Create a support ticket (SLA targets derived from policy)' })
  createTicket(@Body() dto: CreateTicketDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createTicket(dto, p, actorFrom(p, req));
  }

  @Post('tickets/:id/messages')
  @RequirePermissions('erp.crm.ticket.manage')
  @ApiOperation({ summary: 'Add a ticket message' })
  addMessage(@Param('id') id: string, @Body() dto: TicketMessageDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.addTicketMessage(id, dto, p, actorFrom(p, req));
  }

  @Patch('tickets/:id')
  @RequirePermissions('erp.crm.ticket.manage')
  @ApiOperation({ summary: 'Update a ticket status, priority or satisfaction score' })
  updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.updateTicket(id, dto, p, actorFrom(p, req));
  }

  // ----------------------------------------------------------------- segments
  @Get('segments')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.segment.manage')
  @ApiOperation({ summary: 'List customer segments' })
  segments(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.listSegments(query, p);
  }

  @Post('segments')
  @RequirePermissions('erp.crm.segment.manage')
  @ApiOperation({ summary: 'Create a customer segment' })
  createSegment(@Body() dto: CreateSegmentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.createSegment(dto, p, actorFrom(p, req));
  }

  @Post('segments/:id/members')
  @RequirePermissions('erp.crm.segment.manage')
  @ApiOperation({ summary: 'Add a customer to a segment' })
  addMember(@Param('id') id: string, @Body() dto: SegmentMemberDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.crm.addSegmentMember(id, dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------------- reporting
  @Get('dashboard')
  @RequireAnyPermission('erp.crm.read', 'erp.crm.report.read')
  @ApiOperation({ summary: 'CRM dashboard' })
  dashboard(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.crm.crmDashboard(p, companyId);
  }
}
