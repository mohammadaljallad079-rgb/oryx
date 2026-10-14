import { IsOptional, IsString } from 'class-validator';

/**
 * Report filter query. Company and branch narrow the scope; `from`/`to` are
 * inclusive ISO dates. All fields are optional so a report can run unscoped
 * (company-scoped automatically by the caller's principal).
 */
export class ReportQueryDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
