import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { TrimString } from '../common/transformers';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
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
  @MaxLength(300)
  descriptionEn?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
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
  @MaxLength(300)
  descriptionEn?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class InviteUserDto {
  @TrimString()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullNameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullNameAr!: string;

  @IsString()
  roleId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'DISABLED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
}

export class AssignPermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions!: string[];
}
