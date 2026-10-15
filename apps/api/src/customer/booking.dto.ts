import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const BOOKING_TYPES = ['INSPECTION', 'MAINTENANCE', 'PROVIDER_SERVICE'] as const;

/**
 * Query strings arrive as text, so the numeric fields need an explicit
 * conversion; the global pipe runs with implicit conversion off.
 */
export class AvailabilityQueryDto {
  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  serviceRef?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  stepMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20_160)
  minimumNoticeMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  bufferMinutes?: number;
}

export class CreateBookingDto {
  @IsString()
  @IsIn(BOOKING_TYPES)
  bookingType!: (typeof BOOKING_TYPES)[number];

  @IsDateString()
  startsAt!: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  serviceRef?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Hold the slot for checkout instead of confirming it outright. */
  @IsOptional()
  @IsBoolean()
  hold?: boolean;

  @IsOptional()
  @IsString()
  companyId?: string;
}

export class RescheduleBookingDto {
  @IsDateString()
  startsAt!: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ResourceDto {
  @IsString()
  @IsIn(['INSPECTOR', 'BAY', 'TECHNICIAN', 'PROVIDER'])
  resourceType!: 'INSPECTOR' | 'BAY' | 'TECHNICIAN' | 'PROVIDER';

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameAr!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number;
}

export class WorkingHoursRowDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  opensMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  closesMinute!: number;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class SetWorkingHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursRowDto)
  hours!: WorkingHoursRowDto[];
}

export class ResourceExceptionDto {
  @IsDateString()
  date!: string;

  @IsBoolean()
  isClosed!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  opensMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  closesMinute?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
