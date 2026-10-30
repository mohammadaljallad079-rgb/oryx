import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { InventoryService } from './inventory.service';
import { ProductImageService } from './product-image.service';
import {
  CreateAdjustmentDto,
  CreateProductDto,
  CreateTransferDto,
  CreateWarehouseDto,
  ListQueryDto,
  RecordMovementDto,
  UpdateProductDto,
  UpdateProductImageDto,
  UpdateWarehouseDto,
  UploadProductImageDto,
} from './inventory.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('inventory')
@ApiBearerAuth()
@RequireModule('warehouses_inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly productImages: ProductImageService,
  ) {}

  // -------------------------------------------------------------- warehouses
  @Get('warehouses')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.warehouse.manage')
  @ApiOperation({ summary: 'List warehouses' })
  warehouses(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.listWarehouses(query, p);
  }

  @Post('warehouses')
  @RequirePermissions('erp.inventory.warehouse.manage')
  @ApiOperation({ summary: 'Create a warehouse' })
  createWarehouse(@Body() dto: CreateWarehouseDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.createWarehouse(dto, p, actorFrom(p, req));
  }

  @Patch('warehouses/:id')
  @RequirePermissions('erp.inventory.warehouse.manage')
  @ApiOperation({ summary: 'Update a warehouse' })
  updateWarehouse(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inventory.updateWarehouse(id, dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------------- products
  @Get('products')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.item.manage', 'erp.sales.catalog.manage')
  @ApiOperation({ summary: 'List stock items / products' })
  products(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.listProducts(query, p);
  }

  @Post('products')
  @RequireAnyPermission('erp.inventory.item.manage', 'erp.sales.catalog.manage')
  @ApiOperation({ summary: 'Create a product or service' })
  createProduct(@Body() dto: CreateProductDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.createProduct(dto, p, actorFrom(p, req));
  }

  @Patch('products/:id')
  @RequireAnyPermission('erp.inventory.item.manage', 'erp.sales.catalog.manage')
  @ApiOperation({ summary: 'Update a product' })
  updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inventory.updateProduct(id, dto, p, actorFrom(p, req));
  }

  // --------------------------------------------------------- stock movements
  @Get('movements')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.valuation.read')
  @ApiOperation({ summary: 'Stock movement ledger' })
  movements(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.listMovements(query, p);
  }

  @Post('movements')
  @RequirePermissions('erp.inventory.movement.manage')
  @ApiOperation({ summary: 'Record a manual stock receipt or issue' })
  recordMovement(@Body() dto: RecordMovementDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.recordManualMovement(dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------- transfers
  @Get('transfers')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.transfer.manage')
  @ApiOperation({ summary: 'List stock transfers' })
  transfers(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.listTransfers(query, p);
  }

  @Post('transfers')
  @RequirePermissions('erp.inventory.transfer.manage')
  @ApiOperation({ summary: 'Create a draft stock transfer' })
  createTransfer(@Body() dto: CreateTransferDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.createTransfer(dto, p, actorFrom(p, req));
  }

  @Post('transfers/:id/post')
  @RequirePermissions('erp.inventory.transfer.manage')
  @ApiOperation({ summary: 'Post a transfer (issue + receive, atomically)' })
  postTransfer(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.postTransfer(id, p, actorFrom(p, req));
  }

  // ----------------------------------------------------------- adjustments
  @Get('adjustments')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.adjustment.manage')
  @ApiOperation({ summary: 'List stock adjustments' })
  adjustments(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.listAdjustments(query, p);
  }

  @Post('adjustments')
  @RequirePermissions('erp.inventory.adjustment.manage')
  @ApiOperation({ summary: 'Create a draft stock adjustment' })
  createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.createAdjustment(dto, p, actorFrom(p, req));
  }

  @Post('adjustments/:id/post')
  @RequirePermissions('erp.inventory.adjustment.manage')
  @ApiOperation({ summary: 'Post a stock adjustment and its valuation entry' })
  postAdjustment(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inventory.postAdjustment(id, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- valuation
  @Get('valuation')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.valuation.read')
  @ApiOperation({ summary: 'Inventory valuation by warehouse and product' })
  valuation(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.valuation(p, companyId);
  }

  @Get('reorder-alerts')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.valuation.read')
  @ApiOperation({ summary: 'Products at or below their reorder level' })
  reorderAlerts(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inventory.reorderAlerts(p, companyId);
  }

  // ---------------------------------------------------------- product images
  /**
   * Product photography.
   *
   * A product image is catalogue data a company administrator manages, so the
   * routes take `erp.inventory.item.manage`. The bytes are validated and
   * re-encoded by the shared media storage service; the client only supplies the
   * file and its alt text.
   */
  @Get('products/:productId/images')
  @RequireAnyPermission('erp.inventory.read', 'erp.inventory.item.manage')
  @ApiOperation({ summary: 'List a product\'s images' })
  listProductImages(@Param('productId') productId: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.productImages.list(productId, p);
  }

  @Post('products/:productId/images')
  @RequirePermissions('erp.inventory.item.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a product image' })
  uploadProductImage(
    @Param('productId') productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadProductImageDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    ProductImageService.assertFile(file);
    return this.productImages.upload(
      productId,
      file,
      {
        altEn: dto.altEn,
        altAr: dto.altAr,
        isPrimary: dto.isPrimary === 'true',
      },
      p,
      actorFrom(p, req),
    );
  }

  @Patch('products/:productId/images/:imageId')
  @RequirePermissions('erp.inventory.item.manage')
  @ApiOperation({ summary: 'Update a product image' })
  updateProductImage(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateProductImageDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.productImages.update(productId, imageId, dto, p, actorFrom(p, req));
  }

  @Delete('products/:productId/images/:imageId')
  @RequirePermissions('erp.inventory.item.manage')
  @ApiOperation({ summary: 'Remove a product image' })
  removeProductImage(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.productImages.remove(productId, imageId, p, actorFrom(p, req));
  }
}
