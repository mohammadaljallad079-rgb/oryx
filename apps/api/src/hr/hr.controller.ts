import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ATTACHMENT_MAX_BYTES } from '@oryx/shared';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import type { UploadedFileLike } from '../attachments/attachments.service';
import { HrService } from './hr.service';
import { HrExportService } from './hr-export.service';
import { EmployeeFileService } from './employee-file.service';
import {
  AdjustBalanceDto,
  CreateAdvanceDto,
  CreateBonusDto,
  CreateContractDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateDocumentDto,
  CreateEmployeeDto,
  CreateJobTitleDto,
  CreateLeaveTypeDto,
  CreatePayrollPeriodDto,
  CreatePayrollRunDto,
  CreatePenaltyDto,
  CreateSalaryStructureDto,
  CreateShiftDto,
  CreateWorkSiteDto,
  DecideLeaveDto,
  FileRangeQueryDto,
  ListQueryDto,
  RecordAttendanceDto,
  RequestLeaveDto,
  SelfBreakDto,
  SelfCheckInDto,
  SelfCheckOutDto,
  SettleAdvanceDto,
  StartLifecycleDto,
  UpdateAttendancePolicyDto,
  UpdateBonusDto,
  UpdateEmployeeDto,
  UpdateLeaveRequestDto,
  UpdatePenaltyDto,
  UpdateWorkSiteDto,
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
    private readonly hrExport: HrExportService,
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

  @Patch('departments/:id')
  @RequirePermissions('erp.hr.department.manage')
  @ApiOperation({ summary: 'Update a department within the current company' })
  updateDepartment(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.updateDepartment(id, dto, p, actorFrom(p, req));
  }

  @Delete('departments/:id')
  @RequirePermissions('erp.hr.department.manage')
  @ApiOperation({ summary: 'Permanently delete an unused department' })
  deleteDepartment(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.deleteDepartment(id, p, actorFrom(p, req));
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

  @Delete('employees/:id')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Delete an employee that has no payroll history' })
  deleteEmployee(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.deleteEmployee(id, p, actorFrom(p, req));
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
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Add an employee document, optionally with an uploaded file' })
  createDocument(
    @Param('id') id: string,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: UploadedFileLike,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.hr.createDocument(id, dto, file, p, actorFrom(p, req));
  }

  @Get('employees/:id/documents/:documentId/file')
  @RequirePermissions('erp.hr.document.read')
  @ApiOperation({ summary: 'Preview or download an employee document file' })
  async documentFile(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.hr.resolveDocumentFile(id, documentId, p);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    // `inline` lets the browser preview a PDF or image; the filename is
    // RFC 5987 encoded so a name with spaces or Arabic survives the header.
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    this.hr.streamDocumentFile(file.path).pipe(res);
  }

  @Delete('employees/:id/documents/:documentId')
  @RequirePermissions('erp.hr.employee.manage')
  @ApiOperation({ summary: 'Remove an employee document and any stored file' })
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.hr.deleteDocument(id, documentId, p, actorFrom(p, req));
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

  @Patch('leave-requests/:id')
  @RequirePermissions('erp.hr.leave.request')
  @ApiOperation({ summary: 'Edit a submitted leave request (balance stays in step)' })
  updateLeaveRequest(@Param('id') id: string, @Body() dto: UpdateLeaveRequestDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.updateLeaveRequest(id, dto, p, actorFrom(p, req));
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

  // ------------------------------------------------------- policy & worksites
  @Get('attendance-policy')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.attendance.manage', 'erp.hr.attendance.policy')
  @ApiOperation({ summary: 'Read the attendance and payroll policy' })
  getPolicy(@CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.getPolicy(p);
  }

  @Patch('attendance-policy')
  @RequirePermissions('erp.hr.attendance.policy')
  @ApiOperation({ summary: 'Update the attendance and payroll policy' })
  updatePolicy(@Body() dto: UpdateAttendancePolicyDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.updatePolicy(dto, p, actorFrom(p, req));
  }

  @Get('work-sites')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.worksite.manage', 'erp.hr.attendance.manage')
  @ApiOperation({ summary: 'List geofenced work sites' })
  workSites(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listWorkSites(query, p);
  }

  @Post('work-sites')
  @RequirePermissions('erp.hr.worksite.manage')
  @ApiOperation({ summary: 'Create a work site' })
  createWorkSite(@Body() dto: CreateWorkSiteDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.createWorkSite(dto, p, actorFrom(p, req));
  }

  @Patch('work-sites/:id')
  @RequirePermissions('erp.hr.worksite.manage')
  @ApiOperation({ summary: 'Update a work site' })
  updateWorkSite(@Param('id') id: string, @Body() dto: UpdateWorkSiteDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.updateWorkSite(id, dto, p, actorFrom(p, req));
  }

  @Delete('work-sites/:id')
  @RequirePermissions('erp.hr.worksite.manage')
  @ApiOperation({ summary: 'Delete a work site' })
  deleteWorkSite(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.deleteWorkSite(id, p, actorFrom(p, req));
  }

  @Get('work-sites/:id/qr-token')
  @RequirePermissions('erp.hr.worksite.manage')
  @ApiOperation({ summary: 'Current rotating QR token for a work site kiosk' })
  workSiteQrToken(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.workSiteQrToken(id, p);
  }

  // --------------------------------------------------------- self-service
  @Get('attendance/me')
  @RequirePermissions('erp.hr.attendance.self')
  @ApiOperation({ summary: "Today's attendance for the signed-in employee" })
  myAttendance(@CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.myAttendanceToday(p);
  }

  @Get('attendance/me/history')
  @RequirePermissions('erp.hr.attendance.self')
  @ApiOperation({ summary: "The signed-in employee's own attendance history" })
  myAttendanceHistory(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.myAttendanceHistory(p, query.from, query.to);
  }

  @Post('attendance/check-in')
  @RequirePermissions('erp.hr.attendance.self')
  @ApiOperation({ summary: 'Self check-in with optional GPS/Wi-Fi/QR verification' })
  selfCheckIn(@Body() dto: SelfCheckInDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.selfCheckIn(dto, p, actorFrom(p, req), this.canManage(p));
  }

  @Post('attendance/check-out')
  @RequirePermissions('erp.hr.attendance.self')
  @ApiOperation({ summary: 'Self check-out and derive the day' })
  selfCheckOut(@Body() dto: SelfCheckOutDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.selfCheckOut(dto, p, actorFrom(p, req), this.canManage(p));
  }

  @Post('attendance/break/start')
  @RequirePermissions('erp.hr.attendance.self')
  @ApiOperation({ summary: 'Start a break' })
  selfBreakStart(@Body() dto: SelfBreakDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.selfBreakStart(dto, p, actorFrom(p, req), this.canManage(p));
  }

  @Post('attendance/break/end')
  @RequirePermissions('erp.hr.attendance.self')
  @ApiOperation({ summary: 'End the open break' })
  selfBreakEnd(@Body() dto: SelfBreakDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.hr.selfBreakEnd(dto, p, actorFrom(p, req), this.canManage(p));
  }

  // --------------------------------------------------------- salary history
  @Get('employees/:id/salary-history')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.salary.manage')
  @ApiOperation({ summary: 'Effective salary structures and change log for an employee' })
  salaryHistory(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.listSalaryHistory(id, p);
  }

  // ----------------------------------------------------------- payslips
  @Get('payslips/me')
  @RequirePermissions('erp.hr.payslip.self')
  @ApiOperation({ summary: 'The signed-in employee’s own payslips' })
  myPayslips(@CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.myPayslips(p);
  }

  @Get('payslips/:id/pdf')
  @RequireAnyPermission('erp.hr.payslip.read', 'erp.hr.payslip.self', 'erp.hr.payroll.approve')
  @ApiOperation({ summary: 'Download a payslip as PDF' })
  async payslipPdf(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Res() res: Response) {
    await this.hr.assertPayslipReadable(id, p);
    const { bytes, filename } = await this.hrExport.payslipPdf(id, p);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(bytes);
  }

  // ----------------------------------------------------------- HR reports
  @Get('reports/attendance')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Attendance detail report' })
  reportAttendance(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportAttendance(query, p);
  }

  @Get('reports/late-absence')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Late arrival and absence report' })
  reportLateAbsence(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportLateAbsence(query, p);
  }

  @Get('reports/overtime')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Overtime report' })
  reportOvertime(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportOvertime(query, p);
  }

  @Get('reports/worked-hours')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Worked hours report' })
  reportWorkedHours(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportWorkedHours(query, p);
  }

  @Get('reports/payroll')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Monthly payroll report' })
  reportPayroll(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportPayroll(query, p);
  }

  @Get('reports/deductions-allowances')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Deductions and allowances report' })
  reportDeductions(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportDeductionsAllowances(query, p);
  }

  @Get('reports/employee-payroll')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Employee payroll register' })
  reportEmployeePayroll(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportEmployeePayroll(query, p);
  }

  @Get('reports/payroll-cost')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Payroll cost by department and branch' })
  reportPayrollCost(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.hr.reportPayrollCost(query, p);
  }

  @Get('reports/:kind/export')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'Export an HR report as CSV' })
  async exportReport(@Param('kind') kind: string, @Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal, @Res() res: Response) {
    const result = await this.hr.runReport(kind, query, p);
    const csv = this.hrExport.toCsv(result as Record<string, unknown>);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hr-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
    // A BOM makes Excel open a UTF-8 CSV in the right encoding, so the Arabic
    // headers and names do not turn into mojibake.
    res.send(`\uFEFF${csv}`);
  }

  // ------------------------------------------------ employee electronic file
  //
  // Every tab of the file reads the same records the rest of HR writes. Pay and
  // the payroll ledger need `erp.hr.salary.read` on top of the HR read
  // permission; the service omits those fields rather than blanking them.

  @Get('employees/:id/file/counts')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.salary.read')
  @ApiOperation({ summary: 'Tab badge counts for the employee electronic file' })
  fileCounts(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.counts(id, p);
  }

  @Get('employees/:id/file/personal-card')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.salary.read')
  @ApiOperation({ summary: 'The employee personal card (pay omitted without salary access)' })
  filePersonalCard(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.personalCard(id, p);
  }

  @Get('employees/:id/file/payroll')
  @RequirePermissions('erp.hr.salary.read')
  @ApiOperation({ summary: 'The employee payroll ledger for a date window' })
  filePayroll(
    @Param('id') id: string,
    @Query() query: FileRangeQueryDto,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    return this.file.payrollLedger(id, query, p);
  }

  @Get('employees/:id/file/leave')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.leave.manage')
  @ApiOperation({ summary: 'The employee leave history and balances' })
  fileLeave(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.leave(id, p);
  }

  @Get('employees/:id/file/penalties')
  @RequireAnyPermission('erp.hr.read', 'erp.hr.penalty.manage')
  @ApiOperation({ summary: 'The employee disciplinary actions' })
  filePenalties(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.listPenalties(id, p);
  }

  @Post('employees/:id/file/penalties')
  @RequirePermissions('erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Record a disciplinary action' })
  createPenalty(
    @Param('id') id: string,
    @Body() dto: CreatePenaltyDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.createPenalty(id, dto, p, actorFrom(p, req));
  }

  @Patch('file/penalties/:penaltyId')
  @RequirePermissions('erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Edit a disciplinary action' })
  updatePenalty(
    @Param('penaltyId') penaltyId: string,
    @Body() dto: UpdatePenaltyDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.updatePenalty(penaltyId, dto, p, actorFrom(p, req));
  }

  @Delete('file/penalties/:penaltyId')
  @RequirePermissions('erp.hr.penalty.manage')
  @ApiOperation({ summary: 'Delete a disciplinary action' })
  deletePenalty(
    @Param('penaltyId') penaltyId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.deletePenalty(penaltyId, p, actorFrom(p, req));
  }

  @Get('employees/:id/file/bonuses')
  @RequirePermissions('erp.hr.salary.read')
  @ApiOperation({ summary: 'The employee bonuses and incentives' })
  fileBonuses(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.file.listBonuses(id, p);
  }

  @Post('employees/:id/file/bonuses')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Grant a bonus or incentive' })
  createBonus(
    @Param('id') id: string,
    @Body() dto: CreateBonusDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.createBonus(id, dto, p, actorFrom(p, req));
  }

  @Patch('file/bonuses/:bonusId')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Edit a bonus that payroll has not paid yet' })
  updateBonus(
    @Param('bonusId') bonusId: string,
    @Body() dto: UpdateBonusDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.updateBonus(bonusId, dto, p, actorFrom(p, req));
  }

  @Post('file/bonuses/:bonusId/approve')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Approve a bonus so the next payroll run pays it' })
  approveBonus(
    @Param('bonusId') bonusId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.approveBonus(bonusId, p, actorFrom(p, req));
  }

  @Delete('file/bonuses/:bonusId')
  @RequirePermissions('erp.hr.bonus.manage')
  @ApiOperation({ summary: 'Delete a bonus that payroll has not paid yet' })
  deleteBonus(
    @Param('bonusId') bonusId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.file.deleteBonus(bonusId, p, actorFrom(p, req));
  }

  @Get('employees/:id/file/reports')
  @RequireAnyPermission('erp.hr.report.read', 'erp.hr.read')
  @ApiOperation({ summary: 'The employee report pack for a date window' })
  fileReports(
    @Param('id') id: string,
    @Query() query: FileRangeQueryDto,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    return this.file.reports(id, query, p);
  }

  private canManage(p: RequestPrincipal): boolean {
    return p.grantedPermissions.includes('erp.hr.attendance.manage');
  }
}
