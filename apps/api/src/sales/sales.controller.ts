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
import { SalesService } from './sales.service';
import {
  CloseCashierSessionDto,
  ConvertQuotationDto,
  CreateCashierSessionDto,
  CreateCreditNoteDto,
  CreateCustomerDto,
  CreateInvoiceDto,
  CreatePosSaleDto,
  CreateQuotationDto,
  CreateSalesOrderDto,
  ListQueryDto,
  UpdateCustomerDto,
} from './sales.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('sales')
@ApiBearerAuth()
@RequireModule('sales_pos')
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // --------------------------------------------------------------- customers
  @Get('customers')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.customer.manage')
  @ApiOperation({ summary: 'List customers' })
  customers(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listCustomers(query, p);
  }

  @Post('customers')
  @RequirePermissions('erp.sales.customer.manage')
  @ApiOperation({ summary: 'Create a customer' })
  createCustomer(@Body() dto: CreateCustomerDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.sales.createCustomer(dto, p, actorFrom(p, req));
  }

  @Post('customers/:id')
  @RequirePermissions('erp.sales.customer.manage')
  @ApiOperation({ summary: 'Update a customer' })
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.sales.updateCustomer(id, dto, p, actorFrom(p, req));
  }

  // -------------------------------------------------------------- quotations
  @Get('quotations')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.order.manage')
  @ApiOperation({ summary: 'List quotations' })
  quotations(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listQuotations(query, p);
  }

  @Post('quotations')
  @RequirePermissions('erp.sales.order.manage')
  @ApiOperation({ summary: 'Create a quotation' })
  createQuotation(@Body() dto: CreateQuotationDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.sales.createQuotation(dto, p, actorFrom(p, req));
  }

  @Post('quotations/:id/convert')
  @RequirePermissions('erp.sales.order.manage')
  @ApiOperation({ summary: 'Convert a quotation into a sales order' })
  convertQuotation(
    @Param('id') id: string,
    @Body() dto: ConvertQuotationDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.sales.convertQuotation(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------ sales orders
  @Get('orders')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.order.manage')
  @ApiOperation({ summary: 'List sales orders' })
  orders(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listOrders(query, p);
  }

  @Post('orders')
  @RequirePermissions('erp.sales.order.manage')
  @ApiOperation({ summary: 'Create a sales order' })
  createOrder(@Body() dto: CreateSalesOrderDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.sales.createOrder(dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------- sales invoices
  @Get('invoices')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.invoice.manage')
  @ApiOperation({ summary: 'List sales invoices' })
  invoices(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listInvoices(query, p);
  }

  @Get('invoices/:id')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.invoice.manage')
  @ApiOperation({ summary: 'Sales invoice detail' })
  invoice(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.getInvoice(id, p);
  }

  @Post('invoices')
  @RequirePermissions('erp.sales.invoice.manage')
  @ApiOperation({ summary: 'Create and post a sales invoice' })
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.sales.createInvoice(dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------ credit notes
  @Get('credit-notes')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.credit_note.manage')
  @ApiOperation({ summary: 'List credit notes' })
  creditNotes(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listCreditNotes(query, p);
  }

  @Post('credit-notes')
  @RequirePermissions('erp.sales.credit_note.manage')
  @ApiOperation({ summary: 'Issue a credit note (optionally restocking goods)' })
  createCreditNote(
    @Body() dto: CreateCreditNoteDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.sales.createCreditNote(dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------ cashier / POS
  @Get('cashier-sessions')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.pos.manage', 'erp.sales.pos.operate')
  @ApiOperation({ summary: 'List cashier sessions' })
  cashierSessions(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listCashierSessions(query, p);
  }

  @Post('cashier-sessions')
  @RequirePermissions('erp.sales.pos.operate')
  @ApiOperation({ summary: 'Open a cashier session' })
  openSession(
    @Body() dto: CreateCashierSessionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.sales.openCashierSession(dto, p, actorFrom(p, req));
  }

  @Post('cashier-sessions/:id/close')
  @RequirePermissions('erp.sales.pos.manage')
  @ApiOperation({ summary: 'Close and reconcile a cashier session' })
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseCashierSessionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.sales.closeCashierSession(id, dto.countedCashMinor, dto.notes, p, actorFrom(p, req));
  }

  @Get('pos-sales')
  @RequireAnyPermission('erp.sales.read', 'erp.sales.pos.manage', 'erp.sales.pos.operate')
  @ApiOperation({ summary: 'List POS sales' })
  posSales(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.sales.listPosSales(query, p);
  }

  @Post('pos-sales')
  @RequirePermissions('erp.sales.pos.operate')
  @ApiOperation({ summary: 'Record a POS sale inside an open cashier session' })
  createPosSale(@Body() dto: CreatePosSaleDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.sales.createPosSale(dto, p, actorFrom(p, req));
  }
}
