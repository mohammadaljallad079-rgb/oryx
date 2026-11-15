import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDocumentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  entityType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  entityId!: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  storageRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

/**
 * Replace accepts only the fields being changed: the owning record is already
 * known from the document id, so `entityType`/`entityId` are not required.
 */
export class ReplaceDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  storageRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
