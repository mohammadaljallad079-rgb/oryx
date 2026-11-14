import { Injectable } from '@nestjs/common';
import { fromMinor, sumMinor } from '@oryx/shared';
import type { Prisma } from '@oryx/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, type UploadedFileLike } from '../attachments/attachments.service';
import { AccountingPostingService, SYSTEM_ROLES } from '../common/accounting-posting.service';
import { DocumentSequenceService, type Tx } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { computePayslip, leaveDaysBetween, type SalaryComponentInput } from './payroll-calculator';
import { deriveAttendance, zonedDateKey, zonedParts } from './attendance-calculator';
import { verifyPunch, qrTokenFor, type PunchLocation } from './attendance-verification';
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
  UpdateLeaveRequestDto,
  CreateWorkSiteDto,
  UpdateWorkSiteDto,
  UpdateAttendancePolicyDto,
  SelfCheckInDto,
  SelfCheckOutDto,
  SelfBreakDto,
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
    private readonly attachments: AttachmentsService,
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
          secondaryPhone: dto.secondaryPhone ?? null,
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
        ...(dto.secondaryPhone !== undefined ? { secondaryPhone: dto.secondaryPhone } : {}),
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

  /**
   * Permanently delete an employee and their HR detail rows.
   *
   * Contracts, documents, leave, attendance, shifts, salary history and
   * lifecycle all cascade with the employee. Payroll history does not: a payslip
   * or an advance is a financial record that must survive, so an employee that
   * has any is refused and should be terminated (status TERMINATED) instead.
   */
  async deleteEmployee(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.prisma.employee.findFirst({ where: { id, companyId } });
    if (!employee) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee not found.');

    const [payslips, advances] = await Promise.all([
      this.prisma.payslip.count({ where: { employeeId: id } }),
      this.prisma.employeeAdvance.count({ where: { employeeId: id } }),
    ]);
    if (payslips + advances > 0) {
      throw conflict(
        ERROR_CODES.RESOURCE_CONFLICT,
        'This employee has payroll history (payslips or advances) and cannot be deleted. Terminate the record instead so the payroll history is preserved.',
      );
    }

    await this.posting.withTransaction(async (tx) => {
      await tx.entityAttachment.deleteMany({ where: { companyId, entityType: 'EMPLOYEE', entityId: id } });
      await tx.entityComment.deleteMany({ where: { companyId, entityType: 'EMPLOYEE', entityId: id } });
      await tx.employee.delete({ where: { id } });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.employee_deleted',
      targetType: 'EMPLOYEE',
      targetId: id,
      summary: `Permanently deleted employee ${employee.code}`,
    });
    return { id, deleted: true };
  }

  // -------------------------------------------------------------- contracts

  async createContract(employeeId: string, dto: CreateContractDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const companyCurrency = await this.context.companyCurrency(companyId);
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
        currency: dto.currency ?? companyCurrency,
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
    // Attach the stored-file metadata so the list can offer preview/download
    // without a second round trip. The bytes never travel here — only the
    // name, type and size of the file the record points at.
    const assetIds = rows.map((r) => r.fileAssetId).filter((x): x is string => Boolean(x));
    const assets = assetIds.length
      ? await this.prisma.entityAttachment.findMany({ where: { companyId, id: { in: assetIds } } })
      : [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => {
        const asset = r.fileAssetId ? byId.get(r.fileAssetId) : undefined;
        return {
          ...r,
          fileName: asset?.fileName ?? null,
          mimeType: asset?.mimeType ?? null,
          sizeBytes: asset?.sizeBytes ?? null,
          hasFile: Boolean(asset),
        };
      }),
      total: rows.length,
      page: 1,
      pageSize: rows.length,
    };
  }

  /**
   * Create an employee document, optionally with a real uploaded file.
   *
   * The binary goes through the shared attachment store (which validates the
   * MIME type, enforces the size ceiling and writes an opaque server-named
   * file); the document row keeps only the attachment id. A document may still
   * be recorded with no file — a physical certificate that lives in a folder —
   * in which case `fileRef` carries the free-text reference.
   */
  async createDocument(
    employeeId: string,
    dto: CreateDocumentDto,
    file: UploadedFileLike | undefined,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);

    let fileAssetId: string | null = null;
    if (file && file.size > 0) {
      const asset = await this.attachments.upload('EMPLOYEE', employeeId, file, principal);
      fileAssetId = asset.id;
    }

    const doc = await this.prisma.employeeDocument.create({
      data: {
        companyId,
        employeeId,
        category: dto.category as never,
        title: dto.title,
        fileRef: dto.fileRef ?? null,
        fileAssetId,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isConfidential: dto.isConfidential ?? false,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.document_created', targetType: 'EMPLOYEE_DOCUMENT', targetId: doc.id, summary: `Added document ${doc.title} for employee${fileAssetId ? ' (file attached)' : ''}` });
    return doc;
  }

  /**
   * Resolve a document's stored file for streaming.
   *
   * The confidential flag is re-checked here, not only in the list: a caller
   * who knows the document id must not be able to read a confidential file
   * without the explicit permission, exactly as the list hides it.
   */
  async resolveDocumentFile(employeeId: string, documentId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const doc = await this.prisma.employeeDocument.findFirst({ where: { id: documentId, companyId, employeeId } });
    if (!doc) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee document not found.');
    if (doc.isConfidential && !principal.grantedPermissions.includes('erp.hr.document.confidential')) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'This document is confidential.');
    }
    if (!doc.fileAssetId) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'This document has no stored file.');
    return this.attachments.resolveForDownload('EMPLOYEE', employeeId, doc.fileAssetId, principal);
  }

  /** A readable stream of a resolved document file. */
  streamDocumentFile(path: string): ReturnType<AttachmentsService['stream']> {
    return this.attachments.stream(path);
  }

  /** Remove an employee document and any file it stored. */
  async deleteDocument(employeeId: string, documentId: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const doc = await this.prisma.employeeDocument.findFirst({ where: { id: documentId, companyId, employeeId } });
    if (!doc) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee document not found.');
    await this.prisma.employeeDocument.delete({ where: { id: doc.id } });
    if (doc.fileAssetId) {
      // The attachment row and its bytes go with the document; a failure here
      // must not resurrect the deleted record, so it is best-effort.
      await this.attachments.remove('EMPLOYEE', employeeId, doc.fileAssetId, principal).catch(() => undefined);
    }
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.document_deleted', targetType: 'EMPLOYEE_DOCUMENT', targetId: documentId, summary: `Deleted document ${doc.title}` });
    return { deleted: true };
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

      const leaveType = await tx.leaveType.findFirst({ where: { id: dto.leaveTypeId, companyId } });
      if (!leaveType) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Leave type not found.');
      // A new balance is seeded from the leave type's annual entitlement so a
      // request does not silently start from zero.
      const balance = await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, year } },
        create: {
          companyId,
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          year,
          entitledDays: leaveType.annualEntitlementDays,
          accruedDays: leaveType.annualEntitlementDays,
        },
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

  /**
   * Edit a pending leave request.
   *
   * Only a request that is still `SUBMITTED` may be edited: once a decision has
   * moved days between pending and used, changing the dates would desynchronise
   * the balance from the request. The days are recomputed and the balance
   * adjusted by the difference, so the reservation stays exactly in step with
   * the request. A leave-type change moves the reservation between balances.
   */
  async updateLeaveRequest(requestId: string, dto: UpdateLeaveRequestDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const request = await tx.leaveRequest.findFirst({ where: { id: requestId, companyId } });
      if (!request) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Leave request not found.');
      if (request.status !== 'SUBMITTED') throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only a submitted request can be edited.');

      const leaveTypeId = dto.leaveTypeId ?? request.leaveTypeId;
      const start = dto.startDate ? new Date(dto.startDate) : request.startDate;
      const end = dto.endDate ? new Date(dto.endDate) : request.endDate;
      if (end < start) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'End date must not precede the start date.');
      const days = leaveDaysBetween(start, end);
      const year = start.getUTCFullYear();

      if (leaveTypeId !== request.leaveTypeId) {
        const leaveType = await tx.leaveType.findFirst({ where: { id: leaveTypeId, companyId } });
        if (!leaveType) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Leave type not found.');
      }

      // Release the old reservation before checking the new one, so an edit that
      // keeps the same dates is never rejected against itself.
      const oldBalance = await tx.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: request.startDate.getUTCFullYear() } },
      });
      if (oldBalance) {
        await tx.leaveBalance.update({ where: { id: oldBalance.id }, data: { pendingDays: { decrement: request.days } } });
      }

      const overlap = await tx.leaveRequest.findFirst({
        where: {
          companyId,
          employeeId: request.employeeId,
          id: { not: request.id },
          status: { in: ['SUBMITTED', 'APPROVED'] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (overlap) throw conflict(ERROR_CODES.LEAVE_OVERLAP, 'An overlapping leave request already exists.');

      const leaveType = await tx.leaveType.findUniqueOrThrow({ where: { id: leaveTypeId } });
      const balance = await tx.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId, year } },
        create: {
          companyId,
          employeeId: request.employeeId,
          leaveTypeId,
          year,
          entitledDays: leaveType.annualEntitlementDays,
          accruedDays: leaveType.annualEntitlementDays,
        },
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

      const updated = await tx.leaveRequest.update({
        where: { id: request.id },
        data: { leaveTypeId, startDate: start, endDate: end, days, reason: dto.reason ?? request.reason },
      });
      await tx.leaveBalance.update({ where: { id: balance.id }, data: { pendingDays: { increment: days } } });
      return updated;
    });

    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.leave_updated', targetType: 'LEAVE_REQUEST', targetId: requestId, summary: 'Leave request edited' });
    return result;
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
      where: {
        companyId,
        ...(query.branchId ? { employee: { branchId: query.branchId } } : {}),
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.from || query.to
          ? { workDate: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
          : {}),
      },
      orderBy: { workDate: 'desc' },
      take: 500,
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true } } },
    });
    return { items: rows.map(toAttendanceDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /** Record (or update) one day of attendance for an employee (manager path). */
  async recordAttendance(dto: RecordAttendanceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const workDate = new Date(dto.workDate);
    const checkIn = dto.checkInAt ? new Date(dto.checkInAt) : null;
    const checkOut = dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    const shift = dto.shiftId ? await this.prisma.shift.findFirst({ where: { id: dto.shiftId, companyId } }) : null;
    const policy = await this.ensurePolicy(companyId);

    const derived =
      checkIn && checkOut
        ? deriveAttendance({ checkIn, checkOut, shift, graceMinutes: policy.graceMinutes, timeZone: await this.companyTimeZone(companyId) })
        : null;

    const record = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: dto.employeeId, workDate } },
      create: {
        companyId,
        employeeId: dto.employeeId,
        shiftId: dto.shiftId ?? null,
        workDate,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        workedMinutes: derived?.workedMinutes ?? 0,
        breakMinutes: derived?.breakMinutes ?? 0,
        netMinutes: derived?.netMinutes ?? 0,
        lateMinutes: derived?.lateMinutes ?? 0,
        earlyLeaveMinutes: derived?.earlyLeaveMinutes ?? 0,
        overtimeMinutes: dto.overtimeMinutes ?? derived?.overtimeMinutes ?? 0,
        status: (dto.status as never) ?? derived?.status ?? 'PRESENT',
        notes: dto.notes ?? null,
        checkInSource: checkIn ? 'MANUAL' : null,
        checkOutSource: checkOut ? 'MANUAL' : null,
      },
      update: {
        shiftId: dto.shiftId ?? null,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        workedMinutes: derived?.workedMinutes ?? 0,
        breakMinutes: derived?.breakMinutes ?? 0,
        netMinutes: derived?.netMinutes ?? 0,
        lateMinutes: derived?.lateMinutes ?? 0,
        earlyLeaveMinutes: derived?.earlyLeaveMinutes ?? 0,
        overtimeMinutes: dto.overtimeMinutes ?? derived?.overtimeMinutes ?? 0,
        ...(dto.status ? { status: dto.status as never } : derived ? { status: derived.status as never } : {}),
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_recorded', targetType: 'ATTENDANCE_RECORD', targetId: record.id, summary: `Attendance recorded for ${workDate.toISOString().slice(0, 10)}` });
    return record;
  }

  // ------------------------------------------------------------ self-service

  /**
   * Resolve the employee record for the signed-in user.
   *
   * A self-service punch is always for the caller's own employee row; the
   * `employeeId` in the body is ignored unless the principal holds the
   * attendance-manage permission, which lets a manager punch on behalf of a
   * worker. This is what stops an employee recording another's time.
   */
  private async resolveSelfEmployee(
    companyId: string,
    principal: RequestPrincipal,
    requestedEmployeeId: string | undefined,
    canManage: boolean,
  ) {
    if (requestedEmployeeId && canManage) {
      const employee = await this.prisma.employee.findFirst({ where: { id: requestedEmployeeId, companyId } });
      if (!employee) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee not found in this company.');
      return employee;
    }
    const employee = await this.prisma.employee.findFirst({ where: { companyId, userId: principal.userId } });
    if (!employee) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'No employee record is linked to your user account.');
    }
    return employee;
  }

  private async companyTimeZone(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
    return company?.timezone ?? 'Asia/Bahrain';
  }

  /** The company's attendance policy, creating the default row on first read. */
  async ensurePolicy(companyId: string) {
    const existing = await this.prisma.attendancePolicy.findUnique({ where: { companyId } });
    if (existing) return existing;
    return this.prisma.attendancePolicy.create({ data: { companyId } });
  }

  async getPolicy(principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    return this.ensurePolicy(companyId);
  }

  async updatePolicy(dto: UpdateAttendancePolicyDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.ensurePolicy(companyId);
    const updated = await this.prisma.attendancePolicy.update({
      where: { companyId },
      data: {
        ...(dto.graceMinutes !== undefined ? { graceMinutes: dto.graceMinutes } : {}),
        ...(dto.standardDailyHours !== undefined ? { standardDailyHours: dto.standardDailyHours } : {}),
        ...(dto.standardWeeklyHours !== undefined ? { standardWeeklyHours: dto.standardWeeklyHours } : {}),
        ...(dto.workingDays !== undefined ? { workingDays: dto.workingDays } : {}),
        ...(dto.overtimeEnabled !== undefined ? { overtimeEnabled: dto.overtimeEnabled } : {}),
        ...(dto.overtimeMultiplierBp !== undefined ? { overtimeMultiplierBp: dto.overtimeMultiplierBp } : {}),
        ...(dto.overtimeThresholdHours !== undefined ? { overtimeThresholdHours: dto.overtimeThresholdHours } : {}),
        ...(dto.deductLate !== undefined ? { deductLate: dto.deductLate } : {}),
        ...(dto.deductEarlyLeave !== undefined ? { deductEarlyLeave: dto.deductEarlyLeave } : {}),
        ...(dto.deductAbsence !== undefined ? { deductAbsence: dto.deductAbsence } : {}),
        ...(dto.requireLocation !== undefined ? { requireLocation: dto.requireLocation } : {}),
        ...(dto.allowFallback !== undefined ? { allowFallback: dto.allowFallback } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_policy_updated', targetType: 'ATTENDANCE_POLICY', targetId: updated.id, summary: 'Updated attendance and payroll policy' });
    return updated;
  }

  // -------------------------------------------------------------- worksites

  async listWorkSites(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.workSite.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    return { items: rows, total: rows.length, page: 1, pageSize: rows.length };
  }

  async createWorkSite(dto: CreateWorkSiteDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.workSite.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Work site ${dto.code} already exists.`);
    const site = await this.prisma.workSite.create({
      data: {
        companyId,
        branchId: dto.branchId ?? null,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters ?? 150,
        wifiSsids: dto.wifiSsids ?? null,
        wifiBssids: dto.wifiBssids ?? null,
        qrSecret: dto.qrSecret ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.worksite_created', targetType: 'WORK_SITE', targetId: site.id, summary: `Created work site ${site.code}` });
    return site;
  }

  async updateWorkSite(id: string, dto: UpdateWorkSiteDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.workSite.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Work site not found.');
    const site = await this.prisma.workSite.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.radiusMeters !== undefined ? { radiusMeters: dto.radiusMeters } : {}),
        ...(dto.wifiSsids !== undefined ? { wifiSsids: dto.wifiSsids } : {}),
        ...(dto.wifiBssids !== undefined ? { wifiBssids: dto.wifiBssids } : {}),
        ...(dto.qrSecret !== undefined ? { qrSecret: dto.qrSecret } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.worksite_updated', targetType: 'WORK_SITE', targetId: site.id, summary: `Updated work site ${site.code}` });
    return site;
  }

  async deleteWorkSite(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.workSite.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Work site not found.');
    await this.prisma.workSite.delete({ where: { id } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.worksite_deleted', targetType: 'WORK_SITE', targetId: id, summary: `Deleted work site ${existing.code}` });
    return { id, deleted: true };
  }

  /** The current rotating QR token for a worksite, for a kiosk display. */
  async workSiteQrToken(siteId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const site = await this.prisma.workSite.findFirst({ where: { id: siteId, companyId } });
    if (!site) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Work site not found.');
    if (!site.qrSecret) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'This work site has no QR secret configured.');
    const now = new Date();
    return { siteId: site.id, token: qrTokenFor(site.qrSecret, now), expiresInSeconds: 60 };
  }

  // ------------------------------------------------------ attendance punches

  private async activeShiftFor(companyId: string, employeeId: string): Promise<{ id: string; startTime: string; endTime: string; breakMinutes: number } | null> {
    const assignment = await this.prisma.employeeShift.findFirst({
      where: { companyId, employeeId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
      orderBy: { effectiveFrom: 'desc' },
      include: { shift: true },
    });
    if (!assignment) return null;
    return { id: assignment.shift.id, startTime: assignment.shift.startTime, endTime: assignment.shift.endTime, breakMinutes: assignment.shift.breakMinutes };
  }

  /** Resolve a shift for a punch: the requested one, the assignment, or null. */
  private async shiftForPunch(companyId: string, employeeId: string, shiftId?: string) {
    if (shiftId) {
      const shift = await this.prisma.shift.findFirst({ where: { id: shiftId, companyId } });
      if (shift) return { id: shift.id, startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes };
    }
    return this.activeShiftFor(companyId, employeeId);
  }

  /** Verify a punch's location against the company's active worksites. */
  private async verifyLocation(companyId: string, location: PunchLocation | undefined, at: Date) {
    const sites = await this.prisma.workSite.findMany({ where: { companyId, isActive: true } });
    return verifyPunch(
      sites.map((s) => ({ id: s.id, latitude: s.latitude, longitude: s.longitude, radiusMeters: s.radiusMeters, wifiSsids: s.wifiSsids, wifiBssids: s.wifiBssids, qrSecret: s.qrSecret })),
      location,
      at,
    );
  }

  /**
   * Self check-in.
   *
   * The punch is rejected when the employee has already checked in today, when
   * the policy requires a verified location and none matched, or when the
   * location could not be verified and no fallback reason was given. The
   * verification source and measured distance are stored, never inferred.
   */
  async selfCheckIn(dto: SelfCheckInDto, principal: RequestPrincipal, actor: ActorContext, canManage: boolean) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.resolveSelfEmployee(companyId, principal, dto.employeeId, canManage);
    const policy = await this.ensurePolicy(companyId);
    const tz = await this.companyTimeZone(companyId);
    const at = dto.at ? new Date(dto.at) : new Date();
    const workDate = zonedDateKey(at, tz);

    const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate } } });
    if (existing?.checkInAt) throw conflict(ERROR_CODES.ATTENDANCE_ALREADY_CHECKED_IN, 'You have already checked in today.');

    const verification = await this.verifyLocation(companyId, dto.location, at);
    if (policy.requireLocation && !verification.verified && !(policy.allowFallback && dto.location?.fallbackReason)) {
      if (!dto.location?.fallbackReason) throw badRequest(ERROR_CODES.ATTENDANCE_LOCATION_REQUIRED, 'A verified location is required to check in.');
      throw badRequest(ERROR_CODES.ATTENDANCE_LOCATION_UNVERIFIED, verification.detail);
    }

    const shift = await this.shiftForPunch(companyId, employee.id, dto.shiftId);
    const record = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
      create: {
        companyId,
        employeeId: employee.id,
        shiftId: shift?.id ?? null,
        workDate,
        checkInAt: at,
        status: 'PRESENT',
        notes: dto.notes ?? null,
        checkInSource: verification.verified ? verification.source : dto.location?.fallbackReason ? 'FALLBACK' : 'MANUAL',
        checkInLat: dto.location?.latitude ?? null,
        checkInLng: dto.location?.longitude ?? null,
        checkInAccuracy: dto.location?.accuracy ?? null,
        checkInDistanceM: verification.distanceM,
        checkInSiteId: verification.siteId,
        fallbackReason: dto.location?.fallbackReason ?? null,
      },
      update: {
        checkInAt: at,
        shiftId: shift?.id ?? null,
        status: 'PRESENT',
        checkInSource: verification.verified ? verification.source : dto.location?.fallbackReason ? 'FALLBACK' : 'MANUAL',
        checkInLat: dto.location?.latitude ?? null,
        checkInLng: dto.location?.longitude ?? null,
        checkInAccuracy: dto.location?.accuracy ?? null,
        checkInDistanceM: verification.distanceM,
        checkInSiteId: verification.siteId,
        fallbackReason: dto.location?.fallbackReason ?? null,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_check_in', targetType: 'ATTENDANCE_RECORD', targetId: record.id, summary: `Check-in via ${record.checkInSource}${verification.distanceM !== null ? ` (${verification.distanceM} m)` : ''}` });
    return { ...toAttendanceDto({ ...record, employee }), verification };
  }

  /**
   * Self check-out. Requires an open check-in and no open break; the day's
   * worked, break, late, early-leave and overtime minutes are derived from the
   * shift and the policy and frozen on the record.
   */
  async selfCheckOut(dto: SelfCheckOutDto, principal: RequestPrincipal, actor: ActorContext, canManage: boolean) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.resolveSelfEmployee(companyId, principal, dto.employeeId, canManage);
    const policy = await this.ensurePolicy(companyId);
    const tz = await this.companyTimeZone(companyId);
    const at = dto.at ? new Date(dto.at) : new Date();
    const workDate = zonedDateKey(at, tz);

    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
      include: { breaks: true },
    });
    if (!record || !record.checkInAt) throw badRequest(ERROR_CODES.ATTENDANCE_NOT_CHECKED_IN, 'You have not checked in today.');
    if (record.checkOutAt) throw conflict(ERROR_CODES.ATTENDANCE_ALREADY_CHECKED_OUT, 'You have already checked out today.');
    if (record.breaks.some((b) => !b.endedAt)) throw conflict(ERROR_CODES.ATTENDANCE_BREAK_OPEN, 'End your open break before checking out.');

    const verification = await this.verifyLocation(companyId, dto.location, at);
    const shift = record.shiftId
      ? await this.prisma.shift.findFirst({ where: { id: record.shiftId, companyId } })
      : await this.shiftForPunch(companyId, employee.id);
    const takenBreak = record.breaks.reduce((sum, b) => sum + b.minutes, 0);
    const derived = deriveAttendance({
      checkIn: record.checkInAt,
      checkOut: at,
      shift,
      breakMinutes: takenBreak,
      graceMinutes: policy.graceMinutes,
      timeZone: tz,
    });

    const updated = await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutAt: at,
        workedMinutes: derived.workedMinutes,
        breakMinutes: derived.breakMinutes,
        netMinutes: derived.netMinutes,
        lateMinutes: derived.lateMinutes,
        earlyLeaveMinutes: derived.earlyLeaveMinutes,
        overtimeMinutes: derived.overtimeMinutes,
        status: derived.status,
        checkOutSource: verification.verified ? verification.source : dto.location?.fallbackReason ? 'FALLBACK' : 'MANUAL',
        checkOutLat: dto.location?.latitude ?? null,
        checkOutLng: dto.location?.longitude ?? null,
        checkOutDistanceM: verification.distanceM,
        checkOutSiteId: verification.siteId,
      },
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_check_out', targetType: 'ATTENDANCE_RECORD', targetId: updated.id, summary: `Check-out: ${derived.netMinutes} net minutes, ${derived.overtimeMinutes} overtime` });
    return { ...toAttendanceDto({ ...updated, employee }), verification };
  }

  /** Start a break. Only one open break is allowed at a time. */
  async selfBreakStart(dto: SelfBreakDto, principal: RequestPrincipal, actor: ActorContext, canManage: boolean) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.resolveSelfEmployee(companyId, principal, dto.employeeId, canManage);
    const tz = await this.companyTimeZone(companyId);
    const at = dto.at ? new Date(dto.at) : new Date();
    const workDate = zonedDateKey(at, tz);
    const record = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate } }, include: { breaks: true } });
    if (!record || !record.checkInAt) throw badRequest(ERROR_CODES.ATTENDANCE_NOT_CHECKED_IN, 'Check in before taking a break.');
    if (record.checkOutAt) throw conflict(ERROR_CODES.ATTENDANCE_ALREADY_CHECKED_OUT, 'You have already checked out today.');
    if (record.breaks.some((b) => !b.endedAt)) throw conflict(ERROR_CODES.ATTENDANCE_BREAK_OPEN, 'A break is already open.');

    const created = await this.prisma.attendanceBreak.create({ data: { companyId, attendanceRecordId: record.id, employeeId: employee.id, startedAt: at } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_break_start', targetType: 'ATTENDANCE_BREAK', targetId: created.id, summary: 'Break started' });
    return created;
  }

  /** End the open break and roll its minutes into the day's break total. */
  async selfBreakEnd(dto: SelfBreakDto, principal: RequestPrincipal, actor: ActorContext, canManage: boolean) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.resolveSelfEmployee(companyId, principal, dto.employeeId, canManage);
    const tz = await this.companyTimeZone(companyId);
    const at = dto.at ? new Date(dto.at) : new Date();
    const workDate = zonedDateKey(at, tz);
    const record = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: employee.id, workDate } }, include: { breaks: true } });
    if (!record) throw badRequest(ERROR_CODES.ATTENDANCE_NOT_CHECKED_IN, 'No attendance record for today.');
    const open = record.breaks.find((b) => !b.endedAt);
    if (!open) throw badRequest(ERROR_CODES.ATTENDANCE_NO_OPEN_BREAK, 'There is no open break to end.');

    const minutes = Math.max(0, Math.round((at.getTime() - open.startedAt.getTime()) / 60_000));
    const ended = await this.prisma.attendanceBreak.update({ where: { id: open.id }, data: { endedAt: at, minutes } });
    const totalBreak = record.breaks.filter((b) => b.endedAt).reduce((sum, b) => sum + b.minutes, 0) + minutes;
    const netMinutes = record.checkOutAt ? Math.max(0, record.workedMinutes - totalBreak) : record.netMinutes;
    await this.prisma.attendanceRecord.update({ where: { id: record.id }, data: { breakMinutes: totalBreak, netMinutes } });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.attendance_break_end', targetType: 'ATTENDANCE_BREAK', targetId: ended.id, summary: `Break ended: ${minutes} minutes` });
    return ended;
  }

  /** Today's attendance record for the signed-in employee, with breaks. */
  async myAttendanceToday(principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.prisma.employee.findFirst({ where: { companyId, userId: principal.userId } });
    if (!employee) return { employee: null, record: null };
    const tz = await this.companyTimeZone(companyId);
    const workDate = zonedDateKey(new Date(), tz);
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
      include: { breaks: true },
    });
    return {
      employee: { id: employee.id, code: employee.code, fullNameEn: employee.fullNameEn, fullNameAr: employee.fullNameAr },
      record: record ? { ...toAttendanceDto({ ...record, employee }), breaks: record.breaks.map((b) => ({ id: b.id, startedAt: b.startedAt.toISOString(), endedAt: b.endedAt ? b.endedAt.toISOString() : null, minutes: b.minutes })) } : null,
    };
  }

  /** The signed-in employee's own attendance history. */
  async myAttendanceHistory(principal: RequestPrincipal, from?: string, to?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.prisma.employee.findFirst({ where: { companyId, userId: principal.userId } });
    if (!employee) return { items: [], total: 0 };
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { companyId, employeeId: employee.id, ...(from || to ? { workDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) },
      orderBy: { workDate: 'desc' },
      take: 120,
    });
    return { items: rows.map((r) => toAttendanceDto({ ...r, employee })), total: rows.length };
  }

  /** The signed-in employee's own payslips (issued, i.e. posted or locked). */
  async myPayslips(principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.prisma.employee.findFirst({ where: { companyId, userId: principal.userId } });
    if (!employee) return { items: [], total: 0 };
    const rows = await this.prisma.payslip.findMany({
      where: { companyId, employeeId: employee.id, payrollRun: { status: { in: ['POSTED', 'LOCKED'] } } },
      include: { lines: true, payrollRun: { select: { runNumber: true, status: true, period: { select: { code: true, nameEn: true, nameAr: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    return { items: rows.map((p) => toPayslipDto(p)), total: rows.length };
  }

  // --------------------------------------------------------- salary structure

  async createSalaryStructure(dto: CreateSalaryStructureDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, dto.employeeId);
    const companyCurrency = await this.context.companyCurrency(companyId);
    const effectiveFrom = new Date(dto.effectiveFrom);
    const structure = await this.posting.withTransaction(async (tx) => {
      // Supersede the previous active structure rather than editing it, so
      // historical payroll results stay intact. The superseded row is stamped
      // with the new structure's start so a history query can show the span.
      const previous = await tx.salaryStructure.findFirst({
        where: { companyId, employeeId: dto.employeeId, isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      });
      await tx.salaryStructure.updateMany({
        where: { companyId, employeeId: dto.employeeId, isActive: true },
        data: { isActive: false, effectiveTo: effectiveFrom },
      });
      const created = await tx.salaryStructure.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          effectiveFrom,
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          basicMinor: dto.basicMinor,
          overtimeRateMinor: dto.overtimeRateMinor ?? null,
          dailyHours: dto.dailyHours ?? null,
          weeklyHours: dto.weeklyHours ?? null,
          workingDays: dto.workingDays ?? null,
          currency: dto.currency ?? companyCurrency,
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
      // The change log is append-only: it survives even if the structure row is
      // later superseded, and it records who changed the pay and why.
      await tx.salaryChangeLog.create({
        data: {
          companyId,
          employeeId: dto.employeeId,
          structureId: created.id,
          previousBasicMinor: previous?.basicMinor ?? null,
          newBasicMinor: dto.basicMinor,
          currency: created.currency,
          effectiveFrom,
          reason: dto.changeReason ?? dto.notes ?? null,
          changedById: actor.userId ?? 'system',
        },
      });
      return created;
    });
    await this.audit.record({ actorUserId: actor.userId, companyId, action: 'hr.salary_structure_created', targetType: 'SALARY_STRUCTURE', targetId: structure.id, summary: `Set salary effective ${dto.effectiveFrom.slice(0, 10)}` });
    return structure;
  }

  /** The effective salary structures for one employee, newest first. */
  async listSalaryHistory(employeeId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.assertEmployee(companyId, employeeId);
    const [structures, changes] = await Promise.all([
      this.prisma.salaryStructure.findMany({
        where: { companyId, employeeId },
        orderBy: { effectiveFrom: 'desc' },
        include: { components: true },
      }),
      this.prisma.salaryChangeLog.findMany({
        where: { companyId, employeeId },
        orderBy: { changedAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      items: structures.map((s) => ({
        id: s.id,
        effectiveFrom: s.effectiveFrom.toISOString(),
        effectiveTo: s.effectiveTo ? s.effectiveTo.toISOString() : null,
        basicMinor: s.basicMinor,
        overtimeRateMinor: s.overtimeRateMinor,
        currency: s.currency,
        isActive: s.isActive,
        components: s.components.map((c) => ({ code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, type: c.type, amountMinor: c.amountMinor, isPercentage: c.isPercentage, percentBp: c.percentBp })),
      })),
      changes: changes.map((c) => ({
        id: c.id,
        previousBasicMinor: c.previousBasicMinor,
        newBasicMinor: c.newBasicMinor,
        currency: c.currency,
        effectiveFrom: c.effectiveFrom.toISOString(),
        reason: c.reason,
        changedById: c.changedById,
        changedAt: c.changedAt.toISOString(),
      })),
    };
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

    const companyCurrency = await this.context.companyCurrency(companyId);
    const policy = await this.ensurePolicy(companyId);
    const employees = await this.prisma.employee.findMany({
      where: { companyId, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      include: {
        salaryStructures: { where: { isActive: true }, include: { components: true } },
        advances: { where: { status: { in: ['OPEN', 'PARTIALLY_SETTLED'] } } },
        attendance: { where: { workDate: { gte: period.startDate, lte: period.endDate } } },
        leaveRequests: {
          where: {
            status: 'APPROVED',
            leaveType: { isPaid: false },
            startDate: { lte: period.endDate },
            endDate: { gte: period.startDate },
          },
        },
      },
    });
    if (employees.length === 0) throw badRequest(ERROR_CODES.PAYROLL_NO_EMPLOYEES, 'No active employees with a salary structure.');

    const result = await this.posting.withTransaction(async (tx) => {
      const runNumber = await this.sequences.next(tx, companyId, 'payrollRun');
      const run = await tx.payrollRun.create({
        data: { companyId, periodId: period.id, runNumber, status: 'DRAFT', currency: companyCurrency, createdById: actor.userId, notes: dto.notes ?? null },
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
        const lateMinutes = sumMinor(employee.attendance.map((a) => a.lateMinutes));
        const earlyLeaveMinutes = sumMinor(employee.attendance.map((a) => a.earlyLeaveMinutes));
        const absenceDays = employee.attendance.filter((a) => a.status === 'ABSENT').length;
        const workedMinutes = sumMinor(employee.attendance.map((a) => a.netMinutes));
        // Unpaid approved leave inside the period is deducted at the daily rate.
        const unpaidLeaveDays = employee.leaveRequests.reduce(
          (sum, r) => sum + leaveDaysBetween(
            r.startDate < period.startDate ? period.startDate : r.startDate,
            r.endDate > period.endDate ? period.endDate : r.endDate,
          ),
          0,
        );

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
          overtimeRateMinor: structure.overtimeRateMinor,
          unpaidLeaveDays,
          advanceDeductionMinor: advanceDeduction,
          policy: {
            overtimeEnabled: policy.overtimeEnabled,
            overtimeMultiplierBp: dto.overtimeMultiplierBp ?? policy.overtimeMultiplierBp,
            standardDailyHours: structure.dailyHours ?? policy.standardDailyHours,
            deductLate: policy.deductLate,
            deductEarlyLeave: policy.deductEarlyLeave,
            deductAbsence: policy.deductAbsence,
          },
          attendance: { overtimeMinutes, lateMinutes, earlyLeaveMinutes, absenceDays, workedMinutes },
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
            overtimeMinutes,
            lateMinutes,
            absenceDays,
            workedMinutes,
            snapshot: {
              structureId: structure.id,
              effectiveFrom: structure.effectiveFrom.toISOString(),
              basicMinor: structure.basicMinor,
              components: components as unknown as Prisma.InputJsonValue,
              overtimeMinutes,
              lateMinutes,
              earlyLeaveMinutes,
              absenceDays,
              unpaidLeaveDays,
              advanceDeductionMinor: advanceDeduction,
              policy: {
                overtimeEnabled: policy.overtimeEnabled,
                overtimeMultiplierBp: dto.overtimeMultiplierBp ?? policy.overtimeMultiplierBp,
                deductLate: policy.deductLate,
                deductEarlyLeave: policy.deductEarlyLeave,
                deductAbsence: policy.deductAbsence,
              } as unknown as Prisma.InputJsonValue,
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
    const tz = await this.companyTimeZone(companyId);
    const today = zonedDateKey(new Date(), tz);

    const [total, active, onLeave, departments, byDepartment, todayRecords, pendingLeave, latestRun, approvedRuns, pendingRuns] = await Promise.all([
      this.prisma.employee.count({ where: { companyId } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { companyId, status: 'ON_LEAVE' } }),
      this.prisma.department.findMany({ where: { companyId }, include: { _count: { select: { employees: true } } } }),
      this.prisma.employee.groupBy({ by: ['departmentId'], where: { companyId }, _count: true }),
      this.prisma.attendanceRecord.findMany({ where: { companyId, workDate: today }, include: { employee: { select: { departmentId: true } } } }),
      this.prisma.leaveRequest.count({ where: { companyId, status: 'SUBMITTED' } }),
      this.prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payrollRun.count({ where: { companyId, status: { in: ['POSTED', 'LOCKED'] } } }),
      this.prisma.payrollRun.count({ where: { companyId, status: { in: ['DRAFT', 'APPROVED'] } } }),
    ]);

    const presentNow = todayRecords.filter((r) => r.checkInAt && !r.checkOutAt).length;
    const lateToday = todayRecords.filter((r) => r.lateMinutes > 0).length;
    const absentToday = todayRecords.filter((r) => r.status === 'ABSENT').length;
    const missingCheckout = todayRecords.filter((r) => r.checkInAt && !r.checkOutAt).length;
    const workedMinutesToday = todayRecords.reduce((sum, r) => sum + r.netMinutes, 0);
    const overtimeMinutesToday = todayRecords.reduce((sum, r) => sum + r.overtimeMinutes, 0);

    return {
      totalEmployees: total,
      activeEmployees: active,
      onLeaveEmployees: onLeave,
      pendingLeaveRequests: pendingLeave,
      departmentCount: departments.length,
      headcountByDepartment: byDepartment.map((g) => ({ departmentId: g.departmentId, count: g._count })),
      attendanceToday: {
        date: today.toISOString().slice(0, 10),
        presentNow,
        late: lateToday,
        absent: absentToday,
        missingCheckout,
        workedMinutes: workedMinutesToday,
        overtimeMinutes: overtimeMinutesToday,
      },
      payroll: {
        approvedRuns,
        pendingRuns,
        dueNetMinor: latestRun?.netMinor ?? 0,
      },
      latestPayroll: latestRun
        ? { id: latestRun.id, runNumber: latestRun.runNumber, status: latestRun.status, netMinor: latestRun.netMinor, employeeCount: latestRun.employeeCount }
        : null,
    };
  }

  // ------------------------------------------------------------ HR reports

  /**
   * A date window for a report, defaulting to the current calendar month in the
   * company's timezone. A report never guesses a window silently: the resolved
   * from/to are returned so the caller can show what was aggregated.
   */
  private async reportWindow(companyId: string, from?: string, to?: string) {
    const tz = await this.companyTimeZone(companyId);
    const now = new Date();
    const p = zonedParts(now, tz);
    const start = from ? new Date(from) : new Date(Date.UTC(p.year, p.month - 1, 1));
    const end = to ? new Date(to) : new Date(Date.UTC(p.year, p.month - 1, p.day));
    return { start, end, tz };
  }

  async reportAttendance(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        workDate: { gte: start, lte: end },
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
        ...(query.branchId ? { employee: { branchId: query.branchId } } : {}),
      },
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true, department: { select: { nameEn: true, nameAr: true } } } } },
      orderBy: { workDate: 'asc' },
    });
    return { from: start.toISOString(), to: end.toISOString(), items: rows.map(toAttendanceDto), total: rows.length };
  }

  /** Late arrivals and absences, aggregated per employee for the window. */
  async reportLateAbsence(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        workDate: { gte: start, lte: end },
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
        ...(query.branchId ? { employee: { branchId: query.branchId } } : {}),
      },
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true } } },
    });
    const byEmployee = new Map<string, { employeeCode: string; employeeNameEn: string; employeeNameAr: string; lateCount: number; lateMinutes: number; absentDays: number; earlyLeaveCount: number }>();
    for (const r of rows) {
      const key = r.employeeId;
      const entry = byEmployee.get(key) ?? { employeeCode: r.employee.code, employeeNameEn: r.employee.fullNameEn, employeeNameAr: r.employee.fullNameAr, lateCount: 0, lateMinutes: 0, absentDays: 0, earlyLeaveCount: 0 };
      if (r.lateMinutes > 0) { entry.lateCount += 1; entry.lateMinutes += r.lateMinutes; }
      if (r.earlyLeaveMinutes > 0) entry.earlyLeaveCount += 1;
      if (r.status === 'ABSENT') entry.absentDays += 1;
      byEmployee.set(key, entry);
    }
    return { from: start.toISOString(), to: end.toISOString(), items: [...byEmployee.values()], total: byEmployee.size };
  }

  /** Overtime hours and estimated cost per employee for the window. */
  async reportOvertime(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const policy = await this.ensurePolicy(companyId);
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { companyId, workDate: { gte: start, lte: end }, overtimeMinutes: { gt: 0 } },
      include: { employee: { select: { id: true, code: true, fullNameEn: true, fullNameAr: true, salaryStructures: { where: { isActive: true }, select: { basicMinor: true, overtimeRateMinor: true }, take: 1 } } } },
    });
    const byEmployee = new Map<string, { employeeCode: string; employeeNameEn: string; employeeNameAr: string; overtimeMinutes: number; overtimeCostMinor: number }>();
    for (const r of rows) {
      const structure = r.employee.salaryStructures[0];
      const hourly = structure?.overtimeRateMinor ?? (structure ? Math.round((structure.basicMinor * 100) / Math.max(1, policy.standardDailyHours * 30)) : 0);
      const cost = Math.round((r.overtimeMinutes * hourly) / 60);
      const entry = byEmployee.get(r.employeeId) ?? { employeeCode: r.employee.code, employeeNameEn: r.employee.fullNameEn, employeeNameAr: r.employee.fullNameAr, overtimeMinutes: 0, overtimeCostMinor: 0 };
      entry.overtimeMinutes += r.overtimeMinutes;
      entry.overtimeCostMinor += cost;
      byEmployee.set(r.employeeId, entry);
    }
    return { from: start.toISOString(), to: end.toISOString(), items: [...byEmployee.values()], total: byEmployee.size };
  }

  /** Net worked minutes per employee for the window. */
  async reportWorkedHours(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId,
        workDate: { gte: start, lte: end },
        ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
        ...(query.branchId ? { employee: { branchId: query.branchId } } : {}),
      },
      include: { employee: { select: { code: true, fullNameEn: true, fullNameAr: true } } },
    });
    const byEmployee = new Map<string, { employeeCode: string; employeeNameEn: string; employeeNameAr: string; workedMinutes: number; netMinutes: number; days: number }>();
    for (const r of rows) {
      const entry = byEmployee.get(r.employeeId) ?? { employeeCode: r.employee.code, employeeNameEn: r.employee.fullNameEn, employeeNameAr: r.employee.fullNameAr, workedMinutes: 0, netMinutes: 0, days: 0 };
      entry.workedMinutes += r.workedMinutes;
      entry.netMinutes += r.netMinutes;
      entry.days += 1;
      byEmployee.set(r.employeeId, entry);
    }
    return { from: start.toISOString(), to: end.toISOString(), items: [...byEmployee.values()], total: byEmployee.size };
  }

  /** Monthly payroll totals across runs in the window. */
  async reportPayroll(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId, createdAt: { gte: start, lte: end } },
      include: { period: { select: { code: true, nameEn: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      items: runs.map((r) => ({ id: r.id, runNumber: r.runNumber, status: r.status, periodCode: r.period.code, employeeCount: r.employeeCount, grossMinor: r.grossMinor, allowancesMinor: r.allowancesMinor, deductionsMinor: r.deductionsMinor, netMinor: r.netMinor, currency: r.currency, createdAt: r.createdAt.toISOString() })),
      total: runs.length,
    };
  }

  /** Deductions and allowances by component code across posted runs. */
  async reportDeductionsAllowances(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const lines = await this.prisma.payslipLine.findMany({
      where: { payslip: { companyId, payrollRun: { createdAt: { gte: start, lte: end }, status: { in: ['POSTED', 'LOCKED'] } } } },
      select: { type: true, code: true, nameEn: true, nameAr: true, amountMinor: true },
    });
    const byCode = new Map<string, { type: string; code: string; nameEn: string; nameAr: string; totalMinor: number; count: number }>();
    for (const l of lines) {
      const entry = byCode.get(l.code) ?? { type: l.type, code: l.code, nameEn: l.nameEn, nameAr: l.nameAr, totalMinor: 0, count: 0 };
      entry.totalMinor += l.amountMinor;
      entry.count += 1;
      byCode.set(l.code, entry);
    }
    return { from: start.toISOString(), to: end.toISOString(), items: [...byCode.values()], total: byCode.size };
  }

  /** A roster of employees with their current salary, for the payroll register. */
  async reportEmployeePayroll(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      include: { salaryStructures: { where: { isActive: true }, include: { components: true }, take: 1 }, department: { select: { nameEn: true, nameAr: true } } },
      orderBy: { code: 'asc' },
    });
    return {
      items: employees.map((e) => {
        const s = e.salaryStructures[0];
        const allowances = (s?.components ?? []).filter((c) => c.type === 'ALLOWANCE');
        const deductions = (s?.components ?? []).filter((c) => c.type === 'DEDUCTION');
        return {
          employeeId: e.id,
          employeeCode: e.code,
          employeeNameEn: e.fullNameEn,
          employeeNameAr: e.fullNameAr,
          departmentNameEn: e.department?.nameEn ?? null,
          departmentNameAr: e.department?.nameAr ?? null,
          status: e.status,
          basicMinor: s?.basicMinor ?? 0,
          allowancesMinor: sumMinor(allowances.map((c) => (c.isPercentage ? Math.round((s!.basicMinor * c.percentBp) / 10000) : c.amountMinor))),
          deductionsMinor: sumMinor(deductions.map((c) => (c.isPercentage ? Math.round((s!.basicMinor * c.percentBp) / 10000) : c.amountMinor))),
          currency: s?.currency ?? 'BHD',
        };
      }),
      total: employees.length,
    };
  }

  /** Payroll cost grouped by company, department and branch. */
  async reportPayrollCost(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const { start, end } = await this.reportWindow(companyId, query.from, query.to);
    const payslips = await this.prisma.payslip.findMany({
      where: { companyId, payrollRun: { createdAt: { gte: start, lte: end }, status: { in: ['POSTED', 'LOCKED'] } } },
      include: { employee: { select: { department: { select: { nameEn: true, nameAr: true } }, branch: { select: { nameEn: true, nameAr: true } } } } },
    });
    const byDepartment = new Map<string, { nameEn: string; nameAr: string; grossMinor: number; netMinor: number; headcount: number }>();
    const byBranch = new Map<string, { nameEn: string; nameAr: string; grossMinor: number; netMinor: number; headcount: number }>();
    let totalGross = 0;
    let totalNet = 0;
    for (const p of payslips) {
      const deptName = p.employee.department?.nameEn ?? 'Unassigned';
      const deptAr = p.employee.department?.nameAr ?? 'غير محدد';
      const d = byDepartment.get(deptName) ?? { nameEn: deptName, nameAr: deptAr, grossMinor: 0, netMinor: 0, headcount: 0 };
      d.grossMinor += p.grossMinor; d.netMinor += p.netMinor; d.headcount += 1;
      byDepartment.set(deptName, d);

      const brName = p.employee.branch?.nameEn ?? 'Unassigned';
      const brAr = p.employee.branch?.nameAr ?? 'غير محدد';
      const b = byBranch.get(brName) ?? { nameEn: brName, nameAr: brAr, grossMinor: 0, netMinor: 0, headcount: 0 };
      b.grossMinor += p.grossMinor; b.netMinor += p.netMinor; b.headcount += 1;
      byBranch.set(brName, b);

      totalGross += p.grossMinor;
      totalNet += p.netMinor;
    }
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      totals: { grossMinor: totalGross, netMinor: totalNet, payslips: payslips.length },
      byDepartment: [...byDepartment.values()],
      byBranch: [...byBranch.values()],
    };
  }

  // ----------------------------------------------------------------- helpers

  /**
   * Assert a payslip may be read by this principal.
   *
   * A holder of the company-wide payslip permission may read any payslip in the
   * tenant. An employee with only the self-service permission may read exactly
   * their own; the check is by the payslip's own `employeeId`, so a peer's
   * payslip id cannot be used to read theirs.
   */
  async assertPayslipReadable(payslipId: string, principal: RequestPrincipal): Promise<void> {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const payslip = await this.prisma.payslip.findFirst({ where: { id: payslipId, companyId }, select: { employeeId: true } });
    if (!payslip) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payslip not found.');
    if (principal.grantedPermissions.includes('erp.hr.payslip.read')) return;
    const employee = await this.prisma.employee.findFirst({ where: { companyId, userId: principal.userId }, select: { id: true } });
    if (!employee || employee.id !== payslip.employeeId) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'You may only read your own payslips.');
    }
  }

  /** Dispatch a report by its slug, for the CSV export route. */
  async runReport(kind: string, query: ListQueryDto, principal: RequestPrincipal) {
    switch (kind) {
      case 'attendance':
        return this.reportAttendance(query, principal);
      case 'late-absence':
        return this.reportLateAbsence(query, principal);
      case 'overtime':
        return this.reportOvertime(query, principal);
      case 'worked-hours':
        return this.reportWorkedHours(query, principal);
      case 'payroll':
        return this.reportPayroll(query, principal);
      case 'deductions-allowances':
        return this.reportDeductionsAllowances(query, principal);
      case 'employee-payroll':
        return this.reportEmployeePayroll(query, principal);
      case 'payroll-cost':
        return this.reportPayrollCost(query, principal);
      default:
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown report "${kind}".`);
    }
  }

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
  secondaryPhone?: string | null;
  terminationDate?: Date | null;
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
    secondaryPhone: e.secondaryPhone ?? null,
    status: e.status,
    hireDate: e.hireDate.toISOString(),
    terminationDate: e.terminationDate ? e.terminationDate.toISOString() : null,
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
  checkInAt: Date | null;
  checkOutAt: Date | null;
  lateMinutes?: number;
  earlyLeaveMinutes?: number;
  breakMinutes?: number;
  netMinutes?: number;
  checkInSource?: string | null;
  checkOutSource?: string | null;
  checkInDistanceM?: number | null;
  checkInSiteId?: string | null;
  fallbackReason?: string | null;
  employee?: { code: string; fullNameEn: string; fullNameAr: string } | null;
}) {
  return {
    id: a.id,
    employeeId: a.employeeId,
    employeeCode: a.employee?.code ?? null,
    employeeNameEn: a.employee?.fullNameEn ?? null,
    employeeNameAr: a.employee?.fullNameAr ?? null,
    workDate: a.workDate.toISOString(),
    checkInAt: a.checkInAt ? a.checkInAt.toISOString() : null,
    checkOutAt: a.checkOutAt ? a.checkOutAt.toISOString() : null,
    workedMinutes: a.workedMinutes,
    overtimeMinutes: a.overtimeMinutes,
    lateMinutes: a.lateMinutes ?? 0,
    earlyLeaveMinutes: a.earlyLeaveMinutes ?? 0,
    breakMinutes: a.breakMinutes ?? 0,
    netMinutes: a.netMinutes ?? 0,
    checkInSource: a.checkInSource ?? null,
    checkOutSource: a.checkOutSource ?? null,
    checkInDistanceM: a.checkInDistanceM ?? null,
    checkInSiteId: a.checkInSiteId ?? null,
    fallbackReason: a.fallbackReason ?? null,
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

function toPayslipDto(p: {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeNameEn: string;
  employeeNameAr: string;
  basicMinor: number;
  allowancesMinor: number;
  deductionsMinor: number;
  grossMinor: number;
  netMinor: number;
  currency: string;
  advanceDeductionMinor: number;
  overtimeMinutes: number;
  lateMinutes: number;
  absenceDays: number;
  workedMinutes: number;
  createdAt: Date;
  lines?: Array<{ type: string; code: string; nameEn: string; nameAr: string; amountMinor: number; sortOrder: number }>;
  payrollRun?: { runNumber: string; status: string; period?: { code: string; nameEn: string; nameAr: string } | null } | null;
}) {
  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeCode: p.employeeCode,
    employeeNameEn: p.employeeNameEn,
    employeeNameAr: p.employeeNameAr,
    basicMinor: p.basicMinor,
    allowancesMinor: p.allowancesMinor,
    deductionsMinor: p.deductionsMinor,
    grossMinor: p.grossMinor,
    netMinor: p.netMinor,
    currency: p.currency,
    advanceDeductionMinor: p.advanceDeductionMinor,
    overtimeMinutes: p.overtimeMinutes,
    lateMinutes: p.lateMinutes,
    absenceDays: p.absenceDays,
    workedMinutes: p.workedMinutes,
    runNumber: p.payrollRun?.runNumber ?? null,
    runStatus: p.payrollRun?.status ?? null,
    periodCode: p.payrollRun?.period?.code ?? null,
    periodNameEn: p.payrollRun?.period?.nameEn ?? null,
    periodNameAr: p.payrollRun?.period?.nameAr ?? null,
    createdAt: p.createdAt.toISOString(),
    lines: p.lines?.map((l) => ({ type: l.type, code: l.code, nameEn: l.nameEn, nameAr: l.nameAr, amountMinor: l.amountMinor, sortOrder: l.sortOrder })) ?? [],
  };
}
