import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { OfficialDocumentType } from '@oryx/shared';

/** The financial document types that can be issued from a source record. */
export const ISSUABLE_FINANCIAL_TYPES = [
  'SALES_INVOICE',
  'SALES_ORDER',
  'QUOTATION',
  'PAYMENT_RECEIPT',
  'PAYMENT_VOUCHER',
] as const satisfies readonly OfficialDocumentType[];

export type IssuableFinancialType = (typeof ISSUABLE_FINANCIAL_TYPES)[number];

export class IssueFinancialDocumentDto {
  @ApiProperty({ enum: ISSUABLE_FINANCIAL_TYPES })
  @IsIn(ISSUABLE_FINANCIAL_TYPES as unknown as string[])
  type!: IssuableFinancialType;

  @ApiProperty({ description: 'The id of the source record to render.' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceId!: string;
}

export class RevokeDocumentDto {
  @ApiProperty({ description: 'Why the document is being withdrawn.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

