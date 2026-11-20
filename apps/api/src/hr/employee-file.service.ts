import { Injectable } from '@nestjs/common';
import { fromMinor, sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { SALARY_READ_PERMISSION } from './hr.dto';
import type {
  CreateBonusDto,
  CreatePenaltyDto,
  FileRangeQueryDto,
  UpdateBonusDto,
  UpdatePenaltyDto,
} from './hr.dto';

/**
 * The employee electronic file.
 *
 * Every tab reads the records the rest of HR already writes — payslips come from
 * payroll runs, leave from leave requests, bonuses from the register payroll
 * consumes. Nothing here keeps a second copy of a figure, so a payslip printed
 * from the file and one printed from payroll cannot disagree.
 *
 * Pay, bank details and the payroll ledger sit behind `erp.hr.salary.read` on
 * top of the ordinary HR read permission, so an HR officer can run the file
 * without seeing what anyone earns. A caller without it gets the field omitted
 * rather than blanked, so the screen can tell "not recorded" from "not allowed".
 */

function payslipStatus(runStatus: string): 'DUE' | 'APPROVED' | 'PAID' {
  if (runStatus === 'POSTED' || runStatus === 'LOCKED') return 'PAID';
  if (runStatus === 'APPROVED') return 'APPROVED';
  return 'DUE';
}

@Injectable()
export class EmployeeFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly context: ErpContextService,
  ) {}

  private canSeeSalary(principal: RequestPrincipal): boolean {
    return principal.grantedPermissions.includes(SALARY_READ_PERMISSION);
  }

  private assertSalaryAccess(principal: RequestPrincipal): void {
    if (!this.canSeeSalary(principal)) {
      throw forbidden(
        ERROR_CODES.FORBIDDEN_PERMISSION,
        'Reading pay, bank details or the payroll ledger requires the erp.hr.salary.read permission.',
      );
    }
  }

  /** Resolve the employee inside the caller's tenant, or 404 without leaking it exists. */
  private async employee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      include: {
        department: { select: { nameEn: true, nameAr: true } },
        jobTitle: { select: { nameEn: true, nameAr: true } },
        branch: { select: { nameEn: true, nameAr: true } },
        manager: { select: { code: true, fullNameEn: true, fullNameAr: true } },
        contracts: { orderBy: { startDate: 'desc' } },
      },
    });
    if (!employee) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Employee not found.');
    return employee;
  }

  // ------------------------------------------------------------ tab counts

  async counts(employeeId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);
    const [payslips, leave, penalties, bonuses, attendance] = await Promise.all([
      this.prisma.payslip.count({ where: { companyId, employeeId } }),
      this.prisma.leaveRequest.count({ where: { companyId, employeeId } }),
      this.prisma.employeePenalty.count({ where: { companyId, employeeId } }),
      this.prisma.employeeBonus.count({ where: { companyId, employeeId } }),
      this.prisma.attendanceRecord.count({ where: { companyId, employeeId } }),
    ]);
    return { payslips, leave, penalties, bonuses, attendance };
  }

  // ---------------------------------------------------------- personal card

  async personalCard(employeeId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.employee(companyId, employeeId);
    const salaryVisible = this.canSeeSalary(principal);

    const activeStructure = salaryVisible
      ? await this.prisma.salaryStructure.findFirst({
          where: { companyId, employeeId, isActive: true },
          include: { components: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { effectiveFrom: 'desc' },
        })
      : null;

    const allowancesMinor = activeStructure
      ? sumMinor(activeStructure.components.filter((c) => c.type === 'ALLOWANCE').map((c) => c.amountMinor))
      : 0;
    const deductionsMinor = activeStructure
      ? sumMinor(activeStructure.components.filter((c) => c.type === 'DEDUCTION').map((c) => c.amountMinor))
      : 0;

    return {
      employee: {
        id: employee.id,
        code: employee.code,
        fullNameEn: employee.fullNameEn,
        fullNameAr: employee.fullNameAr,
        email: employee.email,
        phone: employee.phone,
        secondaryPhone: employee.secondaryPhone,
        nationalId: employee.nationalId,
        dateOfBirth: employee.dateOfBirth?.toISOString() ?? null,
        gender: employee.gender,
        nationality: employee.nationality,
        addressLine: employee.addressLine,
        status: employee.status,
        hireDate: employee.hireDate.toISOString(),
        terminationDate: employee.terminationDate?.toISOString() ?? null,
        notes: employee.notes,
        departmentId: employee.departmentId,
        departmentNameEn: employee.department?.nameEn ?? null,
        departmentNameAr: employee.department?.nameAr ?? null,
        jobTitleId: employee.jobTitleId,
        jobTitleNameEn: employee.jobTitle?.nameEn ?? null,
        jobTitleNameAr: employee.jobTitle?.nameAr ?? null,
        branchId: employee.branchId,
        branchNameEn: employee.branch?.nameEn ?? null,
        branchNameAr: employee.branch?.nameAr ?? null,
        managerCode: employee.manager?.code ?? null,
        managerNameEn: employee.manager?.fullNameEn ?? null,
        managerNameAr: employee.manager?.fullNameAr ?? null,
      },
      compensation: salaryVisible
        ? {
            visible: true as const,
            basicMinor: activeStructure?.basicMinor ?? null,
            allowancesMinor,
            deductionsMinor,
            currency: activeStructure?.currency ?? null,
            effectiveFrom: activeStructure?.effectiveFrom.toISOString() ?? null,
            components:
              activeStructure?.components.map((c) => ({
                id: c.id,
                type: c.type,
                code: c.code,
                nameEn: c.nameEn,
                nameAr: c.nameAr,
                amountMinor: c.amountMinor,
                isPercentage: c.isPercentage,
                percentBp: c.percentBp,
              })) ?? [],
          }
        : { visible: false as const, reason: SALARY_READ_PERMISSION },
      contracts: employee.contracts.map((c) => ({
        id: c.id,
        contractNumber: c.contractNumber,
        type: c.type,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
        probationDays: c.probationDays,
        ...(salaryVisible ? { baseSalaryMinor: c.baseSalaryMinor, currency: c.currency } : {}),
      })),
    };
  }

  // ------------------------------------------------------------ payroll ledger

  /**
   * The payroll ledger for one employee.
   *
   * A payslip has no status of its own: it is DUE while its run is a draft,
   * APPROVED once the run is approved and PAID once the run is posted or locked.
   */
  async payrollLedger(employeeId: string, query: FileRangeQueryDto, principal: RequestPrincipal) {
    this.assertSalaryAccess(principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && to < from) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'End date must not precede the start date.');
    }

    const rows = await this.prisma.payslip.findMany({
      where: {
        companyId,
        employeeId,
        ...(from || to
          ? {
              payrollRun: {
                period: {
                  ...(from ? { startDate: { gte: from } } : {}),
                  ...(to ? { endDate: { lte: to } } : {}),
                },
              },
            }
          : {}),
      },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        payrollRun: {
          include: {
            period: { select: { code: true, nameEn: true, nameAr: true, startDate: true, endDate: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = rows.map((p) => ({
      id: p.id,
      payrollRunId: p.payrollRunId,
      runNumber: p.payrollRun.runNumber,
      runStatus: p.payrollRun.status,
      paymentStatus: payslipStatus(p.payrollRun.status),
      periodCode: p.payrollRun.period.code,
      periodNameEn: p.payrollRun.period.nameEn,
      periodNameAr: p.payrollRun.period.nameAr,
      periodStart: p.payrollRun.period.startDate.toISOString(),
      periodEnd: p.payrollRun.period.endDate.toISOString(),
      paidAt: p.payrollRun.postedAt?.toISOString() ?? null,
      basicMinor: p.basicMinor,
      allowancesMinor: p.allowancesMinor,
      deductionsMinor: p.deductionsMinor,
      grossMinor: p.grossMinor,
      netMinor: p.netMinor,
      advanceDeductionMinor: p.advanceDeductionMinor,
      overtimeMinutes: p.overtimeMinutes,
      lateMinutes: p.lateMinutes,
      absenceDays: p.absenceDays,
      paidLeaveDays: p.paidLeaveDays,
      workedMinutes: p.workedMinutes,
      currency: p.currency,
      lines: p.lines.map((l) => ({
        id: l.id,
        type: l.type,
        code: l.code,
        nameEn: l.nameEn,
        nameAr: l.nameAr,
        amountMinor: l.amountMinor,
      })),
    }));

    return {
      items,
      totals: {
        basicMinor: sumMinor(items.map((i) => i.basicMinor)),
        allowancesMinor: sumMinor(items.map((i) => i.allowancesMinor)),
        deductionsMinor: sumMinor(items.map((i) => i.deductionsMinor)),
        grossMinor: sumMinor(items.map((i) => i.grossMinor)),
        netMinor: sumMinor(items.map((i) => i.netMinor)),
        payslipCount: items.length,
        currency: items[0]?.currency ?? null,
      },
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    };
  }

  // -------------------------------------------------------------------- leave

  async leave(employeeId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);
    const year = new Date().getUTCFullYear();
    const [requests, balances] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { companyId, employeeId },
        include: { leaveType: { select: { code: true, nameEn: true, nameAr: true, isPaid: true } } },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.leaveBalance.findMany({
        where: { companyId, employeeId, year },
        include: { leaveType: { select: { code: true, nameEn: true, nameAr: true } } },
        orderBy: { leaveType: { code: 'asc' } },
      }),
    ]);

    const approverIds = [...new Set(requests.map((r) => r.approvedById).filter((x): x is string => Boolean(x)))];
    const approvers = approverIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, fullNameEn: true, fullNameAr: true },
        })
      : [];
    const approverName = new Map(approvers.map((u) => [u.id, u]));

    return {
      items: requests.map((r) => ({
        id: r.id,
        leaveTypeId: r.leaveTypeId,
        leaveTypeCode: r.leaveType.code,
        leaveTypeNameEn: r.leaveType.nameEn,
        leaveTypeNameAr: r.leaveType.nameAr,
        isPaid: r.leaveType.isPaid,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        days: r.days,
        status: r.status,
        reason: r.reason,
        decisionNote: r.decisionNote,
        decidedAt: r.decidedAt?.toISOString() ?? null,
        approvedByNameEn: r.approvedById ? (approverName.get(r.approvedById)?.fullNameEn ?? null) : null,
        approvedByNameAr: r.approvedById ? (approverName.get(r.approvedById)?.fullNameAr ?? null) : null,
      })),
      balances: balances.map((b) => ({
        id: b.id,
        leaveTypeId: b.leaveTypeId,
        leaveTypeCode: b.leaveType.code,
        leaveTypeNameEn: b.leaveType.nameEn,
        leaveTypeNameAr: b.leaveType.nameAr,
        year: b.year,
        entitledDays: b.entitledDays,
        accruedDays: b.accruedDays,
        usedDays: b.usedDays,
        pendingDays: b.pendingDays,
        remainingDays: b.entitledDays + b.accruedDays - b.usedDays - b.pendingDays,
      })),
      year,
    };
  }

  // ---------------------------------------------------------------- penalties

  async listPenalties(employeeId: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);
    const salaryVisible = this.canSeeSalary(principal);
    const rows = await this.prisma.employeePenalty.findMany({
      where: { companyId, employeeId },
      orderBy: { effectiveDate: 'desc' },
    });
    return {
      items: rows.map((p) => ({
        id: p.id,
        actionType: p.actionType,
        reason: p.reason,
        effectiveDate: p.effectiveDate.toISOString(),
        ...(salaryVisible ? { amountMinor: p.amountMinor, currency: p.currency } : {}),
        decidedByName: p.decidedByName,
        notes: p.notes,
        createdAt: p.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  }

  async createPenalty(
    employeeId: string,
    dto: CreatePenaltyDto,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);
    if ((dto.amountMinor ?? 0) > 0) this.assertSalaryAccess(principal);
    const created = await this.prisma.employeePenalty.create({
      data: {
        companyId,
        employeeId,
        actionType: dto.actionType,
        reason: dto.reason,
        effectiveDate: new Date(dto.effectiveDate),
        amountMinor: dto.amountMinor ?? 0,
        currency: dto.currency ?? (await this.context.companyCurrency(companyId)),
        decidedByName: dto.decidedByName ?? null,
        notes: dto.notes ?? null,
        createdById: actor.userId,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.penalty_recorded',
      targetType: 'EMPLOYEE_PENALTY',
      targetId: created.id,
      summary: `Recorded ${created.actionType} for employee`,
    });
    return created;
  }

  async updatePenalty(
    id: string,
    dto: UpdatePenaltyDto,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.employeePenalty.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Disciplinary action not found.');
    if (dto.amountMinor !== undefined && dto.amountMinor > 0) this.assertSalaryAccess(principal);
    const updated = await this.prisma.employeePenalty.update({
      where: { id },
      data: {
        ...(dto.actionType !== undefined ? { actionType: dto.actionType } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.effectiveDate !== undefined ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        ...(dto.amountMinor !== undefined ? { amountMinor: dto.amountMinor } : {}),
        ...(dto.decidedByName !== undefined ? { decidedByName: dto.decidedByName } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.penalty_updated',
      targetType: 'EMPLOYEE_PENALTY',
      targetId: id,
      summary: `Updated ${updated.actionType}`,
    });
    return updated;
  }

  async deletePenalty(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.employeePenalty.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Disciplinary action not found.');
    await this.prisma.employeePenalty.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.penalty_deleted',
      targetType: 'EMPLOYEE_PENALTY',
      targetId: id,
      summary: `Deleted ${existing.actionType}`,
    });
    return { id };
  }

  // ------------------------------------------------------------------ bonuses

  async listBonuses(employeeId: string, principal: RequestPrincipal) {
    this.assertSalaryAccess(principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);
    const rows = await this.prisma.employeeBonus.findMany({
      where: { companyId, employeeId },
      include: { payPeriod: { select: { code: true, nameEn: true, nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((b) => ({
        id: b.id,
        type: b.type,
        reason: b.reason,
        amountMinor: b.amountMinor,
        currency: b.currency,
        payPeriodId: b.payPeriodId,
        payPeriodCode: b.payPeriod?.code ?? null,
        payPeriodNameEn: b.payPeriod?.nameEn ?? null,
        payPeriodNameAr: b.payPeriod?.nameAr ?? null,
        approvedAt: b.approvedAt?.toISOString() ?? null,
        payslipId: b.payslipId,
        paid: b.payslipId !== null,
        createdAt: b.createdAt.toISOString(),
      })),
      totals: {
        pendingMinor: sumMinor(rows.filter((b) => !b.approvedAt).map((b) => b.amountMinor)),
        approvedMinor: sumMinor(rows.filter((b) => b.approvedAt && !b.payslipId).map((b) => b.amountMinor)),
        paidMinor: sumMinor(rows.filter((b) => b.payslipId).map((b) => b.amountMinor)),
        currency: rows[0]?.currency ?? null,
      },
    };
  }

  async createBonus(employeeId: string, dto: CreateBonusDto, principal: RequestPrincipal, actor: ActorContext) {
    this.assertSalaryAccess(principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    await this.employee(companyId, employeeId);
    if (dto.payPeriodId) {
      const period = await this.prisma.payrollPeriod.findFirst({ where: { id: dto.payPeriodId, companyId } });
      if (!period) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll period not found.');
    }
    const created = await this.prisma.employeeBonus.create({
      data: {
        companyId,
        employeeId,
        type: dto.type ?? 'BONUS',
        reason: dto.reason,
        amountMinor: dto.amountMinor,
        currency: dto.currency ?? (await this.context.companyCurrency(companyId)),
        payPeriodId: dto.payPeriodId ?? null,
        approvedAt: dto.approveNow ? new Date() : null,
        createdById: actor.userId,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.bonus_created',
      targetType: 'EMPLOYEE_BONUS',
      targetId: created.id,
      summary: `Granted bonus ${fromMinor(created.amountMinor, 2)}`,
    });
    return created;
  }

  async updateBonus(id: string, dto: UpdateBonusDto, principal: RequestPrincipal, actor: ActorContext) {
    this.assertSalaryAccess(principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.employeeBonus.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Bonus not found.');
    if (existing.payslipId) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'A bonus already paid by a payroll run cannot be edited.',
      );
    }
    if (dto.payPeriodId) {
      const period = await this.prisma.payrollPeriod.findFirst({ where: { id: dto.payPeriodId, companyId } });
      if (!period) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payroll period not found.');
    }
    const updated = await this.prisma.employeeBonus.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.amountMinor !== undefined ? { amountMinor: dto.amountMinor } : {}),
        ...(dto.payPeriodId !== undefined ? { payPeriodId: dto.payPeriodId } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.bonus_updated',
      targetType: 'EMPLOYEE_BONUS',
      targetId: id,
      summary: `Updated bonus ${fromMinor(updated.amountMinor, 2)}`,
    });
    return updated;
  }

  /** Approve a pending bonus so the next payroll run consumes it, once. */
  async approveBonus(id: string, principal: RequestPrincipal, actor: ActorContext) {
    this.assertSalaryAccess(principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.employeeBonus.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Bonus not found.');
    if (existing.payslipId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'This bonus has already been paid.');
    if (existing.approvedAt) return existing;
    const approved = await this.prisma.employeeBonus.update({
      where: { id },
      data: { approvedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.bonus_approved',
      targetType: 'EMPLOYEE_BONUS',
      targetId: id,
      summary: `Approved bonus ${fromMinor(approved.amountMinor, 2)}`,
    });
    return approved;
  }

  async deleteBonus(id: string, principal: RequestPrincipal, actor: ActorContext) {
    this.assertSalaryAccess(principal);
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const existing = await this.prisma.employeeBonus.findFirst({ where: { id, companyId } });
    if (!existing) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Bonus not found.');
    if (existing.payslipId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A paid bonus cannot be deleted.');
    await this.prisma.employeeBonus.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'hr.bonus_deleted',
      targetType: 'EMPLOYEE_BONUS',
      targetId: id,
      summary: `Deleted bonus ${fromMinor(existing.amountMinor, 2)}`,
    });
    return { id };
  }

  // ------------------------------------------------------------------ reports

  /**
   * The employee report pack.
   *
   * Every figure is computed from the stored records inside the requested
   * window; an empty window returns zeros, never a sample value.
   */
  async reports(employeeId: string, query: FileRangeQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const employee = await this.employee(companyId, employeeId);
    const salaryVisible = this.canSeeSalary(principal);

    const from = query.from ? new Date(query.from) : new Date(employee.hireDate);
    const to = query.to ? new Date(query.to) : new Date();
    if (to < from) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'End date must not precede the start date.');
    // A bare `YYYY-MM-DD` parses to midnight, which would drop everything
    // recorded later that day. The window closes at the end of the chosen day.
    to.setUTCHours(23, 59, 59, 999);

    const [attendance, leaveRequests, leaveBalances, penalties, bonuses, payslips] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { companyId, employeeId, workDate: { gte: from, lte: to } },
        orderBy: { workDate: 'asc' },
      }),
      this.prisma.leaveRequest.findMany({
        where: { companyId, employeeId, startDate: { lte: to }, endDate: { gte: from } },
        include: { leaveType: { select: { code: true, nameEn: true, nameAr: true } } },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.leaveBalance.findMany({
        where: { companyId, employeeId, year: to.getUTCFullYear() },
        include: { leaveType: { select: { code: true, nameEn: true, nameAr: true } } },
        orderBy: { leaveType: { code: 'asc' } },
      }),
      this.prisma.employeePenalty.findMany({
        where: { companyId, employeeId, effectiveDate: { gte: from, lte: to } },
        orderBy: { effectiveDate: 'asc' },
      }),
      this.prisma.employeeBonus.findMany({
        where: { companyId, employeeId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
      }),
      salaryVisible
        ? this.prisma.payslip.findMany({
            where: {
              companyId,
              employeeId,
              payrollRun: { period: { startDate: { gte: from }, endDate: { lte: to } } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const presentDays = attendance.filter((a) => a.status === 'PRESENT').length;
    const lateDays = attendance.filter((a) => a.status === 'LATE').length;
    const absentDays = attendance.filter((a) => a.status === 'ABSENT').length;
    const halfDays = attendance.filter((a) => a.status === 'HALF_DAY').length;
    const workedMinutes = sumMinor(attendance.map((a) => a.workedMinutes));
    const overtimeMinutes = sumMinor(attendance.map((a) => a.overtimeMinutes));
    const lateMinutes = sumMinor(attendance.map((a) => a.lateMinutes));
    const earlyLeaveMinutes = sumMinor(attendance.map((a) => a.earlyLeaveMinutes));
    const approvedLeaveDays = leaveRequests.filter((l) => l.status === 'APPROVED').reduce((sum, l) => sum + l.days, 0);

    return {
      employee: {
        id: employee.id,
        code: employee.code,
        fullNameEn: employee.fullNameEn,
        fullNameAr: employee.fullNameAr,
        hireDate: employee.hireDate.toISOString(),
        status: employee.status,
      },
      window: { from: from.toISOString(), to: to.toISOString() },
      attendance: {
        records: attendance.map((a) => ({
          id: a.id,
          workDate: a.workDate.toISOString(),
          status: a.status,
          workedMinutes: a.workedMinutes,
          overtimeMinutes: a.overtimeMinutes,
          lateMinutes: a.lateMinutes,
          earlyLeaveMinutes: a.earlyLeaveMinutes,
          checkInAt: a.checkInAt?.toISOString() ?? null,
          checkOutAt: a.checkOutAt?.toISOString() ?? null,
        })),
        summary: {
          recordedDays: attendance.length,
          presentDays,
          lateDays,
          absentDays,
          halfDays,
          workedMinutes,
          overtimeMinutes,
          lateMinutes,
          earlyLeaveMinutes,
        },
      },
      leave: {
        records: leaveRequests.map((l) => ({
          id: l.id,
          leaveTypeCode: l.leaveType.code,
          leaveTypeNameEn: l.leaveType.nameEn,
          leaveTypeNameAr: l.leaveType.nameAr,
          startDate: l.startDate.toISOString(),
          endDate: l.endDate.toISOString(),
          days: l.days,
          status: l.status,
          reason: l.reason,
        })),
        balances: leaveBalances.map((b) => ({
          leaveTypeCode: b.leaveType.code,
          leaveTypeNameEn: b.leaveType.nameEn,
          leaveTypeNameAr: b.leaveType.nameAr,
          year: b.year,
          entitledDays: b.entitledDays,
          accruedDays: b.accruedDays,
          usedDays: b.usedDays,
          pendingDays: b.pendingDays,
          remainingDays: b.entitledDays + b.accruedDays - b.usedDays - b.pendingDays,
        })),
        summary: { approvedDays: approvedLeaveDays, requestCount: leaveRequests.length },
      },
      penalties: {
        records: penalties.map((p) => ({
          id: p.id,
          actionType: p.actionType,
          reason: p.reason,
          effectiveDate: p.effectiveDate.toISOString(),
          ...(salaryVisible ? { amountMinor: p.amountMinor, currency: p.currency } : {}),
          decidedByName: p.decidedByName,
        })),
        summary: {
          count: penalties.length,
          ...(salaryVisible ? { totalAmountMinor: sumMinor(penalties.map((p) => p.amountMinor)) } : {}),
        },
      },
      bonuses: salaryVisible
        ? {
            records: bonuses.map((b) => ({
              id: b.id,
              type: b.type,
              reason: b.reason,
              amountMinor: b.amountMinor,
              currency: b.currency,
              approvedAt: b.approvedAt?.toISOString() ?? null,
              payslipId: b.payslipId,
              paid: b.payslipId !== null,
              createdAt: b.createdAt.toISOString(),
            })),
            summary: {
              count: bonuses.length,
              totalAmountMinor: sumMinor(bonuses.map((b) => b.amountMinor)),
              paidAmountMinor: sumMinor(bonuses.filter((b) => b.payslipId).map((b) => b.amountMinor)),
            },
          }
        : { visible: false as const, reason: SALARY_READ_PERMISSION },
      payroll: salaryVisible
        ? {
            records: payslips.map((p) => ({
              id: p.id,
              payrollRunId: p.payrollRunId,
              basicMinor: p.basicMinor,
              allowancesMinor: p.allowancesMinor,
              deductionsMinor: p.deductionsMinor,
              grossMinor: p.grossMinor,
              netMinor: p.netMinor,
              currency: p.currency,
              workedMinutes: p.workedMinutes,
              overtimeMinutes: p.overtimeMinutes,
              createdAt: p.createdAt.toISOString(),
            })),
            summary: {
              payslipCount: payslips.length,
              grossMinor: sumMinor(payslips.map((p) => p.grossMinor)),
              deductionsMinor: sumMinor(payslips.map((p) => p.deductionsMinor)),
              netMinor: sumMinor(payslips.map((p) => p.netMinor)),
              currency: payslips[0]?.currency ?? null,
            },
          }
        : { visible: false as const, reason: SALARY_READ_PERMISSION },
    };
  }
}
