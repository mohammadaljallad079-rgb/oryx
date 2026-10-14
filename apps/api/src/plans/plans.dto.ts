import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,40}$/, { message: 'code must be lowercase letters, digits, dash or underscore' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionAr?: string;

  @IsNumber()
  @Min(0)
  monthlyPrice!: number;

  @IsNumber()
  @Min(0)
  annualPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsInt()
  maxCompanies!: number;

  @IsInt()
  maxBranches!: number;

  @IsInt()
  maxUsers!: number;

  @IsInt()
  storageMb!: number;

  @IsOptional()
  @IsInt()
  apiRequestsPerMonth?: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  modules!: string[];
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionAr?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @IsOptional()
  @IsInt()
  maxCompanies?: number;

  @IsOptional()
  @IsInt()
  maxBranches?: number;

  @IsOptional()
  @IsInt()
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  storageMb?: number;

  @IsOptional()
  @IsInt()
  apiRequestsPerMonth?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];
}

export class AssignSubscriptionDto {
  @IsString()
  planId!: string;

  @IsIn(['MONTHLY', 'ANNUAL'])
  billingPeriod!: 'MONTHLY' | 'ANNUAL';

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE'])
  status?: 'TRIAL' | 'ACTIVE';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ChangeSubscriptionStatusDto {
  @IsIn(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'])
  status!: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
