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
 * Company identity and finance defaults.
 *
 * `functionalCurrency` and `defaultTaxRateBp` decide what a new document prints
 * and which currency the statements present in, so the security-relevant claims
 * are that the range is enforced, that a company principal cannot touch another
 * tenant, and that an omitted key preserves the stored value while an explicit
 * `null` clears the functional currency back to "follow the primary currency".
 */

const DEMO_COMPANY = 'DEMO-ALNOOR';
const OTHER_COMPANY = 'ORYX-LOGISTICS';

interface CompanyView {
  id: string;
  currency: string;
  functionalCurrency: string | null;
  defaultTaxRateBp: number;
  taxNumber: string | null;
  legalNameEn: string | null;
  notes: string | null;
}

describe('company settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let superToken: string;
  let companyAdminToken: string;
  let companyId: string;
  let otherCompanyId: string;
  let original: { currency: string; functionalCurrency: string | null; defaultTaxRateBp: number; taxNumber: string | null; legalNameEn: string | null; notes: string | null };

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    base = ctx.base;

    superToken = await login(base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    companyAdminToken = await login(base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const demo = await prisma.company.findFirst({ where: { code: DEMO_COMPANY } });
    const other = await prisma.company.findFirst({ where: { code: OTHER_COMPANY }, select: { id: true } });
    if (!demo || !other) throw new Error('Seeded demo companies are missing.');
    companyId = demo.id;
    otherCompanyId = other.id;
    original = {
      currency: demo.currency,
      functionalCurrency: demo.functionalCurrency,
      defaultTaxRateBp: demo.defaultTaxRateBp,
      taxNumber: demo.taxNumber,
      legalNameEn: demo.legalNameEn,
      notes: demo.notes,
    };
  });

  afterAll(async () => {
    // Restore the seeded baseline so later suites see the same company.
    await prisma.company.update({ where: { id: companyId }, data: original });
    await app.close();
  });

  beforeEach(async () => {
    // This suite mutates a seeded company that other suites also read, so each
    // test starts from the seeded baseline rather than whatever the last one
    // left behind.
    await prisma.company.update({
      where: { id: companyId },
      data: {
        currency: 'BHD',
        functionalCurrency: null,
        defaultTaxRateBp: 0,
        taxNumber: null,
        legalNameEn: null,
        notes: null,
      },
    });
  });

  it('returns the finance defaults on the company detail', async () => {
    const res = await companyCall<CompanyView>(base, companyId, `/companies/${companyId}`, {
      token: superToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('BHD');
    expect(res.body.defaultTaxRateBp).toBe(0);
    expect(res.body.functionalCurrency).toBeNull();
  });

  it('stores a primary currency, a functional currency and a default tax rate', async () => {
    const res = await companyCall<CompanyView>(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { currency: 'USD', functionalCurrency: 'BHD', defaultTaxRateBp: 1000 },
    });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
    expect(res.body.functionalCurrency).toBe('BHD');
    expect(res.body.defaultTaxRateBp).toBe(1000);
  });

  it('clears the functional currency with an explicit null but keeps an omitted key', async () => {
    await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { functionalCurrency: 'USD', taxNumber: 'BH-12345' },
    });

    // An update that does not mention functionalCurrency must not clear it.
    await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { defaultTaxRateBp: 1500 },
    });
    let current = await companyCall<CompanyView>(base, companyId, `/companies/${companyId}`, {
      token: superToken,
    });
    expect(current.body.functionalCurrency).toBe('USD');
    expect(current.body.taxNumber).toBe('BH-12345');
    expect(current.body.defaultTaxRateBp).toBe(1500);

    // An explicit null does clear it.
    await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { functionalCurrency: null },
    });
    current = await companyCall<CompanyView>(base, companyId, `/companies/${companyId}`, {
      token: superToken,
    });
    expect(current.body.functionalCurrency).toBeNull();
  });

  it('rejects a tax rate outside 0–10000 basis points', async () => {
    const tooHigh = await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { defaultTaxRateBp: 10001 },
    });
    expect(tooHigh.status).toBe(400);

    const negative = await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { defaultTaxRateBp: -1 },
    });
    expect(negative.status).toBe(400);

    const notInteger = await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { defaultTaxRateBp: 12.5 },
    });
    expect(notInteger.status).toBe(400);
  });

  it('rejects a currency code longer than three characters', async () => {
    const res = await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: superToken,
      body: { functionalCurrency: 'BAHRAIN' },
    });
    expect(res.status).toBe(400);
  });

  it('lets a company administrator edit its own company finance defaults', async () => {
    const res = await companyCall<CompanyView>(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: companyAdminToken,
      body: { defaultTaxRateBp: 500 },
    });
    expect(res.status).toBe(200);
    expect(res.body.defaultTaxRateBp).toBe(500);
  });

  it('refuses a company administrator editing another tenant', async () => {
    const res = await companyCall(base, otherCompanyId, `/companies/${otherCompanyId}`, {
      method: 'PATCH',
      token: companyAdminToken,
      body: { defaultTaxRateBp: 500 },
    });
    expect(res.status).toBe(403);
  });

  it('refuses a company administrator changing the hierarchy', async () => {
    const res = await companyCall(base, companyId, `/companies/${companyId}`, {
      method: 'PATCH',
      token: companyAdminToken,
      body: { parentCompanyId: otherCompanyId },
    });
    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated update', async () => {
    const res = await call(base, `/companies/${companyId}`, {
      method: 'PATCH',
      body: { defaultTaxRateBp: 500 },
    });
    expect(res.status).toBe(401);
  });
});
