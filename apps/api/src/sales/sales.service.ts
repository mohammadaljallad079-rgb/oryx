import { Injectable } from '@nestjs/common';
import { fromQuantity, sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService, SYSTEM_ROLES } from '../common/accounting-posting.service';
import { DocumentSequenceService, type Tx } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { computeDocumentTotals, type PricedLineInput } from '../common/document-totals';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  ConvertQuotationDto,
  CreateCashierSessionDto,
  CreateCreditNoteDto,
  CreateCustomerDto,
  CreateInvoiceDto,
  CreatePosSaleDto,
  CreateQuotationDto,
  CreateSalesOrderDto,
  ListQueryDto,
  PosSaleLineDto,
  SalesLineDto,
  UpdateCustomerDto,
} from './sales.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface InvoiceSource {
  companyId: string;
  branchId: string | null;
  customerId: string;
  warehouseId: string | null;
  currency: string;
  lines: Array<PricedLineInput & { productId: string | null; description: string }>;
  entryDate: Date;
  sourceType: 'SALES_INVOICE' | 'POS_SALE';
  sourceId: string;
  actorUserId: string;
  /** When false, stock is not issued (services / untracked items). */
  issueStock: boolean;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
    private readonly inventory: InventoryService,
  ) {}

  // --------------------------------------------------------------- customers

  async listCustomers(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 200, 500);
    const where = {
      companyId,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' as const } },
              { nameEn: { contains: query.search, mode: 'insensitive' as const } },
              { nameAr: { contains: query.search } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return { items: rows.map(toCustomerDto), total, page, pageSize };
  }

  async createCustomer(dto: CreateCustomerDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.customer.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Customer code ${dto.code} already exists.`);
    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        taxNumber: dto.taxNumber ?? null,
        addressLine: dto.addressLine ?? null,
        city: dto.city ?? null,
        countryCode: dto.countryCode ?? 'SA',
        creditLimitMinor: dto.creditLimitMinor ?? 0,
        paymentTermsDays: dto.paymentTermsDays ?? 0,
        currency: dto.currency ?? 'SAR',
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.customer_created',
      targetType: 'CUSTOMER',
      targetId: customer.id,
      summary: `Created customer ${customer.code} ${customer.nameEn}`,
    });
    return toCustomerDto(customer);
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found.');
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber } : {}),
        ...(dto.addressLine !== undefined ? { addressLine: dto.addressLine } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.creditLimitMinor !== undefined ? { creditLimitMinor: dto.creditLimitMinor } : {}),
        ...(dto.paymentTermsDays !== undefined ? { paymentTermsDays: dto.paymentTermsDays } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.customer_updated',
      targetType: 'CUSTOMER',
      targetId: id,
      summary: `Updated customer ${updated.code}`,
    });
    return toCustomerDto(updated);
  }

  // -------------------------------------------------------------- quotations

  async listQuotations(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { items: rows.map(toQuotationDto), total, page, pageSize };
  }

  async createQuotation(dto: CreateQuotationDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    await this.assertCustomer(companyId, dto.customerId);

    const totals = computeDocumentTotals(dto.lines.map((l) => ({ ...l })));
    const quotation = await this.posting.withTransaction(async (tx) => {
      const quoteNumber = await this.sequences.next(tx, companyId, 'quotation');
      return tx.quotation.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          quoteNumber,
          customerId: dto.customerId,
          status: 'DRAFT',
          issueDate: new Date(dto.issueDate),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: dto.currency ?? 'SAR',
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: { create: buildSimpleLineRows(totals, dto.lines) },
        },
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.quotation_created',
      targetType: 'QUOTATION',
      targetId: quotation.id,
      summary: `Created quotation ${quotation.quoteNumber}`,
    });
    return toQuotationDto(quotation);
  }

  /** Convert an accepted quotation into a sales order (one conversion only). */
  async convertQuotation(id: string, dto: ConvertQuotationDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const quote = await tx.quotation.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!quote) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Quotation not found.');
      if (quote.convertedOrderId) {
        throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'Quotation has already been converted.');
      }
      const orderNumber = await this.sequences.next(tx, companyId, 'salesOrder');
      const order = await tx.salesOrder.create({
        data: {
          companyId,
          branchId: quote.branchId,
          orderNumber,
          customerId: quote.customerId,
          quotationId: quote.id,
          warehouseId: dto.warehouseId ?? null,
          status: 'CONFIRMED',
          orderDate: new Date(),
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          currency: quote.currency,
          createdById: actor.userId,
          lines: {
            create: quote.lines.map((l) => ({
              productId: l.productId,
              description: l.description,
              quantity: l.quantity,
              unitPriceMinor: l.unitPriceMinor,
              discountPercentBp: l.discountPercentBp,
              taxPercentBp: l.taxPercentBp,
              lineTotalMinor: l.lineTotalMinor,
              sortOrder: l.sortOrder,
            })),
          },
        },
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });
      await tx.quotation.update({ where: { id }, data: { status: 'CONVERTED', convertedOrderId: order.id } });
      return order;
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.quotation_converted',
      targetType: 'SALES_ORDER',
      targetId: result.id,
      summary: `Converted quotation to order ${result.orderNumber}`,
    });
    return toSalesOrderDto(result);
  }

  // ------------------------------------------------------------ sales orders

  async listOrders(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { items: rows.map(toSalesOrderDto), total, page, pageSize };
  }

  async createOrder(dto: CreateSalesOrderDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    await this.assertCustomer(companyId, dto.customerId);
    if (dto.warehouseId) await this.assertWarehouse(companyId, dto.warehouseId);

    const totals = computeDocumentTotals(dto.lines.map((l) => ({ ...l })));
    const order = await this.posting.withTransaction(async (tx) => {
      const orderNumber = await this.sequences.next(tx, companyId, 'salesOrder');
      return tx.salesOrder.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          orderNumber,
          customerId: dto.customerId,
          warehouseId: dto.warehouseId ?? null,
          status: dto.confirm ? 'CONFIRMED' : 'DRAFT',
          orderDate: new Date(dto.orderDate),
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: dto.currency ?? 'SAR',
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: { create: buildSimpleLineRows(totals, dto.lines) },
        },
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.order_created',
      targetType: 'SALES_ORDER',
      targetId: order.id,
      summary: `Created sales order ${order.orderNumber}`,
    });
    return toSalesOrderDto(order);
  }

  // ---------------------------------------------------------- sales invoices

  async listInvoices(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);
    return { items: rows.map(toInvoiceDto), total, page, pageSize };
  }

  async getInvoice(id: string, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { nameEn: true, nameAr: true, code: true } },
        lines: true,
        allocations: true,
      },
    });
    if (!invoice) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales invoice not found.');
    return toInvoiceDto(invoice);
  }

  /**
   * Create a sales invoice, optionally from a sales order.
   *
   * Posting is atomic: the invoice header/lines, the ledger entry, the stock
   * issue and the order's invoiced quantities all commit together. The ledger
   * entry is idempotent per invoice via `(companyId, SALES_INVOICE, invoiceId)`.
   */
  async createInvoice(dto: CreateInvoiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const result = await this.posting.withTransaction(async (tx) => {
      let customerId = dto.customerId ?? null;
      let orderId: string | null = null;
      let warehouseId = dto.warehouseId ?? null;
      let currency = dto.currency ?? 'SAR';
      let lineInputs: Array<PricedLineInput & { productId: string | null; description: string }>;

      if (dto.orderId) {
        const order = await tx.salesOrder.findFirst({
          where: { id: dto.orderId, companyId },
          include: { lines: true },
        });
        if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales order not found.');
        if (order.status === 'CANCELLED' || order.status === 'INVOICED') {
          throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'This order cannot be invoiced.');
        }
        const existing = await tx.salesInvoice.findFirst({ where: { companyId, orderId: order.id } });
        if (existing) {
          throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'This order already has an invoice.');
        }
        customerId = order.customerId;
        orderId = order.id;
        warehouseId = dto.warehouseId ?? order.warehouseId ?? null;
        currency = order.currency;
        lineInputs = order.lines.map((l) => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: l.discountPercentBp,
          taxPercentBp: l.taxPercentBp,
        }));
      } else {
        if (!customerId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'customerId or orderId is required.');
        if (!dto.lines || dto.lines.length === 0) {
          throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'An invoice needs at least one line.');
        }
        lineInputs = dto.lines.map((l) => ({
          productId: l.productId ?? null,
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: l.discountPercentBp,
          taxPercentBp: l.taxPercentBp,
        }));
      }

      await this.assertCustomerTx(tx, companyId, customerId!);
      const totals = computeDocumentTotals(lineInputs);

      // Credit limit check for a posted (non-draft) invoice.
      const willPost = dto.post !== false;
      if (willPost) {
        await this.assertCreditLimit(tx, companyId, customerId!, totals.totalMinor);
      }

      const invoiceNumber = await this.sequences.next(tx, companyId, 'salesInvoice');
      const invoiceDate = new Date(dto.invoiceDate);
      const dueDate = dto.dueDate
        ? new Date(dto.dueDate)
        : await computeDueDate(tx, companyId, customerId!, invoiceDate);

      const invoice = await tx.salesInvoice.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          invoiceNumber,
          customerId: customerId!,
          orderId,
          warehouseId,
          status: 'DRAFT',
          invoiceDate,
          dueDate,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency,
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: { create: buildLineRows(totals, lineInputs) },
        },
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });

      if (willPost) {
        const posted = await this.postSalesInvoice(tx, {
          companyId,
          branchId: invoice.branchId,
          customerId: customerId!,
          warehouseId,
          currency,
          lines: lineInputs,
          entryDate: invoiceDate,
          sourceType: 'SALES_INVOICE',
          sourceId: invoice.id,
          actorUserId: actor.userId,
          issueStock: dto.issueStock ?? true,
        });

        // Mark the source order invoiced and update its lines.
        if (orderId) {
          const orderLines = await tx.salesOrderLine.findMany({ where: { orderId } });
          for (const line of orderLines) {
            await tx.salesOrderLine.update({
              where: { id: line.id },
              data: { quantityInvoiced: line.quantity },
            });
          }
          await tx.salesOrder.update({ where: { id: orderId }, data: { status: 'INVOICED' } });
        }
        return posted;
      }
      return toInvoiceDto(invoice);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.invoice_created',
      targetType: 'SALES_INVOICE',
      targetId: result.id,
      summary: `Issued sales invoice ${result.invoiceNumber} for ${result.totalMinor} minor units`,
    });
    return result;
  }

  /**
   * Post a sales invoice to the ledger and issue stock.
   *
   * The entry is:
   *   Dr Accounts receivable   (total)
   *   Dr Sales discount        (discount, when present)
   *   Cr Sales revenue         (subtotal)
   *   Cr VAT payable           (tax)
   * and, when stock is issued, a second entry moves COGS from inventory at the
   * moving-average cost captured by the stock ledger.
   */
  private async postSalesInvoice(tx: Tx, src: InvoiceSource) {
    const totals = computeDocumentTotals(src.lines);
    const arAccount = await this.posting.systemAccount(tx, src.companyId, SYSTEM_ROLES.AR_CONTROL);
    const revenueAccount = await this.posting.systemAccount(tx, src.companyId, SYSTEM_ROLES.SALES_REVENUE);

    const lines = [
      { accountId: arAccount, debit: totals.totalMinor },
      ...(totals.discountMinor > 0
        ? [{ accountId: await this.posting.systemAccount(tx, src.companyId, SYSTEM_ROLES.SALES_DISCOUNT), debit: totals.discountMinor }]
        : []),
      { accountId: revenueAccount, credit: totals.subtotalMinor },
      ...(totals.taxMinor > 0
        ? [{ accountId: await this.posting.systemAccount(tx, src.companyId, SYSTEM_ROLES.VAT_OUTPUT), credit: totals.taxMinor }]
        : []),
    ];

    const journal = await this.posting.postJournal(tx, {
      companyId: src.companyId,
      branchId: src.branchId,
      entryDate: src.entryDate,
      memo: 'Sales invoice',
      sourceType: src.sourceType,
      sourceId: src.sourceId,
      actorUserId: src.actorUserId,
      lines,
    });

    // Stock issue and COGS entry, valued at moving-average cost.
    if (src.issueStock && src.warehouseId) {
      let cogsTotal = 0;
      for (const line of src.lines) {
        if (!line.productId) continue;
        const product = await tx.product.findFirst({ where: { id: line.productId, companyId: src.companyId } });
        if (!product || !product.trackStock) continue;
        const movement = await this.inventory.recordMovement(tx, {
          companyId: src.companyId,
          branchId: src.branchId,
          warehouseId: src.warehouseId,
          productId: line.productId,
          movementType: 'ISSUE',
          quantity: -line.quantity,
          source: src.sourceType === 'POS_SALE' ? 'POS_SALE' : 'SALES_INVOICE',
          sourceId: src.sourceId,
          occurredAt: src.entryDate,
          actorUserId: src.actorUserId,
        });
        cogsTotal += -movement.totalCostMinor;
      }
      if (cogsTotal !== 0) {
        const cogsAccount = await this.posting.systemAccount(tx, src.companyId, SYSTEM_ROLES.COGS);
        const inventoryAccount = await this.posting.systemAccount(tx, src.companyId, SYSTEM_ROLES.INVENTORY);
        await this.posting.postJournal(tx, {
          companyId: src.companyId,
          branchId: src.branchId,
          entryDate: src.entryDate,
          memo: 'Cost of goods sold',
          sourceType: src.sourceType,
          sourceId: `${src.sourceId}:cogs`,
          actorUserId: src.actorUserId,
          lines: [
            { accountId: cogsAccount, debit: cogsTotal },
            { accountId: inventoryAccount, credit: cogsTotal },
          ],
        });
      }
    }

    await tx.salesInvoice.update({
      where: { id: src.sourceId },
      data: { status: 'POSTED', journalEntryId: journal.id, postedAt: new Date() },
    });

    const fresh = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: src.sourceId },
      include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
    });
    return toInvoiceDto(fresh);
  }

  // ------------------------------------------------------------ credit notes

  async listCreditNotes(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.creditNote.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
    });
    return { items: rows.map(toCreditNoteDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /**
   * Issue a credit note and (optionally) restock the returned goods.
   *
   * The entry reverses the sale:
   *   Dr Sales revenue / Dr VAT payable / Cr Accounts receivable
   * and, when restocking, inventory is increased at the original cost.
   */
  async createCreditNote(dto: CreateCreditNoteDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const result = await this.posting.withTransaction(async (tx) => {
      await this.assertCustomerTx(tx, companyId, dto.customerId);
      let invoiceId: string | null = dto.invoiceId ?? null;
      let warehouseId = dto.warehouseId ?? null;
      if (invoiceId) {
        const invoice = await tx.salesInvoice.findFirst({ where: { id: invoiceId, companyId } });
        if (!invoice) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales invoice not found.');
        warehouseId = warehouseId ?? invoice.warehouseId;
      }

      const totals = computeDocumentTotals(dto.lines.map((l) => ({ ...l })));
      const creditNoteNumber = await this.sequences.next(tx, companyId, 'creditNote');
      const issueDate = new Date(dto.issueDate);

      const note = await tx.creditNote.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          creditNoteNumber,
          customerId: dto.customerId,
          invoiceId,
          warehouseId,
          status: 'POSTED',
          issueDate,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          reason: dto.reason ?? null,
          currency: dto.currency ?? 'SAR',
          restockInventory: dto.restockInventory ?? false,
          createdById: actor.userId,
          postedAt: new Date(),
          lines: {
            create: totals.lines.map((l, i) => ({
              productId: dto.lines[i].productId ?? null,
              description: dto.lines[i].description,
              quantity: l.quantity,
              unitPriceMinor: l.unitPriceMinor,
              taxPercentBp: l.taxPercentBp,
              lineTotalMinor: l.lineTotalMinor,
              sortOrder: i,
            })),
          },
        },
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });

      const revenueAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.SALES_REVENUE);
      const arAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AR_CONTROL);
      const journalLines = [
        { accountId: revenueAccount, debit: totals.subtotalMinor },
        ...(totals.taxMinor > 0
          ? [{ accountId: await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.VAT_OUTPUT), debit: totals.taxMinor }]
          : []),
        { accountId: arAccount, credit: totals.totalMinor },
      ];
      const journal = await this.posting.postJournal(tx, {
        companyId,
        branchId: note.branchId,
        entryDate: issueDate,
        memo: `Credit note ${creditNoteNumber}`,
        sourceType: 'CREDIT_NOTE',
        sourceId: note.id,
        actorUserId: actor.userId,
        lines: journalLines,
      });

      // Restock returned goods at their original (moving-average) cost.
      if (dto.restockInventory && warehouseId) {
        let restockValue = 0;
        for (const [i, line] of dto.lines.entries()) {
          if (!line.productId) continue;
          const product = await tx.product.findFirst({ where: { id: line.productId, companyId } });
          if (!product || !product.trackStock) continue;
          const movement = await this.inventory.recordMovement(tx, {
            companyId,
            branchId: note.branchId,
            warehouseId,
            productId: line.productId,
            movementType: 'RECEIPT',
            quantity: totals.lines[i].quantity,
            source: 'CREDIT_NOTE',
            sourceId: note.id,
            occurredAt: issueDate,
            actorUserId: actor.userId,
          });
          restockValue += movement.totalCostMinor;
        }
        if (restockValue !== 0) {
          const cogsAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.COGS);
          const inventoryAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.INVENTORY);
          await this.posting.postJournal(tx, {
            companyId,
            branchId: note.branchId,
            entryDate: issueDate,
            memo: `Credit note restock ${creditNoteNumber}`,
            sourceType: 'CREDIT_NOTE',
            sourceId: `${note.id}:restock`,
            actorUserId: actor.userId,
            lines: [
              { accountId: inventoryAccount, debit: restockValue },
              { accountId: cogsAccount, credit: restockValue },
            ],
          });
        }
      }

      await tx.creditNote.update({ where: { id: note.id }, data: { journalEntryId: journal.id } });
      const fresh = await tx.creditNote.findUniqueOrThrow({
        where: { id: note.id },
        include: { customer: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });
      return toCreditNoteDto(fresh);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'sales.credit_note_created',
      targetType: 'CREDIT_NOTE',
      targetId: result.id,
      summary: `Issued credit note ${result.creditNoteNumber}`,
    });
    return result;
  }

  // ------------------------------------------------------------ cashier/POS

  async listCashierSessions(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.cashierSession.findMany({
      where: { companyId },
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { branch: { select: { nameEn: true, nameAr: true } }, _count: { select: { sales: true } } },
    });
    return { items: rows.map(toCashierSessionDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  async openCashierSession(dto: CreateCashierSessionDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const session = await this.posting.withTransaction(async (tx) => {
      const open = await tx.cashierSession.findFirst({
        where: { companyId, branchId: dto.branchId, status: 'OPEN' },
      });
      if (open) {
        throw conflict(ERROR_CODES.CASHIER_SESSION_ALREADY_OPEN, 'This branch already has an open cashier session.');
      }
      const sessionNumber = await this.sequences.next(tx, companyId, 'cashierSession');
      return tx.cashierSession.create({
        data: {
          companyId,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId ?? null,
          sessionNumber,
          status: 'OPEN',
          openingFloatMinor: dto.openingFloatMinor ?? 0,
          expectedCashMinor: dto.openingFloatMinor ?? 0,
          openedById: actor.userId,
        },
        include: { branch: { select: { nameEn: true, nameAr: true } }, _count: { select: { sales: true } } },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'pos.session_opened',
      targetType: 'CASHIER_SESSION',
      targetId: session.id,
      summary: `Opened cashier session ${session.sessionNumber}`,
    });
    return toCashierSessionDto(session);
  }

  async closeCashierSession(
    id: string,
    countedCashMinor: number,
    notes: string | undefined,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const session = await tx.cashierSession.findFirst({ where: { id, companyId } });
      if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Cashier session not found.');
      if (session.status !== 'OPEN') {
        throw badRequest(ERROR_CODES.CASHIER_SESSION_CLOSED, 'This cashier session is already closed.');
      }
      // Expected cash = opening float + cash POS sales.
      const cashSales = await tx.posSale.findMany({
        where: { cashierSessionId: id, status: 'COMPLETED', paymentMethod: 'CASH' },
      });
      const expected = session.openingFloatMinor + sumMinor(cashSales.map((s) => s.totalMinor));
      const variance = countedCashMinor - expected;

      // Post any cash over/short difference.
      if (variance !== 0) {
        const cashAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.CASH);
        const overShort = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.CASH_OVER_SHORT);
        await this.posting.postJournal(tx, {
          companyId,
          branchId: session.branchId,
          entryDate: new Date(),
          memo: `Cashier session ${session.sessionNumber} cash over/short`,
          sourceType: 'POS_SALE',
          sourceId: `${session.id}:variance`,
          actorUserId: actor.userId,
          lines:
            variance > 0
              ? [
                  { accountId: cashAccount, debit: variance },
                  { accountId: overShort, credit: variance },
                ]
              : [
                  { accountId: overShort, debit: -variance },
                  { accountId: cashAccount, credit: -variance },
                ],
        });
      }

      return tx.cashierSession.update({
        where: { id },
        data: {
          status: 'CLOSED',
          expectedCashMinor: expected,
          countedCashMinor,
          varianceMinor: variance,
          closedById: actor.userId,
          closedAt: new Date(),
          notes: notes ?? null,
        },
        include: { branch: { select: { nameEn: true, nameAr: true } }, _count: { select: { sales: true } } },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'pos.session_closed',
      targetType: 'CASHIER_SESSION',
      targetId: id,
      summary: `Closed cashier session ${result.sessionNumber} with variance ${result.varianceMinor ?? 0}`,
    });
    return toCashierSessionDto(result);
  }

  async listPosSales(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId, ...(query.branchId ? { branchId: query.branchId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.posSale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lines: true },
      }),
      this.prisma.posSale.count({ where }),
    ]);
    return { items: rows.map(toPosSaleDto), total, page, pageSize };
  }

  /**
   * Record a POS sale inside an open cashier session.
   *
   * The sale creates a paid sales invoice (so it appears in AR reporting as
   * settled), issues stock, posts revenue/VAT, and increases the session's
   * expected cash. All of this happens in one transaction.
   */
  async createPosSale(dto: CreatePosSaleDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const result = await this.posting.withTransaction(async (tx) => {
      const session = await tx.cashierSession.findFirst({
        where: { id: dto.cashierSessionId, companyId },
      });
      if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Cashier session not found.');
      if (session.status !== 'OPEN') {
        throw badRequest(ERROR_CODES.CASHIER_SESSION_CLOSED, 'The cashier session is closed.');
      }
      const warehouseId = dto.warehouseId ?? session.warehouseId ?? null;

      const lineInputs = dto.lines.map((l: PosSaleLineDto) => ({
        productId: l.productId ?? null,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountPercentBp: 0,
        taxPercentBp: l.taxPercentBp ?? 0,
      }));
      const totals = computeDocumentTotals(lineInputs);
      const paidMinor = dto.paidMinor ?? totals.totalMinor;
      if (paidMinor < totals.totalMinor) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Paid amount is less than the sale total.');
      }
      const changeMinor = paidMinor - totals.totalMinor;

      // Each POS sale is a settled invoice; a walk-in customer is created lazily.
      const customerId = dto.customerId ?? (await this.ensureWalkInCustomer(tx, companyId));
      const invoiceNumber = await this.sequences.next(tx, companyId, 'salesInvoice');
      const invoiceDate = new Date();
      const invoice = await tx.salesInvoice.create({
        data: {
          companyId,
          branchId: dto.branchId,
          invoiceNumber,
          customerId,
          warehouseId,
          status: 'DRAFT',
          invoiceDate,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: 'SAR',
          notes: `POS sale in session ${session.sessionNumber}`,
          createdById: actor.userId,
          lines: { create: buildLineRows(totals, lineInputs) },
        },
      });

      // Post the invoice (revenue/VAT) and issue stock.
      const posted = await this.postSalesInvoice(tx, {
        companyId,
        branchId: dto.branchId,
        customerId,
        warehouseId,
        currency: 'SAR',
        lines: lineInputs,
        entryDate: invoiceDate,
        sourceType: 'POS_SALE',
        sourceId: invoice.id,
        actorUserId: actor.userId,
        issueStock: true,
      });

      // Settle the invoice immediately with a receipt.
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { amountPaidMinor: totals.totalMinor, status: 'PAID' },
      });

      const receiptNumber = await this.sequences.next(tx, companyId, 'posSale');
      const posSale = await tx.posSale.create({
        data: {
          companyId,
          branchId: dto.branchId,
          cashierSessionId: session.id,
          receiptNumber,
          customerId,
          warehouseId,
          status: 'COMPLETED',
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          paidMinor,
          changeMinor,
          paymentMethod: dto.paymentMethod,
          currency: 'SAR',
          salesInvoiceId: invoice.id,
          journalEntryId: posted.journalEntryId ?? null,
          createdById: actor.userId,
          lines: {
            create: totals.lines.map((l, i) => ({
              productId: lineInputs[i].productId,
              description: lineInputs[i].description,
              quantity: l.quantity,
              unitPriceMinor: l.unitPriceMinor,
              taxPercentBp: l.taxPercentBp,
              taxMinor: l.taxMinor,
              lineTotalMinor: l.lineTotalMinor,
            })),
          },
        },
        include: { lines: true },
      });

      // Settle the AR control against cash for this receipt.
      const cashAccount = await this.posting.systemAccount(
        tx,
        companyId,
        dto.paymentMethod === 'CASH' ? SYSTEM_ROLES.CASH : SYSTEM_ROLES.BANK,
      );
      const arAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AR_CONTROL);
      await this.posting.postJournal(tx, {
        companyId,
        branchId: dto.branchId,
        entryDate: invoiceDate,
        memo: `POS receipt ${receiptNumber}`,
        sourceType: 'POS_SALE',
        sourceId: `${posSale.id}:receipt`,
        actorUserId: actor.userId,
        lines: [
          { accountId: cashAccount, debit: totals.totalMinor },
          { accountId: arAccount, credit: totals.totalMinor },
        ],
      });

      return toPosSaleDto(posSale);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'pos.sale_recorded',
      targetType: 'POS_SALE',
      targetId: result.id,
      summary: `Recorded POS sale ${result.receiptNumber}`,
    });
    return result;
  }

  // ------------------------------------------------------------- helpers

  private async assertCustomer(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found.');
  }

  private async assertCustomerTx(tx: Tx, companyId: string, customerId: string) {
    const customer = await tx.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found.');
  }

  private async assertWarehouse(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found.');
  }

  /** Refuse to post an invoice that would breach the customer's credit limit. */
  private async assertCreditLimit(tx: Tx, companyId: string, customerId: string, newTotal: number) {
    const customer = await tx.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer || customer.creditLimitMinor <= 0) return;
    const open = await tx.salesInvoice.findMany({
      where: { companyId, customerId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
    });
    const outstanding = sumMinor(open.map((i) => i.totalMinor - i.amountPaidMinor));
    if (outstanding + newTotal > customer.creditLimitMinor) {
      throw forbidden(
        ERROR_CODES.CREDIT_LIMIT_EXCEEDED,
        `Credit limit exceeded for ${customer.nameEn}: outstanding ${outstanding} + ${newTotal} > ${customer.creditLimitMinor}.`,
        { outstanding, newTotal, creditLimit: customer.creditLimitMinor },
      );
    }
  }

  /** A single shared walk-in customer per company, created on first use. */
  private async ensureWalkInCustomer(tx: Tx, companyId: string): Promise<string> {
    const existing = await tx.customer.findUnique({ where: { companyId_code: { companyId, code: 'WALK-IN' } } });
    if (existing) return existing.id;
    const created = await tx.customer.create({
      data: { companyId, code: 'WALK-IN', nameEn: 'Walk-in customer', nameAr: 'عميل نقدي' },
    });
    return created.id;
  }
}

// ---------------------------------------------------------------- helpers

async function computeDueDate(tx: Tx, companyId: string, customerId: string, invoiceDate: Date): Promise<Date> {
  const customer = await tx.customer.findFirst({ where: { id: customerId, companyId } });
  const days = customer?.paymentTermsDays ?? 0;
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + days);
  return due;
}

/** Line rows for documents that store only totals (quotation, order, credit note). */
function buildSimpleLineRows(
  totals: ReturnType<typeof computeDocumentTotals>,
  inputs: Array<{ productId?: string | null; description: string }>,
) {
  return totals.lines.map((l, i) => ({
    productId: inputs[i].productId ?? null,
    description: inputs[i].description,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    discountPercentBp: l.discountPercentBp,
    taxPercentBp: l.taxPercentBp,
    lineTotalMinor: l.lineTotalMinor,
    sortOrder: i,
  }));
}

/** Line rows for invoices, which store the per-line subtotal/discount/tax. */
function buildLineRows(
  totals: ReturnType<typeof computeDocumentTotals>,
  inputs: Array<{ productId?: string | null; description: string }>,
) {
  return totals.lines.map((l, i) => ({
    productId: inputs[i].productId ?? null,
    description: inputs[i].description,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    discountPercentBp: l.discountPercentBp,
    taxPercentBp: l.taxPercentBp,
    lineSubtotalMinor: l.lineSubtotalMinor,
    discountMinor: l.discountMinor,
    taxMinor: l.taxMinor,
    lineTotalMinor: l.lineTotalMinor,
    sortOrder: i,
  }));
}

function toCustomerDto(c: {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  addressLine: string | null;
  city: string | null;
  countryCode: string | null;
  creditLimitMinor: number;
  paymentTermsDays: number;
  currency: string;
  isActive: boolean;
  notes: string | null;
}) {
  return { ...c };
}

function toQuotationDto(q: {
  id: string;
  quoteNumber: string;
  customerId: string;
  status: string;
  issueDate: Date;
  validUntil: Date | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  notes: string | null;
  convertedOrderId: string | null;
  customer: { nameEn: string; nameAr: string; code: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    customerId: q.customerId,
    customerNameEn: q.customer.nameEn,
    customerNameAr: q.customer.nameAr,
    status: q.status,
    issueDate: q.issueDate.toISOString(),
    validUntil: q.validUntil?.toISOString() ?? null,
    subtotalMinor: q.subtotalMinor,
    discountMinor: q.discountMinor,
    taxMinor: q.taxMinor,
    totalMinor: q.totalMinor,
    currency: q.currency,
    notes: q.notes,
    convertedOrderId: q.convertedOrderId,
    lines: q.lines,
  };
}

function toSalesOrderDto(o: {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  orderDate: Date;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  notes: string | null;
  customer: { nameEn: string; nameAr: string; code: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerId: o.customerId,
    customerNameEn: o.customer.nameEn,
    customerNameAr: o.customer.nameAr,
    status: o.status,
    orderDate: o.orderDate.toISOString(),
    subtotalMinor: o.subtotalMinor,
    discountMinor: o.discountMinor,
    taxMinor: o.taxMinor,
    totalMinor: o.totalMinor,
    currency: o.currency,
    notes: o.notes,
    lines: o.lines,
  };
}

function toInvoiceDto(inv: {
  id: string;
  invoiceNumber: string;
  customerId: string;
  orderId: string | null;
  status: string;
  invoiceDate: Date;
  dueDate: Date | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  notes: string | null;
  journalEntryId: string | null;
  customer: { nameEn: string; nameAr: string; code: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerNameEn: inv.customer.nameEn,
    customerNameAr: inv.customer.nameAr,
    orderId: inv.orderId,
    status: inv.status,
    invoiceDate: inv.invoiceDate.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    subtotalMinor: inv.subtotalMinor,
    discountMinor: inv.discountMinor,
    taxMinor: inv.taxMinor,
    totalMinor: inv.totalMinor,
    amountPaidMinor: inv.amountPaidMinor,
    outstandingMinor: inv.totalMinor - inv.amountPaidMinor,
    currency: inv.currency,
    notes: inv.notes,
    journalEntryId: inv.journalEntryId,
    lines: inv.lines,
  };
}

function toCreditNoteDto(n: {
  id: string;
  creditNoteNumber: string;
  customerId: string;
  invoiceId: string | null;
  status: string;
  issueDate: Date;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason: string | null;
  currency: string;
  restockInventory: boolean;
  customer: { nameEn: string; nameAr: string; code: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: n.id,
    creditNoteNumber: n.creditNoteNumber,
    customerId: n.customerId,
    customerNameEn: n.customer.nameEn,
    customerNameAr: n.customer.nameAr,
    invoiceId: n.invoiceId,
    status: n.status,
    issueDate: n.issueDate.toISOString(),
    subtotalMinor: n.subtotalMinor,
    taxMinor: n.taxMinor,
    totalMinor: n.totalMinor,
    reason: n.reason,
    currency: n.currency,
    restockInventory: n.restockInventory,
    lines: n.lines,
  };
}

function toCashierSessionDto(s: {
  id: string;
  sessionNumber: string;
  branchId: string;
  warehouseId: string | null;
  status: string;
  openingFloatMinor: number;
  expectedCashMinor: number;
  countedCashMinor: number | null;
  varianceMinor: number | null;
  openedAt: Date;
  closedAt: Date | null;
  notes: string | null;
  branch: { nameEn: string; nameAr: string };
  _count?: { sales: number };
}) {
  return {
    id: s.id,
    sessionNumber: s.sessionNumber,
    branchId: s.branchId,
    branchNameEn: s.branch.nameEn,
    branchNameAr: s.branch.nameAr,
    warehouseId: s.warehouseId,
    status: s.status,
    openingFloatMinor: s.openingFloatMinor,
    expectedCashMinor: s.expectedCashMinor,
    countedCashMinor: s.countedCashMinor,
    varianceMinor: s.varianceMinor,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    notes: s.notes,
    saleCount: s._count?.sales,
  };
}

function toPosSaleDto(s: {
  id: string;
  receiptNumber: string;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  changeMinor: number;
  paymentMethod: string;
  currency: string;
  createdAt: Date;
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: s.id,
    receiptNumber: s.receiptNumber,
    status: s.status,
    subtotalMinor: s.subtotalMinor,
    discountMinor: s.discountMinor,
    taxMinor: s.taxMinor,
    totalMinor: s.totalMinor,
    paidMinor: s.paidMinor,
    changeMinor: s.changeMinor,
    paymentMethod: s.paymentMethod,
    currency: s.currency,
    createdAt: s.createdAt.toISOString(),
    lines: s.lines,
  };
}

export { fromQuantity };
