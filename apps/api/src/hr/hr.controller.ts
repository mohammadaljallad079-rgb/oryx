import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { HrService } from './hr.service';
import { EmployeeFileService } from './employee-file.service';
import {
  AdjustBalanceDto,
  CreateAdvanceDto,
  CreateBonusDto,
  CreatePenaltyDto,
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
  FileRangeQueryDto,
  ListQueryDto,
  RecordAttendanceDto,
  RequestLeaveDto,
  SettleAdvanceDto,
  StartLifecycleDto,
  UpdateBonusDto,
  UpdateEmployeeDto,
  UpdatePenaltyDto,
} from './hr.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

class ToggleItemDto {
  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}

@ApiTags('hr')
@ApiBearerAuth()
@RequireModule('human_resources')
@Controller('hr')
export class HrController {
  constructor(
    private readonly hr: HrService,
    private readonly file: EmployeeFileService,
  ) {}

  // ------------------------------------------------------------ departments
  @Get('departments')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.department.manage')
  @ApiOperation({ summary: 'List departments' })
  departments(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listDepartments(query, p);
  }

  @Post('departments')
  @RequirePermissions('erp.hr.department.manage')
  @ApiOperation({ summary: 'Create a department' })
  createDepartment(@Body() dto: CreateDepartmentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createDepartment(dto, p, actorFrom(p, req));
  }

  @Get('job-titles')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.department.manage')
  @ApiOperation({ summary: 'List job titles' })
  jobTitles(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listJobTitles(query, p);
  }

