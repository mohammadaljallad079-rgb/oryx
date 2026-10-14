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
  @IsOptional() @IsString() assigneeUserId?: string;
}

// ------------------------------------------------------------------ projects

export class CreateProjectDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(200) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(200) nameAr?: string;
  @IsOptional() @IsIn(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

// --------------------------------------------------------------------- tasks

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() parentTaskId?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() assigneeUserId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']) status?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() assigneeUserId?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
}

// ---------------------------------------------------------------- work orders

export class ChecklistItemDto {
  @IsString() @MinLength(1) @MaxLength(240) label!: string;
}

export class CreateWorkOrderDto {
  @IsString() @MinLength(2) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(60) type?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsString() assigneeUserId?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(40) sourceType?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

export class AssignWorkOrderDto {
  @IsOptional() @IsString() assigneeUserId?: string;
  @IsOptional() @IsString() departmentId?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: string;
  @IsOptional() @IsISO8601() dueDate?: string;
}

export class ToggleChecklistDto {
  @IsBoolean() isDone!: boolean;
}

// ----------------------------------------------------------------- approvals

export class CreateApprovalDto {
  @IsString() @MinLength(2) @MaxLength(80) entityType!: string;
  @IsString() entityId!: string;
  @IsOptional() @IsString() approverUserId?: string;
  @IsOptional() @IsString() @MaxLength(600) note?: string;
}

export class DecideApprovalDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: string;
  @IsOptional() @IsString() @MaxLength(600) note?: string;
}

// ----------------------------------------------------- comments & attachments

export class CreateCommentDto {
  @IsString() @MinLength(2) @MaxLength(80) entityType!: string;
  @IsString() entityId!: string;
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}

export class CreateAttachmentDto {
  @IsString() @MinLength(2) @MaxLength(80) entityType!: string;
  @IsString() entityId!: string;
  @IsString() @MinLength(1) @MaxLength(240) fileName!: string;
  @IsOptional() @IsString() @MaxLength(120) mimeType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sizeBytes?: number;
  @IsOptional() @IsString() @MaxLength(600) storageRef?: string;
}

// --------------------------------------------------------------- calendar

export class CreateCalendarEventDto {
  @IsString() @MinLength(2) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsISO8601() startAt!: string;
  @IsISO8601() endAt!: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @IsOptional() @IsString() entityId?: string;
}

// ------------------------------------------------------------ notifications

export class MarkNotificationReadDto {
  @IsOptional() @IsBoolean() all?: boolean;
}

export class CreateNotificationDto {
  @IsString() userId!: string;
  @IsOptional() @IsIn(['INFO', 'TASK', 'APPROVAL', 'ALERT']) type?: string;
  @IsString() @MinLength(2) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) body?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
}
