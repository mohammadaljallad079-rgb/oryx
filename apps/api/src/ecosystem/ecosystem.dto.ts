import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TrimString } from '../common/transformers';

// ------------------------------------------------------------------- P4 RFQ

export class CreateRfqDto {
  @TrimString()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  categoryKey!: string;

  @TrimString()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleId?: string | null;

  /** How many days the customer will wait for quotes before it expires. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  validDays?: number;
}

export class SubmitRfqQuoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  leadTimeDays?: number | null;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

// ---------------------------------------------------------------- P4 returns

export class CreateReturnLineDto {
  @IsString()
  @MaxLength(40)
  orderLineId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReturnDto {
  @TrimString()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnLineDto)
  lines!: CreateReturnLineDto[];
}

export class DecideReturnDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

// --------------------------------------------------------------- P5 recovery

export class CreateRecoveryRequestDto {
  @Type(() => Number)
  @IsLatitude()
  pickupLatitude!: number;

  @Type(() => Number)
  @IsLongitude()
  pickupLongitude!: number;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(200)
  pickupLabel?: string | null;

  @TrimString()
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  contactPhone!: string;

  @TrimString()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  issue!: string;

  @IsOptional()
  @IsIn(['STANDARD', 'URGENT', 'CRITICAL'])
  urgency?: 'STANDARD' | 'URGENT' | 'CRITICAL';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleId?: string | null;
}

export class AssignRecoveryDto {
  @IsString()
  @MaxLength(40)
  providerId!: string;
}

export class AdvanceRecoveryDto {
  @IsIn(['EN_ROUTE', 'ON_SITE', 'COMPLETED'])
  status!: 'EN_ROUTE' | 'ON_SITE' | 'COMPLETED';

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /** Optional live position, for a moving recovery vehicle. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number | null;
}

export class CancelRecoveryDto {
  @TrimString()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------- P6 fleet

export class CreateFleetDto {
  @TrimString()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(30)
  contactPhone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string | null;
}

export class AddFleetVehicleDto {
  @IsString()
  @MaxLength(40)
  vehicleId!: string;
}

export class CreateDriverDto {
  @TrimString()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @TrimString()
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(40)
  licenceNumber?: string | null;
}

export class SetDriverActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

// -------------------------------------------------------------- P7 SENSAGE AI

export class AnalyzePhotoDto {
  @IsString()
  @MaxLength(40)
  photoId!: string;

  /**
   * A caller-supplied hint such as "front bumper". It is passed to the model as
   * context and is never treated as a finding.
   */
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(200)
  focus?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleId?: string | null;
}

export class ReviewAiSuggestionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
