import * as argon2 from 'argon2';
import { PrismaService } from '../src/common/prisma.service';
import { call, createTestApp, login, SEED_SUPER_ADMIN, type TestContext } from './test-app';

/**
 * Execution 11 — merchant promotional offers.
 *
 * Real HTTP against the running API, the real guards and the real Prisma layer.
 *
 * The properties asserted are the ones a promotion is most likely to get wrong:
 * that an offer is scoped to the provider that owns it, that a provider user
 * cannot read or edit another provider's offers, that the customer feed only
 * advertises active offers from approved providers inside their window, and
 * that the discount bound is enforced on the server rather than by the client.
 */
describe('Execution 11 — merchant promotional offers (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'E11OFFER';
  const password = 'e11-offer-password-12345';

  let merchantToken = '';
  let nonProviderToken = '';
  let otherMerchantToken = '';

  let providerId = '';
  let otherProviderId = '';
  let merchantCompanyId = '';
  let otherCompanyId = '';

  const merchantEmail = `${PREFIX.toLowerCase()}-merchant@test.local`;
  const nonProviderEmail = `${PREFIX.toLowerCase()}-noprovider@test.local`;
  const otherMerchantEmail = `${PREFIX.toLowerCase()}-other@test.local`;

  const createdOfferIds: string[] = [];

  async function purgeFixtures() {
    const providers = await prisma.marketplaceProvider.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const providerIds = providers.map((p) => p.id);
    const companies = await prisma.company.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const companyIds = companies.map((c) => c.id);

    await prisma.providerOffer.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.providerUser.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.marketplaceProvider.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.subscription.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }

  /** Provision an Enterprise tenant with one admin linked to one provider. */
  async function provisionMerchant(params: {
    companyCode: string;
    providerCode: string;
    providerName: string;
    email: string;
  }) {
    const superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: params.companyCode,
        nameEn: `${params.providerName} Tenant`,
        nameAr: 'شركة',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    if (created.status !== 201) {
      throw new Error(`company create failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    const companyId = created.body.company.id;

    const adminRole = await prisma.role.findFirstOrThrow({
      where: { companyId, code: 'company_admin' },
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: params.email,
        passwordHash,
        fullNameEn: params.providerName,
        fullNameAr: 'مزود',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: user.id, companyId, roleId: adminRole.id, isActive: true },
    });

    const provider = await prisma.marketplaceProvider.create({
      data: {
        code: params.providerCode,
        nameEn: params.providerName,
        nameAr: 'مزود',
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    await prisma.providerUser.create({
      data: { providerId: provider.id, userId: user.id, role: 'OWNER', isActive: true },
    });

    const token = await login(ctx.base, params.email, password);
    return { companyId, providerId: provider.id, token };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    await purgeFixtures();

    const merchant = await provisionMerchant({
      companyCode: `${PREFIX}-MERCH`,
      providerCode: `${PREFIX}-PROV`,
      providerName: 'E11 Offer Merchant',
      email: merchantEmail,
    });
    merchantCompanyId = merchant.companyId;
    providerId = merchant.providerId;
    merchantToken = merchant.token;

    const other = await provisionMerchant({
      companyCode: `${PREFIX}-OTHER`,
      providerCode: `${PREFIX}-OPROV`,
      providerName: 'E11 Other Merchant',
      email: otherMerchantEmail,
    });
    otherCompanyId = other.companyId;
    otherProviderId = other.providerId;
    otherMerchantToken = other.token;

    // An administrator with the same permissions but no provider membership, so
    // provider scope is shown to come from membership and not from the
    // permission alone.
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { companyId: merchantCompanyId, code: 'company_admin' },
    });
    const nonProviderUser = await prisma.user.create({
      data: {
        email: nonProviderEmail,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        fullNameEn: 'E11 No Provider',
        fullNameAr: 'بدون مزود',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: nonProviderUser.id, companyId: merchantCompanyId, roleId: adminRole.id, isActive: true },
    });
    nonProviderToken = await login(ctx.base, nonProviderEmail, password);
  }, 180_000);

  afterAll(async () => {
    await prisma.providerOffer.deleteMany({ where: { providerId: { in: [providerId, otherProviderId] } } });
    await prisma.providerUser.deleteMany({ where: { providerId: { in: [providerId, otherProviderId] } } });
    await prisma.marketplaceProvider.deleteMany({ where: { id: { in: [providerId, otherProviderId] } } });
    await prisma.membership.deleteMany({
      where: { companyId: { in: [merchantCompanyId, otherCompanyId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [merchantEmail, nonProviderEmail, otherMerchantEmail] } },
    });
    await prisma.subscription.deleteMany({
      where: { companyId: { in: [merchantCompanyId, otherCompanyId] } },
    });
    await prisma.company.deleteMany({ where: { id: { in: [merchantCompanyId, otherCompanyId] } } });
    await ctx.app.close();
  }, 180_000);

  // ------------------------------------------------------------------ create

  describe('publishing an offer', () => {
    it('creates an offer scoped to the caller provider', async () => {
      const res = await call<{ id: string; providerId: string; percentOffBp: number }>(
        ctx.base,
        '/provider/offers',
        {
          method: 'POST',
          token: merchantToken,
          body: {
            titleEn: 'Winter Service 15% Off',
            titleAr: 'خصم ١٥٪',
            description: 'Valid on all workshop services.',
            percentOffBp: 1_500,
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.providerId).toBe(providerId);
      expect(res.body.percentOffBp).toBe(1_500);
      createdOfferIds.push(res.body.id);
    });

    it('refuses a discount above 100%', async () => {
      const res = await call(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: { titleEn: 'Bad', titleAr: 'خطأ', percentOffBp: 10_001 },
      });
      expect(res.status).toBe(400);
    });

    it('refuses an offer that ends before it starts', async () => {
      const res = await call(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: {
          titleEn: 'Backwards',
          titleAr: 'معكوس',
          percentOffBp: 500,
          startsAt: '2027-01-10T00:00:00.000Z',
          endsAt: '2027-01-01T00:00:00.000Z',
        },
      });
      expect(res.status).toBe(400);
    });

    it('refuses a caller with the permission but no provider membership', async () => {
      const res = await call(ctx.base, '/provider/offers', {
        method: 'POST',
        token: nonProviderToken,
        body: { titleEn: 'Nope', titleAr: 'لا', percentOffBp: 100 },
      });
      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------------------ isolate

  describe('provider isolation', () => {
    it('lists only the caller provider offers', async () => {
      await call(ctx.base, '/provider/offers', {
        method: 'POST',
        token: otherMerchantToken,
        body: { titleEn: 'Other Only', titleAr: 'أخرى', percentOffBp: 2_000 },
      });

      const mine = await call<Array<{ id: string; providerId: string }>>(ctx.base, '/provider/offers', {
        token: merchantToken,
      });
      expect(mine.status).toBe(200);
      expect(mine.body.length).toBeGreaterThan(0);
      expect(mine.body.every((o) => o.providerId === providerId)).toBe(true);
    });

    it('cannot edit another provider offer', async () => {
      const theirs = await prisma.providerOffer.findFirstOrThrow({ where: { providerId: otherProviderId } });
      const res = await call(ctx.base, `/provider/offers/${theirs.id}`, {
        method: 'PATCH',
        token: merchantToken,
        body: { percentOffBp: 9_000 },
      });
      expect(res.status).toBe(404);
    });

    it('withdraws its own offer', async () => {
      const offer = createdOfferIds[0]!;
      const res = await call<{ isActive: boolean }>(ctx.base, `/provider/offers/${offer}`, {
        method: 'PATCH',
        token: merchantToken,
        body: { isActive: false },
      });
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  // ------------------------------------------------------------------ public

  describe('customer feed', () => {
    it('advertises an active offer from an approved provider', async () => {
      const created = await call<{ id: string }>(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: { titleEn: 'Spring 20% Off', titleAr: 'خصم الربيع', percentOffBp: 2_000 },
      });
      expect(created.status).toBe(201);

      const feed = await call<Array<{ id: string; providerId: string }>>(
        ctx.base,
        '/customer/catalog/offers',
      );
      expect(feed.status).toBe(200);
      expect(feed.body.some((o) => o.id === created.body.id)).toBe(true);
    });

    it('hides a withdrawn offer', async () => {
      const created = await call<{ id: string }>(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: { titleEn: 'Withdrawn', titleAr: 'مسحوب', percentOffBp: 100 },
      });
      await call(ctx.base, `/provider/offers/${created.body.id}`, {
        method: 'PATCH',
        token: merchantToken,
        body: { isActive: false },
      });

      const feed = await call<Array<{ id: string }>>(ctx.base, '/customer/catalog/offers');
      expect(feed.body.some((o) => o.id === created.body.id)).toBe(false);
    });

    it('hides an expired offer', async () => {
      const created = await call<{ id: string }>(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: {
          titleEn: 'Last Month',
          titleAr: 'الشهر الماضي',
          percentOffBp: 100,
          startsAt: '2020-01-01T00:00:00.000Z',
          endsAt: '2020-02-01T00:00:00.000Z',
        },
      });
      expect(created.status).toBe(201);

      const feed = await call<Array<{ id: string }>>(ctx.base, '/customer/catalog/offers');
      expect(feed.body.some((o) => o.id === created.body.id)).toBe(false);
    });

    it('hides an offer from a suspended provider', async () => {
      const created = await call<{ id: string }>(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: { titleEn: 'Suspended Soon', titleAr: 'معلّق', percentOffBp: 300 },
      });
      await prisma.marketplaceProvider.update({
        where: { id: providerId },
        data: { status: 'SUSPENDED' },
      });
      const feed = await call<Array<{ id: string }>>(ctx.base, '/customer/catalog/offers');
      expect(feed.body.some((o) => o.id === created.body.id)).toBe(false);

      await prisma.marketplaceProvider.update({
        where: { id: providerId },
        data: { status: 'APPROVED' },
      });
    });
  });
});
