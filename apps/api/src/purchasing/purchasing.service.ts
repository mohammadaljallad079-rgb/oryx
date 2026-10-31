import { Injectable } from '@nestjs/common';
import { basisPointsOfMinor, lineAmountMinor, sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService, SYSTEM_ROLES, type PostingLine } from '../common/accounting-posting.service';
import { DocumentSequenceService, type Tx } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { badRequest, conflict, ERROR_CODES, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  CreatePurchaseReturnDto,
  CreateRequisitionDto,
  CreateSupplierDto,
  CreateSupplierInvoiceDto,
  ListQueryDto,
  PurchaseLineDto,
  UpdateSupplierDto,
} from './purchasing.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
    private readonly inventory: InventoryService,
  ) {}

  // --------------------------------------------------------------- suppliers

  async listSuppliers(query: ListQueryDto, principal: RequestPrincipal) {
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
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items: rows.map(toSupplierDto), total, page, pageSize };
  }

  async createSupplier(dto: CreateSupplierDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    // A new supplier inherits the tenant's own market, not a hard-coded one.
    const [defaultCurrency, defaultCountry] = await Promise.all([
      this.context.companyCurrency(companyId),
      this.context.companyCountryCode(companyId),
    ]);
    const dup = await this.prisma.supplier.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Supplier code ${dto.code} already exists.`);
    const supplier = await this.prisma.supplier.create({
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
        countryCode: dto.countryCode ?? defaultCountry,
        paymentTermsDays: dto.paymentTermsDays ?? 0,
        currency: dto.currency ?? defaultCurrency,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.supplier_created',
      targetType: 'SUPPLIER',
      targetId: supplier.id,
      summary: `Created supplier ${supplier.code} ${supplier.nameEn}`,
    });
    return toSupplierDto(supplier);
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Supplier not found.');
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber } : {}),
        ...(dto.addressLine !== undefined ? { addressLine: dto.addressLine } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.paymentTermsDays !== undefined ? { paymentTermsDays: dto.paymentTermsDays } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.supplier_updated',
      targetType: 'SUPPLIER',
      targetId: id,
      summary: `Updated supplier ${updated.code}`,
    });
    return toSupplierDto(updated);
  }

  // ------------------------------------------------------------ requisitions

  async listRequisitions(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.purchaseRequisition.findMany({
      where: { companyId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
    });
    return { items: rows.map(toRequisitionDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  async createRequisition(dto: CreateRequisitionDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const requisition = await this.posting.withTransaction(async (tx) => {
      const requisitionNumber = await this.sequences.next(tx, companyId, 'purchaseRequisition');
      return tx.purchaseRequisition.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          requisitionNumber,
          status: 'DRAFT',
          requestedById: actor.userId,
          neededBy: dto.neededBy ? new Date(dto.neededBy) : null,
          supplierId: dto.supplierId ?? null,
          notes: dto.notes ?? null,
          lines: {
            create: dto.lines.map((l, i) => ({
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              estimatedUnitCostMinor: l.estimatedUnitCostMinor ?? 0,
              sortOrder: i,
            })),
          },
        },
        include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.requisition_created',
      targetType: 'PURCHASE_REQUISITION',
      targetId: requisition.id,
      summary: `Created requisition ${requisition.requisitionNumber}`,
    });
    return toRequisitionDto(requisition);
  }

  async approveRequisition(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const req = await this.prisma.purchaseRequisition.findFirst({ where: { id, companyId } });
    if (!req) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Requisition not found.');
    if (req.status !== 'DRAFT' && req.status !== 'SUBMITTED') {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only a draft or submitted requisition can be approved.');
    }
    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
      include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.requisition_approved',
      targetType: 'PURCHASE_REQUISITION',
      targetId: id,
      summary: `Approved requisition ${updated.requisitionNumber}`,
    });
    return toRequisitionDto(updated);
  }

  /** Convert an approved requisition into a purchase order. */
  async convertRequisition(id: string, supplierId: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const companyCurrency = await this.context.companyCurrency(companyId);
    const result = await this.posting.withTransaction(async (tx) => {
      const req = await tx.purchaseRequisition.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!req) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Requisition not found.');
      if (req.status !== 'APPROVED') {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only an approved requisition can be converted.');
      }
      if (req.convertedOrderId) throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'Requisition already converted.');
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, companyId } });
      if (!supplier) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Supplier not found.');

      const lineInputs = req.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitCostMinor: l.estimatedUnitCostMinor,
        taxPercentBp: 0,
      }));
      const totals = computePurchaseTotals(lineInputs);
      const orderNumber = await this.sequences.next(tx, companyId, 'purchaseOrder');
      const order = await tx.purchaseOrder.create({
        data: {
          companyId,
          branchId: req.branchId,
          orderNumber,
          supplierId,
          requisitionId: req.id,
          status: 'DRAFT',
          orderDate: new Date(),
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: companyCurrency,
          createdById: actor.userId,
          lines: {
            create: lineInputs.map((l, i) => ({
              productId: l.productId,
              description: l.description,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor,
              taxPercentBp: l.taxPercentBp,
              lineTotalMinor: totals.lines[i].lineTotalMinor,
              sortOrder: i,
            })),
          },
        },
        include: { lines: true, supplier: { select: { nameEn: true, nameAr: true, code: true } } },
      });
      await tx.purchaseRequisition.update({
        where: { id },
        data: { status: 'CONVERTED', convertedOrderId: order.id },
      });
      return order;
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.requisition_converted',
      targetType: 'PURCHASE_ORDER',
      targetId: result.id,
      summary: `Converted requisition to order ${result.orderNumber}`,
    });
    return toPurchaseOrderDto(result);
  }

  // --------------------------------------------------------- purchase orders

  async listOrders(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { supplier: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items: rows.map(toPurchaseOrderDto), total, page, pageSize };
  }

  async createOrder(dto: CreatePurchaseOrderDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    await this.assertSupplier(companyId, dto.supplierId);
    if (dto.warehouseId) await this.assertWarehouse(companyId, dto.warehouseId);

    const companyCurrency = await this.context.companyCurrency(companyId);
    const totals = computePurchaseTotals(dto.lines);
    const order = await this.posting.withTransaction(async (tx) => {
      const orderNumber = await this.sequences.next(tx, companyId, 'purchaseOrder');
      return tx.purchaseOrder.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          orderNumber,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId ?? null,
          status: dto.approve ? 'APPROVED' : 'DRAFT',
          orderDate: new Date(dto.orderDate),
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: dto.currency ?? companyCurrency,
          notes: dto.notes ?? null,
          approvedById: dto.approve ? actor.userId : null,
          approvedAt: dto.approve ? new Date() : null,
          createdById: actor.userId,
          lines: {
            create: dto.lines.map((l, i) => ({
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor,
              taxPercentBp: l.taxPercentBp ?? 0,
              lineTotalMinor: totals.lines[i].lineTotalMinor,
              sortOrder: i,
            })),
          },
        },
        include: { supplier: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.order_created',
      targetType: 'PURCHASE_ORDER',
      targetId: order.id,
      summary: `Created purchase order ${order.orderNumber}`,
    });
    return toPurchaseOrderDto(order);
  }

  async approveOrder(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const order = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId } });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Purchase order not found.');
    if (order.status !== 'DRAFT') throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only a draft order can be approved.');
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
      include: { supplier: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.order_approved',
      targetType: 'PURCHASE_ORDER',
      targetId: id,
      summary: `Approved purchase order ${updated.orderNumber}`,
    });
    return toPurchaseOrderDto(updated);
  }

  // ------------------------------------------------------------ goods receipt

  async listReceipts(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.goodsReceipt.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
    });
    return { items: rows.map(toGoodsReceiptDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /**
   * Receive goods against a purchase order.
   *
   * Receipt increases stock at the ordered unit cost (moving-average) and posts
   * the accrual entry: Dr Inventory, Cr Goods-received-not-invoiced (AP
   * control is not touched until the supplier invoice arrives, but for a small
   * ERP we accrue directly against AP to keep the ledger complete).
   */
  async createGoodsReceipt(dto: CreateGoodsReceiptDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const result = await this.posting.withTransaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, companyId },
        include: { lines: true },
      });
      if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Purchase order not found.');
      if (order.status === 'DRAFT' || order.status === 'CANCELLED') {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only an approved order can be received.');
      }
      const warehouseId = dto.warehouseId ?? order.warehouseId;
      if (!warehouseId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A warehouse is required to receive goods.');
      await this.assertWarehouseTx(tx, companyId, warehouseId);

      const receiptNumber = await this.sequences.next(tx, companyId, 'goodsReceipt');
      const receivedAt = new Date(dto.receivedAt);

      // Determine received quantities: explicit lines, or the outstanding order.
      const receiptLines = dto.lines
        ? dto.lines.map((l) => {
            const orderLine = order.lines.find((ol) => ol.productId === l.productId);
            if (!orderLine) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Received product is not on the order.');
            return {
              productId: l.productId,
              description: orderLine.description,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor ?? orderLine.unitCostMinor,
            };
          })
        : order.lines
            .filter((ol) => ol.productId && ol.quantity - ol.quantityReceived > 0)
            .map((ol) => ({
              productId: ol.productId!,
              description: ol.description,
              quantity: ol.quantity - ol.quantityReceived,
              unitCostMinor: ol.unitCostMinor,
            }));

      if (receiptLines.length === 0) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Nothing remains to receive on this order.');
      }

      const receipt = await tx.goodsReceipt.create({
        data: {
          companyId,
          branchId: dto.branchId ?? order.branchId,
          receiptNumber,
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          warehouseId,
          status: 'POSTED',
          receivedAt,
          notes: dto.notes ?? null,
          receivedById: actor.userId,
          lines: {
            create: receiptLines.map((l, i) => ({
              productId: l.productId,
              description: l.description,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor,
              sortOrder: i,
            })),
          },
        },
        include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
      });

      // Increase stock and accumulate the received value.
      let receivedValue = 0;
      for (const line of receiptLines) {
        const movement = await this.inventory.recordMovement(tx, {
          companyId,
          branchId: receipt.branchId,
          warehouseId,
          productId: line.productId,
          movementType: 'RECEIPT',
          quantity: line.quantity,
          unitCostMinor: line.unitCostMinor,
          source: 'GOODS_RECEIPT',
          sourceId: receipt.id,
          occurredAt: receivedAt,
          actorUserId: actor.userId,
        });
        receivedValue += movement.totalCostMinor;
      }

      // Accrue the receipt: Dr Inventory, Cr Accounts payable.
      if (receivedValue !== 0) {
        const inventoryAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.INVENTORY);
        const apAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AP_CONTROL);
        const journal = await this.posting.postJournal(tx, {
          companyId,
          branchId: receipt.branchId,
          entryDate: receivedAt,
          memo: `Goods receipt ${receiptNumber}`,
          sourceType: 'GOODS_RECEIPT',
          sourceId: receipt.id,
          actorUserId: actor.userId,
          lines: [
            { accountId: inventoryAccount, debit: receivedValue },
            { accountId: apAccount, credit: receivedValue },
          ],
        });
        await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { journalEntryId: journal.id } });
      }

      // Update order line received quantities and the order status.
      for (const line of receiptLines) {
        const orderLine = order.lines.find((ol) => ol.productId === line.productId);
        if (orderLine) {
          await tx.purchaseOrderLine.update({
            where: { id: orderLine.id },
            data: { quantityReceived: orderLine.quantityReceived + line.quantity },
          });
        }
      }
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { orderId: order.id } });
      const fullyReceived = refreshed.every((l) => l.quantityReceived >= l.quantity);
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      });

      const fresh = await tx.goodsReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
      });
      return toGoodsReceiptDto(fresh);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.receipt_created',
      targetType: 'GOODS_RECEIPT',
      targetId: result.id,
      summary: `Received goods ${result.receiptNumber}`,
    });
    return result;
  }

  // --------------------------------------------------------- supplier invoice

  async listSupplierInvoices(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId, ...(query.status ? { status: query.status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { supplier: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return { items: rows.map(toSupplierInvoiceDto), total, page, pageSize };
  }

  /**
   * Record a supplier invoice.
   *
   * When the invoice is linked to a purchase order that was already received,
   * the AP accrual already exists, so only the VAT is posted; otherwise the full
   * expense/inventory value is accrued. This avoids double-counting payables.
   */
  async createSupplierInvoice(dto: CreateSupplierInvoiceDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    await this.assertSupplier(companyId, dto.supplierId);

    const companyCurrency = await this.context.companyCurrency(companyId);
    const result = await this.posting.withTransaction(async (tx) => {
      const totals = computePurchaseTotals(dto.lines);
      const invoiceDate = new Date(dto.invoiceDate);
      const invoiceNumber = await this.sequences.next(tx, companyId, 'supplierInvoice');

      // Already received against the PO? Then only VAT remains to accrue.
      let alreadyAccrued = 0;
      if (dto.purchaseOrderId) {
        const order = await tx.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, companyId } });
        if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Purchase order not found.');
        const receipts = await tx.goodsReceipt.findMany({ where: { purchaseOrderId: order.id, status: 'POSTED' } });
        if (receipts.length > 0) alreadyAccrued = totals.subtotalMinor;
      }

      const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, companyId } });
      const dueDate = dto.dueDate
        ? new Date(dto.dueDate)
        : addDays(invoiceDate, supplier?.paymentTermsDays ?? 0);

      const invoice = await tx.supplierInvoice.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          invoiceNumber,
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId ?? null,
          status: 'DRAFT',
          invoiceDate,
          dueDate,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          currency: dto.currency ?? companyCurrency,
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: {
            create: dto.lines.map((l, i) => ({
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor,
              taxPercentBp: l.taxPercentBp ?? 0,
              lineSubtotalMinor: totals.lines[i].lineSubtotalMinor,
              taxMinor: totals.lines[i].taxMinor,
              lineTotalMinor: totals.lines[i].lineTotalMinor,
              sortOrder: i,
            })),
          },
        },
        include: { supplier: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });

      if (dto.post !== false) {
        const apAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AP_CONTROL);
        const inventoryAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.INVENTORY);
        const vatInput = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.VAT_INPUT);
        const expenseAccount = inventoryAccount;
        // Only the part not already accrued by a goods receipt increases the
        // payable; the VAT is always accrued by the invoice.
        const netToAccrue = totals.subtotalMinor - alreadyAccrued;
        const apIncrease = netToAccrue + totals.taxMinor;

        const journalLines: PostingLine[] = [{ accountId: apAccount, credit: apIncrease }];
        if (netToAccrue !== 0) {
          journalLines.push({ accountId: expenseAccount, debit: netToAccrue });
        }
        if (totals.taxMinor > 0) {
          journalLines.push({ accountId: vatInput, debit: totals.taxMinor });
        }
        const journal = await this.posting.postJournal(tx, {
          companyId,
          branchId: invoice.branchId,
          entryDate: invoiceDate,
          memo: `Supplier invoice ${invoiceNumber}`,
          sourceType: 'SUPPLIER_INVOICE',
          sourceId: invoice.id,
          actorUserId: actor.userId,
          lines: journalLines,
        });
        await tx.supplierInvoice.update({
          where: { id: invoice.id },
          data: { status: 'POSTED', journalEntryId: journal.id, postedAt: new Date() },
        });
      }

      const fresh = await tx.supplierInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { supplier: { select: { nameEn: true, nameAr: true, code: true } }, lines: true },
      });
      return toSupplierInvoiceDto(fresh);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.supplier_invoice_created',
      targetType: 'SUPPLIER_INVOICE',
      targetId: result.id,
      summary: `Recorded supplier invoice ${result.invoiceNumber}`,
    });
    return result;
  }

  // --------------------------------------------------------- purchase returns

  async listReturns(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const rows = await this.prisma.purchaseReturn.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
    });
    return { items: rows.map(toPurchaseReturnDto), total: rows.length, page: 1, pageSize: rows.length };
  }

  /** Return goods to a supplier: issue stock and reverse the payable. */
  async createReturn(dto: CreatePurchaseReturnDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    await this.assertSupplier(companyId, dto.supplierId);

    const companyCurrency = await this.context.companyCurrency(companyId);
    const result = await this.posting.withTransaction(async (tx) => {
      await this.assertWarehouseTx(tx, companyId, dto.warehouseId);
      const totals = computePurchaseTotals(dto.lines);
      const returnDate = new Date(dto.returnDate);
      const returnNumber = await this.sequences.next(tx, companyId, 'purchaseReturn');

      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          returnNumber,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId ?? null,
          warehouseId: dto.warehouseId,
          status: 'POSTED',
          returnDate,
          subtotalMinor: totals.subtotalMinor,
          taxMinor: totals.taxMinor,
          totalMinor: totals.totalMinor,
          reason: dto.reason ?? null,
          currency: dto.currency ?? companyCurrency,
          createdById: actor.userId,
          postedAt: new Date(),
          lines: {
            create: dto.lines.map((l, i) => ({
              productId: l.productId,
              description: l.description,
              quantity: l.quantity,
              unitCostMinor: l.unitCostMinor,
              taxPercentBp: l.taxPercentBp ?? 0,
              lineTotalMinor: totals.lines[i].lineTotalMinor,
              sortOrder: i,
            })),
          },
        },
        include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
      });

      // Issue the returned goods and accumulate their value.
      let returnedValue = 0;
      for (const line of dto.lines) {
        const movement = await this.inventory.recordMovement(tx, {
          companyId,
          branchId: purchaseReturn.branchId,
          warehouseId: dto.warehouseId,
          productId: line.productId,
          movementType: 'ISSUE',
          quantity: -line.quantity,
          source: 'PURCHASE_RETURN',
          sourceId: purchaseReturn.id,
          occurredAt: returnDate,
          actorUserId: actor.userId,
        });
        returnedValue += -movement.totalCostMinor;
      }

      // Reverse the payable at the invoiced value: Dr AP, Cr Inventory (at
      // moving-average cost), Cr input VAT, and post any difference between the
      // invoiced cost and the inventory valuation to a price-variance account so
      // the entry always balances.
      const apAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AP_CONTROL);
      const inventoryAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.INVENTORY);
      const journalLines: PostingLine[] = [{ accountId: apAccount, debit: totals.totalMinor }];
      if (returnedValue !== 0) journalLines.push({ accountId: inventoryAccount, credit: returnedValue });
      if (totals.taxMinor > 0) {
        const vatInput = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.VAT_INPUT);
        journalLines.push({ accountId: vatInput, credit: totals.taxMinor });
      }
      const variance = totals.totalMinor - returnedValue - totals.taxMinor;
      if (variance !== 0) {
        const varianceAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.PURCHASE_PRICE_VARIANCE);
        journalLines.push(
          variance > 0
            ? { accountId: varianceAccount, debit: variance }
            : { accountId: varianceAccount, credit: -variance },
        );
      }
      const journal = await this.posting.postJournal(tx, {
        companyId,
        branchId: purchaseReturn.branchId,
        entryDate: returnDate,
        memo: `Purchase return ${returnNumber}`,
        sourceType: 'PURCHASE_RETURN',
        sourceId: purchaseReturn.id,
        actorUserId: actor.userId,
        lines: journalLines,
      });
      await tx.purchaseReturn.update({ where: { id: purchaseReturn.id }, data: { journalEntryId: journal.id } });

      const fresh = await tx.purchaseReturn.findUniqueOrThrow({
        where: { id: purchaseReturn.id },
        include: { lines: true, supplier: { select: { nameEn: true, nameAr: true } } },
      });
      return toPurchaseReturnDto(fresh);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'purchasing.return_created',
      targetType: 'PURCHASE_RETURN',
      targetId: result.id,
      summary: `Recorded purchase return ${result.returnNumber}`,
    });
    return result;
  }

  // ------------------------------------------------------------- helpers

  private async assertSupplier(companyId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, companyId } });
    if (!supplier) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Supplier not found.');
  }

  private async assertWarehouse(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found.');
  }

  private async assertWarehouseTx(tx: Tx, companyId: string, warehouseId: string) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found.');
  }
}

// ---------------------------------------------------------------- helpers

/**
 * Purchase documents carry a line subtotal, tax and total. Unlike sales there is
 * no line-level discount, so the maths is subtotal + tax only.
 */
function computePurchaseTotals(
  lines: Array<{ quantity: number; unitCostMinor: number; taxPercentBp?: number }>,
) {
  const priced = lines.map((l) => {
    const subtotal = multiplyMinor(l.quantity, l.unitCostMinor);
    const tax = percentOf(subtotal, l.taxPercentBp ?? 0);
    return {
      quantity: l.quantity,
      unitPriceMinor: l.unitCostMinor,
      discountPercentBp: 0,
      taxPercentBp: l.taxPercentBp ?? 0,
      lineSubtotalMinor: subtotal,
      discountMinor: 0,
      taxMinor: tax,
      lineTotalMinor: subtotal + tax,
    };
  });
  return {
    lines: priced,
    subtotalMinor: sumMinor(priced.map((l) => l.lineSubtotalMinor)),
    discountMinor: 0,
    taxMinor: sumMinor(priced.map((l) => l.taxMinor)),
    totalMinor: sumMinor(priced.map((l) => l.lineTotalMinor)),
  };
}

function multiplyMinor(quantity: number, unitCostMinor: number): number {
  return lineAmountMinor(quantity, unitCostMinor);
}

function percentOf(minor: number, rateBp: number): number {
  return basisPointsOfMinor(minor, rateBp);
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function toSupplierDto(s: {
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
  paymentTermsDays: number;
  currency: string;
  isActive: boolean;
  notes: string | null;
}) {
  return { ...s };
}

function toRequisitionDto(r: {
  id: string;
  requisitionNumber: string;
  status: string;
  requestedById: string;
  neededBy: Date | null;
  supplierId: string | null;
  notes: string | null;
  convertedOrderId: string | null;
  createdAt: Date;
  supplier?: { nameEn: string; nameAr: string } | null;
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: r.id,
    requisitionNumber: r.requisitionNumber,
    status: r.status,
    requestedById: r.requestedById,
    neededBy: r.neededBy?.toISOString() ?? null,
    supplierId: r.supplierId,
    supplierNameEn: r.supplier?.nameEn ?? null,
    supplierNameAr: r.supplier?.nameAr ?? null,
    notes: r.notes,
    convertedOrderId: r.convertedOrderId,
    createdAt: r.createdAt.toISOString(),
    lines: r.lines,
  };
}

function toPurchaseOrderDto(o: {
  id: string;
  orderNumber: string;
  supplierId: string;
  status: string;
  orderDate: Date;
  expectedDate: Date | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  notes: string | null;
  supplier: { nameEn: string; nameAr: string; code: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    supplierId: o.supplierId,
    supplierNameEn: o.supplier.nameEn,
    supplierNameAr: o.supplier.nameAr,
    status: o.status,
    orderDate: o.orderDate.toISOString(),
    expectedDate: o.expectedDate?.toISOString() ?? null,
    subtotalMinor: o.subtotalMinor,
    taxMinor: o.taxMinor,
    totalMinor: o.totalMinor,
    currency: o.currency,
    notes: o.notes,
    lines: o.lines,
  };
}

function toGoodsReceiptDto(r: {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  warehouseId: string;
  status: string;
  receivedAt: Date;
  notes: string | null;
  journalEntryId: string | null;
  supplier: { nameEn: string; nameAr: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: r.id,
    receiptNumber: r.receiptNumber,
    purchaseOrderId: r.purchaseOrderId,
    supplierId: r.supplierId,
    supplierNameEn: r.supplier.nameEn,
    supplierNameAr: r.supplier.nameAr,
    warehouseId: r.warehouseId,
    status: r.status,
    receivedAt: r.receivedAt.toISOString(),
    notes: r.notes,
    journalEntryId: r.journalEntryId,
    lines: r.lines,
  };
}

function toSupplierInvoiceDto(i: {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string | null;
  status: string;
  invoiceDate: Date;
  dueDate: Date | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  currency: string;
  notes: string | null;
  journalEntryId: string | null;
  supplier: { nameEn: string; nameAr: string; code: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    supplierInvoiceNumber: i.supplierInvoiceNumber,
    supplierId: i.supplierId,
    supplierNameEn: i.supplier.nameEn,
    supplierNameAr: i.supplier.nameAr,
    purchaseOrderId: i.purchaseOrderId,
    status: i.status,
    invoiceDate: i.invoiceDate.toISOString(),
    dueDate: i.dueDate?.toISOString() ?? null,
    subtotalMinor: i.subtotalMinor,
    taxMinor: i.taxMinor,
    totalMinor: i.totalMinor,
    amountPaidMinor: i.amountPaidMinor,
    outstandingMinor: i.totalMinor - i.amountPaidMinor,
    currency: i.currency,
    notes: i.notes,
    journalEntryId: i.journalEntryId,
    lines: i.lines,
  };
}

function toPurchaseReturnDto(r: {
  id: string;
  returnNumber: string;
  supplierId: string;
  purchaseOrderId: string | null;
  warehouseId: string;
  status: string;
  returnDate: Date;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason: string | null;
  currency: string;
  journalEntryId: string | null;
  supplier: { nameEn: string; nameAr: string };
  lines: Array<Record<string, unknown>>;
}) {
  return {
    id: r.id,
    returnNumber: r.returnNumber,
    supplierId: r.supplierId,
    supplierNameEn: r.supplier.nameEn,
    supplierNameAr: r.supplier.nameAr,
    purchaseOrderId: r.purchaseOrderId,
    warehouseId: r.warehouseId,
    status: r.status,
    returnDate: r.returnDate.toISOString(),
    subtotalMinor: r.subtotalMinor,
    taxMinor: r.taxMinor,
    totalMinor: r.totalMinor,
    reason: r.reason,
    currency: r.currency,
    journalEntryId: r.journalEntryId,
    lines: r.lines,
  };
}

export type { PurchaseLineDto };
