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

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() branchId?: string;
}

// ------------------------------------------------------------- lead sources

export class CreateLeadSourceDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameAr!: string;
}

// -------------------------------------------------------------------- leads

export class CreateLeadDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) estimatedValueMinor?: number;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MaxLength(200) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(200) nameAr?: string;
  @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsIn(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST']) status?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

// --------------------------------------------------------------- pipelines

export class CreatePipelineDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameAr!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class PipelineStageDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(1) @MaxLength(120) nameAr!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) probabilityBp?: number;
  @IsOptional() @IsBoolean() isWon?: boolean;
  @IsOptional() @IsBoolean() isLost?: boolean;
}

export class CreateStagesDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PipelineStageDto)
  stages!: PipelineStageDto[];
}

// ------------------------------------------------------------- opportunities

export class CreateOpportunityDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsString() pipelineId!: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @Type(() => Number) @IsInt() @Min(0) amountMinor!: number;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class MoveStageDto {
  @IsString() stageId!: string;
  @IsOptional() @IsString() @MaxLength(400) note?: string;
}

export class ConvertOpportunityDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsISO8601() issueDate?: string;
}

// ------------------------------------------------------------------ contacts

export class CreateContactDto {
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) role?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

// ---------------------------------------------------------------- activities

export class CreateActivityDto {
  @IsIn(['CALL', 'MEETING', 'EMAIL', 'NOTE', 'TASK', 'FOLLOW_UP']) type!: string;
  @IsString() @MinLength(1) @MaxLength(240) subject!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() ticketId?: string;
}

export class CompleteActivityDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

// -------------------------------------------------------------------- tickets

export class CreateSlaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority!: string;
  @Type(() => Number) @IsInt() @Min(1) responseMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) resolutionMinutes!: number;
}

export class CreateTicketDto {
  @IsString() @MinLength(2) @MaxLength(240) subject!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() assignedToUserId?: string;
}

export class TicketMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
}

export class UpdateTicketDto {
  @IsOptional() @IsIn(['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED']) status?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() assignedToUserId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) satisfactionScore?: number;
}

// ------------------------------------------------------------------ segments

export class CreateSegmentDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
}

export class SegmentMemberDto {
  @IsString() customerId!: string;
}
