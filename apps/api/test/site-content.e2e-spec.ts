import type { INestApplication } from '@nestjs/common';
import { DEFAULT_SITE_CONTENT } from '@oryx/shared';
import {
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

interface SiteContentDto {
  id: string;
  key: string;
  locale: string;
  data: typeof DEFAULT_SITE_CONTENT.ar;
  isDefault: boolean;
}

/**
 * Website content integration suite.
 *
 * The public website reads its hero, trust strip and section headings from a
 * single admin-editable document. This suite proves the document is stored and
 * served through the real API, that a company administrator cannot edit it
 * (it is a platform-level permission) and that the public endpoint merges the
 * approved defaults so an untouched site is never blank.
 */
describe('ORYX website content (e2e)', () => {
  let ctx: TestContext;
  let superToken: string;
  let companyToken: string;
  let originalAr: Record<string, unknown> | null = null;

  beforeAll(async () => {
    ctx = await createTestApp();
    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    companyToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const existing = await ctx.prisma.siteContent.findUnique({
      where: { key_locale: { key: 'website', locale: 'ar' } },
    });
    originalAr = (existing?.data as Record<string, unknown>) ?? null;
  });

  afterAll(async () => {
    // Restore the seeded document so later suites see the approved baseline.
    if (originalAr) {
      await ctx.prisma.siteContent.update({
        where: { key_locale: { key: 'website', locale: 'ar' } },
        data: { data: originalAr as never },
      });
    }
    await ctx.app.close();
  });

  it('serves the approved defaults on the public endpoint without a token', async () => {
    const res = await call<{ site: typeof DEFAULT_SITE_CONTENT.ar }>(
      ctx.base,
      '/cms/public/content?locale=ar',
    );
    expect(res.status).toBe(200);
    expect(res.body.site.hero.slides.length).toBeGreaterThanOrEqual(4);
    expect(res.body.site.palette.gold).toBe('#d4af37');
    expect(res.body.site.contact.email.length).toBeGreaterThan(0);
  });

  it('refuses a company administrator (platform-level permission)', async () => {
    const res = await call(ctx.base, '/cms/site-content?locale=ar', { token: companyToken });
    expect(res.status).toBe(403);
  });

  it('returns the merged document to a platform administrator', async () => {
    const res = await call<SiteContentDto>(ctx.base, '/cms/site-content?locale=ar', {
      token: superToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('website');
    expect(res.body.data.brand.nameAr.length).toBeGreaterThan(0);
    expect(res.body.data.hero.slides.length).toBeGreaterThanOrEqual(4);
  });

  it('stores an edit and reflects it on both the admin and public endpoints', async () => {
    const before = await call<SiteContentDto>(ctx.base, '/cms/site-content?locale=ar', {
      token: superToken,
    });
    const edited = structuredClone(before.body.data);
    edited.contact.phone = '+973 1700 0000';
    edited.sections.services.titleAr = 'خدماتنا المميزة';

    const put = await call<SiteContentDto>(ctx.base, '/cms/site-content', {
      method: 'PUT',
      token: superToken,
      body: { locale: 'ar', data: edited },
    });
    expect(put.status).toBe(200);
    expect(put.body.data.contact.phone).toBe('+973 1700 0000');

    // The edit survives a fresh read (it is in the database, not in memory).
    const readBack = await call<SiteContentDto>(ctx.base, '/cms/site-content?locale=ar', {
      token: superToken,
    });
    expect(readBack.body.data.contact.phone).toBe('+973 1700 0000');
    expect(readBack.body.data.sections.services.titleAr).toBe('خدماتنا المميزة');

    // And the public website sees it too.
    const publicRead = await call<{ site: typeof DEFAULT_SITE_CONTENT.ar }>(
      ctx.base,
      '/cms/public/content?locale=ar',
    );
    expect(publicRead.body.site.contact.phone).toBe('+973 1700 0000');
  });

  it('drops unknown keys and keeps untouched defaults', async () => {
    const res = await call<SiteContentDto>(ctx.base, '/cms/site-content', {
      method: 'PUT',
      token: superToken,
      body: {
        locale: 'ar',
        data: { contact: { phone: '+973 1711 1111' }, rogue: { nested: true } },
      },
    });
    expect(res.status).toBe(200);
    // The stored document carries the override...
    expect(res.body.data.contact.phone).toBe('+973 1711 1111');
    // ...and the merged response still carries every default the edit omitted.
    expect(res.body.data.footer.introAr).toBe(DEFAULT_SITE_CONTENT.ar.footer.introAr);
    expect((res.body.data as unknown as Record<string, unknown>).rogue).toBeUndefined();
  });
});