  @Post('job-titles')
  @RequirePermissions('erp.hr.department.manage')
  @ApiOperation({ summary: 'Create a job title' })
  createJobTitle(@Body() dto: CreateJobTitleDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createJobTitle(dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- employees
  @Get('employees')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.employee.manage')
  @ApiOperation({ summary: 'List employees' })
  employees(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listEmployees(query, p);
  }

  /**
   * The number the next employee will receive.
   *
   * The form shows it read-only: the operator never types an employee number,
   * and the value is a preview because the real allocation happens inside the
   * create transaction.
   */
  @Get('employees/next-code')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Preview the next employee number' })
  nextEmployeeCode(@CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.previewEmployeeCode(p);
  }

  @Get('employees/:id')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.employee.manage')
  @ApiOperation({ summary: 'Employee detail' })
  employee(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.getEmployee(id, p);
  }

  @Post('employees')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Create an employee with an onboarding checklist' })
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createEmployee(dto, p, actorFrom(p, req));
  }

  @Patch('employees/:id')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Update an employee' })
  updateEmployee(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.updateEmployee(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- contracts
  @Post('employees/:id/contracts')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Add an employment contract' })
  createContract(@Param('id') id: string, @Body() dto: CreateContractDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createContract(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- documents
  @Get('employees/:id/documents')
  @RequirePermissions('erp.hr.document.read')
  @ApiOperation({ summary: 'List employee documents (confidential ones need an extra permission)' })
  documents(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listDocuments(id, p);
  }

  @Post('employees/:id/documents')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Add an employee document' })
  createDocument(@Param('id') id: string, @Body() dto: CreateDocumentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createDocument(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- lifecycle
  @Post('employees/:id/lifecycle')
  @RequirePermissions('erp.hr.lifecycle.manage')
  @ApiOperation({ summary: 'Start an onboarding or offboarding checklist' })
  startLifecycle(@Param('id') id: string, @Body() dto: StartLifecycleDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.startLifecycle(id, dto, p, actorFrom(p, req));
  }

  @Patch('lifecycle-items/:id')
  @RequirePermissions('erp.hr.lifecycle.manage')
  @ApiOperation({ summary: 'Complete or reopen a checklist item' })
  toggleItem(@Param('id') id: string, @Body() dto: ToggleItemDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.toggleLifecycleItem(id, dto.isDone ?? true, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------------ leave
  @Get('leave-types')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.leave.manage')
  @ApiOperation({ summary: 'List leave types' })
  leaveTypes(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listLeaveTypes(query, p);
  }

  @Post('leave-types')
  @RequirePermissions('erp.hr.leave.manage')
  @ApiOperation({ summary: 'Create a leave type' })
  createLeaveType(@Body() dto: CreateLeaveTypeDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createLeaveType(dto, p, actorFrom(p, req));
  }

  @Post('leave-balances/adjust')
  @RequirePermissions('erp.hr.leave.manage')
  @ApiOperation({ summary: 'Set or adjust a leave balance' })
  adjustBalance(@Body() dto: AdjustBalanceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.adjustBalance(dto, p, actorFrom(p, req));
  }

  @Get('leave-requests')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.leave.approve', 'erp.hr.leave.request')
  @ApiOperation({ summary: 'List leave requests' })
  leaveRequests(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listLeaveRequests(query, p);
  }

  @Post('leave-requests')
  @RequirePermissions('erp.hr.leave.request')
  @ApiOperation({ summary: 'Submit a leave request (balance is enforced)' })
  requestLeave(@Body() dto: RequestLeaveDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.requestLeave(dto, p, actorFrom(p, req));
  }

  @Post('leave-requests/:id/decide')
  @RequirePermissions('erp.hr.leave.approve')
  @ApiOperation({ summary: 'Approve or reject a leave request' })
  decideLeave(@Param('id') id: string, @Body() dto: DecideLeaveDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.decideLeave(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------- attendance
  @Get('shifts')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.attendance.manage')
  @ApiOperation({ summary: 'List shifts' })
  shifts(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listShifts(query, p);
  }

  @Post('shifts')
  @RequirePermissions('erp.hr.attendance.manage')
  @ApiOperation({ summary: 'Create a shift' })
  createShift(@Body() dto: CreateShiftDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createShift(dto, p, actorFrom(p, req));
  }

  @Get('attendance')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.attendance.manage')
  @ApiOperation({ summary: 'List attendance records' })
  attendance(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listAttendance(query, p);
  }

  @Post('attendance')
  @RequirePermissions('erp.hr.attendance.manage')
  @ApiOperation({ summary: 'Record attendance and overtime for one day' })
  recordAttendance(@Body() dto: RecordAttendanceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.recordAttendance(dto, p, actorFrom(p, req));
  }

  // --------------------------------------------------------- salary structure
  @Post('salary-structures')
  @RequirePermissions('erp.hr.salary.manage')
  @ApiOperation({ summary: 'Set an employee salary structure (supersedes the previous one)' })
  createSalaryStructure(@Body() dto: CreateSalaryStructureDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createSalaryStructure(dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------------- payroll
  @Get('payroll-periods')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.payroll.run')
  @ApiOperation({ summary: 'List payroll periods' })
  payrollPeriods(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listPayrollPeriods(query, p);
  }

  @Post('payroll-periods')
  @RequirePermissions('erp.hr.payroll.run')
  @ApiOperation({ summary: 'Create a payroll period' })
  createPayrollPeriod(@Body() dto: CreatePayrollPeriodDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createPayrollPeriod(dto, p, actorFrom(p, req));
  }

  @Get('payroll-runs')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.payroll.run', 'erp.hr.payroll.approve')
  @ApiOperation({ summary: 'List payroll runs' })
  payrollRuns(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listPayrollRuns(query, p);
  }

  @Get('payroll-runs/:id')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.payroll.run', 'erp.hr.payroll.approve')
  @ApiOperation({ summary: 'Payroll run detail with payslips' })
  payrollRun(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.getPayrollRun(id, p);
  }

  @Post('payroll-runs')
  @RequirePermissions('erp.hr.payroll.run')
  @ApiOperation({ summary: 'Create and calculate a payroll run (snapshots each salary structure)' })
  createPayrollRun(@Body() dto: CreatePayrollRunDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createPayrollRun(dto, p, actorFrom(p, req));
  }

  @Post('payroll-runs/:id/approve')
  @RequirePermissions('erp.hr.payroll.approve')
  @ApiOperation({ summary: 'Approve and post a payroll run to the ledger (atomic, idempotent)' })
  approvePayrollRun(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.approvePayrollRun(id, p, actorFrom(p, req));
  }

  @Post('payroll-runs/:id/lock')
  @RequirePermissions('erp.hr.payroll.approve')
  @ApiOperation({ summary: 'Lock a posted run and close its period' })
  lockPayrollRun(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.lockPayrollRun(id, p, actorFrom(p, req));
  }

  @Get('payroll-runs/:id/payslips')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.payroll.approve')
  @ApiOperation({ summary: 'Payslips for a run' })
  payslips(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listPayslips(id, p);
  }

  // --------------------------------------------------------------- advances
  @Get('advances')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.advance.manage')
  @ApiOperation({ summary: 'List employee advances' })
  advances(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listAdvances(query, p);
  }

  @Post('advances')
  @RequirePermissions('erp.hr.advance.manage')
  @ApiOperation({ summary: 'Issue an advance and post it' })
  createAdvance(@Body() dto: CreateAdvanceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createAdvance(dto, p, actorFrom(p, req));
  }

  @Post('advances/:id/settle')
  @RequirePermissions('erp.hr.advance.manage')
  @ApiOperation({ summary: 'Settle part of an advance' })
  settleAdvance(@Param('id') id: string, @Body() dto: SettleAdvanceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.settleAdvance(id, dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------- employee file (tabs)
  @Get('employees/:id/file/counts')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.employee.manage')
  @ApiOperation({ summary: 'Tab badge counts for the employee electronic file' })
  fileCounts(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.counts(id, p);
  }

  @Get('employees/:id/file/personal-card')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.employee.manage')
  @ApiOperation({ summary: 'Personal card tab (salary and bank details need erp.hr.salary.read)' })
  filePersonalCard(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.personalCard(id, p);
  }

  @Get('employees/:id/file/payroll')
  @RequirePermissions('erp.hr.salary.read')
  @ApiOperation({ summary: 'Payroll ledger tab, optionally narrowed to a period window' })
  filePayroll(@Param('id') id: string, @Query() query: FileRangeQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.payrollLedger(id, query, p);
  }

  @Get('employees/:id/file/leave')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.employee.manage')
  @ApiOperation({ summary: 'Leave tab: requests and balances' })
  fileLeave(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.leave(id, p);
  }

  @Get('employees/:id/file/penalties')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Disciplinary actions tab' })
  filePenalties(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.listPenalties(id, p);
  }

  @Post('employees/:id/file/penalties')
  @RequirePermissions('erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Record a disciplinary action' })
  createPenalty(@Param('id') id: string, @Body() dto: CreatePenaltyDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.createPenalty(id, dto, p, actorFrom(p, req));
  }

  @Patch('file/penalties/:penaltyId')
  @RequirePermissions('erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Edit a disciplinary action' })
  updatePenalty(@Param('penaltyId') penaltyId: string, @Body() dto: UpdatePenaltyDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.updatePenalty(penaltyId, dto, p, actorFrom(p, req));
  }

  @Delete('file/penalties/:penaltyId')
  @RequirePermissions('erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Delete a disciplinary action' })
  deletePenalty(@Param('penaltyId') penaltyId: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.deletePenalty(penaltyId, p, actorFrom(p, req));
  }

  @Get('employees/:id/file/bonuses')
  @RequirePermissions('erp.hr.salary.read')
  @ApiOperation({ summary: 'Bonuses and incentives tab' })
  fileBonuses(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.listBonuses(id, p);
  }

  @Post('employees/:id/file/bonuses')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Grant a bonus or incentive' })
  createBonus(@Param('id') id: string, @Body() dto: CreateBonusDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.createBonus(id, dto, p, actorFrom(p, req));
  }

  @Patch('file/bonuses/:bonusId')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Edit an unpaid bonus' })
  updateBonus(@Param('bonusId') bonusId: string, @Body() dto: UpdateBonusDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.updateBonus(bonusId, dto, p, actorFrom(p, req));
  }

  @Post('file/bonuses/:bonusId/approve')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Approve a bonus so the next payroll run consumes it' })
  approveBonus(@Param('bonusId') bonusId: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.approveBonus(bonusId, p, actorFrom(p, req));
  }

  @Delete('file/bonuses/:bonusId')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Delete an unpaid bonus' })
  deleteBonus(@Param('bonusId') bonusId: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.file.deleteBonus(bonusId, p, actorFrom(p, req));
  }

  @Get('employees/:id/file/reports')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Employee report pack for a date window' })
  fileReports(@Param('id') id: string, @Query() query: FileRangeQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.reports(id, query, p);
  }

  // --------------------------------------------------------------- reporting
  @Get('dashboard')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.report.read')
  @ApiOperation({ summary: 'Workforce dashboard' })
  dashboard(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.workforceDashboard(p, companyId);
  }
}
