import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullNameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullNameAr!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullNameAr?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLocale?: 'ar' | 'en';

  @IsOptional()
  @IsIn(['dark', 'light'])
  preferredTheme?: 'dark' | 'light';
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}
