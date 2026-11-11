import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descriptionAr?: string;

  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  discountType?: 'PERCENT' | 'FIXED';

  /** Basis points; 1500 = 15%. Only meaningful for PERCENT. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  percentOffBp?: number;

  /** Minor units. Only meaningful for FIXED. */
  @IsOptional()
  @IsInt()
  @Min(0)
  amountOffMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptions?: number | null;

  /** Null or omitted means platform-wide. */
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderMinor?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descriptionAr?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  percentOffBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountOffMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRedemptions?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderMinor?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

export class ValidateCouponDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  /** The order subtotal the discount is applied to, in minor units. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotalMinor!: number;

  @IsOptional()
  @IsString()
  companyId?: string | null;
}
