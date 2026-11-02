import {
  SEED_ORYX_AUTO_ADMIN,
  call,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Execution 16 — the sales document date contract.
 *
 * Every sales document declares its own date property and the API runs with
 * `forbidNonWhitelisted`, so a payload carrying a property the DTO does not
 * declare is rejected outright. The admin modal used to send `issueDate`,
 * `invoiceDate` and `orderDate` on every document, which made *all four* create
 * forms fail with `property issueDate should not exist`.
 *
 * This suite pins the contract per document type and proves the rejection still
 * fires — the fix was to send the right field, not to relax validation.
 */
describe('Execution 16 — sales document date contract (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let companyId: string;
  let customerId: string;
  let warehouseId: string;
  let productId: string;
  let salesPriceMinor: number;
  let taxRateBp: number;
  const now = new Date('2026-03-04T09:00:00.000Z').toISOString();

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, companyId, path, { ...options, token });

  const line = (extra: Record<string, unknown> = {}) => ({
    productId,
    description: 'Contract line',
    quantity: 20000,
    unitPriceMinor: salesPriceMinor,
    taxPercentBp: taxRateBp,
    ...extra,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    const me = await call<{ context: { companyId: string | null } }>(ctx.base, '/auth/me', { token });
    companyId = me.body.context.companyId!;

    const customers = await erp<{ items: Array<{ id: string }> }>('/sales/customers?pageSize=1');
    customerId = customers.body.items[0].id;

    const warehouses = await erp<{ items: Array<{ id: string }> }>('/inventory/warehouses?pageSize=1');
    warehouseId = warehouses.body.items[0].id;

    const products = await erp<{ items: Array<{ id: string; salesPriceMinor: number; taxRateBp: number }> }>(
      '/inventory/products?pageSize=1',
    );
    productId = products.body.items[0].id;
    salesPriceMinor = products.body.items[0].salesPriceMinor;
    taxRateBp = products.body.items[0].taxRateBp;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('accepts the canonical documentDate on every document type', async () => {
    const quotation = await erp<{ id: string }>('/sales/quotations', {
      method: 'POST',
      body: { customerId, documentDate: now, lines: [line()] },
    });
    expect(quotation.status).toBe(201);

    const order = await erp<{ id: string; totalMinor: number }>('/sales/orders', {
      method: 'POST',
      body: { customerId, warehouseId, documentDate: now, confirm: true, lines: [line()] },
    });
    expect(order.status).toBe(201);
    expect(order.body.totalMinor).toBeGreaterThan(0);

    const invoice = await erp<{ id: string; totalMinor: number }>('/sales/invoices', {
      method: 'POST',
      body: { customerId, warehouseId, documentDate: now, issueStock: false, lines: [line()] },
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.totalMinor).toBeGreaterThan(0);

    const creditNote = await erp<{ id: string }>('/sales/credit-notes', {
      method: 'POST',
      body: { customerId, invoiceId: invoice.body.id, warehouseId, documentDate: now, restockInventory: false, lines: [line()] },
    });
    expect(creditNote.status).toBe(201);
  });

  it('still accepts each historical per-document date name as an alias', async () => {
    const quotation = await erp<{ id: string }>('/sales/quotations', {
      method: 'POST',
      body: { customerId, issueDate: now, lines: [line()] },
    });
    expect(quotation.status).toBe(201);

    const order = await erp<{ id: string }>('/sales/orders', {
      method: 'POST',
      body: { customerId, warehouseId, orderDate: now, confirm: true, lines: [line()] },
    });
    expect(order.status).toBe(201);

    const invoice = await erp<{ id: string }>('/sales/invoices', {
      method: 'POST',
      body: { customerId, warehouseId, invoiceDate: now, issueStock: false, lines: [line()] },
    });
    expect(invoice.status).toBe(201);
  });

  it('accepts all four date names at once, so a shared form cannot 400', async () => {
    const accepted = await erp<{ id: string }>('/sales/invoices', {
      method: 'POST',
      body: {
        customerId,
        warehouseId,
        documentDate: now,
        issueDate: now,
        orderDate: now,
        invoiceDate: now,
        issueStock: false,
        lines: [line()],
      },
    });
    expect(accepted.status).toBe(201);
  });

  it('rejects a document with no date at all', async () => {
    const rejected = await erp<{ statusCode: number }>('/sales/invoices', {
      method: 'POST',
      body: { customerId, warehouseId, lines: [line()] },
    });
    expect(rejected.status).toBe(400);
  });

  it('rejects a malformed date, so the validator is still on', async () => {
    const rejected = await erp<{ statusCode: number }>('/sales/invoices', {
      method: 'POST',
      body: { customerId, warehouseId, documentDate: 'not-a-date', lines: [line()] },
    });
    expect(rejected.status).toBe(400);
  });

  it('totals a multi-line invoice from its own lines, in minor units', async () => {
    const quantity = 30000;
    const invoice = await erp<{ subtotalMinor: number; taxMinor: number; totalMinor: number }>('/sales/invoices', {
      method: 'POST',
      body: {
        customerId,
        warehouseId,
        invoiceDate: now,
        issueStock: false,
        lines: [line({ quantity }), line({ quantity, unitPriceMinor: salesPriceMinor * 2 })],
      },
    });
    expect(invoice.status).toBe(201);
    // quantity is 10^4-scaled: 30000 → 3 units.
    const expectedSubtotal = 3 * salesPriceMinor + 3 * (salesPriceMinor * 2);
    expect(invoice.body.subtotalMinor).toBe(expectedSubtotal);
    expect(invoice.body.totalMinor).toBe(expectedSubtotal + invoice.body.taxMinor);
  });
});
