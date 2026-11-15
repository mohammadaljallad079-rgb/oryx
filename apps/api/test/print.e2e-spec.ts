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
 * Sales document print model (Execution 20).
 *
 * The print route resolves a printable model from a document's own persisted
 * rows. This suite exercises the real HTTP surface, guards and Prisma layer:
 *
 *  - a sales invoice resolves to a complete model carrying the approved form's
 *    fields (order date, payment line, salesperson, seller TRN/CR, party);
 *  - a credit note (return voucher) and a quotation resolve from their own rows;
 *  - the route is tenant-scoped: a principal of another company is refused;
 *  - an unknown id is a 404, never a 500.
 */

interface PrintModel {
  kind: string;
  documentNumber: string;
  titleEn: string;
  titleAr: string;
  issueDateLabel: string;
  issueDateValue: string;
  secondaryDateLabel: string | null;
  staffName: string;
  paymentLabel: string | null;
  paymentValue: string | null;
  company: { taxNumber: string | null; crNumber: string | null; addressLine: string | null; city: string | null };
  party: { name: string; taxNumber: string | null };
  lines: Array<{ description: string; quantity: string; unitPrice: string; amount: string }>;
  totals: { untaxedAmount: string; taxAmount: string; discount: string; total: string };
  amountInWords: string;
  currency: string;
}

