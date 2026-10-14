import { Injectable } from '@nestjs/common';
import { fromMinor, sumMinor } from '@oryx/shared';
import type { Prisma } from '@oryx/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService, SYSTEM_ROLES } from '../common/accounting-posting.service';
import { DocumentSequenceService, type Tx } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { computePayslip, leaveDaysBetween, type SalaryComponentInput } from './payroll-calculator';
import type {
  AdjustBalanceDto,
  CreateAdvanceDto,
  CreateContractDto,
  CreateDepartmentDto,
  CreateDocumentDto,
  CreateEmployeeDto,
  CreateJobTitleDto,
  CreateLeaveTypeDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  CreateSalaryStructureDto,
  CreateShiftDto,
  DecideLeaveDto,
  ListQueryDto,
  RecordAttendanceDto,
  RequestLeaveDto,
  SettleAdvanceDto,
  StartLifecycleDto,
  UpdateEmployeeDto,
} from './hr.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Default onboarding checklist created for a new employee. */
const ONBOARDING_ITEMS = [
  'Signed employment contract on file',
  'Identity documents verified',
  'Bank details recorded',
  'Workstation and access issued',
  'Salary structure configured',
];

const OFFBOARDING_ITEMS = [
  'Notice period served',
  'Company assets returned',
  'Access revoked',
  'Final settlement prepared',
];

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
  ) {}

  // ------------------------------------------------------------ departments

  async listDepartments(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.department.findMany({
      where: { companyId, ...(query.search ? { nameEn: { contains: query.search, mode: 'insensitive' as const } } : {}) },
      orderBy: { code: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
    return { items: rows.map((d) => ({ ...d, employeeCount: d._count.employees })), total: rows.length, page: 1, pageSize: rows.length };
  }

  async createDepartment(dto: CreateDepartmentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.department.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Department code ${dto.code} already exists.`);
    const dept = await this.prisma.department.create({
      data: { companyId, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr, parentId: dto.parentId ?? null, branchId: dto.branchId ?? null },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.department_created', targetType: 'DEPARTMENT', targetId: dept.id, summary: `Created department ${dept.code}` });
    return dept;
  }

  async listJobTitles(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.jobTitle.findMany({ where: { companyId }, orderBy: { code: 'asc' }, include: { department: { select: { nameEn: true, nameAr: true } } } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createJobTitle(dto: CreateJobTitleDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.jobTitle.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Job title code ${dto.code} already exists.`);
    const title = await this.prisma.jobTitle.create({ data: { companyId, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr, departmentId: dto.departmentId ?? null } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.job_title_created', targetType: 'JOB_TITLE', targetId: title.id, summary: `Created job title ${title.code}` });
    return title;
  }

  // -------------------------------------------------------------- employees

  async listEmployees(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { fullNameEn: { contains: query.search, mode: 'insensitive' as const } },
              { fullNameAr: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          department: { select: { nameEn: true, nameAr: true } },
          jobTitle: { select: { nameEn: true, nameAr: true } },
          manager: { select: { fullNameEn: true } },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: rows.map(toEmployeeDto), total, page, pageSize };
  }

  async getEmployee(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        department: true,
        jobTitle: true,
        manager: { select: { fullNameEn: true, code: true } },
        contracts: { orderBy: { startDate: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        lifecycle: { include: { items: true }, orderBy: { startedAt: 'desc' } },
        leaveBalances: { include: { leaveType: true } },
        salaryStructures: { include: { components: true }, orderBy: { effectiveFrom: 'desc' } },
        advances: { orderBy: { issuedAt: 'desc' } },
      },
    });
    if (!employee) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee not found.');
    return toEmployeeDetailDto(employee);
  }

  async createEmployee(dto: CreateEmployeeDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.employee.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Employee code ${dto.code} already exists.`);
    if (dto.managerId) await this.assertEmployee(companyId, dto.managerId);

    const employee = await this.posting.withTransaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          companyId,
          code: dto.code,
          fullNameEn: dto.fullNameEn,
          fullNameAr: dto.fullNameAr,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          nationalId: dto.nationalId ?? null,
          departmentId: dto.departmentId ?? null,
          jobTitleId: dto.jobTitleId ?? null,
          branchId: dto.branchId ?? null,
          managerId: dto.managerId ?? null,
          hireDate: new Date(dto.hireDate),
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender ?? null,
          addressLine: dto.addressLine ?? null,
          notes: dto.notes ?? null,
        },
      });
      // Seed an onboarding checklist so the workflow is ready to run.
      await tx.employeeLifecycle.create({
        data: {
          companyId,
          employeeId: created.id,
          type: 'ONBOARDING',
          status: 'OPEN',
          items: { create: ONBOARDING_ITEMS.map((label, i) => ({ label, sortOrder: i })) },
        },
      });
      return created;
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.employee_created', targetType: 'EMPLOYEE', targetId: employee.id, summary: `Created employee ${employee.code} ${employee.fullNameEn}` });
    return this.getEmployee(employee.id, principal);
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.prisma.employee.findFirst({ where: { id, companyId } });
    if (!employee) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee not found.');
    if (dto.managerId) {
      if (dto.managerId === id) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'An employee cannot report to itself.');
      await this.assertEmployee(companyId, dto.managerId);
    }
    await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.fullNameEn !== undefined ? { fullNameEn: dto.fullNameEn } : {}),
        ...(dto.fullNameAr !== undefined ? { fullNameAr: dto.fullNameAr } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.jobTitleId !== undefined ? { jobTitleId: dto.jobTitleId } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
        ...(dto.terminationDate !== undefined ? { terminationDate: new Date(dto.terminationDate) } : {}),
        ...(dto.addressLine !== undefined ? { addressLine: dto.addressLine } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.employee_updated', targetType: 'EMPLOYEE', targetId: id, summary: `Updated employee ${employee.code}` });
    return this.getEmployee(id, principal);
  }

  // -------------------------------------------------------------- contracts

  async createContract(employeeId: string, dto: CreateContractDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const dup = await this.prisma.employmentContract.findUnique({ where: { companyId_contractNumber: { companyId, contractNumber: dto.contractNumber } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Contract number ${dto.contractNumber} already exists.`);
    const contract = await this.prisma.employmentContract.create({
      data: {
        companyId,
        employeeId,
        contractNumber: dto.contractNumber,
        type: (dto.type as never) ?? 'PERMANENT',
        status: 'ACTIVE',
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        baseSalaryMinor: dto.baseSalaryMinor,
        currency: dto.currency ?? 'SAR',
        probationDays: dto.probationDays ?? 0,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.contract_created', targetType: 'EMPLOYMENT_CONTRACT', targetId: contract.id, summary: `Created contract ${contract.contractNumber}` });
    return contract;
  }

  // -------------------------------------------------------------- documents

  async listDocuments(employeeId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    // Confidential documents are only visible with the explicit permission.
    const canSeeConfidential = principal.grantedPermissions.includes('erp.hr.document.confidential');
    const rows = await this.prisma.employeeDocument.findMany({
      where: { companyId, employeeId, ...(canSeeConfidential ? {} : { isConfidential: false }) },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createDocument(employeeId: string, dto: CreateDocumentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const doc = await this.prisma.employeeDocument.create({
      data: {
        companyId,
        employeeId,
        category: dto.category as never,
        title: dto.title,
        fileRef: dto.fileRef ?? null,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isConfidential: dto.isConfidential ?? false,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.document_created', targetType: 'EMPLOYEE_DOCUMENT', targetId: doc.id, summary: `Added document ${doc.title} for employee` });
    return doc;
  }

  // -------------------------------------------------------------- lifecycle

  async startLifecycle(employeeId: string, dto: StartLifecycleDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const items = dto.type === 'ONBOARDING' ? ONBOARDING_ITEMS : OFFBOARDING_ITEMS;
    const lifecycle = await this.prisma.employeeLifecycle.create({
      data: {
        companyId,
        employeeId,
        type: dto.type as never,
        status: 'OPEN',
        notes: dto.notes ?? null,
        items: { create: items.map((label, i) => ({ label, sortOrder: i })) },
      },
      include: { items: true },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.lifecycle_started', targetType: 'EMPLOYEE_LIFECYCLE', targetId: lifecycle.id, summary: `Started ${dto.type.toLowerCase()} for employee` });
    return lifecycle;
  }

  async toggleLifecycleItem(itemId: string, isDone: boolean, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const item = await this.prisma.employeeLifecycleItem.findFirst({ where: { id: itemId, lifecycle: { companyId } } });
    if (!item) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Checklist item not found.');
    const updated = await this.prisma.employeeLifecycleItem.update({
      where: { id: itemId },
      data: { isDone, doneAt: isDone ? new Date() : null },
    });
    // Auto-complete the lifecycle when every item is done.
    const remaining = await this.prisma.employeeLifecycleItem.count({ where: { lifecycleId: item.lifecycleId, isDone: false } });
    if (remaining === 0) {
      await this.prisma.employeeLifecycle.update({ where: { id: item.lifecycleId }, data: { status: 'COMPLETED', completedAt: new Date() } });
    }
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.lifecycle_item_updated', targetType: 'EMPLOYEE_LIFECYCLE_ITEM', targetId: itemId, summary: `Checklist item ${isDone ? 'completed' : 'reopened'}` });
    return updated;
  }

  // ------------------------------------------------------------------ leave

  async listLeaveTypes(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.leaveType.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createLeaveType(dto: CreateLeaveTypeDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.leaveType.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Leave type ${dto.code} already exists.`);
    const type = await this.prisma.leaveType.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        annualEntitlementDays: dto.annualEntitlementDays ?? 0,
        isPaid: dto.isPaid ?? true,
        requiresApproval: dto.requiresApproval ?? true,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.leave_type_created', targetType: 'LEAVE_TYPE', targetId: type.id, summary: `Created leave type ${type.code}` });
    return type;
  }

  async adjustBalance(dto: AdjustBalanceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const balance = await this.prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, year: dto.year } },
      create: {
        companyId,
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        year: dto.year,
        entitledDays: dto.entitledDays ?? 0,
        accruedDays: dto.accruedDays ?? 0,
      },
      update: {
        ...(dto.entitledDays !== undefined ? { entitledDays: dto.entitledDays } : {}),
        ...(dto.accruedDays !== undefined ? { accruedDays: dto.accruedDays } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.leave_balance_adjusted', targetType: 'LEAVE_BALANCE', targetId: balance.id, summary: `Adjusted leave balance for ${dto.year}` });
    return balance;
  }

  async listLeaveRequests(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.leaveRequest.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true } }, leaveType: { select: { nameEn: true, nameAr: true } } },
    });
    return { items: rows.map(toLeaveRequestDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /**
   * Submit a leave request.
   *
   * Balance is checked against entitled + accrued − used − pending, so two
   * pending requests cannot both consume the same remaining days.
   */
  async requestLeave(dto: RequestLeaveDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'End date must not precede the start date.');
    const days = leaveDaysBetween(start, end);
    const year = start.getUTCFullYear();

    const request = await this.posting.withTransaction(async (tx) => {
      // Reject an overlapping request for the same employee.
      const overlap = await tx.leaveRequest.findFirst({
        where: {
          companyId,
          employeeId: dto.employeeId,
          status: { in: ['SUBMITTED', 'APPROVED'] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (overlap) throw conflict(ERROR_CODES.LEAVE_OVERLAP, 'An overlapping leave request already exists.');

      const balance = await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, year } },
        create: { companyId, employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, year },
        update: {},
      });
      const available = balance.entitledDays + balance.accruedDays - balance.usedDays - balance.pendingDays;
      if (days > available) {
        throw forbidden(
          ERROR_CODES.LEAVE_INSUFFICIENT_BALANCE,
          `Insufficient leave balance: requested ${fromMinor(days, 2)} days, available ${fromMinor(available, 2)}.`,
          { requested: days, available },
        );
      }

      const created = await tx.leaveRequest.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate: start,
          endDate: end,
          days,
          status: 'SUBMITTED',
          reason: dto.reason ?? null,
        },
      });
      // Reserve the days so they cannot be double-booked.
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { pendingDays: { increment: days } } });
      return created;
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.leave_requested', targetType: 'LEAVE_REQUEST', targetId: request.id, summary: `Leave requested for ${fromMinor(days, 2)} days` });
    return request;
  }

  /** Approve or reject a pending request, moving days between pending and used. */
  async decideLeave(requestId: string, dto: DecideLeaveDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const request = await tx.leaveRequest.findFirst({ where: { id: requestId, companyId } });
      if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Leave request not found.');
      if (request.status !== 'SUBMITTED') throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only a submitted request can be decided.');
      const year = request.startDate.getUTCFullYear();
      const balance = await tx.leaveBalance.findUniqueOrThrow({
        where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
      });
      const approved = dto.decision === 'APPROVED';
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pendingDays: { decrement: request.days },
          ...(approved ? { usedDays: { increment: request.days } } : {}),
        },
      });
      return tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: approved ? 'APPROVED' : 'REJECTED', approvedById: actor.userId, decidedAt: new Date(), decisionNote: dto.note ?? null },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.leave_decided', targetType: 'LEAVE_REQUEST', targetId: requestId, summary: `Leave ${dto.decision.toLowerCase()}` });
    return result;
  }

  // ------------------------------------------------------------- attendance

  async listShifts(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.shift.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createShift(dto: CreateShiftDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.shift.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Shift ${dto.code} already exists.`);
    const shift = await this.prisma.shift.create({ data: { companyId, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr, startTime: dto.startTime, endTime: dto.endTime, breakMinutes: dto.breakMinutes ?? 0 } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.shift_created', targetType: 'SHIFT', targetId: shift.id, summary: `Created shift ${shift.code}` });
    return shift;
  }

  async listAttendance(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { companyId, ...(query.branchId ? { employee: { branchId: query.branchId } } : {}) },
      orderBy: { workDate: 'desc' },
      take: 200,
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true } } },
    });
    return { items: rows.map(toAttendanceDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /** Record (or update) one day of attendance for an employee. */
  async recordAttendance(dto: RecordAttendanceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const workDate = new Date(dto.workDate);
    const checkIn = dto.checkInAt ? new Date(dto.checkInAt) : null;
    const checkOut = dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    const workedMinutes = checkIn && checkOut ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60000)) : 0;

    const record = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate } },
      create: {
        companyId,
        employeeId: dto.employeeId,
        shiftId: dto.shiftId ?? null,
        workDate,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        workedMinutes,
        overtimeMinutes: dto.overtimeMinutes ?? 0,
        status: (dto.status as never) ?? 'PRESENT',
        notes: dto.notes ?? null,
      },
      update: {
        shiftId: dto.shiftId ?? null,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        workedMinutes,
        overtimeMinutes: dto.overtimeMinutes ?? 0,
        ...(dto.status ? { status: dto.status as never } : {}),
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_recorded', targetType: 'ATTENDANCE_RECORD', targetId: record.id, summary: `Attendance recorded for ${workDate.toISOString().slice(0, 10)}` });
    return record;
  }

  // --------------------------------------------------------- salary structure

  async createSalaryStructure(dto: CreateSalaryStructureDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const structure = await this.posting.withTransaction(async (tx) => {
      // Supersede the previous active structure rather than editing it, so
      // historical payroll results stay intact.
      await tx.salaryStructure.updateMany({
        where: { companyId, employeeId: dto.employeeId, isActive: true },
        data: { isActive: false },
      });
      return tx.salaryStructure.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          effectiveFrom: new Date(dto.effectiveFrom),
          basicMinor: dto.basicMinor,
          currency: dto.currency ?? 'SAR',
          notes: dto.notes ?? null,
          components: {
            create: dto.components.map((c, i) => ({
              companyId,
              type: c.type as never,
              code: c.code,
              nameEn: c.nameEn,
              nameAr: c.nameAr,
              amountMinor: c.amountMinor ?? 0,
              isPercentage: c.isPercentage ?? false,
              percentBp: c.percentBp ?? 0,
              sortOrder: i,
            })),
          },
        },
        include: { components: true },
      });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.salary_structure_created', targetType: 'SALARY_STRUCTURE', targetId: structure.id, summary: `Created salary structure effective ${dto.effectiveFrom.slice(0, 10)}` });
    return structure;
  }

  // ---------------------------------------------------------------- payroll

  async listPayrollPeriods(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.payrollPeriod.findMany({ where: { companyId }, orderBy: { startDate: 'desc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createPayrollPeriod(dto: CreatePayrollPeriodDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.payrollPeriod.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Payroll period ${dto.code} already exists.`);
    const period = await this.prisma.payrollPeriod.create({
      data: { companyId, code: dto.code, nameEn: dto.nameEn, nameAr: dto.nameAr, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.payroll_period_created', targetType: 'PAYROLL_PERIOD', targetId: period.id, summary: `Created payroll period ${period.code}` });
    return period;
  }

  async listPayrollRuns(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.payrollRun.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { period: { select: { code: true, nameEn: true, nameAr: true } }, _count: { select: { payslips: true } } },
    });
    return { items: rows.map(toPayrollRunDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  async getPayrollRun(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, companyId },
      include: { period: true, payslips: { include: { lines: true }, orderBy: { employeeCode: 'asc' } } },
    });
    if (!run) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll run not found.');
    return toPayrollRunDetailDto(run);
  }

  /**
   * Create and calculate a payroll run for a period.
   *
   * Every active employee with an effective salary structure on the period end
   * date gets a payslip. The result is a **snapshot**: the structure and its
   * components are copied into the payslip, so editing a salary later never
   * changes a historical run.
   */
  async createPayrollRun(dto: CreatePayrollRunDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const period = await this.prisma.payrollPeriod.findFirst({ where: { id: dto.periodId, companyId } });
    if (!period) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll period not found.');
    if (period.status !== 'OPEN') throw forbidden(ERROR_CODES.PAYROLL_PERIOD_LOCKED, 'The payroll period is not open.');

    const employees = await this.prisma.employee.findMany({
      where: { companyId, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      include: {
        salaryStructures: { where: { isActive: true }, include: { components: true } },
        advances: { where: { status: { in: ['OPEN', 'PARTIALLY_SETTLED'] } } },
        attendance: { where: { workDate: { gte: period.startDate, lte: period.endDate } } },
      },
    });
    if (employees.length === 0) throw badRequest(ERROR_CODES.PAYROLL_NO_EMPLOYEES, 'No active employees with a salary structure.');

    const result = await this.posting.withTransaction(async (tx) => {
      const runNumber = await this.sequences.next(tx, companyId, 'payrollRun');
      const run = await tx.payrollRun.create({
        data: { companyId, periodId: period.id, runNumber, status: 'DRAFT', currency: 'SAR', createdById: actor.userId, notes: dto.notes ?? null },
      });

      let gross = 0;
      let allowances = 0;
      let deductions = 0;
      let net = 0;
      let count = 0;

      for (const employee of employees) {
        const structure = employee.salaryStructures[0];
        if (!structure) continue;

        const components: SalaryComponentInput[] = structure.components.map((c) => ({
          type: c.type as 'ALLOWANCE' | 'DEDUCTION',
          code: c.code,
          nameEn: c.nameEn,
          nameAr: c.nameAr,
          amountMinor: c.amountMinor,
          isPercentage: c.isPercentage,
          percentBp: c.percentBp,
          sortOrder: c.sortOrder,
        }));

        const overtimeMinutes = sumMinor(employee.attendance.map((a) => a.overtimeMinutes));
        // Overtime hours are hundredths: minutes / 60 * 100 = minutes * 5 / 3.
        const overtimeHours = Math.round((overtimeMinutes * 100) / 60);

        // One outstanding advance is settled per run, evenly across instalments.
        const advance = employee.advances[0];
        const advanceDeduction = advance
          ? Math.min(
              Math.ceil((advance.amountMinor - advance.settledMinor) / Math.max(1, advance.installments)),
              advance.amountMinor - advance.settledMinor,
            )
          : 0;

        const slip = computePayslip({
          basicMinor: structure.basicMinor,
          components,
          overtimeHours,
          overtimeMultiplierBp: dto.overtimeMultiplierBp ?? 10000,
          advanceDeductionMinor: advanceDeduction,
        });

        const payslip = await tx.payslip.create({
          data: {
            companyId,
            payrollRunId: run.id,
            employeeId: employee.id,
            employeeCode: employee.code,
            employeeNameEn: employee.fullNameEn,
            employeeNameAr: employee.fullNameAr,
            basicMinor: slip.basicMinor,
            allowancesMinor: slip.allowancesMinor,
            deductionsMinor: slip.deductionsMinor,
            grossMinor: slip.grossMinor,
            netMinor: slip.netMinor,
            currency: structure.currency,
            advanceDeductionMinor: advanceDeduction,
            snapshot: {
              structureId: structure.id,
              effectiveFrom: structure.effectiveFrom.toISOString(),
              basicMinor: structure.basicMinor,
              components: components as unknown as Prisma.InputJsonValue,
              overtimeHours,
              advanceDeductionMinor: advanceDeduction,
            },
            lines: { create: slip.lines.map((l) => ({ type: l.type as never, code: l.code, nameEn: l.nameEn, nameAr: l.nameAr, amountMinor: l.amountMinor, sortOrder: l.sortOrder })) },
          },
        });

        // Settle the advance inside the same transaction.
        if (advance && advanceDeduction > 0) {
          const settled = advance.settledMinor + advanceDeduction;
          await tx.advanceSettlement.create({ data: { companyId, advanceId: advance.id, payrollRunId: run.id, amountMinor: advanceDeduction, note: `Payroll ${runNumber}` } });
          await tx.employeeAdvance.update({
            where: { id: advance.id },
            data: { settledMinor: settled, status: settled >= advance.amountMinor ? 'SETTLED' : 'PARTIALLY_SETTLED' },
          });
        }

        gross += slip.grossMinor;
        allowances += slip.allowancesMinor;
        deductions += slip.deductionsMinor;
        net += slip.netMinor;
        count += 1;
        void payslip;
      }

      if (count === 0) throw badRequest(ERROR_CODES.PAYROLL_NO_EMPLOYEES, 'No employee has an active salary structure.');

      return tx.payrollRun.update({
        where: { id: run.id },
        data: { employeeCount: count, grossMinor: gross, allowancesMinor: allowances, deductionsMinor: deductions, netMinor: net },
        include: { period: true, payslips: { include: { lines: true } } },
      });
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.payroll_run_created', targetType: 'PAYROLL_RUN', targetId: result.id, summary: `Calculated payroll ${result.runNumber} for ${result.employeeCount} employees` });
    return toPayrollRunDetailDto(result);
  }

  /**
   * Approve and post a payroll run to the ledger.
   *
   * The entry is:
   *   Dr Salaries and wages expense   (gross)
   *   Cr Salaries payable             (net)
   *   Cr Payroll deductions payable   (deductions excluding advance settlement)
   *   Cr Employee advances receivable (advance settlement)
   *
   * Posting is idempotent (one journal per run via the source key) and atomic
   * (the status change and the journal commit together), so a retried approval
   * can never double-post.
   */
  async approvePayrollRun(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id, companyId }, include: { period: true, payslips: true } });
      if (!run) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll run not found.');
      if (run.status === 'POSTED' || run.status === 'LOCKED') throw badRequest(ERROR_CODES.PAYROLL_ALREADY_POSTED, 'This payroll run is already posted.');
      if (run.status === 'APPROVED') throw badRequest(ERROR_CODES.PAYROLL_ALREADY_APPROVED, 'This payroll run is already approved.');
      if (run.period.status !== 'OPEN') throw forbidden(ERROR_CODES.PAYROLL_PERIOD_LOCKED, 'The payroll period is not open.');

      const salariesExpense = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.SALARIES_EXPENSE);
      const wagesPayable = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.WAGES_PAYABLE);
      const advanceReceivable = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.EMPLOYEE_ADVANCE);
      const deductionsPayable = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.PAYROLL_DEDUCTIONS);

      const advanceTotal = sumMinor(run.payslips.map((p) => p.advanceDeductionMinor));
      const otherDeductions = run.deductionsMinor - advanceTotal;

      const lines = [
        { accountId: salariesExpense, debit: run.grossMinor },
        ...(run.netMinor > 0 ? [{ accountId: wagesPayable, credit: run.netMinor }] : []),
        ...(otherDeductions > 0 ? [{ accountId: deductionsPayable, credit: otherDeductions }] : []),
        ...(advanceTotal > 0 ? [{ accountId: advanceReceivable, credit: advanceTotal }] : []),
      ];

      const journal = await this.posting.postJournal(tx, {
        companyId,
        entryDate: run.period.endDate,
        memo: `Payroll ${run.runNumber}`,
        sourceType: 'MANUAL',
        // The run id makes the posting idempotent: a retried approval cannot
        // create a second journal for the same run.
        sourceId: `payroll:${run.id}`,
        actorUserId: actor.userId,
        lines,
      });

      await tx.payrollRun.update({
        where: { id },
        data: { status: 'POSTED', journalEntryId: journal.id, approvedById: actor.userId, approvedAt: new Date(), postedAt: new Date() },
      });
      return { id, runNumber: run.runNumber, journalEntryId: journal.id, status: 'POSTED', grossMinor: run.grossMinor, netMinor: run.netMinor };
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.payroll_posted', targetType: 'PAYROLL_RUN', targetId: id, summary: `Posted payroll ${result.runNumber} to the ledger` });
    return result;
  }

  /** Lock a posted run and close its period. Historical results become immutable. */
  async lockPayrollRun(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const run = await this.prisma.payrollRun.findFirst({ where: { id, companyId } });
    if (!run) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll run not found.');
    if (run.status !== 'POSTED') throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only a posted run can be locked.');
    await this.prisma.$transaction([
      this.prisma.payrollRun.update({ where: { id }, data: { status: 'LOCKED' } }),
      this.prisma.payrollPeriod.update({ where: { id: run.periodId }, data: { status: 'LOCKED', closedAt: new Date(), closedByUserId: actor.userId } }),
    ]);
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.payroll_locked', targetType: 'PAYROLL_RUN', targetId: id, summary: `Locked payroll ${run.runNumber}` });
    return { id, status: 'LOCKED' };
  }

  async listPayslips(runId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
    if (!run) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll run not found.');
    const rows = await this.prisma.payslip.findMany({ where: { companyId, payrollRunId: runId }, include: { lines: true }, orderBy: { employeeCode: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  // --------------------------------------------------------------- advances

  async listAdvances(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.employeeAdvance.findMany({
      where: { companyId },
      orderBy: { issuedAt: 'desc' },
      take: 200,
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true } } },
    });
    return { items: rows.map(toAdvanceDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /** Issue an advance and post it: Dr employee advance receivable, Cr cash. */
  async createAdvance(dto: CreateAdvanceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const result = await this.posting.withTransaction(async (tx) => {
      const advanceNumber = await this.sequences.next(tx, companyId, 'employeeAdvance');
      const advance = await tx.employeeAdvance.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          advanceNumber,
          amountMinor: dto.amountMinor,
          installments: dto.installments ?? 1,
          issuedAt: new Date(dto.issuedAt),
          reason: dto.reason ?? null,
          createdById: actor.userId,
        },
      });
      const advanceAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.EMPLOYEE_ADVANCE);
      const cashAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.CASH);
      await this.posting.postJournal(tx, {
        companyId,
        entryDate: new Date(dto.issuedAt),
        memo: `Employee advance ${advanceNumber}`,
        sourceType: 'MANUAL',
        sourceId: null,
        actorUserId: actor.userId,
        lines: [
          { accountId: advanceAccount, debit: dto.amountMinor },
          { accountId: cashAccount, credit: dto.amountMinor },
        ],
      });
      return advance;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.advance_issued', targetType: 'EMPLOYEE_ADVANCE', targetId: result.id, summary: `Issued advance ${result.advanceNumber}` });
    return result;
  }

  async settleAdvance(id: string, dto: SettleAdvanceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const advance = await tx.employeeAdvance.findFirst({ where: { id, companyId } });
      if (!advance) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Advance not found.');
      const outstanding = advance.amountMinor - advance.settledMinor;
      if (dto.amountMinor > outstanding) throw badRequest(ERROR_CODES.OVER_ALLOCATION, 'Settlement exceeds the outstanding advance.');
      const settled = advance.settledMinor + dto.amountMinor;
      await tx.advanceSettlement.create({ data: { companyId, advanceId: id, amountMinor: dto.amountMinor, note: dto.note ?? null } });
      return tx.employeeAdvance.update({ where: { id }, data: { settledMinor: settled, status: settled >= advance.amountMinor ? 'SETTLED' : 'PARTIALLY_SETTLED' } });
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.advance_settled', targetType: 'EMPLOYEE_ADVANCE', targetId: id, summary: `Settled ${fromMinor(dto.amountMinor)}` });
    return result;
  }

  // --------------------------------------------------------------- reporting

  async workforceDashboard(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const [total, active, onLeave, departments, byDepartment] = await Promise.all([
      this.prisma.employee.count({ where: { companyId } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { companyId, status: 'ON_LEAVE' } }),
      this.prisma.department.findMany({ where: { companyId }, include: { _count: { select: { employees: true } } } }),
      this.prisma.employee.groupBy({ by: ['departmentId'], where: { companyId }, _count: true }),
    ]);
    const pendingLeave = await this.prisma.leaveRequest.count({ where: { companyId, status: 'SUBMITTED' } });
    const latestRun = await this.prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } });
    return {
      totalEmployees: total,
      activeEmployees: active,
      onLeaveEmployees: onLeave,
      pendingLeaveRequests: pendingLeave,
      departmentCount: departments.length,
      headcountByDepartment: byDepartment.map((g) => ({
        departmentId: g.departmentId,
        count: g._count,
      })),
      latestPayroll: latestRun
        ? { id: latestRun.id, runNumber: latestRun.runNumber, status: latestRun.status, netMinor: latestRun.netMinor, employeeCount: latestRun.employeeCount }
        : null,
    };
  }

  // ----------------------------------------------------------------- helpers

  private async assertEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId } });
    if (!employee) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee not found in this company.');
  }
}

// ---------------------------------------------------------------- mappers

function toEmployeeDto(e: {
  id: string;
  code: string;
  fullNameEn: string;
  fullNameAr: string;
  email: string | null;
  phone: string | null;
  status: string;
  hireDate: Date;
  departmentId: string | null;
  jobTitleId: string | null;
  managerId: string | null;
  department?: { nameEn: string; nameAr: string } | null;
  jobTitle?: { nameEn: string; nameAr: string } | null;
  manager?: { fullNameEn: string } | null;
}) {
  return {
    id: e.id,
    code: e.code,
    fullNameEn: e.fullNameEn,
    fullNameAr: e.fullNameAr,
    email: e.email,
    phone: e.phone,
    status: e.status,
    hireDate: e.hireDate.toISOString(),
    departmentId: e.departmentId,
    departmentNameEn: e.department?.nameEn ?? null,
    departmentNameAr: e.department?.nameAr ?? null,
    jobTitleId: e.jobTitleId,
    jobTitleNameEn: e.jobTitle?.nameEn ?? null,
    jobTitleNameAr: e.jobTitle?.nameAr ?? null,
    managerId: e.managerId,
    managerNameEn: e.manager?.fullNameEn ?? null,
  };
}

function toEmployeeDetailDto(e: Record<string, unknown>) {
  const base = toEmployeeDto(e as never);
  return { ...base, ...e };
}

function toLeaveRequestDto(r: {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: string;
  reason: string | null;
  decisionNote: string | null;
  employee?: { code: string; fullNameEn: string; fullNameAr: string } | null;
  leaveType?: { nameEn: string; nameAr: string } | null;
}) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeCode: r.employee?.code ?? null,
    employeeNameEn: r.employee?.fullNameEn ?? null,
    employeeNameAr: r.employee?.fullNameAr ?? null,
    leaveTypeId: r.leaveTypeId,
    leaveTypeNameEn: r.leaveType?.nameEn ?? null,
    leaveTypeNameAr: r.leaveType?.nameAr ?? null,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    days: r.days,
    status: r.status,
    reason: r.reason,
    decisionNote: r.decisionNote,
  };
}

