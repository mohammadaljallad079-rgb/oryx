import { Type } from 'class-transformer';
import { NormaliseIsoDate } from '../common/transformers';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() from?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() to?: string;
}

// ------------------------------------------------------------- departments

export class CreateDepartmentDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameAr!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class CreateJobTitleDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameAr!: string;
  @IsOptional() @IsString() departmentId?: string;
}

// --------------------------------------------------------------- employees

export class CreateEmployeeDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) fullNameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) fullNameAr!: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) secondaryPhone?: string;
  @IsOptional() @IsString() @MaxLength(40) nationalId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() jobTitleId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() managerId?: string;
  @NormaliseIsoDate() @IsISO8601() hireDate!: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(20) gender?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MaxLength(200) fullNameEn?: string;
  @IsOptional() @IsString() @MaxLength(200) fullNameAr?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) secondaryPhone?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() jobTitleId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']) status?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() terminationDate?: string;
  @IsOptional() @IsString() @MaxLength(240) addressLine?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class CreateContractDto {
  @IsString() @MinLength(1) @MaxLength(60) contractNumber!: string;
  @IsOptional() @IsIn(['PERMANENT', 'FIXED_TERM', 'PART_TIME', 'CONTRACTOR']) type?: string;
  @NormaliseIsoDate() @IsISO8601() startDate!: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() endDate?: string;
  @Type(() => Number) @IsInt() @Min(0) baseSalaryMinor!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) probationDays?: number;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class CreateDocumentDto {
  @IsIn(['IDENTITY', 'CONTRACT', 'CERTIFICATE', 'MEDICAL', 'OTHER']) category!: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(400) fileRef?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() issuedAt?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() expiresAt?: string;
  @IsOptional() @IsBoolean() isConfidential?: boolean;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

export class StartLifecycleDto {
  @IsIn(['ONBOARDING', 'OFFBOARDING']) type!: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class LifecycleItemDto {
  @IsString() @MinLength(1) @MaxLength(200) label!: string;
  @IsOptional() @IsBoolean() isDone?: boolean;
}

// -------------------------------------------------------------------- leave

export class CreateLeaveTypeDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameAr!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) annualEntitlementDays?: number;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
}

export class RequestLeaveDto {
  @IsString() employeeId!: string;
  @IsString() leaveTypeId!: string;
  @NormaliseIsoDate() @IsISO8601() startDate!: string;
  @NormaliseIsoDate() @IsISO8601() endDate!: string;
  @IsOptional() @IsString() @MaxLength(400) reason?: string;
}

export class UpdateLeaveRequestDto {
  @IsOptional() @IsString() leaveTypeId?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() startDate?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() endDate?: string;
  @IsOptional() @IsString() @MaxLength(400) reason?: string;
}

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: string;
  @IsOptional() @IsString() @MaxLength(400) note?: string;
}

export class AdjustBalanceDto {
  @IsString() employeeId!: string;
  @IsString() leaveTypeId!: string;
  @Type(() => Number) @IsInt() year!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) entitledDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) accruedDays?: number;
}

// --------------------------------------------------------------- attendance

export class CreateShiftDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameAr!: string;
  @IsString() @MaxLength(8) startTime!: string;
  @IsString() @MaxLength(8) endTime!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) breakMinutes?: number;
}

