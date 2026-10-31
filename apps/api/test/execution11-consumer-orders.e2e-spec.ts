import * as argon2 from 'argon2';
import { PrismaService } from '../src/common/prisma.service';
import {
  call,
  createTestApp,
  login,
  SEED_SUPER_ADMIN,
  type TestContext,
} from './test-app';

/**
 * Execution 11 — consumer orders and checkout.
 *
 * Real HTTP against the running API, the real guards and the real Prisma layer.
 * The properties asserted are the ones a checkout is most likely to get wrong:
 * that the server owns every figure, that a retried placement is idempotent,
 * that one customer cannot read or cancel another's order, that stock moves
 * through the shared ledger, and that a merchant sees only its own tenant's
 * orders.
 */
describe('Execution 11 — consumer orders & checkout (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'E11';
  const password = 'e11-test-password-12345';

  let tokenA = '';
  let tokenB = '';
  let accountA = '';
  let accountB = '';

  let companyId = '';
  let otherCompanyId = '';
  let productA = '';
  let productB = '';
  let warehouseId = '';
  let otherWarehouseId = '';

  let merchantToken = '';
  let nonProviderToken = '';
  let providerId = '';
  const merchantEmail = `${PREFIX.toLowerCase()}-merchant@test.local`;
  const nonProviderEmail = `${PREFIX.toLowerCase()}-noprovider@test.local`;

  const createdOrderIds: string[] = [];

  async function register(email: string): Promise<{ token: string; accountId: string }> {
    const res = await call<{ accessToken: string; account: { id: string } }>(
      ctx.base,
      '/customer/auth/register',
      {
        method: 'POST',
        headers: { 'x-oryx-client': 'mobile' },
        body: { email, password, fullName: `E11 ${email}`, preferredLocale: 'en' },
      },
    );
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { token: res.body.accessToken, accountId: res.body.account.id };
  }

  /** Put a product in the caller's cart and return the resulting cart. */
  async function addToCart(token: string, productId: string, quantity: number) {
    return call(ctx.base, '/customer/cart/items', {
      method: 'POST',
      token,
      body: { productId, quantity },
    });
  }

  async function placeOrder(token: string, body: Record<string, unknown>) {
    return call<{ id: string; reference: string; totalMinor: number; status: string }>(
      ctx.base,
      '/customer/orders',
      { method: 'POST', token, body },
    );
  }

  /** Removes any fixture a previous, interrupted run left behind. */
  async function purgeFixtures() {
    const companies = await prisma.company.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const companyIds = companies.map((c) => c.id);
    const accounts = await prisma.customerAccount.findMany({
      where: { email: { contains: `${PREFIX.toLowerCase()}-` } },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const orders = await prisma.customerOrder.findMany({
      where: {
        OR: [{ customerAccountId: { in: accountIds } }, { companyId: { in: companyIds } }],
      },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.customerOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.customerOrderLine.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.customerOrder.deleteMany({ where: { id: { in: orderIds } } });

    await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: { in: accountIds } } } });
    await prisma.cart.deleteMany({ where: { customerAccountId: { in: accountIds } } });
    await prisma.customerAddress.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.favorite.deleteMany({ where: { customerAccountId: { in: accountIds } } });

    await prisma.stockMovement.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.stockLevel.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.productImage.deleteMany({ where: { product: { companyId: { in: companyIds } } } });
    await prisma.product.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: companyIds } } });

    const providers = await prisma.marketplaceProvider.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    await prisma.providerUser.deleteMany({ where: { providerId: { in: providers.map((p) => p.id) } } });
    await prisma.marketplaceProvider.deleteMany({ where: { code: { startsWith: PREFIX } } });

    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.customerAccount.deleteMany({ where: { id: { in: accountIds } } });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    await purgeFixtures();

    // A tenant with a real catalogue, a warehouse and a tracked product, so the
    // stock side of placement is exercised rather than skipped.
    const company = await prisma.company.create({
      data: { code: `${PREFIX}-SHOP`, nameEn: 'E11 Shop', nameAr: 'متجر', type: 'SAAS_TENANT' },
    });
    companyId = company.id;
    const warehouse = await prisma.warehouse.create({
      data: { companyId, code: `${PREFIX}-WH`, nameEn: 'E11 Warehouse', nameAr: 'مستودع', isActive: true },
    });
    warehouseId = warehouse.id;

    const product = await prisma.product.create({
      data: {
        companyId,
        sku: `${PREFIX}-P1`,
        nameEn: 'E11 Oil Filter',
        nameAr: 'فلتر زيت',
        salesPriceMinor: 5_000,
        taxRateBp: 1_000,
        trackStock: true,
        isActive: true,
      },
    });
    productA = product.id;
    await prisma.stockLevel.create({
      data: { companyId, warehouseId, productId: productA, quantity: 100 * 10_000, averageCostMinor: 0 },
    });

    // A second tenant, so a merchant of one cannot read the other's orders.
    const other = await prisma.company.create({
      data: { code: `${PREFIX}-OTHER`, nameEn: 'E11 Other', nameAr: 'أخرى', type: 'SAAS_TENANT' },
    });
    otherCompanyId = other.id;
    const otherWarehouse = await prisma.warehouse.create({
      data: { companyId: otherCompanyId, code: `${PREFIX}-OWH`, nameEn: 'E11 Other WH', nameAr: 'مستودع', isActive: true },
    });
    otherWarehouseId = otherWarehouse.id;
    const otherProduct = await prisma.product.create({
      data: {
        companyId: otherCompanyId,
        sku: `${PREFIX}-OP1`,
        nameEn: 'E11 Foreign Part',
        nameAr: 'قطعة',
        salesPriceMinor: 900,
        isActive: true,
      },
    });
    productB = otherProduct.id;

    ({ token: tokenA, accountId: accountA } = await register(`${PREFIX.toLowerCase()}-a@test.local`));
    ({ token: tokenB, accountId: accountB } = await register(`${PREFIX.toLowerCase()}-b@test.local`));
  }, 120_000);

  afterAll(async () => {
    // Children before parents.
    const orders = await prisma.customerOrder.findMany({
      where: { customerAccountId: { in: [accountA, accountB] } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.customerOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.customerOrderLine.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.customerOrder.deleteMany({ where: { id: { in: orderIds } } });

    await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: { in: [accountA, accountB] } } } });
    await prisma.cart.deleteMany({ where: { customerAccountId: { in: [accountA, accountB] } } });
    await prisma.customerAddress.deleteMany({ where: { accountId: { in: [accountA, accountB] } } });
    await prisma.favorite.deleteMany({ where: { customerAccountId: { in: [accountA, accountB] } } });

    await prisma.stockMovement.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.stockLevel.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });

    await prisma.providerUser.deleteMany({ where: { providerId } });
    await prisma.marketplaceProvider.deleteMany({ where: { id: providerId } });
    await prisma.membership.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.user.deleteMany({ where: { email: { in: [merchantEmail, nonProviderEmail] } } });

    await prisma.product.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    await prisma.customerAccount.deleteMany({ where: { id: { in: [accountA, accountB] } } });

    await ctx.app.close();
  }, 180_000);

  // --------------------------------------------------------------- catalogue

  describe('public consumer catalogue', () => {
    it('serves products without a token', async () => {
      const res = await call<{ items: Array<{ id: string; priceMinor: number }>; total: number }>(
        ctx.base,
        `/customer/catalog/products?locale=en&companyId=${companyId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.items.some((p) => p.id === productA)).toBe(true);
    });

    it('never returns a cost price or a stock quantity', async () => {
      const res = await call<{ items: Array<Record<string, unknown>> }>(
        ctx.base,
        `/customer/catalog/products?locale=en&companyId=${companyId}`,
      );
      expect(res.status).toBe(200);
      const item = res.body.items.find((p) => p.id === productA) as Record<string, unknown>;
      expect(item).toBeDefined();
      expect(item).not.toHaveProperty('costPriceMinor');
      expect(item).not.toHaveProperty('quantity');
      expect(item).not.toHaveProperty('reorderLevel');
      // Availability is a boolean, not the on-hand number.
      expect(typeof item.available).toBe('boolean');
    });

    it('resolves a store from a company with a published catalogue', async () => {
      const res = await call<{ items: Array<{ id: string; productCount: number }> }>(
        ctx.base,
        '/customer/catalog/stores?locale=en',
      );
      expect(res.status).toBe(200);
      const shop = res.body.items.find((s) => s.id === companyId);
      expect(shop).toBeDefined();
      expect(shop!.productCount).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------- placement

  describe('order placement', () => {
    it('computes the totals from the catalogue, not from the client', async () => {
      await addToCart(tokenA, productA, 2);

      const res = await placeOrder(tokenA, { paymentMethod: 'CASH' });
      expect(res.status).toBe(201);
      createdOrderIds.push(res.body.id);

      // 2 × 5000 = 10000 subtotal, 10% tax = 1000, total 11000.
      const detail = await call<{
        subtotalMinor: number;
        taxMinor: number;
        totalMinor: number;
        lines: Array<{ quantity: number; unitPriceMinor: number; lineTotalMinor: number }>;
      }>(ctx.base, `/customer/orders/${res.body.id}`, { token: tokenA });

      expect(detail.status).toBe(200);
      expect(detail.body.subtotalMinor).toBe(10_000);
      expect(detail.body.taxMinor).toBe(1_000);
      expect(detail.body.totalMinor).toBe(11_000);
      expect(detail.body.lines[0]!.quantity).toBe(2);
      expect(detail.body.lines[0]!.unitPriceMinor).toBe(5_000);
    });

    it('refuses a placement that carries a price of its own', async () => {
      // A stronger guarantee than ignoring the field: the DTO is whitelisted, so
      // a request proposing a price is rejected outright and no order is made.
      const res = await placeOrder(tokenA, {
        paymentMethod: 'CASH',
        subtotalMinor: 1,
        totalMinor: 1,
        unitPriceMinor: 1,
      });
      expect(res.status).toBe(400);
    });

    it('empties the cart only after the order exists', async () => {
      const cart = await call<{ items: unknown[] }>(ctx.base, '/customer/cart', { token: tokenA });
      expect(cart.status).toBe(200);
      expect(cart.body.items).toHaveLength(0);
    });

    it('issues stock through the shared ledger', async () => {
      const movements = await prisma.stockMovement.findMany({
        where: { companyId, productId: productA, source: 'MARKETPLACE_ORDER' },
      });
      expect(movements.length).toBeGreaterThan(0);
      // The issue is signed negative and scaled by 10^4.
      expect(movements[0]!.quantity).toBe(-2 * 10_000);
    });

    it('refuses an empty cart', async () => {
      const res = await placeOrder(tokenA, { paymentMethod: 'CASH' });
      expect(res.status).toBe(400);
    });

    it('is idempotent: the same key returns the same order', async () => {
      await addToCart(tokenA, productA, 1);
      const key = `${PREFIX}-idem-${Date.now()}`;
      const first = await placeOrder(tokenA, { paymentMethod: 'CASH', idempotencyKey: key });
      expect(first.status).toBe(201);
      createdOrderIds.push(first.body.id);

      const replay = await placeOrder(tokenA, { paymentMethod: 'CASH', idempotencyKey: key });
      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(first.body.id);
      expect(replay.body.reference).toBe(first.body.reference);
    });

    it('refuses a placement without a customer token', async () => {
      const res = await call(ctx.base, '/customer/orders', { method: 'POST', body: { paymentMethod: 'CASH' } });
      expect(res.status).toBe(401);
    });

    it('refuses a staff token on the consumer order route', async () => {
      const staffToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const res = await call(ctx.base, '/customer/orders', { token: staffToken });
      expect(res.status).toBe(401);
    });
  });

  // ------------------------------------------------------------- ownership

  describe('ownership', () => {
    let orderId = '';

    beforeAll(async () => {
      await addToCart(tokenA, productA, 1);
      const res = await placeOrder(tokenA, { paymentMethod: 'CASH' });
      orderId = res.body.id;
      createdOrderIds.push(orderId);
    });

    it('shows the order to its owner', async () => {
      const res = await call(ctx.base, `/customer/orders/${orderId}`, { token: tokenA });
      expect(res.status).toBe(200);
    });

    it('hides the order from another account', async () => {
      const res = await call(ctx.base, `/customer/orders/${orderId}`, { token: tokenB });
      expect(res.status).toBe(404);
    });

    it('refuses a cancellation from another account', async () => {
      const res = await call(ctx.base, `/customer/orders/${orderId}/cancel`, {
        method: 'POST',
        token: tokenB,
        body: { reason: 'not mine' },
      });
      expect(res.status).toBe(404);
    });

    it('lists only the caller’s own orders', async () => {
      const mine = await call<{ items: Array<{ id: string }> }>(ctx.base, '/customer/orders', { token: tokenB });
      expect(mine.status).toBe(200);
      expect(mine.body.items.some((o) => o.id === orderId)).toBe(false);
    });
  });

  // ---------------------------------------------------------- cancellation

  describe('cancellation', () => {
    let orderId = '';

    beforeAll(async () => {
      await addToCart(tokenA, productA, 3);
      const res = await placeOrder(tokenA, { paymentMethod: 'CASH' });
      orderId = res.body.id;
      createdOrderIds.push(orderId);
    });

    it('cancels a pending order and returns the stock', async () => {
      const before = await prisma.stockMovement.count({
        where: { companyId, productId: productA, source: 'MARKETPLACE_ORDER_CANCEL' },
      });

      const res = await call<{ status: string; cancellable: boolean }>(
        ctx.base,
        `/customer/orders/${orderId}/cancel`,
        { method: 'POST', token: tokenA, body: { reason: 'changed my mind' } },
      );
      // The cancel route answers 200 OK: it updates an existing order rather
      // than creating one.
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.cancellable).toBe(false);

      const after = await prisma.stockMovement.count({
        where: { companyId, productId: productA, source: 'MARKETPLACE_ORDER_CANCEL' },
      });
      expect(after).toBe(before + 1);
    });

    it('refuses a second cancellation', async () => {
      const res = await call(ctx.base, `/customer/orders/${orderId}/cancel`, {
        method: 'POST',
        token: tokenA,
        body: { reason: 'again' },
      });
      expect(res.status).toBe(409);
    });
  });

  // ------------------------------------------------------- merchant portal

  describe('merchant order queue', () => {
    let orderId = '';
    let merchantCompanyId = '';
    let merchantProductId = '';
    let foreignOrderId = '';
    let tokenC = '';
    let tokenD = '';
    let accountC = '';
    let accountD = '';

    beforeAll(async () => {
      const superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${PREFIX}-MERCH`,
          nameEn: 'E11 Merchant Tenant',
          nameAr: 'شركة التاجر',
          type: 'SAAS_TENANT',
          planId: enterprise.id,
        },
      });
      expect(created.status).toBe(201);
      merchantCompanyId = created.body.company.id;

      // Point the merchant's provider at this tenant, so its queue is scoped to
      // the same company the customers below order from.
      await prisma.marketplaceProvider.update({
        where: { id: providerId },
        data: { providerCompanyId: merchantCompanyId },
      });

      const merchantProduct = await prisma.product.create({
        data: {
          companyId: merchantCompanyId,
          sku: `${PREFIX}-MP1`,
          nameEn: 'E11 Merchant Part',
          nameAr: 'قطعة التاجر',
          salesPriceMinor: 2_000,
          isActive: true,
        },
      });
      merchantProductId = merchantProduct.id;

      // Dedicated accounts, so no earlier test's cart tenant interferes: a cart
      // does not span tenants, and adding to a cart bound to another catalogue is
      // correctly refused.
      ({ token: tokenC, accountId: accountC } = await register(`${PREFIX.toLowerCase()}-c@test.local`));
      ({ token: tokenD, accountId: accountD } = await register(`${PREFIX.toLowerCase()}-d@test.local`));

      await addToCart(tokenC, merchantProductId, 1);
      const placed = await placeOrder(tokenC, { paymentMethod: 'CASH' });
      orderId = placed.body.id;
      createdOrderIds.push(orderId);

      // A second order against the *other* tenant, which this merchant must not
      // be able to read.
      await addToCart(tokenD, productB, 1);
      const foreign = await placeOrder(tokenD, { paymentMethod: 'CASH' });
      foreignOrderId = foreign.body.id;
      createdOrderIds.push(foreignOrderId);

      (globalThis as Record<string, unknown>).__e11Merchant = { merchantCompanyId, accountC, accountD };
    }, 180_000);

    it('lists the tenant’s orders for its own merchant', async () => {
      const res = await call<{ items: Array<{ id: string; customerAccountId: string }> }>(
        ctx.base,
        '/provider/orders',
        { token: merchantToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.items.some((o) => o.id === orderId)).toBe(true);
    });

    it('hides another tenant’s order from this merchant', async () => {
      const res = await call(ctx.base, `/provider/orders/${foreignOrderId}`, { token: merchantToken });
      expect(res.status).toBe(404);
    });

    it('advances an order through the status machine', async () => {
      const res = await call<{ status: string }>(ctx.base, `/provider/orders/${orderId}/status`, {
        method: 'POST',
        token: merchantToken,
        body: { status: 'CONFIRMED' },
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CONFIRMED');
    });

    it('refuses a transition the graph does not allow', async () => {
      const res = await call(ctx.base, `/provider/orders/${orderId}/status`, {
        method: 'POST',
        token: merchantToken,
        // CONFIRMED may only become PREPARING or CANCELLED.
        body: { status: 'DELIVERED' },
      });
      expect(res.status).toBe(409);
    });

    it('refuses a merchant that holds the permission but has no provider membership', async () => {
      const res = await call(ctx.base, '/provider/orders', { token: nonProviderToken });
      expect(res.status).toBe(403);
    });

    it('refuses a consumer token on the merchant order queue', async () => {
      const res = await call(ctx.base, '/provider/orders', { token: tokenA });
      expect(res.status).toBe(401);
    });

    afterAll(async () => {
      const fixture = (globalThis as Record<string, unknown>).__e11Merchant as
        | { merchantCompanyId: string; accountC: string; accountD: string }
        | undefined;
      if (!fixture) return;
      const ids = [fixture.accountC, fixture.accountD];
      const orders = await prisma.customerOrder.findMany({
        where: { customerAccountId: { in: ids } },
        select: { id: true },
      });
      const orderIds = orders.map((o) => o.id);
      await prisma.customerOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.customerOrderLine.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.customerOrder.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: { in: ids } } } });
      await prisma.cart.deleteMany({ where: { customerAccountId: { in: ids } } });
      await prisma.stockMovement.deleteMany({ where: { companyId: fixture.merchantCompanyId } });
      await prisma.stockLevel.deleteMany({ where: { companyId: fixture.merchantCompanyId } });
      await prisma.product.deleteMany({ where: { companyId: fixture.merchantCompanyId } });
      await prisma.customerAccount.deleteMany({ where: { id: { in: ids } } });
      await prisma.company.deleteMany({ where: { id: fixture.merchantCompanyId } });
    }, 120_000);
  });

  // The provider fixture is created before any test runs, so the merchant suite
  // above can sign in. It is registered last so the ids it needs already exist.
  beforeAll(async () => {
    const superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: `${PREFIX}-PROVCO`,
        nameEn: 'E11 Provider Tenant',
        nameAr: 'شركة المزود',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    const providerCompanyId = created.body.company.id;
    (globalThis as Record<string, unknown>).__e11ProviderCompany = providerCompanyId;

    const adminRole = await prisma.role.findFirstOrThrow({
      where: { companyId: providerCompanyId, code: 'company_admin' },
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const merchantUser = await prisma.user.create({
      data: {
        email: merchantEmail,
        passwordHash,
        fullNameEn: 'E11 Merchant',
        fullNameAr: 'تاجر',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: merchantUser.id, companyId: providerCompanyId, roleId: adminRole.id, isActive: true },
    });

    const nonProviderUser = await prisma.user.create({
      data: {
        email: nonProviderEmail,
        passwordHash,
        fullNameEn: 'E11 No Provider',
        fullNameAr: 'بدون مزود',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: {
        userId: nonProviderUser.id,
        companyId: providerCompanyId,
        roleId: adminRole.id,
        isActive: true,
      },
    });

    const provider = await prisma.marketplaceProvider.create({
      data: {
        code: `${PREFIX}-PROV`,
        nameEn: 'E11 Merchant Provider',
        nameAr: 'مزود',
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
  }, 180_000);
});
