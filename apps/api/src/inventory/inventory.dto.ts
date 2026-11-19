import { Transform, Type } from 'class-transformer';
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
  companyId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  /** Exact merchandise grouping, used by the point-of-sale category chips. */
  @IsOptional()
  @IsString()
  category?: string;

  /**
   * An exact barcode. A scanner emits the whole code and a trailing Enter, so an
   * exact match is resolved on its own path rather than through the fuzzy
   * `search`, which could also match a SKU or a name fragment.
   */
  @IsOptional()
  @IsString()
  barcode?: string;

  /** `PRODUCT` or `SERVICE`. */
  @IsOptional()
  @IsIn(['PRODUCT', 'SERVICE'])
  type?: 'PRODUCT' | 'SERVICE';

  /** `true` returns only active rows, `false` only inactive ones. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  isActive?: boolean;

  /** `true` returns only rows that carry a barcode, `false` only rows without one. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  hasBarcode?: boolean;

  /**
   * A stock-level filter across the company's warehouses: `out` (never in
   * stock), `low` (at or below the reorder level) or `in` (above it).
   */
  @IsOptional()
  @IsIn(['in', 'low', 'out'])
  stockStatus?: 'in' | 'low' | 'out';

  /**
   * Restrict the stock-level filter to one warehouse. The on-hand quantity is
   * then read from that warehouse's level only, so "low" and "out" reflect the
   * chosen location rather than the company total.
   */
  @IsOptional()
  @IsString()
  warehouseId?: string;

  /** Inclusive sales-price bounds in minor units, for the catalogue price filter. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceMinor?: number;
}

export class CreateWarehouseDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsString()
  inventoryAccountId?: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  addressLine?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @IsOptional() @IsString() @MaxLength(60) sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsIn(['PRODUCT', 'SERVICE'])
  type?: 'PRODUCT' | 'SERVICE';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salesPriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPriceMinor?: number;

  /** VAT rate in basis points (1500 = 15%). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxRateBp?: number;

  /** Reorder threshold scaled by 10^4. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderQuantity?: number;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsString()
  salesAccountId?: string;

  @IsOptional()
  @IsString()
  inventoryAccountId?: string;

  @IsOptional()
  @IsString()
  cogsAccountId?: string;

  // Storefront presentation. These decorate a real stock item; they never
  // change its price, cost or quantity, which stay in the ERP columns above.
  /** Aisle key from PART_CATEGORIES. Required before an item can be published. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  partCategoryKey?: string;

  @IsOptional()
  @IsIn(['NEW', 'REFURBISHED'])
  partCondition?: 'NEW' | 'REFURBISHED';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  warrantyEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  warrantyAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  engineType?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  /** Strike-through promotion price in minor units. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtPriceMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  imageUrl?: string;
}

export class UpdateProductDto {
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
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salesPriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  costPriceMinor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  taxRateBp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Storefront presentation — see CreateProductDto.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  partCategoryKey?: string;

  @IsOptional()
  @IsIn(['NEW', 'REFURBISHED'])
  partCondition?: 'NEW' | 'REFURBISHED';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descriptionAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  warrantyEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  warrantyAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  engineType?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compareAtPriceMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  imageUrl?: string;
}

export class RecordMovementDto {
  @IsString()
  warehouseId!: string;

  @IsString()
  productId!: string;

  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  /** Quantity scaled by 10^4 (10000 = 1 unit). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsISO8601()
  occurredAt!: string;
}

export class TransferLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateTransferDto {
  @IsString()
  fromWarehouseId!: string;

  @IsString()
  toWarehouseId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class AdjustmentLineDto {
  @IsString()
  productId!: string;

  /** Signed delta scaled by 10^4; positive increases stock. */
  @Type(() => Number)
  @IsInt()
  quantityDelta!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostMinor?: number;
}

export class CreateAdjustmentDto {
  @IsString()
  warehouseId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines!: AdjustmentLineDto[];
}

/**
 * Metadata accompanying a product image upload.
 *
 * Note what is absent: no storage path, no URL and no tenant. The file is
 * re-encoded by the media storage service and the product's own company is
 * resolved from the principal, so a client cannot choose where bytes land or
 * attach an image to another tenant's catalogue.
 */
export class UploadProductImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altAr?: string;

  /** When `'true'`, this image becomes the product's primary photograph. */
  @IsOptional()
  @IsIn(['true', 'false'])
  isPrimary?: 'true' | 'false';
}

export class UpdateProductImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  altEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altAr?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
