import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { PurchasingService } from './purchasing.service';
import {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  CreatePurchaseReturnDto,
  CreateRequisitionDto,
  CreateSupplierDto,
  CreateSupplierInvoiceDto,
  ListQueryDto,
  UpdateSupplierDto,
} from './purchasing.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

class ConvertRequisitionDto {
  supplierId!: string;
}

@ApiTags('purchasing')
@ApiBearerAuth()
@RequireModule('purchasing_procurement')
@Controller('purchasing')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  // --------------------------------------------------------------- suppliers
  @Get('suppliers')
  @RequireAnyPermission('erp.purchasing.read', 'erp.purchasing.supplier.manage')
  @ApiOperation({ summary: 'List suppliers' })
  suppliers(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.purchasing.listSuppliers(query, p);
  }

  @Post('suppliers')
  @RequirePermissions('erp.purchasing.supplier.manage')
  @ApiOperation({ summary: 'Create a supplier' })
  createSupplier(@Body() dto: CreateSupplierDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.purchasing.createSupplier(dto, p, actorFrom(p, req));
  }

  @Post('suppliers/:id')
  @RequirePermissions('erp.purchasing.supplier.manage')
  @ApiOperation({ summary: 'Update a supplier' })
  updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.purchasing.updateSupplier(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------ requisitions
  @Get('requisitions')
  @RequireAnyPermission('erp.purchasing.read', 'erp.purchasing.requisition.manage')
  @ApiOperation({ summary: 'List purchase requisitions' })
  requisitions(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.purchasing.listRequisitions(query, p);
  }

  @Post('requisitions')
  @RequirePermissions('erp.purchasing.requisition.manage')
  @ApiOperation({ summary: 'Create a purchase requisition' })
  createRequisition(
    @Body() dto: CreateRequisitionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.purchasing.createRequisition(dto, p, actorFrom(p, req));
  }

  @Post('requisitions/:id/approve')
  @RequirePermissions('erp.purchasing.requisition.manage')
  @ApiOperation({ summary: 'Approve a purchase requisition' })
  approveRequisition(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.purchasing.approveRequisition(id, p, actorFrom(p, req));
  }

  @Post('requisitions/:id/convert')
  @RequirePermissions('erp.purchasing.order.manage')
  @ApiOperation({ summary: 'Convert an approved requisition into a purchase order' })
  convertRequisition(
    @Param('id') id: string,
    @Body() dto: ConvertRequisitionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.purchasing.convertRequisition(id, dto.supplierId, p, actorFrom(p, req));
  }

  // --------------------------------------------------------- purchase orders
  @Get('orders')
  @RequireAnyPermission('erp.purchasing.read', 'erp.purchasing.order.manage')
  @ApiOperation({ summary: 'List purchase orders' })
  orders(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.purchasing.listOrders(query, p);
  }

  @Post('orders')
  @RequirePermissions('erp.purchasing.order.manage')
  @ApiOperation({ summary: 'Create a purchase order' })
  createOrder(@Body() dto: CreatePurchaseOrderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.purchasing.createOrder(dto, p, actorFrom(p, req));
  }

  @Post('orders/:id/approve')
  @RequirePermissions('erp.purchasing.order.manage')
  @ApiOperation({ summary: 'Approve a purchase order' })
  approveOrder(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.purchasing.approveOrder(id, p, actorFrom(p, req));
  }

  // ----------------------------------------------------------- goods receipts
  @Get('receipts')
  @RequireAnyPermission('erp.purchasing.read', 'erp.purchasing.receipt.manage')
  @ApiOperation({ summary: 'List goods receipts' })
  receipts(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.purchasing.listReceipts(query, p);
  }

  @Post('receipts')
  @RequirePermissions('erp.purchasing.receipt.manage')
  @ApiOperation({ summary: 'Receive goods against a purchase order' })
  createReceipt(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.purchasing.createGoodsReceipt(dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------- supplier invoices
  @Get('supplier-invoices')
  @RequireAnyPermission('erp.purchasing.read', 'erp.purchasing.invoice.manage')
  @ApiOperation({ summary: 'List supplier invoices' })
  supplierInvoices(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.purchasing.listSupplierInvoices(query, p);
  }

  @Post('supplier-invoices')
  @RequirePermissions('erp.purchasing.invoice.manage')
  @ApiOperation({ summary: 'Record a supplier invoice' })
  createSupplierInvoice(
    @Body() dto: CreateSupplierInvoiceDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.purchasing.createSupplierInvoice(dto, p, actorFrom(p, req));
  }

  // --------------------------------------------------------- purchase returns
  @Get('returns')
  @RequireAnyPermission('erp.purchasing.read', 'erp.purchasing.return.manage')
  @ApiOperation({ summary: 'List purchase returns' })
  returns(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.purchasing.listReturns(query, p);
  }

  @Post('returns')
  @RequirePermissions('erp.purchasing.return.manage')
  @ApiOperation({ summary: 'Return goods to a supplier' })
  createReturn(
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.purchasing.createReturn(dto, p, actorFrom(p, req));
  }
}
