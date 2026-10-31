import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { TrimString } from '../common/transformers';

// ------------------------------------------------------------- applications

export class ProviderApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  legalNameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  legalNameAr!: string;

  @TrimString()
  @IsEmail()
  @MaxLength(200)
  contactEmail!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(40)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryKeys?: string[];
}

export class ApproveApplicationDto {
  @IsInt()
  @Min(0)
  @Max(10_000)
  commissionPercentBp!: number;

  @IsOptional()
  @IsString()
  providerCompanyId?: string;
}

export class RejectApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  note!: string;
}

// ------------------------------------------------------------------ listings

export class ProviderOfferDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryKey?: string;

  /** Basis points, so 1500 is 15%. */
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentOffBp!: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class UpdateProviderOfferDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  percentOffBp?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class ProviderListingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  categoryKey!: string;

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
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}

export class UpdateProviderListingDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// -------------------------------------------------------------- availability

export class AvailabilityRowDto {
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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20_160)
  minimumNoticeMinutes?: number;
}

export class SetAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRowDto)
  hours!: AvailabilityRowDto[];
}

export class UpdateProviderProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @TrimString()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryKey?: string;
}

// ---------------------------------------------------------- service requests

export class CreateServiceRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  categoryKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}

export class CompleteServiceRequestDto {
  @IsInt()
  @Min(0)
  finalAmountMinor!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}

export class DeclineRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class CancelRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

// ------------------------------------------------------------------- reviews

export class CreateReviewDto {
  @IsString()
  serviceRequestId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReviewReplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reply!: string;
}

export class ModerateReviewDto {
  @IsString()
  @IsIn(['PUBLISHED', 'HIDDEN', 'REJECTED'])
  status!: 'PUBLISHED' | 'HIDDEN' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ----------------------------------------------------------------- disputes

export class OpenDisputeDto {
  @IsString()
  providerId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  serviceRequestId?: string;

  @IsOptional()
  @IsString()
  bookingSlotId?: string;
}

export class DisputeMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class ResolveDisputeDto {
  @IsString()
  @IsIn(['RESOLVED', 'CLOSED', 'ESCALATED'])
  status!: 'RESOLVED' | 'CLOSED' | 'ESCALATED';

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  resolution!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  compensationMinor?: number;
}

// -------------------------------------------------------------- settlements

export class BuildSettlementDto {
  @IsString()
  providerId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

// ------------------------------------------------------- consumer orders

/** The statuses a merchant may move a consumer order to. */
export const ORDER_STATUS_VALUES = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;

export class OrderStatusDto {
  @IsString()
  @IsIn(ORDER_STATUS_VALUES as unknown as string[])
  status!: (typeof ORDER_STATUS_VALUES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
