import type { ModuleStatus } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';
import { call, companyCall, createTestApp, login, SEED_COMPANY_ADMIN, SEED_SUPER_ADMIN, type TestContext } from './test-app';

/**
 * Execution 20 — the editable module catalog.
 *
 * The catalog used to be a compile-time constant: the admin screen could only
 * read it. These tests assert the three properties that make the new editor
 * safe: a platform principal can change a row and the change is really stored,
 * a company principal cannot (the catalog is platform-owned), and a module can
 * be restored to its shipped definition. The typography section is also asserted
 * here because it is the one settings section the shell applies to the document
 * root, so it must round-trip through the database.
 */
describe('Execution 20 — editable module catalog (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let superToken = '';
  let companyAdminToken = '';

  const targetKey = 'reports_analytics';
  let moduleId = '';
  let original: {
    nameEn: string;
    nameAr: string;
    descriptionEn: string;
    descriptionAr: string;
    group: string;
    icon: string;
    tileImage: string | null;
    route: string;
    status: ModuleStatus;
    sortOrder: number;
    isActive: boolean;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    companyAdminToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const row = await prisma.module.findFirstOrThrow({ where: { key: targetKey } });
    moduleId = row.id;
    original = {
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      descriptionEn: row.descriptionEn,
      descriptionAr: row.descriptionAr,
      group: row.group,
      icon: row.icon,
      tileImage: row.tileImage,
      route: row.route,
      status: row.status,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
  });

  afterAll(async () => {
    // The catalog is global, so a leftover edit would change every later suite.
    await prisma.module.update({ where: { id: moduleId }, data: original });
    await ctx.app.close();
  });

  it('lists the catalog with the new editing fields', async () => {
    const res = await call<{ items: Array<Record<string, unknown>> }>(ctx.base, '/modules', { token: superToken });
    expect(res.status).toBe(200);
    const row = res.body.items.find((m) => m.key === targetKey);
    expect(row).toBeDefined();
    expect(row).toHaveProperty('tileImage');
    expect(row).toHaveProperty('isActive');
  });

  it('lets a platform principal rename a module and persists it', async () => {
    const res = await call(ctx.base, `/modules/${moduleId}`, {
      method: 'PATCH',
      token: superToken,
      body: { nameEn: 'Reports & Analytics', tileImage: 'tile-reports', isActive: false },
    });
    expect(res.status).toBe(200);

    const stored = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
    expect(stored.nameEn).toBe('Reports & Analytics');
    expect(stored.tileImage).toBe('tile-reports');
    expect(stored.isActive).toBe(false);
  });

  it('reflects the edited name in the dashboard tiles', async () => {
    const res = await call<{ tiles: Array<{ moduleKey: string; nameEn: string }> }>(ctx.base, '/dashboard', {
      token: superToken,
    });
    expect(res.status).toBe(200);
    const tile = res.body.tiles.find((t) => t.moduleKey === targetKey);
    expect(tile?.nameEn).toBe('Reports & Analytics');
  });

  it('refuses a company principal editing the catalog', async () => {
    const res = await companyCall(ctx.base, 'ignored', `/modules/${moduleId}`, {
      method: 'PATCH',
      token: companyAdminToken,
      body: { nameEn: 'Hacked' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const stored = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
    expect(stored.nameEn).toBe('Reports & Analytics');
  });

  it('restores the shipped definition', async () => {
    const res = await call(ctx.base, `/modules/${moduleId}/restore-defaults`, {
      method: 'POST',
      token: superToken,
    });
    expect(res.status).toBe(201);
    const stored = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
    expect(stored.nameEn).toBe(original.nameEn);
    expect(stored.isActive).toBe(true);
    expect(stored.tileImage).toBe(original.tileImage);
  });

  it('round-trips the typography section for a company', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { code: 'DEMO-ALNOOR' } });
    const save = await companyCall(ctx.base, company.id, '/company-settings/typography', {
      method: 'PUT',
      token: companyAdminToken,
      body: { baseSize: 17, headingScale: 1.6, fontFamily: 'system' },
    });
    expect(save.status).toBe(200);

    const read = await companyCall<Record<string, unknown>>(ctx.base, company.id, '/company-settings/typography', {
      token: companyAdminToken,
    });
    expect(read.status).toBe(200);
    expect(read.body.baseSize).toBe(17);
    expect(read.body.fontFamily).toBe('system');

    await prisma.companySetting.deleteMany({ where: { companyId: company.id, section: 'typography' } });
  });
});