function toAttendanceDto(a: {
  id: string;
  employeeId: string;
  workDate: Date;
  workedMinutes: number;
  overtimeMinutes: number;
  status: string;
  employee?: { code: string; fullNameEn: string; fullNameAr: string } | null;
}) {
  return {
    id: a.id,
    employeeId: a.employeeId,
    employeeCode: a.employee?.code ?? null,
    employeeNameEn: a.employee?.fullNameEn ?? null,
    employeeNameAr: a.employee?.fullNameAr ?? null,
    workDate: a.workDate.toISOString(),
    workedMinutes: a.workedMinutes,
    overtimeMinutes: a.overtimeMinutes,
    status: a.status,
  };
}

function toPayrollRunDto(r: {
  id: string;
  runNumber: string;
  status: string;
  employeeCount: number;
  grossMinor: number;
  allowancesMinor: number;
  deductionsMinor: number;
  netMinor: number;
  currency: string;
  journalEntryId: string | null;
  period?: { code: string; nameEn: string; nameAr: string } | null;
  _count?: { payslips: number };
  createdAt: Date;
}) {
  return {
    id: r.id,
    runNumber: r.runNumber,
    status: r.status,
    employeeCount: r.employeeCount,
    grossMinor: r.grossMinor,
    allowancesMinor: r.allowancesMinor,
    deductionsMinor: r.deductionsMinor,
    netMinor: r.netMinor,
    currency: r.currency,
    journalEntryId: r.journalEntryId,
    periodCode: r.period?.code ?? null,
    periodNameEn: r.period?.nameEn ?? null,
    periodNameAr: r.period?.nameAr ?? null,
    payslipCount: r._count?.payslips,
    createdAt: r.createdAt.toISOString(),
  };
}

