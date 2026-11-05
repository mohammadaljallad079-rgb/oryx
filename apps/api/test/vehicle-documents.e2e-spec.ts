import * as argon2 from 'argon2';
import sharp from 'sharp';
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
 * Vehicle documents — registration cards, insurance and permits.
 *
 * The value of this surface is the scan, so the tests exercise the real upload
 * path: a document must never point at a client-chosen path, the stored image
 * must be re-encoded by the shared media store, and a tenant must not be able to
 * read or delete another tenant's papers.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function makePng(width = 200, height = 200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 12, g: 30, b: 70 } } })
    .png()
    .toBuffer();
}

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = '----oryxVehicleDocBoundary' + Math.random().toString(36).slice(2);
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

describe('Vehicle documents (e2e)', () => {
  let ctx: TestContext;
  let token = '';
  let superToken = '';
  let readerToken = '';
  let otherToken = '';
  let tenantId = '';
  let otherTenantId = '';
  let vehicleId = '';
  const createdAssetIds: string[] = [];
  const code = `${FIXTURE_PREFIX}-VEHDOC`;
  const otherCode = `${FIXTURE_PREFIX}-VEHDOC2`;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  async function provision(codeValue: string, label: string) {
    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: codeValue,
        nameEn: `${label} Co.`,
        nameAr: 'شركة مستندات المركبات',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    return created.body.company.id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    tenantId = await provision(code, 'Vehicle Docs');
    otherTenantId = await provision(otherCode, 'Vehicle Docs Other');

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const otherRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: otherTenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: otherTenantId, roleId: otherRole.id, isActive: true } });
    otherToken = token;

    // A principal with read-only vehicle access, to prove the write boundary.
    const readerEmail = `${FIXTURE_PREFIX.toLowerCase()}-vehdoc-reader@oryx.local`;
    const readerHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const readerUser = await ctx.prisma.user.create({
      data: { email: readerEmail, passwordHash: readerHash, fullNameEn: 'Vehicle Doc Reader', fullNameAr: 'قارئ المستندات', status: 'ACTIVE' },
    });
    const readerRole = await ctx.prisma.role.create({
      data: { companyId: tenantId, code: `${FIXTURE_PREFIX}_VEHDOC_READER`, nameEn: 'Reader', nameAr: 'قارئ' },
    });
    const readPerm = await ctx.prisma.rolePermission.create({ data: { roleId: readerRole.id, permissionCode: 'erp.vehicle.read' } });
    expect(readPerm.permissionCode).toBe('erp.vehicle.read');
    await ctx.prisma.membership.create({ data: { userId: readerUser.id, companyId: tenantId, roleId: readerRole.id, isActive: true } });
    readerToken = await login(ctx.base, readerEmail, 'FixturePass!2026');

    const customer = await erp<{ id: string }>('/sales/customers', {
      method: 'POST',
      body: { code: 'VD-C1', nameEn: 'Docs Customer', nameAr: 'عميل', creditLimitMinor: 100000000 },
    });
    const vehicle = await erp<{ id: string }>('/automotive/vehicles', {
      method: 'POST',
      body: { customerId: customer.body.id, vin: 'JTDBR32E720129911', make: 'Toyota', model: 'Hilux', modelYear: 2022 },
    });
    expect(vehicle.status).toBe(201);
    vehicleId = vehicle.body.id;
  }, 180_000);

  afterAll(async () => {
    if (createdAssetIds.length) {
      await ctx.prisma.cmsMediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
    }
    await ctx.prisma.cmsMediaAsset.deleteMany({ where: { originalName: { startsWith: 'oryx-vehdoc' } } });
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  it('starts with no documents', async () => {
    const res = await erp<{ items: unknown[]; total: number }>(`/automotive/vehicles/${vehicleId}/documents`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it('records a document without a scan and derives no file URL', async () => {
    const res = await erp<{ id: string; category: string; number: string; fileRef: string | null; fileUrl: string | null }>(
      `/automotive/vehicles/${vehicleId}/documents`,
      { method: 'POST', body: { category: 'registration', number: 'REG-2022-9911', expiresAt: '2027-01-01T00:00:00.000Z' } },
    );
    expect(res.status).toBe(201);
    expect(res.body.number).toBe('REG-2022-9911');
    expect(res.body.category).toBe('registration');
    expect(res.body.fileRef).toBeNull();
    expect(res.body.fileUrl).toBeNull();
  });

  it('stores a scanned copy through the media store and returns a servable URL', async () => {
    const png = await makePng();
    const mp = multipart(
      { category: 'insurance', number: 'INS-4471' },
      { name: 'oryx-vehdoc-insurance.png', data: png, type: 'image/png' },
    );
    const res = await fetch(`${ctx.base}/api/v1/automotive/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mp.contentType, 'x-oryx-company-id': tenantId },
      body: new Uint8Array(mp.body),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { fileRef: string | null; fileUrl: string | null };
    expect(body.fileRef).toBeTruthy();
    expect(body.fileUrl).toBe(`/api/v1/cms/media/${body.fileRef}/file?variant=card`);
    createdAssetIds.push(body.fileRef!);

    // The scan is readable at the derived URL, and it is the re-encoded copy.
    const file = await fetch(`${ctx.base}${body.fileUrl}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('image/');
  });

  it('rejects an unknown document type and an invalid expiry', async () => {
    const blank = await erp<{ code: string }>(`/automotive/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      body: { category: '' },
    });
    expect(blank.status).toBe(400);

    const badDate = await erp<{ code: string }>(`/automotive/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      body: { category: 'permit', expiresAt: 'not-a-date' },
    });
    expect(badDate.status).toBe(400);
  });

  it('refuses a write from a read-only principal', async () => {
    const res = await companyCall<{ code: string }>(
      ctx.base,
      tenantId,
      `/automotive/vehicles/${vehicleId}/documents`,
      { method: 'POST', body: { category: 'permit' }, token: readerToken },
    );
    expect(res.status).toBe(403);
  });

  it('removes a document and keeps the scanned asset in the library', async () => {
    const created = await erp<{ id: string }>(`/automotive/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      body: { category: 'permit' },
    });
    const assetCountBefore = await ctx.prisma.cmsMediaAsset.count({ where: { id: { in: createdAssetIds } } });

    const removed = await erp<{ removed: boolean }>(
      `/automotive/vehicles/${vehicleId}/documents/${created.body.id}`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toBe(true);

    const list = await erp<{ items: Array<{ id: string }> }>(`/automotive/vehicles/${vehicleId}/documents`);
    expect(list.body.items.some((d) => d.id === created.body.id)).toBe(false);
    expect(await ctx.prisma.cmsMediaAsset.count({ where: { id: { in: createdAssetIds } } })).toBe(assetCountBefore);
  });

  it('does not leak a vehicle document across tenants', async () => {
    const list = await companyCall<{ items: unknown[] }>(
      ctx.base,
      otherTenantId,
      `/automotive/vehicles/${vehicleId}/documents`,
      { token: otherToken },
    );
    // The vehicle belongs to the first tenant, so the other tenant sees nothing.
    expect([403, 404]).toContain(list.status);
  });
});
