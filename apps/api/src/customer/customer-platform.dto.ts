import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Staff-facing customer platform DTOs.
 *
 * The account id is never accepted from a body: it is a path parameter and is
 * always re-checked against the caller's company, so a valid id from another
 * tenant resolves to nothing.
 */

export class LinkCustomerAccountDto {
  @IsString()
  @MinLength(1)
  customerId!: string;
}

export class SetCustomerAccountStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

export class CustomerAccountQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
