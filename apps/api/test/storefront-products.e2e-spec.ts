import {
  SEED_ORYX_AUTO_ADMIN,
  call,
  cleanupFixtures,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Storefront product management (e2e).
 *
 * The homepage featured rail, the spare-parts store and every product page read
 * the same published catalogue. This suite proves the loop the owner asked for:
 * a product created or published from the admin dashboard becomes visible to the
 * public storefront, and unpublishing or clearing its category removes it again.
 */
describe('Storefront product management (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  /** The ORYX Auto Services tenant that backs the public storefront. */
  let companyId: string;
  const sku = `AUTHZ-WEB-${Date.now()}`;

  const publicCall = <T = unknown>(path: string) => call<T>(ctx.base, path);

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
    adminToken = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    // The storefront resolves its tenant the same way a consumer does; use that
    // exact company so the product we create lands in the catalogue the public
    // endpoints actually read.
    const context = await publicCall<{ companyId: string }>('/storefront/context');
    companyId = context.body.companyId;
  });

  afterAll(async () => {
    await ctx.prisma.product.deleteMany({ where: { sku: { startsWith: 'AUTHZ-WEB-' } } });
    await ctx.app.close();
  });

  const admin = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    call<T>(ctx.base, path, {
      ...options,
      token: adminToken,
      headers: { ...(options.headers ?? {}), 'x-oryx-company-id': companyId },
    });

  it('rejects publishing a product that has no spare-parts category', async () => {
    const created = await admin<{ id: string }>('/inventory/products', {
      method: 'POST',
      body: {
        sku,
        nameEn: 'Test filter',
        nameAr: 'فلتر اختبار',
        salesPriceMinor: 2500,
        isPublished: true,
      },
    });
    expect(created.status).toBe(400);
  });

  it('creates a published product and exposes it through the admin API', async () => {
    const created = await admin<{
      id: string;
      isPublished: boolean;
      isFeatured: boolean;
      partCategoryKey: string | null;
      brand: string | null;
    }>('/inventory/products', {
      method: 'POST',
      body: {
        sku,
        nameEn: 'Test air filter',
        nameAr: 'فلتر هواء اختبار',
        salesPriceMinor: 2500,
        compareAtPriceMinor: 3500,
        partCategoryKey: 'filters',
        brand: 'ORYX',
        isPublished: true,
        isFeatured: true,
        imageUrl: '/media/part-air-filter.jpg',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.isPublished).toBe(true);
    expect(created.body.isFeatured).toBe(true);
    expect(created.body.partCategoryKey).toBe('filters');
    expect(created.body.brand).toBe('ORYX');
  });

  it('shows the product in the public storefront catalogue', async () => {
    const list = await publicCall<{ items: Array<{ sku: string; brand: string | null }> }>(
      `/storefront/products?search=${sku}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.items.some((p) => p.sku === sku)).toBe(true);
  });

  it('shows the featured product on the homepage rail', async () => {
    const featured = await publicCall<Array<{ sku: string }>>('/storefront/products/featured?limit=16');
    expect(featured.status).toBe(200);
    expect(featured.body.some((p) => p.sku === sku)).toBe(true);
  });

  it('removes the product from the storefront when unpublished', async () => {
    const row = await ctx.prisma.product.findFirstOrThrow({ where: { sku }, select: { id: true } });
    const updated = await admin<{ isPublished: boolean }>(`/inventory/products/${row.id}`, {
      method: 'PATCH',
      body: { isPublished: false },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.isPublished).toBe(false);

    const list = await publicCall<{ items: Array<{ sku: string }> }>(
      `/storefront/products?search=${sku}`,
    );
    expect(list.body.items.some((p) => p.sku === sku)).toBe(false);
  });

  it('refuses to keep a product published once its category is cleared', async () => {
    const row = await ctx.prisma.product.findFirstOrThrow({ where: { sku }, select: { id: true } });
    const updated = await admin<unknown>(`/inventory/products/${row.id}`, {
      method: 'PATCH',
      body: { isPublished: true, partCategoryKey: '' },
    });
    expect(updated.status).toBe(400);
  });

  it('leaves the public catalogue readable without a session', async () => {
    const list = await publicCall<{ items: unknown[]; total: number }>('/storefront/products');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);
  });

  it('reports which days are actually bookable for a branch', async () => {
    const branches = await publicCall<Array<{ id: string }>>('/storefront/branches');
    expect(branches.status).toBe(200);
    const branchId = branches.body[0].id;

    const days = await publicCall<{ days: Array<{ date: string; slots: number }> }>(
      `/storefront/availability/days?days=14&durationMinutes=60&branchId=${branchId}`,
    );
    expect(days.status).toBe(200);
    expect(days.body.days).toHaveLength(14);
    for (const day of days.body.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.slots).toBeGreaterThanOrEqual(0);
    }
    // The Bahrain weekend (Fri/Sat) has no openings, so a fortnight that is
    // entirely empty would mean the availability engine is not being consulted.
    expect(days.body.days.some((d) => d.slots > 0)).toBe(true);
  });
});
