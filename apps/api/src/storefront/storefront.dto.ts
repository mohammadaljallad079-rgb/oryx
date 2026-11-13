import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Query strings arrive as text; these helpers keep the parsing explicit. */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return String(value) === 'true' || String(value) === '1';
};

export const PRODUCT_SORT_KEYS = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'name_asc',
] as const;

/** Filters for the public spare-parts catalogue. */
export class ProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  category?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  brand?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  make?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  model?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1980)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  engineType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  partNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMaxMinor?: number;

  @IsOptional()
  @Transform(toBool)
  inStock?: boolean;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(['NEW', 'REFURBISHED'], { each: true })
  condition?: Array<'NEW' | 'REFURBISHED'>;

  @IsOptional()
  @Transform(toBool)
  featured?: boolean;

  @IsOptional()
  @Transform(toBool)
  onOffer?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_SORT_KEYS)
  sort?: (typeof PRODUCT_SORT_KEYS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number;
}

/** Autocomplete suggestions for the storefront search box. */
export class SuggestQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

/** A single basket line sent to the cart/checkout pricing endpoints. */
export class CartLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class QuoteCartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines!: CartLineDto[];
}

export const FULFILMENT_METHODS = ['COLLECTION', 'DELIVERY'] as const;
export const PAYMENT_METHODS = ['CASH', 'CARD_TERMINAL', 'BANK_TRANSFER'] as const;

export class DeliveryAddressDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressLine2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  postalCode?: string;
}

export class CreateWebOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines!: CartLineDto[];

  @IsIn(FULFILMENT_METHODS)
  fulfilment!: (typeof FULFILMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  address?: DeliveryAddressDto;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  contactName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  contactPhone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];
}

export class ContactMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  locale?: 'ar' | 'en';
}

export const BOOKING_TYPES = ['INSPECTION', 'MAINTENANCE', 'PROVIDER_SERVICE'] as const;

/**
 * A public appointment request.
 *
 * A signed-in customer is linked to the booking; a visitor is recorded as a
 * guest with the contact details they supplied, which is why name and phone are
 * required here rather than taken from a session.
 */
export class PublicBookingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleMake?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  vehicleYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  plateNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  serviceRef!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsIn(BOOKING_TYPES)
  bookingType!: (typeof BOOKING_TYPES)[number];
}
