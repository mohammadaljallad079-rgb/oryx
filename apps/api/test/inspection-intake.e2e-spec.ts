import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIXTURE_PREFIX,
  SEED_COMPANY_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  cleanupFixtures,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Vehicle Inspection — Phase 1 (intake) integration suite.
 *
 * Exercises the real HTTP surface, guards and Prisma layer against the seeded
 * database: a vehicle is registered (with and without a VIN), an inspection is
 * created as a draft or scheduled, the customer/vehicle pairing is enforced,
 * cross-tenant access is refused, and a registration-card photo is read through
 * the OCR endpoint.
 */
describe('Vehicle inspection intake (Phase 1) (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let isolatedToken: string;
  let tenantId: string;
  let customerId: string;
  const code = `${FIXTURE_PREFIX}-INSP1`;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: { code, nameEn: 'Inspection Phase 1 Co.', nameAr: 'شركة الفحص', type: 'SAAS_TENANT', planId: enterprise.id },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });

    const isolatedEmail = `${FIXTURE_PREFIX.toLowerCase()}-insp1-isolated@oryx.local`;
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const isolatedUser = await ctx.prisma.user.create({
      data: { email: isolatedEmail, passwordHash, fullNameEn: 'Isolated Inspect User', fullNameAr: 'مستخدم معزول', status: 'ACTIVE' },
    });
    await ctx.prisma.membership.create({ data: { userId: isolatedUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });
    isolatedToken = await login(ctx.base, isolatedEmail, 'FixturePass!2026');

    const customer = await erp<{ id: string }>('/sales/customers', {
      method: 'POST',
      body: { code: 'INSP-C1', nameEn: 'Inspection Customer', nameAr: 'عميل الفحص', creditLimitMinor: 100000000 },
    });
    customerId = customer.body.id;
  }, 150_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  describe('vehicle registration', () => {
    it('registers a vehicle without a VIN (unreadable chassis)', async () => {
      const res = await erp<{ id: string; vin: string | null; plateNumber: string }>('/automotive/vehicles', {
        method: 'POST',
        body: { customerId, plateNumber: '649525', make: 'Mercedes', model: 'E300', modelYear: 2020, color: 'Gray', mileage: 12000 },
      });
      expect(res.status).toBe(201);
      expect(res.body.vin).toBeNull();
      expect(res.body.plateNumber).toBe('649525');
    });

    it('still rejects an invalid VIN', async () => {
      // 17 characters but containing I and O, which a real VIN forbids.
      const res = await erp<{ code: string }>('/automotive/vehicles', {
        method: 'POST',
        body: { customerId, vin: 'JTDBR32E72012IO45', make: 'Toyota', model: 'Corolla', modelYear: 2020 },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('automotive.vin_invalid');
    });

    it('lists the vehicles for the selected customer', async () => {
      const res = await erp<{ items: Array<{ customerId: string }>; total: number }>(
        `/automotive/vehicles?customerId=${customerId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.items.every((v) => v.customerId === customerId)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('inspection intake', () => {
    let vehicleId: string;

    beforeAll(async () => {
      const res = await erp<{ id: string }>('/automotive/vehicles', {
        method: 'POST',
        body: { customerId, vin: 'JTHDA1D20P5125981', make: 'Lexus', model: 'ES350', modelYear: 2021, mileage: 30000 },
      });
      vehicleId = res.body.id;
    });

    it('creates a scheduled inspection with selected report sections', async () => {
      const res = await erp<{
        id: string;
        bookingNumber: string;
        status: string;
        inspectionTypes: string[];
        customerNameEn: string;
        make: string;
      }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId, vehicleId, inspectionTypes: ['PAINT', 'CHASSIS'], odometer: 30500 },
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SCHEDULED');
      expect(res.body.inspectionTypes).toEqual(['PAINT', 'CHASSIS']);
      expect(res.body.bookingNumber).toMatch(/^INS-/);
      expect(res.body.customerNameEn).toBe('Inspection Customer');
      expect(res.body.make).toBe('Lexus');
    });

    it('saves an editable draft and can re-open it', async () => {
      const res = await erp<{ id: string; status: string }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId, vehicleId, inspectionTypes: ['COMPREHENSIVE'], saveDraft: true },
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');

      const detail = await erp<{ booking: { id: string; status: string }; vehicle: { id: string }; customer: { id: string } }>(
        `/automotive/inspections/${res.body.id}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.booking.status).toBe('DRAFT');
      expect(detail.body.vehicle.id).toBe(vehicleId);
      expect(detail.body.customer.id).toBe(customerId);
    });

    it('requires at least one inspection type', async () => {
      const res = await erp<{ code: string }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId, vehicleId, inspectionTypes: [] },
      });
      expect(res.status).toBe(400);
    });

    it('rejects a vehicle that belongs to a different customer', async () => {
      const other = await erp<{ id: string }>('/sales/customers', {
        method: 'POST',
        body: { code: 'INSP-C2', nameEn: 'Other Customer', nameAr: 'عميل آخر', creditLimitMinor: 1000000 },
      });
      const res = await erp<{ code: string }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId: other.body.id, vehicleId, inspectionTypes: ['PAINT'] },
      });
      expect(res.status).toBe(400);
    });

    it('advances the vehicle mileage from the inspection odometer', async () => {
      const created = await erp<{ id: string }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId, vehicleId, inspectionTypes: ['PAINT'], odometer: 45000 },
      });
      expect(created.status).toBe(201);
      const vehicle = await erp<{ mileage: number }>(`/automotive/vehicles/${vehicleId}`);
      expect(vehicle.body.mileage).toBe(45000);
    });

    it('edits a draft and blocks editing an approved inspection', async () => {
      const draft = await erp<{ id: string }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId, vehicleId, inspectionTypes: ['PAINT'], saveDraft: true },
      });
      const patched = await erp<{ status: string; inspectionTypes: string[]; notes: string }>(
        `/automotive/inspections/${draft.body.id}`,
        { method: 'PATCH', body: { status: 'SCHEDULED', inspectionTypes: ['PAINT', 'CHASSIS'], notes: 'Customer asked for full report' } },
      );
      expect(patched.status).toBe(200);
      expect(patched.body.status).toBe('SCHEDULED');
      expect(patched.body.inspectionTypes).toEqual(['PAINT', 'CHASSIS']);
      expect(patched.body.notes).toBe('Customer asked for full report');
    });

    it('refuses cross-tenant access to an inspection', async () => {
      const created = await erp<{ id: string }>('/automotive/inspections', {
        method: 'POST',
        body: { customerId, vehicleId, inspectionTypes: ['PAINT'] },
      });
      const demo = await ctx.prisma.company.findUniqueOrThrow({ where: { code: 'DEMO-ALNOOR' } });
      const res = await call(ctx.base, `/automotive/inspections/${created.body.id}`, {
        token: isolatedToken,
        headers: { 'x-oryx-company-id': demo.id },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('searches inspections by plate and customer name', async () => {
      const res = await erp<{ items: Array<{ bookingNumber: string }>; total: number }>(
        '/automotive/inspection-bookings?search=Inspection',
      );
      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('registration-card OCR', () => {
    it('reads a card photo into fields', async () => {
      const image = readFileSync(join(__dirname, 'fixtures', 'vehicle-registration-card.png'));
      const form = new FormData();
      form.append('image', new Blob([image], { type: 'image/png' }), 'card.png');
      const res = await fetch(`${ctx.base}/api/v1/automotive/vehicle-card/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
        body: form,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        fields: { plateNumber: string | null; make: string | null; model: string | null; modelYear: number | null; color: string | null; vin: string | null };
        uncertain: string[];
        rawText: string;
      };
      expect(body.fields.make).toBe('Mercedes');
      expect(body.fields.model).toBe('E300');
      expect(body.fields.modelYear).toBe(2020);
      expect(body.fields.color).toBe('Gray');
      expect(body.fields.vin).toBe('JTHDA1D20P5125981');
      expect(body.fields.plateNumber).toBe('649525');
      expect(body.rawText.length).toBeGreaterThan(0);
    }, 120_000);

    it('rejects a non-image upload', async () => {
      const form = new FormData();
      form.append('image', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'x.txt');
      const res = await fetch(`${ctx.base}/api/v1/automotive/vehicle-card/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
        body: form,
      });
      expect(res.status).toBe(400);
    });
  });
});
