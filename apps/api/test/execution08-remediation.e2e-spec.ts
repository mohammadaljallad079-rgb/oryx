import {
  FIXTURE_PREFIX,
  SEED_COMPANY_ADMIN,
  SEED_ORYX_AUTO_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  cleanupFixtures,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Execution 08 remediation — the parity and completeness fixes.
 *
 * Every assertion here exercises a real HTTP route against the seeded database
 * and reads the value back, so a regression that only changes the UI or the
 * mapper is caught rather than passing on a stale DTO shape.
 *
 *  - employee documents: upload, list, confidential gating, download, delete;
 *  - employee profile: secondary phone and employment end date persist;
 *  - leave requests: a bare `YYYY-MM-DD` from a native date input is accepted,
 *    edited and decided without an ISO 8601 rejection;
 *  - chart of accounts: type/parent editing with cycle and posting guards;
 *  - branch parity: the create and edit forms carry the same fields.
 */

interface EmployeeDocumentRow {
  id: string;
  category: string;
  title: string;
  fileRef: string | null;
  isConfidential: boolean;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  hasFile: boolean;
}

interface AccountRow {
  id: string;
  code: string;
  nameEn: string;
  type: string;
  normalBalance: string;
  parentId: string | null;
  level: number;
}

interface BranchRow {
  id: string;
  code: string;
  city: string | null;
  addressLine: string | null;
  phone: string | null;
  countryCode: string | null;
  timezone: string;
}

// A real 96x96 PNG. The media store sniffs the type, decodes with sharp and
// refuses anything smaller than 64x64, so the fixture has to be a genuine image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAjklEQVR42u3QMQ0AAAgDsMlBExJRiQNOriZV0FQPhygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkCBBggQJQpAgQYIECRIkCEGCBAkSJEiQIEEIEiRIkCBBggQhSJCgPwsdszJ3/f5IEgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Execution 08 remediation (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let tenantId: string;
  let employeeId: string;
  let leaveTypeId: string;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  /** Multipart upload, which the JSON `call` helper cannot express. */
  async function uploadDocument(
    id: string,
    fields: Record<string, string>,
    file?: { name: string; type: string; bytes: Buffer },
  ): Promise<{ status: number; body: unknown }> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (file) form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    const res = await fetch(`${ctx.base}/api/v1/hr/employees/${id}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      body: form,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: `${FIXTURE_PREFIX}-E08`,
        nameEn: 'E08 Fixture Co.',
        nameAr: 'شركة اختبار التنفيذ الثامن',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });

    // HR needs a department to hang an employee on.
    const dept = await erp<{ id: string }>('/hr/departments', {
      method: 'POST',
      body: { code: 'OPS', nameEn: 'Operations', nameAr: 'العمليات' },
    });
    const employee = await erp<{ id: string }>('/hr/employees', {
      method: 'POST',
      body: {
        code: 'EMP-1001',
        fullNameEn: 'Sara Al Mannai',
        fullNameAr: 'سارة المناعي',
        phone: '39000000',
        departmentId: dept.body.id,
        hireDate: '2026-01-15',
      },
    });
    employeeId = employee.body.id;

    // `annualEntitlementDays` is hundredths of a day: 3000 = 30 days.
    const leaveType = await erp<{ id: string }>('/hr/leave-types', {
      method: 'POST',
      body: { code: 'ANNUAL', nameEn: 'Annual leave', nameAr: 'إجازة سنوية', annualEntitlementDays: 3000 },
    });
    leaveTypeId = leaveType.body.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('employee profile parity', () => {
    it('persists the secondary phone and the employment end date', async () => {
      const res = await erp<{ secondaryPhone: string | null; terminationDate: string | null; status: string }>(
        `/hr/employees/${employeeId}`,
        {
          method: 'PATCH',
          body: { secondaryPhone: '39111111', terminationDate: '2026-12-31', status: 'TERMINATED' },
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.secondaryPhone).toBe('39111111');
      expect(res.body.terminationDate).toBe('2026-12-31T00:00:00.000Z');
      expect(res.body.status).toBe('TERMINATED');

      // Re-read so the assertion is on stored state, not the response echo.
      const read = await erp<{ secondaryPhone: string | null; terminationDate: string | null }>(
        `/hr/employees/${employeeId}`,
      );
      expect(read.body.secondaryPhone).toBe('39111111');
      expect(read.body.terminationDate).toBe('2026-12-31T00:00:00.000Z');
    });
  });

  describe('employee documents', () => {
    let documentId: string;

    it('stores a document with an uploaded file and lists it back with file metadata', async () => {
      const up = await uploadDocument(
        employeeId,
        { category: 'IDENTITY', title: 'Passport copy' },
        { name: 'passport.png', type: 'image/png', bytes: PNG },
      );
      expect(up.status).toBe(201);
      documentId = (up.body as { id: string }).id;

      const list = await erp<{ items: EmployeeDocumentRow[] }>(`/hr/employees/${employeeId}/documents`);
      expect(list.status).toBe(200);
      const row = list.body.items.find((d) => d.id === documentId);
      expect(row).toBeDefined();
      expect(row!.title).toBe('Passport copy');
      expect(row!.hasFile).toBe(true);
      expect(row!.fileName).toBe('passport.png');
      expect(row!.mimeType).toBe('image/png');
      expect(row!.sizeBytes).toBe(PNG.length);
    });

    it('records a document with no file (a physical certificate)', async () => {
      const up = await uploadDocument(employeeId, {
        category: 'CERTIFICATE',
        title: 'Degree certificate',
        fileRef: 'HR-CABINET-A/12',
      });
      expect(up.status).toBe(201);

      const list = await erp<{ items: EmployeeDocumentRow[] }>(`/hr/employees/${employeeId}/documents`);
      const row = list.body.items.find((d) => d.title === 'Degree certificate');
      expect(row).toBeDefined();
      expect(row!.hasFile).toBe(false);
      expect(row!.fileRef).toBe('HR-CABINET-A/12');
    });

    it('streams the stored bytes back for preview and download', async () => {
      const res = await fetch(`${ctx.base}/api/v1/hr/employees/${employeeId}/documents/${documentId}/file`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('content-disposition')).toContain('passport.png');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.equals(PNG)).toBe(true);
    });

    it('hides a confidential document from a principal without the confidential permission', async () => {
      const up = await uploadDocument(
        employeeId,
        { category: 'MEDICAL', title: 'Medical report', isConfidential: 'true' },
        { name: 'medical.png', type: 'image/png', bytes: PNG },
      );
      expect(up.status).toBe(201);
      const confidentialId = (up.body as { id: string }).id;

      // The company admin holds the delegable confidential permission, so it
      // sees the row.
      const adminList = await erp<{ items: EmployeeDocumentRow[] }>(`/hr/employees/${employeeId}/documents`);
      expect(adminList.body.items.map((d) => d.id)).toContain(confidentialId);

      // A peer principal that holds document.read but not the confidential
      // permission must not see it, nor read its file by id.
      const limitedEmail = `${FIXTURE_PREFIX.toLowerCase()}-e08-limited@oryx.local`;
      const limitedRole = await ctx.prisma.role.create({
        data: {
          companyId: tenantId,
          code: 'doc_reader',
          nameEn: 'Document reader',
          nameAr: 'قارئ المستندات',
          permissions: {
            create: [{ permissionCode: 'erp.hr.document.read' }],
          },
        },
      });
      const argon2 = await import('argon2');
      const limited = await ctx.prisma.user.create({
        data: {
          email: limitedEmail,
          passwordHash: await argon2.hash('FixturePass!2026', { type: argon2.argon2id }),
          fullNameEn: 'Limited Reader',
          fullNameAr: 'قارئ محدود',
          status: 'ACTIVE',
        },
      });
      await ctx.prisma.membership.create({
        data: { userId: limited.id, companyId: tenantId, roleId: limitedRole.id, isActive: true },
      });
      const limitedToken = await login(ctx.base, limitedEmail, 'FixturePass!2026');

      const denied = await companyCall<{ items: EmployeeDocumentRow[] }>(
        ctx.base,
        tenantId,
        `/hr/employees/${employeeId}/documents`,
        { token: limitedToken },
      );
      expect(denied.status).toBe(200);
      expect(denied.body.items.map((d) => d.id)).not.toContain(confidentialId);

      const file = await fetch(
        `${ctx.base}/api/v1/hr/employees/${employeeId}/documents/${confidentialId}/file`,
        { headers: { Authorization: `Bearer ${limitedToken}`, 'x-oryx-company-id': tenantId } },
      );
      expect(file.status).toBe(403);
    });

    it('removes a document and its stored file', async () => {
      const up = await uploadDocument(
        employeeId,
        { category: 'OTHER', title: 'Temporary note' },
        { name: 'note.png', type: 'image/png', bytes: PNG },
      );
      const tempId = (up.body as { id: string }).id;

      const del = await erp<{ deleted: boolean }>(`/hr/employees/${employeeId}/documents/${tempId}`, {
        method: 'DELETE',
      });
      expect(del.status).toBe(200);
      expect(del.body.deleted).toBe(true);

      const list = await erp<{ items: EmployeeDocumentRow[] }>(`/hr/employees/${employeeId}/documents`);
      expect(list.body.items.map((d) => d.id)).not.toContain(tempId);
    });
  });

  describe('leave requests accept a bare calendar date', () => {
    let requestId: string;

    it('creates a request from YYYY-MM-DD values without an ISO 8601 rejection', async () => {
      const res = await erp<{ id: string; startDate: string; endDate: string; status: string }>('/hr/leave-requests', {
        method: 'POST',
        body: { employeeId, leaveTypeId, startDate: '2026-03-02', endDate: '2026-03-04', reason: 'Family trip' },
      });
      expect(res.status).toBe(201);
      requestId = res.body.id;
      expect(res.body.startDate).toBe('2026-03-02T00:00:00.000Z');
      expect(res.body.endDate).toBe('2026-03-04T00:00:00.000Z');
      expect(res.body.status).toBe('SUBMITTED');
    });

    it('edits a submitted request with bare dates', async () => {
      const res = await erp<{ startDate: string; endDate: string }>(`/hr/leave-requests/${requestId}`, {
        method: 'PATCH',
        body: { startDate: '2026-03-03', endDate: '2026-03-05' },
      });
      expect(res.status).toBe(200);
      expect(res.body.startDate).toBe('2026-03-03T00:00:00.000Z');
      expect(res.body.endDate).toBe('2026-03-05T00:00:00.000Z');
    });

    it('approves the edited request', async () => {
      const res = await erp<{ status: string }>(`/hr/leave-requests/${requestId}/decide`, {
        method: 'POST',
        body: { decision: 'APPROVED' },
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('APPROVED');
    });

    it('rejects an end date before the start date', async () => {
      const res = await erp('/hr/leave-requests', {
        method: 'POST',
        body: { employeeId, leaveTypeId, startDate: '2026-04-10', endDate: '2026-04-01' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('chart of accounts editing', () => {
    let parentId: string;
    let childId: string;

    beforeAll(async () => {
      const seed = await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
      expect([200, 201]).toContain(seed.status);
      const parent = await erp<AccountRow>('/accounting/accounts', {
        method: 'POST',
        body: { code: '1900', nameEn: 'Suspense', nameAr: 'حساب معلق', type: 'ASSET', normalBalance: 'DEBIT' },
      });
      parentId = parent.body.id;
      const child = await erp<AccountRow>('/accounting/accounts', {
        method: 'POST',
        body: {
          code: '1901',
          nameEn: 'Suspense detail',
          nameAr: 'تفصيل الحساب المعلق',
          type: 'ASSET',
          normalBalance: 'DEBIT',
          parentId,
        },
      });
      childId = child.body.id;
      expect(child.body.level).toBe(2);
      expect(child.body.parentId).toBe(parentId);
    });

    it('reclassifies an unused account and its normal balance', async () => {
      const res = await erp<AccountRow>(`/accounting/accounts/${childId}`, {
        method: 'PATCH',
        body: { nameEn: 'Suspense detail (renamed)', type: 'EXPENSE', normalBalance: 'DEBIT' },
      });
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('EXPENSE');
      expect(res.body.nameEn).toBe('Suspense detail (renamed)');
    });

    it('refuses to move an account under one of its own descendants', async () => {
      // Re-parent the parent under its child: a cycle the tree walk could never
      // terminate on, so it must be rejected.
      const res = await erp(`/accounting/accounts/${parentId}`, {
        method: 'PATCH',
        body: { parentId: childId },
      });
      expect(res.status).toBe(400);
    });

    it('refuses to change the type of an account that already has children', async () => {
      const res = await erp(`/accounting/accounts/${parentId}`, {
        method: 'PATCH',
        body: { type: 'LIABILITY' },
      });
      expect(res.status).toBe(409);
    });
  });

  describe('branch create/edit parity', () => {
    let branchId: string;

    it('creates a branch with every field the edit form carries', async () => {
      const res = await companyCall<BranchRow>(ctx.base, tenantId, `/companies/${tenantId}/branches`, {
        method: 'POST',
        token,
        body: {
          code: `${FIXTURE_PREFIX}-BR1`,
          nameEn: 'Seef Branch',
          nameAr: 'فرع السيف',
          city: 'Manama',
          countryCode: 'BH',
          addressLine: 'Bldg 100, Road 20, Block 305',
          phone: '17000000',
          timezone: 'Asia/Bahrain',
        },
      });
      expect(res.status).toBe(201);
      branchId = res.body.id;
      expect(res.body.city).toBe('Manama');
      expect(res.body.addressLine).toBe('Bldg 100, Road 20, Block 305');
      expect(res.body.countryCode).toBe('BH');
      expect(res.body.timezone).toBe('Asia/Bahrain');
    });

    it('edits every parity field and persists it', async () => {
      const res = await companyCall<BranchRow>(ctx.base, tenantId, `/branches/${branchId}`, {
        method: 'PATCH',
        token,
        body: {
          city: 'Riffa',
          countryCode: 'BH',
          addressLine: 'Bldg 200, Road 30, Block 400',
          phone: '17111111',
          timezone: 'Asia/Bahrain',
        },
      });
      expect(res.status).toBe(200);
      expect(res.body.city).toBe('Riffa');
      expect(res.body.addressLine).toBe('Bldg 200, Road 30, Block 400');
      expect(res.body.phone).toBe('17111111');

      const list = await companyCall<{ items: BranchRow[] }>(ctx.base, tenantId, `/companies/${tenantId}/branches`, {
        token,
      });
      const row = list.body.items.find((b) => b.id === branchId);
      expect(row!.city).toBe('Riffa');
      expect(row!.timezone).toBe('Asia/Bahrain');
    });
  });

  describe('inspection service VAT breakdown and picture', () => {
    let serviceId: string;
    let adminToken: string;
    let autoCompanyId: string;

    beforeAll(async () => {
      adminToken = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
      const auto = await ctx.prisma.company.findFirstOrThrow({ where: { code: 'ORYX-AUTO' } });
      autoCompanyId = auto.id;
      // The seeded company is shared with other suites, so a service this suite
      // created on a previous (failed) run is removed before it starts.
      await ctx.prisma.inspectionService.deleteMany({
        where: { companyId: autoCompanyId, code: { in: ['E08-VAT-INSP', 'VAT-INSP'] } },
      });
    });

    afterAll(async () => {
      await ctx.prisma.inspectionService.deleteMany({
        where: { companyId: autoCompanyId, code: { in: ['E08-VAT-INSP', 'VAT-INSP'] } },
      });
    });

    const autoErp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
      companyCall<T>(ctx.base, autoCompanyId, path, { ...options, token: adminToken });

    it('creates a service with a price and VAT rate and returns the full breakdown', async () => {
      const res = await autoErp<{
        id: string;
        priceMinor: number;
        taxPercentBp: number;
        imageUrl: string | null;
      }>('/automotive/inspection-services', {
        method: 'POST',
        body: {
          code: 'E08-VAT-INSP',
          nameEn: 'Full inspection',
          nameAr: 'فحص شامل',
          priceMinor: 5000,
          taxPercentBp: 1000,
        },
      });
      expect(res.status).toBe(201);
      serviceId = res.body.id;
      expect(res.body.priceMinor).toBe(5000);
      expect(res.body.taxPercentBp).toBe(1000);
      expect(res.body.imageUrl).toBeNull();
    });

    it('edits the price and VAT rate', async () => {
      const res = await autoErp<{ priceMinor: number; taxPercentBp: number }>(
        `/automotive/inspection-services/${serviceId}`,
        { method: 'PATCH', body: { priceMinor: 7500, taxPercentBp: 1000 } },
      );
      expect(res.status).toBe(200);
      expect(res.body.priceMinor).toBe(7500);
      expect(res.body.taxPercentBp).toBe(1000);
    });

    it('uploads a service picture and exposes it as an image URL', async () => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'service.png');
      const res = await fetch(`${ctx.base}/api/v1/automotive/inspection-services/${serviceId}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'x-oryx-company-id': autoCompanyId },
        body: form,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { imageUrl: string | null };
      expect(body.imageUrl).toBeTruthy();

      const list = await autoErp<{ items: Array<{ id: string; imageUrl: string | null }> }>(
        '/automotive/inspection-services',
      );
      const row = list.body.items.find((s) => s.id === serviceId);
      expect(row!.imageUrl).toBe(body.imageUrl);
    });
  });
});
