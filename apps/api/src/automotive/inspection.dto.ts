import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CHASSIS_REGIONS,
  INSPECTION_SECTION_KEYS,
  INSPECTION_TYPE_KEYS,
  PAINT_CONDITIONS,
  type InspectionSectionKey,
} from '@oryx/shared';

/**
 * The inspection-engine request shapes.
 *
 * `forbidNonWhitelisted` is on globally, so every property a client may send has
 * to be declared here. The allowed enum values are imported from the shared
 * catalogue rather than re-listed, so a new section or condition cannot be
 * accepted by the API before the interface can render it.
 */
const SECTION_KEYS = [...INSPECTION_SECTION_KEYS];
const TYPE_KEYS = [...INSPECTION_TYPE_KEYS];
const PAINT_KEYS = PAINT_CONDITIONS.map((c) => c.key);
const CHASSIS_KEYS = CHASSIS_REGIONS.map((r) => r.key);

export class InspectionListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() companyId?: string;
}

/**
 * Create an inspection.
 *
 * The identification fields are optional: when the vehicle is supplied the
 * service copies make, model, year, plate, VIN and colour from it, and the
 * customer name from the customer record, so the administrator does not retype
 * data the system already holds. A field sent explicitly wins over the copy,
 * which is what lets the administrator correct a value the registration card
 * extraction got wrong.
 */
export class CreateInspectionSessionDto {
  @IsString() @MinLength(1) customerId!: string;
  @IsString() @MinLength(1) vehicleId!: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() branchId?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsIn(TYPE_KEYS, { each: true })
  selectedTypes?: string[];

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsIn(SECTION_KEYS, { each: true })
  selectedAreas?: InspectionSectionKey[];

  @IsOptional() @IsString() @MaxLength(200) customerName?: string;
  @IsOptional() @IsString() @MaxLength(40) contactNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) plateNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2100) modelYear?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometer?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(40) vin?: string;

  @IsOptional() @IsString() @MaxLength(4000) generalRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) interiorRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) exteriorRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) engineRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) roadTestRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) finalAssessment?: string;
}

/** The header fields that may be corrected after creation. */
export class UpdateInspectionSessionDto {
  @IsOptional() @IsString() @MaxLength(200) customerName?: string;
  @IsOptional() @IsString() @MaxLength(40) contactNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) plateNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) make?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2100) modelYear?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometer?: number;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(40) vin?: string;
  @IsOptional() @IsString() branchId?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsIn(TYPE_KEYS, { each: true })
  selectedTypes?: string[];

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsIn(SECTION_KEYS, { each: true })
  selectedAreas?: InspectionSectionKey[];

  @IsOptional() @IsString() @MaxLength(4000) generalRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) interiorRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) exteriorRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) engineRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) roadTestRemarks?: string;
  @IsOptional() @IsString() @MaxLength(4000) finalAssessment?: string;
}

/**
 * Save one section.
 *
 * A whole section is sent at once, because the interface edits it as a unit and
 * a per-item round trip would leave a half-saved section if the tablet lost its
 * connection mid-inspection. The `area` in the path must match the section that
 * exists, so an unselected section cannot be written into the record.
 */
export class SaveInspectionSectionDto {
  @IsOptional() @IsString() @MaxLength(4000) remarks?: string;
  @IsOptional() @IsBoolean() noFindings?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InspectionItemResultInputDto)
  items?: InspectionItemResultInputDto[];
}

export class InspectionItemResultInputDto {
  @IsString() @MaxLength(120) itemKey!: string;
  @IsIn(['UNSET', 'PASS', 'FAIL', 'NA']) result!: 'UNSET' | 'PASS' | 'FAIL' | 'NA';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

/**
 * Replace the whole marker set for the paint diagram.
 *
 * The diagram is edited as a set — a marker is dragged, deleted and added
 * locally, then the resulting list is saved — so the endpoint is a replace, not
 * a per-marker mutation. That makes a save idempotent and keeps the stored
 * positions exactly the ones on screen.
 */
export class SaveBodyMarkersDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => BodyMarkerInputDto)
  markers!: BodyMarkerInputDto[];
}

export class BodyMarkerInputDto {
  /** Present when editing an existing marker; omitted for a new one. */
  @IsOptional() @IsString() id?: string;
  @IsIn(PAINT_KEYS) condition!: 'PAINT' | 'FILLER' | 'CHANGE' | 'SECTIONED';
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) x!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) y!: number;
  @IsOptional() @IsString() @MaxLength(80) panelKey?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Replace the chassis region assessments for the section. */
export class SaveChassisRegionsDto {
  @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => ChassisRegionInputDto)
  regions!: ChassisRegionInputDto[];
}

export class ChassisRegionInputDto {
  @IsIn(CHASSIS_KEYS) regionKey!: string;
  @IsIn(['UNSET', 'OK', 'DAMAGE']) condition!: 'UNSET' | 'OK' | 'DAMAGE';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Add one computer-unit diagnostic entry. */
export class CreateDiagnosticEntryDto {
  @IsString() @MinLength(1) @MaxLength(120) module!: string;
  @IsOptional() @IsString() @MaxLength(40) faultCode?: string;
  @IsString() @MinLength(1) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
  @IsOptional() @IsIn(['INFO', 'MINOR', 'MAJOR', 'CRITICAL']) severity?: 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL';
}

/** Attach an uploaded file to an inspection, optionally to a section or item. */
export class CreateAttachmentDto {
  @IsOptional() @IsIn(SECTION_KEYS) sectionArea?: InspectionSectionKey;
  @IsOptional() @IsString() @MaxLength(120) itemKey?: string;
  @IsOptional() @IsString() @MaxLength(300) caption?: string;
}

/** Submit for review, or review a submitted inspection. */
export class ReviewInspectionDto {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
