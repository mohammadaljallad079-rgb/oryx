import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const TAX_SCOPES = ['SALES', 'PURCHASES', 'BOTH'] as const;
export const TAX_APPLICATION_LEVELS = ['LINE', 'TOTAL'] as const;

export class ListTaxRateQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() companyId?: string;
  /** Restrict to the taxes that apply to a given side of the ledger. */
  @IsOptional() @IsIn(TAX_SCOPES) scope?: (typeof TAX_SCOPES)[number];
  @IsOptional() @IsString() includeInactive?: string;
}

export class CreateTaxRateDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(1) @MaxLength(120) nameAr!: string;

  /** The rate in basis points (1500 = 15%). */
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) rateBp!: number;

  @IsOptional() @IsIn(TAX_SCOPES) scope?: (typeof TAX_SCOPES)[number];
  @IsOptional() @IsIn(TAX_APPLICATION_LEVELS) applicationLevel?: (typeof TAX_APPLICATION_LEVELS)[number];
  @IsOptional() @IsBoolean() pricesIncludeTax?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateTaxRateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nameEn?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nameAr?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) rateBp?: number;
  @IsOptional() @IsIn(TAX_SCOPES) scope?: (typeof TAX_SCOPES)[number];
  @IsOptional() @IsIn(TAX_APPLICATION_LEVELS) applicationLevel?: (typeof TAX_APPLICATION_LEVELS)[number];
  @IsOptional() @IsBoolean() pricesIncludeTax?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
