import * as argon2 from 'argon2';
import sharp from 'sharp';
import { PrismaService } from '../src/common/prisma.service';
import {
  call,
  createTestApp,
  login,
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
  type TestContext,
} from './test-app';

/**
 * Execution 10 — product image management and SENSAGE inspection uploads.
 *
 * Real HTTP against the running API, the real sharp pipeline and the real
 * filesystem. The properties asserted are the ones an image path is most likely
 * to get wrong: who may upload, which tenant a product belongs to, that a
 * non-image is refused, that a client cannot choose a storage path, and that a
 * customer cannot attach a photograph to another account's vehicle.
 */

/** A valid 200×200 PNG, large enough to pass the minimum-dimension check. */
async function makePng(width = 200, height = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 24, b: 48 } },
  })
    .png()
    .toBuffer();
}

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = '----oryxExec10Boundary' + Math.random().toString(36).slice(2);
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

describe('Execution 10 — product images & inspection uploads (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let adminToken = '';
  let companyId = '';
  let productId = '';
  let otherCompanyId = '';
  let otherProductId = '';
  const createdImageIds: string[] = [];
  const createdAssetIds: string[] = [];

  const PREFIX = 'E10';
  const password = 'e10-test-password-12345';
  let tokenA = '';
  let tokenB = '';
  let accountA = '';
  let accountB = '';
  let vehicleA = '';
  let vehicleB = '';

  async function register(email: string): Promise<{ token: string; accountId: string }> {
    const res = await call<{ accessToken: string; account: { id: string } }>(
      ctx.base,
      '/customer/auth/register',
      {
        method: 'POST',
        headers: { 'x-oryx-client': 'mobile' },
        body: { email, password, fullName: `E10 ${email}`, preferredLocale: 'en' },
      },
    );
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { token: res.body.accessToken, accountId: res.body.account.id };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;

    adminToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const demo = await prisma.company.findFirstOrThrow({
      where: { code: 'DEMO-ALNOOR' },
      select: { id: true },
    });
    companyId = demo.id;

    const product = await prisma.product.create({
      data: {
        companyId,
        sku: `${PREFIX}-P1`,
        nameEn: 'E10 Brake Disc',
        nameAr: 'قرص فرامل',
        salesPriceMinor: 4200,
        isActive: true,
      },
    });
    productId = product.id;

    // A second tenant's product, so cross-tenant access can be asserted rather
    // than assumed.
    const other = await prisma.company.create({
      data: { code: `${PREFIX}-OTHER`, nameEn: 'E10 Other Co', nameAr: 'شركة أخرى', type: 'SAAS_TENANT' },
    });
    otherCompanyId = other.id;
    const otherProduct = await prisma.product.create({
      data: {
        companyId: otherCompanyId,
        sku: `${PREFIX}-OP1`,
        nameEn: 'E10 Foreign Part',
        nameAr: 'قطعة',
        salesPriceMinor: 900,
        isActive: true,
      },
    });
    otherProductId = otherProduct.id;

    const a = await register(`${PREFIX.toLowerCase()}-a@test.local`);
    const b = await register(`${PREFIX.toLowerCase()}-b@test.local`);
    tokenA = a.token;
    accountA = a.accountId;
    tokenB = b.token;
    accountB = b.accountId;

    // A vehicle for each account, so a photo cannot be attached across accounts.
    // A Vehicle requires a tenant customer record, which the customer register
    // path creates on first use; create the rows directly to keep the fixture
    // independent of that flow.
    const tenantCustomerA = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-CA`, nameEn: 'E10 Cust A', nameAr: 'عميل أ' },
    });
    const tenantCustomerB = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-CB`, nameEn: 'E10 Cust B', nameAr: 'عميل ب' },
    });
    const va = await prisma.vehicle.create({
      data: {
        companyId,
        customerId: tenantCustomerA.id,
        customerAccountId: accountA,
        vin: `${PREFIX}A0000000000001`,
        make: 'Toyota',
        model: 'Prado',
        modelYear: 2021,
      },
    });
    vehicleA = va.id;
    const vb = await prisma.vehicle.create({
      data: {
        companyId,
        customerId: tenantCustomerB.id,
        customerAccountId: accountB,
        vin: `${PREFIX}B0000000000001`,
        make: 'Nissan',
        model: 'Patrol',
        modelYear: 2019,
      },
    });
    vehicleB = vb.id;
  }, 180_000);

  afterAll(async () => {
    // Children before parents.
    await prisma.productImage.deleteMany({ where: { productId: { in: [productId, otherProductId] } } });
    await prisma.customerInspectionPhoto.deleteMany({
      where: { customerAccountId: { in: [accountA, accountB] } },
    });
    await prisma.cmsMediaAsset.deleteMany({ where: { originalName: { startsWith: 'e10-' } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: [vehicleA, vehicleB] } } });
    await prisma.customer.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.product.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.company.deleteMany({ where: { id: otherCompanyId } });
    await prisma.customerAccount.deleteMany({ where: { id: { in: [accountA, accountB] } } });
    await ctx.app.close();
  }, 120_000);

  // ------------------------------------------------------- product images

  async function uploadProductImage(
    token: string,
    targetProductId: string,
    fields: Record<string, string> = {},
    name = 'e10-product.png',
    data?: Buffer,
  ) {
    const file = data ?? (await makePng());
    const mp = multipart(fields, { name, data: file, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/inventory/products/${targetProductId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    const body = (await res.json().catch(() => null)) as
      | { id?: string; url?: string; isPrimary?: boolean }
      | null;
    if (body?.id) createdImageIds.push(body.id);
    return { status: res.status, body };
  }

  describe('product images', () => {
    it('uploads an image, stores an asset and returns a served URL', async () => {
      const res = await uploadProductImage(adminToken, productId, { altEn: 'Brake disc', altAr: 'قرص' });
      expect(res.status).toBe(201);
      expect(res.body?.id).toBeTruthy();
      expect(res.body?.url).toMatch(/^\/api\/v1\/cms\/media\/.+\/file\?variant=/);
      // The first image is automatically primary, so the product is never left
      // without a lead photograph.
      expect(res.body?.isPrimary).toBe(true);

      const asset = await prisma.cmsMediaAsset.findFirst({
        where: { originalName: 'e10-product.png' },
        orderBy: { createdAt: 'desc' },
      });
      expect(asset).not.toBeNull();
      if (asset) createdAssetIds.push(asset.id);
      // The stored bytes are a re-encoded WebP, never the uploaded PNG.
      expect(asset?.mimeType).toBe('image/webp');
      expect(asset?.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
      // A storage key is derived from a date folder plus a UUID and a content
      // hash; the client never supplies a path.
      expect(asset?.storageKey).toMatch(/^\d{4}\/\d{2}\/.+\.webp$/);
    });

    it('serves the stored bytes through the media file route', async () => {
      const image = await prisma.productImage.findFirst({
        where: { productId },
        include: { mediaAsset: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(image?.mediaAsset).not.toBeNull();
      const res = await fetch(
        `${ctx.base}/api/v1/cms/media/${image!.mediaAssetId}/file?variant=card`,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/^image\//);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('lists the images primary-first', async () => {
      const res = await call<Array<{ id: string; isPrimary: boolean; url: string | null }>>(
        ctx.base,
        `/inventory/products/${productId}/images`,
        { token: adminToken, headers: { 'x-oryx-company-id': companyId } },
      );
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]?.isPrimary).toBe(true);
    });

    it('promotes a later image to primary and demotes the earlier one', async () => {
      const second = await uploadProductImage(adminToken, productId, { altEn: 'Second' });
      expect(second.status).toBe(201);
      expect(second.body?.isPrimary).toBe(false);

      const promote = await call(
        ctx.base,
        `/inventory/products/${productId}/images/${second.body!.id}`,
        {
          method: 'PATCH',
          token: adminToken,
          headers: { 'x-oryx-company-id': companyId },
          body: { isPrimary: true },
        },
      );
      expect(promote.status).toBe(200);

      const primaries = await prisma.productImage.findMany({
        where: { productId, isPrimary: true },
      });
      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.id).toBe(second.body!.id);
    });

    it('refuses an upload with no file', async () => {
      const res = await fetch(`${ctx.base}/api/v1/inventory/products/${productId}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(400);
    });

    it('refuses a non-image disguised as an image', async () => {
      const res = await uploadProductImage(
        adminToken,
        productId,
        {},
        'e10-fake.png',
        Buffer.from('<svg onload="alert(1)"/>'),
      );
      expect(res.status).toBe(400);
    });

    it('refuses an unauthenticated upload', async () => {
      const data = await makePng();
      const mp = multipart({}, { name: 'e10-anon.png', data, type: 'image/png' });
      const res = await fetch(`${ctx.base}/api/v1/inventory/products/${productId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': mp.contentType },
        body: new Uint8Array(mp.body),
      });
      expect(res.status).toBe(401);
    });

    it('refuses to attach an image to another tenant\'s product', async () => {
      // The product belongs to a different company, so it is not found in the
      // caller's scope — a 404, not a cross-tenant write.
      const res = await uploadProductImage(adminToken, otherProductId, { altEn: 'Foreign' });
      expect(res.status).toBe(404);
      const rows = await prisma.productImage.findMany({ where: { productId: otherProductId } });
      expect(rows).toHaveLength(0);
    });

    it('removes an image and promotes the next one when the primary is removed', async () => {
      const image = await prisma.productImage.findFirst({
        where: { productId, isPrimary: true },
      });
      expect(image).not.toBeNull();
      const res = await call(
        ctx.base,
        `/inventory/products/${productId}/images/${image!.id}`,
        {
          method: 'DELETE',
          token: adminToken,
          headers: { 'x-oryx-company-id': companyId },
        },
      );
      expect(res.status).toBe(200);
      const remaining = await prisma.productImage.findMany({ where: { productId } });
      // A product with images always keeps exactly one primary.
      if (remaining.length > 0) {
        expect(remaining.filter((r) => r.isPrimary)).toHaveLength(1);
      }
    });
  });

  // -------------------------------------------------- inspection uploads

  async function uploadInspection(
    token: string,
    fields: Record<string, string> = {},
    name = 'e10-inspection.png',
    data?: Buffer,
  ) {
    const file = data ?? (await makePng());
    const mp = multipart(fields, { name, data: file, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/customer/inspection-photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; url?: string } | null;
    return { status: res.status, body };
  }

  describe('SENSAGE inspection uploads', () => {
    it('stores a customer photo and returns a served URL', async () => {
      const res = await uploadInspection(tokenA, { vehicleId: vehicleA, caption: 'Front bumper' });
      expect(res.status).toBe(201);
      expect(res.body?.id).toBeTruthy();
      expect(res.body?.url).toMatch(/^\/api\/v1\/cms\/media\/.+\/file\?variant=/);
    });

    it('lists only the caller\'s own photos', async () => {
      const a = await call<Array<{ id: string }>>(ctx.base, '/customer/inspection-photos', {
        token: tokenA,
      });
      expect(a.status).toBe(200);
      expect(a.body.length).toBeGreaterThan(0);

      // Account B has uploaded nothing, so its list is empty even though A has
      // photos. Ownership is enforced from the token, not a request field.
      const b = await call<Array<{ id: string }>>(ctx.base, '/customer/inspection-photos', {
        token: tokenB,
      });
      expect(b.status).toBe(200);
      expect(b.body).toHaveLength(0);
    });

    it('refuses to attach a photo to another account\'s vehicle', async () => {
      const res = await uploadInspection(tokenA, { vehicleId: vehicleB });
      expect(res.status).toBe(404);
    });

    it('refuses a non-image upload', async () => {
      const res = await uploadInspection(
        tokenA,
        {},
        'e10-notimage.png',
        Buffer.from('not an image at all'),
      );
      expect(res.status).toBe(400);
    });

    it('refuses an unauthenticated upload', async () => {
      const data = await makePng();
      const mp = multipart({}, { name: 'e10-anon-insp.png', data, type: 'image/png' });
      const res = await fetch(`${ctx.base}/api/v1/customer/inspection-photos`, {
        method: 'POST',
        headers: { 'Content-Type': mp.contentType },
        body: new Uint8Array(mp.body),
      });
      expect(res.status).toBe(401);
    });

    it('refuses a staff token on the consumer route', async () => {
      // The consumer plane and the staff plane are separate; a staff access token
      // is refused on a customer route.
      const data = await makePng();
      const mp = multipart({}, { name: 'e10-staff.png', data, type: 'image/png' });
      const res = await fetch(`${ctx.base}/api/v1/customer/inspection-photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': mp.contentType },
        body: new Uint8Array(mp.body),
      });
      expect(res.status).toBe(401);
    });

    it('removes a photo the caller owns and refuses another account\'s', async () => {
      const list = await call<Array<{ id: string }>>(ctx.base, '/customer/inspection-photos', {
        token: tokenA,
      });
      const photoId = list.body[0]!.id;

      // B cannot delete A's photo.
      const forbidden = await call(ctx.base, `/customer/inspection-photos/${photoId}`, {
        method: 'DELETE',
        token: tokenB,
      });
      expect(forbidden.status).toBe(404);

      const removed = await call(ctx.base, `/customer/inspection-photos/${photoId}`, {
        method: 'DELETE',
        token: tokenA,
      });
      expect(removed.status).toBe(200);
      const after = await call<Array<{ id: string }>>(ctx.base, '/customer/inspection-photos', {
        token: tokenA,
      });
      expect(after.body.find((p) => p.id === photoId)).toBeUndefined();
    });
  });

  // ------------------------------------------- catalogue surfacing of images

  describe('uploaded images surface in the customer homepage', () => {
    it('returns the uploaded product image as the product imageUrl', async () => {
      // Ensure the product has a primary image.
      const existing = await prisma.productImage.findFirst({ where: { productId, isPrimary: true } });
      if (!existing) await uploadProductImage(adminToken, productId, { altEn: 'Lead' });

      const res = await call<{ products: Array<{ id: string; imageUrl: string | null }> }>(
        ctx.base,
        `/customer/homepage?locale=en&companyId=${companyId}`,
      );
      expect(res.status).toBe(200);
      const product = res.body.products.find((p) => p.id === productId);
      expect(product).toBeTruthy();
      expect(product?.imageUrl).toMatch(/^\/api\/v1\/cms\/media\/.+\/file\?variant=/);
    });
  });

  // ------------------------------------------ live customer booking lifecycle

  /**
   * The mobile booking wizard holds a slot then confirms it. Both steps are
   * customer-plane operations, and confirmation is what stops the hold expiring
   * and releasing the slot. These tests exercise the real controller against the
   * real database, including the ownership rule on read and confirm.
   */
  describe('live customer bookings', () => {
    let resourceId = '';
    let bookingId = '';
    let bookingReference = '';

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
          companyId,
          resourceType: 'BAY',
          code: `${PREFIX}-BAY`,
          nameEn: 'E10 Bay',
          nameAr: 'منصة',
          capacity: 1,
        },
      });
      resourceId = resource.id;
      await prisma.workingHours.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          companyId,
          resourceId,
          dayOfWeek,
          opensMinute: 8 * 60,
          closesMinute: 20 * 60,
        })),
      });
    }, 120_000);

    afterAll(async () => {
      await prisma.bookingEvent.deleteMany({ where: { companyId } });
      await prisma.bookingSlot.deleteMany({ where: { resourceId } });
      await prisma.workingHours.deleteMany({ where: { resourceId } });
      await prisma.bookingResource.deleteMany({ where: { id: resourceId } });
    }, 120_000);

    it('refuses booking endpoints without a customer token', async () => {
      const res = await call(ctx.base, '/customer/bookings');
      expect(res.status).toBe(401);
    });

    it('offers real slots inside the configured opening hours', async () => {
      const res = await call<Array<{ startsAt: string }>>(
        ctx.base,
        `/customer/bookings/availability?date=${dayString(3)}&durationMinutes=60&resourceId=${resourceId}`,
        { token: tokenA },
      );
      expect(res.status).toBe(200);
      const slots = Array.isArray(res.body) ? res.body : [];
      expect(slots.length).toBeGreaterThan(0);
      // Every offered slot must be inside 08:00–20:00 for the resource.
      for (const slot of slots) {
        const hour = new Date(slot.startsAt).getUTCHours();
        expect(hour).toBeGreaterThanOrEqual(8);
        expect(hour).toBeLessThan(20);
      }
    });

    it('holds then confirms a booking for the signed-in customer', async () => {
      const created = await call<{ id: string; reference: string; status: string }>(
        ctx.base,
        '/customer/bookings',
        {
          method: 'POST',
          token: tokenA,
          body: {
            bookingType: 'PROVIDER_SERVICE',
            startsAt: instant(3, 10),
            durationMinutes: 60,
            resourceId,
            serviceRef: 'E10 oil change',
            notes: 'E10 lifecycle',
          },
        },
      );
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('HELD');
      bookingId = created.body.id;
      bookingReference = created.body.reference;
      expect(bookingReference).toBeTruthy();

      const confirmed = await call<{ id: string; status: string }>(
        ctx.base,
        `/customer/bookings/${bookingId}/confirm`,
        { method: 'POST', token: tokenA },
      );
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.status).toBe('CONFIRMED');
    });

    it('returns the confirmed booking in the customer history', async () => {
      const res = await call<{ items: Array<{ id: string; status: string }>; total: number }>(
        ctx.base,
        '/customer/bookings',
        { token: tokenA },
      );
      expect(res.status).toBe(200);
      const mine = res.body.items.find((b) => b.id === bookingId);
      expect(mine?.status).toBe('CONFIRMED');
    });

    it('reads the booking detail with its resource, for the owner only', async () => {
      const own = await call<{ id: string; status: string; resource: { id: string } | null }>(
        ctx.base,
        `/customer/bookings/${bookingId}`,
        { token: tokenA },
      );
      expect(own.status).toBe(200);
      expect(own.body.resource?.id).toBe(resourceId);

      const foreign = await call(ctx.base, `/customer/bookings/${bookingId}`, { token: tokenB });
      expect(foreign.status).toBe(404);
    });

    it('refuses another customer confirming this booking', async () => {
      const res = await call(ctx.base, `/customer/bookings/${bookingId}/confirm`, {
        method: 'POST',
        token: tokenB,
      });
      expect(res.status).toBe(404);
    });

    it('refuses a second booking of the same confirmed slot', async () => {
      const res = await call(ctx.base, '/customer/bookings', {
        method: 'POST',
        token: tokenB,
        body: {
          bookingType: 'PROVIDER_SERVICE',
          startsAt: instant(3, 10),
          durationMinutes: 60,
          resourceId,
        },
      });
      expect([409]).toContain(res.status);
    });

    it('cancels the customer booking and releases the slot', async () => {
      const res = await call<{ status: string }>(
        ctx.base,
        `/customer/bookings/${bookingId}/cancel`,
        { method: 'POST', token: tokenA, body: { reason: 'E10 release' } },
      );
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');

      // The released time is bookable again.
      const again = await call(ctx.base, '/customer/bookings', {
        method: 'POST',
        token: tokenB,
        body: {
          bookingType: 'PROVIDER_SERVICE',
          startsAt: instant(3, 10),
          durationMinutes: 60,
          resourceId,
        },
      });
      expect(again.status).toBe(201);
      if (again.status === 201) {
        const slot = again.body as { id: string };
        await call(ctx.base, `/customer/bookings/${slot.id}/cancel`, {
          method: 'POST',
          token: tokenB,
          body: { reason: 'cleanup' },
        });
      }
    });
  });

  // ------------------------------------------------- merchant provider portal

  /**
   * The merchant screens talk to `/provider/…`. The portal is a staff plane: the
   * API resolves the provider from the signed-in account's membership, and the
   * routes are gated by `erp.provider_portal.manage`, which only the Enterprise
   * plan licenses. These tests pin the payload shape the mobile client sends —
   * `nameEn`/`nameAr`/`description`/`priceMinor` — because a mismatch here is a
   * 400 that the UI would surface as a generic server error.
   */
  describe('merchant provider portal', () => {
    let providerId = '';
    let merchantToken = '';
    let nonProviderToken = '';
    const merchantEmail = `${PREFIX.toLowerCase()}-merchant@test.local`;
    const nonProviderEmail = `${PREFIX.toLowerCase()}-noprovider@test.local`;

    beforeAll(async () => {
      const superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

      // A dedicated Enterprise tenant, because the provider portal is licensed to
      // that plan only and the shared demo tenant does not carry it.
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${PREFIX}-MERCH`,
          nameEn: 'E10 Merchant Tenant',
          nameAr: 'شركة التاجر',
          type: 'SAAS_TENANT',
          planId: enterprise.id,
        },
      });
      expect(created.status).toBe(201);
      const merchantCompanyId = created.body.company.id;

      const adminRole = await prisma.role.findFirstOrThrow({
        where: { companyId: merchantCompanyId, code: 'company_admin' },
      });
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      const merchantUser = await prisma.user.create({
        data: {
          email: merchantEmail,
          passwordHash,
          fullNameEn: 'E10 Merchant',
          fullNameAr: 'تاجر',
          status: 'ACTIVE',
        },
      });
      await prisma.membership.create({
        data: {
          userId: merchantUser.id,
          companyId: merchantCompanyId,
          roleId: adminRole.id,
          isActive: true,
        },
      });

      const nonProviderUser = await prisma.user.create({
        data: {
          email: nonProviderEmail,
          passwordHash,
          fullNameEn: 'E10 No Provider',
          fullNameAr: 'بدون مزود',
          status: 'ACTIVE',
        },
      });
      await prisma.membership.create({
        data: {
          userId: nonProviderUser.id,
          companyId: merchantCompanyId,
          roleId: adminRole.id,
          isActive: true,
        },
      });

      // Link only the merchant to a provider; the other administrator holds the
      // same permission but no provider membership, so provider scope is shown
      // to come from membership and not from the permission alone.
      const provider = await prisma.marketplaceProvider.create({
        data: {
          code: `${PREFIX}-PROV`,
          nameEn: 'E10 Merchant Provider',
          nameAr: 'مزود التاجر',
          status: 'APPROVED',
          approvedAt: new Date(),
        },
      });
      providerId = provider.id;
      await prisma.providerUser.create({
        data: { providerId, userId: merchantUser.id, role: 'OWNER', isActive: true },
      });

      merchantToken = await login(ctx.base, merchantEmail, password);
      nonProviderToken = await login(ctx.base, nonProviderEmail, password);
    }, 120_000);

    afterAll(async () => {
      await prisma.providerServiceListing.deleteMany({ where: { providerId } });
      await prisma.providerUser.deleteMany({ where: { providerId } });
      await prisma.marketplaceProvider.deleteMany({ where: { id: providerId } });
      await prisma.membership.deleteMany({
        where: { user: { email: { in: [merchantEmail, nonProviderEmail] } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: [merchantEmail, nonProviderEmail] } } });
      const company = await prisma.company.findUnique({ where: { code: `${PREFIX}-MERCH` } });
      if (company) {
        await prisma.subscription.deleteMany({ where: { companyId: company.id } });
        await prisma.company.delete({ where: { id: company.id } });
      }
    }, 120_000);

    it('reads the provider profile resolved from membership', async () => {
      const res = await call<{ id: string; nameEn: string }>(ctx.base, '/provider/profile', {
        token: merchantToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(providerId);
      expect(res.body.nameEn).toBe('E10 Merchant Provider');
    });

    it('creates a listing with the payload the mobile client sends', async () => {
      const res = await call<{ id: string; nameEn: string; priceMinor: number; currency: string }>(
        ctx.base,
        '/provider/listings',
        {
          method: 'POST',
          token: merchantToken,
          body: {
            categoryKey: 'INSPECTION',
            nameEn: 'E10 Full Inspection',
            nameAr: 'فحص شامل',
            description: 'Complete vehicle inspection',
            priceMinor: 25_000,
            currency: 'BHD',
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.nameEn).toBe('E10 Full Inspection');
      expect(res.body.priceMinor).toBe(25_000);
      expect(res.body.currency).toBe('BHD');
    });

    it('refuses the legacy descriptionEn/durationMinutes payload', async () => {
      // Guards against a client regressing to the guessed shape: the API uses
      // `description` and has no per-listing duration.
      const res = await call(ctx.base, '/provider/listings', {
        method: 'POST',
        token: merchantToken,
        body: {
          categoryKey: 'INSPECTION',
          nameEn: 'E10 Bad Shape',
          nameAr: 'شكل خاطئ',
          descriptionEn: 'wrong field',
          durationMinutes: 60,
          priceMinor: 1000,
        },
      });
      expect(res.status).toBe(400);
    });

    it('lists only this provider\'s listings', async () => {
      const res = await call<Array<{ nameEn: string }>>(ctx.base, '/provider/listings', {
        token: merchantToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((l) => l.nameEn.startsWith('E10'))).toBe(true);
    });

    it('updates and deactivates a listing', async () => {
      const listed = await call<Array<{ id: string }>>(ctx.base, '/provider/listings', {
        token: merchantToken,
      });
      const target = listed.body[0];
      const res = await call<{ isActive: boolean; priceMinor: number }>(
        ctx.base,
        `/provider/listings/${target.id}`,
        { method: 'PATCH', token: merchantToken, body: { isActive: false, priceMinor: 31_000 } },
      );
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
      expect(res.body.priceMinor).toBe(31_000);
    });

    it('exposes the portal read surfaces', async () => {
      for (const path of ['/provider/requests', '/provider/earnings', '/provider/settlements', '/provider/reviews']) {
        const res = await call(ctx.base, path, { token: merchantToken });
        expect(res.status).toBe(200);
      }
    });

    it('returns the earnings shape the merchant screen reads', async () => {
      // The dashboard reads nested buckets, not flat minor-unit fields. Pin the
      // shape so a client that guessed `pendingMinor` cannot silently render
      // zeros while the API returns 200.
      const res = await call<{
        pending: { count: number; grossMinor: number; commissionMinor: number };
        awaitingPayment: { count: number; netMinor: number };
        paidToDate: { count: number; netMinor: number };
      }>(ctx.base, '/provider/earnings', { token: merchantToken });
      expect(res.status).toBe(200);
      expect(typeof res.body.pending.count).toBe('number');
      expect(typeof res.body.pending.grossMinor).toBe('number');
      expect(typeof res.body.pending.commissionMinor).toBe('number');
      expect(typeof res.body.awaitingPayment.netMinor).toBe('number');
      expect(typeof res.body.paidToDate.netMinor).toBe('number');
    });

    it('returns paginated requests with the request fields the merchant screen reads', async () => {
      const res = await call<{ items: Array<{ id: string; requestNumber: string; status: string }>; total: number }>(
        ctx.base,
        '/provider/requests',
        { token: merchantToken },
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(typeof res.body.total).toBe('number');
      for (const item of res.body.items) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.requestNumber).toBe('string');
        expect(typeof item.status).toBe('string');
      }
    });

    it('refuses a staff account that holds the permission but is not linked to a provider', async () => {
      const res = await call(ctx.base, '/provider/profile', { token: nonProviderToken });
      expect(res.status).toBe(403);
      expect((res.body as { code: string }).code).toBe('authz.cross_tenant_denied');
    });

    it('refuses a consumer token on the provider portal', async () => {
      const res = await call(ctx.base, '/provider/profile', { token: tokenA });
      expect(res.status).toBe(401);
    });
  });
});
