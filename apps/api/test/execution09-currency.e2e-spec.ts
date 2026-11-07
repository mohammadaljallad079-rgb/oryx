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
 * Execution 09 — company-resolved currency and country defaults.
 *
 * Execution 09's correction was that ERP defaults were hard-coded to `SA`/`SAR`.
 * A tenant that operates in Bahrain therefore produced Saudi-denominated
 * customers, suppliers, quotations, invoices and payroll, and — worse — its
 * journals and cashier sessions were booked in a currency the company does not
 * use. This suite proves the defaults now follow the tenant's own record while
 * an explicit override still wins, so multi-country/multi-currency data is not
 * collapsed to one value.
 */
describe('Execution 09 — company currency and country defaults (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let tenantId: string;
  const code = `${FIXTURE_PREFIX}-FX`;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    // A UAE tenant with a two-decimal currency: distinct from both the launch
    // market (BHD) and the old hard-coded default (SAR).
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code,
        nameEn: 'Execution 09 Currency Co.',
        nameAr: 'شركة اختبار العملة',
        type: 'SAAS_TENANT',
        countryCode: 'AE',
        currency: 'AED',
        planId: enterprise.id,
      },
    });
    expect(created.status).toBe(201);
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({
      where: { companyId: tenantId, code: 'company_admin' },
    });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });

    await ctx.prisma.branch.create({
      data: { companyId: tenantId, code: `${FIXTURE_PREFIX}-FX-BR`, nameEn: 'Main', nameAr: 'الرئيسي', countryCode: 'AE' },
    });
  });

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  });

  it('provisions the tenant with its own currency and country', async () => {
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: tenantId } });
    expect(company.currency).toBe('AED');
    expect(company.countryCode).toBe('AE');
  });

  it('defaults a new customer to the tenant currency and country, not SA/SAR', async () => {
    const res = await erp<{ id: string; currency: string; countryCode: string | null }>('/sales/customers', {
      method: 'POST',
      body: { code: 'FX-C1', nameEn: 'Gulf Customer', nameAr: 'عميل الخليج' },
    });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe('AED');
    expect(res.body.countryCode).toBe('AE');

    const row = await ctx.prisma.customer.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.currency).toBe('AED');
    expect(row.countryCode).toBe('AE');
  });

  it('still honours an explicit currency on a customer (no over-correction)', async () => {
    const res = await erp<{ id: string; currency: string }>('/sales/customers', {
      method: 'POST',
      body: { code: 'FX-C2', nameEn: 'USD Customer', nameAr: 'عميل دولار', currency: 'USD', countryCode: 'US' },
    });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe('USD');
    const row = await ctx.prisma.customer.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.currency).toBe('USD');
    expect(row.countryCode).toBe('US');
  });

  it('defaults a new supplier to the tenant currency and country', async () => {
    const res = await erp<{ id: string; currency: string; countryCode: string | null }>('/purchasing/suppliers', {
      method: 'POST',
      body: { code: 'FX-S1', nameEn: 'Gulf Supplier', nameAr: 'مورد الخليج' },
    });
    expect(res.status).toBe(201);
    expect(res.body.currency).toBe('AED');
    expect(res.body.countryCode).toBe('AE');
  });

  it('books an issued invoice and its journal in the tenant currency', async () => {
    const seedChart = await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    expect(seedChart.status).toBe(201);

    const year = new Date().getUTCFullYear();
    const fy = await erp('/accounting/fiscal-years', {
      method: 'POST',
      body: { code: `FY-${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
    });
    expect([200, 201]).toContain(fy.status);

    const wh = await erp<{ id: string }>('/inventory/warehouses', {
      method: 'POST',
      body: { code: 'FX-WH', nameEn: 'Main warehouse', nameAr: 'المستودع الرئيسي' },
    });
    expect(wh.status).toBe(201);

    const product = await erp<{ id: string }>('/inventory/products', {
      method: 'POST',
      body: {
        sku: 'FX-SKU',
        nameEn: 'Service Part',
        nameAr: 'قطعة خدمة',
        salesPriceMinor: 100000,
        costPriceMinor: 60000,
        taxRateBp: 500,
        reorderLevel: 0,
        reorderQuantity: 0,
      },
    });
    expect(product.status).toBe(201);

    const customer = await ctx.prisma.customer.findFirstOrThrow({ where: { companyId: tenantId, code: 'FX-C1' } });

    const invoice = await erp<{ id: string; currency: string }>('/sales/invoices', {
      method: 'POST',
      body: {
        customerId: customer.id,
        invoiceDate: `${year}-06-01`,
        lines: [{ productId: product.body.id, description: 'Service', quantity: 10000, unitPriceMinor: 100000 }],
      },
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.currency).toBe('AED');

    const row = await ctx.prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.body.id } });
    expect(row.currency).toBe('AED');

    const journal = await ctx.prisma.journalEntry.findFirst({
      where: { companyId: tenantId, sourceType: 'SALES_INVOICE', sourceId: invoice.body.id },
    });
    expect(journal).not.toBeNull();
    expect(journal?.currency).toBe('AED');
  });

  it('books a manual journal in the tenant currency when the caller supplies none', async () => {
    const year = new Date().getUTCFullYear();
    const account = await ctx.prisma.account.findFirstOrThrow({
      where: { companyId: tenantId, isPostable: true },
    });

    const res = await erp<{ id: string; currency: string }>('/accounting/journals', {
      method: 'POST',
      body: {
        entryDate: `${year}-06-15`,
        memo: 'Execution 09 currency default check',
        lines: [
          { accountId: account.id, debitMinor: 1000 },
          { accountId: account.id, creditMinor: 1000 },
        ],
      },
    });
    expect(res.status).toBe(201);

    const row = await ctx.prisma.journalEntry.findFirstOrThrow({
      where: { companyId: tenantId, memo: 'Execution 09 currency default check' },
    });
    expect(row.currency).toBe('AED');
  });

  it('keeps an explicit journal currency when one is given', async () => {
    const year = new Date().getUTCFullYear();
    const account = await ctx.prisma.account.findFirstOrThrow({
      where: { companyId: tenantId, isPostable: true },
    });

    const res = await erp('/accounting/journals', {
      method: 'POST',
      body: {
        entryDate: `${year}-06-16`,
        memo: 'Execution 09 explicit currency check',
        currency: 'USD',
        lines: [
          { accountId: account.id, debitMinor: 2000 },
          { accountId: account.id, creditMinor: 2000 },
        ],
      },
    });
    expect(res.status).toBe(201);

    const row = await ctx.prisma.journalEntry.findFirstOrThrow({
      where: { companyId: tenantId, memo: 'Execution 09 explicit currency check' },
    });
    expect(row.currency).toBe('USD');
  });
});
