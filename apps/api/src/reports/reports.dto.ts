import { IsISO8601, IsOptional, IsString } from 'class-validator';

/**
 * Report filter query. Company and branch narrow the scope; `from`/`to` are
 * inclusive ISO dates. All fields are optional so a report can run unscoped
 * (company-scoped automatically by the caller's principal).
 *
 * `from`/`to` are validated as ISO 8601, matching the accounting filter DTO. A
 * plain `@IsString()` let a malformed value reach `new Date(...)`, whose
 * `Invalid Date` then failed deep in Prisma and surfaced as a 500 instead of a
 * 400.
 */
export class ReportQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
