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
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() vehicleId?: string;
}

// ------------------------------------------------------------------ vehicles

export class CreateVehicleDto {
  @IsString() customerId!: string;
  /** VIN/chassis number: 11–17 alphanumeric characters, no I/O/Q. */
  @IsString() @MinLength(11) @MaxLength(17) vin!: string;
  @IsOptional() @IsString() @MaxLength(20) plateNumber?: string;
  @IsString() @MinLength(1) @MaxLength(80) make!: string;
  @IsString() @MinLength(1) @MaxLength(80) model!: string;
  @Type(() => Number) @IsInt() @Min(1900) modelYear!: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsISO8601() registrationExpiresAt?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MaxLength(20) plateNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) modelYear?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'SOLD']) status?: string;
  @IsOptional() @IsISO8601() registrationExpiresAt?: string;
  @IsOptional() @IsString() @MaxLength(600) notes?: string;
}

export class RecordMileageDto {
  @Type(() => Number) @IsInt() @Min(0) mileage!: number;
  @IsOptional() @IsString() @MaxLength(40) source?: string;
}

export class VehicleDocumentDto {
  @IsString() @MinLength(2) @MaxLength(80) category!: string;
  @IsOptional() @IsString() @MaxLength(80) number?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(400) fileRef?: string;
}

// --------------------------------------------------------------- inspections

export class CreateInspectionServiceDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(160) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) taxPercentBp?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationMinutes?: number;
}

export class CreateChecklistItemDto {
  @IsOptional() @IsString() serviceId?: string;
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(1) @MaxLength(200) labelEn!: string;
  @IsString() @MinLength(1) @MaxLength(200) labelAr!: string;
  @IsString() @MinLength(1) @MaxLength(60) category!: string;
}

export class CreateInspectionBookingDto {
  @IsString() vehicleId!: string;
  @IsString() serviceId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsISO8601() scheduledAt!: string;
  @IsOptional() @IsString() inspectorUserId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometer?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateInspectionBookingDto {
  @IsOptional() @IsIn(['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() inspectorUserId?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometer?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class InspectionFindingDto {
  @IsOptional() @IsString() checklistItemId?: string;
  @IsString() @MinLength(1) @MaxLength(80) category!: string;
  @IsIn(['INFO', 'MINOR', 'MAJOR', 'CRITICAL']) severity!: string;
  @IsString() @MinLength(1) @MaxLength(1000) description!: string;
  @IsOptional() @IsBoolean() isDefect?: boolean;
  @IsOptional() @IsString() @MaxLength(600) recommendation?: string;
}

export class RecordFindingsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => InspectionFindingDto)
  findings!: InspectionFindingDto[];
}

export class SubmitReportDto {
  @IsOptional() @IsString() @MaxLength(2000) summary?: string;
  @IsOptional() @IsString() @MaxLength(200) overallCondition?: string;
}

export class DecideReportDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: string;
  @IsOptional() @IsString() @MaxLength(600) note?: string;
}

export class InvoiceInspectionDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsISO8601() invoiceDate?: string;
}

// -------------------------------------------------------------- maintenance

export class CreateWorkshopBayDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(120) nameAr!: string;
  @IsOptional() @IsString() branchId?: string;
}

export class CreateMaintenanceBookingDto {
  @IsString() vehicleId!: string;
  @IsISO8601() scheduledAt!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() bayId?: string;
  @IsOptional() @IsString() @MaxLength(2000) complaint?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateMaintenanceBookingDto {
  @IsOptional() @IsIn(['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() bayId?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) complaint?: string;
}

export class CreateJobCardDto {
  @IsString() vehicleId!: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() bayId?: string;
  @IsOptional() @IsString() technicianUserId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometer?: number;
  @IsOptional() @IsString() @MaxLength(2000) complaint?: string;
  @IsOptional() @IsString() @MaxLength(2000) diagnosis?: string;
}

export class UpdateJobCardDto {
  @IsOptional() @IsIn(['DRAFT', 'OPEN', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() technicianUserId?: string;
  @IsOptional() @IsString() bayId?: string;
  @IsOptional() @IsString() @MaxLength(2000) diagnosis?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometer?: number;
}

export class LabourOperationDto {
  @IsString() @MinLength(1) @MaxLength(300) description!: string;
  /** Hours in hundredths (250 = 2.5 h). */
  @Type(() => Number) @IsInt() @Min(1) hours!: number;
  @Type(() => Number) @IsInt() @Min(0) rateMinor!: number;
}

export class AddLabourDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LabourOperationDto)
  operations!: LabourOperationDto[];
}

export class EstimateLineDto {
  @IsIn(['LABOUR', 'PART', 'SERVICE']) type!: string;
  @IsOptional() @IsString() productId?: string;
  @IsString() @MinLength(1) @MaxLength(300) description!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) unitPriceMinor!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) taxPercentBp?: number;
}

export class CreateEstimateDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EstimateLineDto)
  lines!: EstimateLineDto[];
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ApproveEstimateDto {
  @IsOptional() @IsString() @MaxLength(600) note?: string;
}

export class ReservePartDto {
  @IsString() productId!: string;
  /** Quantity scaled by 10^4. */
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}

export class CreateReservationDto {
  @IsString() jobCardId!: string;
  @IsString() warehouseId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReservePartDto)
  lines!: ReservePartDto[];
}

export class IssueReservationDto {
  /** Optional partial issue; omit to issue every reserved line in full. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReservePartDto)
  lines?: ReservePartDto[];
}

export class InvoiceJobCardDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsISO8601() invoiceDate?: string;
}

export class CreateWarrantyDto {
  @IsString() vehicleId!: string;
  @IsOptional() @IsString() jobCardId?: string;
  @IsString() @MinLength(2) @MaxLength(300) description!: string;
  @IsOptional() @IsString() @MaxLength(1000) terms?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}

// ---------------------------------------------------------------- spare parts

export class CreatePartReferenceDto {
  @IsString() productId!: string;
  @IsString() @MinLength(1) @MaxLength(80) partNumber!: string;
  @IsOptional() @IsIn(['OEM', 'AFTERMARKET', 'CROSS_REFERENCE']) type?: string;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
}

export class CreateCompatibilityDto {
  @IsString() productId!: string;
  @IsString() @MinLength(1) @MaxLength(80) make!: string;
  @IsString() @MinLength(1) @MaxLength(80) model!: string;
  @Type(() => Number) @IsInt() @Min(1900) yearFrom!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) yearTo?: number;
  @IsOptional() @IsString() @MaxLength(400) notes?: string;
}

// --------------------------------------------------------------- marketplace

export class CreateProviderDto {
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(80) categoryKey?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() providerCompanyId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) commissionPercentBp?: number;
}

export class ApproveProviderDto {
  @IsIn(['APPROVED', 'SUSPENDED', 'REJECTED']) decision!: string;
  @IsOptional() @IsString() @MaxLength(600) note?: string;
}

export class CreateListingDto {
  @IsString() @MinLength(1) @MaxLength(80) categoryKey!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameEn!: string;
  @IsString() @MinLength(2) @MaxLength(200) nameAr!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMinor?: number;
}

export class CreateServiceRequestDto {
  @IsString() @MinLength(1) @MaxLength(80) categoryKey!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() providerId?: string;
}

export class AssignProviderDto {
  @IsString() providerId!: string;
}

export class UpdateServiceRequestDto {
  @IsOptional() @IsIn(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) status?: string;
}

export class CreateSettlementDto {
  @IsString() providerId!: string;
  @IsISO8601() periodStart!: string;
  @IsISO8601() periodEnd!: string;
}