export class RecordAttendanceDto {
  @IsString() employeeId!: string;
  @NormaliseIsoDate() @IsISO8601() workDate!: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() checkInAt?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() checkOutAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeMinutes?: number;
  @IsOptional() @IsIn(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY']) status?: string;
  @IsOptional() @IsString() shiftId?: string;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

// ------------------------------------------------------------ worksites

export class CreateWorkSiteDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameAr!: string;
  @IsOptional() @IsString() branchId?: string;
  @Type(() => Number) @IsNumber() latitude!: number;
  @Type(() => Number) @IsNumber() longitude!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(5000) radiusMeters?: number;
  @IsOptional() @IsString() @MaxLength(400) wifiSsids?: string;
  @IsOptional() @IsString() @MaxLength(400) wifiBssids?: string;
  @IsOptional() @IsString() @MaxLength(120) qrSecret?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWorkSiteDto {
  @IsOptional() @IsString() @MaxLength(160) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(160) nameAr?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(5000) radiusMeters?: number;
  @IsOptional() @IsString() @MaxLength(400) wifiSsids?: string;
  @IsOptional() @IsString() @MaxLength(400) wifiBssids?: string;
  @IsOptional() @IsString() @MaxLength(120) qrSecret?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ---------------------------------------------------------- attendance policy

export class UpdateAttendancePolicyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) graceMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(2400) standardDailyHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(16800) standardWeeklyHours?: number;
  @IsOptional() @IsString() @MaxLength(40) workingDays?: string;
  @IsOptional() @IsBoolean() overtimeEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50000) overtimeMultiplierBp?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeThresholdHours?: number;
  @IsOptional() @IsBoolean() deductLate?: boolean;
  @IsOptional() @IsBoolean() deductEarlyLeave?: boolean;
  @IsOptional() @IsBoolean() deductAbsence?: boolean;
  @IsOptional() @IsBoolean() requireLocation?: boolean;
  @IsOptional() @IsBoolean() allowFallback?: boolean;
}

// -------------------------------------------------------- self-service punch

export class PunchLocationDto {
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() accuracy?: number;
  @IsOptional() @IsString() @MaxLength(120) wifiSsid?: string;
  @IsOptional() @IsString() @MaxLength(120) wifiBssid?: string;
  @IsOptional() @IsString() @MaxLength(400) qrToken?: string;
  @IsOptional() @IsString() @MaxLength(400) fallbackReason?: string;
}

export class SelfCheckInDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() at?: string;
  @IsOptional() @IsString() shiftId?: string;
  @IsOptional() @ValidateNested() @Type(() => PunchLocationDto) location?: PunchLocationDto;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

export class SelfCheckOutDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() at?: string;
  @IsOptional() @ValidateNested() @Type(() => PunchLocationDto) location?: PunchLocationDto;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

export class SelfBreakDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() at?: string;
}

export class QrTokenQueryDto {
  @IsString() siteId!: string;
}

// --------------------------------------------------------------- payroll

export class SalaryComponentDto {
  @IsIn(['ALLOWANCE', 'DEDUCTION']) type!: string;
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(1) @MaxLength(160) nameAr!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) amountMinor?: number;
  @IsOptional() @IsBoolean() isPercentage?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) percentBp?: number;
}

export class CreateSalaryStructureDto {
  @IsString() employeeId!: string;
  @NormaliseIsoDate() @IsISO8601() effectiveFrom!: string;
  @IsOptional() @NormaliseIsoDate() @IsISO8601() effectiveTo?: string;
  @Type(() => Number) @IsInt() @Min(0) basicMinor!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeRateMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(2400) dailyHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(16800) weeklyHours?: number;
  @IsOptional() @IsString() @MaxLength(40) workingDays?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
  @IsOptional() @IsString() @MaxLength(400) changeReason?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SalaryComponentDto)
  components!: SalaryComponentDto[];
}

export class CreatePayrollPeriodDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameAr!: string;
  @NormaliseIsoDate() @IsISO8601() startDate!: string;
  @NormaliseIsoDate() @IsISO8601() endDate!: string;
}

export class CreatePayrollRunDto {
  @IsString() periodId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) overtimeMultiplierBp?: number;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

export class CreateAdvanceDto {
  @IsString() employeeId!: string;
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) installments?: number;
  @NormaliseIsoDate() @IsISO8601() issuedAt!: string;
  @IsOptional() @IsString() @MaxLength(400) reason?: string;
}

export class SettleAdvanceDto {
  @Type(() => Number) @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsString() @MaxLength(400) note?: string;
}
