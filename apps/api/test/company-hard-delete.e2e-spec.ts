import { call, createTestApp, login, SEED_COMPANY_ADMIN, SEED_SUPER_ADMIN, type TestContext } from './test-app';

/**
 * Real database regression for irreversible company deletion. Do not remove any
 * seeded demo company: use an isolated throwaway tenant owned by this suite.
 */
describe('Company hard deletion (e2e)', () => {
  let ctx: TestContext;
  let platformToken: string;
  let tenantToken: string;
  let companyId: string | null = null;

  beforeAll(async () => {
    ctx = await createTestApp();
    platformToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    tenantToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
  });

  afterAll(async () => {
    if (companyId) {
      await ctx.prisma.company.deleteMany({ where: { id: companyId } });
    }
    await ctx.app.close();
  });

  it('requires explicit confirmation and a platform deletion permission, then actually removes the tenant', async () => {
    const created = await ctx.prisma.company.create({
      data: {
        code: `DELETE-FIXTURE-${Date.now()}`,
        nameEn: 'Throwaway deletion fixture',
        nameAr: 'شركة اختبار الحذف الفعلي',
        type: 'INTERNAL',
        status: 'ACTIVE',
      },
    });
    companyId = created.id;
    const branch = await ctx.prisma.branch.create({
      data: { companyId: created.id, code: 'TEST-BR', nameEn: 'Fixture Branch', nameAr: 'فرع الاختبار' },
    });

    const denied = await call(ctx.base, `/companies/${created.id}`, {
      token: tenantToken,
      method: 'DELETE',
      body: { confirm: true },
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(await ctx.prisma.company.count({ where: { id: created.id } })).toBe(1);

    const noConfirm = await call(ctx.base, `/companies/${created.id}`, {
      token: platformToken,
      method: 'DELETE',
      body: { confirm: false },
    });
    expect(noConfirm.status).toBe(400);
    expect(await ctx.prisma.company.count({ where: { id: created.id } })).toBe(1);

    const deleted = await call<{ ok: boolean }>(ctx.base, `/companies/${created.id}`, {
      token: platformToken,
      method: 'DELETE',
      body: { confirm: true },
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);
    expect(await ctx.prisma.company.count({ where: { id: created.id } })).toBe(0);
    expect(await ctx.prisma.branch.count({ where: { id: branch.id } })).toBe(0);
    companyId = null;
  });
});
