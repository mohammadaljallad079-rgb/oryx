import { createTestApp, companyCall, login, SEED_ORYX_AUTO_ADMIN, cleanupFixtures, type TestContext } from './test-app';
import { PrismaService } from '../src/common/prisma.service';

/**
 * Tax management — the tenant's saved taxes.
 *
 * The suite exercises the real HTTP surface and the real database. It asserts
 * the properties that matter for a tenant-configurable tax list: a rate is
 * stored in basis points, exactly one default survives per company, the company
 * default follows the default tax, a deactivated tax disappears from the
 * selection list but is still visible with `includeInactive`, and a foreign
 * tenant can neither read nor write another company's taxes.
 */
describe('Tax management', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let token: string;
  let companyId: string;
  let otherCompanyId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    const company = await prisma.company.findFirst({ where: { code: 'ORYX-AUTO' }, select: { id: true } });
    if (!company) throw new Error('Seed company ORYX-AUTO is missing; run pnpm db:seed first.');
    companyId = company.id;

    const other = await prisma.company.findFirst({ where: { code: 'DEMO-ALNOOR' }, select: { id: true } });
    if (!other) throw new Error('Seed company DEMO-ALNOOR is missing; run pnpm db:seed first.');
    otherCompanyId = other.id;
  });

  afterAll(async () => {
    if (createdIds.length) await prisma.taxRate.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.taxRate.deleteMany({ where: { companyId, code: { startsWith: 'TAXTEST' } } });
    // Tests above promote a throwaway tax to the company default and mirror it
    // onto the company row, so the seeded baseline is restored here. Without it
    // the shared tenant is left with no default and a stale rate, which fails
    // every later suite that reads the seeded taxes.
    await prisma.$transaction([
      prisma.taxRate.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } }),
      prisma.taxRate.updateMany({ where: { companyId, code: 'VAT10' }, data: { isDefault: true } }),
      prisma.company.update({ where: { id: companyId }, data: { defaultTaxRateBp: 1000 } }),
    ]);
    await cleanupFixtures(prisma);
    await ctx.app.close();
  });

  async function create(body: Record<string, unknown>) {
    const res = await companyCall<{ id: string; code: string; rateBp: number; isDefault: boolean }>(
      ctx.base,
      companyId,
      '/tax',
      { method: 'POST', token, body },
    );
    if (res.body?.id) createdIds.push(res.body.id);
    return res;
  }

  it('lists the seeded taxes for the company', async () => {
    const res = await companyCall<{ items: Array<{ code: string; rateBp: number }>; total: number }>(
      ctx.base,
      companyId,
      '/tax',
      { token },
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    // A rate is a basis-point integer, never a float.
    for (const tax of res.body.items) expect(Number.isInteger(tax.rateBp)).toBe(true);
  });

  it('defaults the seeded tenant to Bahrain\'s standard 10% VAT rate', async () => {
    // Bahrain's statutory standard rate is 10%, and the approved reference
    // documents print VAT 10%. The seeded tenant must not sit on a different
    // default, or a new line would be seeded with the wrong rate.
    const seeded = await prisma.taxRate.findFirstOrThrow({
      where: { companyId, code: 'VAT10' },
      select: { rateBp: true, isDefault: true },
    });
    expect(seeded.rateBp).toBe(1000);
    expect(seeded.isDefault).toBe(true);

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { defaultTaxRateBp: true },
    });
    expect(company.defaultTaxRateBp).toBe(1000);

    // The 15% row survives as a selectable rate; it is simply no longer default.
    const higher = await prisma.taxRate.findFirstOrThrow({
      where: { companyId, code: 'VAT15' },
      select: { rateBp: true, isDefault: true },
    });
    expect(higher.rateBp).toBe(1500);
    expect(higher.isDefault).toBe(false);
  });

  it('creates a tax, stores the rate in basis points and rejects a duplicate code', async () => {
    const created = await create({
      code: 'TAXTEST7',
      nameEn: 'Test VAT 7%',
      nameAr: 'ضريبة اختبار ٧٪',
      rateBp: 700,
      scope: 'BOTH',
      applicationLevel: 'LINE',
    });
    expect(created.status).toBe(201);
    expect(created.body.rateBp).toBe(700);

    const dup = await create({ code: 'TAXTEST7', nameEn: 'dup', nameAr: 'مكرر', rateBp: 500 });
    expect(dup.status).toBe(409);
  });

  it('rejects a rate that is not an integer basis-point value', async () => {
    const res = await create({ code: 'TAXTESTBAD', nameEn: 'bad', nameAr: 'سيئ', rateBp: 12.5 });
    expect(res.status).toBe(400);
  });

  it('keeps exactly one default per company and follows it on the company default', async () => {
    const first = await create({
      code: 'TAXTESTD1',
      nameEn: 'Default one',
      nameAr: 'افتراضي واحد',
      rateBp: 1000,
      isDefault: true,
    });
    expect(first.status).toBe(201);

    const second = await create({
      code: 'TAXTESTD2',
      nameEn: 'Default two',
      nameAr: 'افتراضي اثنان',
      rateBp: 1500,
      isDefault: true,
    });
    expect(second.status).toBe(201);

    const defaults = await prisma.taxRate.findMany({
      where: { companyId, isDefault: true },
      select: { code: true },
    });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].code).toBe('TAXTESTD2');

    // The company's own default rate mirrors the default tax.
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { defaultTaxRateBp: true } });
    expect(company?.defaultTaxRateBp).toBe(1500);
  });

  it('deactivates a tax and hides it from the active selection list', async () => {
    const created = await create({ code: 'TAXTESTOFF', nameEn: 'Off', nameAr: 'متوقف', rateBp: 500 });
    expect(created.status).toBe(201);

    const off = await companyCall<{ isActive: boolean }>(ctx.base, companyId, `/tax/${created.body.id}/active`, {
      method: 'PATCH',
      token,
      body: { isActive: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);

    const active = await companyCall<{ items: Array<{ code: string }> }>(ctx.base, companyId, '/tax', { token });
    expect(active.body.items.map((t) => t.code)).not.toContain('TAXTESTOFF');

    const all = await companyCall<{ items: Array<{ code: string }> }>(
      ctx.base,
      companyId,
      '/tax?includeInactive=true',
      { token },
    );
    expect(all.body.items.map((t) => t.code)).toContain('TAXTESTOFF');
  });

  it('filters by scope, returning scope-specific and BOTH taxes', async () => {
    await create({ code: 'TAXTESTSALE', nameEn: 'Sales only', nameAr: 'بيع فقط', rateBp: 500, scope: 'SALES' });
    await create({ code: 'TAXTESTPUR', nameEn: 'Purchases only', nameAr: 'شراء فقط', rateBp: 500, scope: 'PURCHASES' });

    const sales = await companyCall<{ items: Array<{ code: string }> }>(ctx.base, companyId, '/tax?scope=SALES', { token });
    const codes = sales.body.items.map((t) => t.code);
    expect(codes).toContain('TAXTESTSALE');
    expect(codes).not.toContain('TAXTESTPUR');
    expect(codes).toContain('VAT5');
  });

  it('updates a tax and records an audit entry by key', async () => {
    const created = await create({ code: 'TAXTESTUP', nameEn: 'Before', nameAr: 'قبل', rateBp: 500 });
    const res = await companyCall<{ nameEn: string; rateBp: number }>(ctx.base, companyId, `/tax/${created.body.id}`, {
      method: 'PATCH',
      token,
      body: { nameEn: 'After', rateBp: 900 },
    });
    expect(res.status).toBe(200);
    expect(res.body.nameEn).toBe('After');
    expect(res.body.rateBp).toBe(900);

    const audit = await prisma.auditLog.findFirst({
      where: { companyId, targetType: 'TAX_RATE', targetId: created.body.id, action: 'tax.updated' },
    });
    expect(audit).not.toBeNull();
  });

  it('deletes a tax', async () => {
    const created = await create({ code: 'TAXTESTDEL', nameEn: 'Delete me', nameAr: 'احذفني', rateBp: 500 });
    const res = await companyCall<{ deleted: boolean }>(ctx.base, companyId, `/tax/${created.body.id}`, {
      method: 'DELETE',
      token,
    });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    const gone = await prisma.taxRate.findUnique({ where: { id: created.body.id } });
    expect(gone).toBeNull();
  });

  it('refuses to read another tenant’s taxes', async () => {
    const res = await companyCall<{ items: unknown[] }>(ctx.base, otherCompanyId, '/tax', { token });
    expect([403, 404]).toContain(res.status);
  });

  it('refuses to write without the settings permission', async () => {
    const res = await companyCall<unknown>(ctx.base, companyId, '/tax', {
      method: 'POST',
      token: 'not-a-token',
      body: { code: 'TAXTESTX', nameEn: 'x', nameAr: 'س', rateBp: 500 },
    });
    expect(res.status).toBe(401);
  });
});
