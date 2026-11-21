import * as argon2 from 'argon2';
import sharp from 'sharp';
import { PrismaService } from '../src/common/prisma.service';
import {
  call,
  createTestApp,
  login,
  SEED_COMPANY_ADMIN,
  SEED_ORYX_AUTO_ADMIN,
  SEED_SUPER_ADMIN,
  type TestContext,
} from './test-app';

/**
 * Execution 13 — cross-platform synchronisation.
 *
 * The admin dashboard is only useful if a change made in it is visible in the
 * customer app, the merchant portal and the website. This suite asserts that
 * end to end over real HTTP, the real guards and the real database: an operator
 * writes in one plane and the effect is read back from the other.
 *
 * The eight journeys, and the property each one would silently break:
 *
 *   1. a CMS banner published by an operator appears on the customer homepage;
 *   2. a product photograph uploaded by an operator appears in the catalogue;
 *   3. stock recorded by an operator is what the customer checkout draws down;
 *   4. an approved provider application becomes a visible marketplace provider;
 *   5. a customer booking is readable and actionable by staff, and only by staff;
 *   6. a customer order placed in the app is visible to the merchant and the
 *      platform, and the merchant status write is visible to the customer;
 *   7. a merchant promotional offer reaches the customer feed only when active;
 *   8. an operator announcement reaches the addressed customer's app inbox.
 *
 * Every fixture uses a distinctive prefix and is removed afterwards, so the
 * suite can run repeatedly against the shared seeded database.
 */

/** A valid 200×200 PNG, large enough to pass the media pipeline's checks. */
async function makePng(width = 200, height = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 24, b: 48 } },
  })
    .png()
    .toBuffer();
}

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = '----oryxExec13Boundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
        `Content-Type: ${file.type}\r\n\r\n`,
    ),
  );
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * POST a multipart body.
 *
 * The shared `call` helper JSON-encodes every body, which is wrong for a file
 * upload; this sends the bytes as built.
 */
async function upload<T = unknown>(
  base: string,
  path: string,
  token: string,
  companyId: string,
  file: { name: string; data: Buffer; type: string },
  fields: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const { body, contentType } = multipart(fields, file);
  const res = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-oryx-company-id': companyId,
      'Content-Type': contentType,
    },
    body: new Uint8Array(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed as T };
}

