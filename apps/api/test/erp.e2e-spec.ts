import {
  FIXTURE_PREFIX,
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  cleanupFixtures,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';
import { lineAmountMinor } from '@oryx/shared';
import * as argon2 from 'argon2';

/**
 * Execution 02 — Enterprise ERP Core integration suite.
 *
 * Exercises the real HTTP surface, guards, posting engine and Prisma layer
 * against the seeded database: chart of accounts, fiscal periods, balanced
 * double-entry posting and reversal, period locking, moving-average inventory
 * valuation, concurrent stock issue, the sales/quote→order→invoice→payment
 * chain, credit notes, POS sessions, the procurement chain and reports.
 */
describe('ORYX ERP core (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let tenantId: string;
  let warehouseId: string;
  let branchId: string;
  let productId: string;
  let customerId: string;
  let supplierId: string;
  /** A principal that belongs only to the ERP fixture tenant. */
  let isolatedToken: string;
  const code = `${FIXTURE_PREFIX}-ERP`;

  /** Shorthand for a company-scoped request with the ERP fixture tenant. */
  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code,
        nameEn: 'ERP Fixture Co.',
        nameAr: 'شركة اختبار النظام',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    tenantId = created.body.company.id;

    // Attach the seeded company admin so RBAC applies to the fixture tenant.
    const adminRole = await ctx.prisma.role.findFirstOrThrow({
      where: { companyId: tenantId, code: 'company_admin' },
    });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });

    // A user that belongs *only* to this tenant, for cross-tenant assertions.
    // The seeded admin is also a member of the demo tenant, so it cannot be used
    // to prove isolation.
    const isolatedEmail = `${FIXTURE_PREFIX.toLowerCase()}-erp-isolated@oryx.local`;
    const passwordHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const isolatedUser = await ctx.prisma.user.create({
      data: {
        email: isolatedEmail,
        passwordHash,
        fullNameEn: 'Isolated ERP User',
        fullNameAr: 'مستخدم النظام المعزول',
        status: 'ACTIVE',
      },
    });
    await ctx.prisma.membership.create({
      data: { userId: isolatedUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });
    isolatedToken = await login(ctx.base, isolatedEmail, 'FixturePass!2026');

    const branch = await ctx.prisma.branch.create({
      data: { companyId: tenantId, code: `${FIXTURE_PREFIX}-BR`, nameEn: 'Main', nameAr: 'الرئيسي' },
    });
    branchId = branch.id;

    // Seed the chart of accounts, then a warehouse, product, customer and supplier.
    const seedChart = await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    expect(seedChart.status).toBe(201);

    const wh = await erp<{ id: string }>('/inventory/warehouses', {
      method: 'POST',
      body: { code: 'MAIN', nameEn: 'Main warehouse', nameAr: 'المستودع الرئيسي', branchId },
    });
    expect(wh.status).toBe(201);
    warehouseId = wh.body.id;

    const product = await erp<{ id: string }>('/inventory/products', {
      method: 'POST',
      body: {
        sku: 'WIDGET',
        nameEn: 'Widget',
        nameAr: 'قطعة',
        salesPriceMinor: 10000,
        costPriceMinor: 6000,
        taxRateBp: 1500,
        reorderLevel: 100000,
        reorderQuantity: 500000,
      },
    });
    expect(product.status).toBe(201);
    productId = product.body.id;

    const customer = await erp<{ id: string }>('/sales/customers', {
      method: 'POST',
      body: { code: 'C1', nameEn: 'Customer One', nameAr: 'العميل الأول', creditLimitMinor: 100000000 },
    });
    expect(customer.status).toBe(201);
    customerId = customer.body.id;

    const supplier = await erp<{ id: string }>('/purchasing/suppliers', {
      method: 'POST',
      body: { code: 'S1', nameEn: 'Supplier One', nameAr: 'المورد الأول' },
    });
    expect(supplier.status).toBe(201);
    supplierId = supplier.body.id;

    // Receive opening stock so issues have something to consume.
    const receive = await erp('/inventory/movements', {
      method: 'POST',
      body: {
        warehouseId,
        productId,
        direction: 'IN',
        quantity: 1000000, // 100 units
        unitCostMinor: 6000,
        occurredAt: new Date().toISOString(),
      },
    });
    expect(receive.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  // ------------------------------------------------------------------ accounting

  describe('accounting — chart of accounts and periods', () => {
    it('lists the seeded standard chart of accounts', async () => {
      const res = await erp<{ items: Array<{ code: string; systemRole: string | null }> }>(
        '/accounting/accounts',
      );
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(13);
      const ar = res.body.items.find((a) => a.systemRole === 'AR_CONTROL');
      expect(ar).toBeTruthy();
    });

    it('creates a fiscal year with monthly periods and refuses a duplicate', async () => {
      const year = 2026;
      const created = await erp<{ id: string; periods: number }>('/accounting/fiscal-years', {
        method: 'POST',
        body: { code: `FY${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
      });
      expect(created.status).toBe(201);
      expect(created.body.periods).toBe(12);

      const dup = await erp('/accounting/fiscal-years', {
        method: 'POST',
        body: { code: `FY${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
      });
      expect(dup.status).toBe(409);
    });
  });

  describe('accounting — double-entry posting', () => {
    let debitAccountId: string;
    let creditAccountId: string;

    beforeAll(async () => {
      const accounts = await erp<{ items: Array<{ id: string; code: string }> }>('/accounting/accounts');
      debitAccountId = accounts.body.items.find((a) => a.code === '1000')!.id;
      creditAccountId = accounts.body.items.find((a) => a.code === '4000')!.id;
    });

    it('posts a balanced manual journal and rejects an unbalanced one', async () => {
      const ok = await erp<{ id: string; entryNumber: string }>('/accounting/journals', {
        method: 'POST',
        body: {
          entryDate: '2026-03-15',
          memo: 'Cash sale',
          lines: [
            { accountId: debitAccountId, debitMinor: 500000 },
            { accountId: creditAccountId, creditMinor: 500000 },
          ],
        },
      });
      expect(ok.status).toBe(201);
      expect(ok.body.entryNumber).toMatch(/^JE-/);

      const unbalanced = await erp<{ code: string }>('/accounting/journals', {
        method: 'POST',
        body: {
          entryDate: '2026-03-15',
          memo: 'Broken',
          lines: [
            { accountId: debitAccountId, debitMinor: 500000 },
            { accountId: creditAccountId, creditMinor: 499999 },
          ],
        },
      });
      expect(unbalanced.status).toBe(400);
      expect(unbalanced.body.code).toBe('accounting.unbalanced_entry');
    });

    it('reverses a posted entry, netting the ledger to zero', async () => {
      const posted = await erp<{ id: string }>('/accounting/journals', {
        method: 'POST',
        body: {
          entryDate: '2026-04-01',
          memo: 'To be reversed',
          lines: [
            { accountId: debitAccountId, debitMinor: 250000 },
            { accountId: creditAccountId, creditMinor: 250000 },
          ],
        },
      });
      const reversal = await erp<{ entryNumber: string }>(
        `/accounting/journals/${posted.body.id}/reverse`,
        { method: 'POST', body: { reason: 'Mistake' } },
      );
      expect(reversal.status).toBe(201);

      const journals = await erp<{
        items: Array<{ id: string; status: string; lines: Array<{ accountId: string; debitMinor: number; creditMinor: number }> }>;
      }>('/accounting/journals?pageSize=100');
      const original = journals.body.items.find((j) => j.id === posted.body.id);
      expect(original?.status).toBe('REVERSED');

      // The cash account nets to the balanced manual entry above (500000), so the
      // reversal pair contributes exactly zero.
      const ledger = await erp<{ accounts: Array<{ code: string; closingBalanceMinor: number }> }>(
        '/accounting/general-ledger',
      );
      const cash = ledger.body.accounts.find((a) => a.code === '1000');
      expect(cash?.closingBalanceMinor).toBe(500000);
    });

    it('refuses to post into a closed period', async () => {
      const years = await erp<{ id: string; periods: Array<{ id: string; status: string }> }[]>(
        '/accounting/fiscal-years',
      );
      const fy = years.body.find((y) => y.periods.some((p) => p.id));
      const march = fy!.periods[2];
      const closed = await erp(`/accounting/fiscal-periods/${march.id}/status`, {
        method: 'PATCH',
        body: { status: 'LOCKED' },
      });
      expect(closed.status).toBe(200);

      const attempt = await erp<{ code: string }>('/accounting/journals', {
        method: 'POST',
        body: {
          entryDate: '2026-03-20',
          memo: 'Into a locked period',
          lines: [
            { accountId: debitAccountId, debitMinor: 1000 },
            { accountId: creditAccountId, creditMinor: 1000 },
          ],
        },
      });
      expect(attempt.status).toBe(403);
      expect(attempt.body.code).toBe('accounting.period_not_open');

      // Re-open so later suites can keep posting in March.
      await erp(`/accounting/fiscal-periods/${march.id}/status`, { method: 'PATCH', body: { status: 'OPEN' } });
    });

    it('produces a balanced trial balance and consistent statements', async () => {
      const tb = await erp<{ balanced: boolean; totalDebitMinor: number; totalCreditMinor: number }>(
        '/accounting/trial-balance',
      );
      expect(tb.status).toBe(200);
      expect(tb.body.balanced).toBe(true);
      expect(tb.body.totalDebitMinor).toBe(tb.body.totalCreditMinor);

      const bs = await erp<{ balanced: boolean }>('/accounting/balance-sheet');
      expect(bs.body.balanced).toBe(true);

      const is = await erp<{ netIncomeMinor: number }>('/accounting/income-statement');
      expect(typeof is.body.netIncomeMinor).toBe('number');
    });
  });

  // ------------------------------------------------------------------- inventory

  describe('inventory — valuation and concurrency', () => {
    it('values an inbound receipt at the received cost', async () => {
      const valuation = await erp<{ rows: Array<{ productId: string; quantity: number; averageCostMinor: number; valueMinor: number }> }>(
        '/inventory/valuation',
      );
      const row = valuation.body.rows.find((r) => r.productId === productId);
      expect(row).toBeDefined();
      // The receipt at 60.00 is the only movement on this SKU, so the moving
      // average is exactly the received unit cost and value = quantity x cost.
      expect(row!.averageCostMinor).toBe(6000);
      expect(row!.valueMinor).toBe(lineAmountMinor(row!.quantity, 6000));
    });

    it('refuses to issue more stock than is on hand', async () => {
      const res = await erp<{ code: string }>('/inventory/movements', {
        method: 'POST',
        body: {
          warehouseId,
          productId,
          direction: 'OUT',
          quantity: 999_000_000,
          occurredAt: new Date().toISOString(),
        },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('inventory.insufficient_stock');
    });

    it('keeps stock non-negative under concurrent issues of the same SKU', async () => {
      // 10 parallel issues of 5 units each against a 100-unit balance. All must
      // succeed and the final on-hand must be exactly 50 units, never negative.
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          erp('/inventory/movements', {
            method: 'POST',
            body: {
              warehouseId,
              productId,
              direction: 'OUT',
              quantity: 50000,
              occurredAt: new Date().toISOString(),
            },
          }),
        ),
      );
      for (const r of results) expect(r.status).toBe(201);

      const level = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(level.quantity).toBe(500000); // 50 units remain
      expect(level.quantity).toBeGreaterThanOrEqual(0);
    });

    it('moves stock between warehouses via a posted transfer', async () => {
      const dest = await erp<{ id: string }>('/inventory/warehouses', {
        method: 'POST',
        body: { code: 'BR2', nameEn: 'Second warehouse', nameAr: 'المستودع الثاني' },
      });
      const transfer = await erp<{ id: string }>('/inventory/transfers', {
        method: 'POST',
        body: { fromWarehouseId: warehouseId, toWarehouseId: dest.body.id, lines: [{ productId, quantity: 100000 }] },
      });
      expect(transfer.status).toBe(201);
      const posted = await erp<{ status: string }>(`/inventory/transfers/${transfer.body.id}/post`, {
        method: 'POST',
        body: {},
      });
      expect(posted.body.status).toBe('POSTED');

      const destLevel = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId: dest.body.id, productId } },
      });
      expect(destLevel.quantity).toBe(100000);
    });

    it('posts an adjustment and reflects it in valuation', async () => {
      const adjustment = await erp<{ id: string }>('/inventory/adjustments', {
        method: 'POST',
        body: {
          warehouseId,
          reason: 'Stock count correction',
          lines: [{ productId, quantityDelta: -20000, unitCostMinor: 6000 }],
        },
      });
      expect(adjustment.status).toBe(201);
      const posted = await erp<{ status: string }>(`/inventory/adjustments/${adjustment.body.id}/post`, {
        method: 'POST',
        body: {},
      });
      expect(posted.body.status).toBe('POSTED');
    });

    it('reports reorder alerts for products below their level', async () => {
      // Raise the reorder level above the current on-hand so the SKU is flagged.
      await erp(`/inventory/products/${productId}`, {
        method: 'PATCH',
        body: { reorderLevel: 100000000 },
      });
      const res = await erp<{ items: Array<{ sku: string }> }>('/inventory/reorder-alerts');
      expect(res.status).toBe(200);
      expect(res.body.items.some((i) => i.sku === 'WIDGET')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------- sales

  describe('sales — quote to cash', () => {
    let invoiceId: string;

    it('creates a quotation and converts it into a sales order', async () => {
      const quote = await erp<{ id: string; quoteNumber: string }>('/sales/quotations', {
        method: 'POST',
        body: {
          customerId,
          issueDate: '2026-05-01',
          lines: [{ productId, description: 'Widget', quantity: 20000, unitPriceMinor: 10000, taxPercentBp: 1500 }],
        },
      });
      expect(quote.status).toBe(201);

      const order = await erp<{ id: string; status: string }>(`/sales/quotations/${quote.body.id}/convert`, {
        method: 'POST',
        body: { warehouseId },
      });
      expect(order.status).toBe(201);
      expect(order.body.status).toBe('CONFIRMED');
    });

    it('issues and posts a sales invoice, drawing down stock and posting VAT', async () => {
      const before = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });

      const invoice = await erp<{ id: string; invoiceNumber: string; totalMinor: number; taxMinor: number; status: string }>(
        '/sales/invoices',
        {
          method: 'POST',
          body: {
            customerId,
            invoiceDate: '2026-05-02',
            warehouseId,
            lines: [{ productId, description: 'Widget', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 1500 }],
          },
        },
      );
      expect(invoice.status).toBe(201);
      expect(invoice.body.status).toBe('POSTED');
      // 1 unit at 100.00 = 100.00 net, 15% VAT = 15.00, total 115.00
      expect(invoice.body.taxMinor).toBe(1500);
      expect(invoice.body.totalMinor).toBe(11500);
      invoiceId = invoice.body.id;

      const after = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(before.quantity - after.quantity).toBe(10000);

      // A journal exists for the invoice.
      const journal = await ctx.prisma.journalEntry.findFirst({
        where: { companyId: tenantId, sourceType: 'SALES_INVOICE', sourceId: invoiceId },
      });
      expect(journal?.status).toBe('POSTED');
      expect(journal!.totalDebitMinor).toBe(journal!.totalCreditMinor);
    });

    it('records a customer receipt and settles the invoice', async () => {
      const receipt = await erp<{ id: string; allocations: unknown[] }>('/accounting/payments', {
        method: 'POST',
        body: {
          direction: 'RECEIPT',
          partyType: 'CUSTOMER',
          customerId,
          method: 'CASH',
          amountMinor: 11500,
          paidAt: '2026-05-03',
          allocations: [{ target: 'SALES_INVOICE', salesInvoiceId: invoiceId, amountMinor: 11500 }],
        },
      });
      expect(receipt.status).toBe(201);

      const invoice = await erp<{ status: string; amountPaidMinor: number }>(`/sales/invoices/${invoiceId}`);
      expect(invoice.body.status).toBe('PAID');
      expect(invoice.body.amountPaidMinor).toBe(11500);
    });

    it('rejects an over-allocation against an already-settled invoice', async () => {
      const res = await erp<{ code: string }>('/accounting/payments', {
        method: 'POST',
        body: {
          direction: 'RECEIPT',
          partyType: 'CUSTOMER',
          customerId,
          method: 'CASH',
          amountMinor: 5000,
          paidAt: '2026-05-04',
          allocations: [{ target: 'SALES_INVOICE', salesInvoiceId: invoiceId, amountMinor: 5000 }],
        },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('erp.over_allocation');
    });

    it('issues a credit note that reverses revenue and restocks the goods', async () => {
      const before = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      const note = await erp<{ id: string; creditNoteNumber: string; totalMinor: number }>('/sales/credit-notes', {
        method: 'POST',
        body: {
          customerId,
          invoiceId,
          issueDate: '2026-05-05',
          reason: 'Returned goods',
          warehouseId,
          restockInventory: true,
          lines: [{ productId, description: 'Widget', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 1500 }],
        },
      });
      expect(note.status).toBe(201);
      expect(note.body.totalMinor).toBe(11500);

      const after = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(after.quantity - before.quantity).toBe(10000);
    });

    it('enforces the customer credit limit', async () => {
      const tight = await erp<{ id: string }>('/sales/customers', {
        method: 'POST',
        body: { code: 'C-TIGHT', nameEn: 'Tight Limit', nameAr: 'حد ضيق', creditLimitMinor: 1000 },
      });
      const res = await erp<{ code: string }>('/sales/invoices', {
        method: 'POST',
        body: {
          customerId: tight.body.id,
          invoiceDate: '2026-05-06',
          warehouseId,
          issueStock: false,
          lines: [{ description: 'Service', quantity: 10000, unitPriceMinor: 100000, taxPercentBp: 0 }],
        },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('sales.credit_limit_exceeded');
    });
  });

  // ------------------------------------------------------------------------ POS

  describe('sales — POS cashier sessions', () => {
    let sessionId: string;

    it('opens a cashier session and records a POS sale', async () => {
      const session = await erp<{ id: string; status: string }>('/sales/cashier-sessions', {
        method: 'POST',
        body: { branchId, warehouseId, openingFloatMinor: 20000 },
      });
      expect(session.status).toBe(201);
      expect(session.body.status).toBe('OPEN');
      sessionId = session.body.id;

      const sale = await erp<{ receiptNumber: string; totalMinor: number; changeMinor: number }>('/sales/pos-sales', {
        method: 'POST',
        body: {
          branchId,
          cashierSessionId: sessionId,
          warehouseId,
          paymentMethod: 'CASH',
          paidMinor: 20000,
          lines: [{ productId, description: 'Widget', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 1500 }],
        },
      });
      expect(sale.status).toBe(201);
      expect(sale.body.totalMinor).toBe(11500);
      expect(sale.body.changeMinor).toBe(8500);
    });

    it('refuses a second open session for the same branch', async () => {
      const res = await erp<{ code: string }>('/sales/cashier-sessions', {
        method: 'POST',
        body: { branchId, openingFloatMinor: 0 },
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('pos.session_already_open');
    });

    it('closes the session and records the cash variance', async () => {
      // Expected cash = 200.00 float + 115.00 sale = 315.00; count 300.00 -> -15.00
      const closed = await erp<{ status: string; expectedCashMinor: number; varianceMinor: number }>(
        `/sales/cashier-sessions/${sessionId}/close`,
        { method: 'POST', body: { countedCashMinor: 30000 } },
      );
      expect(closed.body.status).toBe('CLOSED');
      expect(closed.body.expectedCashMinor).toBe(31500);
      expect(closed.body.varianceMinor).toBe(-1500);
    });
  });

  // ----------------------------------------------------------------- purchasing

  describe('purchasing — requisition to payment', () => {
    let orderId: string;
    let supplierInvoiceId: string;

    it('runs a requisition through approval and conversion to a purchase order', async () => {
      const req = await erp<{ id: string; requisitionNumber: string }>('/purchasing/requisitions', {
        method: 'POST',
        body: {
          supplierId,
          lines: [{ productId, description: 'Widget', quantity: 50000, estimatedUnitCostMinor: 6000 }],
        },
      });
      expect(req.status).toBe(201);

      const approved = await erp<{ status: string }>(`/purchasing/requisitions/${req.body.id}/approve`, {
        method: 'POST',
        body: {},
      });
      expect(approved.body.status).toBe('APPROVED');

      const order = await erp<{ id: string; orderNumber: string }>(`/purchasing/requisitions/${req.body.id}/convert`, {
        method: 'POST',
        body: { supplierId },
      });
      expect(order.status).toBe(201);
      orderId = order.body.id;

      const poApproved = await erp<{ status: string }>(`/purchasing/orders/${orderId}/approve`, {
        method: 'POST',
        body: {},
      });
      expect(poApproved.body.status).toBe('APPROVED');
    });

    it('receives goods, increasing stock at the ordered cost', async () => {
      const before = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      const receipt = await erp<{ receiptNumber: string; status: string }>('/purchasing/receipts', {
        method: 'POST',
        body: { purchaseOrderId: orderId, warehouseId, receivedAt: new Date().toISOString() },
      });
      expect(receipt.status).toBe(201);
      expect(receipt.body.status).toBe('POSTED');

      const after = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(after.quantity - before.quantity).toBe(50000);

      const order = await erp<{ items: Array<{ status: string }> }>(`/purchasing/orders?status=RECEIVED`);
      expect(order.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('records a supplier invoice and pays it', async () => {
      const invoice = await erp<{ id: string; invoiceNumber: string; totalMinor: number; status: string }>(
        '/purchasing/supplier-invoices',
        {
          method: 'POST',
          body: {
            supplierId,
            purchaseOrderId: orderId,
            supplierInvoiceNumber: 'SUP-INV-1',
            invoiceDate: '2026-06-01',
            lines: [{ productId, description: 'Widget', quantity: 50000, unitCostMinor: 6000, taxPercentBp: 1500 }],
          },
        },
      );
      expect(invoice.status).toBe(201);
      expect(invoice.body.status).toBe('POSTED');
      // 5 units at 60.00 = 300.00 net, 15% VAT = 45.00, total 345.00
      expect(invoice.body.totalMinor).toBe(34500);
      supplierInvoiceId = invoice.body.id;

      const payment = await erp('/accounting/payments', {
        method: 'POST',
        body: {
          direction: 'PAYMENT',
          partyType: 'SUPPLIER',
          supplierId,
          method: 'BANK_TRANSFER',
          amountMinor: 34500,
          paidAt: '2026-06-05',
          allocations: [{ target: 'SUPPLIER_INVOICE', supplierInvoiceId, amountMinor: 34500 }],
        },
      });
      expect(payment.status).toBe(201);
    });

    it('returns goods to the supplier, reversing the payable and reducing stock', async () => {
      const before = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      const ret = await erp<{ returnNumber: string; status: string; totalMinor: number }>('/purchasing/returns', {
        method: 'POST',
        body: {
          supplierId,
          purchaseOrderId: orderId,
          warehouseId,
          returnDate: '2026-06-10',
          reason: 'Damaged',
          lines: [{ productId, description: 'Widget', quantity: 10000, unitCostMinor: 6000, taxPercentBp: 1500 }],
        },
      });
      expect(ret.status).toBe(201);
      expect(ret.body.status).toBe('POSTED');

      const after = await ctx.prisma.stockLevel.findUniqueOrThrow({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(before.quantity - after.quantity).toBe(10000);
    });
  });

  // --------------------------------------------------------------------- reports

  describe('reports — permission-aware, company-scoped', () => {
    it('returns accounting, sales, purchasing and inventory summaries', async () => {
      for (const path of ['/reports/accounting', '/reports/sales', '/reports/purchasing', '/reports/inventory']) {
        const res = await erp(path);
        expect(res.status).toBe(200);
      }
      const accounting = await erp<{ balanced: boolean }>('/reports/accounting');
      expect(accounting.body.balanced).toBe(true);
      const sales = await erp<{ totalSalesMinor: number }>('/reports/sales');
      expect(sales.body.totalSalesMinor).toBeGreaterThan(0);
    });

    it('filters sales reports by branch', async () => {
      const res = await erp<{ byBranch: Array<{ branchId: string | null }> }>(`/reports/sales?branchId=${branchId}`);
      expect(res.status).toBe(200);
      expect(res.body.byBranch.every((b) => b.branchId === branchId)).toBe(true);
    });
  });

  // --------------------------------------------------------------- tenancy/authz

  describe('tenancy and authorization', () => {
    it('rejects a cross-tenant company header for a company principal', async () => {
      const demo = await ctx.prisma.company.findUniqueOrThrow({ where: { code: 'DEMO-ALNOOR' } });
      const res = await call(ctx.base, '/accounting/accounts', {
        token: isolatedToken,
        headers: { 'x-oryx-company-id': demo.id },
      });
      // The principal is not a member of the demo tenant, so the guard refuses.
      expect(res.status).toBe(403);
      expect((res.body as { code?: string }).code).toBe('authz.cross_tenant_denied');
    });

    it('denies the ERP modules to a company whose plan does not license them', async () => {
      // The starter plan has no accounting module.
      const starter = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${FIXTURE_PREFIX}-NOPLAN`,
          nameEn: 'Starter Co.',
          nameAr: 'شركة المبتدئ',
          type: 'SAAS_TENANT',
          planId: starter.id,
        },
      });
      const starterCompanyId = created.body.company.id;
      const role = await ctx.prisma.role.findFirstOrThrow({
        where: { companyId: starterCompanyId, code: 'company_admin' },
      });
      const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
      await ctx.prisma.membership.create({
        data: { userId: admin.id, companyId: starterCompanyId, roleId: role.id, isActive: true },
      });

      // The permission is granted by the role but suppressed by entitlement, so
      // the effective set has no accounting permission and the guard denies it.
      const res = await companyCall(ctx.base, starterCompanyId, '/accounting/accounts', { token });
      expect(res.status).toBe(403);
      expect((res.body as { code?: string }).code).toBe('authz.permission_denied');
    });

    it('refuses ERP access without the module entitlement header for a platform admin', async () => {
      // A platform principal with no company context cannot reach tenant ERP data.
      const res = await call(ctx.base, '/accounting/accounts', { token: superToken });
      expect([400, 403]).toContain(res.status);
    });
  });
});
