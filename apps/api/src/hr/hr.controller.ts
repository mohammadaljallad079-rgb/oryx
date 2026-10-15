import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
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
import {
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
  constructor(private readonly hr: HrService) {}

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

  // --------------------------------------------------------------- reporting
  @Get('dashboard')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.report.read')
  @ApiOperation({ summary: 'Workforce dashboard' })
  dashboard(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.workforceDashboard(p, companyId);
  }
}