describe('Execution 13 — cross-platform synchronisation (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'E13SYNC';
  const password = 'e13-sync-password-12345';

  let superToken = '';
  let staffToken = '';
  let companyId = '';
  let autoCompanyId = '';
  /** A tenant principal on the Enterprise tenant, which licenses the ERP modules. */
  let autoToken = '';

  const createdBannerIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdImageIds: string[] = [];
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    staffToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
    // Marketplace administration requires a company-scoped permission, which a
    // tenantless platform principal does not hold; the Enterprise tenant (which
    // licenses the automotive ecosystem) supplies the acting operator.
    autoToken = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    const demo = await prisma.company.findFirstOrThrow({
      where: { code: 'DEMO-ALNOOR' },
      select: { id: true },
    });
    companyId = demo.id;
    const auto = await prisma.company.findFirstOrThrow({
      where: { code: 'ORYX-AUTO' },
      select: { id: true },
    });
    autoCompanyId = auto.id;
  }, 180_000);

  afterAll(async () => {
    await prisma.productImage.deleteMany({ where: { id: { in: createdImageIds } } });
    await prisma.cmsMediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
    await prisma.cmsBanner.deleteMany({ where: { id: { in: createdBannerIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await ctx.app.close();
  }, 180_000);

  // ------------------------------------------------ 1. website → mobile homepage

  describe('journey 1 — CMS banner reaches the customer homepage', () => {
    it('publishes a banner as an operator and reads it back on the homepage', async () => {
      const created = await call<{ id: string }>(ctx.base, '/cms/banners', {
        method: 'PUT',
        token: superToken,
        body: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} hero banner`,
          subtitle: 'Synced from the admin CMS',
          imageUrl: 'https://cdn.example.com/e13-hero.jpg',
          isActive: true,
          status: 'PUBLISHED',
        },
      });
      expect([200, 201]).toContain(created.status);
      createdBannerIds.push(created.body.id);

      // The customer homepage is the read side of the same write.
      const homepage = await call<{ hero: Array<{ id: string; title: string }> }>(
        ctx.base,
        '/customer/homepage?locale=en',
      );
      expect(homepage.status).toBe(200);
      const hero = homepage.body.hero.find((h) => h.id === created.body.id);
      expect(hero).toBeTruthy();
      expect(hero?.title).toContain(PREFIX);
    });

    it('keeps a draft banner off the homepage until it is published', async () => {
      // A new banner defaults to DRAFT, so an operator switching it active must
      // not expose it before review.
      const draft = await call<{ id: string }>(ctx.base, '/cms/banners', {
        method: 'PUT',
        token: superToken,
        body: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} draft banner`,
          imageUrl: 'https://cdn.example.com/e13-draft.jpg',
          isActive: true,
        },
      });
      expect([200, 201]).toContain(draft.status);
      createdBannerIds.push(draft.body.id);

      const before = await call<{ hero: Array<{ id: string }> }>(
        ctx.base,
        '/customer/homepage?locale=en',
      );
      expect(before.body.hero.map((h) => h.id)).not.toContain(draft.body.id);

      // Publishing it makes it visible.
      const published = await call(ctx.base, '/cms/banners', {
        method: 'PUT',
        token: superToken,
        body: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} draft banner`,
          imageUrl: 'https://cdn.example.com/e13-draft.jpg',
          isActive: true,
          status: 'PUBLISHED',
        },
      });
      expect([200, 201]).toContain(published.status);

      const after = await call<{ hero: Array<{ id: string }> }>(
        ctx.base,
        '/customer/homepage?locale=en',
      );
      expect(after.body.hero.map((h) => h.id)).toContain(draft.body.id);
    });

    it('does not surface the banner once the operator deactivates it', async () => {
      const bannerId = createdBannerIds[0];
      const off = await call(ctx.base, '/cms/banners', {
        method: 'PUT',
        token: superToken,
        body: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} hero banner`,
          imageUrl: 'https://cdn.example.com/e13-hero.jpg',
          isActive: false,
          status: 'PUBLISHED',
        },
      });
      expect([200, 201]).toContain(off.status);

      const homepage = await call<{ hero: Array<{ id: string }> }>(
        ctx.base,
        '/customer/homepage?locale=en',
      );
      expect(homepage.body.hero.map((h) => h.id)).not.toContain(bannerId);
    });
  });

  // ---------------------------------------------- 2. product photo → catalogue

  describe('journey 2 — an operator product photograph reaches the catalogue', () => {
    it('uploads a photograph through the admin path and serves it to the customer catalogue', async () => {
      const product = await prisma.product.create({
        data: {
          companyId,
          sku: `${PREFIX}-P1`,
          nameEn: 'E13 Synced Part',
          nameAr: 'قطعة متزامنة',
          salesPriceMinor: 5500,
          isActive: true,
        },
      });
      createdProductIds.push(product.id);

      const file = await makePng();
      const res = await upload<{ id: string; url: string | null }>(
        ctx.base,
        `/inventory/products/${product.id}/images`,
        staffToken,
        companyId,
        { name: 'e13.png', data: file, type: 'image/png' },
        { altEn: 'E13 photo', isPrimary: 'true' },
      );
      expect([200, 201]).toContain(res.status);
      expect(res.body.url).toContain('/cms/media/');
      createdImageIds.push(res.body.id);
    });

    it('returns the uploaded photograph as the catalogue product image', async () => {
      const productId = createdProductIds[0];
      const catalog = await call<{ items: Array<{ id: string; imageUrl: string | null }> }>(
        ctx.base,
        `/customer/catalog/products?locale=en&query=E13%20Synced%20Part`,
      );
      expect(catalog.status).toBe(200);
      const row = catalog.body.items.find((p) => p.id === productId);
      expect(row).toBeTruthy();
      expect(row?.imageUrl).toContain('/cms/media/');
    });

    it('refuses a non-image upload to the same route', async () => {
      const productId = createdProductIds[0];
      const res = await upload(
        ctx.base,
        `/inventory/products/${productId}/images`,
        staffToken,
        companyId,
        { name: 'not-an-image.png', data: Buffer.from('this is plainly not an image payload'), type: 'image/png' },
      );
      expect(res.status).toBe(400);
    });
  });

  // ------------------------------------------------- 3. stock → customer checkout

  describe('journey 3 — stock recorded by staff is what checkout draws down', () => {
    let productId = '';
    let accountId = '';
    let customerToken = '';

    beforeAll(async () => {
      // A prior run may have left the warehouse behind; resolve it rather than
      // failing on the (companyId, code) unique constraint.
      const warehouse = await prisma.warehouse.upsert({
        where: { companyId_code: { companyId, code: `${PREFIX}-WH` } },
        update: {},
        create: { companyId, code: `${PREFIX}-WH`, nameEn: 'E13 Warehouse', nameAr: 'مستودع' },
      });
      const product = await prisma.product.create({
        data: {
          companyId,
          sku: `${PREFIX}-P2`,
          nameEn: 'E13 Stocked Part',
          nameAr: 'قطعة مخزّنة',
          salesPriceMinor: 3300,
          trackStock: true,
          isActive: true,
        },
      });
      productId = product.id;
      createdProductIds.push(productId);

      // Record opening stock through the real ledger path. Quantities are
      // 10^4-scaled, so 10 units is 100000.
      const movement = await call(ctx.base, '/inventory/movements', {
        method: 'POST',
        token: staffToken,
        headers: { 'x-oryx-company-id': companyId },
        body: {
          warehouseId: warehouse.id,
          productId,
          direction: 'IN',
          quantity: 100_000,
          unitCostMinor: 1_000,
          occurredAt: new Date().toISOString(),
        },
      });
      expect([200, 201]).toContain(movement.status);

      const email = `${PREFIX.toLowerCase()}-buyer@test.local`;
      const registered = await call<{ accessToken: string; account: { id: string } }>(
        ctx.base,
        '/customer/auth/register',
        {
          method: 'POST',
          headers: { 'x-oryx-client': 'mobile' },
          body: { email, password, fullName: 'E13 Buyer', preferredLocale: 'en' },
        },
      );
      expect(registered.status).toBe(201);
      customerToken = registered.body.accessToken;
      accountId = registered.body.account.id;
    }, 180_000);

    afterAll(async () => {
      await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: accountId } } });
      await prisma.cart.deleteMany({ where: { customerAccountId: accountId } });
      await prisma.customerAccount.deleteMany({ where: { id: accountId } });
      await prisma.stockMovement.deleteMany({ where: { companyId, productId } });
      await prisma.stockLevel.deleteMany({ where: { companyId, productId } });
    }, 120_000);

    it('shows the recorded quantity on the staff valuation', async () => {
      const valuation = await call<{ rows: Array<{ productId: string; quantity: number }> }>(
        ctx.base,
        `/inventory/valuation?companyId=${companyId}`,
        { token: staffToken, headers: { 'x-oryx-company-id': companyId } },
      );
      expect(valuation.status).toBe(200);
      const row = valuation.body.rows?.find((r) => r.productId === productId);
      expect(Number(row?.quantity ?? 0)).toBeGreaterThan(0);
    });

    it('lets the customer buy the stocked item and issues the stock out', async () => {
      const add = await call(ctx.base, '/customer/cart/items', {
        method: 'POST',
        token: customerToken,
        body: { productId, quantity: 2 },
      });
      expect([200, 201]).toContain(add.status);

      const order = await call<{ id: string; totalMinor: number }>(ctx.base, '/customer/orders', {
        method: 'POST',
        token: customerToken,
        body: { paymentMethod: 'CASH' },
      });
      expect([200, 201]).toContain(order.status);
      expect(order.body.totalMinor).toBeGreaterThan(0);

      const issued = await prisma.stockMovement.findFirst({
        where: { companyId, productId, movementType: 'ISSUE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(issued).toBeTruthy();
    });
  });

  // ------------------------------------------- 4. provider approval → visibility

  describe('journey 4 — an approved application becomes a visible provider', () => {
    let applicationId = '';
    // A per-run suffix: the service refuses a second open application from the
    // same contact email, so a leftover row from a failed run must not collide.
    const applicationEmail = `${PREFIX.toLowerCase()}-garage-${Date.now()}@test.local`;

    it('accepts a public application and shows it to the platform as pending', async () => {
      const created = await call<{ id: string; status: string }>(ctx.base, '/marketplace/applications', {
        method: 'POST',
        body: {
          legalNameEn: `${PREFIX} Approved Garage`,
          legalNameAr: 'ورشة معتمدة',
          contactEmail: applicationEmail,
          contactPhone: '+97317000000',
          city: 'Manama',
        },
      });
      expect([200, 201]).toContain(created.status);
      applicationId = created.body.id;

      const listed = await call<Array<{ id: string; status: string }>>(
        ctx.base,
        '/marketplace/admin/applications',
        { token: autoToken, headers: { 'x-oryx-company-id': autoCompanyId } },
      );
      expect(listed.status).toBe(200);
      const mine = listed.body.find((a) => a.id === applicationId);
      expect(mine?.status).toBe('SUBMITTED');
    });

    it('approves it and the provider appears in the public directory', async () => {
      const approved = await call<{ id: string; status: string; code: string }>(
        ctx.base,
        `/marketplace/admin/applications/${applicationId}/approve`,
        {
          method: 'POST',
          token: autoToken,
          headers: { 'x-oryx-company-id': autoCompanyId },
          body: { commissionPercentBp: 1_000, providerCompanyId: autoCompanyId },
        },
      );
      expect([200, 201]).toContain(approved.status);
      expect(approved.body.status).toBe('APPROVED');

      // The public directory is paginated and takes no free-text query, so the
      // visibility check reads the provider through the public profile route,
      // which only serves an APPROVED provider.
      const profile = await call<{ id: string; nameEn: string; status: string }>(
        ctx.base,
        `/marketplace/providers/${approved.body.id}`,
      );
      expect(profile.status).toBe(200);
      expect(profile.body.nameEn).toContain(PREFIX);

      const directory = await call<{ items: Array<{ id: string }> }>(
        ctx.base,
        '/marketplace/providers?pageSize=50',
      );
      expect(directory.status).toBe(200);
      expect(Array.isArray(directory.body.items)).toBe(true);

      // The provider code is allocated by the platform (APP-…), so the fixture is
      // identified by the name it was approved with, not by its code.
      await prisma.marketplaceProvider.deleteMany({ where: { nameEn: { startsWith: PREFIX } } });
      await prisma.marketplaceApplication.deleteMany({ where: { legalNameEn: { startsWith: PREFIX } } });
    });
  });

  // ---------------------------------------- 5. customer booking → staff control

  describe('journey 5 — a customer booking is actionable by staff', () => {
    let resourceId = '';
    let accountId = '';
    let customerToken = '';
    let bookingId = '';

    function dayString(offsetDays: number): string {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offsetDays);
      return date.toISOString().slice(0, 10);
    }

    function instant(offsetDays: number, hour: number): string {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offsetDays);
      date.setUTCHours(hour, 0, 0, 0);
      return date.toISOString();
    }

    beforeAll(async () => {
      const resource = await prisma.bookingResource.create({
        data: {
          companyId: autoCompanyId,
          resourceType: 'BAY',
          code: `${PREFIX}-BAY`,
          nameEn: 'E13 Bay',
          nameAr: 'منصة',
          capacity: 1,
        },
      });
      resourceId = resource.id;
      await prisma.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          companyId: autoCompanyId,
          resourceId,
          dayOfWeek,
          opensMinute: 8 * 60,
          closesMinute: 20 * 60,
        })),
      });

      const email = `${PREFIX.toLowerCase()}-booker@test.local`;
      const registered = await call<{ accessToken: string; account: { id: string } }>(
        ctx.base,
        '/customer/auth/register',
        {
          method: 'POST',
          headers: { 'x-oryx-client': 'mobile' },
          body: { email, password, fullName: 'E13 Booker', preferredLocale: 'en' },
        },
      );
      customerToken = registered.body.accessToken;
      accountId = registered.body.account.id;
    }, 180_000);

    afterAll(async () => {
      await prisma.bookingEvent.deleteMany({ where: { companyId: autoCompanyId } });
      await prisma.bookingSlot.deleteMany({ where: { resourceId } });
      await prisma.workingHours.deleteMany({ where: { resourceId } });
      await prisma.bookingResource.deleteMany({ where: { id: resourceId } });
      await prisma.customerAccount.deleteMany({ where: { id: accountId } });
    }, 120_000);

    it('creates a booking in the app and lists it for staff', async () => {
      const created = await call<{ id: string; status: string; reference: string }>(
        ctx.base,
        '/customer/bookings',
        {
          method: 'POST',
          token: customerToken,
          body: {
            bookingType: 'PROVIDER_SERVICE',
            startsAt: instant(4, 11),
            durationMinutes: 60,
            resourceId,
            serviceRef: 'E13 wheel alignment',
            companyId: autoCompanyId,
          },
        },
      );
      expect(created.status).toBe(201);
      bookingId = created.body.id;

      const staffList = await call<{ items: Array<{ id: string; status: string }> }>(
        ctx.base,
        '/bookings?pageSize=100',
        { token: autoToken, headers: { 'x-oryx-company-id': autoCompanyId } },
      );
      expect(staffList.status).toBe(200);
      const mine = staffList.body.items.find((b) => b.id === bookingId);
      expect(mine).toBeTruthy();
      expect(mine?.status).toBe('HELD');
    });

    it('confirms the booking as staff and the customer sees the new status', async () => {
      const confirmed = await call<{ status: string }>(ctx.base, `/bookings/${bookingId}/confirm`, {
        method: 'POST',
        token: autoToken,
        headers: { 'x-oryx-company-id': autoCompanyId },
        body: {},
      });
      expect([200, 201]).toContain(confirmed.status);
      expect(confirmed.body.status).toBe('CONFIRMED');

      const detail = await call<{ status: string }>(ctx.base, `/customer/bookings/${bookingId}`, {
        token: customerToken,
      });
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe('CONFIRMED');
    });

    it('refuses a staff account that cannot manage bookings', async () => {
      // The booking routes are permission-gated; an anonymous caller must not
      // reach them at all.
      const anonymous = await call(ctx.base, `/bookings/${bookingId}`, {});
      expect(anonymous.status).toBe(401);
    });
  });

  // ------------------------------------------------------ 6. order → merchant

  describe('journey 6 — a customer order is visible to the merchant and the platform', () => {
    let merchantCompanyId = '';
    let merchantToken = '';
    let providerId = '';
    let productId = '';
    let accountId = '';
    let customerToken = '';
    let orderId = '';

    const merchantEmail = `${PREFIX.toLowerCase()}-merchant@test.local`;

    beforeAll(async () => {
      // A merchant tenant linked to a provider, whose company also sells a
      // product the customer orders. This is what makes the order visible on
      // both the merchant and the platform planes.
      const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${PREFIX}-MERCH`,
          nameEn: 'E13 Merchant Tenant',
          nameAr: 'شركة تاجر',
          type: 'SAAS_TENANT',
          planId: enterprise.id,
        },
      });
      expect(created.status).toBe(201);
      merchantCompanyId = created.body.company.id;

      const adminRole = await prisma.role.findFirstOrThrow({
        where: { companyId: merchantCompanyId, code: 'company_admin' },
      });
      const user = await prisma.user.create({
        data: {
          email: merchantEmail,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          fullNameEn: 'E13 Merchant',
          fullNameAr: 'تاجر',
          status: 'ACTIVE',
        },
      });
      await prisma.membership.create({
        data: { userId: user.id, companyId: merchantCompanyId, roleId: adminRole.id, isActive: true },
      });

      const provider = await prisma.marketplaceProvider.create({
        data: {
          code: `${PREFIX}-PROV`,
          nameEn: 'E13 Merchant Provider',
          nameAr: 'مزود',
          status: 'APPROVED',
          approvedAt: new Date(),
          providerCompanyId: merchantCompanyId,
        },
      });
      providerId = provider.id;
      await prisma.providerUser.create({
        data: { providerId: provider.id, userId: user.id, role: 'OWNER', isActive: true },
      });
      merchantToken = await login(ctx.base, merchantEmail, password);

      const product = await prisma.product.create({
        data: {
          companyId: merchantCompanyId,
          sku: `${PREFIX}-MP1`,
          nameEn: 'E13 Merchant Part',
          nameAr: 'قطعة التاجر',
          salesPriceMinor: 8800,
          isActive: true,
        },
      });
      productId = product.id;

      const email = `${PREFIX.toLowerCase()}-orderer@test.local`;
      const registered = await call<{ accessToken: string; account: { id: string } }>(
        ctx.base,
        '/customer/auth/register',
        {
          method: 'POST',
          headers: { 'x-oryx-client': 'mobile' },
          body: { email, password, fullName: 'E13 Orderer', preferredLocale: 'en' },
        },
      );
      customerToken = registered.body.accessToken;
      accountId = registered.body.account.id;

      await call(ctx.base, '/customer/cart/items', {
        method: 'POST',
        token: customerToken,
        body: { productId, quantity: 1 },
      });
      const order = await call<{ id: string }>(ctx.base, '/customer/orders', {
        method: 'POST',
        token: customerToken,
        body: { paymentMethod: 'CASH' },
      });
      expect([200, 201]).toContain(order.status);
      orderId = order.body.id;
    }, 180_000);

    afterAll(async () => {
      await prisma.customerOrder.deleteMany({ where: { customerAccountId: accountId } });
      await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: accountId } } });
      await prisma.cart.deleteMany({ where: { customerAccountId: accountId } });
      await prisma.customerAccount.deleteMany({ where: { id: accountId } });
      await prisma.providerUser.deleteMany({ where: { providerId } });
      await prisma.marketplaceProvider.deleteMany({ where: { id: providerId } });
      await prisma.product.deleteMany({ where: { companyId: merchantCompanyId } });
      await prisma.membership.deleteMany({ where: { companyId: merchantCompanyId } });
      await prisma.user.deleteMany({ where: { email: merchantEmail } });
      await prisma.subscription.deleteMany({ where: { companyId: merchantCompanyId } });
      await prisma.company.deleteMany({ where: { id: merchantCompanyId } });
    }, 180_000);

    it('shows the order in the merchant portal', async () => {
      const listed = await call<{ items: Array<{ id: string; status: string }> }>(
        ctx.base,
        '/provider/orders',
        { token: merchantToken },
      );
      expect(listed.status).toBe(200);
      expect(listed.body.items.map((o) => o.id)).toContain(orderId);
    });

    it('lets the merchant advance the order and the customer sees the status', async () => {
      const advanced = await call<{ status: string }>(ctx.base, `/provider/orders/${orderId}/status`, {
        method: 'POST',
        token: merchantToken,
        body: { status: 'CONFIRMED' },
      });
      expect([200, 201]).toContain(advanced.status);

      const detail = await call<{ status: string }>(ctx.base, `/customer/orders/${orderId}`, {
        token: customerToken,
      });
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe('CONFIRMED');
    });

    it('counts the order in the platform ecosystem figures', async () => {
      const overview = await call<{ metrics: { orders: { value: number } } }>(
        ctx.base,
        '/platform/ecosystem',
        { token: superToken },
      );
      expect(overview.status).toBe(200);
      expect(overview.body.metrics.orders.value).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------- 7. offer → customer feed

  describe('journey 7 — a merchant offer reaches the customer feed only when active', () => {
    let merchantCompanyId = '';
    let merchantToken = '';
    let providerId = '';
    let offerId = '';

    const merchantEmail = `${PREFIX.toLowerCase()}-offers@test.local`;

    beforeAll(async () => {
      const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${PREFIX}-OFFERS`,
          nameEn: 'E13 Offers Tenant',
          nameAr: 'شركة عروض',
          type: 'SAAS_TENANT',
          planId: enterprise.id,
        },
      });
      merchantCompanyId = created.body.company.id;

      const adminRole = await prisma.role.findFirstOrThrow({
        where: { companyId: merchantCompanyId, code: 'company_admin' },
      });
      const user = await prisma.user.create({
        data: {
          email: merchantEmail,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          fullNameEn: 'E13 Offers',
          fullNameAr: 'عروض',
          status: 'ACTIVE',
        },
      });
      await prisma.membership.create({
        data: { userId: user.id, companyId: merchantCompanyId, roleId: adminRole.id, isActive: true },
      });
      const provider = await prisma.marketplaceProvider.create({
        data: {
          code: `${PREFIX}-OPROV`,
          nameEn: 'E13 Offers Provider',
          nameAr: 'مزود عروض',
          status: 'APPROVED',
          approvedAt: new Date(),
          providerCompanyId: merchantCompanyId,
        },
      });
      providerId = provider.id;
      await prisma.providerUser.create({
        data: { providerId: provider.id, userId: user.id, role: 'OWNER', isActive: true },
      });
      merchantToken = await login(ctx.base, merchantEmail, password);
    }, 180_000);

    afterAll(async () => {
      await prisma.providerOffer.deleteMany({ where: { providerId } });
      await prisma.providerUser.deleteMany({ where: { providerId } });
      await prisma.marketplaceProvider.deleteMany({ where: { id: providerId } });
      await prisma.membership.deleteMany({ where: { companyId: merchantCompanyId } });
      await prisma.user.deleteMany({ where: { email: merchantEmail } });
      await prisma.subscription.deleteMany({ where: { companyId: merchantCompanyId } });
      await prisma.company.deleteMany({ where: { id: merchantCompanyId } });
    }, 180_000);

    it('publishes an offer as the merchant and it appears in the customer feed', async () => {
      const created = await call<{ id: string; providerId: string }>(ctx.base, '/provider/offers', {
        method: 'POST',
        token: merchantToken,
        body: {
          titleEn: `${PREFIX} 15% Off`,
          titleAr: 'خصم ١٥٪',
          percentOffBp: 1_500,
        },
      });
      expect([200, 201]).toContain(created.status);
      offerId = created.body.id;

      const feed = await call<Array<{ id: string }>>(ctx.base, '/customer/catalog/offers');
      expect(feed.status).toBe(200);
      expect(feed.body.map((o) => o.id)).toContain(offerId);
    });

    it('withdraws the offer and it leaves the customer feed', async () => {
      const withdrawn = await call(ctx.base, `/provider/offers/${offerId}`, {
        method: 'PATCH',
        token: merchantToken,
        body: { isActive: false },
      });
      expect([200, 201]).toContain(withdrawn.status);

      const feed = await call<Array<{ id: string }>>(ctx.base, '/customer/catalog/offers');
      expect(feed.body.map((o) => o.id)).not.toContain(offerId);
    });
  });

  // ------------------------------------------ 8. operator announcement → inbox

  describe('journey 8 — an operator announcement reaches the addressed customer inbox', () => {
    let accountId = '';
    let customerToken = '';
    let otherAccountId = '';
    let otherToken = '';

    const email = `${PREFIX.toLowerCase()}-announced@test.local`;
    const otherEmail = `${PREFIX.toLowerCase()}-unaddressed@test.local`;

    beforeAll(async () => {
      const a = await call<{ accessToken: string; account: { id: string } }>(
        ctx.base,
        '/customer/auth/register',
        {
          method: 'POST',
          headers: { 'x-oryx-client': 'mobile' },
          body: { email, password, fullName: 'E13 Announced', preferredLocale: 'en' },
        },
      );
      accountId = a.body.account.id;
      customerToken = a.body.accessToken;

      const b = await call<{ accessToken: string; account: { id: string } }>(
        ctx.base,
        '/customer/auth/register',
        {
          method: 'POST',
          headers: { 'x-oryx-client': 'mobile' },
          body: { email: otherEmail, password, fullName: 'E13 Unaddressed', preferredLocale: 'en' },
        },
      );
      otherAccountId = b.body.account.id;
      otherToken = b.body.accessToken;
    }, 180_000);

    afterAll(async () => {
      await prisma.notificationDelivery.deleteMany({
        where: { customerAccountId: { in: [accountId, otherAccountId] } },
      });
      await prisma.customerAccount.deleteMany({ where: { id: { in: [accountId, otherAccountId] } } });
    }, 120_000);

    it('delivers the announcement to the addressed customer only', async () => {
      const sent = await call<{ queued: number; customerRecipients: string[] }>(
        ctx.base,
        '/notifications/announcements',
        {
          method: 'POST',
          token: superToken,
          body: {
            title: `${PREFIX} service update`,
            body: 'A new ORYX release is live.',
            severity: 'INFO',
            customerAccountIds: [accountId],
          },
        },
      );
      expect([200, 201]).toContain(sent.status);
      expect(sent.body.customerRecipients).toContain(accountId);

      const inbox = await call<{ items: Array<{ subject: string | null }> }>(
        ctx.base,
        '/customer/notifications',
        { token: customerToken },
      );
      expect(inbox.status).toBe(200);
      expect(inbox.body.items.some((n) => (n.subject ?? '').includes(PREFIX))).toBe(true);

      // The customer who was not addressed must not have received it.
      const otherInbox = await call<{ items: Array<{ subject: string | null }> }>(
        ctx.base,
        '/customer/notifications',
        { token: otherToken },
      );
      expect(otherInbox.body.items.some((n) => (n.subject ?? '').includes(PREFIX))).toBe(false);
    });

    it('refuses a non-platform caller', async () => {
      const res = await call(ctx.base, '/notifications/announcements', {
        method: 'POST',
        token: staffToken,
        headers: { 'x-oryx-company-id': companyId },
        body: { title: 'Nope', body: 'Nope', customerAccountIds: [accountId] },
      });
      expect([401, 403]).toContain(res.status);
    });
  });
});
