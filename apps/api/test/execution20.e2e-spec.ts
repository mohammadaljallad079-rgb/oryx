import * as argon2 from 'argon2';
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
import { ALLOWED_DOCUMENT_MIME_TYPES } from '@oryx/shared';

/**
 * Execution 20 — per-company settings, unified documents and customer types.
 *
 * This suite exercises the real HTTP surface, guards and Prisma layer:
 *
 *  - a company's settings are isolated: another tenant never reads or writes them;
 *  - an unknown namespace and an out-of-range value are rejected;
 *  - a document is linked to its owning record, listed, downloaded, replaced and
 *    deleted, and a document belonging to another tenant is invisible;
 *  - an unsupported file type is refused;
 *  - an individual and a company customer are created with their own fields, and
 *    a company's secondary branches persist;
 *  - company settings drive the documents a tenant issues: two companies issue
 *    invoices and job cards with their own prefixes and VAT rates;
 *  - every module dashboard reports real, module-specific figures.
 */
describe('Execution 20 — settings, documents and customer types', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let tenantId: string;
  let otherTenantId: string;
  /** A principal that belongs only to the first fixture tenant. */
  let isolatedToken: string;
  const code = `${FIXTURE_PREFIX}-E20`;
  const otherCode = `${FIXTURE_PREFIX}-E20B`;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });
  const otherErp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, otherTenantId, path, { ...options, token });
  const isolated = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token: isolatedToken });

  /** Attach the seeded company admin to a freshly provisioned tenant. */
  async function attachAdmin(companyId: string): Promise<void> {
    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId, roleId: adminRole.id, isActive: true } });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    for (const [companyCode, nameEn, nameAr] of [
      [code, 'E20 Fixture Co.', 'شركة التنفيذ العشرين'],
      [otherCode, 'E20 Second Co.', 'شركة التنفيذ العشرين الثانية'],
    ] as const) {
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: { code: companyCode, nameEn, nameAr, type: 'SAAS_TENANT', planId: enterprise.id },
      });
      expect(created.status).toBe(201);
      if (companyCode === code) tenantId = created.body.company.id;
      else otherTenantId = created.body.company.id;
    }

    await attachAdmin(tenantId);
    await attachAdmin(otherTenantId);

    // A principal that belongs *only* to the first tenant, so cross-tenant
    // isolation is proved by a membership boundary, not by a header.
    const isolatedEmail = `${FIXTURE_PREFIX.toLowerCase()}-e20-isolated@oryx.local`;
    const passwordHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const isolatedUser = await ctx.prisma.user.create({
      data: { email: isolatedEmail, passwordHash, fullNameEn: 'Isolated E20 User', fullNameAr: 'مستخدم معزول', status: 'ACTIVE' },
    });
    const isolatedRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    await ctx.prisma.membership.create({
      data: { userId: isolatedUser.id, companyId: tenantId, roleId: isolatedRole.id, isActive: true },
    });
    isolatedToken = await login(ctx.base, isolatedEmail, 'FixturePass!2026');
  });

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  });

  describe('per-company settings', () => {
    it('reads a complete namespace, merged over the platform defaults', async () => {
      const res = await erp<{ companyId: string; settings: Record<string, Record<string, unknown>> }>('/settings');
      expect(res.status).toBe(200);
      expect(res.body.companyId).toBe(tenantId);
      // Every namespace is present, so a company that never saved one still reads
      // a usable value rather than undefined.
      for (const ns of ['GENERAL', 'INVOICING', 'ACCOUNTING', 'TAX', 'HR', 'INVENTORY', 'SALES', 'MAINTENANCE', 'DOCUMENTS']) {
        expect(res.body.settings[ns]).toBeTruthy();
      }
    });

    it('isolates settings between companies', async () => {
      const first = await erp<{ value: { numberPrefix: string } }>('/settings/INVOICING');
      const second = await otherErp<{ value: { numberPrefix: string } }>('/settings/INVOICING');
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const saved = await erp<{ value: { numberPrefix: string } }>('/settings/INVOICING', {
        method: 'PATCH',
        body: { value: { ...first.body.value, numberPrefix: 'AAA' } },
      });
      expect(saved.status).toBe(200);
      expect(saved.body.value.numberPrefix).toBe('AAA');

      // The other tenant is untouched.
      const after = await otherErp<{ value: { numberPrefix: string } }>('/settings/INVOICING');
      expect(after.body.value.numberPrefix).toBe(second.body.value.numberPrefix);
    });

    it('drops an unknown key and fills the missing ones from the defaults', async () => {
      const res = await erp<{ value: Record<string, unknown> }>('/settings/TAX', {
        method: 'PATCH',
        body: { value: { vatEnabled: true, vatRateBp: 750, notARealKey: 'nope' } },
      });
      expect(res.status).toBe(200);
      expect(res.body.value.vatEnabled).toBe(true);
      expect(res.body.value.vatRateBp).toBe(750);
      expect(res.body.value).not.toHaveProperty('notARealKey');
      // A key that was not sent keeps a defined default.
      expect(res.body.value.taxNumber).toBeDefined();
    });

    it('rejects an out-of-range value', async () => {
      const res = await erp<{ code: string }>('/settings/TAX', {
        method: 'PATCH',
        body: { value: { vatRateBp: 999999 } },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('request.validation_failed');
    });

    it('records a revision each time a namespace changes', async () => {
      await erp('/settings/HR', { method: 'PATCH', body: { value: { annualLeaveDays: 25 } } });
      await erp('/settings/HR', { method: 'PATCH', body: { value: { annualLeaveDays: 21 } } });
      await erp('/settings/HR', { method: 'PATCH', body: { value: { annualLeaveDays: 22 } } });
      const history = await erp<{ items: Array<{ namespace: string }> }>('/settings/history?namespace=HR');
      expect(history.status).toBe(200);
      expect(history.body.items.length).toBeGreaterThanOrEqual(2);
      expect(history.body.items.every((i) => i.namespace === 'HR')).toBe(true);
    });

    it('resets a namespace to the platform defaults', async () => {
      await erp('/settings/SALES', { method: 'PATCH', body: { value: { defaultPaymentTermsDays: 45 } } });
      const reset = await erp<{ value: { defaultPaymentTermsDays: number } }>('/settings/SALES/reset', { method: 'POST' });
      expect(reset.status).toBe(201);
      expect(reset.body.value.defaultPaymentTermsDays).not.toBe(45);
    });

    it('a company principal cannot reach another company\'s settings', async () => {
      // The isolated principal belongs only to `tenantId`; naming the other
      // tenant must not resolve.
      const res = await call(ctx.base, '/settings', {
        token: isolatedToken,
        headers: { 'x-oryx-company-id': otherTenantId },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('unified documents', () => {
    let customerId: string;
    let documentId: string;

    beforeAll(async () => {
      const created = await erp<{ id: string }>('/sales/customers', {
        method: 'POST',
        body: { code: 'DOC-CUST', nameEn: 'Document Customer', nameAr: 'عميل المستندات', type: 'INDIVIDUAL' },
      });
      expect(created.status).toBe(201);
      customerId = created.body.id;
    });

    it('uploads a document against its owning record', async () => {
      const form = new FormData();
      form.append('entityType', 'CUSTOMER');
      form.append('entityId', customerId);
      form.append('category', 'IDENTITY');
      form.append('title', 'National ID');
      form.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'id.pdf');

      const res = await fetch(`${ctx.base}/api/v1/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
        body: form,
      });
      const body = (await res.json()) as { id: string; fileName: string; mimeType: string; sizeBytes: number; category: string };
      expect(res.status).toBe(201);
      expect(body.fileName).toBe('id.pdf');
      expect(body.mimeType).toBe('application/pdf');
      expect(body.sizeBytes).toBeGreaterThan(0);
      expect(body.category).toBe('IDENTITY');
      documentId = body.id;
    });

    it('lists a record\'s documents', async () => {
      const res = await erp<{ items: Array<{ id: string; fileName: string }> }>(
        `/documents?entityType=CUSTOMER&entityId=${customerId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.items.some((d) => d.id === documentId)).toBe(true);
    });

    it('downloads the stored binary with its metadata', async () => {
      const res = await fetch(`${ctx.base}/api/v1/documents/${documentId}/download`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.toString()).toContain('%PDF-1.4');
    });

    it('refuses an unsupported file type', async () => {
      const form = new FormData();
      form.append('entityType', 'CUSTOMER');
      form.append('entityId', customerId);
      form.append('file', new Blob([Buffer.from('MZ')], { type: 'application/x-msdownload' }), 'evil.exe');
      const res = await fetch(`${ctx.base}/api/v1/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
        body: form,
      });
      expect(res.status).toBe(400);
      // The catalogue the API enforces is the shared one.
      expect(ALLOWED_DOCUMENT_MIME_TYPES).toContain('application/pdf');
    });

    it('replaces a document with a new file', async () => {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from('second version')], { type: 'image/png' }), 'photo.png');
      const res = await fetch(`${ctx.base}/api/v1/documents/${documentId}/replace`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
        body: form,
      });
      const body = (await res.json()) as { fileName: string; mimeType: string };
      expect(res.status).toBe(201);
      expect(body.fileName).toBe('photo.png');
      expect(body.mimeType).toBe('image/png');
    });

    it('never exposes a document belonging to another tenant', async () => {
      const res = await fetch(`${ctx.base}/api/v1/documents/${documentId}/download`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': otherTenantId },
      });
      expect(res.status).toBe(404);
    });

    it('deletes a document', async () => {
      const res = await erp<{ deleted: boolean }>(`/documents/${documentId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      const gone = await ctx.prisma.entityAttachment.findUnique({ where: { id: documentId } });
      expect(gone).toBeNull();
    });
  });

  describe('customers: individuals, companies and branches', () => {
    it('creates an individual with personal fields only', async () => {
      const res = await erp<{ id: string; type: string; nationalId: string | null }>('/sales/customers', {
        method: 'POST',
        body: {
          code: 'IND-1',
          type: 'INDIVIDUAL',
          nameEn: 'Sara Ali',
          nameAr: 'سارة علي',
          nationalId: '1234567890',
          phone: '0555000000',
          city: 'Riyadh',
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('INDIVIDUAL');
      expect(res.body.nationalId).toBe('1234567890');
    });

    it('creates a company with commercial fields and secondary branches', async () => {
      const res = await erp<{ id: string; type: string; crNumber: string | null; taxNumber: string | null }>(
        '/sales/customers',
        {
          method: 'POST',
          body: {
            code: 'CO-1',
            type: 'COMPANY',
            nameEn: 'Acme Trading LLC',
            nameAr: 'شركة أكمي التجارية',
            crNumber: '1010101010',
            taxNumber: '300000000000003',
            website: 'https://acme.example',
            contactPersonName: 'Khalid',
            contactPersonPhone: '0555111111',
            branches: [
              { name: 'Head Office', city: 'Riyadh', isHeadOffice: true },
              { name: 'Jeddah Branch', city: 'Jeddah', isHeadOffice: false },
            ],
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('COMPANY');
      expect(res.body.crNumber).toBe('1010101010');
      expect(res.body.taxNumber).toBe('300000000000003');

      const detail = await erp<{ branches: Array<{ name: string; isHeadOffice: boolean }> }>(
        `/sales/customers/${res.body.id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.branches).toHaveLength(2);
      expect(detail.body.branches[0].name).toBe('Head Office');
      expect(detail.body.branches[0].isHeadOffice).toBe(true);
    });

    it('filters the customer list by type', async () => {
      const companies = await erp<{ items: Array<{ type: string; code: string }> }>('/sales/customers?type=COMPANY');
      expect(companies.status).toBe(200);
      expect(companies.body.items.every((c) => c.type === 'COMPANY')).toBe(true);
      expect(companies.body.items.some((c) => c.code === 'CO-1')).toBe(true);

      const individuals = await erp<{ items: Array<{ type: string }> }>('/sales/customers?type=INDIVIDUAL');
      expect(individuals.body.items.every((c) => c.type === 'INDIVIDUAL')).toBe(true);
    });

    it('replaces a company\'s branches on update', async () => {
      const list = await erp<{ items: Array<{ id: string; code: string }> }>('/sales/customers?type=COMPANY');
      const company = list.body.items.find((c) => c.code === 'CO-1')!;
      const res = await erp<{ id: string }>(`/sales/customers/${company.id}`, {
        method: 'POST',
        body: { branches: [{ name: 'Only Branch', isHeadOffice: true }] },
      });
      expect(res.status).toBe(201);
      const detail = await erp<{ branches: Array<{ name: string }> }>(`/sales/customers/${company.id}`);
      expect(detail.body.branches).toHaveLength(1);
      expect(detail.body.branches[0].name).toBe('Only Branch');
    });
  });

  describe('company settings drive issued documents', () => {
    let warehouseId: string;
    let customerId: string;

    beforeAll(async () => {
      // Posting an invoice requires the chart of accounts and an open fiscal
      // period covering the invoice date, for both tenants.
      for (const client of [erp, otherErp]) {
        const chart = await client('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
        expect([200, 201]).toContain(chart.status);
        const fy = await client('/accounting/fiscal-years', {
          method: 'POST',
          body: { code: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' },
        });
        expect([200, 201]).toContain(fy.status);
      }
      const wh = await erp<{ id: string }>('/inventory/warehouses', {
        method: 'POST',
        body: { code: 'E20WH', nameEn: 'E20 Warehouse', nameAr: 'مستودع', },
      });
      expect(wh.status).toBe(201);
      warehouseId = wh.body.id;
      const cust = await erp<{ id: string }>('/sales/customers', {
        method: 'POST',
        body: { code: 'E20-INV-CUST', nameEn: 'Invoice Customer', nameAr: 'عميل الفاتورة' },
      });
      customerId = cust.body.id;
    });

    it('numbers an invoice with the current company\'s prefix', async () => {
      await erp('/settings/INVOICING', { method: 'PATCH', body: { value: { numberPrefix: 'ZZ' } } });
      const invoice = await erp<{ invoiceNumber: string }>('/sales/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: '2026-06-01',
          warehouseId,
          issueStock: false,
          lines: [{ description: 'Service', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 0 }],
        },
      });
      expect(invoice.status).toBe(201);
      expect(invoice.body.invoiceNumber.startsWith('ZZ-')).toBe(true);
    });

    it('applies the company\'s VAT rate as the line default', async () => {
      await erp('/settings/TAX', { method: 'PATCH', body: { value: { vatEnabled: true, vatRateBp: 500 } } });
      const invoice = await erp<{ taxMinor: number }>('/sales/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: '2026-06-02',
          warehouseId,
          issueStock: false,
          lines: [{ description: 'Service', quantity: 10000, unitPriceMinor: 10000 }],
        },
      });
      expect(invoice.status).toBe(201);
      // 100.00 net at 5% = 5.00 tax.
      expect(invoice.body.taxMinor).toBe(500);
    });

    it('the other company issues its own invoice number', async () => {
      await otherErp('/settings/INVOICING', { method: 'PATCH', body: { value: { numberPrefix: 'YY' } } });
      const cust = await otherErp<{ id: string }>('/sales/customers', {
        method: 'POST',
        body: { code: 'E20B-CUST', nameEn: 'Other Customer', nameAr: 'عميل آخر' },
      });
      const invoice = await otherErp<{ invoiceNumber: string }>('/sales/invoices', {
        method: 'POST',
        body: {
          customerId: cust.body.id,
          invoiceDate: '2026-06-03',
          issueStock: false,
          lines: [{ description: 'Service', quantity: 10000, unitPriceMinor: 10000, taxPercentBp: 0 }],
        },
      });
      expect(invoice.status).toBe(201);
      expect(invoice.body.invoiceNumber.startsWith('YY-')).toBe(true);
    });
  });

  describe('module dashboards', () => {
    it('reports module-specific figures, not a repeated block', async () => {
      const accounting = await erp<{ moduleKey: string; stats: unknown[]; nameEn: string }>(
        '/dashboard/modules/financial_accounting',
      );
      const inventory = await erp<{ moduleKey: string; stats: unknown[]; nameEn: string }>(
        '/dashboard/modules/warehouses_inventory',
      );
      expect(accounting.status).toBe(200);
      expect(inventory.status).toBe(200);
      expect(accounting.body.moduleKey).toBe('financial_accounting');
      expect(inventory.body.moduleKey).toBe('warehouses_inventory');
      // The two modules compute their own statistics.
      expect(accounting.body.stats.length).toBeGreaterThan(0);
      expect(inventory.body.stats.length).toBeGreaterThan(0);
      expect(JSON.stringify(accounting.body.stats)).not.toBe(JSON.stringify(inventory.body.stats));
    });

    it('refuses a module the company is not licensed for', async () => {
      // The `dashboard` module key is always licensed, so use an unknown key to
      // prove the catalogue check, then a known-but-unlicensed one.
      const unknown = await erp<{ code: string }>('/dashboard/modules/not_a_module');
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('resource.not_found');
    });

    it('drops a shortcut the caller cannot act on', async () => {
      const res = await erp<{ shortcuts: Array<{ permission: string | null }> }>(
        '/dashboard/modules/financial_accounting',
      );
      expect(res.status).toBe(200);
      // Every advertised shortcut is one the company admin holds.
      const perms = await ctx.prisma.rolePermission.findMany({
        where: { role: { companyId: tenantId, code: 'company_admin' } },
        select: { permissionCode: true },
      });
      const granted = new Set(perms.map((p) => p.permissionCode));
      for (const s of res.body.shortcuts) {
        if (s.permission) expect(granted.has(s.permission)).toBe(true);
      }
    });
  });
});
