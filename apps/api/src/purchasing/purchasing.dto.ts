import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}

export class RequisitionLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedUnitCostMinor?: number;
}

export class CreateRequisitionDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsISO8601()
  neededBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines!: RequisitionLineDto[];
}

export class PurchaseLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxPercentBp?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsBoolean()
  approve?: boolean;

  @IsISO8601()
  orderDate!: string;

  @IsOptional()
  @IsISO8601()
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class GoodsReceiptLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostMinor?: number;
}

export class CreateGoodsReceiptDto {
  @IsString()
  purchaseOrderId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsISO8601()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines?: GoodsReceiptLineDto[];
}

export class CreateSupplierInvoiceDto {
  @IsString()
  supplierId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  supplierInvoiceNumber!: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsISO8601()
  invoiceDate!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  post?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class ConvertRequisitionDto {
  @IsString()
  supplierId!: string;
}

export class PurchaseReturnLineDto {
  @IsString()
  productId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostMinor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxPercentBp?: number;
}

export class CreatePurchaseReturnDto {
  @IsString()
  supplierId!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsISO8601()
  returnDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnLineDto)
  lines!: PurchaseReturnLineDto[];
}
