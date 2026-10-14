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
  ValidateNested,
} from 'class-validator';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

export class CreateAccountDto {
  @IsString()
  @MaxLength(24)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nameAr!: string;

  @IsIn(ACCOUNT_TYPES)
  type!: (typeof ACCOUNT_TYPES)[number];

  @IsOptional()
  @IsIn(['DEBIT', 'CREDIT'])
  normalBalance?: 'DEBIT' | 'CREDIT';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  systemRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  systemRole?: string;
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

export class CreateFiscalYearDto {
  @IsString()
  @MaxLength(20)
  code!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  monthlyPeriods?: boolean;
}

export class SetPeriodStatusDto {
  @IsIn(['OPEN', 'CLOSED', 'LOCKED'])
  status!: 'OPEN' | 'CLOSED' | 'LOCKED';
}

export class JournalLineDto {
  @IsString()
  accountId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  debitMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CreateJournalDto {
  @IsISO8601()
  entryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  memo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class ReverseJournalDto {
  @IsOptional()
  @IsISO8601()
  reversalDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RecordPaymentDto {
  @IsIn(['RECEIPT', 'PAYMENT'])
  direction!: 'RECEIPT' | 'PAYMENT';

  @IsIn(['CUSTOMER', 'SUPPLIER'])
  partyType!: 'CUSTOMER' | 'SUPPLIER';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsIn(['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'WALLET', 'OTHER'])
  method!: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE' | 'WALLET' | 'OTHER';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsISO8601()
  paidAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

export class PaymentAllocationDto {
  @IsIn(['SALES_INVOICE', 'SUPPLIER_INVOICE', 'CREDIT_NOTE'])
  target!: 'SALES_INVOICE' | 'SUPPLIER_INVOICE' | 'CREDIT_NOTE';

  @IsOptional()
  @IsString()
  salesInvoiceId?: string;

  @IsOptional()
  @IsString()
  supplierInvoiceId?: string;

  @IsOptional()
  @IsString()
  creditNoteId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}

export class StatementQueryDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}
