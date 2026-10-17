import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../common/transformers';

export class LoginDto {
  @TrimString()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class RefreshDto {
  /**
   * Optional: with cookie transport the refresh token is read from the
   * HttpOnly cookie. The body field remains for non-browser clients.
   */
  @IsOptional()
  @IsString()
  @MinLength(10)
  refreshToken?: string;
}

export class MfaVerifyLoginDto {
  @IsString()
  @MinLength(10)
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
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
