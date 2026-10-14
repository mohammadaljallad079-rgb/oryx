import { Injectable } from '@nestjs/common';
import { lineAmountMinor, sumMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { ErpContextService } from '../common/erp-context.service';
import { wholeAverageCost } from '../inventory/inventory.service';
import type { RequestPrincipal } from '../auth/auth.decorators';

export interface ReportQuery {
  companyId?: string;
  branchId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
  ) {}

  private range(query: ReportQuery) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return {
      ...(from || to ? { gte: from, lte: to } : {}),
    } as { gte?: Date; lte?: Date };
  }

  private dateFilter(query: ReportQuery) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (!from && !to) return undefined;
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  // ------------------------------------------------------------- accounting

  async accountingSummary(query: ReportQuery, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const dateFilter = this.dateFilter(query);
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        companyId,
        // Reversed entries stay in the ledger alongside their reversal.
        status: { not: 'DRAFT' },
        ...(dateFilter ? { entryDate: dateFilter } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { lines: true },
    });
    const bySource = new Map<string, { debit: number; credit: number; count: number }>();
    for (const e of entries) {
      const agg = bySource.get(e.sourceType) ?? { debit: 0, credit: 0, count: 0 };
      agg.debit += e.totalDebitMinor;
      agg.credit += e.totalCreditMinor;
      agg.count += 1;
      bySource.set(e.sourceType, agg);
    }
    const totalDebit = sumMinor(entries.map((e) => e.totalDebitMinor));
    const totalCredit = sumMinor(entries.map((e) => e.totalCreditMinor));
    return {
      from: query.from ?? null,
      to: query.to ?? null,
      journalCount: entries.length,
      totalDebitMinor: totalDebit,
      totalCreditMinor: totalCredit,
      balanced: totalDebit === totalCredit,
      bySourceType: [...bySource.entries()].map(([sourceType, v]) => ({
        sourceType,
        count: v.count,
        debitMinor: v.debit,
        creditMinor: v.credit,
      })),
    };
  }

  // ------------------------------------------------------------------ sales

  async salesSummary(query: ReportQuery, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const dateFilter = this.dateFilter(query);
    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        ...(dateFilter ? { invoiceDate: dateFilter } : {}),
        ...branchFilter,
      },
      include: { customer: { select: { nameEn: true, nameAr: true, code: true } } },
    });

    const byCustomer = new Map<string, { nameEn: string; nameAr: string; total: number; count: number; paid: number }>();
    for (const inv of invoices) {
      const agg = byCustomer.get(inv.customerId) ?? {
        nameEn: inv.customer.nameEn,
        nameAr: inv.customer.nameAr,
        total: 0,
        count: 0,
        paid: 0,
      };
      agg.total += inv.totalMinor;
      agg.paid += inv.amountPaidMinor;
      agg.count += 1;
      byCustomer.set(inv.customerId, agg);
    }

    const byBranch = await this.branchBreakdown(companyId, invoices);

    const posSales = await this.prisma.posSale.findMany({
      where: { companyId, status: 'COMPLETED', ...(dateFilter ? { createdAt: dateFilter } : {}), ...branchFilter },
    });

    const totalSales = sumMinor(invoices.map((i) => i.totalMinor));
    const totalTax = sumMinor(invoices.map((i) => i.taxMinor));
    const totalPaid = sumMinor(invoices.map((i) => i.amountPaidMinor));

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      invoiceCount: invoices.length,
      totalSalesMinor: totalSales,
      totalTaxMinor: totalTax,
      totalPaidMinor: totalPaid,
      totalOutstandingMinor: totalSales - totalPaid,
      posSaleCount: posSales.length,
      posTotalMinor: sumMinor(posSales.map((s) => s.totalMinor)),
      byCustomer: [...byCustomer.entries()]
        .map(([customerId, v]) => ({
          customerId,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          invoiceCount: v.count,
          totalMinor: v.total,
          paidMinor: v.paid,
          outstandingMinor: v.total - v.paid,
        }))
        .sort((a, b) => b.totalMinor - a.totalMinor),
      byBranch,
    };
  }

  // ------------------------------------------------------------- purchasing

  async purchasingSummary(query: ReportQuery, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const dateFilter = this.dateFilter(query);
    const branchFilter = query.branchId ? { branchId: query.branchId } : {};

    const orders = await this.prisma.purchaseOrder.findMany({
      where: { companyId, ...(dateFilter ? { orderDate: dateFilter } : {}), ...branchFilter },
      include: { supplier: { select: { nameEn: true, nameAr: true } } },
    });
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        ...(dateFilter ? { invoiceDate: dateFilter } : {}),
        ...branchFilter,
      },
      include: { supplier: { select: { nameEn: true, nameAr: true } } },
    });

    const bySupplier = new Map<string, { nameEn: string; nameAr: string; ordered: number; invoiced: number; paid: number }>();
    for (const o of orders) {
      const agg = bySupplier.get(o.supplierId) ?? {
        nameEn: o.supplier.nameEn,
        nameAr: o.supplier.nameAr,
        ordered: 0,
        invoiced: 0,
        paid: 0,
      };
      agg.ordered += o.totalMinor;
      bySupplier.set(o.supplierId, agg);
    }
    for (const inv of invoices) {
      const agg = bySupplier.get(inv.supplierId) ?? {
        nameEn: inv.supplier.nameEn,
        nameAr: inv.supplier.nameAr,
        ordered: 0,
        invoiced: 0,
        paid: 0,
      };
      agg.invoiced += inv.totalMinor;
      agg.paid += inv.amountPaidMinor;
      bySupplier.set(inv.supplierId, agg);
    }

    const totalInvoiced = sumMinor(invoices.map((i) => i.totalMinor));
    const totalPaid = sumMinor(invoices.map((i) => i.amountPaidMinor));

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      orderCount: orders.length,
      totalOrderedMinor: sumMinor(orders.map((o) => o.totalMinor)),
      invoiceCount: invoices.length,
      totalInvoicedMinor: totalInvoiced,
      totalPaidMinor: totalPaid,
      totalOutstandingMinor: totalInvoiced - totalPaid,
      bySupplier: [...bySupplier.entries()]
        .map(([supplierId, v]) => ({
          supplierId,
          nameEn: v.nameEn,
          nameAr: v.nameAr,
          orderedMinor: v.ordered,
          invoicedMinor: v.invoiced,
          paidMinor: v.paid,
          outstandingMinor: v.invoiced - v.paid,
        }))
        .sort((a, b) => b.invoicedMinor - a.invoicedMinor),
    };
  }

  // -------------------------------------------------------------- inventory

  async inventorySummary(query: ReportQuery, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const dateFilter = this.dateFilter(query);

    const levels = await this.prisma.stockLevel.findMany({
      where: { companyId },
      include: {
        product: { select: { sku: true, nameEn: true, nameAr: true, reorderLevel: true, type: true } },
        warehouse: { select: { code: true, nameEn: true, nameAr: true } },
      },
    });
    const rows = levels.map((l) => {
      const averageCostMinor = wholeAverageCost(l.averageCostMinor);
      return {
        warehouseId: l.warehouseId,
        warehouseCode: l.warehouse.code,
        productId: l.productId,
        sku: l.product.sku,
        nameEn: l.product.nameEn,
        nameAr: l.product.nameAr,
        quantity: l.quantity,
        averageCostMinor,
        valueMinor: lineAmountMinor(l.quantity, averageCostMinor),
      };
    });

    const movements = await this.prisma.stockMovement.findMany({
      where: { companyId, ...(dateFilter ? { occurredAt: dateFilter } : {}), ...(query.branchId ? { branchId: query.branchId } : {}) },
      include: { product: { select: { sku: true, nameEn: true, nameAr: true } } },
    });
    const byProduct = new Map<string, { sku: string; nameEn: string; nameAr: string; in: number; out: number }>();
    for (const m of movements) {
      const agg = byProduct.get(m.productId) ?? {
        sku: m.product.sku,
        nameEn: m.product.nameEn,
        nameAr: m.product.nameAr,
        in: 0,
        out: 0,
      };
      if (m.quantity > 0) agg.in += m.quantity;
      else agg.out += -m.quantity;
      byProduct.set(m.productId, agg);
    }

    const reorder = await this.prisma.product.findMany({
      where: { companyId, isActive: true, trackStock: true, reorderLevel: { gt: 0 } },
      include: { levels: true },
    });
    const reorderAlerts = reorder
      .map((p) => {
        const onHand = sumMinor(p.levels.map((l) => l.quantity));
        return { sku: p.sku, nameEn: p.nameEn, nameAr: p.nameAr, onHand, reorderLevel: p.reorderLevel };
      })
      .filter((a) => a.onHand <= a.reorderLevel);

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      totalValueMinor: sumMinor(rows.map((r) => r.valueMinor)),
      totalQuantity: sumMinor(rows.map((r) => r.quantity)),
      valuation: rows.sort((a, b) => b.valueMinor - a.valueMinor),
      movementTotals: [...byProduct.entries()].map(([productId, v]) => ({
        productId,
        sku: v.sku,
        nameEn: v.nameEn,
        nameAr: v.nameAr,
        quantityIn: v.in,
        quantityOut: v.out,
        netQuantity: v.in - v.out,
      })),
      reorderAlerts,
    };
  }

  private async branchBreakdown(
    companyId: string,
    invoices: Array<{ branchId: string | null; totalMinor: number; taxMinor: number }>,
  ) {
    const branches = await this.prisma.branch.findMany({ where: { companyId }, select: { id: true, nameEn: true, nameAr: true } });
    const byBranch = new Map<string, { nameEn: string; nameAr: string; total: number; tax: number; count: number }>();
    for (const inv of invoices) {
      const key = inv.branchId ?? '__none__';
      const branch = branches.find((b) => b.id === key);
      const agg = byBranch.get(key) ?? {
        nameEn: branch?.nameEn ?? 'Unassigned',
        nameAr: branch?.nameAr ?? 'غير محدد',
        total: 0,
        tax: 0,
        count: 0,
      };
      agg.total += inv.totalMinor;
      agg.tax += inv.taxMinor;
      agg.count += 1;
      byBranch.set(key, agg);
    }
    return [...byBranch.entries()].map(([branchId, v]) => ({
      branchId: branchId === '__none__' ? null : branchId,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      invoiceCount: v.count,
      totalMinor: v.total,
      taxMinor: v.tax,
    }));
  }
}
