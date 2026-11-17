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

/**
 * Point-of-sale returns at the till.
 *
 * A sale must deduct stock from the warehouse it was taken from; an approved
 * return must restore exactly that stock and issue a refund credit note whose
 * total never exceeds what was charged. A partial return leaves the rest of the
 * receipt sold, and the same goods can never be refunded twice.
 */
describe('ORYX POS returns (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let tenantId: string;
  let branchId: string;
  let warehouseId: string;
  let productId: string;
  const code = `${FIXTURE_PREFIX}-POSRET`;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  const stockOf = async (): Promise<number> => {
    const level = await ctx.prisma.stockLevel.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId, productId } },
    });
    return level.quantity;
  };

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
        nameEn: 'POS Return Fixture Co.',
        nameAr: 'شركة اختبار إرجاع نقاط البيع',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({
      where: { companyId: tenantId, code: 'company_admin' },
    });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });

    const branch = await ctx.prisma.branch.create({
      data: { companyId: tenantId, code: `${FIXTURE_PREFIX}-POSBR`, nameEn: 'Main', nameAr: 'الرئيسي' },
    });
    branchId = branch.id;

    // Posting needs a chart and an open fiscal period.
    const seedChart = await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    expect(seedChart.status).toBe(201);
    const year = new Date().getUTCFullYear();
    const fiscal = await erp('/accounting/fiscal-years', {
      method: 'POST',
      body: { code: `FY${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
    });
    expect(fiscal.status).toBe(201);

    const wh = await erp<{ id: string }>('/inventory/warehouses', {
      method: 'POST',
      body: { code: 'MAIN', nameEn: 'Main warehouse', nameAr: 'المستودع الرئيسي', branchId },
    });
    warehouseId = wh.body.id;

    const product = await erp<{ id: string }>('/inventory/products', {
      method: 'POST',
      body: {
        sku: 'POS-WIDGET',
        nameEn: 'POS Widget',
        nameAr: 'قطعة نقطة بيع',
        salesPriceMinor: 10000,
        costPriceMinor: 6000,
        taxRateBp: 1500,
      },
    });
    productId = product.body.id;

    // Opening stock: 10 units.
    const receive = await erp('/inventory/movements', {
      method: 'POST',
      body: {
        warehouseId,
        productId,
        direction: 'IN',
        quantity: 100000,
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

  let sessionId: string;

  it('opens a cashier session', async () => {
    const session = await erp<{ id: string; status: string }>('/sales/cashier-sessions', {
      method: 'POST',
      body: { branchId, warehouseId, openingFloatMinor: 0 },
    });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
  });

  let saleId: string;
  let firstLineId: string;
  let secondLineId: string;

  it('sells two lines and deducts the stock from the warehouse', async () => {
    const before = await stockOf();
    const sale = await erp<{
      id: string;
      status: string;
      totalMinor: number;
      lines: Array<{ id: string; quantity: number; returnedQuantity: number }>;
    }>('/sales/pos-sales', {
      method: 'POST',
      body: {
        branchId,
        cashierSessionId: sessionId,
        warehouseId,
        paymentMethod: 'CASH',
        paidMinor: 100000,
        lines: [
          { productId, description: 'POS Widget', quantity: 20000, unitPriceMinor: 10000, taxPercentBp: 1500 },
          { productId, description: 'POS Widget', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 1500 },
        ],
      },
    });
    expect(sale.status).toBe(201);
    saleId = sale.body.id;
    firstLineId = sale.body.lines[0].id;
    secondLineId = sale.body.lines[1].id;
    // 3 units × 100.00 = 300.00 + 15% VAT = 345.00.
    expect(sale.body.totalMinor).toBe(34500);

    const after = await stockOf();
    expect(after).toBe(before - 30000);
  });

  it('refuses a return of more than was sold', async () => {
    const res = await erp<{ code: string }>(`/sales/pos-sales/${saleId}/return`, {
      method: 'POST',
      body: { lines: [{ posSaleLineId: firstLineId, quantity: 50000 }] },
    });
    expect(res.status).toBe(400);
  });

  it('returns part of the receipt, restores the stock and issues a credit note', async () => {
    const before = await stockOf();
    const res = await erp<{
      sale: { status: string; returnCreditNoteId: string | null; lines: Array<{ returnedQuantity: number }> };
      creditNoteId: string;
      totalMinor: number;
    }>(`/sales/pos-sales/${saleId}/return`, {
      method: 'POST',
      body: { lines: [{ posSaleLineId: firstLineId, quantity: 10000 }] },
    });
    expect(res.status).toBe(201);
    // One unit returned: 100.00 + 15% VAT = 115.00.
    expect(res.body.totalMinor).toBe(11500);
    expect(res.body.sale.status).toBe('PARTIALLY_RETURNED');
    expect(res.body.sale.returnCreditNoteId).toBeTruthy();
    expect(res.body.sale.lines[0].returnedQuantity).toBe(10000);
    // The remaining line is untouched.
    expect(res.body.sale.lines[1].returnedQuantity).toBe(0);

    const after = await stockOf();
    expect(after).toBe(before + 10000);

    // The credit note is posted and carries the refund.
    const note = await ctx.prisma.creditNote.findUniqueOrThrow({
      where: { id: res.body.creditNoteId },
      include: { lines: true },
    });
    expect(note.status).toBe('POSTED');
    expect(note.restockInventory).toBe(true);
    expect(note.refundMethod).toBe('CASH');
    expect(note.journalEntryId).toBeTruthy();
  });

  it('refuses to return the same unit twice', async () => {
    const res = await erp<{ code: string }>(`/sales/pos-sales/${saleId}/return`, {
      method: 'POST',
      body: { lines: [{ posSaleLineId: firstLineId, quantity: 20000 }] },
    });
    expect(res.status).toBe(400);
  });

  it('returns the remainder, marks the receipt returned and restores the stock', async () => {
    const before = await stockOf();
    const res = await erp<{ sale: { status: string } }>(`/sales/pos-sales/${saleId}/return`, {
      method: 'POST',
      body: {
        refundMethod: 'CASH',
        lines: [
          { posSaleLineId: firstLineId, quantity: 10000 },
          { posSaleLineId: secondLineId, quantity: 10000 },
        ],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.status).toBe('RETURNED');

    const after = await stockOf();
    expect(after).toBe(before + 20000);

    // A fully returned receipt cannot be returned again.
    const again = await erp<{ code: string }>(`/sales/pos-sales/${saleId}/return`, {
      method: 'POST',
      body: { lines: [{ posSaleLineId: firstLineId, quantity: 10000 }] },
    });
    expect(again.status).toBe(400);
  });

  it('keeps the stock when the operator declines to restock damaged goods', async () => {
    const sale = await erp<{ id: string; lines: Array<{ id: string }> }>('/sales/pos-sales', {
      method: 'POST',
      body: {
        branchId,
        cashierSessionId: sessionId,
        warehouseId,
        paymentMethod: 'CARD',
        lines: [{ productId, description: 'POS Widget', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 0 }],
      },
    });
    expect(sale.status).toBe(201);

    const before = await stockOf();
    const res = await erp<{ sale: { status: string } }>(`/sales/pos-sales/${sale.body.id}/return`, {
      method: 'POST',
      body: { restockInventory: false, lines: [{ posSaleLineId: sale.body.lines[0].id, quantity: 10000 }] },
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.status).toBe('RETURNED');
    // Damaged goods are refunded but not put back on the shelf.
    expect(await stockOf()).toBe(before);
  });
});
