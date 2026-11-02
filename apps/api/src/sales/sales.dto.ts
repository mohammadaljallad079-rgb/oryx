import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * The date every sales document carries, under one canonical key.
 *
 * The API historically named the same concept differently per document —
 * `issueDate` on a quotation or credit note, `orderDate` on an order,
 * `invoiceDate` on an invoice. Each DTO declared only its own name while the
 * API runs with `forbidNonWhitelisted`, so a shared create form that sent all
 * three was rejected with "property issueDate should not exist".
 *
 * `documentDate` is the contract. The three historical names remain declared
 * and accepted, so no client is forced to know which document it is posting to.
 *
 * The aliases cannot be folded onto `documentDate` with a `@Transform`:
 * class-transformer only runs a property's transform when that property is
 * present on the source object, so `{ issueDate }` never reaches a
 * `documentDate` transform. Instead `documentDate` is required only when no
 * alias is supplied, and every name is validated on its own. `resolveDocumentDate`
 * then reads them in precedence order.
 */
export class SalesDocumentDateDto {
  @ValidateIf((o: SalesDocumentDateDto) => !o.issueDate && !o.orderDate && !o.invoiceDate)
  @IsISO8601()
  documentDate?: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;
}

/**
 * The effective date of a sales document, preferring the canonical key.
 *
 * Callers pass a validated DTO, so at least one name is guaranteed present;
 * `undefined` is still returned as a type-level guard rather than a fallback
 * "now", which would silently backdate a document.
 */
export function resolveDocumentDate(dto: SalesDocumentDateDto): string | undefined {
  return dto.documentDate ?? dto.issueDate ?? dto.orderDate ?? dto.invoiceDate;
}

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditLimitMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditLimitMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class SalesLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  /** Quantity scaled by 10^4. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountPercentBp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxPercentBp?: number;
}

export class CreateQuotationDto extends SalesDocumentDateDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines!: SalesLineDto[];
}

export class ConvertQuotationDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class CreateSalesOrderDto extends SalesDocumentDateDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines!: SalesLineDto[];
}

export class CreateInvoiceDto extends SalesDocumentDateDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  post?: boolean;

  @IsOptional()
  @IsBoolean()
  issueStock?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines?: SalesLineDto[];
}

export class CreateCreditNoteDto extends SalesDocumentDateDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  restockInventory?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines!: SalesLineDto[];
}

export class CreateCashierSessionDto {
  @IsString()
  branchId!: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingFloatMinor?: number;
}

export class CloseCashierSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedCashMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class PosSaleLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxPercentBp?: number;
}

export class CreatePosSaleDto {
  @IsString()
  branchId!: string;

  @IsString()
  cashierSessionId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'WALLET', 'OTHER'])
  paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE' | 'WALLET' | 'OTHER';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paidMinor?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosSaleLineDto)
  lines!: PosSaleLineDto[];
}