function toPayrollRunDetailDto(r: {
  id: string;
  runNumber: string;
  status: string;
  employeeCount: number;
  grossMinor: number;
  allowancesMinor: number;
  deductionsMinor: number;
  netMinor: number;
  currency: string;
  journalEntryId: string | null;
  period: { code: string; nameEn: string; nameAr: string; startDate: Date; endDate: Date };
  payslips: Array<Record<string, unknown>>;
  createdAt: Date;
}) {
  return {
    ...toPayrollRunDto(r as never),
    periodStart: r.period.startDate.toISOString(),
    periodEnd: r.period.endDate.toISOString(),
    payslips: r.payslips,
  };
}

function toAdvanceDto(a: {
  id: string;
  advanceNumber: string;
  employeeId: string;
  amountMinor: number;
  settledMinor: number;
  installments: number;
  status: string;
  currency: string;
  issuedAt: Date;
  reason: string | null;
  employee?: { code: string; fullNameEn: string; fullNameAr: string } | null;
}) {
  return {
    id: a.id,
    advanceNumber: a.advanceNumber,
    employeeId: a.employeeId,
    employeeCode: a.employee?.code ?? null,
    employeeNameEn: a.employee?.fullNameEn ?? null,
    employeeNameAr: a.employee?.fullNameAr ?? null,
    amountMinor: a.amountMinor,
    settledMinor: a.settledMinor,
    outstandingMinor: a.amountMinor - a.settledMinor,
    installments: a.installments,
    status: a.status,
    currency: a.currency,
    issuedAt: a.issuedAt.toISOString(),
    reason: a.reason,
  };
}
