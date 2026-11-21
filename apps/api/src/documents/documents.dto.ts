import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ISSUABLE_FINANCIAL_TYPES, type IssuableFinancialType } from '@oryx/shared';

export { ISSUABLE_FINANCIAL_TYPES };
export type { IssuableFinancialType };

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

