import { Injectable } from '@nestjs/common';
import {
  lineAmountMinor,
  reportDefinition,
  sumMinor,
  type ReportColumn,
  type ReportDefinition,
  type ReportKind,
  type ReportResultDto,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, ERROR_CODES } from '../common/errors';
import { wholeAverageCost } from '../inventory/inventory.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type { ReportQuery } from './reports.service';

/**
 * Builds a rendered report from live data.
 *
 * Every report kind in the shared catalogue resolves to a real query here; a
 * kind with no builder throws a 400 rather than returning an empty table, so a
 * route that names a report the server cannot produce fails loudly instead of
 * printing a blank sheet.
 *
 * The detail cap bounds a report that would otherwise try to paginate the whole
 * ledger into one PDF. The row count is still reported, and the UI offers a CSV
 * export for the full set, so nothing is silently hidden.
 */

/** The most detail rows a single report will materialise. */
const DETAIL_CAP = 5000;

@Injectable()
export class ReportBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
  ) {}

  async build(
    kind: string,
    query: ReportQuery,
    principal: RequestPrincipal,
  ): Promise<{ companyId: string; result: ReportResultDto }> {
    const definition = reportDefinition(kind);
    if (!definition) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown report kind "${kind}".`);
    }
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const currency = await this.context.companyCurrency(companyId);

    const { rows, rowCount } = await this.rowsFor(definition, companyId, query);
    const capped = rows.slice(0, DETAIL_CAP);
    const totals: Record<string, number> = {};
    for (const column of definition.columns) {
      if (column.total) {
        totals[column.key] = sumMinor(capped.map((r) => Number(r[column.key] ?? 0)));
      }
    }

    return {
      companyId,
      result: {
        kind: definition.kind,
        titleEn: definition.titleEn,
        titleAr: definition.titleAr,
        from: query.from ?? null,
        to: query.to ?? null,
        generatedAt: new Date().toISOString(),
        currency,
        columns: [...definition.columns],
        rows: capped,
        totals,
        truncated: rowCount > capped.length,
        rowCount,
      },
    };
  }

  private dateRange(query: ReportQuery): { gte?: Date; lte?: Date } | undefined {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (!from && !to) return undefined;
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  private async rowsFor(
    definition: ReportDefinition,
    companyId: string,
    query: ReportQuery,
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    switch (definition.kind) {
      case 'sales-summary':
        return this.salesSummary(companyId, query);
      case 'sales-detail':
        return this.salesDetail(companyId, query);
      case 'sales-by-item':
        return this.salesByItem(companyId, query);
      case 'purchasing-summary':
        return this.purchasingSummary(companyId, query);
      case 'purchasing-detail':
        return this.purchasingDetail(companyId, query);
      case 'inventory-valuation':
        return this.inventoryValuation(companyId);
      case 'inventory-movement':
        return this.inventoryMovement(companyId, query);
      case 'inventory-reorder':
        return this.inventoryReorder(companyId);
      case 'accounting-summary':
        return this.accountingSummary(companyId, query);
      case 'trial-balance':
        return this.trialBalance(companyId, query);
      case 'general-ledger':
        return this.generalLedger(companyId, query);
      case 'receivables-aging':
        return this.receivablesAging(companyId);
      case 'payables-aging':
        return this.payablesAging(companyId);
      default:
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Report "${definition.kind}" has no builder.`);
    }
  }

  // ------------------------------------------------------------------ sales

  private async salesSummary(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        ...(dateRange ? { invoiceDate: dateRange } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { customer: { select: { nameEn: true, nameAr: true } } },
    });
    const byCustomer = new Map<
      string,
      { nameEn: string; nameAr: string; invoiceCount: number; totalMinor: number; paidMinor: number }
    >();
    for (const inv of invoices) {
      const agg =
        byCustomer.get(inv.customerId) ??
        { nameEn: inv.customer.nameEn, nameAr: inv.customer.nameAr, invoiceCount: 0, totalMinor: 0, paidMinor: 0 };
      agg.invoiceCount += 1;
      agg.totalMinor += inv.totalMinor;
      agg.paidMinor += inv.amountPaidMinor;
      byCustomer.set(inv.customerId, agg);
    }
    const rows = [...byCustomer.values()]
      .map((v) => ({ ...v, outstandingMinor: v.totalMinor - v.paidMinor }))
      .sort((a, b) => b.totalMinor - a.totalMinor);
    return { rows, rowCount: rows.length };
  }

  private async salesDetail(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        ...(dateRange ? { invoiceDate: dateRange } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { customer: { select: { nameEn: true } } },
      orderBy: { invoiceDate: 'desc' },
    });
    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      customerName: inv.customer.nameEn,
      salespersonName: inv.salespersonName ?? '—',
      subtotalMinor: inv.subtotalMinor,
      discountMinor: inv.discountMinor,
      taxMinor: inv.taxMinor,
      totalMinor: inv.totalMinor,
      amountPaidMinor: inv.amountPaidMinor,
      outstandingMinor: inv.totalMinor - inv.amountPaidMinor,
      status: inv.status,
    }));
    return { rows, rowCount: rows.length };
  }

  private async salesByItem(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const lines = await this.prisma.salesInvoiceLine.findMany({
      where: {
        invoice: {
          companyId,
          status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
          ...(dateRange ? { invoiceDate: dateRange } : {}),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
      },
      select: {
        description: true,
        quantity: true,
        discountMinor: true,
        taxMinor: true,
        lineTotalMinor: true,
      },
    });
    const byItem = new Map<
      string,
      { description: string; quantity: number; discountMinor: number; taxMinor: number; netMinor: number }
    >();
    for (const line of lines) {
      const agg = byItem.get(line.description) ?? {
        description: line.description,
        quantity: 0,
        discountMinor: 0,
        taxMinor: 0,
        netMinor: 0,
      };
      agg.quantity += line.quantity;
      agg.discountMinor += line.discountMinor;
      agg.taxMinor += line.taxMinor;
      agg.netMinor += line.lineTotalMinor;
      byItem.set(line.description, agg);
    }
    const rows = [...byItem.values()].sort((a, b) => b.netMinor - a.netMinor);
    return { rows, rowCount: rows.length };
  }

  // ------------------------------------------------------------- purchasing

  private async purchasingSummary(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { companyId, ...(dateRange ? { orderDate: dateRange } : {}), ...(query.branchId ? { branchId: query.branchId } : {}) },
      include: { supplier: { select: { nameEn: true, nameAr: true } } },
    });
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        ...(dateRange ? { invoiceDate: dateRange } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { supplier: { select: { nameEn: true, nameAr: true } } },
    });
    const bySupplier = new Map<
      string,
      { nameEn: string; nameAr: string; orderedMinor: number; invoicedMinor: number; paidMinor: number }
    >();
    for (const o of orders) {
      const agg = bySupplier.get(o.supplierId) ?? {
        nameEn: o.supplier.nameEn,
        nameAr: o.supplier.nameAr,
        orderedMinor: 0,
        invoicedMinor: 0,
        paidMinor: 0,
      };
      agg.orderedMinor += o.totalMinor;
      bySupplier.set(o.supplierId, agg);
    }
    for (const inv of invoices) {
      const agg = bySupplier.get(inv.supplierId) ?? {
        nameEn: inv.supplier.nameEn,
        nameAr: inv.supplier.nameAr,
        orderedMinor: 0,
        invoicedMinor: 0,
        paidMinor: 0,
      };
      agg.invoicedMinor += inv.totalMinor;
      agg.paidMinor += inv.amountPaidMinor;
      bySupplier.set(inv.supplierId, agg);
    }
    const rows = [...bySupplier.values()]
      .map((v) => ({ ...v, outstandingMinor: v.invoicedMinor - v.paidMinor }))
      .sort((a, b) => b.invoicedMinor - a.invoicedMinor);
    return { rows, rowCount: rows.length };
  }

  private async purchasingDetail(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        ...(dateRange ? { invoiceDate: dateRange } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { supplier: { select: { nameEn: true } } },
      orderBy: { invoiceDate: 'desc' },
    });
    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString(),
      supplierName: inv.supplier.nameEn,
      subtotalMinor: inv.subtotalMinor,
      taxMinor: inv.taxMinor,
      totalMinor: inv.totalMinor,
      amountPaidMinor: inv.amountPaidMinor,
      outstandingMinor: inv.totalMinor - inv.amountPaidMinor,
      status: inv.status,
    }));
    return { rows, rowCount: rows.length };
  }

  // -------------------------------------------------------------- inventory

  private async inventoryValuation(companyId: string) {
    const levels = await this.prisma.stockLevel.findMany({
      where: { companyId },
      include: {
        product: { select: { sku: true, nameEn: true, nameAr: true } },
        warehouse: { select: { code: true } },
      },
    });
    const rows = levels.map((l) => {
      const averageCostMinor = wholeAverageCost(l.averageCostMinor);
      return {
        sku: l.product.sku,
        nameEn: l.product.nameEn,
        warehouseCode: l.warehouse.code,
        quantity: l.quantity,
        averageCostMinor,
        valueMinor: lineAmountMinor(l.quantity, averageCostMinor),
      };
    });
    rows.sort((a, b) => b.valueMinor - a.valueMinor);
    return { rows, rowCount: rows.length };
  }

  private async inventoryMovement(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        companyId,
        ...(dateRange ? { occurredAt: dateRange } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { product: { select: { sku: true, nameEn: true, nameAr: true } } },
    });
    const byProduct = new Map<
      string,
      { sku: string; nameEn: string; nameAr: string; quantityIn: number; quantityOut: number }
    >();
    for (const m of movements) {
      const agg = byProduct.get(m.productId) ?? {
        sku: m.product.sku,
        nameEn: m.product.nameEn,
        nameAr: m.product.nameAr,
        quantityIn: 0,
        quantityOut: 0,
      };
      if (m.quantity > 0) agg.quantityIn += m.quantity;
      else agg.quantityOut += -m.quantity;
      byProduct.set(m.productId, agg);
    }
    const rows = [...byProduct.values()]
      .map((v) => ({ ...v, netQuantity: v.quantityIn - v.quantityOut }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
    return { rows, rowCount: rows.length };
  }

  private async inventoryReorder(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, isActive: true, trackStock: true, reorderLevel: { gt: 0 } },
      include: { levels: true },
    });
    const rows = products
      .map((p) => ({
        sku: p.sku,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        onHand: sumMinor(p.levels.map((l) => l.quantity)),
        reorderLevel: p.reorderLevel,
      }))
      .filter((a) => a.onHand <= a.reorderLevel)
      .sort((a, b) => a.onHand - b.onHand);
    return { rows, rowCount: rows.length };
  }

  // ------------------------------------------------------------- accounting

  private async accountingSummary(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        companyId,
        status: { not: 'DRAFT' },
        ...(dateRange ? { entryDate: dateRange } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: { sourceType: true, totalDebitMinor: true, totalCreditMinor: true },
    });
    const bySource = new Map<string, { sourceType: string; count: number; debitMinor: number; creditMinor: number }>();
    for (const e of entries) {
      const agg = bySource.get(e.sourceType) ?? { sourceType: e.sourceType, count: 0, debitMinor: 0, creditMinor: 0 };
      agg.count += 1;
      agg.debitMinor += e.totalDebitMinor;
      agg.creditMinor += e.totalCreditMinor;
      bySource.set(e.sourceType, agg);
    }
    const rows = [...bySource.values()].sort((a, b) => b.debitMinor - a.debitMinor);
    return { rows, rowCount: rows.length };
  }

  private async trialBalance(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const accounts = await this.prisma.account.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        companyId,
        entry: {
          status: { not: 'DRAFT' },
          ...(dateRange ? { entryDate: dateRange } : {}),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
      },
      _sum: { debitMinor: true, creditMinor: true },
    });
    const totals = new Map(grouped.map((g) => [g.accountId, g._sum]));
    const rows = accounts
      .map((a) => {
        const t = totals.get(a.id);
        const debitMinor = t?.debitMinor ?? 0;
        const creditMinor = t?.creditMinor ?? 0;
        const net = debitMinor - creditMinor;
        return {
          code: a.code,
          nameEn: a.nameEn,
          nameAr: a.nameAr,
          debitMinor,
          creditMinor,
          balanceMinor: a.normalBalance === 'DEBIT' ? net : -net,
        };
      })
      .filter((r) => r.debitMinor !== 0 || r.creditMinor !== 0);
    return { rows, rowCount: rows.length };
  }

  private async generalLedger(companyId: string, query: ReportQuery) {
    const dateRange = this.dateRange(query);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        companyId,
        entry: {
          status: { not: 'DRAFT' },
          ...(dateRange ? { entryDate: dateRange } : {}),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
      },
      include: {
        entry: { select: { entryNumber: true, entryDate: true } },
        account: { select: { code: true, nameEn: true, nameAr: true } },
      },
      orderBy: [{ entry: { entryDate: 'asc' } }, { entryId: 'asc' }, { lineNumber: 'asc' }],
    });
    const rows = lines.map((l) => ({
      entryNumber: l.entry.entryNumber,
      entryDate: l.entry.entryDate.toISOString(),
      accountCode: l.account.code,
      accountName: l.account.nameEn,
      description: l.description ?? '—',
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
    }));
    return { rows, rowCount: rows.length };
  }

  // ------------------------------------------------------------ AR / AP aging

  private async receivablesAging(companyId: string) {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
      include: { customer: { select: { nameEn: true } } },
    });
    const now = Date.now();
    const rows = invoices.map((inv) => {
      const daysOverdue = inv.dueDate ? Math.floor((now - inv.dueDate.getTime()) / 86_400_000) : 0;
      return {
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.customer.nameEn,
        invoiceDate: inv.invoiceDate.toISOString(),
        dueDate: inv.dueDate?.toISOString() ?? null,
        daysOverdue: Math.max(0, daysOverdue),
        outstandingMinor: inv.totalMinor - inv.amountPaidMinor,
        bucket: agingBucket(daysOverdue),
      };
    });
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return { rows, rowCount: rows.length };
  }

  private async payablesAging(companyId: string) {
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
      include: { supplier: { select: { nameEn: true } } },
    });
    const now = Date.now();
    const rows = invoices.map((inv) => {
      const daysOverdue = inv.dueDate ? Math.floor((now - inv.dueDate.getTime()) / 86_400_000) : 0;
      return {
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.supplier.nameEn,
        invoiceDate: inv.invoiceDate.toISOString(),
        dueDate: inv.dueDate?.toISOString() ?? null,
        daysOverdue: Math.max(0, daysOverdue),
        outstandingMinor: inv.totalMinor - inv.amountPaidMinor,
        bucket: agingBucket(daysOverdue),
      };
    });
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return { rows, rowCount: rows.length };
  }
}

/** The aging bucket an outstanding invoice falls into. */
export function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_PLUS';
}

/** Every column that carries a total, in print order. */
export function totalColumns(columns: readonly ReportColumn[]): ReportColumn[] {
  return columns.filter((c) => c.total);
}
