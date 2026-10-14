import { Injectable } from '@nestjs/common';
import { QUANTITY_SCALE, fromQuantity, lineAmountMinor, sumMinor } from '@oryx/shared';
import type { StockMovementSource, StockMovementType } from '@oryx/database';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService, SYSTEM_ROLES } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { Tx } from '../common/document-sequence.service';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  CreateAdjustmentDto,
  CreateProductDto,
  CreateTransferDto,
  CreateWarehouseDto,
  ListQueryDto,
  RecordMovementDto,
  UpdateProductDto,
  UpdateWarehouseDto,
} from './inventory.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface RecordMovementInput {
  companyId: string;
  branchId?: string | null;
  warehouseId: string;
  productId: string;
  movementType: StockMovementType;
  /** Signed quantity, scaled by 10^4. Positive increases on-hand stock. */
  quantity: number;
  /** Unit cost for an inbound movement (minor units). Ignored for outbound. */
  unitCostMinor?: number;
  source?: StockMovementSource;
  sourceId?: string | null;
  memo?: string | null;
  occurredAt: Date;
  actorUserId: string;
  /** When true, stock may fall below zero (explicit adjustments only). */
  allowNegative?: boolean;
}

export interface MovementResult {
  movementId: string;
  unitCostMinor: number;
  totalCostMinor: number;
  balanceAfter: number;
  averageCostMinor: number;
}

const QTY_FACTOR = 10 ** QUANTITY_SCALE;

interface LockedLevelRow {
  id: string;
  quantity: number;
  average_cost_minor: number;
}

