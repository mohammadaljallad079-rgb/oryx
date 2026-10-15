import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const LOCALES = ['ar', 'en'] as const;
const THEMES = ['dark', 'light'] as const;

export class CustomerRegisterDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  /**
   * Minimum length is 10 rather than 8: a consumer account guards a garage,
   * payment history and saved addresses, so the bar is set higher than the
   * staff baseline.
   */
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsIn(LOCALES)
  preferredLocale?: 'ar' | 'en';

  @IsOptional()
  @IsIn(THEMES)
  preferredTheme?: 'dark' | 'light';
}

export class CustomerLoginDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class CustomerRefreshDto {
  /** Optional: browser clients use the HttpOnly cookie instead. */
  @IsOptional()
  @IsString()
  @MinLength(10)
  refreshToken?: string;
}

export class CustomerForgotPasswordDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

export class CustomerResetPasswordDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password!: string;
}

export class CustomerChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword!: string;
}

export class CustomerMfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class CustomerMfaVerifyLoginDto {
  @IsString()
  @MinLength(10)
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsIn(LOCALES)
  preferredLocale?: 'ar' | 'en';

  @IsOptional()
  @IsIn(THEMES)
  preferredTheme?: 'dark' | 'light';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class CustomerAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CustomerPrivacyDto {
  @IsOptional()
  @IsBoolean()
  shareContactWithProvider?: boolean;

  @IsOptional()
  @IsBoolean()
  allowVehicleDiscovery?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMarketingEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMarketingSms?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMarketingWhatsapp?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPushNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAnalytics?: boolean;

  @IsOptional()
  @IsBoolean()
  allowThirdPartySharing?: boolean;
}

export class CustomerNotificationPreferenceDto {
  @IsIn(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'])
  channel!: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  category!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateCustomerPreferencesDto {
  @ValidateNested({ each: true })
  @Type(() => CustomerNotificationPreferenceDto)
  preferences!: CustomerNotificationPreferenceDto[];
}

/** Registering a vehicle from the website or mobile garage. */
export class CustomerVehicleDto {
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  vin!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plateNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  make!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  model!: string;

  @IsInt()
  @Min(1900)
  @Max(2100)
  modelYear!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  mileage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCustomerVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  mileage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
