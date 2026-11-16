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

/**
 * Direct user creation.
 *
 * Unlike an invitation, this creates an active account immediately: the
 * administrator sets the first password (hashed with the same argon2 path as
 * every other credential) and the membership, so the new user can sign in at
 * once without an email round-trip. Identity fields are optional so a tenant
 * that does not need them can create a user with the same four required fields
 * the invitation form uses.
 */
export class CreateUserDto {
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
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsString()
  roleId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}

/** Editable identity/contact details on a user record. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullNameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullNameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
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
