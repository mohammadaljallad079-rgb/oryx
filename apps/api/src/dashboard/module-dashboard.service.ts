import { Injectable } from '@nestjs/common';
import {
  MODULES,
  SETTING_NAMESPACES,
  getModule,
  resolveEffectivePermissions,
  type ModuleActivityDto,
  type ModuleDashboardResponse,
  type ModuleKpiDto,
  type ModuleShortcutDto,
  type ModuleStatDto,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { EntitlementService } from '../common/entitlement.service';
import { ErpContextService } from '../common/erp-context.service';
import { forbidden, ERROR_CODES, notFound } from '../common/errors';
import type { RequestPrincipal } from '../auth/auth.decorators';

/** What a single module dashboard computes from its own tables. */
interface ModuleBundle {
  stats: ModuleStatDto[];
  kpis: ModuleKpiDto[];
  shortcuts: ModuleShortcutDto[];
  activity: ModuleActivityDto[];
  series: Array<{ label: string; value: number }>;
  seriesTitleEn: string;
  seriesTitleAr: string;
}

const money = (key: string, labelEn: string, labelAr: string, value: number, currency = 'SAR'): ModuleStatDto => ({
  key,
  labelEn,
  labelAr,
  value,
  format: 'money',
  currency,
});
const count = (key: string, labelEn: string, labelAr: string, value: number): ModuleStatDto => ({
  key,
  labelEn,
  labelAr,
  value,
  format: 'count',
});
const kpi = (key: string, labelEn: string, labelAr: string, value: string, icon: string, hint?: string): ModuleKpiDto => ({
  key,
  labelEn,
  labelAr,
  value,
  icon,
  hint: hint ?? null,
});
const shortcut = (key: string, labelEn: string, labelAr: string, route: string, icon: string, permission?: string): ModuleShortcutDto => ({
  key,
  labelEn,
  labelAr,
  route,
  icon,
  permission: permission ?? null,
});

function lastTwelveMonths(): Array<{ key: string; label: string; start: Date; end: Date }> {
  const out: Array<{ key: string; label: string; start: Date; end: Date }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    out.push({ key: `${start.getUTCFullYear()}-${start.getUTCMonth() + 1}`, label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`, start, end });
  }
  return out;
}

/**
 * Per-module dashboards.
 *
 * Every figure is a live aggregate over the module's own tables, scoped to the
 * caller's company (and branch where the module is branch-aware). The payload
 * shape is uniform so one admin component renders any module, but the content
 * is module-specific: no module repeats another's numbers.
 */
@Injectable()
export class ModuleDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
    private readonly entitlements: EntitlementService,
  ) {}

  async build(moduleKey: string, principal: RequestPrincipal, query: { companyId?: string; branchId?: string }): Promise<ModuleDashboardResponse> {
    const definition = getModule(moduleKey);
    if (!definition) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, `Unknown module ${moduleKey}.`);

    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal, query.companyId);
    const branchId = query.branchId ?? principal.activeBranchId ?? null;
    if (branchId && branchIds.length > 0 && !branchIds.includes(branchId)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_BRANCH, 'Requested branch is outside your scope.');
    }

    // A module the company is not licensed for is not rendered, even if the
    // caller holds the read permission.
    const licensed = await this.entitlements.licensedModulesFor(companyId);
    if (!licensed.includes(moduleKey)) {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, `The ${definition.nameEn} module is not licensed for this company.`);
    }

    const bundle = await this.compute(moduleKey, companyId, branchId);

    // Shortcuts the caller cannot act on are dropped; the API never advertises
    // an action the permission check would reject.
    const granted = new Set(resolveEffectivePermissions(principal).permissions);
    const shortcuts = bundle.shortcuts.filter((s) => !s.permission || granted.has(s.permission));

    return {
      moduleKey,
      nameEn: definition.nameEn,
      nameAr: definition.nameAr,
      descriptionEn: definition.descriptionEn,
      descriptionAr: definition.descriptionAr,
      tileImage: definition.tileImage,
      stats: bundle.stats,
      kpis: bundle.kpis,
      shortcuts,
      recentActivity: bundle.activity,
      series: bundle.series,
      seriesTitleEn: bundle.seriesTitleEn,
      seriesTitleAr: bundle.seriesTitleAr,
      generatedAt: new Date().toISOString(),
    };
  }

  private async compute(moduleKey: string, companyId: string, branchId: string | null): Promise<ModuleBundle> {
    switch (moduleKey) {
      case 'dashboard':
        return this.coreDashboard(companyId);
      case 'company_management':
        return this.companyManagement(companyId);
      case 'branch_management':
        return this.branchManagement(companyId);
      case 'financial_accounting':
        return this.accounting(companyId, branchId);
      case 'sales_pos':
        return this.sales(companyId, branchId);
      case 'purchasing_procurement':
        return this.purchasing(companyId, branchId);
      case 'warehouses_inventory':
        return this.inventory(companyId, branchId);
      case 'human_resources':
        return this.hr(companyId, branchId);
      case 'crm':
        return this.crm(companyId, branchId);
      case 'operations':
        return this.operations(companyId, branchId);
      case 'automotive_inspections':
        return this.inspections(companyId, branchId);
      case 'automotive_maintenance':
        return this.maintenance(companyId, branchId);
      case 'spare_parts':
        return this.spareParts(companyId);
      case 'customer_portal':
        return this.customerPortal(companyId);
      case 'booking_engine':
        return this.booking(companyId, branchId);
      case 'provider_portal':
        return this.providerPortal(companyId);
      case 'payments':
        return this.payments(companyId, branchId);
      case 'reports_analytics':
        return this.reports(companyId, branchId);
      case 'users_permissions':
        return this.users(companyId);
      case 'subscription_management':
        return this.subscription(companyId);
      case 'settings':
        return this.settingsCenter(companyId);
      default:
        return this.empty(moduleKey);
    }
  }

  /** Recent audit activity for a company, optionally filtered by action prefix. */
  private async activity(companyId: string, prefixes: string[], take = 8): Promise<ModuleActivityDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { companyId, ...(prefixes.length ? { OR: prefixes.map((p) => ({ action: { startsWith: p } })) } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.summary,
      subtitle: r.action,
      at: r.createdAt.toISOString(),
      tone: 'neutral' as const,
    }));
  }

  private async monthlySeries(
    table: 'salesInvoice' | 'purchaseOrder' | 'journalEntry' | 'jobCard' | 'employee' | 'paymentIntent',
    companyId: string,
    dateField: string,
    branchId: string | null,
  ): Promise<Array<{ label: string; value: number }>> {
    const months = lastTwelveMonths();
    const delegate = this.prisma[table] as unknown as {
      count: (args: unknown) => Promise<number>;
    };
    return Promise.all(
      months.map(async (m) => {
        const value = await delegate.count({
          where: {
            companyId,
            ...(branchId ? { branchId } : {}),
            [dateField]: { gte: m.start, lt: m.end },
          },
        });
        return { label: m.label, value };
      }),
    );
  }

  private empty(moduleKey: string): ModuleBundle {
    return {
      stats: [],
      kpis: [],
      shortcuts: [],
      activity: [],
      series: [],
      seriesTitleEn: moduleKey,
      seriesTitleAr: moduleKey,
    };
  }

  // ------------------------------------------------------------------ core

  private async coreDashboard(companyId: string): Promise<ModuleBundle> {
    const [companies, branches, users, activeSubscriptions, openTickets] = await Promise.all([
      this.prisma.company.count({ where: { id: companyId } }),
      this.prisma.branch.count({ where: { companyId, isActive: true } }),
      this.prisma.membership.count({ where: { companyId, isActive: true } }),
      this.prisma.subscription.count({ where: { companyId, status: { in: ['ACTIVE', 'TRIAL'] } } }),
      this.prisma.supportTicket.count({ where: { companyId, status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
    ]);
    return {
      stats: [
        count('branches', 'Active branches', 'الفروع النشطة', branches),
        count('users', 'Active users', 'المستخدمون النشطون', users),
        count('subscriptions', 'Active subscriptions', 'الاشتراكات النشطة', activeSubscriptions),
        count('open_tickets', 'Open tickets', 'التذاكر المفتوحة', openTickets),
      ],
      kpis: [
        kpi('companies', 'Companies', 'الشركات', String(companies), 'building'),
        kpi('branches', 'Branches', 'الفروع', String(branches), 'map-pin'),
        kpi('users', 'Users', 'المستخدمون', String(users), 'users'),
        kpi('tickets', 'Open tickets', 'التذاكر المفتوحة', String(openTickets), 'life-buoy'),
      ],
      shortcuts: [
        shortcut('companies', 'Companies', 'الشركات', '/companies', 'building', 'erp.company.manage'),
        shortcut('branches', 'Branches', 'الفروع', '/branches', 'map-pin', 'erp.branch.manage'),
        shortcut('users', 'Users', 'المستخدمون', '/users', 'users', 'company.user.read'),
      ],
      activity: await this.activity(companyId, []),
      series: [],
      seriesTitleEn: 'Monthly activity',
      seriesTitleAr: 'النشاط الشهري',
    };
  }

  private async companyManagement(companyId: string): Promise<ModuleBundle> {
    const [branches, activeBranches, members] = await Promise.all([
      this.prisma.branch.count({ where: { companyId } }),
      this.prisma.branch.count({ where: { companyId, isActive: true } }),
      this.prisma.membership.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('branches', 'Branches', 'الفروع', branches),
        count('active_branches', 'Active branches', 'الفروع النشطة', activeBranches),
        count('members', 'Members', 'الأعضاء', members),
      ],
      kpis: [kpi('branches', 'Branches', 'الفروع', String(branches), 'map-pin')],
      shortcuts: [shortcut('new_branch', 'Add branch', 'إضافة فرع', '/branches', 'map-pin', 'erp.branch.manage')],
      activity: await this.activity(companyId, ['branch.', 'company.']),
      series: [],
      seriesTitleEn: 'Branch footprint',
      seriesTitleAr: 'انتشار الفروع',
    };
  }

  private async branchManagement(companyId: string): Promise<ModuleBundle> {
    const branches = await this.prisma.branch.findMany({ where: { companyId }, select: { isActive: true } });
    const active = branches.filter((b) => b.isActive).length;
    return {
      stats: [count('branches', 'Branches', 'الفروع', branches.length), count('active', 'Active', 'النشطة', active)],
      kpis: [kpi('active', 'Active branches', 'الفروع النشطة', String(active), 'map-pin')],
      shortcuts: [shortcut('branches', 'Manage branches', 'إدارة الفروع', '/branches', 'map-pin', 'erp.branch.manage')],
      activity: await this.activity(companyId, ['branch.']),
      series: [],
      seriesTitleEn: 'Branches',
      seriesTitleAr: 'الفروع',
    };
  }

  // --------------------------------------------------------------- finance

  private async accounting(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [accounts, postable, entries, drafts, receivables, payables, posted] = await Promise.all([
      this.prisma.account.count({ where: { companyId, isActive: true } }),
      this.prisma.account.count({ where: { companyId, isPostable: true } }),
      this.prisma.journalEntry.count({ where: { companyId } }),
      this.prisma.journalEntry.count({ where: { companyId, status: 'DRAFT' } }),
      this.prisma.salesInvoice.aggregate({
        where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
        _sum: { totalMinor: true, amountPaidMinor: true },
      }),
      this.prisma.supplierInvoice.aggregate({
        where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
        _sum: { totalMinor: true, amountPaidMinor: true },
      }),
      this.prisma.journalEntry.aggregate({ where: { companyId, status: { not: 'DRAFT' } }, _sum: { totalDebitMinor: true, totalCreditMinor: true } }),
    ]);
    const receivableOutstanding = (receivables._sum.totalMinor ?? 0) - (receivables._sum.amountPaidMinor ?? 0);
    const payableOutstanding = (payables._sum.totalMinor ?? 0) - (payables._sum.amountPaidMinor ?? 0);
    return {
      stats: [
        count('accounts', 'Accounts', 'الحسابات', accounts),
        count('journal_entries', 'Journal entries', 'القيود', entries),
        money('receivables', 'Accounts receivable', 'الذمم المدينة', receivableOutstanding),
        money('payables', 'Accounts payable', 'الذمم الدائنة', payableOutstanding),
        money('ledger_debit', 'Ledger debits', 'إجمالي المدين', posted._sum.totalDebitMinor ?? 0),
      ],
      kpis: [
        kpi('accounts', 'Chart of accounts', 'دليل الحسابات', String(accounts), 'calculator'),
        kpi('postable', 'Postable accounts', 'حسابات قابلة للترحيل', String(postable), 'book-open'),
        kpi('drafts', 'Draft journals', 'قيود مسودة', String(drafts), 'file-text'),
      ],
      shortcuts: [
        shortcut('journal', 'Post journal', 'ترحيل قيد', '/accounting', 'calculator', 'erp.accounting.write'),
        shortcut('statements', 'Statements', 'القوائم المالية', '/accounting', 'bar-chart', 'erp.accounting.read'),
      ],
      activity: await this.activity(companyId, ['accounting.', 'sales.invoice', 'purchasing.supplier_invoice']),
      series: await this.monthlySeries('journalEntry', companyId, 'entryDate', branchId),
      seriesTitleEn: 'Journal entries (12 months)',
      seriesTitleAr: 'القيود (12 شهرًا)',
    };
  }

  private async payments(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [intents, succeeded, failed, refunds, transactions] = await Promise.all([
      this.prisma.paymentIntent.count({ where: { companyId } }),
      this.prisma.paymentIntent.aggregate({ where: { companyId, status: 'SUCCEEDED' }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.paymentIntent.count({ where: { companyId, status: 'FAILED' } }),
      this.prisma.refund.aggregate({ where: { companyId, status: 'PROCESSED' }, _sum: { amountMinor: true } }),
      this.prisma.paymentTransaction.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('intents', 'Payment intents', 'نوايا الدفع', intents),
        money('collected', 'Collected', 'المحصّل', succeeded._sum.amountMinor ?? 0),
        money('refunded', 'Refunded', 'المُسترجع', refunds._sum.amountMinor ?? 0),
        count('failed', 'Failed intents', 'النوايا الفاشلة', failed),
        count('transactions', 'Transactions', 'الحركات', transactions),
      ],
      kpis: [
        kpi('succeeded', 'Succeeded', 'الناجحة', String(succeeded._count), 'credit-card'),
        kpi('failed', 'Failed', 'الفاشلة', String(failed), 'alert-triangle'),
      ],
      shortcuts: [shortcut('payments', 'Payments', 'المدفوعات', '/payments', 'credit-card', 'erp.payments.read')],
      activity: await this.activity(companyId, ['payment.', 'booking.']),
      series: await this.monthlySeries('paymentIntent', companyId, 'createdAt', branchId),
      seriesTitleEn: 'Payment intents (12 months)',
      seriesTitleAr: 'نوايا الدفع (12 شهرًا)',
    };
  }

  // -------------------------------------------------------------- commerce

  private async sales(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [invoices, revenue, customers, quotations, orders, posSales, unpaid] = await Promise.all([
      this.prisma.salesInvoice.count({ where: { companyId, status: { not: 'DRAFT' } } }),
      this.prisma.salesInvoice.aggregate({ where: { companyId, status: { not: 'DRAFT' } }, _sum: { totalMinor: true, taxMinor: true } }),
      this.prisma.customer.count({ where: { companyId, isActive: true } }),
      this.prisma.quotation.count({ where: { companyId } }),
      this.prisma.salesOrder.count({ where: { companyId } }),
      this.prisma.posSale.count({ where: { companyId } }),
      this.prisma.salesInvoice.count({ where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } } }),
    ]);
    return {
      stats: [
        count('invoices', 'Invoices', 'الفواتير', invoices),
        money('revenue', 'Invoiced revenue', 'الإيراد المفوتر', revenue._sum.totalMinor ?? 0),
        money('tax', 'VAT invoiced', 'ضريبة القيمة المضافة', revenue._sum.taxMinor ?? 0),
        count('customers', 'Customers', 'العملاء', customers),
        count('unpaid', 'Unpaid invoices', 'فواتير غير مسددة', unpaid),
      ],
      kpis: [
        kpi('quotations', 'Quotations', 'عروض الأسعار', String(quotations), 'file-text'),
        kpi('orders', 'Orders', 'الأوامر', String(orders), 'shopping-cart'),
        kpi('pos', 'POS sales', 'مبيعات نقاط البيع', String(posSales), 'shopping-cart'),
      ],
      shortcuts: [
        shortcut('new_invoice', 'New invoice', 'فاتورة جديدة', '/sales', 'shopping-cart', 'erp.sales.write'),
        shortcut('new_customer', 'New customer', 'عميل جديد', '/customers', 'heart-handshake', 'erp.sales.customer.manage'),
      ],
      activity: await this.activity(companyId, ['sales.', 'crm.customer']),
      series: await this.monthlySeries('salesInvoice', companyId, 'invoiceDate', branchId),
      seriesTitleEn: 'Invoices issued (12 months)',
      seriesTitleAr: 'الفواتير الصادرة (12 شهرًا)',
    };
  }

  private async purchasing(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [suppliers, orders, openOrders, invoices, payable, requisitions] = await Promise.all([
      this.prisma.supplier.count({ where: { companyId, isActive: true } }),
      this.prisma.purchaseOrder.count({ where: { companyId } }),
      this.prisma.purchaseOrder.count({ where: { companyId, status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] } } }),
      this.prisma.supplierInvoice.aggregate({ where: { companyId, status: { not: 'DRAFT' } }, _sum: { totalMinor: true } }),
      this.prisma.supplierInvoice.aggregate({ where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } }, _sum: { totalMinor: true, amountPaidMinor: true } }),
      this.prisma.purchaseRequisition.count({ where: { companyId } }),
    ]);
    const outstanding = (payable._sum.totalMinor ?? 0) - (payable._sum.amountPaidMinor ?? 0);
    return {
      stats: [
        count('suppliers', 'Suppliers', 'الموردون', suppliers),
        count('orders', 'Purchase orders', 'أوامر الشراء', orders),
        count('open_orders', 'Open orders', 'الأوامر المفتوحة', openOrders),
        money('invoiced', 'Supplier invoices', 'فواتير الموردين', invoices._sum.totalMinor ?? 0),
        money('payable', 'Payable outstanding', 'المستحق للموردين', outstanding),
      ],
      kpis: [
        kpi('requisitions', 'Requisitions', 'طلبات الشراء', String(requisitions), 'file-text'),
        kpi('open', 'Open POs', 'أوامر مفتوحة', String(openOrders), 'truck'),
      ],
      shortcuts: [
        shortcut('new_po', 'New purchase order', 'أمر شراء جديد', '/purchasing', 'truck', 'erp.purchasing.write'),
        shortcut('new_supplier', 'New supplier', 'مورد جديد', '/purchasing', 'truck', 'erp.purchasing.write'),
      ],
      activity: await this.activity(companyId, ['purchasing.']),
      series: await this.monthlySeries('purchaseOrder', companyId, 'orderDate', branchId),
      seriesTitleEn: 'Purchase orders (12 months)',
      seriesTitleAr: 'أوامر الشراء (12 شهرًا)',
    };
  }

  // ------------------------------------------------------------ operations

  private async inventory(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [warehouses, products, levels, movements, lowStock] = await Promise.all([
      this.prisma.warehouse.count({ where: { companyId, isActive: true } }),
      this.prisma.product.count({ where: { companyId, isActive: true } }),
      this.prisma.stockLevel.aggregate({ where: { companyId }, _sum: { quantity: true } }),
      this.prisma.stockMovement.count({ where: { companyId } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "StockLevel" sl
        JOIN "Product" p ON p.id = sl."productId"
        WHERE sl."companyId" = ${companyId} AND sl.quantity <= p."reorderLevel"`,
    ]);
    return {
      stats: [
        count('warehouses', 'Warehouses', 'المستودعات', warehouses),
        count('products', 'Products', 'المنتجات', products),
        count('units', 'Units on hand', 'الوحدات المتوفرة', Number(levels._sum.quantity ?? 0)),
        count('movements', 'Stock movements', 'حركات المخزون', movements),
        count('low_stock', 'Items below reorder', 'أصناف تحت حد الطلب', Number(lowStock[0]?.count ?? 0)),
      ],
      kpis: [
        kpi('products', 'Active products', 'المنتجات النشطة', String(products), 'package'),
        kpi('warehouses', 'Warehouses', 'المستودعات', String(warehouses), 'warehouse'),
      ],
      shortcuts: [
        shortcut('inventory', 'Inventory', 'المخزون', '/inventory', 'warehouse', 'erp.inventory.write'),
        shortcut('transfer', 'Transfer stock', 'تحويل مخزون', '/inventory', 'warehouse', 'erp.inventory.write'),
      ],
      activity: await this.activity(companyId, ['inventory.', 'warehouse.']),
      series: [],
      seriesTitleEn: 'Stock movements',
      seriesTitleAr: 'حركات المخزون',
    };
  }

  private async hr(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [employees, active, departments, pendingLeave, payrollRuns, payrollNet, contracts] = await Promise.all([
      this.prisma.employee.count({ where: { companyId } }),
      this.prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.department.count({ where: { companyId } }),
      this.prisma.leaveRequest.count({ where: { companyId, status: 'SUBMITTED' } }),
      this.prisma.payrollRun.count({ where: { companyId } }),
      this.prisma.payrollRun.aggregate({ where: { companyId, status: { in: ['POSTED', 'LOCKED'] } }, _sum: { netMinor: true } }),
      this.prisma.employmentContract.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('employees', 'Employees', 'الموظفون', employees),
        count('active', 'Active employees', 'الموظفون النشطون', active),
        count('departments', 'Departments', 'الأقسام', departments),
        count('pending_leave', 'Pending leave requests', 'طلبات إجازة معلقة', pendingLeave),
        money('payroll_net', 'Payroll net (posted)', 'صافي الرواتب المُرحّلة', payrollNet._sum.netMinor ?? 0),
      ],
      kpis: [
        kpi('contracts', 'Contracts', 'العقود', String(contracts), 'file-text'),
        kpi('runs', 'Payroll runs', 'مسيّرات الرواتب', String(payrollRuns), 'users'),
      ],
      shortcuts: [
        shortcut('new_employee', 'New employee', 'موظف جديد', '/hr', 'users', 'erp.hr.write'),
        shortcut('payroll', 'Payroll', 'الرواتب', '/hr', 'calculator', 'erp.hr.write'),
      ],
      activity: await this.activity(companyId, ['hr.', 'payroll.']),
      series: await this.monthlySeries('employee', companyId, 'hireDate', branchId),
      seriesTitleEn: 'New employees (12 months)',
      seriesTitleAr: 'الموظفون الجدد (12 شهرًا)',
    };
  }

  private async crm(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [leads, openLeads, opportunities, openOpps, pipelineValue, tickets, openTickets, contacts] = await Promise.all([
      this.prisma.lead.count({ where: { companyId } }),
      this.prisma.lead.count({ where: { companyId, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } } }),
      this.prisma.opportunity.count({ where: { companyId } }),
      this.prisma.opportunity.count({ where: { companyId, status: 'OPEN' } }),
      this.prisma.opportunity.aggregate({ where: { companyId, status: 'OPEN' }, _sum: { amountMinor: true } }),
      this.prisma.supportTicket.count({ where: { companyId } }),
      this.prisma.supportTicket.count({ where: { companyId, status: { in: ['NEW', 'OPEN', 'PENDING'] } } }),
      this.prisma.customerContact.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('leads', 'Leads', 'العملاء المحتملون', leads),
        count('open_leads', 'Open leads', 'عملاء محتملون نشطون', openLeads),
        count('opportunities', 'Opportunities', 'الفرص', opportunities),
        money('pipeline', 'Open pipeline', 'قيمة الفرص المفتوحة', pipelineValue._sum.amountMinor ?? 0),
        count('open_tickets', 'Open tickets', 'التذاكر المفتوحة', openTickets),
      ],
      kpis: [
        kpi('open_opps', 'Open opportunities', 'الفرص المفتوحة', String(openOpps), 'heart-handshake'),
        kpi('contacts', 'Contacts', 'جهات الاتصال', String(contacts), 'users'),
        kpi('tickets', 'Tickets', 'التذاكر', String(tickets), 'life-buoy'),
      ],
      shortcuts: [
        shortcut('new_lead', 'New lead', 'عميل محتمل جديد', '/crm', 'heart-handshake', 'erp.crm.write'),
        shortcut('tickets', 'Support tickets', 'تذاكر الدعم', '/crm', 'life-buoy', 'erp.crm.read'),
      ],
      activity: await this.activity(companyId, ['crm.']),
      series: [],
      seriesTitleEn: 'Pipeline',
      seriesTitleAr: 'مسار الفرص',
    };
  }

  private async operations(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [projects, activeProjects, workOrders, openWorkOrders, tasks, approvals, completed] = await Promise.all([
      this.prisma.project.count({ where: { companyId } }),
      this.prisma.project.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.workOrder.count({ where: { companyId } }),
      this.prisma.workOrder.count({ where: { companyId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] } } }),
      this.prisma.projectTask.count({ where: { companyId } }),
      this.prisma.approvalRequest.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.workOrder.count({ where: { companyId, status: 'COMPLETED' } }),
    ]);
    return {
      stats: [
        count('projects', 'Projects', 'المشاريع', projects),
        count('active_projects', 'Active projects', 'المشاريع النشطة', activeProjects),
        count('work_orders', 'Work orders', 'أوامر العمل', workOrders),
        count('open_work_orders', 'Open work orders', 'أوامر عمل مفتوحة', openWorkOrders),
        count('pending_approvals', 'Pending approvals', 'موافقات معلقة', approvals),
      ],
      kpis: [
        kpi('tasks', 'Tasks', 'المهام', String(tasks), 'check-square'),
        kpi('completed', 'Completed', 'المكتملة', String(completed), 'check'),
      ],
      shortcuts: [
        shortcut('new_project', 'New project', 'مشروع جديد', '/operations', 'settings', 'erp.operations.write'),
        shortcut('new_work_order', 'New work order', 'أمر عمل جديد', '/operations', 'settings', 'erp.operations.write'),
      ],
      activity: await this.activity(companyId, ['operations.']),
      series: [],
      seriesTitleEn: 'Work orders',
      seriesTitleAr: 'أوامر العمل',
    };
  }

  // ------------------------------------------------------------ automotive

  private async inspections(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [services, bookings, scheduled, completed, findings, reports] = await Promise.all([
      this.prisma.inspectionService.count({ where: { companyId, isActive: true } }),
      this.prisma.inspectionBooking.count({ where: { companyId } }),
      this.prisma.inspectionBooking.count({ where: { companyId, status: { in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.inspectionBooking.count({ where: { companyId, status: 'COMPLETED' } }),
      this.prisma.inspectionFinding.count({ where: { companyId } }),
      this.prisma.inspectionReport.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('services', 'Inspection services', 'خدمات الفحص', services),
        count('bookings', 'Inspections', 'الفحوصات', bookings),
        count('scheduled', 'Scheduled', 'المجدولة', scheduled),
        count('completed', 'Completed', 'المكتملة', completed),
        count('findings', 'Findings recorded', 'الملاحظات المسجلة', findings),
      ],
      kpis: [
        kpi('reports', 'Reports', 'التقارير', String(reports), 'clipboard-check'),
        kpi('completed', 'Completed', 'المكتملة', String(completed), 'check'),
      ],
      shortcuts: [
        shortcut('new_booking', 'New inspection', 'فحص جديد', '/automotive/inspections', 'clipboard-check', 'erp.inspection.write'),
      ],
      activity: await this.activity(companyId, ['automotive.inspection', 'booking.']),
      series: [],
      seriesTitleEn: 'Inspections',
      seriesTitleAr: 'الفحوصات',
    };
  }

  private async maintenance(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [bays, bookings, jobCards, openJobs, completedJobs, estimates, warranties] = await Promise.all([
      this.prisma.workshopBay.count({ where: { companyId, isActive: true } }),
      this.prisma.maintenanceBooking.count({ where: { companyId } }),
      this.prisma.jobCard.count({ where: { companyId } }),
      this.prisma.jobCard.count({ where: { companyId, status: { in: ['OPEN', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'] } } }),
      this.prisma.jobCard.count({ where: { companyId, status: { in: ['COMPLETED', 'INVOICED'] } } }),
      this.prisma.repairEstimate.count({ where: { companyId } }),
      this.prisma.warrantyRecord.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('bays', 'Workshop bays', 'ورش العمل', bays),
        count('bookings', 'Maintenance bookings', 'حجوزات الصيانة', bookings),
        count('job_cards', 'Job cards', 'أوامر الصيانة', jobCards),
        count('open_jobs', 'Open job cards', 'أوامر صيانة مفتوحة', openJobs),
        count('completed_jobs', 'Completed', 'المكتملة', completedJobs),
      ],
      kpis: [
        kpi('estimates', 'Estimates', 'التقديرات', String(estimates), 'file-text'),
        kpi('warranties', 'Warranties', 'الضمانات', String(warranties), 'shield'),
      ],
      shortcuts: [
        shortcut('new_job', 'New job card', 'أمر صيانة جديد', '/automotive/maintenance', 'wrench', 'erp.maintenance.write'),
      ],
      activity: await this.activity(companyId, ['automotive.job_card', 'automotive.estimate', 'automotive.parts', 'automotive.maintenance']),
      series: await this.monthlySeries('jobCard', companyId, 'createdAt', branchId),
      seriesTitleEn: 'Job cards (12 months)',
      seriesTitleAr: 'أوامر الصيانة (12 شهرًا)',
    };
  }

  private async spareParts(companyId: string): Promise<ModuleBundle> {
    const [parts, compatibilities, references, products] = await Promise.all([
      this.prisma.product.count({ where: { companyId, isActive: true } }),
      this.prisma.partCompatibility.count({ where: { companyId } }),
      this.prisma.partReference.count({ where: { companyId } }),
      this.prisma.product.count({ where: { companyId, isActive: true, trackStock: true } }),
    ]);
    return {
      stats: [
        count('parts', 'Parts', 'قطع الغيار', parts),
        count('tracked', 'Stock-tracked parts', 'قطع متتبعة بالمخزون', products),
        count('references', 'Part references', 'أرقام القطع', references),
        count('compatibilities', 'Fitment links', 'روابط التوافق', compatibilities),
      ],
      kpis: [kpi('parts', 'Active parts', 'القطع النشطة', String(parts), 'package')],
      shortcuts: [shortcut('spare_parts', 'Spare parts', 'قطع الغيار', '/automotive/spare-parts', 'package', 'erp.spare_parts.write')],
      activity: await this.activity(companyId, ['automotive.part']),
      series: [],
      seriesTitleEn: 'Parts catalogue',
      seriesTitleAr: 'كتالوج القطع',
    };
  }

  // -------------------------------------------------------------- customer

  private async customerPortal(companyId: string): Promise<ModuleBundle> {
    const [accounts, vehicles, addresses, bookings, intents] = await Promise.all([
      this.prisma.customerAccount.count({ where: { defaultCompanyId: companyId } }),
      this.prisma.vehicle.count({ where: { companyId } }),
      this.prisma.customerAddress.count({ where: { account: { defaultCompanyId: companyId } } }),
      this.prisma.bookingSlot.count({ where: { companyId } }),
      this.prisma.paymentIntent.count({ where: { companyId } }),
    ]);
    return {
      stats: [
        count('accounts', 'Customer accounts', 'حسابات العملاء', accounts),
        count('vehicles', 'Vehicles in garage', 'المركبات في الجراج', vehicles),
        count('addresses', 'Saved addresses', 'العناوين المحفوظة', addresses),
        count('bookings', 'Customer bookings', 'حجوزات العملاء', bookings),
        count('payments', 'Customer payments', 'مدفوعات العملاء', intents),
      ],
      kpis: [
        kpi('accounts', 'Accounts', 'الحسابات', String(accounts), 'car'),
        kpi('vehicles', 'Vehicles', 'المركبات', String(vehicles), 'car'),
      ],
      shortcuts: [shortcut('customer', 'Customer platform', 'منصة العملاء', '/customer', 'car', 'erp.customer_portal.read')],
      activity: await this.activity(companyId, ['customer.', 'portal.']),
      series: [],
      seriesTitleEn: 'Customer accounts',
      seriesTitleAr: 'حسابات العملاء',
    };
  }

  private async booking(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [resources, slots, confirmed, cancelled, completed] = await Promise.all([
      this.prisma.bookingResource.count({ where: { companyId, isActive: true } }),
      this.prisma.bookingSlot.count({ where: { companyId } }),
      this.prisma.bookingSlot.count({ where: { companyId, status: { in: ['CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.bookingSlot.count({ where: { companyId, status: 'CANCELLED' } }),
      this.prisma.bookingSlot.count({ where: { companyId, status: 'COMPLETED' } }),
    ]);
    const hours = await this.prisma.workingHours.count({ where: { resource: { companyId } } });
    const exceptions = await this.prisma.bookingResourceException.count({ where: { resource: { companyId } } });
    return {
      stats: [
        count('resources', 'Booking resources', 'موارد الحجز', resources),
        count('slots', 'Bookings', 'الحجوزات', slots),
        count('confirmed', 'Confirmed', 'المؤكدة', confirmed),
        count('cancelled', 'Cancelled', 'الملغاة', cancelled),
        count('completed', 'Completed', 'المكتملة', completed),
      ],
      kpis: [
        kpi('resources', 'Resources', 'الموارد', String(resources), 'calendar'),
        kpi('confirmed', 'Confirmed', 'المؤكدة', String(confirmed), 'check'),
        kpi('hours', 'Working-hour rows', 'سطور ساعات العمل', String(hours), 'clock'),
        kpi('exceptions', 'Exceptions', 'الاستثناءات', String(exceptions), 'alert-triangle'),
      ],
      shortcuts: [shortcut('bookings', 'Bookings', 'الحجوزات', '/bookings', 'calendar', 'erp.booking.read')],
      activity: await this.activity(companyId, ['booking.']),
      series: [],
      seriesTitleEn: 'Bookings',
      seriesTitleAr: 'الحجوزات',
    };
  }

  private async providerPortal(companyId: string): Promise<ModuleBundle> {
    const providers = await this.prisma.marketplaceProvider.findMany({
      where: { providerCompanyId: companyId },
      select: { id: true, status: true },
    });
    const providerIds = providers.map((p) => p.id);
    const [approved, listings, reviews, disputes, settlements] = await Promise.all([
      providers.filter((p) => p.status === 'APPROVED').length,
      this.prisma.providerServiceListing.count({ where: { providerId: { in: providerIds }, isActive: true } }),
      this.prisma.providerReview.count({ where: { providerId: { in: providerIds } } }),
      this.prisma.marketplaceDispute.count({ where: { providerId: { in: providerIds } } }),
      this.prisma.providerSettlement.count({ where: { providerId: { in: providerIds } } }),
    ]);
    return {
      stats: [
        count('providers', 'Providers', 'المزودون', providers.length),
        count('approved', 'Approved providers', 'المزودون المعتمدون', approved),
        count('listings', 'Listings', 'القوائم', listings),
        count('reviews', 'Reviews', 'التقييمات', reviews),
        count('settlements', 'Settlements', 'التسويات', settlements),
      ],
      kpis: [
        kpi('disputes', 'Disputes', 'الاعتراضات', String(disputes), 'alert-triangle'),
        kpi('listings', 'Active listings', 'القوائم النشطة', String(listings), 'store'),
      ],
      shortcuts: [shortcut('providers', 'Provider portal', 'بوابة المزودين', '/providers', 'store', 'erp.provider_portal.read')],
      activity: await this.activity(companyId, ['marketplace.', 'provider.']),
      series: [],
      seriesTitleEn: 'Service requests',
      seriesTitleAr: 'طلبات الخدمة',
    };
  }

  // ------------------------------------------------------------- analytics

  private async reports(companyId: string, branchId: string | null): Promise<ModuleBundle> {
    const [invoices, purchases, ledger, customers, suppliers] = await Promise.all([
      this.prisma.salesInvoice.aggregate({ where: { companyId, status: { not: 'DRAFT' } }, _sum: { totalMinor: true }, _count: true }),
      this.prisma.supplierInvoice.aggregate({ where: { companyId, status: { not: 'DRAFT' } }, _sum: { totalMinor: true }, _count: true }),
      this.prisma.journalEntry.aggregate({ where: { companyId, status: { not: 'DRAFT' } }, _sum: { totalDebitMinor: true } }),
      this.prisma.customer.count({ where: { companyId, isActive: true } }),
      this.prisma.supplier.count({ where: { companyId, isActive: true } }),
    ]);
    return {
      stats: [
        money('revenue', 'Invoiced revenue', 'الإيراد المفوتر', invoices._sum.totalMinor ?? 0),
        money('purchases', 'Purchases', 'المشتريات', purchases._sum.totalMinor ?? 0),
        money('ledger', 'Ledger debits', 'إجمالي المدين', ledger._sum.totalDebitMinor ?? 0),
        count('customers', 'Customers', 'العملاء', customers),
        count('suppliers', 'Suppliers', 'الموردون', suppliers),
      ],
      kpis: [
        kpi('invoices', 'Invoices', 'الفواتير', String(invoices._count), 'bar-chart'),
        kpi('purchases', 'Supplier invoices', 'فواتير الموردين', String(purchases._count), 'truck'),
      ],
      shortcuts: [shortcut('reports', 'Reports', 'التقارير', '/reports', 'bar-chart', 'erp.reports.read')],
      activity: await this.activity(companyId, []),
      series: await this.monthlySeries('salesInvoice', companyId, 'invoiceDate', branchId),
      seriesTitleEn: 'Invoices issued (12 months)',
      seriesTitleAr: 'الفواتير الصادرة (12 شهرًا)',
    };
  }

  // ---------------------------------------------------------- administration

  private async users(companyId: string): Promise<ModuleBundle> {
    const [members, active, roles, invitations] = await Promise.all([
      this.prisma.membership.count({ where: { companyId } }),
      this.prisma.membership.count({ where: { companyId, isActive: true } }),
      this.prisma.role.count({ where: { companyId } }),
      this.prisma.invitation.count({ where: { companyId, acceptedAt: null } }),
    ]);
    return {
      stats: [
        count('members', 'Members', 'الأعضاء', members),
        count('active', 'Active members', 'الأعضاء النشطون', active),
        count('roles', 'Roles', 'الأدوار', roles),
        count('invitations', 'Pending invitations', 'الدعوات المعلقة', invitations),
      ],
      kpis: [
        kpi('roles', 'Roles', 'الأدوار', String(roles), 'shield'),
        kpi('pending', 'Pending invites', 'دعوات معلقة', String(invitations), 'mail'),
      ],
      shortcuts: [
        shortcut('users', 'Users', 'المستخدمون', '/users', 'shield', 'company.user.read'),
        shortcut('roles', 'Roles', 'الأدوار', '/roles', 'shield', 'company.role.read'),
      ],
      activity: await this.activity(companyId, ['auth.', 'role.', 'company.user']),
      series: [],
      seriesTitleEn: 'Team',
      seriesTitleAr: 'الفريق',
    };
  }

  private async subscription(companyId: string): Promise<ModuleBundle> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });
    const licensed = subscription?.licensedModules.length ?? 0;
    const totalModules = MODULES.length;
    return {
      stats: [
        count('licensed', 'Licensed modules', 'الوحدات المرخصة', licensed),
        count('available', 'Platform modules', 'وحدات المنصة', totalModules),
        count('events', 'Subscription events', 'أحداث الاشتراك', await this.prisma.subscriptionEvent.count({ where: { subscription: { companyId } } })),
      ],
      kpis: [
        kpi('plan', 'Plan', 'الخطة', subscription?.plan.nameEn ?? '—', 'credit-card'),
        kpi('status', 'Status', 'الحالة', subscription?.status ?? '—', 'activity'),
        kpi('renewal', 'Renews', 'التجديد', subscription?.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString().slice(0, 10) : '—', 'calendar'),
      ],
      shortcuts: [shortcut('subscription', 'Subscription', 'الاشتراك', '/subscription', 'credit-card', 'company.subscription.read')],
      activity: await this.activity(companyId, ['subscription.']),
      series: [],
      seriesTitleEn: 'Entitlements',
      seriesTitleAr: 'الاستحقاقات',
    };
  }

  private async settingsCenter(companyId: string): Promise<ModuleBundle> {
    const [configured, revisions] = await Promise.all([
      this.prisma.companySetting.count({ where: { companyId } }),
      this.prisma.companySettingRevision.count({ where: { companyId } }),
    ]);
    const namespaces = SETTING_NAMESPACES;
    return {
      stats: [
        count('namespaces', 'Settings namespaces', 'أقسام الإعدادات', namespaces.length),
        count('configured', 'Configured namespaces', 'الأقسام المهيأة', configured),
        count('revisions', 'Recorded changes', 'التغييرات المسجلة', revisions),
      ],
      kpis: [
        kpi('configured', 'Configured', 'المهيأة', `${configured}/${namespaces.length}`, 'sliders'),
        kpi('revisions', 'Changes', 'التغييرات', String(revisions), 'activity'),
      ],
      shortcuts: [
        shortcut('general', 'General', 'العامة', '/settings', 'sliders', 'erp.settings.update'),
        shortcut('tax', 'Tax', 'الضرائب', '/settings', 'percent', 'erp.settings.update'),
        shortcut('invoicing', 'Invoicing', 'الفواتير', '/settings', 'file-text', 'erp.settings.update'),
      ],
      activity: await this.activity(companyId, ['settings.']),
      series: [],
      seriesTitleEn: 'Configured namespaces',
      seriesTitleAr: 'الأقسام المهيأة',
    };
  }
}
