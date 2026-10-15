import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CredentialInputDto {
  @ApiProperty({ example: 'BENEFITPAY_API_KEY' })
  @IsString()
  @MaxLength(120)
  key!: string;

  /**
   * The value to store, or an empty string to remove the credential. The value
   * is sealed before it reaches the database and is never echoed back.
   */
  @ApiProperty({ example: '' })
  @IsString()
  @MaxLength(4096)
  value!: string;
}

export class SaveCredentialsDto {
  @ApiProperty({ type: [CredentialInputDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CredentialInputDto)
  credentials!: CredentialInputDto[];
}

export class SetEnabledDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  /** Required when disabling, so the reason is on the record. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
