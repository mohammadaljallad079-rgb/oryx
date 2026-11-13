import { Injectable } from '@nestjs/common';
import {
  getModule,
  type ModuleSummaryActivity,
  type ModuleSummaryDto,
  type ModuleSummaryShortcut,
  type ModuleSummaryStat,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { ErpContextService } from '../common/erp-context.service';
import { EntitlementService } from '../common/entitlement.service';
import { badRequest, ERROR_CODES, notFound } from '../common/errors';
import type { RequestPrincipal } from '../auth/auth.decorators';

/** The audit prefixes and target types that identify a module's own activity. */
const MODULE_ACTIVITY: Record<string, { actions: string[]; targets: string[] }> = {
  financial_accounting: {
    actions: ['accounting.', 'journal.', 'payment.', 'fiscal.'],
    targets: ['JOURNAL_ENTRY', 'PAYMENT', 'ACCOUNT', 'FISCAL_YEAR', 'FISCAL_PERIOD'],
  },
  sales_pos: {
    actions: ['sales.', 'pos.'],
    targets: ['SALES_ORDER', 'SALES_INVOICE', 'QUOTATION', 'CREDIT_NOTE', 'POS_SALE', 'CASHIER_SESSION'],
  },
  purchasing_procurement: {
    actions: ['purchasing.'],
    targets: ['PURCHASE_ORDER', 'PURCHASE_REQUISITION', 'GOODS_RECEIPT', 'SUPPLIER_INVOICE', 'PURCHASE_RETURN'],
  },
  warehouses_inventory: {
    actions: ['inventory.', 'stock.'],
    targets: ['STOCK_MOVEMENT', 'STOCK_TRANSFER', 'STOCK_ADJUSTMENT', 'WAREHOUSE', 'PRODUCT'],
  },
  human_resources: {
    actions: ['hr.', 'payroll.', 'employee.'],
    targets: ['EMPLOYEE', 'LEAVE_REQUEST', 'PAYROLL_RUN', 'ATTENDANCE_RECORD', 'EMPLOYEE_ADVANCE'],
  },
  crm: {
    actions: ['crm.'],
    targets: ['LEAD', 'OPPORTUNITY', 'CONTACT', 'SUPPORT_TICKET', 'CRM_ACTIVITY'],
  },
  operations: {
    actions: ['operations.'],
    targets: ['PROJECT', 'PROJECT_TASK', 'WORK_ORDER', 'APPROVAL_REQUEST'],
  },
  payments: {
    actions: ['payments.', 'payment.'],
    targets: ['PAYMENT_INTENT', 'PAYMENT', 'REFUND', 'PAYMENT_RECONCILIATION'],
  },
  automotive_maintenance: {
    actions: ['maintenance.', 'automotive.'],
    targets: ['MAINTENANCE_BOOKING', 'JOB_CARD', 'REPAIR_ESTIMATE'],
  },
  automotive_inspections: {
    actions: ['inspection.', 'automotive.'],
    targets: ['INSPECTION_SESSION', 'INSPECTION_BOOKING', 'INSPECTION_REPORT'],
  },
  spare_parts: {
    actions: ['inventory.', 'spare_parts.', 'parts.'],
    targets: ['PRODUCT', 'PART_REFERENCE', 'PARTS_RESERVATION', 'STOCK_MOVEMENT'],
  },
};

interface StatCtx {
  companyId: string;
  branchId: string | null;
  currency: string;
}

/**
 * Per-module dashboards.
 *
 * Every figure is a real aggregate over the module's own tables, scoped to the
 * caller's company (and branch where the table carries one). No module reuses
 * another's numbers, and a module absent from this service returns no stats
 * rather than a generic set.
 */
@Injectable()
export class ModuleSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
    private readonly entitlements: EntitlementService,
  ) {}

  async build(
    moduleKey: string,
    principal: RequestPrincipal,
    query: { companyId?: string; branchId?: string } = {},
  ): Promise<ModuleSummaryDto> {
    const module = getModule(moduleKey);
    if (!module) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Unknown module.');

    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const licensed = await this.entitlements.licensedModulesFor(companyId);
    if (!licensed.includes(moduleKey) && moduleKey !== 'dashboard') {
      throw badRequest(
        ERROR_CODES.FORBIDDEN_PERMISSION,
        'This module is not licensed to the current company.',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { nameEn: true, nameAr: true, notes: true },
    });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');

    const currency = await this.context.companyCurrency(companyId);
    const branchId = query.branchId ?? principal.activeBranchId ?? null;
    const ctx: StatCtx = { companyId, branchId, currency };

    const [stats, activity] = await Promise.all([
      this.stats(moduleKey, ctx),
      this.activity(moduleKey, companyId),
    ]);

    return {
      moduleKey,
      nameEn: module.nameEn,
      nameAr: module.nameAr,
      descriptionEn: module.descriptionEn,
      descriptionAr: module.descriptionAr,
      group: module.group,
      icon: module.icon,
      tileImage: module.tileImage,
      route: module.route,
      scope: {
        companyId,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        branchId,
        currency,
      },
      isDemoData: (company.notes ?? '').includes('SEED_DEMO_DATA'),
      stats,
      shortcuts: this.shortcuts(moduleKey),
      activity,
    };
  }

  // --------------------------------------------------------------------- stats

  private async stats(moduleKey: string, ctx: StatCtx): Promise<ModuleSummaryStat[]> {
    switch (moduleKey) {
      case 'financial_accounting':
        return this.accountingStats(ctx);
      case 'sales_pos':
        return this.salesStats(ctx);
      case 'purchasing_procurement':
        return this.purchasingStats(ctx);
      case 'warehouses_inventory':
        return this.inventoryStats(ctx);
      case 'human_resources':
        return this.hrStats(ctx);
      case 'crm':
        return this.crmStats(ctx);
      case 'operations':
        return this.operationsStats(ctx);
      case 'payments':
        return this.paymentsStats(ctx);
      case 'automotive_maintenance':
        return this.maintenanceStats(ctx);
      case 'automotive_inspections':
        return this.inspectionStats(ctx);
      case 'spare_parts':
        return this.sparePartsStats(ctx);
      default:
        return [];
    }
  }

  private money(
    key: string,
    labelEn: string,
    labelAr: string,
    value: number,
    currency: string,
    icon: string,
    tone: ModuleSummaryStat['tone'] = 'gold',
  ): ModuleSummaryStat {
    return { key, labelEn, labelAr, value, format: 'money', currency, icon, tone };
  }

  private count(
    key: string,
    labelEn: string,
    labelAr: string,
    value: number,
    icon: string,
    tone: ModuleSummaryStat['tone'] = 'default',
  ): ModuleSummaryStat {
    return { key, labelEn, labelAr, value, format: 'count', icon, tone };
  }

  /** AR/AP from the control accounts' posted balances (debit − credit). */
  private async controlBalance(companyId: string, systemRole: string): Promise<number> {
    const agg = await this.prisma.accountBalance.aggregate({
      where: { companyId, account: { systemRole } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    return (agg._sum.debitMinor ?? 0) - (agg._sum.creditMinor ?? 0);
  }

  private async accountingStats(ctx: StatCtx) {
    const { companyId, currency } = ctx;
    const [accounts, drafts, posted, arDebit, apDebit, monthPosted] = await Promise.all([
      this.prisma.account.count({ where: { companyId, isActive: true } }),
      this.prisma.journalEntry.count({ where: { companyId, status: 'DRAFT' } }),
      this.prisma.journalEntry.count({ where: { companyId, status: 'POSTED' } }),
      this.controlBalance(companyId, 'AR_CONTROL'),
      this.controlBalance(companyId, 'AP_CONTROL'),
      this.prisma.journalEntry.count({ where: { companyId, status: 'POSTED', entryDate: { gte: startOfMonth() } } }),
    ]);
    return [
      this.count('accounts', 'Active accounts', 'الحسابات النشطة', accounts, 'layers'),
      this.money('receivable', 'Accounts receivable', 'الذمم المدينة', arDebit, currency, 'wallet', 'gold'),
      this.money('payable', 'Accounts payable', 'الذمم الدائنة', -apDebit, currency, 'wallet', 'danger'),
      this.count('drafts', 'Draft entries', 'قيود مسودة', drafts, 'edit', drafts > 0 ? 'gold' : 'default'),
      this.count('posted', 'Posted entries', 'قيود مرحّلة', posted, 'check'),
      this.count('monthPosted', 'Posted this month', 'مرحّل هذا الشهر', monthPosted, 'chart'),
    ];
  }

  private async salesStats(ctx: StatCtx) {
    const { companyId, currency, branchId } = ctx;
    const branch = branchId ? { branchId } : {};
    const [customers, quotations, orders, invoices, unpaid, monthSales, posSales] = await Promise.all([
      this.prisma.customer.count({ where: { companyId, isActive: true } }),
      this.prisma.quotation.count({ where: { companyId, ...branch, status: { in: ['DRAFT', 'SENT'] } } }),
      this.prisma.salesOrder.count({ where: { companyId, ...branch, status: { in: ['DRAFT', 'CONFIRMED'] } } }),
      this.prisma.salesInvoice.count({ where: { companyId, ...branch, status: { in: ['POSTED', 'PARTIALLY_PAID'] } } }),
      this.prisma.salesInvoice.aggregate({
        where: { companyId, ...branch, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
        _sum: { totalMinor: true, amountPaidMinor: true },
      }),
      this.prisma.salesInvoice.aggregate({
        where: { companyId, ...branch, invoiceDate: { gte: startOfMonth() }, status: { not: 'DRAFT' } },
        _sum: { totalMinor: true },
      }),
      this.prisma.posSale.count({ where: { companyId, ...branch, createdAt: { gte: startOfMonth() } } }),
    ]);
    const outstanding = (unpaid._sum.totalMinor ?? 0) - (unpaid._sum.amountPaidMinor ?? 0);
    return [
      this.money('monthSales', 'Sales this month', 'مبيعات الشهر', monthSales._sum.totalMinor ?? 0, currency, 'chart', 'gold'),
      this.money('outstanding', 'Outstanding balance', 'الرصيد المستحق', outstanding, currency, 'wallet', outstanding > 0 ? 'danger' : 'success'),
      this.count('customers', 'Active customers', 'العملاء النشطون', customers, 'users'),
      this.count('quotations', 'Open quotations', 'عروض مفتوحة', quotations, 'file'),
      this.count('orders', 'Open orders', 'أوامر مفتوحة', orders, 'cart'),
      this.count('invoices', 'Unsettled invoices', 'فواتير غير مسددة', invoices, 'scroll'),
      this.count('posSales', 'POS sales this month', 'مبيعات نقطة البيع', posSales, 'cash'),
    ];
  }

  private async purchasingStats(ctx: StatCtx) {
    const { companyId, currency, branchId } = ctx;
    const branch = branchId ? { branchId } : {};
    const [suppliers, requisitions, openOrders, receipts, unpaid, monthPurchases] = await Promise.all([
      this.prisma.supplier.count({ where: { companyId, isActive: true } }),
      this.prisma.purchaseRequisition.count({ where: { companyId, ...branch, status: { in: ['DRAFT', 'SUBMITTED'] } } }),
      this.prisma.purchaseOrder.count({ where: { companyId, ...branch, status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] } } }),
      this.prisma.goodsReceipt.count({ where: { companyId, ...branch, createdAt: { gte: startOfMonth() } } }),
      this.prisma.supplierInvoice.aggregate({
        where: { companyId, ...branch, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
        _sum: { totalMinor: true, amountPaidMinor: true },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { companyId, ...branch, orderDate: { gte: startOfMonth() }, status: { not: 'CANCELLED' } },
        _sum: { totalMinor: true },
      }),
    ]);
    const payable = (unpaid._sum.totalMinor ?? 0) - (unpaid._sum.amountPaidMinor ?? 0);
    return [
      this.money('monthPurchases', 'Purchases this month', 'مشتريات الشهر', monthPurchases._sum.totalMinor ?? 0, currency, 'truck', 'gold'),
      this.money('payable', 'Payable to suppliers', 'المستحق للموردين', payable, currency, 'wallet', payable > 0 ? 'danger' : 'success'),
      this.count('suppliers', 'Active suppliers', 'الموردون النشطون', suppliers, 'truck'),
      this.count('requisitions', 'Open requisitions', 'طلبات شراء مفتوحة', requisitions, 'file'),
      this.count('orders', 'Open purchase orders', 'أوامر شراء مفتوحة', openOrders, 'cart'),
      this.count('receipts', 'Goods receipts this month', 'استلامات هذا الشهر', receipts, 'package'),
    ];
  }

  private async inventoryStats(ctx: StatCtx) {
    const { companyId } = ctx;
    const [warehouses, products, tracked, levels, lowStock, movements, adjustments] = await Promise.all([
      this.prisma.warehouse.count({ where: { companyId, isActive: true } }),
      this.prisma.product.count({ where: { companyId, isActive: true } }),
      this.prisma.product.count({ where: { companyId, isActive: true, trackStock: true } }),
      this.prisma.stockLevel.aggregate({ where: { companyId }, _sum: { quantity: true } }),
      this.lowStockCount(companyId),
      this.prisma.stockMovement.count({ where: { companyId, createdAt: { gte: startOfMonth() } } }),
      this.prisma.stockAdjustment.count({ where: { companyId, createdAt: { gte: startOfMonth() } } }),
    ]);
    const totalUnits = Math.round((levels._sum.quantity ?? 0) / 10000);
    return [
      this.count('warehouses', 'Active warehouses', 'المستودعات النشطة', warehouses, 'warehouse'),
      this.count('products', 'Active items', 'الأصناف النشطة', products, 'package'),
      this.count('tracked', 'Stock-tracked items', 'أصناف متتبعة', tracked, 'tag'),
      this.count('totalUnits', 'Units on hand', 'الوحدات المتوفرة', totalUnits, 'boxes'),
      this.count('lowStock', 'Low-stock alerts', 'تنبيهات المخزون', lowStock, 'alert', 'danger'),
      this.count('movements', 'Movements this month', 'حركات هذا الشهر', movements, 'activity'),
      this.count('adjustments', 'Adjustments this month', 'تسويات هذا الشهر', adjustments, 'sliders'),
    ];
  }

  private async lowStockCount(companyId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "StockLevel" sl
      JOIN "Product" p ON p.id = sl."productId"
      WHERE sl."companyId" = ${companyId} AND p."trackStock" = true
        AND p."reorderLevel" > 0 AND sl.quantity <= p."reorderLevel"`;
    return Number(rows[0]?.count ?? 0);
  }

  /** Distinct products carrying at least one part reference (optionally active). */
  private async distinctPartProducts(companyId: string, activeOnly: boolean): Promise<number> {
    const groups = await this.prisma.partReference.groupBy({
      by: ['productId'],
      where: { companyId, ...(activeOnly ? { isActive: true } : {}) },
    });
    return groups.length;
  }

  private async hrStats(ctx: StatCtx) {
    const { companyId, currency } = ctx;
    const [total, active, onLeave, pendingLeave, departments, attendanceToday, latestRun, pendingRuns, advances] = await Promise.all([
      this.prisma.employee.count({ where: { companyId } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { companyId, status: 'ON_LEAVE' } }),
      this.prisma.leaveRequest.count({ where: { companyId, status: 'SUBMITTED' } }),
      this.prisma.department.count({ where: { companyId } }),
      this.prisma.attendanceRecord.count({ where: { companyId, workDate: today() } }),
      this.prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { netMinor: true } }),
      this.prisma.payrollRun.count({ where: { companyId, status: { in: ['DRAFT', 'APPROVED'] } } }),
      this.prisma.employeeAdvance.count({ where: { companyId, status: { in: ['OPEN', 'PARTIALLY_SETTLED'] } } }),
    ]);
    return [
      this.count('employees', 'Employees', 'الموظفون', total, 'users'),
      this.count('active', 'Active', 'نشط', active, 'check', 'success'),
      this.count('onLeave', 'On leave', 'في إجازة', onLeave, 'calendar'),
      this.count('pendingLeave', 'Pending leave', 'إجازات معلّقة', pendingLeave, 'clock', pendingLeave > 0 ? 'gold' : 'default'),
      this.count('departments', 'Departments', 'الأقسام', departments, 'grid'),
      this.count('attendanceToday', 'Attendance today', 'حضور اليوم', attendanceToday, 'clock'),
      this.money('payrollDue', 'Latest payroll net', 'صافي آخر رواتب', latestRun?.netMinor ?? 0, currency, 'wallet', 'gold'),
      this.count('pendingRuns', 'Pending payroll runs', 'دورات رواتب معلّقة', pendingRuns, 'play'),
      this.count('advances', 'Open advances', 'سلف مفتوحة', advances, 'creditCard'),
    ];
  }

  private async crmStats(ctx: StatCtx) {
    const { companyId, currency } = ctx;
    const [leads, openLeads, opportunities, pipeline, won, tickets, openTickets, contacts] = await Promise.all([
      this.prisma.lead.count({ where: { companyId } }),
      this.prisma.lead.count({ where: { companyId, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } } }),
      this.prisma.opportunity.count({ where: { companyId, status: 'OPEN' } }),
      this.prisma.opportunity.aggregate({ where: { companyId, status: 'OPEN' }, _sum: { amountMinor: true } }),
      this.prisma.opportunity.aggregate({ where: { companyId, status: 'WON' }, _sum: { amountMinor: true } }),
      this.prisma.supportTicket.count({ where: { companyId } }),
      this.prisma.supportTicket.count({ where: { companyId, status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
      this.prisma.customerContact.count({ where: { companyId } }),
    ]);
    return [
      this.count('leads', 'Leads', 'العملاء المحتملون', leads, 'target'),
      this.count('openLeads', 'Open leads', 'عملاء محتملون مفتوحون', openLeads, 'clock'),
      this.count('opportunities', 'Open opportunities', 'فرص مفتوحة', opportunities, 'trend'),
      this.money('pipeline', 'Open pipeline value', 'قيمة المسار المفتوح', pipeline._sum.amountMinor ?? 0, currency, 'chart', 'gold'),
      this.money('won', 'Won value', 'قيمة المكتسب', won._sum.amountMinor ?? 0, currency, 'check', 'success'),
      this.count('tickets', 'Support tickets', 'تذاكر الدعم', tickets, 'message'),
      this.count('openTickets', 'Open tickets', 'تذاكر مفتوحة', openTickets, 'alert', openTickets > 0 ? 'gold' : 'default'),
      this.count('contacts', 'Contacts', 'جهات الاتصال', contacts, 'users'),
    ];
  }

  private async operationsStats(ctx: StatCtx) {
    const { companyId } = ctx;
    const [projects, activeProjects, tasks, openTasks, overdueTasks, workOrders, openWorkOrders, approvals] = await Promise.all([
      this.prisma.project.count({ where: { companyId } }),
      this.prisma.project.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.projectTask.count({ where: { companyId } }),
      this.prisma.projectTask.count({ where: { companyId, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
      this.prisma.projectTask.count({ where: { companyId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } } }),
      this.prisma.workOrder.count({ where: { companyId } }),
      this.prisma.workOrder.count({ where: { companyId, status: { in: ['DRAFT', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] } } }),
      this.prisma.approvalRequest.count({ where: { companyId, status: 'PENDING' } }),
    ]);
    return [
      this.count('projects', 'Projects', 'المشاريع', projects, 'folder'),
      this.count('activeProjects', 'Active projects', 'مشاريع نشطة', activeProjects, 'play', 'success'),
      this.count('tasks', 'Tasks', 'المهام', tasks, 'checkSquare'),
      this.count('openTasks', 'Open tasks', 'مهام مفتوحة', openTasks, 'clock'),
      this.count('overdueTasks', 'Overdue tasks', 'مهام متأخرة', overdueTasks, 'alert', overdueTasks > 0 ? 'danger' : 'default'),
      this.count('workOrders', 'Work orders', 'أوامر العمل', workOrders, 'wrench'),
      this.count('openWorkOrders', 'Open work orders', 'أوامر عمل مفتوحة', openWorkOrders, 'activity', openWorkOrders > 0 ? 'gold' : 'default'),
      this.count('approvals', 'Pending approvals', 'اعتمادات معلّقة', approvals, 'check', approvals > 0 ? 'gold' : 'default'),
    ];
  }

  private async paymentsStats(ctx: StatCtx) {
    const { companyId, currency, branchId } = ctx;
    const branch = branchId ? { branchId } : {};
    const [received, paid, intentsPending, refunds, awaitingMethod, reconPending] = await Promise.all([
      this.prisma.payment.aggregate({ where: { companyId, ...branch, direction: 'RECEIPT', paidAt: { gte: startOfMonth() } }, _sum: { amountMinor: true } }),
      this.prisma.payment.aggregate({ where: { companyId, ...branch, direction: 'PAYMENT', paidAt: { gte: startOfMonth() } }, _sum: { amountMinor: true } }),
      this.prisma.paymentIntent.count({ where: { companyId, status: { in: ['REQUIRES_METHOD', 'REQUIRES_ACTION', 'PROCESSING'] } } }),
      this.prisma.refund.aggregate({ where: { companyId, createdAt: { gte: startOfMonth() } }, _sum: { amountMinor: true } }),
      this.prisma.paymentIntent.count({ where: { companyId, status: 'REQUIRES_METHOD' } }),
      this.prisma.paymentReconciliation.count({ where: { companyId, matched: false } }),
    ]);
    return [
      this.money('received', 'Receipts this month', 'مقبوضات هذا الشهر', received._sum.amountMinor ?? 0, currency, 'cash', 'success'),
      this.money('paid', 'Payments this month', 'مدفوعات هذا الشهر', paid._sum.amountMinor ?? 0, currency, 'creditCard'),
      this.count('pending', 'Pending intents', 'نوايا معلّقة', intentsPending, 'clock', intentsPending > 0 ? 'gold' : 'default'),
      this.money('refunds', 'Refunds this month', 'استردادات هذا الشهر', refunds._sum.amountMinor ?? 0, currency, 'refresh', 'danger'),
      this.count('awaitingMethod', 'Awaiting payment method', 'بانتظار طريقة الدفع', awaitingMethod, 'alert'),
      this.count('recon', 'Open reconciliations', 'مطابقات مفتوحة', reconPending, 'check'),
    ];
  }

  private async maintenanceStats(ctx: StatCtx) {
    const { companyId, branchId } = ctx;
    const branch = branchId ? { branchId } : {};
    const [bookings, openBookings, jobCards, openJobCards, awaitingApproval, completedMonth, invoicedMonth, vehicles] = await Promise.all([
      this.prisma.maintenanceBooking.count({ where: { companyId, ...branch } }),
      this.prisma.maintenanceBooking.count({ where: { companyId, ...branch, status: { in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.jobCard.count({ where: { companyId, ...branch } }),
      this.prisma.jobCard.count({ where: { companyId, ...branch, status: { in: ['DRAFT', 'OPEN', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'] } } }),
      this.prisma.jobCard.count({ where: { companyId, ...branch, status: 'AWAITING_APPROVAL' } }),
      this.prisma.jobCard.count({ where: { companyId, ...branch, status: 'COMPLETED', updatedAt: { gte: startOfMonth() } } }),
      this.prisma.jobCard.count({ where: { companyId, ...branch, status: 'INVOICED', updatedAt: { gte: startOfMonth() } } }),
      this.prisma.vehicle.count({ where: { companyId } }),
    ]);
    return [
      this.count('bookings', 'Maintenance bookings', 'حجوزات الصيانة', bookings, 'calendar'),
      this.count('openBookings', 'Open bookings', 'حجوزات مفتوحة', openBookings, 'clock', openBookings > 0 ? 'gold' : 'default'),
      this.count('jobCards', 'Job cards', 'بطاقات العمل', jobCards, 'wrench'),
      this.count('openJobCards', 'Open job cards', 'بطاقات مفتوحة', openJobCards, 'activity'),
      this.count('awaitingApproval', 'Awaiting approval', 'بانتظار الاعتماد', awaitingApproval, 'alert', awaitingApproval > 0 ? 'danger' : 'default'),
      this.count('completed', 'Completed this month', 'مكتملة هذا الشهر', completedMonth, 'check', 'success'),
      this.count('invoiced', 'Invoiced this month', 'مفوترة هذا الشهر', invoicedMonth, 'scroll'),
      this.count('vehicles', 'Registered vehicles', 'المركبات المسجلة', vehicles, 'car'),
    ];
  }

  private async inspectionStats(ctx: StatCtx) {
    const { companyId } = ctx;
    const [sessions, openSessions, bookings, completedMonth, reports, failed] = await Promise.all([
      this.prisma.inspectionSession.count({ where: { companyId } }),
      this.prisma.inspectionSession.count({ where: { companyId, status: { in: ['DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW'] } } }),
      this.prisma.inspectionBooking.count({ where: { companyId } }),
      this.prisma.inspectionSession.count({ where: { companyId, status: 'APPROVED', updatedAt: { gte: startOfMonth() } } }),
      this.prisma.inspectionReport.count({ where: { companyId } }),
      this.prisma.inspectionItemResult.count({ where: { companyId, result: 'FAIL' } }),
    ]);
    return [
      this.count('sessions', 'Inspections', 'الفحوصات', sessions, 'clipboardCheck'),
      this.count('openSessions', 'Open inspections', 'فحوصات مفتوحة', openSessions, 'clock', openSessions > 0 ? 'gold' : 'default'),
      this.count('bookings', 'Inspection bookings', 'حجوزات الفحص', bookings, 'calendar'),
      this.count('completed', 'Completed this month', 'مكتملة هذا الشهر', completedMonth, 'check', 'success'),
      this.count('reports', 'Reports issued', 'تقارير صادرة', reports, 'file'),
      this.count('failed', 'Failed checks', 'فحوصات راسبة', failed, 'alert', failed > 0 ? 'danger' : 'default'),
    ];
  }

  private async sparePartsStats(ctx: StatCtx) {
    const { companyId } = ctx;
    const [parts, activeParts, reservations, openReservations, lowStock, units] = await Promise.all([
      this.distinctPartProducts(companyId, false),
      this.distinctPartProducts(companyId, true),
      this.prisma.partsReservation.count({ where: { companyId } }),
      this.prisma.partsReservation.count({ where: { companyId, status: { in: ['RESERVED', 'PARTIALLY_ISSUED'] } } }),
      this.lowStockCount(companyId),
      this.prisma.stockLevel.aggregate({
        where: { companyId, product: { partReferences: { some: {} } } },
        _sum: { quantity: true },
      }),
    ]);
    return [
      this.count('parts', 'Spare parts', 'قطع الغيار', parts, 'package'),
      this.count('activeParts', 'Active parts', 'قطع نشطة', activeParts, 'check', 'success'),
      this.count('reservations', 'Reservations', 'حجوزات القطع', reservations, 'clipboardCheck'),
      this.count('openReservations', 'Open reservations', 'حجوزات مفتوحة', openReservations, 'clock', openReservations > 0 ? 'gold' : 'default'),
      this.count('lowStock', 'Low-stock parts', 'قطع منخفضة', lowStock, 'alert', 'danger'),
      this.count('units', 'Units on hand', 'وحدات متوفرة', Math.round((units._sum.quantity ?? 0) / 10000), 'boxes'),
    ];
  }

  // ---------------------------------------------------------------- shortcuts

  private shortcuts(moduleKey: string): ModuleSummaryShortcut[] {
    const S = (
      labelEn: string,
      labelAr: string,
      route: string,
      icon: string,
      permission: string,
    ): ModuleSummaryShortcut => ({ labelEn, labelAr, route, icon, permission });
    switch (moduleKey) {
      case 'financial_accounting':
        return [
          S('New journal entry', 'قيد يومية جديد', '/accounting?tab=journals', 'edit', 'erp.accounting.journal.post'),
          S('Record receipt', 'تسجيل مقبوض', '/accounting?tab=receipts', 'cash', 'erp.accounting.payment.manage'),
          S('Trial balance', 'ميزان المراجعة', '/accounting?tab=statements', 'scale', 'erp.accounting.statement.read'),
          S('Chart of accounts', 'دليل الحسابات', '/accounting?tab=accounts', 'layers', 'erp.accounting.read'),
        ];
      case 'sales_pos':
        return [
          S('New sales order', 'أمر بيع جديد', '/sales?tab=orders', 'cart', 'erp.sales.order.manage'),
          S('Issue invoice', 'إصدار فاتورة', '/sales?tab=invoices', 'scroll', 'erp.sales.invoice.manage'),
          S('Open POS', 'نقطة البيع', '/sales?tab=pos', 'cash', 'erp.sales.pos.operate'),
          S('Customers', 'العملاء', '/sales?tab=customers', 'users', 'erp.sales.read'),
        ];
      case 'purchasing_procurement':
        return [
          S('New requisition', 'طلب شراء جديد', '/purchasing?tab=requisitions', 'file', 'erp.purchasing.requisition.manage'),
          S('Purchase order', 'أمر شراء', '/purchasing?tab=orders', 'cart', 'erp.purchasing.order.manage'),
          S('Goods receipt', 'استلام بضاعة', '/purchasing?tab=receipts', 'package', 'erp.purchasing.receipt.manage'),
          S('Suppliers', 'الموردون', '/purchasing?tab=suppliers', 'truck', 'erp.purchasing.read'),
        ];
      case 'warehouses_inventory':
        return [
          S('Stock movement', 'حركة مخزون', '/inventory?tab=movements', 'activity', 'erp.inventory.movement.manage'),
          S('New transfer', 'تحويل جديد', '/inventory?tab=transfers', 'refresh', 'erp.inventory.transfer.manage'),
          S('Adjust stock', 'تسوية مخزون', '/inventory?tab=adjustments', 'sliders', 'erp.inventory.adjustment.manage'),
          S('Items', 'الأصناف', '/inventory?tab=products', 'package', 'erp.inventory.read'),
        ];
      case 'human_resources':
        return [
          S('Employees', 'الموظفون', '/hr?tab=employees', 'users', 'erp.hr.read'),
          S('Leave requests', 'طلبات الإجازة', '/hr?tab=leave', 'calendar', 'erp.hr.leave.request'),
          S('Run payroll', 'تشغيل الرواتب', '/hr?tab=payroll', 'wallet', 'erp.hr.payroll.run'),
          S('Attendance', 'الحضور', '/hr?tab=attendance', 'clock', 'erp.hr.attendance.manage'),
        ];
      case 'crm':
        return [
          S('Leads', 'العملاء المحتملون', '/crm?tab=leads', 'target', 'erp.crm.lead.manage'),
          S('Opportunities', 'الفرص', '/crm?tab=opportunities', 'trend', 'erp.crm.opportunity.manage'),
          S('Support tickets', 'تذاكر الدعم', '/crm?tab=tickets', 'message', 'erp.crm.ticket.manage'),
          S('Activities', 'الأنشطة', '/crm?tab=activities', 'activity', 'erp.crm.activity.manage'),
        ];
      case 'operations':
        return [
          S('Projects', 'المشاريع', '/operations?tab=projects', 'folder', 'erp.operations.project.manage'),
          S('Tasks', 'المهام', '/operations?tab=tasks', 'checkSquare', 'erp.operations.task.manage'),
          S('Work orders', 'أوامر العمل', '/operations?tab=work-orders', 'wrench', 'erp.operations.work_order.manage'),
          S('Approvals', 'الاعتمادات', '/operations?tab=approvals', 'check', 'erp.operations.approval.manage'),
        ];
      case 'payments':
        return [
          S('Payment intents', 'نوايا الدفع', '/payments?tab=intents', 'creditCard', 'erp.payments.read'),
          S('Reconciliation', 'المطابقة', '/payments?tab=reconciliation', 'check', 'erp.payments.manage'),
        ];
      case 'automotive_maintenance':
        return [
          S('New maintenance order', 'أمر صيانة جديد', '/automotive/maintenance?tab=orders', 'wrench', 'erp.maintenance.write'),
          S('Bookings', 'الحجوزات', '/automotive/maintenance?tab=bookings', 'calendar', 'erp.maintenance.read'),
          S('Job cards', 'بطاقات العمل', '/automotive/maintenance?tab=job-cards', 'clipboardCheck', 'erp.maintenance.read'),
        ];
      case 'automotive_inspections':
        return [
          S('New inspection', 'فحص جديد', '/automotive/inspections?tab=sessions', 'clipboardCheck', 'erp.inspection.write'),
          S('Bookings', 'الحجوزات', '/automotive/inspections?tab=bookings', 'calendar', 'erp.inspection.read'),
          S('Reports', 'التقارير', '/automotive/inspections?tab=reports', 'file', 'erp.inspection.read'),
        ];
      case 'spare_parts':
        return [
          S('Parts catalogue', 'كتالوج القطع', '/automotive/spare-parts?tab=catalog', 'package', 'erp.spare_parts.read'),
          S('Reservations', 'الحجوزات', '/automotive/spare-parts?tab=reservations', 'clipboardCheck', 'erp.spare_parts.read'),
        ];
      default:
        return [];
    }
  }

  // ----------------------------------------------------------------- activity

  private async activity(moduleKey: string, companyId: string): Promise<ModuleSummaryActivity[]> {
    const spec = MODULE_ACTIVITY[moduleKey];
    if (!spec) return [];
    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId,
        OR: [
          ...spec.actions.map((a) => ({ action: { startsWith: a } })),
          { targetType: { in: spec.targets } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { actor: { select: { email: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      action: a.action,
      actorEmail: a.actor?.email ?? null,
      targetType: a.targetType,
      targetId: a.targetId,
      createdAt: a.createdAt.toISOString(),
    }));
  }
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
