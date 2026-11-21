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
 * Registration-card OCR — brief §5 (vehicles).
 *
 * The value of this surface is its honesty, so the suite tests it directly:
 *
 *  - with no provider key an extraction reports `configured:false` and suggests
 *    nothing (it never returns a canned answer);
 *  - with a deterministic provider configured it suggests real, validated
 *    fields for an operator to review;
 *  - the extraction persists no document — only the operator's save does;
 *  - the write boundary holds (a read-only principal is refused);
 *  - a tenant cannot extract against another tenant's vehicle.
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
  const boundary = '----oryxOcrBoundary' + Math.random().toString(36).slice(2);
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

describe('Registration-card OCR (e2e)', () => {
  let ctx: TestContext;
  let token = '';
  let superToken = '';
  let readerToken = '';
  let otherToken = '';
  let tenantId = '';
  let otherTenantId = '';
  let vehicleId = '';
  const code = `${FIXTURE_PREFIX}-OCRCARD`;
  const otherCode = `${FIXTURE_PREFIX}-OCRCARD2`;

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
        nameAr: 'شركة التعرف الضوئي',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    return created.body.company.id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);
    // The suite stores platform-scoped credentials; start clean so a previous
    // interrupted run cannot make a state assertion pass by accident.
    await ctx.prisma.integrationProvider.deleteMany({});

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    tenantId = await provision(code, 'OCR Cards');
    otherTenantId = await provision(otherCode, 'OCR Cards Other');

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const otherRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: otherTenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: otherTenantId, roleId: otherRole.id, isActive: true } });
    otherToken = token;

    // A principal with read-only vehicle access, to prove the write boundary.
    const readerEmail = `${FIXTURE_PREFIX.toLowerCase()}-ocr-reader@oryx.local`;
    const readerHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const readerUser = await ctx.prisma.user.create({
      data: { email: readerEmail, passwordHash: readerHash, fullNameEn: 'OCR Reader', fullNameAr: 'قارئ', status: 'ACTIVE' },
    });
    const readerRole = await ctx.prisma.role.create({
      data: { companyId: tenantId, code: `${FIXTURE_PREFIX}_OCR_READER`, nameEn: 'Reader', nameAr: 'قارئ' },
    });
    await ctx.prisma.rolePermission.create({ data: { roleId: readerRole.id, permissionCode: 'erp.vehicle.read' } });
    await ctx.prisma.membership.create({ data: { userId: readerUser.id, companyId: tenantId, roleId: readerRole.id, isActive: true } });
    readerToken = await login(ctx.base, readerEmail, 'FixturePass!2026');

    const customer = await erp<{ id: string }>('/sales/customers', {
      method: 'POST',
      body: { code: 'OCR-C1', nameEn: 'OCR Customer', nameAr: 'عميل', creditLimitMinor: 100000000 },
    });
    const vehicle = await erp<{ id: string }>('/automotive/vehicles', {
      method: 'POST',
      body: { customerId: customer.body.id, vin: 'JTDBR32E720129922', make: 'Toyota', model: 'Hilux', modelYear: 2022 },
    });
    expect(vehicle.status).toBe(201);
    vehicleId = vehicle.body.id;
  }, 180_000);

  afterAll(async () => {
    await ctx.prisma.integrationProvider.deleteMany({});
    await ctx.prisma.cmsMediaAsset.deleteMany({ where: { originalName: { startsWith: 'oryx-ocr' } } });
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  const postScan = async (buf: Buffer, category = 'registration', bearer = token, tenant = tenantId) => {
    const mp = multipart({ category }, { name: 'oryx-ocr-card.png', data: buf, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/automotive/vehicles/${vehicleId}/documents/ocr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': mp.contentType, 'x-oryx-company-id': tenant },
      body: new Uint8Array(mp.body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it('reports itself unconfigured and suggests nothing when no provider key is stored', async () => {
    const res = await postScan(await makePng());
    expect(res.status).toBe(201);
    expect(res.body.configured).toBe(false);
    expect(res.body.fields).toEqual([]);
    // The honesty rule: an unconfigured provider never invents an answer.
    expect(JSON.stringify(res.body)).not.toContain('REG-DET');
  });

  it('suggests real fields once a deterministic provider is configured', async () => {
    // Store the OCR credentials exactly as an operator would, through the
    // integrations centre. `test://` selects the deterministic adapter, which
    // is a real code path returning a validated result.
    const saved = await call(ctx.base, '/integrations/REGISTRATION_OCR/credentials', {
      method: 'PUT',
      token: superToken,
      body: {
        credentials: [
          { key: 'OCR_API_KEY', value: 'test-key' },
          { key: 'OCR_BASE_URL', value: 'test://deterministic' },
        ],
      },
    });
    expect(saved.status).toBe(200);

    const res = await postScan(await makePng());
    expect(res.status).toBe(201);
    expect(res.body.configured).toBe(true);
    const fields = res.body.fields as Array<{ key: string; value: string; confidence: number | null }>;
    expect(fields.map((f) => f.key).sort()).toEqual(['expiresAt', 'number', 'plateNumber']);
    expect(fields.find((f) => f.key === 'number')?.value).toBe('REG-DET-0001');
    expect(fields.find((f) => f.key === 'expiresAt')?.value).toBe('2027-12-31');
  });

  it('persists no document — extraction is a suggestion, not a write', async () => {
    const before = await ctx.prisma.vehicleDocument.count({ where: { vehicleId } });
    const res = await postScan(await makePng());
    expect(res.status).toBe(201);
    const after = await ctx.prisma.vehicleDocument.count({ where: { vehicleId } });
    expect(after).toBe(before);
  });

  it('rejects a non-image upload', async () => {
    const mp = multipart({ category: 'registration' }, { name: 'oryx-ocr-bad.txt', data: Buffer.from('not an image'), type: 'text/plain' });
    const res = await fetch(`${ctx.base}/api/v1/automotive/vehicles/${vehicleId}/documents/ocr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mp.contentType, 'x-oryx-company-id': tenantId },
      body: new Uint8Array(mp.body),
    });
    expect(res.status).toBe(400);
  });

  it('refuses extraction from a read-only principal', async () => {
    const res = await postScan(await makePng(), 'registration', readerToken, tenantId);
    expect(res.status).toBe(403);
  });

  it('does not let another tenant extract against this vehicle', async () => {
    const res = await postScan(await makePng(), 'registration', otherToken, otherTenantId);
    expect([403, 404]).toContain(res.status);
  });

  it('verifies the OCR provider through the integrations centre with a real call', async () => {
    const res = await call<{ provider: { verificationStatus: string }; checks: Array<{ status: string; message: string }> }>(
      ctx.base,
      '/integrations/REGISTRATION_OCR/verify',
      { method: 'POST', token: superToken },
    );
    expect(res.status).toBe(201);
    expect(res.body.provider.verificationStatus).toBe('VERIFIED');
    expect(res.body.checks[0].message).toMatch(/extraction succeeded/i);
  });

  it('reports an unconfigured provider as awaiting credentials, never operational', async () => {
    await ctx.prisma.integrationProvider.deleteMany({});
    const res = await call<{ providers: Array<{ key: string; state: string; missingCredentials: string[] }> }>(
      ctx.base,
      '/integrations',
      { token: superToken },
    );
    const ocr = res.body.providers.find((p) => p.key === 'REGISTRATION_OCR');
    expect(ocr?.state).toBe('AWAITING_CREDENTIALS');
    expect(ocr?.state).not.toBe('OPERATIONAL');
    expect(ocr?.missingCredentials).toContain('OCR_API_KEY');
  });
});
