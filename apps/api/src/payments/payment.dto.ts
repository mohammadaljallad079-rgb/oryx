import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateIntentDto {
  @IsString()
  @IsIn(['SALES_INVOICE', 'BOOKING', 'SERVICE_REQUEST', 'SETTLEMENT'])
  targetType!: 'SALES_INVOICE' | 'BOOKING' | 'SERVICE_REQUEST' | 'SETTLEMENT';

  @IsString()
  targetId!: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsString()
  @IsIn(['CASH', 'CARD_TERMINAL', 'BANK_TRANSFER', 'BENEFITPAY', 'CARD_ONLINE'])
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Required: a payment must be retry-safe. */
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class ConfirmManualIntentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  providerReference!: string;
}

export class CancelIntentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class RequestRefundDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReconcileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  provider!: string;

  @IsString()
  businessDate!: string;

  @IsInt()
  @Min(0)
  externalCount!: number;

  @IsInt()
  @Min(0)
  externalMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
