import * as argon2 from 'argon2';
import { PrismaService } from '../src/common/prisma.service';
import { call, createTestApp, login, SEED_SUPER_ADMIN, type TestContext } from './test-app';

/**
 * Execution 12 — Super Admin ecosystem overview, coupons and notification centre.
 *
 * Real HTTP against the running API, the real guards and the real Prisma layer.
 *
 * The properties asserted are the ones this control panel is most likely to get
 * wrong:
 *
 *   - the ecosystem figures are real aggregates over the database, and a tenant
 *     principal can never reach them (`@PlatformOnly()`);
 *   - a coupon's discount is computed server-side and bounded by the subtotal,
 *     so a percentage can never exceed the order and a fixed amount can never
 *     drive a total negative;
 *   - the operator's delivery log is platform-scoped and a company principal is
 *     refused;
 *   - role templates are returned with only the codes the caller may delegate.
 */
describe('Execution 12 — platform control panel (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'E12CTRL';
  const password = 'e12-control-password-12345';

  let superToken = '';
  let companyToken = '';
  let companyId = '';
  const companyEmail = `${PREFIX.toLowerCase()}-admin@test.local`;

  const createdCouponIds: string[] = [];

  async function purgeFixtures() {
    const companies = await prisma.company.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const companyIds = companies.map((c) => c.id);
    await prisma.coupon.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.subscription.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    await purgeFixtures();

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);

    // A company administrator, so every platform-only route can be shown to
    // reject a principal that holds real company permissions.
    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: `${PREFIX}-TENANT`,
        nameEn: 'E12 Tenant',
        nameAr: 'شركة',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    if (created.status !== 201) {
      throw new Error(`company create failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    companyId = created.body.company.id;
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { companyId, code: 'company_admin' },
    });
    const user = await prisma.user.create({
      data: {
        email: companyEmail,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        fullNameEn: 'E12 Company Admin',
        fullNameAr: 'مدير الشركة',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId, roleId: adminRole.id, isActive: true },
    });
    companyToken = await login(ctx.base, companyEmail, password);
  }, 180_000);

  afterAll(async () => {
    await prisma.coupon.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.membership.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { email: companyEmail } });
    await prisma.subscription.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await ctx.app.close();
  }, 180_000);

  describe('ecosystem overview', () => {
    it('returns real platform-wide aggregates to a Super Admin', async () => {
      const res = await call<{
        metrics: Record<string, { key: string; value: number; amountMinor: number | null }>;
        providerStatus: Array<{ key: string; count: number }>;
        orderStatus: Array<{ key: string; count: number }>;
        bookingStatus: Array<{ key: string; count: number }>;
        revenueTrend: Array<{ period: string; amountMinor: number }>;
        currency: string;
      }>(ctx.base, '/platform/ecosystem', { token: superToken });

      expect(res.status).toBe(200);
      expect(res.body.currency).toBe('BHD');

      // Every metric is present and numeric.
      for (const key of [
        'customers',
        'providers',
        'pendingProviders',
        'products',
        'services',
        'orders',
        'bookings',
        'revenueMinor',
        'paymentsSucceeded',
        'refunds',
        'activePromotions',
        'pendingApprovals',
        'inspections',
        'notifications',
      ]) {
        expect(res.body.metrics[key]).toBeDefined();
        expect(typeof res.body.metrics[key].value).toBe('number');
        expect(res.body.metrics[key].value).toBeGreaterThanOrEqual(0);
      }

      // The provider count is a genuine aggregate: it must equal what a direct
      // count over the same table returns.
      const providerCount = await prisma.marketplaceProvider.count();
      expect(res.body.metrics.providers.value).toBe(providerCount);

      const customerCount = await prisma.customerAccount.count();
      expect(res.body.metrics.customers.value).toBe(customerCount);

      // Revenue is summed in minor units from succeeded intents only.
      const succeeded = await prisma.paymentIntent.aggregate({
        where: { status: 'SUCCEEDED' },
        _sum: { amountMinor: true },
      });
      expect(res.body.metrics.revenueMinor.value).toBe(Number(succeeded._sum.amountMinor ?? 0));

      // The twelve-month trend is unbroken and each bucket is numeric.
      expect(res.body.revenueTrend).toHaveLength(12);
      for (const point of res.body.revenueTrend) {
        expect(point.period).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof point.amountMinor).toBe('number');
      }
    });

    it('refuses a company administrator', async () => {
      const res = await call(ctx.base, '/platform/ecosystem', { token: companyToken });
      expect([403, 404]).toContain(res.status);
    });

    it('refuses an anonymous caller', async () => {
      const res = await call(ctx.base, '/platform/ecosystem');
      expect(res.status).toBe(401);
    });
  });

  describe('coupons', () => {
    it('creates, reads, updates and lists a coupon as a Super Admin', async () => {
      const code = `${PREFIX}PERCENT`;
      const created = await call<{
        id: string;
        code: string;
        discountType: string;
        percentOffBp: number;
        isActive: boolean;
      }>(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: {
          code,
          descriptionEn: '15% off',
          discountType: 'PERCENT',
          percentOffBp: 1500,
          minOrderMinor: 0,
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.code).toBe(code);
      expect(created.body.discountType).toBe('PERCENT');
      expect(created.body.percentOffBp).toBe(1500);
      createdCouponIds.push(created.body.id);

      const read = await call<{ code: string; isActive: boolean }>(
        ctx.base,
        `/coupons/${created.body.id}`,
        { token: superToken },
      );
      expect(read.status).toBe(200);
      expect(read.body.code).toBe(code);

      const updated = await call<{ isActive: boolean; percentOffBp: number }>(
        ctx.base,
        `/coupons/${created.body.id}`,
        { method: 'PATCH', token: superToken, body: { isActive: false, percentOffBp: 2000 } },
      );
      expect(updated.status).toBe(200);
      expect(updated.body.isActive).toBe(false);
      expect(updated.body.percentOffBp).toBe(2000);

      const list = await call<{ items: Array<{ code: string }> }>(
        ctx.base,
        '/coupons?includeInactive=true',
        { token: superToken },
      );
      expect(list.status).toBe(200);
      expect(list.body.items.some((c) => c.code === code)).toBe(true);
    });

    it('rejects a duplicate code', async () => {
      const code = `${PREFIX}DUP`;
      const first = await call<{ id: string }>(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: { code, discountType: 'PERCENT', percentOffBp: 1000 },
      });
      expect(first.status).toBe(201);
      createdCouponIds.push(first.body.id);

      const second = await call(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: { code, discountType: 'PERCENT', percentOffBp: 1000 },
      });
      expect(second.status).toBe(409);
    });

    it('rejects a percentage outside 0–100%', async () => {
      const res = await call(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: { code: `${PREFIX}BADPCT`, discountType: 'PERCENT', percentOffBp: 20000 },
      });
      expect(res.status).toBe(400);
    });

    it('refuses coupon authoring for a company administrator', async () => {
      const res = await call(ctx.base, '/coupons', {
        method: 'POST',
        token: companyToken,
        body: { code: `${PREFIX}TENANTOWN`, discountType: 'PERCENT', percentOffBp: 1000 },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('validates a percentage coupon and caps the discount at the subtotal', async () => {
      const code = `${PREFIX}VALPCT`;
      const created = await call<{ id: string }>(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: { code, discountType: 'PERCENT', percentOffBp: 1500, isActive: true },
      });
      expect(created.status).toBe(201);
      createdCouponIds.push(created.body.id);

      const ok = await call<{ valid: boolean; discountMinor: number; code: string }>(
        ctx.base,
        '/coupons/validate',
        { method: 'POST', body: { code, subtotalMinor: 10000 } },
      );
      expect(ok.status).toBe(201);
      expect(ok.body.valid).toBe(true);
      expect(ok.body.discountMinor).toBe(1500);

      // A 100% coupon can never exceed the subtotal.
      const full = await call<{ id: string }>(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: { code: `${PREFIX}FULL`, discountType: 'PERCENT', percentOffBp: 10000, isActive: true },
      });
      createdCouponIds.push(full.body.id);
      const capped = await call<{ valid: boolean; discountMinor: number }>(
        ctx.base,
        '/coupons/validate',
        { method: 'POST', body: { code: `${PREFIX}FULL`, subtotalMinor: 3000 } },
      );
      expect(capped.body.valid).toBe(true);
      expect(capped.body.discountMinor).toBe(3000);
    });

    it('rejects an unknown code with a reason rather than an error', async () => {
      const res = await call<{ valid: boolean; reason: string }>(ctx.base, '/coupons/validate', {
        method: 'POST',
        body: { code: `${PREFIX}NOPE`, subtotalMinor: 5000 },
      });
      expect(res.status).toBe(201);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe('NOT_FOUND');
    });

    it('rejects an inactive coupon and one below its minimum order', async () => {
      const inactive = await call<{ id: string }>(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: { code: `${PREFIX}OFF`, discountType: 'PERCENT', percentOffBp: 1000, isActive: false },
      });
      createdCouponIds.push(inactive.body.id);
      const inactiveRes = await call<{ valid: boolean; reason: string }>(
        ctx.base,
        '/coupons/validate',
        { method: 'POST', body: { code: `${PREFIX}OFF`, subtotalMinor: 10000 } },
      );
      expect(inactiveRes.body.valid).toBe(false);
      expect(inactiveRes.body.reason).toBe('INACTIVE');

      const minOrder = await call<{ id: string }>(ctx.base, '/coupons', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${PREFIX}MIN`,
          discountType: 'FIXED',
          amountOffMinor: 5000,
          minOrderMinor: 50000,
          isActive: true,
        },
      });
      createdCouponIds.push(minOrder.body.id);
      const below = await call<{ valid: boolean; reason: string }>(ctx.base, '/coupons/validate', {
        method: 'POST',
        body: { code: `${PREFIX}MIN`, subtotalMinor: 10000 },
      });
      expect(below.body.valid).toBe(false);
      expect(below.body.reason).toBe('BELOW_MINIMUM');
    });
  });

  describe('notification centre', () => {
    it('returns the delivery log and breakdown to a Super Admin', async () => {
      const res = await call<{
        items: unknown[];
        total: number;
        page: number;
        pageSize: number;
      }>(ctx.base, '/notifications/deliveries?pageSize=5', { token: superToken });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.items.length).toBeLessThanOrEqual(5);
    });

    it('returns channel, status and template summary', async () => {
      const res = await call<{
        byChannel: Array<{ key: string; count: number }>;
        byStatus: Array<{ key: string; count: number }>;
        templates: unknown[];
      }>(ctx.base, '/notifications/summary', { token: superToken });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.byChannel)).toBe(true);
      expect(Array.isArray(res.body.byStatus)).toBe(true);
      expect(Array.isArray(res.body.templates)).toBe(true);
    });

    it('refuses the delivery log for a company administrator', async () => {
      const res = await call(ctx.base, '/notifications/deliveries', { token: companyToken });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('role templates', () => {
    it('returns named templates with a permission preview for a Super Admin', async () => {
      const res = await call<{
        templates: Array<{
          code: string;
          nameEn: string;
          permissions: string[];
          totalPermissions: number;
          withheldPermissions: number;
        }>;
      }>(ctx.base, `/permissions/role-templates?companyId=${companyId}`, { token: superToken });
      expect(res.status).toBe(200);
      const codes = res.body.templates.map((t) => t.code);
      expect(codes).toContain('company_admin');
      expect(codes).toContain('hr_officer');
      expect(codes).toContain('finance_officer');

      const hr = res.body.templates.find((t) => t.code === 'hr_officer');
      expect(hr).toBeDefined();
      expect(hr!.permissions).toContain('erp.hr.read');
      // The HR officer must not receive payroll approval in the template.
      expect(hr!.permissions).not.toContain('erp.hr.payroll.approve');
    });

    it('never returns a platform permission inside a company template', async () => {
      const res = await call<{
        templates: Array<{ permissions: string[] }>;
      }>(ctx.base, `/permissions/role-templates?companyId=${companyId}`, { token: superToken });
      const all = res.body.templates.flatMap((t) => t.permissions);
      expect(all.some((code) => code.startsWith('platform.'))).toBe(false);
    });
  });
});
