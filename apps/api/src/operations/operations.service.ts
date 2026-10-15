import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
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
  UpdateProjectDto,
  UpdateTaskDto,
  UpdateWorkOrderDto,
} from './operations.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Legal work-order transitions.
 *
 * A work order moves forward through its lifecycle; a completed or cancelled
 * order is terminal. Enforcing the graph here keeps the status honest rather
 * than allowing an arbitrary jump.
 */
const WORK_ORDER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
  ) {}

  // --------------------------------------------------------------- projects

  async listProjects(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' as const } }, { nameEn: { contains: query.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { tasks: true } } } }),
      this.prisma.project.count({ where }),
    ]);
    return { items: rows.map((p) => ({ ...p, taskCount: p._count.tasks })), total, page, pageSize };
  }

  async createProject(dto: CreateProjectDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.project.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Project ${dto.code} already exists.`);
    const project = await this.prisma.project.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        branchId: dto.branchId ?? null,
        departmentId: dto.departmentId ?? null,
        ownerUserId: dto.ownerUserId ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        description: dto.description ?? null,
        createdById: actor.userId,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.project_created', targetType: 'PROJECT', targetId: project.id, summary: `Created project ${project.code}` });
    return project;
  }

  async updateProject(id: string, dto: UpdateProjectDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const project = await this.prisma.project.findFirst({ where: { id, companyId } });
    if (!project) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Project not found.');
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.project_updated', targetType: 'PROJECT', targetId: id, summary: `Updated project ${updated.code}` });
    return updated;
  }

  // ------------------------------------------------------------------ tasks

  async listTasks(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.assigneeUserId ? { assigneeUserId: query.assigneeUserId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.projectTask.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.projectTask.count({ where }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  async createTask(dto: CreateTaskDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    if (dto.projectId) await this.assertProject(companyId, dto.projectId);
    const task = await this.prisma.projectTask.create({
      data: {
        companyId,
        projectId: dto.projectId ?? null,
        parentTaskId: dto.parentTaskId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        priority: (dto.priority as never) ?? 'NORMAL',
        assigneeUserId: dto.assigneeUserId ?? null,
        branchId: dto.branchId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: actor.userId,
      },
    });
    if (dto.assigneeUserId) await this.notify(companyId, dto.assigneeUserId, 'TASK', `Task assigned: ${task.title}`, 'PROJECT_TASK', task.id);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.task_created', targetType: 'PROJECT_TASK', targetId: task.id, summary: `Created task ${task.title}` });
    return task;
  }

  async updateTask(id: string, dto: UpdateTaskDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const task = await this.prisma.projectTask.findFirst({ where: { id, companyId } });
    if (!task) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Task not found.');
    const updated = await this.prisma.projectTask.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as never } : {}),
        ...(dto.assigneeUserId !== undefined ? { assigneeUserId: dto.assigneeUserId } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.status === 'DONE' ? { completedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.task_updated', targetType: 'PROJECT_TASK', targetId: id, summary: `Updated task ${updated.title}` });
    return updated;
  }

  // ------------------------------------------------------------- work orders

  async listWorkOrders(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.assigneeUserId ? { assigneeUserId: query.assigneeUserId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { checklist: { orderBy: { sortOrder: 'asc' } } } }),
      this.prisma.workOrder.count({ where }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  async getWorkOrder(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const order = await this.prisma.workOrder.findFirst({
      where: { id, companyId },
      include: { checklist: { orderBy: { sortOrder: 'asc' } }, department: { select: { nameEn: true, nameAr: true } } },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Work order not found.');
    const [comments, attachments, approvals] = await Promise.all([
      this.prisma.entityComment.findMany({ where: { companyId, entityType: 'WORK_ORDER', entityId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.entityAttachment.findMany({ where: { companyId, entityType: 'WORK_ORDER', entityId: id } }),
      this.prisma.approvalRequest.findMany({ where: { companyId, entityType: 'WORK_ORDER', entityId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { ...order, comments, attachments, approvals };
  }

  async createWorkOrder(dto: CreateWorkOrderDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const order = await this.posting.withTransaction(async (tx) => {
      const orderNumber = await this.sequences.next(tx, companyId, 'workOrder');
      return tx.workOrder.create({
        data: {
          companyId,
          orderNumber,
          title: dto.title,
          description: dto.description ?? null,
          type: dto.type ?? 'GENERAL',
          branchId: dto.branchId ?? null,
          departmentId: dto.departmentId ?? null,
          projectId: dto.projectId ?? null,
          status: dto.assigneeUserId ? 'ASSIGNED' : 'OPEN',
          priority: (dto.priority as never) ?? 'NORMAL',
          assigneeUserId: dto.assigneeUserId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          sourceType: dto.sourceType ?? null,
          sourceId: dto.sourceId ?? null,
          createdById: actor.userId,
          checklist: dto.checklist && dto.checklist.length > 0
            ? { create: dto.checklist.map((c, i) => ({ companyId, label: c.label, sortOrder: i })) }
            : undefined,
        },
        include: { checklist: true },
      });
    });
    if (dto.assigneeUserId) await this.notify(companyId, dto.assigneeUserId, 'TASK', `Work order assigned: ${order.title}`, 'WORK_ORDER', order.id);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.work_order_created', targetType: 'WORK_ORDER', targetId: order.id, summary: `Created work order ${order.orderNumber}` });
    return order;
  }

  async assignWorkOrder(id: string, dto: AssignWorkOrderDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const order = await this.prisma.workOrder.findFirst({ where: { id, companyId } });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Work order not found.');
    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.assigneeUserId !== undefined ? { assigneeUserId: dto.assigneeUserId } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(order.status === 'DRAFT' || order.status === 'OPEN' ? { status: 'ASSIGNED' } : {}),
      },
    });
    if (dto.assigneeUserId) await this.notify(companyId, dto.assigneeUserId, 'TASK', `Work order assigned: ${updated.title}`, 'WORK_ORDER', id);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.work_order_assigned', targetType: 'WORK_ORDER', targetId: id, summary: `Assigned work order ${updated.orderNumber}` });
    return updated;
  }

  /** Change a work order's status, enforcing the transition graph. */
  async updateWorkOrder(id: string, dto: UpdateWorkOrderDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const order = await this.prisma.workOrder.findFirst({ where: { id, companyId } });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Work order not found.');

    if (dto.status && dto.status !== order.status) {
      const allowed = WORK_ORDER_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw badRequest(ERROR_CODES.JOB_CARD_STATE, `Cannot move a work order from ${order.status} to ${dto.status}.`, { from: order.status, to: dto.status, allowed });
      }
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as never } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.status === 'IN_PROGRESS' && !order.startedAt ? { startedAt: new Date() } : {}),
        ...(dto.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.work_order_updated', targetType: 'WORK_ORDER', targetId: id, summary: `Work order ${updated.orderNumber} -> ${updated.status}` });
    return updated;
  }

  async toggleChecklist(itemId: string, isDone: boolean, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const item = await this.prisma.workOrderChecklistItem.findFirst({ where: { id: itemId, companyId } });
    if (!item) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Checklist item not found.');
    const updated = await this.prisma.workOrderChecklistItem.update({ where: { id: itemId }, data: { isDone, doneAt: isDone ? new Date() : null } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.checklist_item_updated', targetType: 'WORK_ORDER_CHECKLIST_ITEM', targetId: itemId, summary: `Checklist item ${isDone ? 'completed' : 'reopened'}` });
    return updated;
  }

  // -------------------------------------------------------------- approvals

  async listApprovals(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.approvalRequest.findMany({ where: { companyId, ...(query.status ? { status: query.status as never } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createApproval(dto: CreateApprovalDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const approval = await this.prisma.approvalRequest.create({
      data: { companyId, entityType: dto.entityType, entityId: dto.entityId, requestedById: actor.userId, approverUserId: dto.approverUserId ?? null, note: dto.note ?? null },
    });
    if (dto.approverUserId) await this.notify(companyId, dto.approverUserId, 'APPROVAL', `Approval requested for ${dto.entityType}`, dto.entityType, dto.entityId);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.approval_requested', targetType: 'APPROVAL_REQUEST', targetId: approval.id, summary: `Approval requested for ${dto.entityType}` });
    return approval;
  }

  async decideApproval(id: string, dto: DecideApprovalDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const approval = await this.prisma.approvalRequest.findFirst({ where: { id, companyId } });
    if (!approval) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Approval not found.');
    if (approval.status !== 'PENDING') throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'This approval has already been decided.');
    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: dto.decision as never, decidedAt: new Date(), note: dto.note ?? approval.note },
    });
    await this.notify(companyId, approval.requestedById, 'APPROVAL', `Approval ${dto.decision.toLowerCase()}`, approval.entityType, approval.entityId);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.approval_decided', targetType: 'APPROVAL_REQUEST', targetId: id, summary: `Approval ${dto.decision.toLowerCase()}` });
    return updated;
  }

  // ------------------------------------------------ comments & attachments

  async listComments(entityType: string, entityId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const rows = await this.prisma.entityComment.findMany({ where: { companyId, entityType, entityId }, orderBy: { createdAt: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createComment(dto: CreateCommentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const comment = await this.prisma.entityComment.create({ data: { companyId, entityType: dto.entityType, entityId: dto.entityId, authorUserId: actor.userId, body: dto.body } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.comment_added', targetType: dto.entityType, targetId: dto.entityId, summary: 'Added a comment' });
    return comment;
  }

  async listAttachments(entityType: string, entityId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const rows = await this.prisma.entityAttachment.findMany({ where: { companyId, entityType, entityId }, orderBy: { createdAt: 'desc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createAttachment(dto: CreateAttachmentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const attachment = await this.prisma.entityAttachment.create({
      data: { companyId, entityType: dto.entityType, entityId: dto.entityId, fileName: dto.fileName, mimeType: dto.mimeType ?? null, sizeBytes: dto.sizeBytes ?? 0, storageRef: dto.storageRef ?? null, uploadedById: actor.userId },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.attachment_added', targetType: dto.entityType, targetId: dto.entityId, summary: `Attached ${dto.fileName}` });
    return attachment;
  }

  // --------------------------------------------------------------- calendar

  async listCalendar(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.operationalCalendarEvent.findMany({
      where: { companyId, ...(query.branchId ? { branchId: query.branchId } : {}) },
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createCalendarEvent(dto: CreateCalendarEventDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (end < start) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Event end must not precede its start.');
    const event = await this.prisma.operationalCalendarEvent.create({
      data: { companyId, branchId: dto.branchId ?? null, title: dto.title, description: dto.description ?? null, startAt: start, endAt: end, allDay: dto.allDay ?? false, entityType: dto.entityType ?? null, entityId: dto.entityId ?? null, createdById: actor.userId },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.calendar_event_created', targetType: 'CALENDAR_EVENT', targetId: event.id, summary: `Created calendar event ${event.title}` });
    return event;
  }

  // ---------------------------------------------------------- notifications

  async listNotifications(principal: RequestPrincipal, unreadOnly = false) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const rows = await this.prisma.notification.findMany({
      where: { companyId, userId: principal.userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async markNotificationsRead(dto: MarkNotificationReadDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const where = { companyId, userId: principal.userId, readAt: null, ...(dto.all ? {} : {}) };
    const result = await this.prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  async createNotification(dto: CreateNotificationDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const notification = await this.notify(companyId, dto.userId, (dto.type as never) ?? 'INFO', dto.title, dto.entityType, dto.entityId, dto.body);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'operations.notification_sent', targetType: 'NOTIFICATION', targetId: notification.id, summary: `Sent notification: ${dto.title}` });
    return notification;
  }

  // --------------------------------------------------------------- reporting

  async operationsDashboard(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const [projects, activeProjects, tasks, openTasks, overdueTasks, workOrders, byStatus, openApprovals, dueEvents] = await Promise.all([
      this.prisma.project.count({ where: { companyId } }),
      this.prisma.project.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.projectTask.count({ where: { companyId } }),
      this.prisma.projectTask.count({ where: { companyId, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } } }),
      this.prisma.projectTask.count({ where: { companyId, dueDate: { lt: new Date() }, status: { notIn: ['DONE', 'CANCELLED'] } } }),
      this.prisma.workOrder.count({ where: { companyId } }),
      this.prisma.workOrder.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.prisma.approvalRequest.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.operationalCalendarEvent.count({ where: { companyId, startAt: { gte: new Date() } } }),
    ]);
    return {
      totalProjects: projects,
      activeProjects,
      totalTasks: tasks,
      openTasks,
      overdueTasks,
      totalWorkOrders: workOrders,
      workOrdersByStatus: byStatus.map((g) => ({ status: g.status, count: g._count })),
      pendingApprovals: openApprovals,
      upcomingEvents: dueEvents,
    };
  }

  // ----------------------------------------------------------------- helpers

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Project not found in this company.');
  }

  /** Persist an internal notification. No external provider is claimed. */
  private async notify(
    companyId: string,
    userId: string,
    type: 'INFO' | 'TASK' | 'APPROVAL' | 'ALERT',
    title: string,
    entityType?: string,
    entityId?: string,
    body?: string,
  ) {
    return this.prisma.notification.create({
      data: { companyId, userId, type, title, body: body ?? null, entityType: entityType ?? null, entityId: entityId ?? null },
    });
  }
}