describe('sales document print model (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let tenantId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;
  let invoiceId: string;
  let creditNoteId: string;
  let quotationId: string;

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
        code: `${FIXTURE_PREFIX}-PRINT`,
        nameEn: 'Print Fixture Co.',
        nameAr: 'شركة اختبار الطباعة',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
        // The amounts below are written for a two-decimal currency.
        currency: 'SAR',
        countryCode: 'SA',
      },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });

    // The letterhead the approved form carries is the company's own GENERAL
    // settings, so the fixture writes them the way an operator would.
    await erp('/settings/GENERAL', {
      method: 'PATCH',
      body: {
        value: {
          companyNameEn: 'Print Fixture Co.',
          companyNameAr: 'شركة اختبار الطباعة',
          taxNumber: '300000000000003',
          crNumber: '9000000009',
          addressLine: 'Building 1, Road 2, Block 3, Riyadh',
          city: 'Riyadh',
          contactPhone: '+966 11 111 2222',
          currency: 'SAR',
          timezone: 'Asia/Riyadh',
        },
      },
    });

    await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    await erp('/accounting/fiscal-years', {
      method: 'POST',
      body: { code: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' },
    });

    const wh = await erp<{ id: string }>('/inventory/warehouses', {
      method: 'POST',
      body: { code: 'MAIN', nameEn: 'Main warehouse', nameAr: 'المستودع الرئيسي' },
    });
    warehouseId = wh.body.id;

    const product = await erp<{ id: string }>('/inventory/products', {
      method: 'POST',
      body: { sku: 'PRINT-1', nameEn: 'Brake Pad Set', nameAr: 'طقم فحمات فرامل', salesPriceMinor: 7500, costPriceMinor: 4000, taxRateBp: 1000 },
    });
    productId = product.body.id;

    await erp('/inventory/movements', {
      method: 'POST',
      body: { warehouseId, productId, direction: 'IN', quantity: 1000000, unitCostMinor: 4000, occurredAt: '2026-05-01' },
    });

    const customer = await erp<{ id: string }>('/sales/customers', {
      method: 'POST',
      body: {
        code: 'PC1',
        nameEn: 'Al Haddad Trading',
        nameAr: 'الحضادة للتجارة',
        taxNumber: '200001111222111',
        phone: '37702020',
        addressLine: 'Villa 1455, road 5455, block 555',
        city: 'Riyadh',
        countryCode: 'SA',
      },
    });
    customerId = customer.body.id;

    const invoice = await erp<{ id: string }>('/sales/invoices', {
      method: 'POST',
      body: {
        customerId,
        invoiceDate: '2026-05-02',
        warehouseId,
        paymentMethod: 'WALLET',
        salespersonName: 'Hussain Alhaddad',
        lines: [
          { productId, description: 'Oil (Havoline 5w20)', quantity: 10000, unitPriceMinor: 750, taxPercentBp: 1000 },
          { productId, description: 'Oil filter Mazda - original', quantity: 10000, unitPriceMinor: 200, taxPercentBp: 1000 },
        ],
      },
    });
    expect(invoice.status).toBe(201);
    invoiceId = invoice.body.id;

    const creditNote = await erp<{ id: string }>('/sales/credit-notes', {
      method: 'POST',
      body: {
        customerId,
        invoiceId,
        issueDate: '2026-05-04',
        warehouseId,
        reason: 'Returned one filter',
        lines: [{ productId, description: 'Oil filter Mazda - original', quantity: 10000, unitPriceMinor: 200, taxPercentBp: 1000 }],
      },
    });
    expect(creditNote.status).toBe(201);
    creditNoteId = creditNote.body.id;

    const quotation = await erp<{ id: string }>('/sales/quotations', {
      method: 'POST',
      body: {
        customerId,
        issueDate: '2026-05-05',
        validUntil: '2026-05-20',
        salespersonName: 'Hussain Alhaddad',
        lines: [{ productId, description: 'Brake Pad Set', quantity: 10000, unitPriceMinor: 7500, taxPercentBp: 1000 }],
      },
    });
    expect(quotation.status).toBe(201);
    quotationId = quotation.body.id;
  }, 120_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  it('resolves a sales invoice with every field the approved form needs', async () => {
    const res = await erp<PrintModel>(`/print/SALES_INVOICE/${invoiceId}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('SALES_INVOICE');
    expect(res.body.titleEn).toBe('INVOICE');
    expect(res.body.titleAr).toBe('فاتورة');
    // The approved invoice prints its date as "Order Date" with a weekday and a
    // 12-hour clock, and carries no second (due) date row.
    expect(res.body.issueDateLabel).toBe('Order Date');
    expect(res.body.issueDateValue).toMatch(/^\w{3} \d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (AM|PM)$/);
    expect(res.body.secondaryDateLabel).toBeNull();
    expect(res.body.party.name).toBe('Al Haddad Trading');
    expect(res.body.party.taxNumber).toBe('200001111222111');
    // The seller's registration numbers the navy band prints come from the company.
    expect(res.body.company.taxNumber).toBe('300000000000003');
    expect(res.body.company.crNumber).toBe('9000000009');
    expect(res.body.company.addressLine).toBe('Building 1, Road 2, Block 3, Riyadh');
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0].description).toBe('Oil (Havoline 5w20)');
    // 7.50 + 2.00 = 9.50 net, 10% VAT = 0.95, total 10.45
    expect(res.body.totals.untaxedAmount).toBe('9.50 SAR');
    expect(res.body.totals.total).toBe('10.45 SAR');
    expect(res.body.amountInWords).toContain('Saudi Riyal');
    // The approved invoice prints a "Payment" line naming the settlement method
    // stored on the invoice itself.
    expect(res.body.paymentLabel).toBe('Payment');
    expect(res.body.paymentValue).toBe('Benefit Pay');
    expect(res.body.staffName).toBe('Hussain Alhaddad');
  });

  it('resolves a credit note (return voucher) from its own rows', async () => {
    const res = await erp<PrintModel>(`/print/CREDIT_NOTE/${creditNoteId}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('CREDIT_NOTE');
    expect(res.body.titleAr).toBe('إشعار دائن');
    expect(res.body.issueDateLabel).toBe('Issue Date');
    expect(res.body.party.name).toBe('Al Haddad Trading');
    expect(res.body.lines).toHaveLength(1);
    // 2.00 net + 10% VAT = 2.20
    expect(res.body.totals.total).toBe('2.20 SAR');
  });

  it('resolves a quotation with its expiration date', async () => {
    const res = await erp<PrintModel>(`/print/QUOTATION/${quotationId}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('QUOTATION');
    expect(res.body.titleAr).toBe('تسعيرة');
    expect(res.body.secondaryDateLabel).toBe('Expiration Date');
    expect(res.body.secondaryDateLabel).toBeTruthy();
  });

  it('resolves a receipt with the name printed on the "Received By" line', async () => {
    const payment = await erp<{ id: string; paymentNumber: string }>('/accounting/payments', {
      method: 'POST',
      body: {
        direction: 'RECEIPT',
        partyType: 'CUSTOMER',
        customerId,
        method: 'CASH',
        amountMinor: 1045,
        paidAt: '2026-05-03',
        receivedByName: 'Cashier Fatima',
      },
    });
    expect(payment.status).toBe(201);

    const res = await erp<PrintModel>(`/print/RECEIPT/${payment.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('RECEIPT');
    expect(res.body.titleAr).toBe('سند قبض');
    expect(res.body.documentNumber).toBe(payment.body.paymentNumber);
    expect(res.body.party.name).toBe('Al Haddad Trading');
    // The printed slip names who took the money.
    expect(res.body.staffName).toBe('Cashier Fatima');
    // 10.45 SAR at a two-decimal scale, printed with the currency's own symbol.
    expect(res.body.totals.total).toBe('10.45 SAR');
  });

  it('refuses an unknown document id without a 500', async () => {
    const res = await erp('/print/SALES_INVOICE/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('refuses a cross-tenant read for a principal of another company', async () => {
    const other = await ctx.prisma.company.findFirstOrThrow({ where: { code: 'ORYX-AUTO' } });
    const denied = await companyCall(ctx.base, other.id, `/print/SALES_INVOICE/${invoiceId}`, { token });
    expect([403, 404]).toContain(denied.status);
  });
});
