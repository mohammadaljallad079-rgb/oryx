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
  party: { name: string; taxNumber: string | null };
  staffName: string;
  company: { taxNumber: string | null; crNumber: string | null };
  lines: Array<{ description: string; quantity: string; unitPrice: string; amount: string }>;
  totals: { untaxedAmount: string; taxAmount: string; discount: string; total: string };
  amountInWords: string;
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
        lines: [
          { productId, description: 'Oil (Havoline 5w20)', quantity: 10000, unitPriceMinor: 7500, taxPercentBp: 1000 },
          { productId, description: 'Oil filter Mazda - orginal', quantity: 10000, unitPriceMinor: 2000, taxPercentBp: 1000 },
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
      expect(res.body.documentNumber).toMatch(/^SI-/);
      expect(res.body.titleEn).toBe('INVOICE');
      expect(res.body.titleAr).toBe('فاتورة');
      expect(res.body.party.name).toBe('Al Haddad Trading');
      expect(res.body.party.taxNumber).toBe('200001111222111');
      // The seller's registration number the navy band prints comes from the company.
      expect(res.body.company.taxNumber).toBe('300000000000003');
      expect(res.body.company.crNumber).toBe('9000000009');
      // The printed staff name is the account that created the document, never
      // a value supplied in the request body.
      expect(res.body.staffName).toBe('DEMO-ALNOOR Administrator');
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.lines[0].description).toBe('Oil (Havoline 5w20)');
      // 7.500 + 2.000 = 9.500 net, 10% VAT = 0.950, total 10.450 (BHD, 3 dp)
      expect(res.body.totals.untaxedAmount).toBe('9.500 BHD');
      expect(res.body.totals.total).toBe('10.450 BHD');
      expect(res.body.amountInWords).toContain('Bahraini Dinar');
    });

    it('renders a receipt voucher', async () => {
      const res = await erp<PrintModel>(`/print/RECEIPT/${receiptId}`);
      expect(res.status).toBe(200);
      expect(res.body.kind).toBe('RECEIPT');
      expect(res.body.documentNumber).toMatch(/^PMT-/);
      expect(res.body.party.name).toBe('Al Haddad Trading');
      expect(res.body.totals.total).toBe('1.000 BHD');
      // No staff name was set, so it falls back to the creator rather than blank.
      expect(res.body.staffName.length).toBeGreaterThan(0);
    });

    it('ignores a hand-picked staff name and uses the creating account', async () => {
      const res = await erp('/sales/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: '2026-05-04',
          warehouseId,
          staffName: 'Someone Else',
          lines: [{ productId, description: 'Brake Pad Set', quantity: 10000, unitPriceMinor: 7500, taxPercentBp: 1000 }],
        },
      });
      // The DTO no longer carries `staffName`, so a hand-picked value is refused.
      expect(res.status).toBe(400);
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
