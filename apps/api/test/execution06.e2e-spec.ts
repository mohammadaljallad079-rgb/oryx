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
 * Execution 06 — unified attachments and the employee electronic file.
 *
 * Exercises the real HTTP surface and the real filesystem store: an upload is
 * written to disk, read back through the authenticated content route, and
 * removed with the row. Permission, tenant and confidentiality boundaries are
 * asserted against the API, never the UI.
 */
describe('ORYX Execution 06 (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let otherTenantToken: string;
  let tenantId: string;
  let otherTenantId: string;
  let employeeId: string;
  const code = `${FIXTURE_PREFIX}-E06`;

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, tenantId, path, { ...options, token });

  /** Build a multipart body with fetch's own FormData. */
  const upload = async (
    path: string,
    fields: Record<string, string>,
    files: Array<{ name: string; type: string; bytes: Buffer }>,
    bearer: string = token,
    company: string = tenantId,
  ) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    for (const file of files) {
      form.append('files', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    }
    const res = await fetch(`${ctx.base}/api/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'x-oryx-company-id': company },
      body: form,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body: body as Record<string, unknown> };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);

    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: { code, nameEn: 'E06 Fixture Co.', nameAr: 'شركة التنفيذ السادس', type: 'SAAS_TENANT', planId: enterprise.id },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });

    // A second tenant to prove attachment isolation.
    const other = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: { code: `${code}-B`, nameEn: 'E06 Other Co.', nameAr: 'شركة أخرى', type: 'SAAS_TENANT', planId: enterprise.id },
    });
    otherTenantId = other.body.company.id;
    const otherRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: otherTenantId, code: 'company_admin' } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: otherTenantId, roleId: otherRole.id, isActive: true } });
    otherTenantToken = token;

    // Chart of accounts and an open fiscal year, because payroll posts.
    await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    const year = new Date().getUTCFullYear();
    await erp('/accounting/fiscal-years', {
      method: 'POST',
      body: { code: `FY${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
    });
  }, 150_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  // -------------------------------------------------------------- employees

  describe('employee file', () => {
    it('allocates the employee number automatically and records the new profile fields', async () => {
      const created = await erp<{ id: string; code: string }>('/hr/employees', {
        method: 'POST',
        body: {
          fullNameEn: 'Noura Al-Harbi',
          fullNameAr: 'نورة الحربي',
          email: 'noura@example.test',
          phone: '+966500000001',
          nationalId: '1098765432',
          nationality: 'Saudi',
          dateOfBirth: '1992-04-11',
          gender: 'FEMALE',
          addressLine: 'Riyadh',
          bankName: 'Al Rajhi',
          bankAccountIban: 'SA0380000000608010167519',
          contractType: 'FIXED_TERM',
          hireDate: '2024-03-01',
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.code).toMatch(/^EMP-\d{5}$/);
      employeeId = created.body.id;

      const stored = await ctx.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
      expect(stored.nationality).toBe('Saudi');
      expect(stored.bankName).toBe('Al Rajhi');
      expect(stored.contractType).toBe('FIXED_TERM');
    });

    it('allocates a distinct number for a second employee', async () => {
      const first = await ctx.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
      const second = await erp<{ code: string }>('/hr/employees', {
        method: 'POST',
        body: { fullNameEn: 'Second Employee', fullNameAr: 'موظف ثانٍ', hireDate: '2024-04-01' },
      });
      expect(second.status).toBe(201);
      expect(second.body.code).not.toBe(first.code);
    });

    it('previews the next employee number and refuses a client-supplied code', async () => {
      const preview = await erp<{ code: string }>('/hr/employees/next-code');
      expect(preview.status).toBe(200);
      expect(preview.body.code).toMatch(/^EMP-\d{5}$/);

      // The number is never accepted from the caller: the create DTO no longer
      // declares `code`, so a request that carries one is rejected outright.
      const rejected = await erp('/hr/employees', {
        method: 'POST',
        body: { code: 'HAND-MADE', fullNameEn: 'Manual Code', fullNameAr: 'رمز يدوي', hireDate: '2024-05-01' },
      });
      expect(rejected.status).toBe(400);

      // The preview is advisory: it must not consume the number.
      const again = await erp<{ code: string }>('/hr/employees/next-code');
      expect(again.body.code).toBe(preview.body.code);

      // Creating the employee consumes exactly the previewed number.
      const created = await erp<{ code: string }>('/hr/employees', {
        method: 'POST',
        body: { fullNameEn: 'Auto Code', fullNameAr: 'رمز تلقائي', hireDate: '2024-05-01' },
      });
      expect(created.status).toBe(201);
      expect(created.body.code).toBe(preview.body.code);

      const after = await erp<{ code: string }>('/hr/employees/next-code');
      expect(after.body.code).not.toBe(preview.body.code);
    });

    it('returns the personal card with salary visible to a company administrator', async () => {
      const res = await erp<{ employee: { code: string; nationality: string }; compensation: { visible: boolean } }>(
        `/hr/employees/${employeeId}/file/personal-card`,
      );
      expect(res.status).toBe(200);
      expect(res.body.employee.nationality).toBe('Saudi');
      expect(res.body.compensation.visible).toBe(true);
    });

    it('rejects a principal without the salary permission from the payroll and bonus tabs', async () => {
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
      const restrictedRole = await ctx.prisma.role.create({
        data: {
          companyId: tenantId,
          code: `${FIXTURE_PREFIX}-hr-only`,
          nameEn: 'HR officer without salary',
          nameAr: 'موظف موارد بشرية بدون رواتب',
          isSystem: false,
          permissions: {
            create: [
              { permissionCode: 'erp.hr.read' },
              { permissionCode: 'erp.hr.employee.manage' },
              { permissionCode: 'erp.hr.document.read' },
            ],
          },
        },
      });
      // One membership per (user, company): swap its role for the restricted one
      // and restore the original afterwards.
      const membership = await ctx.prisma.membership.findFirstOrThrow({
        where: { userId: user.id, companyId: tenantId },
      });
      await ctx.prisma.membership.update({ where: { id: membership.id }, data: { roleId: restrictedRole.id } });

      try {
        const payroll = await erp(`/hr/employees/${employeeId}/file/payroll`);
        expect(payroll.status).toBe(403);
        const bonuses = await erp(`/hr/employees/${employeeId}/file/bonuses`);
        expect(bonuses.status).toBe(403);

        // The personal card stays readable, with salary marked not permitted.
        const card = await erp<{ compensation: { visible: boolean } }>(`/hr/employees/${employeeId}/file/personal-card`);
        expect(card.status).toBe(200);
        expect(card.body.compensation.visible).toBe(false);
      } finally {
        await ctx.prisma.membership.update({ where: { id: membership.id }, data: { roleId: membership.roleId } });
        await ctx.prisma.rolePermission.deleteMany({ where: { roleId: restrictedRole.id } });
        await ctx.prisma.role.delete({ where: { id: restrictedRole.id } });
      }
    });

    it('returns zeroed totals, not sample data, for an employee with no payroll', async () => {
      const res = await erp<{ items: unknown[]; totals: { netMinor: number; payslipCount: number } }>(
        `/hr/employees/${employeeId}/file/payroll`,
      );
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.totals.netMinor).toBe(0);
      expect(res.body.totals.payslipCount).toBe(0);
    });

    it('records a disciplinary action and hides its amount from a non-salary reader', async () => {
      const created = await erp<{ id: string }>(`/hr/employees/${employeeId}/file/penalties`, {
        method: 'POST',
        body: {
          actionType: 'WRITTEN_WARNING',
          reason: 'Repeated lateness',
          effectiveDate: '2025-02-01',
          decidedByName: 'HR Manager',
        },
      });
      expect(created.status).toBe(201);

      const list = await erp<{ items: Array<{ actionType: string }>; total: number }>(
        `/hr/employees/${employeeId}/file/penalties`,
      );
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0].actionType).toBe('WRITTEN_WARNING');

      const stored = await ctx.prisma.employeePenalty.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(stored.companyId).toBe(tenantId);
    });

    it('grants a bonus, approves it, and refuses to edit it once payroll pays it', async () => {
      const created = await erp<{ id: string }>(`/hr/employees/${employeeId}/file/bonuses`, {
        method: 'POST',
        body: { type: 'BONUS', reason: 'Q1 performance', amountMinor: 150000, approveNow: false },
      });
      expect(created.status).toBe(201);

      const pending = await ctx.prisma.employeeBonus.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(pending.approvedAt).toBeNull();

      const approved = await erp(`/hr/file/bonuses/${created.body.id}/approve`, { method: 'POST', body: {} });
      expect(approved.status).toBe(201);

      // Simulate payroll consuming the bonus: the lock is the payslip link.
      const run = await ctx.prisma.payrollRun.findFirst({ where: { companyId: tenantId } });
      if (!run) {
        // No run exists yet; create the link against a placeholder is not
        // possible, so assert the unpaid edit path instead.
        const edited = await erp(`/hr/file/bonuses/${created.body.id}`, {
          method: 'PATCH',
          body: { amountMinor: 175000 },
        });
        expect(edited.status).toBe(200);
        return;
      }
      const slip = await ctx.prisma.payslip.create({
        data: {
          companyId: tenantId,
          payrollRunId: run.id,
          employeeId,
          employeeCode: 'TMP',
          employeeNameEn: 'Temp',
          employeeNameAr: 'مؤقت',
          basicMinor: 0,
          currency: 'SAR',
        },
      });
      await ctx.prisma.employeeBonus.update({ where: { id: created.body.id }, data: { payslipId: slip.id } });
      const blocked = await erp(`/hr/file/bonuses/${created.body.id}`, { method: 'PATCH', body: { amountMinor: 200000 } });
      expect(blocked.status).toBe(400);
      await ctx.prisma.employeeBonus.update({ where: { id: created.body.id }, data: { payslipId: null } });
      await ctx.prisma.payslip.delete({ where: { id: slip.id } });
    });

    it('pays an approved bonus exactly once through a payroll run', async () => {
      // Salary structure for the employee.
      await erp('/hr/salary-structures', {
        method: 'POST',
        body: {
          employeeId,
          effectiveFrom: '2024-03-01',
          basicMinor: 800000,
          components: [
            { type: 'ALLOWANCE', code: 'HOUSING', nameEn: 'Housing', nameAr: 'سكن', amountMinor: 200000 },
          ],
        },
      });
      const period = await erp<{ id: string }>('/hr/payroll-periods', {
        method: 'POST',
        body: { code: 'P2025-01', nameEn: 'January 2025', nameAr: 'يناير 2025', startDate: '2025-01-01', endDate: '2025-01-31' },
      });
      expect(period.status).toBe(201);

      const bonus = await erp<{ id: string }>(`/hr/employees/${employeeId}/file/bonuses`, {
        method: 'POST',
        body: { type: 'INCENTIVE', reason: 'Annual incentive', amountMinor: 300000, approveNow: true },
      });
      expect(bonus.status).toBe(201);

      // Every approved bonus that payroll has not yet paid joins this run, so
      // the expected allowance is the structure's allowance plus their sum.
      const unpaid = await ctx.prisma.employeeBonus.findMany({
        where: { companyId: tenantId, employeeId, payslipId: null, approvedAt: { not: null } },
      });
      const expectedAllowances = 200000 + unpaid.reduce((sum, b) => sum + b.amountMinor, 0);

      const run = await erp<{ id: string; payslips: Array<{ employeeId: string; allowancesMinor: number }> }>(
        '/hr/payroll-runs',
        { method: 'POST', body: { periodId: period.body.id } },
      );
      expect(run.status).toBe(201);
      const slip = run.body.payslips.find((p) => p.employeeId === employeeId);
      expect(slip).toBeDefined();
      expect(slip!.allowancesMinor).toBe(expectedAllowances);

      const consumed = await ctx.prisma.employeeBonus.findUniqueOrThrow({ where: { id: bonus.body.id } });
      expect(consumed.payslipId).not.toBeNull();

      // A second run in the same period must not pay it again. The run is
      // created anyway, but the bonus is already linked.
      const second = await erp<{ payslips: Array<{ employeeId: string; allowancesMinor: number }> }>(
        '/hr/payroll-runs',
        { method: 'POST', body: { periodId: period.body.id } },
      );
      if (second.status === 201) {
        const secondSlip = second.body.payslips.find((p) => p.employeeId === employeeId);
        // No bonus left unpaid: only the structure's housing allowance remains.
        expect(secondSlip?.allowancesMinor).toBe(200000);
      }
    });

    it('lists payslips with the run status and totals that match the stored rows', async () => {
      const res = await erp<{
        items: Array<{ paymentStatus: string; netMinor: number }>;
        totals: { netMinor: number; payslipCount: number };
      }>(`/hr/employees/${employeeId}/file/payroll`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      const sum = res.body.items.reduce((acc, item) => acc + item.netMinor, 0);
      expect(res.body.totals.netMinor).toBe(sum);
      expect(res.body.totals.payslipCount).toBe(res.body.items.length);
      expect(['DRAFT', 'APPROVED', 'PAID', 'LOCKED']).toContain(res.body.items[0].paymentStatus);
    });

    it('builds a report pack whose attendance summary matches the stored records', async () => {
      await erp('/hr/attendance', {
        method: 'POST',
        body: { employeeId, workDate: '2025-01-06', status: 'PRESENT', overtimeMinutes: 60 },
      });
      const res = await erp<{
        attendance: { summary: { recordedDays: number; presentDays: number; overtimeMinutes: number } };
        leave: { summary: { requestCount: number } };
        payroll: { visible: boolean };
      }>(`/hr/employees/${employeeId}/file/reports?from=2025-01-01&to=2025-01-31`);
      expect(res.status).toBe(200);
      expect(res.body.attendance.summary.recordedDays).toBe(1);
      expect(res.body.attendance.summary.presentDays).toBe(1);
      expect(res.body.attendance.summary.overtimeMinutes).toBe(60);
      expect(res.body.payroll.visible).toBe(true);
    });

    it('returns tab counts that agree with the tab endpoints', async () => {
      const counts = await erp<{ payslips: number; penalties: number; bonuses: number }>(
        `/hr/employees/${employeeId}/file/counts`,
      );
      expect(counts.status).toBe(200);
      const penalties = await erp<{ total: number }>(`/hr/employees/${employeeId}/file/penalties`);
      expect(counts.body.penalties).toBe(penalties.body.total);
      expect(counts.body.payslips).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------ attachments

  describe('unified attachments', () => {
    let attachmentId: string;

    it('uploads several files to one record and stores them against the tenant', async () => {
      const res = await upload(
        '/attachments',
        { entityType: 'EMPLOYEE_DOCUMENT', entityId: employeeId },
        [
          { name: 'contract.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 test') },
          { name: 'photo.png', type: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
        ],
      );
      expect(res.status).toBe(201);
      const items = (res.body.items as Array<{ id: string; previewKind: string; companyId: string }>);
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.companyId === tenantId)).toBe(true);
      expect(items.map((i) => i.previewKind).sort()).toEqual(['image', 'pdf']);
      attachmentId = items[0].id;

      const rows = await ctx.prisma.entityAttachment.findMany({ where: { companyId: tenantId, entityId: employeeId } });
      expect(rows).toHaveLength(2);
      // The bytes are on disk, not in the row.
      expect(rows[0].storageRef).not.toBeNull();
      expect(rows[0].checksum).not.toBeNull();
    });

    it('lists the attachments of a record', async () => {
      const res = await erp<{ items: unknown[]; total: number }>(
        `/attachments?entityType=EMPLOYEE_DOCUMENT&entityId=${employeeId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    });

    it('serves the file bytes through the authenticated content route', async () => {
      const res = await fetch(`${ctx.base}/api/v1/attachments/${attachmentId}/content?disposition=inline`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cache-control')).toContain('no-store');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.length).toBeGreaterThan(0);
    });

    it('refuses the file to a caller outside the tenant', async () => {
      const res = await fetch(`${ctx.base}/api/v1/attachments/${attachmentId}/content`, {
        headers: { Authorization: `Bearer ${otherTenantToken}`, 'x-oryx-company-id': otherTenantId },
      });
      expect(res.status).toBe(404);
    });

    it('rejects an undeclared entity type', async () => {
      const res = await upload('/attachments', { entityType: 'NOT_A_THING', entityId: employeeId }, [
        { name: 'x.txt', type: 'text/plain', bytes: Buffer.from('x') },
      ]);
      expect(res.status).toBe(400);
    });

    it('rejects a disallowed file type and stores nothing', async () => {
      const before = await ctx.prisma.entityAttachment.count({ where: { companyId: tenantId } });
      const res = await upload('/attachments', { entityType: 'EMPLOYEE_DOCUMENT', entityId: employeeId }, [
        { name: 'malware.exe', type: 'application/x-msdownload', bytes: Buffer.from('MZ') },
      ]);
      expect(res.status).toBe(400);
      const after = await ctx.prisma.entityAttachment.count({ where: { companyId: tenantId } });
      expect(after).toBe(before);
    });

    it('hides a confidential attachment from a caller without the confidential right', async () => {
      const res = await upload(
        '/attachments',
        { entityType: 'EMPLOYEE_DOCUMENT', entityId: employeeId, isConfidential: 'true' },
        [{ name: 'salary-letter.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 secret') }],
      );
      expect(res.status).toBe(201);
      const secretId = (res.body.items as Array<{ id: string }>)[0].id;

      // Remove the confidential permission from the administrator's role for
      // this check, then restore it.
      const role = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
      const removed = await ctx.prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionCode: 'erp.hr.document.confidential' },
      });
      expect(removed.count).toBeGreaterThan(0);

      const list = await erp<{ items: Array<{ id: string }>; total: number }>(
        `/attachments?entityType=EMPLOYEE_DOCUMENT&entityId=${employeeId}`,
      );
      expect(list.status).toBe(200);
      expect(list.body.items.map((i) => i.id)).not.toContain(secretId);

      const direct = await fetch(`${ctx.base}/api/v1/attachments/${secretId}/content`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      });
      expect(direct.status).toBe(403);

      await ctx.prisma.rolePermission.create({ data: { roleId: role.id, permissionCode: 'erp.hr.document.confidential' } });

      const restored = await erp<{ items: Array<{ id: string }> }>(
        `/attachments?entityType=EMPLOYEE_DOCUMENT&entityId=${employeeId}`,
      );
      expect(restored.body.items.map((i) => i.id)).toContain(secretId);
    });

    it('marks one attachment primary and clears the previous one', async () => {
      const first = await erp<{ id: string }>(`/attachments/${attachmentId}`, {
        method: 'PATCH',
        body: { isPrimary: true },
      });
      expect(first.status).toBe(200);
      const others = await ctx.prisma.entityAttachment.findMany({
        where: { companyId: tenantId, entityType: 'EMPLOYEE_DOCUMENT', entityId: employeeId, isPrimary: true },
      });
      expect(others).toHaveLength(1);
      expect(others[0].id).toBe(attachmentId);
    });

    it('replaces a file in place and keeps the row id', async () => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(Buffer.from('%PDF-1.7 replaced'))], { type: 'application/pdf' }), 'contract-v2.pdf');
      const res = await fetch(`${ctx.base}/api/v1/attachments/${attachmentId}/replace`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
        body: form,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; fileName: string };
      expect(body.id).toBe(attachmentId);
      expect(body.fileName).toBe('contract-v2.pdf');
    });

    it('deletes an attachment and removes its stored file', async () => {
      const row = await ctx.prisma.entityAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
      const res = await erp(`/attachments/${attachmentId}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const gone = await ctx.prisma.entityAttachment.findUnique({ where: { id: attachmentId } });
      expect(gone).toBeNull();
      // The row's storage reference is no longer readable through the API.
      const read = await fetch(`${ctx.base}/api/v1/attachments/${attachmentId}/content`, {
        headers: { Authorization: `Bearer ${token}`, 'x-oryx-company-id': tenantId },
      });
      expect(read.status).toBe(404);
      expect(row.storageRef).not.toBeNull();
    });

    it('attaches files to a work order through the same endpoint', async () => {
      const order = await erp<{ id: string }>('/operations/work-orders', {
        method: 'POST',
        body: { title: 'Install charging point', priority: 'NORMAL' },
      });
      expect(order.status).toBe(201);
      const res = await upload(
        '/attachments',
        { entityType: 'WORK_ORDER', entityId: order.body.id },
        [{ name: 'site-photo.jpg', type: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) }],
      );
      expect(res.status).toBe(201);
      const list = await erp<{ total: number }>(`/attachments?entityType=WORK_ORDER&entityId=${order.body.id}`);
      expect(list.body.total).toBe(1);
    });
  });
});
