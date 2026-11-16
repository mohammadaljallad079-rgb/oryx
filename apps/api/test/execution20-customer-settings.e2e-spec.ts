import { PrismaService } from '../src/common/prisma.service';
import {
  call,
  companyCall,
  createTestApp,
  login,
  SEED_COMPANY_ADMIN,
  SEED_ORYX_AUTO_ADMIN,
  type TestContext,
} from './test-app';

/**
 * Execution 20 — customer kinds, secondary branches and per-company settings.
 *
 * Three claims are security-relevant and are asserted against the real database:
 * a customer is stored as either an individual or a company and the two carry
 * different fields; a secondary branch is rolled up to the head-office customer
 * inside the same tenant and can never be read or written across a tenant; and a
 * settings section is namespaced per company, so changing one company's VAT rate
 * leaves every other company's documents untouched.
 */
describe('Execution 20 — customer kinds and per-company settings (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  let companyId = '';
  let otherCompanyId = '';
  let token = '';
  let otherToken = '';

  const DEMO_COMPANY = 'DEMO-ALNOOR';
  const OTHER_COMPANY = 'ORYX-AUTO';
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;

    const demo = await prisma.company.findFirstOrThrow({ where: { code: DEMO_COMPANY } });
    const other = await prisma.company.findFirstOrThrow({ where: { code: OTHER_COMPANY } });
    companyId = demo.id;
    otherCompanyId = other.id;

    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
    otherToken = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
  });

  afterAll(async () => {
    await prisma.customerBranch.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await ctx.app.close();
  });

  async function createCustomer(body: Record<string, unknown>): Promise<{ id: string }> {
    const res = await companyCall<{ id: string }>(ctx.base, companyId, '/sales/customers', {
      method: 'POST',
      token,
      body,
    });
    expect(res.status === 201 ? '' : JSON.stringify(res.body)).toBe('');
    createdCustomerIds.push(res.body.id);
    return res.body;
  }

  describe('customer kinds', () => {
    it('stores a company customer with CR number, website and contact person', async () => {
      const created = await createCustomer({
        code: 'E20-SPEC-CO',
        kind: 'COMPANY',
        nameEn: 'Spec Company',
        nameAr: 'شركة الاختبار',
        crNumber: 'CR-12345',
        website: 'https://spec.example',
        contactPersonName: 'Layla Hassan',
        contactPersonPhone: '39998877',
      });
      const detail = await companyCall<Record<string, unknown>>(
        ctx.base,
        companyId,
        `/sales/customers/${created.id}`,
        { token },
      );
      expect(detail.status).toBe(200);
      expect(detail.body.kind).toBe('COMPANY');
      expect(detail.body.crNumber).toBe('CR-12345');
      expect(detail.body.website).toBe('https://spec.example');
      expect(detail.body.contactPersonName).toBe('Layla Hassan');
    });

    it('stores an individual customer with a national id', async () => {
      const created = await createCustomer({
        code: 'E20-SPEC-IN',
        kind: 'INDIVIDUAL',
        nameEn: 'Spec Person',
        nameAr: 'شخص الاختبار',
        nationalId: '880123456',
      });
      const detail = await companyCall<Record<string, unknown>>(
        ctx.base,
        companyId,
        `/sales/customers/${created.id}`,
        { token },
      );
      expect(detail.body.kind).toBe('INDIVIDUAL');
      expect(detail.body.nationalId).toBe('880123456');
      expect(detail.body.crNumber).toBeNull();
    });

    it('defaults to an individual customer when no kind is given', async () => {
      const created = await createCustomer({ code: 'E20-SPEC-DEF', nameEn: 'Default Kind' });
      const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.kind).toBe('INDIVIDUAL');
    });

    it('rejects an unknown customer kind', async () => {
      const res = await companyCall(ctx.base, companyId, '/sales/customers', {
        method: 'POST',
        token,
        body: { code: 'E20-SPEC-BAD', nameEn: 'Bad Kind', kind: 'PARTNERSHIP' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('secondary branches', () => {
    let headOfficeId = '';

    beforeAll(async () => {
      const created = await createCustomer({
        code: 'E20-SPEC-HQ',
        kind: 'COMPANY',
        nameEn: 'Head Office Co',
        nameAr: 'المركز الرئيسي',
      });
      headOfficeId = created.id;
    });

    it('adds a branch under the head-office customer and lists it back', async () => {
      const created = await companyCall<{ id: string; code: string; customerId: string }>(
        ctx.base,
        companyId,
        `/sales/customers/${headOfficeId}/branches`,
        {
          method: 'POST',
          token,
          body: { code: 'E20-BR-MAIN', nameEn: 'Main Branch', nameAr: 'الفرع الرئيسي', city: 'Manama' },
        },
      );
      expect(created.status === 201 ? '' : JSON.stringify(created.body)).toBe('');
      expect(created.body.customerId).toBe(headOfficeId);

      const list = await companyCall<Array<{ id: string; code: string }>>(
        ctx.base,
        companyId,
        `/sales/customers/${headOfficeId}/branches`,
        { token },
      );
      expect(list.status).toBe(200);
      expect(list.body.map((b) => b.code)).toContain('E20-BR-MAIN');
    });

    it('refuses to add a branch to a customer in another tenant', async () => {
      const res = await companyCall(ctx.base, otherCompanyId, `/sales/customers/${headOfficeId}/branches`, {
        method: 'POST',
        token: otherToken,
        body: { code: 'E20-BR-X', nameEn: 'Cross Tenant' },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('refuses a duplicate branch code inside the same customer', async () => {
      const res = await companyCall(ctx.base, companyId, `/sales/customers/${headOfficeId}/branches`, {
        method: 'POST',
        token,
        body: { code: 'E20-BR-MAIN', nameEn: 'Duplicate' },
      });
      expect([400, 409]).toContain(res.status);
    });
  });

  describe('per-company settings isolation', () => {
    it('stores a tax section for one company without touching another', async () => {
      const saved = await companyCall<Record<string, unknown>>(ctx.base, companyId, '/company-settings/tax', {
        method: 'PUT',
        token,
        body: { vatEnabled: true, defaultRateBp: 1500, companyTaxNumber: 'DEMO-VAT-1' },
      });
      expect(saved.status).toBe(200);
      expect(saved.body.defaultRateBp).toBe(1500);

      const otherRead = await companyCall<Record<string, unknown>>(
        ctx.base,
        otherCompanyId,
        '/company-settings/tax',
        { token: otherToken },
      );
      expect(otherRead.body.defaultRateBp).toBe(0);
      expect(otherRead.body.companyTaxNumber).toBe('');
    });

    it('persists a partial update and merges it over the defaults', async () => {
      await companyCall(ctx.base, companyId, '/company-settings/general', {
        method: 'PUT',
        token,
        body: { currency: 'USD', timezone: 'Asia/Dubai' },
      });
      const read = await companyCall<Record<string, unknown>>(ctx.base, companyId, '/company-settings/general', {
        token,
      });
      expect(read.body.currency).toBe('USD');
      expect(read.body.timezone).toBe('Asia/Dubai');
      // A field never supplied still carries its platform default.
      expect(read.body.defaultLocale).toBe('ar');
    });

    it('writes one row per (company, section) and never shares it', async () => {
      const rows = await prisma.companySetting.findMany({
        where: { companyId: { in: [companyId, otherCompanyId] } },
        select: { companyId: true, section: true },
      });
      const demoRows = rows.filter((r) => r.companyId === companyId);
      const otherRows = rows.filter((r) => r.companyId === otherCompanyId);
      expect(demoRows.length).toBeGreaterThan(0);
      // The other company has no tax row of its own.
      expect(otherRows.some((r) => r.section === 'tax')).toBe(false);
    });

    it('rejects an unknown settings section', async () => {
      const res = await companyCall(ctx.base, companyId, '/company-settings/not-a-section', {
        method: 'PUT',
        token,
        body: { anything: true },
      });
      expect(res.status).toBe(400);
    });

    it('returns every section for the active company', async () => {
      const res = await companyCall<{ sections: Record<string, unknown> }>(
        ctx.base,
        companyId,
        '/company-settings',
        { token },
      );
      expect(res.status).toBe(200);
      for (const section of ['general', 'invoicing', 'accounting', 'tax', 'documents']) {
        expect(res.body.sections[section]).toBeDefined();
      }
    });

    it('refuses a company principal writing another company’s settings', async () => {
      const res = await call(ctx.base, '/company-settings/tax', {
        method: 'PUT',
        token,
        body: { defaultRateBp: 9999 },
        headers: { 'x-oryx-company-id': otherCompanyId },
      });
      expect([403, 404]).toContain(res.status);
    });
  });
});
