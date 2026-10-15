import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { OperationsService } from './operations.service';
import {
  AssignWorkOrderDto,
  CreateApprovalDto,
  CreateAttachmentDto,
  CreateCalendarEventDto,
  CreateCommentDto,
  CreateNotificationDto,
  CreateProjectDto,
  CreateTaskDto,
  CreateWorkOrderDto,
  DecideApprovalDto,
  ListQueryDto,
  MarkNotificationReadDto,
  ToggleChecklistDto,
  UpdateProjectDto,
  UpdateTaskDto,
  UpdateWorkOrderDto,
} from './operations.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('operations')
@ApiBearerAuth()
@RequireModule('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly ops: OperationsService) {}

  // --------------------------------------------------------------- projects
  @Get('projects')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.project.manage')
  @ApiOperation({ summary: 'List projects' })
  projects(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listProjects(query, p);
  }

  @Post('projects')
  @RequirePermissions('erp.operations.project.manage')
  @ApiOperation({ summary: 'Create a project' })
  createProject(@Body() dto: CreateProjectDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createProject(dto, p, actorFrom(p, req));
  }

  @Patch('projects/:id')
  @RequirePermissions('erp.operations.project.manage')
  @ApiOperation({ summary: 'Update a project' })
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.updateProject(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------------ tasks
  @Get('tasks')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.task.manage')
  @ApiOperation({ summary: 'List tasks' })
  tasks(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listTasks(query, p);
  }

  @Post('tasks')
  @RequirePermissions('erp.operations.task.manage')
  @ApiOperation({ summary: 'Create a task or subtask' })
  createTask(@Body() dto: CreateTaskDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createTask(dto, p, actorFrom(p, req));
  }

  @Patch('tasks/:id')
  @RequirePermissions('erp.operations.task.manage')
  @ApiOperation({ summary: 'Update a task' })
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.updateTask(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------ work orders
  @Get('work-orders')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.work_order.manage')
  @ApiOperation({ summary: 'List work orders' })
  workOrders(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listWorkOrders(query, p);
  }

  @Get('work-orders/:id')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Work order detail with checklist, comments and approvals' })
  workOrder(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.getWorkOrder(id, p);
  }

  @Post('work-orders')
  @RequirePermissions('erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Create a work order' })
  createWorkOrder(@Body() dto: CreateWorkOrderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createWorkOrder(dto, p, actorFrom(p, req));
  }

  @Post('work-orders/:id/assign')
  @RequirePermissions('erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Assign a work order' })
  assignWorkOrder(@Param('id') id: string, @Body() dto: AssignWorkOrderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.assignWorkOrder(id, dto, p, actorFrom(p, req));
  }

  @Patch('work-orders/:id')
  @RequirePermissions('erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Update a work order (state transitions are enforced)' })
  updateWorkOrder(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.updateWorkOrder(id, dto, p, actorFrom(p, req));
  }

  @Patch('checklist-items/:id')
  @RequirePermissions('erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Complete or reopen a checklist item' })
  toggleChecklist(@Param('id') id: string, @Body() dto: ToggleChecklistDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.toggleChecklist(id, dto.isDone, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- approvals
  @Get('approvals')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.approval.manage')
  @ApiOperation({ summary: 'List approval requests' })
  approvals(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listApprovals(query, p);
  }

  @Post('approvals')
  @RequirePermissions('erp.operations.approval.manage')
  @ApiOperation({ summary: 'Raise an approval request' })
  createApproval(@Body() dto: CreateApprovalDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createApproval(dto, p, actorFrom(p, req));
  }

  @Post('approvals/:id/decide')
  @RequirePermissions('erp.operations.approval.manage')
  @ApiOperation({ summary: 'Approve or reject a request' })
  decideApproval(@Param('id') id: string, @Body() dto: DecideApprovalDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.decideApproval(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------- comments & attachments
  @Get(':entityType/:entityId/comments')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.work_order.manage', 'erp.operations.task.manage')
  @ApiOperation({ summary: 'List comments on an entity' })
  comments(@Param('entityType') entityType: string, @Param('entityId') entityId: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listComments(entityType, entityId, p);
  }

  @Post('comments')
  @RequireAnyPermission('erp.operations.work_order.manage', 'erp.operations.task.manage')
  @ApiOperation({ summary: 'Add a comment' })
  createComment(@Body() dto: CreateCommentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createComment(dto, p, actorFrom(p, req));
  }

  @Get(':entityType/:entityId/attachments')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.work_order.manage', 'erp.operations.task.manage')
  @ApiOperation({ summary: 'List attachments on an entity' })
  attachments(@Param('entityType') entityType: string, @Param('entityId') entityId: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listAttachments(entityType, entityId, p);
  }

  @Post('attachments')
  @RequireAnyPermission('erp.operations.work_order.manage', 'erp.operations.task.manage')
  @ApiOperation({ summary: 'Attach a document reference to an entity' })
  createAttachment(@Body() dto: CreateAttachmentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createAttachment(dto, p, actorFrom(p, req));
  }

  // --------------------------------------------------------------- calendar
  @Get('calendar')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.work_order.manage')
  @ApiOperation({ summary: 'List operational calendar events' })
  calendar(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listCalendar(query, p);
  }

  @Post('calendar')
  @RequirePermissions('erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Create a calendar event' })
  createEvent(@Body() dto: CreateCalendarEventDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createCalendarEvent(dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------- notifications
  @Get('notifications')
  @ApiOperation({ summary: 'List the current user notifications' })
  notifications(@Query('unreadOnly') unreadOnly: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.listNotifications(p, unreadOnly === 'true');
  }

  @Post('notifications/read')
  @ApiOperation({ summary: 'Mark notifications read' })
  markRead(@Body() dto: MarkNotificationReadDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.markNotificationsRead(dto, p);
  }

  @Post('notifications')
  @RequirePermissions('erp.operations.work_order.manage')
  @ApiOperation({ summary: 'Send an internal notification' })
  createNotification(@Body() dto: CreateNotificationDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.ops.createNotification(dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------------- reporting
  @Get('dashboard')
  @RequireAnyPermission('erp.operations.read', 'erp.operations.report.read')
  @ApiOperation({ summary: 'Operations dashboard' })
  dashboard(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.ops.operationsDashboard(p, companyId);
  }
}
