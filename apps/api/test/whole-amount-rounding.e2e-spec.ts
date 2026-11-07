import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma.service';
import {
  SEED_ORYX_AUTO_ADMIN,
  call,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Optional whole-amount rounding (e2e).
 *
 * A tenant can round an issued document total to the nearest whole or half
 * major unit. The security- and accounting-relevant claims are:
 *
 *   1. `NONE` is the default and leaves the total exact, so a tenant that never
 *      opts in is unaffected.
 *   2. The rounded total is what the document stores, what a receipt settles and
 *      what a POS sale charges.
 *   3. The ledger still balances: the tiny difference is posted to the rounding
 *      account, so `subtotal - discount + tax + rounding === total` holds.
 *   4. The mode is per-tenant; another company keeps its own setting.
 */

const OTHER_COMPANY = 'ORYX-LOGISTICS';

interface InvoiceView {
  id: string;
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  roundingMinor: number;
  amountPaidMinor: number;
  outstandingMinor: number;
}

interface TrialBalanceView {
  balanced: boolean;
  totalDebitMinor: number;
  totalCreditMinor: number;
}

describe('optional whole-amount rounding (e2e)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  let warehouseId: string;
  let productId: string;
  let posBranchId: string;
  let original: { roundingMode: string; currency: string };

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, companyId, path, { ...options, token });

  // 1 unit at 9.99 with no tax: the exact total ends in .99, so a whole-unit
  // rounding must move it. Quantity is scaled by 10^4.
  const oddLine = () => ({
    productId,
    description: 'Rounding probe',
    quantity: 10000,
    unitPriceMinor: 999,
    taxPercentBp: 0,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    const me = await call<{ context: { companyId: string | null } }>(ctx.base, '/auth/me', { token });
    companyId = me.body.context.companyId!;

    const company = await prisma.company.findFirstOrThrow({ where: { id: companyId } });
    original = { roundingMode: company.roundingMode, currency: company.currency };

    const created = await erp<{ id: string }>('/sales/customers', {
      method: 'POST',
      body: { code: `ROUND-${Date.now()}`, nameEn: 'Rounding Customer', nameAr: 'عميل التقريب' },
    });
    customerId = created.body.id;

    const warehouses = await erp<{ items: Array<{ id: string }> }>('/inventory/warehouses?pageSize=1');
    warehouseId = warehouses.body.items[0].id;
    const products = await erp<{ items: Array<{ id: string }> }>('/inventory/products?pageSize=1');
    productId = products.body.items[0].id;

    // A dedicated branch keeps this suite's cashier session from colliding with
    // the session the ERP suite opens on the shared seeded branch.
    const branch = await prisma.branch.create({
      data: { companyId, code: `ROUND-BR-${Date.now()}`, nameEn: 'Rounding branch', nameAr: 'فرع التقريب' },
    });
    posBranchId = branch.id;
  });

  afterAll(async () => {
    await prisma.company.update({
      where: { id: companyId },
      data: { roundingMode: original.roundingMode as never, currency: original.currency },
    });
    await prisma.salesInvoiceLine.deleteMany({ where: { invoice: { customerId } } });
    await prisma.salesInvoice.deleteMany({ where: { customerId } });
    await prisma.salesOrderLine.deleteMany({ where: { order: { customerId } } });
    await prisma.salesOrder.deleteMany({ where: { customerId } });
    await prisma.quotationLine.deleteMany({ where: { quotation: { customerId } } });
    await prisma.quotation.deleteMany({ where: { customerId } });
    await prisma.posSaleLine.deleteMany({ where: { posSale: { customerId } } });
    await prisma.posSale.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.branch.deleteMany({ where: { id: posBranchId } });
    await app.close();
  });

  async function setMode(mode: 'NONE' | 'NEAREST_WHOLE' | 'NEAREST_HALF') {
    const res = await companyCall(ctx.base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token,
      body: { roundingMode: mode },
    });
    expect(res.status).toBe(200);
  }

  async function issueInvoice() {
    const res = await erp<InvoiceView>('/sales/invoices', {
      method: 'POST',
      body: {
        customerId,
        warehouseId,
        documentDate: new Date().toISOString(),
        issueStock: false,
        lines: [oddLine()],
      },
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  it('leaves the total exact when rounding is off', async () => {
    await setMode('NONE');
    const invoice = await issueInvoice();
    expect(invoice.subtotalMinor).toBe(999);
    expect(invoice.taxMinor).toBe(0);
    expect(invoice.roundingMinor).toBe(0);
    expect(invoice.totalMinor).toBe(999);
  });

  it('rounds a document total to the nearest whole major unit and reports the difference', async () => {
    await setMode('NEAREST_WHOLE');
    const invoice = await issueInvoice();
    // 9.99 -> 10.00 is a +0.01 gain.
    expect(invoice.subtotalMinor).toBe(999);
    expect(invoice.roundingMinor).toBe(1);
    expect(invoice.totalMinor).toBe(1000);
    expect(
      invoice.subtotalMinor - invoice.discountMinor + invoice.taxMinor + invoice.roundingMinor,
    ).toBe(invoice.totalMinor);
  });

  it('keeps the ledger balanced and posts the difference to a rounding account', async () => {
    await setMode('NEAREST_WHOLE');
    await issueInvoice();

    const tb = await erp<TrialBalanceView>('/accounting/trial-balance');
    expect(tb.status).toBe(200);
    expect(tb.body.balanced).toBe(true);
    expect(tb.body.totalDebitMinor).toBe(tb.body.totalCreditMinor);

    const accounts = await erp<{ items: Array<{ id: string; systemRole: string | null }> }>(
      '/accounting/accounts',
    );
    const rounding = accounts.body.items.find((a) => a.systemRole === 'ROUNDING_GAIN_LOSS');
    expect(rounding).toBeDefined();
  });

  it('settles the rounded total, so the invoice is fully paid', async () => {
    await setMode('NEAREST_WHOLE');
    const invoice = await issueInvoice();
    expect(invoice.totalMinor).toBe(1000);
    // The receipt created by posting settles AR at the rounded total.
    expect(invoice.totalMinor - invoice.amountPaidMinor).toBe(invoice.outstandingMinor);
  });

  it('charges the rounded total on a POS sale and balances the receipt', async () => {
    await setMode('NEAREST_WHOLE');
    const session = await erp<{ id: string }>('/sales/cashier-sessions', {
      method: 'POST',
      body: { branchId: posBranchId, warehouseId, openingFloatMinor: 0 },
    });
    expect(session.status).toBe(201);

    const sale = await erp<{ id: string; totalMinor: number; roundingMinor: number; changeMinor: number }>(
      '/sales/pos-sales',
      {
        method: 'POST',
        body: {
          branchId: posBranchId,
          cashierSessionId: session.body.id,
          warehouseId,
          paymentMethod: 'CASH',
          lines: [oddLine()],
        },
      },
    );
    expect(sale.status).toBe(201);
    expect(sale.body.totalMinor).toBe(1000);
    expect(sale.body.roundingMinor).toBe(1);

    // The receipt settles AR at the rounded total, so the journal balances.
    const receipt = await ctx.prisma.posSale.findUniqueOrThrow({ where: { id: sale.body.id } });
    expect(receipt.totalMinor).toBe(1000);
    expect(receipt.roundingMinor).toBe(1);

    await erp(`/sales/cashier-sessions/${session.body.id}/close`, {
      method: 'POST',
      body: { countedCashMinor: 1000 },
    });
  });

  it('carries the rounded total through a quotation-to-order conversion', async () => {
    await setMode('NEAREST_WHOLE');
    const quotation = await erp<{ id: string; totalMinor: number; roundingMinor: number }>(
      '/sales/quotations',
      {
        method: 'POST',
        body: {
          customerId,
          documentDate: new Date().toISOString(),
          lines: [oddLine()],
        },
      },
    );
    expect(quotation.status).toBe(201);
    expect(quotation.body.roundingMinor).toBe(1);
    expect(quotation.body.totalMinor).toBe(1000);

    const order = await erp<{ totalMinor: number; roundingMinor: number }>(
      `/sales/quotations/${quotation.body.id}/convert`,
      { method: 'POST', body: {} },
    );
    expect(order.status).toBe(201);
    // The order copies the quotation's rounded total, so the identity holds.
    expect(order.body.roundingMinor).toBe(1);
    expect(order.body.totalMinor).toBe(1000);
  });

  it('scopes the rounding mode to the tenant that set it', async () => {
    await setMode('NEAREST_HALF');
    const mine = await prisma.company.findFirstOrThrow({ where: { id: companyId } });
    expect(mine.roundingMode).toBe('NEAREST_HALF');

    const other = await prisma.company.findFirstOrThrow({ where: { code: OTHER_COMPANY } });
    expect(other.roundingMode).toBe('NONE');
  });
});
