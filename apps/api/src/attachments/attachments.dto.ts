import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListAttachmentsQueryDto {
  @IsString() entityType!: string;
  @IsString() entityId!: string;
}

export class UpdateAttachmentDto {
  @IsOptional() @IsString() @MaxLength(240) fileName?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isConfidential?: boolean;
}
