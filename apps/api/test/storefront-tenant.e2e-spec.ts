import {
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * The storefront tenant (e2e).
 *
 * The public website is the storefront of one company — ORYX Auto Services —
 * and a Super Admin names it in the platform settings. These assertions pin the
 * three things that make that true rather than decorative:
 *
 *  - `storefront.company_id` is the setting that decides the tenant, and it is
 *    writable only by a platform principal;
 *  - an inactive or unknown company is refused, so the site can never be pointed
 *    at a tenant that does not exist;
 *  - `GET /customer/catalog/products?storefront=true` resolves that company on
 *    the server, so the website cannot list another tenant's stock even if a
 *    stale link carries an old company id.
 *
 * The setting is global state, so every test restores it.
 */
describe('Storefront tenant (e2e)', () => {
  let ctx: TestContext;
  let superToken: string;
  let defaultCompanyId: string;
  /** A different tenant that actually sells published products. */
  let otherCompanyId: string;
  let previousSetting: string;

  const SETTING = 'storefront.company_id';

  interface CatalogPage {
    total: number;
    items: Array<{ id: string; storeId: string }>;
  }

  const context = () => call<{ companyId: string; nameEn: string }>(ctx.base, '/storefront/context');

  const catalog = (query: string) =>
    call<CatalogPage>(ctx.base, `/customer/catalog/products?${query}`);

  const setSetting = (value: string | null) =>
    call(ctx.base, '/platform/settings', {
      method: 'PATCH',
      token: superToken,
      body: { storefrontCompanyId: value },
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    defaultCompanyId = (await context()).body.companyId;

    const sold = await ctx.prisma.product.groupBy({
      by: ['companyId'],
      where: { isActive: true, salesPriceMinor: { gt: 0 } },
      _count: { _all: true },
    });
    const candidate = sold.find((row) => row.companyId !== defaultCompanyId && row._count._all > 0);
    if (!candidate) throw new Error('The seed has no second tenant with published products.');
    otherCompanyId = candidate.companyId;

    const before = await ctx.prisma.platformSetting.findUnique({ where: { key: SETTING } });
    previousSetting = typeof before?.value === 'string' ? before.value : '';
  });

  afterAll(async () => {
    // Global state: leave the platform exactly as this suite found it.
    await setSetting(previousSetting || null);
    await ctx.app.close();
  });

  it('publishes the storefront company setting', async () => {
    const res = await call<{ settings: Record<string, unknown>; storefrontCompany: unknown }>(
      ctx.base,
      '/platform/settings',
      { token: superToken },
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.settings[SETTING]).toBe('string');
  });

  it('moves the whole website to the company a Super Admin chooses', async () => {
    const saved = await setSetting(otherCompanyId);
    expect(saved.status).toBe(200);

    const after = await context();
    expect(after.body.companyId).toBe(otherCompanyId);

    const listed = await catalog('storefront=true&pageSize=50&locale=en');
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBeGreaterThan(0);
    expect(listed.body.items.every((item) => item.storeId === otherCompanyId)).toBe(true);

    // The same page a visitor would see for the tenant directly — no divergence.
    const direct = await catalog(`companyId=${otherCompanyId}&pageSize=50&locale=en`);
    expect(listed.body.total).toBe(direct.body.total);
  });

  it('refuses an unknown or inactive company', async () => {
    const unknown = await setSetting('does-not-exist');
    expect(unknown.status).toBe(400);

    const inactive = await ctx.prisma.company.create({
      data: {
        code: `STOREFRONT-OFF-${Date.now()}`,
        nameEn: 'Storefront Inactive Fixture',
        nameAr: 'شركة غير نشطة للاختبار',
        type: 'SAAS_TENANT',
        status: 'ARCHIVED',
      },
      select: { id: true },
    });
    try {
      const refused = await setSetting(inactive.id);
      expect(refused.status).toBe(400);
    } finally {
      await ctx.prisma.company.delete({ where: { id: inactive.id } });
    }

    // The refused writes changed nothing.
    const after = await context();
    expect(after.body.companyId).toBe(otherCompanyId);
  });

  it('is a platform decision, not a company one', async () => {
    const companyToken = await login(
      ctx.base,
      SEED_COMPANY_ADMIN.email,
      SEED_COMPANY_ADMIN.password,
    );
    const denied = await call(ctx.base, '/platform/settings', {
      method: 'PATCH',
      token: companyToken,
      body: { storefrontCompanyId: otherCompanyId },
    });
    expect(denied.status).toBe(403);
  });

  it('keeps an explicit company filter ahead of the storefront default', async () => {
    await setSetting(otherCompanyId);
    const explicit = await catalog(`storefront=true&companyId=${defaultCompanyId}&pageSize=10`);
    expect(explicit.status).toBe(200);
    expect(explicit.body.items.every((item) => item.storeId === defaultCompanyId)).toBe(true);
  });

  it('falls back to the configured default when the choice is cleared', async () => {
    const cleared = await setSetting(null);
    expect(cleared.status).toBe(200);

    const after = await context();
    expect(after.body.companyId).toBe(defaultCompanyId);
  });
});
