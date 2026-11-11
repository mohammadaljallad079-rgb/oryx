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
import * as argon2 from 'argon2';

/**
 * Print model and document attachments.
 *
 * The suite proves the behaviours the print/attachment work promised:
 *
 *  - a sales invoice and a receipt resolve to a complete print model that a
 *    browser can render without an internal error;
 *  - a PDF/JPG/PNG can be attached to an invoice and a receipt, listed, streamed
 *    back for preview/download and removed;
 *  - both surfaces are tenant- and permission-scoped: an isolated principal and
 *    an unsupported file type are refused.
 */

interface PrintModel {
  kind: string;
  documentNumber: string;
  titleEn: string;
  titleAr: string;
  issueDateLabel: string;
  issueDateValue: string;
  secondaryDateLabel: string | null;
  party: { name: string; taxNumber: string | null };
  company: { taxNumber: string | null; crNumber: string | null; addressLine: string | null; city: string | null };
  lines: Array<{ description: string; quantity: string; unitPrice: string; amount: string }>;
  totals: { untaxedAmount: string; taxAmount: string; discount: string; total: string };
  amountInWords: string;
  currency: string;
  paymentLabel: string | null;
  paymentValue: string | null;
  staffName: string;
}

interface AttachmentRow {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('print model and document attachments (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let isolatedToken: string;
  let tenantId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;
  let invoiceId: string;
  let receiptId: string;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  /** Multipart upload, which the JSON `call` helper cannot express. */
  async function upload(
    entityType: string,
    entityId: string,
    file: { name: string; type: string; bytes: Buffer },
  ): Promise<{ status: number; body: unknown }> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    const res = await fetch(`${ctx.base}/api/v1/attachments/${entityType}/${entityId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      body: form,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

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
        // The amounts below are written for a two-decimal currency, so the
        // fixture pins it rather than inheriting the three-decimal default.
        currency: 'SAR',
        countryCode: 'SA',
      },
    });
    tenantId = created.body.company.id;

    // Company print metadata the approved form carries.
    await ctx.prisma.company.update({
      where: { id: tenantId },
      data: {
        taxNumber: '300000000000003',
        crNumber: '9000000009',
        phone: '+973 1111 2222',
        email: 'print@fixture.local',
        website: 'www.fixture.local',
        addressLine: 'Building 1, Road 2, Block 3, Manama',
      },
    });

    // The printed address is the issuer's registered address, so the footer's
    // legal line resolves the first active branch the same way the rendered
    // document does. The branch supplies the city printed between the street
    // address and the CR number.
    await ctx.prisma.branch.create({
      data: {
        companyId: tenantId,
        code: 'HQ',
        nameEn: 'Head Office',
        nameAr: 'المكتب الرئيسي',
        addressLine: 'Building 1, Road 2, Block 3',
        city: 'Manama',
        isActive: true,
      },
    });

    const adminRole = await ctx.prisma.role.findFirstOrThrow({
      where: { companyId: tenantId, code: 'company_admin' },
    });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });

    const isolatedEmail = `${FIXTURE_PREFIX.toLowerCase()}-print-isolated@oryx.local`;
    const passwordHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const isolatedUser = await ctx.prisma.user.create({
      data: {
        email: isolatedEmail,
        passwordHash,
        fullNameEn: 'Isolated Print User',
        fullNameAr: 'مستخدم الطباعة المعزول',
        status: 'ACTIVE',
      },
    });
    await ctx.prisma.membership.create({
      data: { userId: isolatedUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });
    isolatedToken = await login(ctx.base, isolatedEmail, 'FixturePass!2026');

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
      body: {
        sku: 'PRINT-1',
        nameEn: 'Brake Pad Set',
        nameAr: 'طقم فحمات فرامل',
        salesPriceMinor: 7500,
        costPriceMinor: 4000,
        taxRateBp: 1000,
      },
    });
    productId = product.body.id;

    // Opening stock so the invoice can draw the product down.
    await erp('/inventory/movements', {
      method: 'POST',
      body: {
        warehouseId,
        productId,
        direction: 'IN',
        quantity: 1000000,
        unitCostMinor: 4000,
        occurredAt: '2026-05-01',
      },
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
        city: 'Manama',
        countryCode: 'BH',
      },
    });
    customerId = customer.body.id;

    const invoice = await erp<{ id: string }>('/sales/invoices', {
      method: 'POST',
      body: {
        customerId,
        invoiceDate: '2026-05-02',
        warehouseId,
        // The approved invoice prints a "Payment" line naming the settlement
        // method stored on the invoice itself.
        paymentMethod: 'WALLET',
        salespersonName: 'Hussain Alhaddad',
        lines: [
          { productId, description: 'Oil (Havoline 5w20)', quantity: 10000, unitPriceMinor: 750, taxPercentBp: 1000 },
          { productId, description: 'Oil filter Mazda - orginal', quantity: 10000, unitPriceMinor: 200, taxPercentBp: 1000 },
        ],
      },
    });
    expect(invoice.status).toBe(201);
    invoiceId = invoice.body.id;

    const receipt = await erp<{ id: string }>('/accounting/payments', {
      method: 'POST',
      body: {
        direction: 'RECEIPT',
        partyType: 'CUSTOMER',
        customerId,
        method: 'CASH',
        amountMinor: 1000,
        paidAt: '2026-05-03',
      },
    });
    expect(receipt.status).toBe(201);
    receiptId = receipt.body.id;
  }, 120_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  describe('print model', () => {
    it('renders a sales invoice with every field the approved form needs', async () => {
      const res = await erp<PrintModel>(`/print/SALES_INVOICE/${invoiceId}`);
      expect(res.status).toBe(200);
      expect(res.body.kind).toBe('SALES_INVOICE');
      // Single-letter numbering: the approved form prints `INVOICE # S00022`.
      expect(res.body.documentNumber).toMatch(/^S\d{5}$/);
      expect(res.body.titleEn).toBe('INVOICE');
      expect(res.body.titleAr).toBe('فاتورة');
      // The approved invoice prints its date as "Order Date" with a weekday and
      // a 12-hour clock, and carries no second (due) date row.
      expect(res.body.issueDateLabel).toBe('Order Date');
      expect(res.body.issueDateValue).toMatch(/^\w{3} \d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} (AM|PM)$/);
      expect(res.body.secondaryDateLabel).toBeNull();
      expect(res.body.party.name).toBe('Al Haddad Trading');
      expect(res.body.party.taxNumber).toBe('200001111222111');
      // The seller's registration number the navy band prints comes from the company.
      expect(res.body.company.taxNumber).toBe('300000000000003');
      expect(res.body.company.crNumber).toBe('9000000009');
      // The footer's legal line prints the registered address then the city, so
      // the preview and the rendered document agree on both.
      expect(res.body.company.addressLine).toBe('Building 1, Road 2, Block 3');
      expect(res.body.company.city).toBe('Manama');
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.lines[0].description).toBe('Oil (Havoline 5w20)');
      // 7.50 + 2.00 = 9.50 net, 10% VAT = 0.95, total 10.45
      expect(res.body.totals.untaxedAmount).toBe('9.50 SAR');
      expect(res.body.totals.total).toBe('10.45 SAR');
      expect(res.body.amountInWords).toContain('Saudi Riyal');
      // The approved invoice prints a "Payment" line naming the settlement
      // method stored on the invoice, not only one inferred from an allocation.
      expect(res.body.paymentLabel).toBe('Payment');
      expect(res.body.paymentValue).toBe('Benefit Pay');
      expect(res.body.staffName).toBe('Hussain Alhaddad');
    });

    it('renders a receipt voucher', async () => {
      const res = await erp<PrintModel>(`/print/RECEIPT/${receiptId}`);
      expect(res.status).toBe(200);
      expect(res.body.kind).toBe('RECEIPT');
      expect(res.body.documentNumber).toMatch(/^Y\d{5}$/);
      expect(res.body.party.name).toBe('Al Haddad Trading');
      expect(res.body.totals.total).toBe('10.00 SAR');
      // The voucher's single line must agree with its own total at the
      // currency's scale; a scale slip prints a line ten times the total
      // (the three-decimal BHD case that motivated this assertion).
      expect(res.body.lines).toHaveLength(1);
      expect(res.body.lines[0].amount).toBe(res.body.totals.total);
      expect(`${res.body.lines[0].unitPrice} ${res.body.currency}`).toBe(res.body.totals.total);
    });

    it('refuses an unknown document id without a 500', async () => {
      const res = await erp('/print/SALES_INVOICE/does-not-exist');
      expect(res.status).toBe(404);
    });

    it('refuses a cross-tenant read for an isolated principal', async () => {
      const other = await ctx.prisma.company.findFirstOrThrow({ where: { code: 'ORYX-AUTO' } });
      const denied = await companyCall(ctx.base, other.id, `/print/SALES_INVOICE/${invoiceId}`, {
        token: isolatedToken,
      });
      expect([403, 404]).toContain(denied.status);
    });
  });

  describe('attachments', () => {
    let attachmentId: string;

    it('attaches a PNG to a sales invoice and lists it back', async () => {
      const up = await upload('SALES_INVOICE', invoiceId, { name: 'receipt.png', type: 'image/png', bytes: PNG });
      expect(up.status).toBe(201);
      const row = up.body as AttachmentRow;
      attachmentId = row.id;
      expect(row.fileName).toBe('receipt.png');
      expect(row.mimeType).toBe('image/png');

      const list = await erp<AttachmentRow[]>(`/attachments/SALES_INVOICE/${invoiceId}`);
      expect(list.status).toBe(200);
      expect(list.body.map((a) => a.id)).toContain(attachmentId);
    });

    it('streams the stored bytes back for preview and download', async () => {
      const res = await fetch(`${ctx.base}/api/v1/attachments/SALES_INVOICE/${invoiceId}/${attachmentId}/download`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.equals(PNG)).toBe(true);
    });

    it('attaches a PDF to a receipt', async () => {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
      const up = await upload('PAYMENT', receiptId, { name: 'voucher.pdf', type: 'application/pdf', bytes: pdf });
      expect(up.status).toBe(201);
      expect((up.body as AttachmentRow).mimeType).toBe('application/pdf');
    });

    it('keeps several attachments on one document', async () => {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
      const first = await upload('SALES_INVOICE', invoiceId, { name: 'front.jpg', type: 'image/jpeg', bytes: PNG });
      const second = await upload('SALES_INVOICE', invoiceId, { name: 'signed.pdf', type: 'application/pdf', bytes: pdf });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const list = await erp<AttachmentRow[]>(`/attachments/SALES_INVOICE/${invoiceId}`);
      expect(list.status).toBe(200);
      const names = list.body.map((a) => a.fileName);
      // Both new files are present alongside the PNG attached earlier, so one
      // document carries more than one attachment.
      expect(names).toContain('front.jpg');
      expect(names).toContain('signed.pdf');
      expect(names.length).toBeGreaterThanOrEqual(3);

      // Each attachment streams its own bytes back for preview and download.
      for (const row of list.body) {
        const res = await fetch(
          `${ctx.base}/api/v1/attachments/SALES_INVOICE/${invoiceId}/${row.id}/download`,
          { headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId } },
        );
        expect(res.status).toBe(200);
        expect((await res.arrayBuffer()).byteLength).toBe(row.sizeBytes);
      }

      // Removing one leaves the others untouched.
      const removedId = (second.body as AttachmentRow).id;
      await erp(`/attachments/SALES_INVOICE/${invoiceId}/${removedId}`, { method: 'DELETE' });
      const after = await erp<AttachmentRow[]>(`/attachments/SALES_INVOICE/${invoiceId}`);
      expect(after.body.map((a) => a.fileName)).toContain('front.jpg');
      expect(after.body.map((a) => a.id)).not.toContain(removedId);
    });

    it('rejects an unsupported file type', async () => {
      const up = await upload('SALES_INVOICE', invoiceId, {
        name: 'notes.txt',
        type: 'text/plain',
        bytes: Buffer.from('nope'),
      });
      expect(up.status).toBe(400);
    });

    it('refuses to attach to another tenant\'s document', async () => {
      const other = await ctx.prisma.company.findFirstOrThrow({ where: { code: 'ORYX-AUTO' } });
      const otherInvoice = await ctx.prisma.salesInvoice.findFirst({ where: { companyId: other.id } });
      if (otherInvoice) {
        const up = await upload('SALES_INVOICE', otherInvoice.id, { name: 'x.png', type: 'image/png', bytes: PNG });
        expect(up.status).toBe(404);
      }
    });

    it('removes an attachment', async () => {
      const del = await erp<{ deleted: true }>(`/attachments/SALES_INVOICE/${invoiceId}/${attachmentId}`, {
        method: 'DELETE',
      });
      expect(del.status).toBe(200);
      expect(del.body.deleted).toBe(true);

      const list = await erp<AttachmentRow[]>(`/attachments/SALES_INVOICE/${invoiceId}`);
      expect(list.body.map((a) => a.id)).not.toContain(attachmentId);
    });
  });
});
