import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom, ErpContextService } from '../common/erp-context.service';
import { AccountingService } from './accounting.service';
import {
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

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('accounting')
@ApiBearerAuth()
@RequireModule('financial_accounting')
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly context: ErpContextService,
  ) {}

  // ---------------------------------------------------------------- accounts
  @Get('accounts')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.coa.manage')
  @ApiOperation({ summary: 'Chart of accounts' })
  listAccounts(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.listAccounts(query, p);
  }

  @Post('accounts')
  @RequirePermissions('erp.accounting.coa.manage')
  @ApiOperation({ summary: 'Create an account' })
  createAccount(@Body() dto: CreateAccountDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.accounting.createAccount(dto, p, actorFrom(p, req));
  }

  @Patch('accounts/:id')
  @RequirePermissions('erp.accounting.coa.manage')
  @ApiOperation({ summary: 'Update an account' })
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.accounting.updateAccount(id, dto, p, actorFrom(p, req));
  }

  @Post('accounts/seed-standard-chart')
  @RequirePermissions('erp.accounting.coa.manage')
  @ApiOperation({ summary: 'Seed the standard chart of accounts when empty' })
  async seedChart(@CurrentPrincipal() p: RequestPrincipal) {
    const { companyId } = await this.context.resolveCompanyScope(p);
    return this.accounting.seedStandardChart(companyId, 'SAR', p.userId);
  }

  // ------------------------------------------------------------ fiscal years
  @Get('fiscal-years')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.fiscal.manage')
  @ApiOperation({ summary: 'Fiscal years and their periods' })
  fiscalYears(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.listFiscalYears(p, companyId);
  }

  @Post('fiscal-years')
  @RequirePermissions('erp.accounting.fiscal.manage')
  @ApiOperation({ summary: 'Create a fiscal year with monthly periods' })
  createFiscalYear(
    @Body() dto: CreateFiscalYearDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.accounting.createFiscalYear(dto, p, actorFrom(p, req));
  }

  @Patch('fiscal-periods/:id/status')
  @RequirePermissions('erp.accounting.fiscal.manage')
  @ApiOperation({ summary: 'Open, close or lock a fiscal period' })
  setPeriodStatus(
    @Param('id') id: string,
    @Body() dto: SetPeriodStatusDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.accounting.setPeriodStatus(id, dto, p, actorFrom(p, req));
  }

  // ---------------------------------------------------------------- journals
  @Get('journals')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.journal.post')
  @ApiOperation({ summary: 'Journal entries with their lines' })
  journals(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.listJournals(query, p);
  }

  @Post('journals')
  @RequirePermissions('erp.accounting.journal.post')
  @ApiOperation({ summary: 'Post a balanced manual journal entry' })
  createJournal(@Body() dto: CreateJournalDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.accounting.createJournal(dto, p, actorFrom(p, req));
  }

  @Post('journals/:id/reverse')
  @RequirePermissions('erp.accounting.journal.reverse')
  @ApiOperation({ summary: 'Reverse a posted journal entry' })
  reverseJournal(
    @Param('id') id: string,
    @Body() dto: ReverseJournalDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.accounting.reverseJournal(id, dto, p, actorFrom(p, req));
  }

  // ------------------------------------------------------------------ ledger
  @Get('general-ledger')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.statement.read')
  @ApiOperation({ summary: 'General ledger by account' })
  ledger(@Query() query: LedgerQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.generalLedger(query, p);
  }

  @Get('trial-balance')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.statement.read')
  @ApiOperation({ summary: 'Trial balance' })
  trialBalance(@Query() query: StatementQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.trialBalance(query, p);
  }

  @Get('income-statement')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.statement.read')
  @ApiOperation({ summary: 'Income statement (profit and loss)' })
  incomeStatement(@Query() query: StatementQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.incomeStatement(query, p);
  }

  @Get('balance-sheet')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.statement.read')
  @ApiOperation({ summary: 'Balance sheet' })
  balanceSheet(@Query() query: StatementQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.balanceSheet(query, p);
  }

  // ----------------------------------------------------------------- AR / AP
  @Get('receivables-aging')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.statement.read')
  @ApiOperation({ summary: 'Accounts receivable aging' })
  receivables(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.receivablesAging(p, companyId);
  }

  @Get('payables-aging')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.statement.read')
  @ApiOperation({ summary: 'Accounts payable aging' })
  payables(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.payablesAging(p, companyId);
  }

  // ---------------------------------------------------------------- payments
  @Get('payments')
  @RequireAnyPermission('erp.accounting.read', 'erp.accounting.payment.manage')
  @ApiOperation({ summary: 'Receipts and payments' })
  payments(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.accounting.listPayments(query, p);
  }

  @Post('payments')
  @RequirePermissions('erp.accounting.payment.manage')
  @ApiOperation({ summary: 'Record a receipt or payment and post it' })
  recordPayment(@Body() dto: RecordPaymentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.accounting.recordPayment(dto, p, actorFrom(p, req));
  }
}
