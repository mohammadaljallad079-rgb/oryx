import * as argon2 from 'argon2';
import { MODULE_KEYS } from '@oryx/shared';
import { PrismaService } from '../src/common/prisma.service';
import { call, companyCall, createTestApp, login, SEED_SUPER_ADMIN, type TestContext } from './test-app';

/**
 * Execution 20 — the planned automotive ecosystem (P3–P7).
 *
 * Real HTTP against the running API, the real guards and the real Prisma layer.
 * The properties asserted are the ones each capability is most likely to get
 * wrong: that a proximity query really orders by distance, that an RFQ
 * acceptance is exclusive, that a return restores stock through the shared
 * ledger and only inside its window, that a recovery request cannot skip a state
 * or be advanced by the wrong provider, that a fleet is scoped to its owner, and
 * that SENSAGE produces nothing at all until it is configured.
 */
describe('Execution 20 — planned ecosystem P3–P7 (e2e)', () => {
  let ctx: TestContext;
  let prisma: PrismaService;

  const PREFIX = 'E20';
  const password = 'e20-test-password-12345';

  let companyId = '';
  let otherCompanyId = '';
  let warehouseId = '';
  let productA = '';
  let vehicleA = '';
  let vehicleB = '';
  let customerId = '';

  let tokenA = '';
  let tokenB = '';
  let accountA = '';
  let accountB = '';

  let merchantToken = '';
  let otherMerchantToken = '';
  let nonProviderToken = '';
  let shopAdminToken = '';
  let limitedStaffToken = '';
  let providerA = '';
  let providerB = '';
  let otherProvider = '';
  /** A real staff user id, so audit rows satisfy their actor foreign key. */
  let staffUserId = '';
  let shopRoleId = '';

  const merchantEmail = `${PREFIX.toLowerCase()}-merchant@test.local`;
  const otherMerchantEmail = `${PREFIX.toLowerCase()}-merchant2@test.local`;
  const nonProviderEmail = `${PREFIX.toLowerCase()}-noprovider@test.local`;
  const shopAdminEmail = `${PREFIX.toLowerCase()}-shopadmin@test.local`;
  const limitedStaffEmail = `${PREFIX.toLowerCase()}-limited@test.local`;

  async function register(email: string, defaultCompanyId: string) {
    const res = await call<{ accessToken: string; account: { id: string } }>(
      ctx.base,
      '/customer/auth/register',
      {
        method: 'POST',
        headers: { 'x-oryx-client': 'mobile' },
        body: { email, password, fullName: `E20 ${email}`, preferredLocale: 'en' },
      },
    );
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    await prisma.customerAccount.update({
      where: { id: res.body.account.id },
      data: { defaultCompanyId },
    });
    return { token: res.body.accessToken, accountId: res.body.account.id };
  }

  async function createVehicle(accountId: string, vin: string, make: string, model: string, year: number) {
    return prisma.vehicle.create({
      data: { companyId, customerId, customerAccountId: accountId, vin, make, model, modelYear: year },
    });
  }

  /** Removes every fixture a previous, interrupted run may have left behind. */
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
    const providers = await prisma.marketplaceProvider.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const providerIds = providers.map((p) => p.id);

    const rfqs = await prisma.customerRfq.findMany({
      where: { OR: [{ companyId: { in: companyIds } }, { customerAccountId: { in: accountIds } }] },
      select: { id: true },
    });
    await prisma.customerRfqQuote.deleteMany({ where: { rfqId: { in: rfqs.map((r) => r.id) } } });
    await prisma.customerRfq.deleteMany({ where: { id: { in: rfqs.map((r) => r.id) } } });

    const returns = await prisma.customerOrderReturn.findMany({
      where: { OR: [{ companyId: { in: companyIds } }, { customerAccountId: { in: accountIds } }] },
      select: { id: true },
    });
    await prisma.customerOrderReturnLine.deleteMany({ where: { returnId: { in: returns.map((r) => r.id) } } });
    await prisma.customerOrderReturn.deleteMany({ where: { id: { in: returns.map((r) => r.id) } } });

    const recoveries = await prisma.recoveryRequest.findMany({
      where: { OR: [{ companyId: { in: companyIds } }, { customerAccountId: { in: accountIds } }] },
      select: { id: true },
    });
    await prisma.recoveryTrackingEvent.deleteMany({ where: { requestId: { in: recoveries.map((r) => r.id) } } });
    await prisma.recoveryRequest.deleteMany({ where: { id: { in: recoveries.map((r) => r.id) } } });

    const fleets = await prisma.fleetAccount.findMany({
      where: { customerAccountId: { in: accountIds } },
      select: { id: true },
    });
    const fleetIds = fleets.map((f) => f.id);
    await prisma.driver.deleteMany({ where: { fleetId: { in: fleetIds } } });
    await prisma.fleetVehicle.deleteMany({ where: { fleetId: { in: fleetIds } } });
    await prisma.fleetAccount.deleteMany({ where: { id: { in: fleetIds } } });

    await prisma.aiSuggestion.deleteMany({
      where: { OR: [{ companyId: { in: companyIds } }, { customerAccountId: { in: accountIds } }] },
    });
    await prisma.aiUsageCounter.deleteMany({ where: { companyId: { in: companyIds } } });

    const orders = await prisma.customerOrder.findMany({
      where: { OR: [{ customerAccountId: { in: accountIds } }, { companyId: { in: companyIds } }] },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.customerOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.customerOrderLine.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.customerOrder.deleteMany({ where: { id: { in: orderIds } } });

    await prisma.cartItem.deleteMany({ where: { cart: { customerAccountId: { in: accountIds } } } });
    await prisma.cart.deleteMany({ where: { customerAccountId: { in: accountIds } } });
    await prisma.customerInspectionPhoto.deleteMany({ where: { customerAccountId: { in: accountIds } } });
    await prisma.cmsMediaAsset.deleteMany({ where: { storageKey: { startsWith: PREFIX } } });
    await prisma.vehicle.deleteMany({ where: { customerAccountId: { in: accountIds } } });

    await prisma.stockMovement.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.stockLevel.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.partCompatibility.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.product.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: companyIds } } });

    await prisma.providerUser.deleteMany({ where: { providerId: { in: providerIds } } });
    await prisma.marketplaceProvider.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.documentSequence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.membership.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: `${PREFIX.toLowerCase()}-` } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.customerAccount.deleteMany({ where: { id: { in: accountIds } } });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    await purgeFixtures();

    const company = await prisma.company.create({
      data: {
        code: `${PREFIX}-SHOP`,
        nameEn: 'E20 Shop',
        nameAr: 'متجر',
        type: 'SAAS_TENANT',
        // A membership only produces a session against an ACTIVE company; the
        // provisioning default would refuse the staff login.
        status: 'ACTIVE',
      },
    });
    companyId = company.id;
    const other = await prisma.company.create({
      data: {
        code: `${PREFIX}-OTHER`,
        nameEn: 'E20 Other',
        nameAr: 'أخرى',
        type: 'SAAS_TENANT',
        status: 'ACTIVE',
      },
    });
    otherCompanyId = other.id;

    // A tenant needs an active subscription before any permission survives the
    // entitlement filter; without one every staff call is refused as
    // `PLAN_NOT_ACTIVE`, which would mask the behaviour under test.
    const shopPlan = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    await prisma.subscription.create({
      data: {
        companyId,
        planId: shopPlan.id,
        status: 'ACTIVE',
        price: 0,
        licensedModules: [...MODULE_KEYS],
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: { companyId, code: `${PREFIX}-WH`, nameEn: 'E20 Warehouse', nameAr: 'مستودع', isActive: true },
    });
    warehouseId = warehouse.id;

    const product = await prisma.product.create({
      data: {
        companyId,
        sku: `${PREFIX}-P1`,
        nameEn: 'E20 Brake Pad',
        nameAr: 'وسادة فرامل',
        salesPriceMinor: 12_000,
        taxRateBp: 1_000,
        trackStock: true,
        isActive: true,
      },
    });
    productA = product.id;
    await prisma.stockLevel.create({
      data: { companyId, warehouseId, productId: productA, quantity: 100 * 10_000, averageCostMinor: 0 },
    });

    const erpCustomer = await prisma.customer.create({
      data: { companyId, code: `${PREFIX}-CUST`, nameEn: 'E20 Customer', nameAr: 'عميل' },
    });
    customerId = erpCustomer.id;

    // A staff administrator for the shop tenant, so the operator paths (return
    // decisions, receipt, AI review) are exercised over real HTTP with the
    // permission the route demands rather than bypassing the guard.
    const shopRole = await prisma.role.create({
      data: {
        companyId,
        code: `${PREFIX}_shop_admin`,
        nameEn: 'E20 Shop Admin',
        nameAr: 'مدير المتجر',
        isSystem: false,
        permissions: {
          create: [
            { permissionCode: 'erp.customer_portal.read' },
            { permissionCode: 'erp.customer_portal.manage' },
            { permissionCode: 'erp.marketplace.request.manage' },
            { permissionCode: 'erp.marketplace.provider.manage' },
          ],
        },
      },
    });
    shopRoleId = shopRole.id;

    ({ token: tokenA, accountId: accountA } = await register(`${PREFIX.toLowerCase()}-a@test.local`, companyId));
    ({ token: tokenB, accountId: accountB } = await register(`${PREFIX.toLowerCase()}-b@test.local`, companyId));

    const vA = await createVehicle(accountA, `${PREFIX}-VIN-A`, 'Toyota', 'Corolla', 2020);
    const vB = await createVehicle(accountB, `${PREFIX}-VIN-B`, 'Honda', 'Civic', 2019);
    vehicleA = vA.id;
    vehicleB = vB.id;

    // A provider tenant, a merchant user linked to it, and a second provider in
    // a second tenant, so cross-provider and cross-tenant reads can be tested.
    const superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    const enterprise = await prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });

    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: `${PREFIX}-PROVCO`,
        nameEn: 'E20 Provider Tenant',
        nameAr: 'شركة المزود',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    const providerCompanyId = created.body.company.id;
    const adminRole = await prisma.role.findFirstOrThrow({
      where: { companyId: providerCompanyId, code: 'company_admin' },
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const merchantUser = await prisma.user.create({
      data: {
        email: merchantEmail,
        passwordHash,
        fullNameEn: 'E20 Merchant',
        fullNameAr: 'تاجر',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: merchantUser.id, companyId: providerCompanyId, roleId: adminRole.id, isActive: true },
    });

    const otherMerchantUser = await prisma.user.create({
      data: {
        email: otherMerchantEmail,
        passwordHash,
        fullNameEn: 'E20 Merchant Two',
        fullNameAr: 'تاجر ٢',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: {
        userId: otherMerchantUser.id,
        companyId: providerCompanyId,
        roleId: adminRole.id,
        isActive: true,
      },
    });

    const nonProviderUser = await prisma.user.create({
      data: {
        email: nonProviderEmail,
        passwordHash,
        fullNameEn: 'E20 No Provider',
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

    const pA = await prisma.marketplaceProvider.create({
      data: {
        code: `${PREFIX}-PROV`,
        nameEn: 'E20 Provider A',
        nameAr: 'مزود أ',
        status: 'APPROVED',
        approvedAt: new Date(),
        // Linked to the shop tenant, so the RFQs and recovery jobs raised
        // against that tenant are the ones this provider sees.
        providerCompanyId: companyId,
        categoryKey: 'spare_parts',
      },
    });
    providerA = pA.id;
    const pB = await prisma.marketplaceProvider.create({
      data: {
        code: `${PREFIX}-PROV2`,
        nameEn: 'E20 Provider B',
        nameAr: 'مزود ب',
        status: 'APPROVED',
        approvedAt: new Date(),
        providerCompanyId: companyId,
        categoryKey: 'spare_parts',
      },
    });
    providerB = pB.id;
    const pOther = await prisma.marketplaceProvider.create({
      data: {
        code: `${PREFIX}-PROV3`,
        nameEn: 'E20 Provider Other',
        nameAr: 'مزود آخر',
        status: 'APPROVED',
        approvedAt: new Date(),
        providerCompanyId: otherCompanyId,
        categoryKey: 'spare_parts',
      },
    });
    otherProvider = pOther.id;

    await prisma.providerUser.create({
      data: { providerId: providerA, userId: merchantUser.id, role: 'OWNER', isActive: true },
    });
    await prisma.providerUser.create({
      data: { providerId: providerB, userId: otherMerchantUser.id, role: 'OWNER', isActive: true },
    });

    merchantToken = await login(ctx.base, merchantEmail, password);
    otherMerchantToken = await login(ctx.base, otherMerchantEmail, password);
    nonProviderToken = await login(ctx.base, nonProviderEmail, password);

    const shopAdminUser = await prisma.user.create({
      data: {
        email: shopAdminEmail,
        passwordHash,
        fullNameEn: 'E20 Shop Admin',
        fullNameAr: 'مدير المتجر',
        status: 'ACTIVE',
      },
    });
    staffUserId = shopAdminUser.id;
    await prisma.membership.create({
      data: { userId: shopAdminUser.id, companyId, roleId: shopRole.id, isActive: true },
    });
    shopAdminToken = await login(ctx.base, shopAdminEmail, password);

    // A staff user with a role that carries only read access to the company, so
    // a permission refusal can be told apart from a token-plane refusal.
    const limitedRole = await prisma.role.create({
      data: {
        companyId,
        code: `${PREFIX}_limited`,
        nameEn: 'E20 Limited Staff',
        nameAr: 'موظف محدود',
        isSystem: false,
        permissions: { create: [{ permissionCode: 'company.read' }] },
      },
    });
    const limitedUser = await prisma.user.create({
      data: {
        email: limitedStaffEmail,
        passwordHash,
        fullNameEn: 'E20 Limited',
        fullNameAr: 'محدود',
        status: 'ACTIVE',
      },
    });
    await prisma.membership.create({
      data: { userId: limitedUser.id, companyId, roleId: limitedRole.id, isActive: true },
    });
    limitedStaffToken = await login(ctx.base, limitedStaffEmail, password);
  }, 240_000);

  afterAll(async () => {
    await purgeFixtures();
    await ctx.app.close();
  }, 240_000);

  // ==================================================================== P3

  describe('P3 — Auto Map proximity discovery', () => {
    const nearId = `${PREFIX}-GEO-NEAR`;
    const farId = `${PREFIX}-GEO-FAR`;

    beforeAll(async () => {
      await prisma.marketplaceProvider.create({
        data: {
          code: nearId,
          nameEn: 'E20 Near Garage',
          nameAr: 'ورشة قريبة',
          status: 'APPROVED',
          approvedAt: new Date(),
          categoryKey: 'garages',
          latitude: 26.2285,
          longitude: 50.586,
        },
      });
      await prisma.marketplaceProvider.create({
        data: {
          code: farId,
          nameEn: 'E20 Far Garage',
          nameAr: 'ورشة بعيدة',
          status: 'APPROVED',
          approvedAt: new Date(),
          categoryKey: 'garages',
          latitude: 24.4667,
          longitude: 54.3667,
        },
      });
    });

    afterAll(async () => {
      await prisma.marketplaceProvider.deleteMany({ where: { code: { in: [nearId, farId] } } });
    });

    it('orders providers nearest-first and reports a distance', async () => {
      const res = await call<{
        items: Array<{ id: string; distanceKm: number | null; latitude: number | null }>;
      }>(ctx.base, '/marketplace/providers?categoryKey=garages&lat=26.2285&lng=50.586&pageSize=50');
      expect(res.status).toBe(200);

      const near = res.body.items.find((p) => p.latitude !== null);
      expect(near).toBeDefined();
      const nearIndex = res.body.items.findIndex((p) => p.distanceKm !== null && p.distanceKm < 1);
      expect(nearIndex).toBe(0);
      expect(res.body.items[0].distanceKm).toBeLessThan(1);
    });

    it('excludes a provider outside the radius', async () => {
      const res = await call<{ items: Array<{ distanceKm: number }> }>(
        ctx.base,
        '/marketplace/providers?categoryKey=garages&lat=26.2285&lng=50.586&radiusKm=50&pageSize=50',
      );
      expect(res.status).toBe(200);
      // Abu Dhabi is roughly 400 km from Manama, so it must not appear.
      expect(res.body.items.every((p) => p.distanceKm <= 50)).toBe(true);
    });

    it('rejects half a coordinate', async () => {
      const res = await call(ctx.base, '/marketplace/providers?lat=26.2285');
      expect(res.status).toBe(400);
    });

    it('rejects an out-of-range latitude', async () => {
      const res = await call(ctx.base, '/marketplace/providers?lat=120&lng=50');
      expect(res.status).toBe(400);
    });
  });

  // ==================================================================== P4

  describe('P4 — spare-parts RFQ', () => {
    let rfqId = '';

    it('raises an RFQ and lists it for the owning account', async () => {
      const res = await call<{ id: string; reference: string; status: string }>(ctx.base, '/customer/rfqs', {
        method: 'POST',
        token: tokenA,
        body: { categoryKey: 'spare_parts', description: 'Need front brake pads for a 2020 Corolla.', quantity: 2 },
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('OPEN');
      rfqId = res.body.id;

      const list = await call<Array<{ id: string }>>(ctx.base, '/customer/rfqs', { token: tokenA });
      expect(list.status).toBe(200);
      expect(list.body.some((r) => r.id === rfqId)).toBe(true);
    });

    it('shows an open RFQ to an approved provider in the same tenant', async () => {
      const res = await call<Array<{ id: string }>>(ctx.base, '/provider/rfqs', { token: merchantToken });
      expect(res.status).toBe(200);
      expect(res.body.some((r) => r.id === rfqId)).toBe(true);
    });

    it('refuses a staff user who has no provider membership', async () => {
      const res = await call(ctx.base, '/provider/rfqs', { token: nonProviderToken });
      expect(res.status).toBe(403);
    });

    it('refuses a consumer token on the provider RFQ queue', async () => {
      // A consumer token is not a staff token, so the principal guard rejects it
      // before any permission is considered.
      const res = await call(ctx.base, '/provider/rfqs', { token: tokenA });
      expect(res.status).toBe(401);
    });

    it('accepts a quote and refuses a second acceptance', async () => {
      const quote = await call<{ id: string; quotes: Array<{ id: string }> }>(
        ctx.base,
        `/provider/rfqs/${rfqId}/quotes`,
        { method: 'POST', token: merchantToken, body: { priceMinor: 15_000, leadTimeDays: 2 } },
      );
      expect(quote.status).toBe(201);
      const quoteId = quote.body.quotes[0].id;

      const accept = await call<{ status: string; acceptedQuoteId: string }>(
        ctx.base,
        `/customer/rfqs/${rfqId}/quotes/${quoteId}/accept`,
        { method: 'POST', token: tokenA, body: {} },
      );
      expect(accept.status).toBe(200);
      expect(accept.body.status).toBe('ACCEPTED');
      expect(accept.body.acceptedQuoteId).toBe(quoteId);

      const again = await call(ctx.base, `/customer/rfqs/${rfqId}/quotes/${quoteId}/accept`, {
        method: 'POST',
        token: tokenA,
        body: {},
      });
      expect(again.status).toBe(409);
    });

    it('refuses a duplicate quote from the same provider', async () => {
      const other = await call<{ id: string }>(ctx.base, '/customer/rfqs', {
        method: 'POST',
        token: tokenB,
        body: { categoryKey: 'spare_parts', description: 'Looking for an alternator.', quantity: 1 },
      });
      expect(other.status).toBe(201);

      const first = await call(ctx.base, `/provider/rfqs/${other.body.id}/quotes`, {
        method: 'POST',
        token: merchantToken,
        body: { priceMinor: 40_000 },
      });
      expect(first.status).toBe(201);

      const second = await call(ctx.base, `/provider/rfqs/${other.body.id}/quotes`, {
        method: 'POST',
        token: merchantToken,
        body: { priceMinor: 39_000 },
      });
      expect(second.status).toBe(409);

      await prisma.customerRfqQuote.deleteMany({ where: { rfqId: other.body.id } });
      await prisma.customerRfq.delete({ where: { id: other.body.id } });
    });

    it('hides another account’s RFQ', async () => {
      const res = await call(ctx.base, `/customer/rfqs/${rfqId}`, { token: tokenB });
      expect(res.status).toBe(404);
    });
  });

  describe('P4 — consumer returns', () => {
    let orderId = '';
    let orderLineId = '';
    let returnId = '';

    beforeAll(async () => {
      await call(ctx.base, '/customer/cart/items', {
        method: 'POST',
        token: tokenA,
        body: { productId: productA, quantity: 2 },
      });
      const placed = await call<{ id: string }>(ctx.base, '/customer/orders', {
        method: 'POST',
        token: tokenA,
        body: { paymentMethod: 'CASH' },
      });
      expect(placed.status).toBe(201);
      orderId = placed.body.id;
      // A return is only eligible once the order is delivered or completed, so
      // the fixture is advanced the way the operator path would.
      await prisma.customerOrder.update({
        where: { id: orderId },
        data: { status: 'DELIVERED', completedAt: new Date() },
      });
      const line = await prisma.customerOrderLine.findFirstOrThrow({ where: { orderId } });
      orderLineId = line.id;
    });

    it('refuses a return on an order that is not delivered', async () => {
      await call(ctx.base, '/customer/cart/items', {
        method: 'POST',
        token: tokenB,
        body: { productId: productA, quantity: 1 },
      });
      const placed = await call<{ id: string }>(ctx.base, '/customer/orders', {
        method: 'POST',
        token: tokenB,
        body: { paymentMethod: 'CASH' },
      });
      const line = await prisma.customerOrderLine.findFirstOrThrow({ where: { orderId: placed.body.id } });
      const res = await call(ctx.base, `/customer/orders/${placed.body.id}/returns`, {
        method: 'POST',
        token: tokenB,
        body: { reason: 'Changed my mind about this part.', lines: [{ orderLineId: line.id, quantity: 1 }] },
      });
      expect(res.status).toBe(409);
    });

    it('raises a return inside the window', async () => {
      const res = await call<{ id: string; status: string; reference: string }>(
        ctx.base,
        `/customer/orders/${orderId}/returns`,
        {
          method: 'POST',
          token: tokenA,
          body: { reason: 'The pads do not fit my vehicle.', lines: [{ orderLineId, quantity: 1 }] },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('REQUESTED');
      returnId = res.body.id;
    });

    it('refuses a quantity above what was ordered', async () => {
      const res = await call(ctx.base, `/customer/orders/${orderId}/returns`, {
        method: 'POST',
        token: tokenA,
        body: { reason: 'Trying to return too many.', lines: [{ orderLineId, quantity: 99 }] },
      });
      expect(res.status).toBe(409);
    });

    it('refuses a return on another account’s order', async () => {
      const res = await call(ctx.base, `/customer/orders/${orderId}/returns`, {
        method: 'POST',
        token: tokenB,
        body: { reason: 'Not my order.', lines: [{ orderLineId, quantity: 1 }] },
      });
      expect(res.status).toBe(404);
    });

    it('restores stock when an approved return is received', async () => {
      const before = await prisma.stockLevel.findFirstOrThrow({
        where: { companyId, warehouseId, productId: productA },
      });

      // The staff path: decide, then receive. Driven over HTTP with the
      // permission the routes demand, so the guard and the stock movement are
      // both exercised rather than bypassed.
      const decided = await companyCall(ctx.base, companyId, `/ecosystem/returns/${returnId}/decide`, {
        method: 'POST',
        token: shopAdminToken,
        body: { decision: 'APPROVED', note: 'Approved for return.' },
      });
      expect(decided.status).toBe(200);

      const received = await companyCall(ctx.base, companyId, `/ecosystem/returns/${returnId}/receive`, {
        method: 'POST',
        token: shopAdminToken,
        body: {},
      });
      expect(received.status).toBe(200);
      expect((received.body as { status: string }).status).toBe('RECEIVED');

      const after = await prisma.stockLevel.findFirstOrThrow({
        where: { companyId, warehouseId, productId: productA },
      });
      expect(after.quantity).toBe(before.quantity + 1 * 10_000);
    });

    it('hides another account’s return', async () => {
      const res = await call(ctx.base, `/customer/returns/${returnId}`, { token: tokenB });
      expect(res.status).toBe(404);
    });
  });

  describe('P4 — fitment', () => {
    it('reports a known-compatible part and an unknown fitment honestly', async () => {
      await prisma.partCompatibility.create({
        data: {
          companyId,
          productId: productA,
          make: 'Toyota',
          model: 'Corolla',
          yearFrom: 2018,
          yearTo: 2022,
          notes: 'Fits front axle.',
        },
      });

      const compatible = await call<{ compatible: boolean; fitmentKnown: boolean }>(
        ctx.base,
        `/customer/fitment?vehicleId=${vehicleA}&productId=${productA}`,
        { token: tokenA },
      );
      expect(compatible.status).toBe(200);
      expect(compatible.body.compatible).toBe(true);
      expect(compatible.body.fitmentKnown).toBe(true);

      const unknown = await call<{ compatible: boolean; fitmentKnown: boolean }>(
        ctx.base,
        `/customer/fitment?vehicleId=${vehicleB}&productId=${productA}`,
        { token: tokenB },
      );
      expect(unknown.status).toBe(200);
      expect(unknown.body.compatible).toBe(false);
      expect(unknown.body.fitmentKnown).toBe(false);
    });

    it('refuses a vehicle that is not in the caller’s garage', async () => {
      const res = await call(ctx.base, `/customer/fitment?vehicleId=${vehicleA}&productId=${productA}`, {
        token: tokenB,
      });
      expect(res.status).toBe(404);
    });
  });

  // ==================================================================== P5

  describe('P5 — recovery dispatch and tracking', () => {
    let requestId = '';

    it('requires a pickup location', async () => {
      const res = await call(ctx.base, '/customer/recovery', {
        method: 'POST',
        token: tokenA,
        body: { contactPhone: '+97330000009', issue: 'Flat tyre on the highway.' },
      });
      expect(res.status).toBe(400);
    });

    it('raises a recovery request with a tracking event', async () => {
      const res = await call<{ id: string; status: string; timeline: Array<{ status: string }> }>(
        ctx.base,
        '/customer/recovery',
        {
          method: 'POST',
          token: tokenA,
          body: {
            pickupLatitude: 26.2285,
            pickupLongitude: 50.586,
            pickupLabel: 'King Fahd Causeway',
            contactPhone: '+97330000009',
            issue: 'Flat tyre on the highway.',
            urgency: 'URGENT',
            vehicleId: vehicleA,
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('REQUESTED');
      expect(res.body.timeline).toHaveLength(1);
      requestId = res.body.id;
    });

    it('refuses a vehicle that is not in the caller’s garage', async () => {
      const res = await call(ctx.base, '/customer/recovery', {
        method: 'POST',
        token: tokenA,
        body: {
          pickupLatitude: 26.2,
          pickupLongitude: 50.5,
          contactPhone: '+97330000009',
          issue: 'Not my car.',
          vehicleId: vehicleB,
        },
      });
      expect(res.status).toBe(404);
    });

    it('refuses to advance a request that is not assigned to the caller’s provider', async () => {
      const res = await call(ctx.base, `/provider/recovery/${requestId}/advance`, {
        method: 'POST',
        token: otherMerchantToken,
        body: { status: 'EN_ROUTE' },
      });
      // Provider B is not assigned, so the transition is refused.
      expect([403, 409]).toContain(res.status);
    });

    it('advances through the state machine and appends a tracking event each time', async () => {
      // Dispatch the job through the staff route, the way an operator would.
      const assigned = await companyCall(ctx.base, companyId, `/ecosystem/recovery/${requestId}/assign`, {
        method: 'POST',
        token: shopAdminToken,
        body: { providerId: providerA },
      });
      expect(assigned.status).toBe(200);
      expect((assigned.body as { status: string }).status).toBe('ASSIGNED');

      for (const status of ['EN_ROUTE', 'ON_SITE', 'COMPLETED'] as const) {
        const res = await call<{ status: string; timeline: unknown[] }>(
          ctx.base,
          `/provider/recovery/${requestId}/advance`,
          { method: 'POST', token: merchantToken, body: { status } },
        );
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }

      const events = await prisma.recoveryTrackingEvent.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => e.status)).toEqual([
        'REQUESTED',
        'ASSIGNED',
        'EN_ROUTE',
        'ON_SITE',
        'COMPLETED',
      ]);
    });

    it('refuses a transition that skips a state', async () => {
      const created = await call<{ id: string }>(ctx.base, '/customer/recovery', {
        method: 'POST',
        token: tokenB,
        body: {
          pickupLatitude: 26.2,
          pickupLongitude: 50.5,
          contactPhone: '+97330000010',
          issue: 'Engine will not start.',
        },
      });
      expect(created.status).toBe(201);

      const assigned = await companyCall(
        ctx.base,
        companyId,
        `/ecosystem/recovery/${created.body.id}/assign`,
        { method: 'POST', token: shopAdminToken, body: { providerId: providerA } },
      );
      expect(assigned.status).toBe(200);

      const res = await call(ctx.base, `/provider/recovery/${created.body.id}/advance`, {
        method: 'POST',
        token: merchantToken,
        body: { status: 'COMPLETED' },
      });
      expect(res.status).toBe(409);
    });

    it('hides another account’s recovery request', async () => {
      const res = await call(ctx.base, `/customer/recovery/${requestId}`, { token: tokenB });
      expect(res.status).toBe(404);
    });
  });

  // ==================================================================== P6

  describe('P6 — fleet and drivers', () => {
    let fleetId = '';

    it('creates a fleet and lists it for its owner', async () => {
      const res = await call<{ id: string; name: string }>(ctx.base, '/customer/fleets', {
        method: 'POST',
        token: tokenA,
        body: { name: 'E20 Logistics', contactName: 'Fleet Owner', contactPhone: '+97330000011' },
      });
      expect(res.status).toBe(201);
      fleetId = res.body.id;

      const list = await call<Array<{ id: string }>>(ctx.base, '/customer/fleets', { token: tokenA });
      expect(list.body.some((f) => f.id === fleetId)).toBe(true);
    });

    it('hides another account’s fleet', async () => {
      const res = await call(ctx.base, `/customer/fleets/${fleetId}`, { token: tokenB });
      expect(res.status).toBe(404);
    });

    it('adds only the caller’s own vehicle to a fleet', async () => {
      const ok = await call<{ vehicles: Array<{ vehicleId: string }> }>(
        ctx.base,
        `/customer/fleets/${fleetId}/vehicles`,
        { method: 'POST', token: tokenA, body: { vehicleId: vehicleA } },
      );
      expect(ok.status).toBe(200);
      expect(ok.body.vehicles.some((v) => v.vehicleId === vehicleA)).toBe(true);

      const foreign = await call(ctx.base, `/customer/fleets/${fleetId}/vehicles`, {
        method: 'POST',
        token: tokenA,
        body: { vehicleId: vehicleB },
      });
      expect(foreign.status).toBe(404);
    });

    it('adds a driver and toggles their active state', async () => {
      const created = await call<{ drivers: Array<{ id: string; fullName: string; isActive: boolean }> }>(
        ctx.base,
        `/customer/fleets/${fleetId}/drivers`,
        { method: 'POST', token: tokenA, body: { fullName: 'Ali Driver', phone: '+97330000012' } },
      );
      expect(created.status).toBe(201);
      const driverId = created.body.drivers[0].id;
      expect(created.body.drivers[0].isActive).toBe(true);

      const toggled = await call<{ drivers: Array<{ id: string; isActive: boolean }> }>(
        ctx.base,
        `/customer/fleets/${fleetId}/drivers/${driverId}/active`,
        { method: 'POST', token: tokenA, body: { isActive: false } },
      );
      expect(toggled.status).toBe(200);
      expect(toggled.body.drivers.find((d) => d.id === driverId)!.isActive).toBe(false);
    });

    it('refuses a fleet write on another account’s fleet', async () => {
      const res = await call(ctx.base, `/customer/fleets/${fleetId}/drivers`, {
        method: 'POST',
        token: tokenB,
        body: { fullName: 'Intruder', phone: '+97330000013' },
      });
      expect(res.status).toBe(404);
    });
  });

  // ==================================================================== P7

  describe('P7 — SENSAGE AI suggestions', () => {
    let photoId = '';
    let assetId = '';

    beforeAll(async () => {
      // A real stored media asset, so the analysis input has a storage key the
      // adapter can be handed rather than a placeholder.
      const asset = await prisma.cmsMediaAsset.create({
        data: {
          originalName: 'e20.jpg',
          storageKey: `${PREFIX}/e20-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          byteSize: 1024,
          width: 100,
          height: 100,
        },
      });
      assetId = asset.id;
      const photo = await prisma.customerInspectionPhoto.create({
        data: {
          customerAccountId: accountA,
          vehicleId: vehicleA,
          mediaAssetId: assetId,
          originalName: 'e20.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1024,
          width: 100,
          height: 100,
        },
      });
      photoId = photo.id;
    });

    afterAll(async () => {
      await prisma.aiSuggestion.deleteMany({ where: { photoId } });
      await prisma.customerInspectionPhoto.deleteMany({ where: { id: photoId } });
      await prisma.cmsMediaAsset.deleteMany({ where: { id: assetId } });
      await prisma.aiUsageCounter.deleteMany({ where: { companyId } });
    });

    it('reports itself unconfigured and produces no analysis', async () => {
      const status = await call<{ configured: boolean; message: string }>(ctx.base, '/customer/sensage/status', {
        token: tokenA,
      });
      expect(status.status).toBe(200);
      expect(status.body.configured).toBe(false);
      expect(status.body.message).toMatch(/not configured/i);

      const res = await call(ctx.base, '/customer/sensage/analyze', {
        method: 'POST',
        token: tokenA,
        body: { photoId, focus: 'front bumper' },
      });
      expect(res.status).toBe(400);
      expect((res.body as { code?: string }).code).toBe('ai.provider_not_configured');

      // Nothing was stored: an unconfigured provider produces no suggestion.
      const stored = await prisma.aiSuggestion.count({ where: { photoId } });
      expect(stored).toBe(0);
    });

    it('rejects a focus hint that is too long before calling the provider', async () => {
      const res = await call(ctx.base, '/customer/sensage/analyze', {
        method: 'POST',
        token: tokenA,
        body: { photoId, focus: 'x'.repeat(500) },
      });
      expect(res.status).toBe(400);
    });

    it('produces a validated, pending suggestion when configured', async () => {
      // Configure the provider the way an operator would: a key plus the
      // deterministic base URL, so the real adapter pipeline runs end to end.
      const integrations = ctx.app.get(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../src/integrations/integrations.service').IntegrationsService,
      );
      await integrations.saveCredentials(
        'SENSAGE_AI',
        {
          credentials: [
            { key: 'SENSAGE_AI_API_KEY', value: 'test-key' },
            { key: 'SENSAGE_AI_BASE_URL', value: 'test://deterministic' },
          ],
          companyId: null,
        },
        { userId: null, companyId: null },
      );

      try {
        const res = await call<{ id: string; reviewStatus: string; verified: boolean; summary: string }>(
          ctx.base,
          '/customer/sensage/analyze',
          { method: 'POST', token: tokenA, body: { photoId, focus: 'front bumper' } },
        );
        expect(res.status).toBe(201);
        expect(res.body.reviewStatus).toBe('PENDING');
        // A pending suggestion is never presented as a verified finding.
        expect(res.body.verified).toBe(false);
        expect(typeof res.body.summary).toBe('string');
        expect(res.body.summary.length).toBeGreaterThan(0);

        // A reviewer approves it over the staff route, which is what makes it
        // presentable to the customer.
        const approved = await companyCall(
          ctx.base,
          companyId,
          `/ecosystem/sensage/suggestions/${res.body.id}/review`,
          { method: 'POST', token: shopAdminToken, body: { decision: 'APPROVED', note: 'Looks right.' } },
        );
        expect(approved.status).toBe(200);
        expect((approved.body as { reviewStatus: string }).reviewStatus).toBe('APPROVED');
        expect((approved.body as { verified: boolean }).verified).toBe(true);

        // The customer now reads it back as reviewed.
        const read = await call<{ verified: boolean }>(
          ctx.base,
          `/customer/sensage/suggestions/${res.body.id}`,
          { token: tokenA },
        );
        expect(read.status).toBe(200);
        expect(read.body.verified).toBe(true);

        // The usage counter recorded the call, so the cost guard is live.
        const usage = await prisma.aiUsageCounter.findFirstOrThrow({ where: { companyId } });
        expect(usage.requestCount).toBeGreaterThan(0);
      } finally {
        await prisma.integrationCredential.deleteMany({
          where: { credentialKey: { in: ['SENSAGE_AI_API_KEY', 'SENSAGE_AI_BASE_URL'] } },
        });
        await prisma.integrationProvider.deleteMany({ where: { providerKey: 'SENSAGE_AI' } });
        await prisma.aiUsageCounter.deleteMany({ where: { companyId } });
      }
    });

    it('refuses a second review of the same suggestion', async () => {
      const integrations = ctx.app.get(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../src/integrations/integrations.service').IntegrationsService,
      );
      await integrations.saveCredentials(
        'SENSAGE_AI',
        {
          credentials: [
            { key: 'SENSAGE_AI_API_KEY', value: 'test-key' },
            { key: 'SENSAGE_AI_BASE_URL', value: 'test://deterministic' },
          ],
          companyId: null,
        },
        { userId: null, companyId: null },
      );
      try {
        const created = await call<{ id: string }>(ctx.base, '/customer/sensage/analyze', {
          method: 'POST',
          token: tokenA,
          body: { photoId },
        });
        expect(created.status).toBe(201);

        const first = await companyCall(
          ctx.base,
          companyId,
          `/ecosystem/sensage/suggestions/${created.body.id}/review`,
          { method: 'POST', token: shopAdminToken, body: { decision: 'REJECTED' } },
        );
        expect(first.status).toBe(200);

        const second = await companyCall(
          ctx.base,
          companyId,
          `/ecosystem/sensage/suggestions/${created.body.id}/review`,
          { method: 'POST', token: shopAdminToken, body: { decision: 'APPROVED' } },
        );
        expect(second.status).toBe(409);
      } finally {
        await prisma.integrationCredential.deleteMany({
          where: { credentialKey: { in: ['SENSAGE_AI_API_KEY', 'SENSAGE_AI_BASE_URL'] } },
        });
        await prisma.integrationProvider.deleteMany({ where: { providerKey: 'SENSAGE_AI' } });
        await prisma.aiUsageCounter.deleteMany({ where: { companyId } });
      }
    });

    it('refuses the review queue to a user without the customer-portal permission', async () => {
      // A staff user whose role carries no customer-platform permission, so the
      // refusal is about the permission and not about the token plane.
      const res = await companyCall(ctx.base, companyId, '/ecosystem/sensage/suggestions', {
        token: limitedStaffToken,
      });
      expect(res.status).toBe(403);
      expect((res.body as { code?: string }).code).toBe('authz.permission_denied');
    });

    it('hides another account’s suggestions', async () => {
      const res = await call<unknown[]>(ctx.base, '/customer/sensage/suggestions', { token: tokenB });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('refuses to analyse another account’s photograph', async () => {
      const res = await call(ctx.base, '/customer/sensage/analyze', {
        method: 'POST',
        token: tokenB,
        body: { photoId },
      });
      expect(res.status).toBe(404);
    });
  });
});