/**
 * Stock ledger and valuation.
 *
 * Every on-hand change flows through `recordMovement`, which updates the
 * warehouse/product level and appends an immutable ledger row in the same
 * transaction. The level row is locked with `SELECT … FOR UPDATE` before it is
 * read, so two concurrent issues of the same SKU cannot both observe the same
 * on-hand figure and drive the balance negative.
 *
 * Valuation uses a **moving average**: an inbound movement blends its unit cost
 * into the average, and an outbound movement is valued at the current average.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
  ) {}

  /**
   * Read the level row under a row lock, creating it on first touch.
   *
   * A bare `upsert` is not sufficient under concurrency because the insert can
   * race; we create only when genuinely absent, then always re-read under the
   * lock so the caller works from a serialised value.
   */
  private async lockLevel(tx: Tx, companyId: string, warehouseId: string, productId: string) {
    let level = await tx.stockLevel.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    if (!level) {
      try {
        level = await tx.stockLevel.create({
          data: { companyId, warehouseId, productId, quantity: 0, averageCostMinor: 0 },
        });
      } catch {
        // A concurrent transaction created it first; fall through to the read.
        level = await tx.stockLevel.findUniqueOrThrow({
          where: { warehouseId_productId: { warehouseId, productId } },
        });
      }
    }
    const rows = await tx.$queryRawUnsafe<LockedLevelRow[]>(
      `SELECT id, quantity, "averageCostMinor" AS average_cost_minor FROM "StockLevel" WHERE id = $1 FOR UPDATE`,
      level.id,
    );
    const locked = rows[0];
    return { id: locked.id, quantity: locked.quantity, averageCostMinor: locked.average_cost_minor };
  }

  /** Record one signed stock movement and return its valuation effect. */
  async recordMovement(tx: Tx, input: RecordMovementInput): Promise<MovementResult> {
    if (!Number.isInteger(input.quantity) || input.quantity === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A stock movement needs a non-zero integer quantity.');
    }

    const product = await tx.product.findFirst({ where: { id: input.productId, companyId: input.companyId } });
    if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found in this company.');
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, companyId: input.companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found in this company.');

    const level = await this.lockLevel(tx, input.companyId, input.warehouseId, input.productId);
    const newQuantity = level.quantity + input.quantity;
    if (newQuantity < 0 && !input.allowNegative) {
      throw forbidden(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `Insufficient stock for ${product.sku}: on hand ${level.quantity / QTY_FACTOR}, requested ${-input.quantity / QTY_FACTOR}.`,
        { onHand: level.quantity, requested: input.quantity },
      );
    }

    let unitCostMinor: number;
    let averageCostMinor = level.averageCostMinor;

    if (input.quantity > 0) {
      // Inbound: blend the received cost into the moving average.
      unitCostMinor = input.unitCostMinor ?? level.averageCostMinor;
      const newValue = sumMinor([
        lineAmountMinor(level.quantity, level.averageCostMinor),
        lineAmountMinor(input.quantity, unitCostMinor),
      ]);
      averageCostMinor = newQuantity === 0 ? unitCostMinor : Math.round(newValue / newQuantity);
    } else {
      // Outbound: value at the current moving average.
      unitCostMinor = level.averageCostMinor;
    }

    const totalCostMinor =
      input.quantity > 0
        ? lineAmountMinor(input.quantity, unitCostMinor)
        : -lineAmountMinor(-input.quantity, unitCostMinor);

    await tx.stockLevel.update({
      where: { id: level.id },
      data: { quantity: newQuantity, averageCostMinor },
    });

    const movement = await tx.stockMovement.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId ?? null,
        warehouseId: input.warehouseId,
        productId: input.productId,
        movementType: input.movementType,
        quantity: input.quantity,
        unitCostMinor,
        totalCostMinor,
        balanceAfter: newQuantity,
        source: input.source ?? 'MANUAL',
        sourceId: input.sourceId ?? null,
        memo: input.memo ?? null,
        occurredAt: input.occurredAt,
        createdById: input.actorUserId,
      },
    });

    return {
      movementId: movement.id,
      unitCostMinor,
      totalCostMinor,
      balanceAfter: newQuantity,
      averageCostMinor,
    };
  }

  /** Current on-hand and average cost for a product in one warehouse. */
  async levelFor(companyId: string, warehouseId: string, productId: string) {
    return this.prisma.stockLevel.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
  }

  /** Total on-hand for a product across all warehouses, for reorder alerts. */
  async onHandForProduct(companyId: string, productId: string): Promise<number> {
    const levels = await this.prisma.stockLevel.findMany({ where: { companyId, productId } });
    return sumMinor(levels.map((l) => l.quantity));
  }

  // -------------------------------------------------------------- warehouses

  async listWarehouses(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
      include: { branch: { select: { nameEn: true, nameAr: true } } },
    });
    return { items: warehouses.map(toWarehouseDto), total: warehouses.length, page: 1, pageSize: warehouses.length };
  }

  async createWarehouse(dto: CreateWarehouseDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const dup = await this.prisma.warehouse.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Warehouse code ${dto.code} already exists.`);
    const warehouse = await this.prisma.warehouse.create({
      data: {
        companyId,
        branchId: dto.branchId ?? null,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        addressLine: dto.addressLine ?? null,
        inventoryAccountId: dto.inventoryAccountId ?? null,
      },
      include: { branch: { select: { nameEn: true, nameAr: true } } },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.warehouse_created',
      targetType: 'WAREHOUSE',
      targetId: warehouse.id,
      summary: `Created warehouse ${warehouse.code} ${warehouse.nameEn}`,
    });
    return toWarehouseDto(warehouse);
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found.');
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.addressLine !== undefined ? { addressLine: dto.addressLine } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { branch: { select: { nameEn: true, nameAr: true } } },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.warehouse_updated',
      targetType: 'WAREHOUSE',
      targetId: id,
      summary: `Updated warehouse ${updated.code}`,
    });
    return toWarehouseDto(updated);
  }

  // ---------------------------------------------------------------- products

  async listProducts(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 200, 500);
    const where = {
      companyId,
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { nameEn: { contains: query.search, mode: 'insensitive' as const } },
              { nameAr: { contains: query.search } },
              { barcode: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { sku: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toProductDto), total, page, pageSize };
  }

  async createProduct(dto: CreateProductDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.product.findUnique({ where: { companyId_sku: { companyId, sku: dto.sku } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `SKU ${dto.sku} already exists.`);
    const product = await this.prisma.product.create({
      data: {
        companyId,
        sku: dto.sku,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        type: dto.type ?? 'PRODUCT',
        unit: dto.unit ?? 'unit',
        barcode: dto.barcode ?? null,
        salesPriceMinor: dto.salesPriceMinor ?? 0,
        costPriceMinor: dto.costPriceMinor ?? 0,
        taxRateBp: dto.taxRateBp ?? 0,
        reorderLevel: dto.reorderLevel ?? 0,
        reorderQuantity: dto.reorderQuantity ?? 0,
        trackStock: dto.trackStock ?? true,
        salesAccountId: dto.salesAccountId ?? null,
        inventoryAccountId: dto.inventoryAccountId ?? null,
        cogsAccountId: dto.cogsAccountId ?? null,
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.product_created',
      targetType: 'PRODUCT',
      targetId: product.id,
      summary: `Created product ${product.sku} ${product.nameEn}`,
    });
    return toProductDto(product);
  }

  async updateProduct(id: string, dto: UpdateProductDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const product = await this.prisma.product.findFirst({ where: { id, companyId } });
    if (!product) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found.');
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.salesPriceMinor !== undefined ? { salesPriceMinor: dto.salesPriceMinor } : {}),
        ...(dto.costPriceMinor !== undefined ? { costPriceMinor: dto.costPriceMinor } : {}),
        ...(dto.taxRateBp !== undefined ? { taxRateBp: dto.taxRateBp } : {}),
        ...(dto.reorderLevel !== undefined ? { reorderLevel: dto.reorderLevel } : {}),
        ...(dto.reorderQuantity !== undefined ? { reorderQuantity: dto.reorderQuantity } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.product_updated',
      targetType: 'PRODUCT',
      targetId: id,
      summary: `Updated product ${updated.sku}`,
    });
    return toProductDto(updated);
  }

  // --------------------------------------------------------- stock movements

  async listMovements(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { sku: true, nameEn: true, nameAr: true } },
          warehouse: { select: { code: true, nameEn: true, nameAr: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items: rows.map(toMovementDto), total, page, pageSize };
  }

  /** Manual stock receipt or issue against a warehouse. */
  async recordManualMovement(dto: RecordMovementDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const result = await this.posting.withTransaction(async (tx) =>
      this.recordMovement(tx, {
        companyId,
        branchId: dto.branchId ?? null,
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        movementType: dto.direction === 'IN' ? 'RECEIPT' : 'ISSUE',
        quantity: dto.direction === 'IN' ? dto.quantity : -dto.quantity,
        unitCostMinor: dto.unitCostMinor,
        source: 'MANUAL',
        memo: dto.memo ?? null,
        occurredAt: new Date(dto.occurredAt),
        actorUserId: actor.userId,
      }),
    );
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.movement_recorded',
      targetType: 'STOCK_MOVEMENT',
      targetId: result.movementId,
      summary: `Recorded ${dto.direction === 'IN' ? 'receipt' : 'issue'} of ${fromQuantity(dto.quantity)} units`,
    });
    return result;
  }

  // ------------------------------------------------------------ transfers

  async listTransfers(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const transfers = await this.prisma.stockTransfer.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
      take: 200,
    });
    return { items: transfers.map(toTransferDto), total: transfers.length, page: 1, pageSize: transfers.length };
  }

  async createTransfer(dto: CreateTransferDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Source and destination warehouses must differ.');
    }
    await this.assertWarehouse(companyId, dto.fromWarehouseId);
    await this.assertWarehouse(companyId, dto.toWarehouseId);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    const transfer = await this.posting.withTransaction(async (tx) => {
      const transferNumber = await this.sequences.next(tx, companyId, 'stockTransfer');
      return tx.stockTransfer.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          transferNumber,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          status: 'DRAFT',
          notes: dto.notes ?? null,
          createdById: actor.userId,
          lines: { create: dto.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) },
        },
        include: { lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.transfer_created',
      targetType: 'STOCK_TRANSFER',
      targetId: transfer.id,
      summary: `Created transfer ${transfer.transferNumber}`,
    });
    return toTransferDto(transfer);
  }

  /** Post a transfer: issue from source, receive into destination, atomically. */
  async postTransfer(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const transfer = await tx.stockTransfer.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!transfer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Transfer not found.');
      if (transfer.status !== 'DRAFT') {
        throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'Only a draft transfer can be posted.');
      }
      for (const line of transfer.lines) {
        const out = await this.recordMovement(tx, {
          companyId,
          branchId: transfer.branchId,
          warehouseId: transfer.fromWarehouseId,
          productId: line.productId,
          movementType: 'TRANSFER_OUT',
          quantity: -line.quantity,
          source: 'TRANSFER',
          sourceId: transfer.id,
          occurredAt: new Date(),
          actorUserId: actor.userId,
        });
        await this.recordMovement(tx, {
          companyId,
          branchId: transfer.branchId,
          warehouseId: transfer.toWarehouseId,
          productId: line.productId,
          movementType: 'TRANSFER_IN',
          quantity: line.quantity,
          unitCostMinor: out.unitCostMinor,
          source: 'TRANSFER',
          sourceId: transfer.id,
          occurredAt: new Date(),
          actorUserId: actor.userId,
        });
      }
      return tx.stockTransfer.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date() }, include: { lines: true } });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.transfer_posted',
      targetType: 'STOCK_TRANSFER',
      targetId: id,
      summary: `Posted transfer ${result.transferNumber}`,
    });
    return toTransferDto(result);
  }

  // ----------------------------------------------------------- adjustments

  async listAdjustments(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const adjustments = await this.prisma.stockAdjustment.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
      take: 200,
    });
    return { items: adjustments.map(toAdjustmentDto), total: adjustments.length, page: 1, pageSize: adjustments.length };
  }

  async createAdjustment(dto: CreateAdjustmentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    await this.assertWarehouse(companyId, dto.warehouseId);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);
    const adjustment = await this.posting.withTransaction(async (tx) => {
      const adjustmentNumber = await this.sequences.next(tx, companyId, 'stockAdjustment');
      return tx.stockAdjustment.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          adjustmentNumber,
          warehouseId: dto.warehouseId,
          reason: dto.reason,
          status: 'DRAFT',
          createdById: actor.userId,
          lines: {
            create: dto.lines.map((l) => ({
              productId: l.productId,
              quantityDelta: l.quantityDelta,
              unitCostMinor: l.unitCostMinor ?? 0,
            })),
          },
        },
        include: { lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.adjustment_created',
      targetType: 'STOCK_ADJUSTMENT',
      targetId: adjustment.id,
      summary: `Created adjustment ${adjustment.adjustmentNumber}`,
    });
    return toAdjustmentDto(adjustment);
  }

  /** Post an adjustment: apply signed deltas and value the net difference. */
  async postAdjustment(id: string, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const result = await this.posting.withTransaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.findFirst({ where: { id, companyId }, include: { lines: true } });
      if (!adjustment) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Adjustment not found.');
      if (adjustment.status !== 'DRAFT') {
        throw badRequest(ERROR_CODES.DOCUMENT_ALREADY_POSTED, 'Only a draft adjustment can be posted.');
      }
      let netValue = 0;
      for (const line of adjustment.lines) {
        const move = await this.recordMovement(tx, {
          companyId,
          branchId: adjustment.branchId,
          warehouseId: adjustment.warehouseId,
          productId: line.productId,
          movementType: line.quantityDelta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantity: line.quantityDelta,
          unitCostMinor: line.unitCostMinor > 0 ? line.unitCostMinor : undefined,
          source: 'ADJUSTMENT',
          sourceId: adjustment.id,
          memo: adjustment.reason,
          occurredAt: new Date(),
          actorUserId: actor.userId,
          allowNegative: true,
        });
        netValue += move.totalCostMinor;
      }
      // Post the valuation difference against the adjustment expense account.
      if (netValue !== 0) {
        const adjustmentAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.STOCK_ADJUSTMENT);
        const inventoryAccount = await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.INVENTORY);
        await this.posting.postJournal(tx, {
          companyId,
          branchId: adjustment.branchId,
          entryDate: new Date(),
          memo: `Stock adjustment ${adjustment.adjustmentNumber}`,
          sourceType: 'STOCK_ADJUSTMENT',
          sourceId: adjustment.id,
          actorUserId: actor.userId,
          lines:
            netValue > 0
              ? [
                  { accountId: inventoryAccount, debit: netValue },
                  { accountId: adjustmentAccount, credit: netValue },
                ]
              : [
                  { accountId: adjustmentAccount, debit: -netValue },
                  { accountId: inventoryAccount, credit: -netValue },
                ],
        });
      }
      return tx.stockAdjustment.update({
        where: { id },
        data: { status: 'POSTED', postedAt: new Date() },
        include: { lines: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'inventory.adjustment_posted',
      targetType: 'STOCK_ADJUSTMENT',
      targetId: id,
      summary: `Posted adjustment ${result.adjustmentNumber}`,
    });
    return toAdjustmentDto(result);
  }

  // -------------------------------------------------------------- valuation

  async valuation(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const levels = await this.prisma.stockLevel.findMany({
      where: { companyId },
      include: {
        product: { select: { sku: true, nameEn: true, nameAr: true, reorderLevel: true } },
        warehouse: { select: { code: true, nameEn: true, nameAr: true } },
      },
    });
    const rows = levels.map((l) => ({
      warehouseId: l.warehouseId,
      warehouseCode: l.warehouse.code,
      productId: l.productId,
      sku: l.product.sku,
      nameEn: l.product.nameEn,
      nameAr: l.product.nameAr,
      quantity: l.quantity,
      averageCostMinor: l.averageCostMinor,
      valueMinor: lineAmountMinor(l.quantity, l.averageCostMinor),
      reorderLevel: l.product.reorderLevel,
    }));
    return {
      rows,
      totalValueMinor: sumMinor(rows.map((r) => r.valueMinor)),
      totalQuantity: sumMinor(rows.map((r) => r.quantity)),
    };
  }

  async reorderAlerts(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const products = await this.prisma.product.findMany({
      where: { companyId, isActive: true, trackStock: true, reorderLevel: { gt: 0 } },
      include: { levels: true },
    });
    const alerts = products
      .map((p) => {
        const onHand = sumMinor(p.levels.map((l) => l.quantity));
        return {
          productId: p.id,
          sku: p.sku,
          nameEn: p.nameEn,
          nameAr: p.nameAr,
          onHand,
          reorderLevel: p.reorderLevel,
          reorderQuantity: p.reorderQuantity,
          belowReorderLevel: onHand <= p.reorderLevel,
        };
      })
      .filter((a) => a.belowReorderLevel);
    return { items: alerts, total: alerts.length };
  }

  private async assertWarehouse(companyId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Warehouse not found in this company.');
  }
}

// ---------------------------------------------------------------- mappers

function toWarehouseDto(w: {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  branchId: string | null;
  addressLine: string | null;
  inventoryAccountId: string | null;
  isActive: boolean;
  branch?: { nameEn: string; nameAr: string } | null;
}) {
  return {
    id: w.id,
    code: w.code,
    nameEn: w.nameEn,
    nameAr: w.nameAr,
    branchId: w.branchId,
    branchNameEn: w.branch?.nameEn ?? null,
    branchNameAr: w.branch?.nameAr ?? null,
    addressLine: w.addressLine,
    inventoryAccountId: w.inventoryAccountId,
    isActive: w.isActive,
  };
}

function toProductDto(p: {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  type: string;
  unit: string;
  barcode: string | null;
  salesPriceMinor: number;
  costPriceMinor: number;
  taxRateBp: number;
  reorderLevel: number;
  reorderQuantity: number;
  trackStock: boolean;
  salesAccountId: string | null;
  inventoryAccountId: string | null;
  cogsAccountId: string | null;
  isActive: boolean;
}) {
  return {
    id: p.id,
    sku: p.sku,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    type: p.type,
    unit: p.unit,
    barcode: p.barcode,
    salesPriceMinor: p.salesPriceMinor,
    costPriceMinor: p.costPriceMinor,
    taxRateBp: p.taxRateBp,
    reorderLevel: p.reorderLevel,
    reorderQuantity: p.reorderQuantity,
    trackStock: p.trackStock,
    salesAccountId: p.salesAccountId,
    inventoryAccountId: p.inventoryAccountId,
    cogsAccountId: p.cogsAccountId,
    isActive: p.isActive,
  };
}

function toMovementDto(m: {
  id: string;
  movementType: string;
  quantity: number;
  unitCostMinor: number;
  totalCostMinor: number;
  balanceAfter: number;
  source: string;
  sourceId: string | null;
  memo: string | null;
  occurredAt: Date;
  product: { sku: string; nameEn: string; nameAr: string };
  warehouse: { code: string; nameEn: string; nameAr: string };
}) {
  return {
    id: m.id,
    movementType: m.movementType,
    quantity: m.quantity,
    quantityText: fromQuantity(m.quantity),
    unitCostMinor: m.unitCostMinor,
    totalCostMinor: m.totalCostMinor,
    balanceAfter: m.balanceAfter,
    source: m.source,
    sourceId: m.sourceId,
    memo: m.memo,
    occurredAt: m.occurredAt.toISOString(),
    sku: m.product.sku,
    productNameEn: m.product.nameEn,
    productNameAr: m.product.nameAr,
    warehouseCode: m.warehouse.code,
    warehouseNameEn: m.warehouse.nameEn,
    warehouseNameAr: m.warehouse.nameAr,
  };
}

function toTransferDto(t: {
  id: string;
  transferNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: string;
  notes: string | null;
  postedAt: Date | null;
  createdAt: Date;
  lines: Array<{ id: string; productId: string; quantity: number }>;
}) {
  return {
    id: t.id,
    transferNumber: t.transferNumber,
    fromWarehouseId: t.fromWarehouseId,
    toWarehouseId: t.toWarehouseId,
    status: t.status,
    notes: t.notes,
    postedAt: t.postedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    lines: t.lines.map((l) => ({ id: l.id, productId: l.productId, quantity: l.quantity, quantityText: fromQuantity(l.quantity) })),
  };
}

function toAdjustmentDto(a: {
  id: string;
  adjustmentNumber: string;
  warehouseId: string;
  reason: string;
  status: string;
  postedAt: Date | null;
  createdAt: Date;
  lines: Array<{ id: string; productId: string; quantityDelta: number; unitCostMinor: number }>;
}) {
  return {
    id: a.id,
    adjustmentNumber: a.adjustmentNumber,
    warehouseId: a.warehouseId,
    reason: a.reason,
    status: a.status,
    postedAt: a.postedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    lines: a.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      quantityDelta: l.quantityDelta,
      quantityDeltaText: fromQuantity(l.quantityDelta),
      unitCostMinor: l.unitCostMinor,
    })),
  };
}
