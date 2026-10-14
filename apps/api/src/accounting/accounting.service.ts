import { Injectable } from '@nestjs/common';
import { allocateMinor, fromMinor, sumMinor, toMinor } from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AccountingPostingService, SYSTEM_ROLES, type SystemRole } from '../common/accounting-posting.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { ErpContextService } from '../common/erp-context.service';
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '../common/errors';
import type { ActorContext } from '../organizations/organizations.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import type {
  CreateAccountDto,
  CreateFiscalYearDto,
  CreateJournalDto,
  LedgerQueryDto,
  ListQueryDto,
  RecordPaymentDto,
  ReverseJournalDto,
  SetPeriodStatusDto,
  StatementQueryDto,
  UpdateAccountDto,
} from './accounting.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** A standard chart of accounts seeded for every new company. */
const STANDARD_CHART: Array<{
  code: string;
  nameEn: string;
  nameAr: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
  systemRole?: SystemRole;
}> = [
  { code: '1000', nameEn: 'Cash on hand', nameAr: 'النقدية بالصندوق', type: 'ASSET', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.CASH },
  { code: '1010', nameEn: 'Bank', nameAr: 'البنك', type: 'ASSET', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.BANK },
  { code: '1100', nameEn: 'Accounts receivable', nameAr: 'الذمم المدينة', type: 'ASSET', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.AR_CONTROL },
  { code: '1200', nameEn: 'Inventory', nameAr: 'المخزون', type: 'ASSET', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.INVENTORY },
  { code: '2000', nameEn: 'Accounts payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: SYSTEM_ROLES.AP_CONTROL },
  { code: '2100', nameEn: 'VAT payable (output)', nameAr: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', normalBalance: 'CREDIT', systemRole: SYSTEM_ROLES.VAT_OUTPUT },
  { code: '2110', nameEn: 'VAT recoverable (input)', nameAr: 'ضريبة القيمة المضافة القابلة للخصم', type: 'ASSET', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.VAT_INPUT },
  { code: '3000', nameEn: 'Owner equity', nameAr: 'حقوق الملكية', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '4000', nameEn: 'Sales revenue', nameAr: 'إيرادات المبيعات', type: 'REVENUE', normalBalance: 'CREDIT', systemRole: SYSTEM_ROLES.SALES_REVENUE },
  { code: '4100', nameEn: 'Sales discounts', nameAr: 'خصومات المبيعات', type: 'REVENUE', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.SALES_DISCOUNT },
  { code: '5000', nameEn: 'Cost of goods sold', nameAr: 'تكلفة البضاعة المباعة', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.COGS },
  { code: '5900', nameEn: 'Cash over / short', nameAr: 'فروق الصندوق', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.CASH_OVER_SHORT },
  { code: '5910', nameEn: 'Inventory adjustment', nameAr: 'تسوية المخزون', type: 'EXPENSE', normalBalance: 'DEBIT', systemRole: SYSTEM_ROLES.STOCK_ADJUSTMENT },
];

const DEBIT_TYPES = new Set(['ASSET', 'EXPENSE']);

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly posting: AccountingPostingService,
    private readonly sequences: DocumentSequenceService,
    private readonly context: ErpContextService,
  ) {}

  // ------------------------------------------------------------------ accounts

  /** Seed the standard chart of accounts for a company that has none. */
  async seedStandardChart(companyId: string, currency = 'SAR', actorUserId?: string) {
    const existing = await this.prisma.account.count({ where: { companyId } });
    if (existing > 0) return { created: 0 };
    await this.prisma.account.createMany({
      data: STANDARD_CHART.map((a) => ({
        companyId,
        code: a.code,
        nameEn: a.nameEn,
        nameAr: a.nameAr,
        type: a.type,
        normalBalance: a.normalBalance,
        isPostable: true,
        isSystem: true,
        systemRole: a.systemRole ?? null,
        currency,
      })),
    });
    await this.audit.record({
      actorUserId: actorUserId ?? null,
      companyId,
      action: 'accounting.chart_seeded',
      targetType: 'ACCOUNT',
      summary: `Seeded standard chart of accounts (${STANDARD_CHART.length} accounts)`,
    });
    return { created: STANDARD_CHART.length };
  }

  async listAccounts(query: ListQueryDto, principal: RequestPrincipal) {
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
      this.prisma.account.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.account.count({ where }),
    ]);
    return { items: rows.map(toAccountDto), total, page, pageSize };
  }

  async createAccount(dto: CreateAccountDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const dup = await this.prisma.account.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Account code ${dto.code} already exists.`);

    let level = 1;
    if (dto.parentId) {
      const parent = await this.prisma.account.findFirst({ where: { id: dto.parentId, companyId } });
      if (!parent) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Parent account not found.');
      level = parent.level + 1;
    }
    const normalBalance = dto.normalBalance ?? (DEBIT_TYPES.has(dto.type) ? 'DEBIT' : 'CREDIT');
    const account = await this.prisma.account.create({
      data: {
        companyId,
        code: dto.code,
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        type: dto.type,
        normalBalance,
        parentId: dto.parentId ?? null,
        level,
        isPostable: dto.isPostable ?? true,
        systemRole: dto.systemRole ?? null,
        currency: dto.currency ?? 'SAR',
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'accounting.account_created',
      targetType: 'ACCOUNT',
      targetId: account.id,
      summary: `Created account ${account.code} ${account.nameEn}`,
    });
    return toAccountDto(account);
  }

  async updateAccount(id: string, dto: UpdateAccountDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const account = await this.prisma.account.findFirst({ where: { id, companyId } });
    if (!account) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Account not found.');
    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.isPostable !== undefined ? { isPostable: dto.isPostable } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.systemRole !== undefined ? { systemRole: dto.systemRole } : {}),
      },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'accounting.account_updated',
      targetType: 'ACCOUNT',
      targetId: id,
      summary: `Updated account ${updated.code}`,
    });
    return toAccountDto(updated);
  }

  // -------------------------------------------------------------- fiscal years

  async listFiscalYears(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const years = await this.prisma.fiscalYear.findMany({
      where: { companyId },
      orderBy: { startDate: 'desc' },
      include: { periods: { orderBy: { periodNumber: 'asc' } } },
    });
    return years.map((y) => ({
      id: y.id,
      code: y.code,
      startDate: y.startDate.toISOString(),
      endDate: y.endDate.toISOString(),
      isClosed: y.isClosed,
      periods: y.periods.map((p) => ({
        id: p.id,
        periodNumber: p.periodNumber,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        startDate: p.startDate.toISOString(),
        endDate: p.endDate.toISOString(),
        status: p.status,
      })),
    }));
  }

  async createFiscalYear(dto: CreateFiscalYearDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'endDate must be after startDate.');

    const dup = await this.prisma.fiscalYear.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (dup) throw conflict(ERROR_CODES.RESOURCE_CONFLICT, `Fiscal year ${dto.code} already exists.`);

    const periods = buildMonthlyPeriods(startDate, endDate);
    const year = await this.prisma.fiscalYear.create({
      data: {
        companyId,
        code: dto.code,
        startDate,
        endDate,
        periods: {
          create: periods.map((p, i) => ({
            companyId,
            periodNumber: i + 1,
            nameEn: p.nameEn,
            nameAr: p.nameAr,
            startDate: p.start,
            endDate: p.end,
            status: 'OPEN',
          })),
        },
      },
      include: { periods: true },
    });
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'accounting.fiscal_year_created',
      targetType: 'FISCAL_YEAR',
      targetId: year.id,
      summary: `Created fiscal year ${year.code} with ${periods.length} periods`,
    });
    return { id: year.id, code: year.code, periods: year.periods.length };
  }

  async setPeriodStatus(periodId: string, dto: SetPeriodStatusDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id: periodId, companyId } });
    if (!period) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Fiscal period not found.');
    const updated = await this.prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: {
        status: dto.status,
        closedAt: dto.status === 'OPEN' ? null : new Date(),
        closedByUserId: dto.status === 'OPEN' ? null : actor.userId,
      },
    });
    // Closing every period closes the year.
    if (dto.status !== 'OPEN') {
      const remaining = await this.prisma.fiscalPeriod.count({
        where: { fiscalYearId: period.fiscalYearId, status: 'OPEN' },
      });
      await this.prisma.fiscalYear.update({
        where: { id: period.fiscalYearId },
        data: { isClosed: remaining === 0, closedAt: remaining === 0 ? new Date() : null },
      });
    }
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'accounting.period_status_changed',
      targetType: 'FISCAL_PERIOD',
      targetId: periodId,
      summary: `Period ${period.nameEn} status ${period.status} -> ${dto.status}`,
    });
    return { id: updated.id, status: updated.status };
  }

  // ----------------------------------------------------------------- journals

  async listJournals(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = {
      companyId,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.search
        ? {
            OR: [
              { entryNumber: { contains: query.search, mode: 'insensitive' as const } },
              { memo: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lines: { include: { account: { select: { code: true, nameEn: true, nameAr: true } } } } },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return {
      items: rows.map((e) => ({
        id: e.id,
        entryNumber: e.entryNumber,
        entryDate: e.entryDate.toISOString(),
        status: e.status,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        memo: e.memo,
        currency: e.currency,
        totalDebitMinor: e.totalDebitMinor,
        totalCreditMinor: e.totalCreditMinor,
        reversalOfId: e.reversalOfId,
        lines: e.lines.map((l) => ({
          id: l.id,
          lineNumber: l.lineNumber,
          accountId: l.accountId,
          accountCode: l.account.code,
          accountNameEn: l.account.nameEn,
          accountNameAr: l.account.nameAr,
          description: l.description,
          debitMinor: l.debitMinor,
          creditMinor: l.creditMinor,
        })),
      })),
      total,
      page,
      pageSize,
    };
  }

  async createJournal(dto: CreateJournalDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    // Validate accounts belong to this company and are postable.
    const accountIds = dto.lines.map((l) => l.accountId);
    const accounts = await this.prisma.account.findMany({ where: { companyId, id: { in: accountIds } } });
    if (accounts.length !== new Set(accountIds).size) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'One or more accounts do not belong to this company.');
    }
    for (const account of accounts) {
      if (!account.isPostable) {
        throw badRequest(ERROR_CODES.ACCOUNT_NOT_POSTABLE, `Account ${account.code} is not a postable account.`);
      }
    }

    const entryDate = new Date(dto.entryDate);
    const result = await this.posting.withTransaction(async (tx) => {
      return this.posting.postJournal(tx, {
        companyId,
        branchId: dto.branchId ?? null,
        entryDate,
        memo: dto.memo,
        currency: dto.currency,
        sourceType: 'MANUAL',
        sourceId: null,
        actorUserId: actor.userId,
        lines: dto.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debitMinor ?? 0,
          credit: l.creditMinor ?? 0,
          description: l.description,
        })),
      });
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'accounting.journal_posted',
      targetType: 'JOURNAL_ENTRY',
      targetId: result.id,
      summary: `Posted manual journal ${result.entryNumber}`,
      metadata: { totalDebitMinor: result.totalDebitMinor },
    });
    return result;
  }

  async reverseJournal(entryId: string, dto: ReverseJournalDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const reversalDate = dto.reversalDate ? new Date(dto.reversalDate) : new Date();
    const result = await this.posting.withTransaction(async (tx) =>
      this.posting.reverseJournal(tx, companyId, entryId, actor.userId, reversalDate),
    );
    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: 'accounting.journal_reversed',
      targetType: 'JOURNAL_ENTRY',
      targetId: entryId,
      summary: `Reversed journal with ${result.entryNumber}`,
      metadata: { reason: dto.reason ?? null },
    });
    return result;
  }

  // ------------------------------------------------------------------- ledger

  async generalLedger(query: LedgerQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    const accounts = await this.prisma.account.findMany({
      where: { companyId, ...(query.accountId ? { id: query.accountId } : {}) },
      orderBy: { code: 'asc' },
    });

    const lines = await this.prisma.journalLine.findMany({
      where: {
        companyId,
        accountId: { in: accounts.map((a) => a.id) },
        entry: {
          status: 'POSTED',
          ...(from || to
            ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        ...(query.branchId ? { entry: { branchId: query.branchId, status: 'POSTED' } } : {}),
      },
      include: { entry: { select: { entryNumber: true, entryDate: true, memo: true } } },
      orderBy: [{ accountId: 'asc' }, { entry: { entryDate: 'asc' } }],
    });

    const byAccount = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = byAccount.get(line.accountId) ?? [];
      list.push(line);
      byAccount.set(line.accountId, list);
    }

    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      accounts: accounts.map((a) => {
        const accountLines = byAccount.get(a.id) ?? [];
        let running = 0;
        const rows = accountLines.map((l) => {
          const signed = a.normalBalance === 'DEBIT' ? l.debitMinor - l.creditMinor : l.creditMinor - l.debitMinor;
          running += signed;
          return {
            entryId: l.entryId,
            entryNumber: l.entry.entryNumber,
            entryDate: l.entry.entryDate.toISOString(),
            description: l.description ?? l.entry.memo,
            debitMinor: l.debitMinor,
            creditMinor: l.creditMinor,
            runningBalanceMinor: running,
          };
        });
        return {
          accountId: a.id,
          code: a.code,
          nameEn: a.nameEn,
          nameAr: a.nameAr,
          type: a.type,
          normalBalance: a.normalBalance,
          totalDebitMinor: sumMinor(accountLines.map((l) => l.debitMinor)),
          totalCreditMinor: sumMinor(accountLines.map((l) => l.creditMinor)),
          closingBalanceMinor: running,
          lines: rows,
        };
      }),
    };
  }

  async trialBalance(query: StatementQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const to = query.to ? new Date(query.to) : undefined;
    const from = query.from ? new Date(query.from) : undefined;

    const accounts = await this.prisma.account.findMany({ where: { companyId }, orderBy: { code: 'asc' } });
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        companyId,
        entry: {
          status: 'POSTED',
          ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
      },
      _sum: { debitMinor: true, creditMinor: true },
    });
    const totals = new Map(grouped.map((g) => [g.accountId, g._sum]));

    const rows = accounts.map((a) => {
      const t = totals.get(a.id);
      const debit = t?.debitMinor ?? 0;
      const credit = t?.creditMinor ?? 0;
      const net = debit - credit;
      return {
        accountId: a.id,
        code: a.code,
        nameEn: a.nameEn,
        nameAr: a.nameAr,
        type: a.type,
        debitMinor: debit,
        creditMinor: credit,
        // Closing balance expressed on the account's normal side.
        balanceMinor: a.normalBalance === 'DEBIT' ? net : -net,
      };
    });
    const totalDebit = sumMinor(rows.map((r) => r.debitMinor));
    const totalCredit = sumMinor(rows.map((r) => r.creditMinor));
    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      rows,
      totalDebitMinor: totalDebit,
      totalCreditMinor: totalCredit,
      balanced: totalDebit === totalCredit,
    };
  }

  async incomeStatement(query: StatementQueryDto, principal: RequestPrincipal) {
    const tb = await this.trialBalance(query, principal);
    const revenue = tb.rows.filter((r) => r.type === 'REVENUE');
    const expense = tb.rows.filter((r) => r.type === 'EXPENSE');
    const totalRevenue = sumMinor(revenue.map((r) => r.balanceMinor));
    const totalExpense = sumMinor(expense.map((r) => r.balanceMinor));
    return {
      from: tb.from,
      to: tb.to,
      revenue: revenue.map(stripType),
      expense: expense.map(stripType),
      totalRevenueMinor: totalRevenue,
      totalExpenseMinor: totalExpense,
      netIncomeMinor: totalRevenue - totalExpense,
    };
  }

  async balanceSheet(query: StatementQueryDto, principal: RequestPrincipal) {
    const tb = await this.trialBalance(query, principal);
    const assets = tb.rows.filter((r) => r.type === 'ASSET');
    const liabilities = tb.rows.filter((r) => r.type === 'LIABILITY');
    const equity = tb.rows.filter((r) => r.type === 'EQUITY');
    const totalAssets = sumMinor(assets.map((r) => r.balanceMinor));
    const totalLiabilities = sumMinor(liabilities.map((r) => r.balanceMinor));
    const totalEquity = sumMinor(equity.map((r) => r.balanceMinor));
    // Current-period profit is part of equity for the accounting equation.
    const revenue = sumMinor(tb.rows.filter((r) => r.type === 'REVENUE').map((r) => r.balanceMinor));
    const expense = sumMinor(tb.rows.filter((r) => r.type === 'EXPENSE').map((r) => r.balanceMinor));
    const netIncome = revenue - expense;
    return {
      asOf: tb.to,
      assets: assets.map(stripType),
      liabilities: liabilities.map(stripType),
      equity: equity.map(stripType),
      totalAssetsMinor: totalAssets,
      totalLiabilitiesMinor: totalLiabilities,
      totalEquityMinor: totalEquity,
      netIncomeMinor: netIncome,
      totalLiabilitiesAndEquityMinor: totalLiabilities + totalEquity + netIncome,
      balanced: totalAssets === totalLiabilities + totalEquity + netIncome,
    };
  }

  // ------------------------------------------------------------------ AR / AP

  async receivablesAging(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
      include: { customer: { select: { nameEn: true, nameAr: true, code: true } } },
    });
    const now = Date.now();
    return invoices.map((inv) => {
      const outstanding = inv.totalMinor - inv.amountPaidMinor;
      const daysOverdue = inv.dueDate ? Math.floor((now - inv.dueDate.getTime()) / 86_400_000) : 0;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerNameEn: inv.customer.nameEn,
        customerNameAr: inv.customer.nameAr,
        invoiceDate: inv.invoiceDate.toISOString(),
        dueDate: inv.dueDate?.toISOString() ?? null,
        totalMinor: inv.totalMinor,
        paidMinor: inv.amountPaidMinor,
        outstandingMinor: outstanding,
        daysOverdue,
        bucket: agingBucket(daysOverdue),
      };
    });
  }

  async payablesAging(principal: RequestPrincipal, companyIdInput?: string) {
    const { companyId } = await this.context.resolveCompanyScope(principal, companyIdInput);
    const invoices = await this.prisma.supplierInvoice.findMany({
      where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
      include: { supplier: { select: { nameEn: true, nameAr: true, code: true } } },
    });
    const now = Date.now();
    return invoices.map((inv) => {
      const outstanding = inv.totalMinor - inv.amountPaidMinor;
      const daysOverdue = inv.dueDate ? Math.floor((now - inv.dueDate.getTime()) / 86_400_000) : 0;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierInvoiceNumber: inv.supplierInvoiceNumber,
        supplierId: inv.supplierId,
        supplierNameEn: inv.supplier.nameEn,
        supplierNameAr: inv.supplier.nameAr,
        invoiceDate: inv.invoiceDate.toISOString(),
        dueDate: inv.dueDate?.toISOString() ?? null,
        totalMinor: inv.totalMinor,
        paidMinor: inv.amountPaidMinor,
        outstandingMinor: outstanding,
        daysOverdue,
        bucket: agingBucket(daysOverdue),
      };
    });
  }

  // ------------------------------------------------------------------ payments

  async listPayments(query: ListQueryDto, principal: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(principal, query.companyId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where = { companyId };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { nameEn: true, nameAr: true } },
          supplier: { select: { nameEn: true, nameAr: true } },
          allocations: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items: rows.map(toPaymentDto), total, page, pageSize };
  }

  /**
   * Record a receipt or payment and post it to the ledger.
   *
   * The cash/bank side and the control-account side always balance, and any
   * allocations against invoices are validated so the sum of allocations never
   * exceeds the payment amount or the outstanding invoice balance.
   */
  async recordPayment(dto: RecordPaymentDto, principal: RequestPrincipal, actor: ActorContext) {
    const { companyId, branchIds } = await this.context.resolveCompanyScope(principal);
    if (dto.branchId) await this.context.assertBranchScope(companyId, dto.branchId, branchIds);

    if (dto.direction === 'RECEIPT' && (!dto.customerId || dto.supplierId)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A receipt requires a customerId.');
    }
    if (dto.direction === 'PAYMENT' && (!dto.supplierId || dto.customerId)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A payment requires a supplierId.');
    }

    const paidAt = new Date(dto.paidAt);

    const result = await this.posting.withTransaction(async (tx) => {
      // Idempotency: a repeated request with the same key returns the original.
      if (dto.idempotencyKey) {
        const existing = await tx.payment.findFirst({
          where: { companyId, idempotencyKey: dto.idempotencyKey },
          include: { allocations: true },
        });
        if (existing) return toPaymentDto(existing);
      }

      const allocations = dto.allocations ?? [];
      const allocatedTotal = sumMinor(allocations.map((a) => a.amountMinor));
      if (allocatedTotal > dto.amountMinor) {
        throw badRequest(ERROR_CODES.OVER_ALLOCATION, 'Allocated amount exceeds the payment amount.');
      }

      const cashAccount = await this.posting.systemAccount(
        tx,
        companyId,
        dto.method === 'CASH' ? SYSTEM_ROLES.CASH : SYSTEM_ROLES.BANK,
      );

      let controlAccountId: string;
      if (dto.direction === 'RECEIPT') {
        const customer = await tx.customer.findFirst({ where: { id: dto.customerId!, companyId } });
        if (!customer) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Customer not found.');
        controlAccountId = customer.receivableAccountId ?? (await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AR_CONTROL));
      } else {
        const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId!, companyId } });
        if (!supplier) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Supplier not found.');
        controlAccountId = supplier.payableAccountId ?? (await this.posting.systemAccount(tx, companyId, SYSTEM_ROLES.AP_CONTROL));
      }

      const paymentNumber = await this.sequences.next(tx, companyId, 'payment');
      const payment = await tx.payment.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          direction: dto.direction,
          partyType: dto.partyType,
          customerId: dto.customerId ?? null,
          supplierId: dto.supplierId ?? null,
          paymentNumber,
          method: dto.method,
          amountMinor: dto.amountMinor,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          paidAt,
          idempotencyKey: dto.idempotencyKey ?? null,
          createdById: actor.userId,
        },
      });

      // Apply allocations and keep invoice paid-amounts consistent.
      for (const alloc of allocations) {
        if (alloc.target === 'SALES_INVOICE') {
          if (!alloc.salesInvoiceId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'salesInvoiceId is required.');
          const invoice = await tx.salesInvoice.findFirst({ where: { id: alloc.salesInvoiceId, companyId } });
          if (!invoice) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales invoice not found.');
          const outstanding = invoice.totalMinor - invoice.amountPaidMinor;
          if (alloc.amountMinor > outstanding) {
            throw badRequest(ERROR_CODES.OVER_ALLOCATION, `Allocation exceeds outstanding balance of ${invoice.invoiceNumber}.`);
          }
          const paid = invoice.amountPaidMinor + alloc.amountMinor;
          await tx.salesInvoice.update({
            where: { id: invoice.id },
            data: {
              amountPaidMinor: paid,
              status: paid >= invoice.totalMinor ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
        } else if (alloc.target === 'SUPPLIER_INVOICE') {
          if (!alloc.supplierInvoiceId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'supplierInvoiceId is required.');
          const invoice = await tx.supplierInvoice.findFirst({ where: { id: alloc.supplierInvoiceId, companyId } });
          if (!invoice) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Supplier invoice not found.');
          const outstanding = invoice.totalMinor - invoice.amountPaidMinor;
          if (alloc.amountMinor > outstanding) {
            throw badRequest(ERROR_CODES.OVER_ALLOCATION, `Allocation exceeds outstanding balance of ${invoice.invoiceNumber}.`);
          }
          const paid = invoice.amountPaidMinor + alloc.amountMinor;
          await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: { amountPaidMinor: paid, status: paid >= invoice.totalMinor ? 'PAID' : 'PARTIALLY_PAID' },
          });
        } else {
          if (!alloc.creditNoteId) throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'creditNoteId is required.');
          const note = await tx.creditNote.findFirst({ where: { id: alloc.creditNoteId, companyId } });
          if (!note) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Credit note not found.');
        }
        await tx.paymentAllocation.create({
          data: {
            companyId,
            paymentId: payment.id,
            target: alloc.target,
            salesInvoiceId: alloc.salesInvoiceId ?? null,
            supplierInvoiceId: alloc.supplierInvoiceId ?? null,
            creditNoteId: alloc.creditNoteId ?? null,
            amountMinor: alloc.amountMinor,
          },
        });
      }

      // Post the ledger entry.
      const lines =
        dto.direction === 'RECEIPT'
          ? [
              { accountId: cashAccount, debit: dto.amountMinor },
              { accountId: controlAccountId, credit: dto.amountMinor },
            ]
          : [
              { accountId: controlAccountId, debit: dto.amountMinor },
              { accountId: cashAccount, credit: dto.amountMinor },
            ];

      const journal = await this.posting.postJournal(tx, {
        companyId,
        branchId: dto.branchId ?? null,
        entryDate: paidAt,
        memo: `${dto.direction === 'RECEIPT' ? 'Receipt' : 'Payment'} ${paymentNumber}`,
        sourceType: dto.direction === 'RECEIPT' ? 'CUSTOMER_RECEIPT' : 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        actorUserId: actor.userId,
        lines,
      });
      await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journal.id } });

      const fresh = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: {
          customer: { select: { nameEn: true, nameAr: true } },
          supplier: { select: { nameEn: true, nameAr: true } },
          allocations: true,
        },
      });
      return toPaymentDto(fresh);
    });

    await this.audit.record({
      actorUserId: actor.userId,
      companyId,
      action: dto.direction === 'RECEIPT' ? 'accounting.receipt_recorded' : 'accounting.payment_recorded',
      targetType: 'PAYMENT',
      targetId: result.id,
      summary: `${dto.direction === 'RECEIPT' ? 'Recorded receipt' : 'Recorded payment'} ${result.paymentNumber} for ${fromMinor(dto.amountMinor)} ${result.currency}`,
    });
    return result;
  }

  // ------------------------------------------------------------------- opening

  /** Set an opening balance for an account by posting a balancing journal. */
  async postOpeningBalance(
    accountId: string,
    amountMinor: number,
    side: 'DEBIT' | 'CREDIT',
    equityAccountId: string,
    entryDate: Date,
    principal: RequestPrincipal,
    actor: ActorContext,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    return this.posting.withTransaction(async (tx) =>
      this.posting.postJournal(tx, {
        companyId,
        entryDate,
        memo: 'Opening balance',
        sourceType: 'OPENING_BALANCE',
        sourceId: `${accountId}:${side}:${amountMinor}`,
        actorUserId: actor.userId,
        lines: [
          { accountId, debit: side === 'DEBIT' ? amountMinor : 0, credit: side === 'CREDIT' ? amountMinor : 0 },
          {
            accountId: equityAccountId,
            debit: side === 'CREDIT' ? amountMinor : 0,
            credit: side === 'DEBIT' ? amountMinor : 0,
          },
        ],
      }),
    );
  }
}

// ---------------------------------------------------------------- helpers

function stripType(row: { type: string } & Record<string, unknown>) {
  const { type: _type, ...rest } = row;
  return rest;
}

function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_PLUS';
}

function toAccountDto(a: {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  type: string;
  normalBalance: string;
  parentId: string | null;
  level: number;
  isPostable: boolean;
  isSystem: boolean;
  systemRole: string | null;
  currency: string;
  isActive: boolean;
}) {
  return {
    id: a.id,
    code: a.code,
    nameEn: a.nameEn,
    nameAr: a.nameAr,
    type: a.type,
    normalBalance: a.normalBalance,
    parentId: a.parentId,
    level: a.level,
    isPostable: a.isPostable,
    isSystem: a.isSystem,
    systemRole: a.systemRole,
    currency: a.currency,
    isActive: a.isActive,
  };
}

function toPaymentDto(p: {
  id: string;
  paymentNumber: string;
  direction: string;
  partyType: string;
  customerId: string | null;
  supplierId: string | null;
  method: string;
  amountMinor: number;
  currency: string;
  reference: string | null;
  notes: string | null;
  paidAt: Date;
  journalEntryId: string | null;
  customer?: { nameEn: string; nameAr: string } | null;
  supplier?: { nameEn: string; nameAr: string } | null;
  allocations: Array<{
    id: string;
    target: string;
    salesInvoiceId: string | null;
    supplierInvoiceId: string | null;
    creditNoteId: string | null;
    amountMinor: number;
  }>;
}) {
  return {
    id: p.id,
    paymentNumber: p.paymentNumber,
    direction: p.direction,
    partyType: p.partyType,
    customerId: p.customerId,
    supplierId: p.supplierId,
    partyNameEn: p.customer?.nameEn ?? p.supplier?.nameEn ?? null,
    partyNameAr: p.customer?.nameAr ?? p.supplier?.nameAr ?? null,
    method: p.method,
    amountMinor: p.amountMinor,
    currency: p.currency,
    reference: p.reference,
    notes: p.notes,
    paidAt: p.paidAt.toISOString(),
    journalEntryId: p.journalEntryId,
    allocations: p.allocations.map((a) => ({
      id: a.id,
      target: a.target,
      salesInvoiceId: a.salesInvoiceId,
      supplierInvoiceId: a.supplierInvoiceId,
      creditNoteId: a.creditNoteId,
      amountMinor: a.amountMinor,
    })),
  };
}

/** Build consecutive monthly periods covering `start`..`end`. */
function buildMonthlyPeriods(start: Date, end: Date) {
  const periods: Array<{ nameEn: string; nameAr: string; start: Date; end: Date }> = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  let index = 0;
  while (cursor <= end) {
    const periodStart = index === 0 ? start : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const periodEnd = monthEnd > end ? end : monthEnd;
    periods.push({
      nameEn: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      nameAr: cursor.toLocaleString('ar-SA', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      start: periodStart,
      end: periodEnd,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    index += 1;
  }
  return periods;
}

export { allocateMinor, toMinor };
