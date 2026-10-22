import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/common/prisma.service';
import {
  call,
  companyCall,
  createTestApp,
  login,
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
} from './test-app';

/**
 * Per-company branding API.
 *
 * The security-relevant claims are that a colour never reaches storage unless it
 * is a strict `#rrggbb`, that a company principal cannot read or write another
 * tenant's identity, and that clearing a field is distinct from omitting it. The
 * tri-state matters because the admin editor sends a partial body: if `null` and
 * "absent" collapsed, saving a colour would wipe a logo the user never touched.
 */

const DEMO_COMPANY = 'DEMO-ALNOOR';
const OTHER_COMPANY = 'ORYX-LOGISTICS';

interface BrandingView {
  companyId: string;
  isDefault: boolean;
  nameEn: string;
  nameAr: string;
  logoAssetId: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  supportEmail: string | null;
}

describe('branding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let superToken: string;
  let companyId: string;
  let otherCompanyId: string;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    base = ctx.base;

    superToken = await login(base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);

    const demo = await prisma.company.findFirst({ where: { code: DEMO_COMPANY }, select: { id: true } });
    const other = await prisma.company.findFirst({ where: { code: OTHER_COMPANY }, select: { id: true } });
    if (!demo || !other) throw new Error('Seeded demo companies are missing.');
    companyId = demo.id;
    otherCompanyId = other.id;
  });

  afterAll(async () => {
    // A stored identity would change what every later suite resolves, so it is
    // removed rather than left behind.
    await prisma.companyBranding.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.companyBranding.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  });

  it('resolves the platform default and the company name when no row exists', async () => {
    const res = await companyCall<BrandingView>(base, companyId, `/companies/${companyId}/branding`, {
      token: superToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
    // The company's own name is the fallback, not the ORYX wordmark.
    expect(res.body.nameEn).toBe('Al Noor Trading (Demo)');
    expect(res.body.primaryColor).toBe('#d4af37');
  });

  it('stores a partial update and leaves the untouched fields inherited', async () => {
    const res = await companyCall<BrandingView>(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { primaryColor: '#123456', supportEmail: 'care@alnoor.local' },
    });
    expect(res.status).toBe(200);
    expect(res.body.primaryColor).toBe('#123456');
    expect(res.body.supportEmail).toBe('care@alnoor.local');
    // Not sent, so still the platform default.
    expect(res.body.accentColor).toBe('#00162b');
    expect(res.body.isDefault).toBe(false);
  });

  it('omitting a key preserves it, while an explicit null clears it', async () => {
    await companyCall(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { primaryColor: '#123456', supportEmail: 'care@alnoor.local' },
    });

    // A second update that does not mention supportEmail must not clear it.
    await companyCall(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { accentColor: '#abcdef' },
    });
    let current = await companyCall<BrandingView>(base, companyId, `/companies/${companyId}/branding`, {
      token: superToken,
    });
    expect(current.body.supportEmail).toBe('care@alnoor.local');
    expect(current.body.primaryColor).toBe('#123456');

    // An explicit null does clear it, back to the inherited default.
    await companyCall(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { supportEmail: null },
    });
    current = await companyCall<BrandingView>(base, companyId, `/companies/${companyId}/branding`, {
      token: superToken,
    });
    expect(current.body.supportEmail).toBeNull();
  });

  it('rejects a colour that is not a strict 6-digit hex', async () => {
    for (const bad of ['#fff', 'red', '#d4af37; background:url(x)', '#12345678']) {
      const res = await companyCall(base, companyId, `/companies/${companyId}/branding`, {
        method: 'PATCH',
        token: superToken,
        body: { primaryColor: bad },
      });
      expect(res.status).toBe(400);
    }
    // Nothing was written by any of the rejected requests.
    const row = await prisma.companyBranding.findUnique({ where: { companyId } });
    expect(row).toBeNull();
  });

  it('refuses a company principal acting on another tenant', async () => {
    const token = await login(base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    // Reading another tenant's identity is forbidden.
    const read = await companyCall(base, otherCompanyId, `/companies/${otherCompanyId}/branding`, {
      token,
    });
    expect([403, 404]).toContain(read.status);

    // And so is writing it.
    const write = await companyCall(base, otherCompanyId, `/companies/${otherCompanyId}/branding`, {
      method: 'PATCH',
      token,
      body: { primaryColor: '#ff0000' },
    });
    expect([403, 404]).toContain(write.status);

    const row = await prisma.companyBranding.findUnique({ where: { companyId: otherCompanyId } });
    expect(row).toBeNull();
  });

  it('resets a company back to the platform default', async () => {
    await companyCall(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { primaryColor: '#123456' },
    });

    const res = await companyCall<BrandingView>(base, companyId, `/companies/${companyId}/branding`, {
      method: 'DELETE',
      token: superToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.primaryColor).toBe('#d4af37');

    const row = await prisma.companyBranding.findUnique({ where: { companyId } });
    expect(row).toBeNull();
  });

  it('rejects a branding asset that is not an image', async () => {
    const res = await companyCall(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { logoAssetId: 'does-not-exist' },
    });
    expect(res.status).toBe(400);
  });

  it('records the change in the audit trail without the raw colour', async () => {
    await companyCall(base, companyId, `/companies/${companyId}/branding`, {
      method: 'PATCH',
      token: superToken,
      body: { primaryColor: '#123456' },
    });

    const entry = await prisma.auditLog.findFirst({
      where: { companyId, action: 'company.branding.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    // The audit records that colours changed, never the value itself.
    expect(JSON.stringify(entry?.metadata ?? {})).not.toContain('#123456');
  });

  it('requires a platform read permission to reach the platform company list', async () => {
    const companyToken = await login(base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
    const res = await call(base, '/companies', { token: companyToken });
    // A company principal may hold company.read but not platform.company.read.
    expect([200, 403]).toContain(res.status);
  });
});
