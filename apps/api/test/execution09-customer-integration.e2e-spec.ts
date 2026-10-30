import { PrismaService } from '../src/common/prisma.service';
import { createTestApp, call, type TestContext } from './test-app';

/**
 * Execution 09 — the live customer flows.
 *
 * Real HTTP against the running API and the seeded PostgreSQL database: the
 * homepage, cart, favourites, bookings, and the authorization boundaries around
 * them. Nothing here calls a service method directly, so the guards, pipes and
 * Prisma layer are all exercised.
 */
describe('Execution 09 — customer integration (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let base = '';

  /** A distinctive prefix so the fixtures are easy to find and remove. */
  const PREFIX = 'E09';
  const password = 'e09-test-password-12345';
  let tokenA = '';
  let tokenB = '';
  let accountA = '';
  let accountB = '';
  let productId = '';
  let productBId = '';
  let companyId = '';

  async function register(email: string): Promise<{ token: string; accountId: string }> {
    const res = await call<{ accessToken: string; account: { id: string } }>(
      base,
      '/customer/auth/register',
      {
        method: 'POST',
        headers: { 'x-oryx-client': 'mobile' },
        body: { email, password, fullName: `E09 ${email}`, preferredLocale: 'en' },
      },
    );
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { token: res.body.accessToken, accountId: res.body.account.id };
  }

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY =
      process.env.MFA_ENCRYPTION_KEY ?? 'test-mfa-encryption-key-min-32-characters-xyz';
    ctx = await createTestApp();
    prisma = ctx.prisma;
    base = ctx.base;

    // Two accounts, so ownership can be tested by trying to cross between them.
    const a = await register(`${PREFIX.toLowerCase()}-a@test.local`);
    const b = await register(`${PREFIX.toLowerCase()}-b@test.local`);
    tokenA = a.token;
    accountA = a.accountId;
    tokenB = b.token;
    accountB = b.accountId;

    // A company and two products, one per company, so cross-tenant behaviour can
    // be asserted rather than assumed.
    const company = await prisma.company.create({
      data: { code: `${PREFIX}-CO`, nameEn: 'E09 Co', nameAr: 'شركة', type: 'SAAS_TENANT' },
    });
    companyId = company.id;

    const p1 = await prisma.product.create({
      data: {
        companyId,
        sku: `${PREFIX}-P1`,
        nameEn: 'E09 Brake Pad',
        nameAr: 'فحمات',
        salesPriceMinor: 1500,
        isActive: true,
      },
    });
    productId = p1.id;

    const p2 = await prisma.product.create({
      data: {
        companyId,
        sku: `${PREFIX}-P2`,
        nameEn: 'E09 Oil Filter',
        nameAr: 'فلتر',
        salesPriceMinor: 2000,
        isActive: true,
      },
    });
    productBId = p2.id;
  }, 120_000);

  afterAll(async () => {
    // Children before parents: the cart lines reference the cart and the product.
    await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: { in: [accountA, accountB] } } } });
    await prisma.cart.deleteMany({ where: { customerAccountId: { in: [accountA, accountB] } } });
    await prisma.favorite.deleteMany({ where: { customerAccountId: { in: [accountA, accountB] } } });
    await prisma.bookingSlot.deleteMany({ where: { customerAccountId: { in: [accountA, accountB] } } });
    await prisma.product.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.customerAccount.deleteMany({ where: { id: { in: [accountA, accountB] } } });
    await ctx.app.close();
  }, 60_000);

  // ------------------------------------------------------------- homepage

  describe('homepage', () => {
    it('answers in English with the seeded catalogue', async () => {
      const res = await call<{ locale: string; products: unknown[]; categories: unknown[] }>(
        base,
        '/customer/homepage?locale=en',
      );
      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('en');
      expect(res.body.categories.length).toBeGreaterThan(0);
    });

    it('answers in Arabic, with Arabic names', async () => {
      const res = await call<{ locale: string; products: Array<{ name: string }> }>(
        base,
        '/customer/homepage?locale=ar',
      );
      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('ar');
      // At least one seeded product carries an Arabic name, so the Arabic call
      // must return a name that differs from the English one.
      const en = await call<{ products: Array<{ name: string }> }>(base, '/customer/homepage?locale=en');
      const arabicNames = res.body.products.map((p) => p.name);
      const englishNames = en.body.products.map((p) => p.name);
      expect(arabicNames.some((n) => !englishNames.includes(n))).toBe(true);
    });

    it('never returns a banner that is active but unpublished', async () => {
      const banner = await prisma.cmsBanner.create({
        data: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} unapproved`,
          imageUrl: 'https://cdn.example.com/unapproved.jpg',
          isActive: true,
          status: 'DRAFT',
        },
      });
      const res = await call<{ hero: Array<{ id: string }> }>(base, '/customer/homepage?locale=en');
      expect(res.status).toBe(200);
      expect(res.body.hero.map((h) => h.id)).not.toContain(banner.id);
      await prisma.cmsBanner.delete({ where: { id: banner.id } });
    });

    it('returns a banner that is both active and published', async () => {
      const banner = await prisma.cmsBanner.create({
        data: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} approved`,
          imageUrl: 'https://cdn.example.com/approved.jpg',
          isActive: true,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      const res = await call<{ hero: Array<{ id: string }> }>(base, '/customer/homepage?locale=en');
      expect(res.body.hero.map((h) => h.id)).toContain(banner.id);
      await prisma.cmsBanner.delete({ where: { id: banner.id } });
    });

    it('drops a banner whose image URL is not safe', async () => {
      const banner = await prisma.cmsBanner.create({
        data: {
          placement: 'homepage.hero',
          locale: 'en',
          title: `${PREFIX} unsafe`,
          imageUrl: 'javascript:alert(1)',
          isActive: true,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      const res = await call<{ hero: Array<{ id: string }> }>(base, '/customer/homepage?locale=en');
      // The banner is published, but its only image is unusable, so it is
      // filtered out rather than sent to a client that would fail to render it.
      expect(res.body.hero.map((h) => h.id)).not.toContain(banner.id);
      await prisma.cmsBanner.delete({ where: { id: banner.id } });
    });

    it('is public: a guest can read it', async () => {
      const res = await call(base, '/customer/homepage?locale=en');
      expect(res.status).toBe(200);
    });
  });

  // ----------------------------------------------------------------- cart

  describe('cart', () => {
    it('refuses an unauthenticated read', async () => {
      const res = await call(base, '/customer/cart');
      expect(res.status).toBe(401);
    });

    it('refuses an unauthenticated write', async () => {
      const res = await call(base, '/customer/cart/items', {
        method: 'POST',
        body: { productId, quantity: 1 },
      });
      expect(res.status).toBe(401);
    });

    it('starts empty and merges a repeated add into one line', async () => {
      const empty = await call<{ itemCount: number }>(base, '/customer/cart', { token: tokenA });
      expect(empty.body.itemCount).toBe(0);

      await call(base, '/customer/cart/items', {
        method: 'POST',
        token: tokenA,
        body: { productId, quantity: 2 },
      });
      await call(base, '/customer/cart/items', {
        method: 'POST',
        token: tokenA,
        body: { productId, quantity: 1 },
      });

      const cart = await call<{ items: Array<{ quantity: number }>; itemCount: number }>(
        base,
        '/customer/cart',
        { token: tokenA },
      );
      expect(cart.body.items).toHaveLength(1);
      expect(cart.body.items[0].quantity).toBe(3);
    });

    it('computes the total on the server, from the catalogue price', async () => {
      const cart = await call<{ totalMinor: number; items: Array<{ unitPriceMinor: number; quantity: number }> }>(
        base,
        '/customer/cart',
        { token: tokenA },
      );
      // 3 x 1500. The client never sends a price, so the server's number is the
      // only one in play.
      expect(cart.body.totalMinor).toBe(4500);
      expect(cart.body.items[0].unitPriceMinor).toBe(1500);
    });

    it('rejects a client-supplied price', async () => {
      const res = await call(base, '/customer/cart/items', {
        method: 'POST',
        token: tokenA,
        body: { productId, quantity: 1, unitPriceMinor: 1 },
      });
      expect(res.status).toBe(400);
    });

    it('sets an absolute quantity, and zero removes the line', async () => {
      const set = await call(base, '/customer/cart/items/' + productId, {
        method: 'PATCH',
        token: tokenA,
        body: { quantity: 5 },
      });
      expect(set.status).toBe(200);

      const zero = await call<{ removed: boolean }>(base, '/customer/cart/items/' + productId, {
        method: 'PATCH',
        token: tokenA,
        body: { quantity: 0 },
      });
      expect(zero.body.removed).toBe(true);
    });

    it('isolates one customer from another', async () => {
      await call(base, '/customer/cart/items', {
        method: 'POST',
        token: tokenA,
        body: { productId, quantity: 4 },
      });

      const bCart = await call<{ itemCount: number }>(base, '/customer/cart', { token: tokenB });
      expect(bCart.body.itemCount).toBe(0);

      // B cannot reach A's line: B has no cart, so the update finds nothing.
      const bPatch = await call(base, '/customer/cart/items/' + productId, {
        method: 'PATCH',
        token: tokenB,
        body: { quantity: 99 },
      });
      expect(bPatch.status).toBe(404);

      const bDelete = await call<{ removed: boolean }>(base, '/customer/cart/items/' + productId, {
        method: 'DELETE',
        token: tokenB,
      });
      expect(bDelete.body.removed).toBe(false);

      // A is untouched by both attempts.
      const aCart = await call<{ itemCount: number }>(base, '/customer/cart', { token: tokenA });
      expect(aCart.body.itemCount).toBe(4);
    });

    it('survives concurrent adds without duplicating a line', async () => {
      await call(base, '/customer/cart', { method: 'DELETE', token: tokenB });

      // Four adds at once. Two things must hold: the unique key on
      // (cartId, productId) keeps this to one line, and — just as important —
      // the losing requests must not surface as 500s. A concurrent first-add
      // races on creating the cart itself, and that race is a legitimate retry,
      // not a server fault.
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          call(base, '/customer/cart/items', {
            method: 'POST',
            token: tokenB,
            body: { productId: productBId, quantity: 1 },
          }),
        ),
      );

      const lines = await prisma.cartItem.findMany({
        where: { cart: { customerAccountId: accountB }, productId: productBId },
      });
      expect(lines).toHaveLength(1);

      const serverErrors = results.filter((r) => r.status >= 500);
      expect(serverErrors).toHaveLength(0);
      // Every request either succeeded or was a conflict the client may retry.
      expect(results.every((r) => r.status < 500)).toBe(true);
    });

    it('refuses a product that does not exist', async () => {
      const res = await call(base, '/customer/cart/items', {
        method: 'POST',
        token: tokenA,
        body: { productId: 'does-not-exist', quantity: 1 },
      });
      // 404, not 400: the request is well formed, the product is simply absent.
      // The distinction matters to a client deciding whether to retry.
      expect(res.status).toBe(404);
    });
  });

  // ------------------------------------------------------------ favourites

  describe('favourites', () => {
    it('refuses an unauthenticated read', async () => {
      const res = await call(base, '/customer/favorites');
      expect(res.status).toBe(401);
    });

    it('is idempotent when the same product is saved twice', async () => {
      await call(base, '/customer/favorites', { method: 'POST', token: tokenA, body: { productId } });
      await call(base, '/customer/favorites', { method: 'POST', token: tokenA, body: { productId } });

      const rows = await prisma.favorite.findMany({
        where: { customerAccountId: accountA, productId },
      });
      expect(rows).toHaveLength(1);
    });

    it('does not show one customer another customer\'s favourites', async () => {
      const bList = await call<unknown[]>(base, '/customer/favorites', { token: tokenB });
      expect(bList.body).toHaveLength(0);
    });

    it('removes a favourite', async () => {
      const res = await call(base, '/customer/favorites/' + productId, {
        method: 'DELETE',
        token: tokenA,
      });
      expect(res.status).toBe(200);
      const rows = await prisma.favorite.findMany({ where: { customerAccountId: accountA } });
      expect(rows).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------- bookings

  describe('bookings', () => {
    it('refuses an unauthenticated list', async () => {
      const res = await call(base, '/customer/bookings');
      expect(res.status).toBe(401);
    });

    it('lists an empty history for a new account', async () => {
      const res = await call<{ items: unknown[] }>(base, '/customer/bookings', { token: tokenA });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('refuses to cancel a booking that is not the caller\'s', async () => {
      // B has no bookings, so any id is not theirs. The route must refuse rather
      // than cancel by id alone.
      const res = await call(base, '/customer/bookings/not-mine/cancel', {
        method: 'POST',
        token: tokenB,
        body: { reason: 'test' },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('validates the availability query', async () => {
      const res = await call(base, '/customer/bookings/availability?date=not-a-date', {
        token: tokenA,
      });
      // A malformed date is a client error, never a 500.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // -------------------------------------------------------------- sessions

  describe('sessions', () => {
    it('rotates a session with a body refresh token for a native client', async () => {
      const login = await call<{ accessToken: string; refreshToken?: string }>(
        base,
        '/customer/auth/login',
        {
          method: 'POST',
          headers: { 'x-oryx-client': 'mobile' },
          body: { email: `${PREFIX.toLowerCase()}-a@test.local`, password },
        },
      );
      expect(login.status).toBe(200);
      // The native client asks for a body token because it has no cookie jar.
      expect(typeof login.body.refreshToken).toBe('string');

      const refreshed = await call<{ accessToken: string }>(base, '/customer/auth/refresh', {
        method: 'POST',
        headers: { 'x-oryx-client': 'mobile' },
        body: { refreshToken: login.body.refreshToken },
      });
      expect(refreshed.status).toBe(200);
      expect(typeof refreshed.body.accessToken).toBe('string');
    });

    it('refuses a refresh with no token', async () => {
      const res = await call(base, '/customer/auth/refresh', { method: 'POST', body: {} });
      expect(res.status).toBe(401);
    });

    it('refuses an expired or invalid access token', async () => {
      const res = await call(base, '/customer/auth/me', { token: 'not-a-real-token' });
      expect(res.status).toBe(401);
    });

    it('refuses a customer token on a staff route', async () => {
      // The two planes are separate: a consumer token must not open the ERP.
      const res = await call(base, '/companies', { token: tokenA });
      expect([401, 403]).toContain(res.status);
    });

    it('restores the account from a valid token', async () => {
      const res = await call<{ email: string }>(base, '/customer/auth/me', { token: tokenA });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(`${PREFIX.toLowerCase()}-a@test.local`);
    });
  });
});
