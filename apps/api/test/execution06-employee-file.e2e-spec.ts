import * as argon2 from 'argon2';
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
 * The employee electronic file (Execution 06, rebuilt on the production HR
 * engine).
 *
 * The suite proves four things the specification asks for:
 *   1. Pay, bank details and the payroll ledger are hidden from a caller that
 *      lacks `erp.hr.salary.read`, on both the employee detail route and the
 *      file routes.
 *   2. A penalty and a bonus are real, tenant-scoped records that survive a
 *      reload and cannot be read across a tenant boundary.
 *   3. An approved bonus is paid by a payroll run exactly once, and a second
 *      run does not pay it again.
 *   4. The report pack totals come from the stored records, not from a sample.
 */
describe('Execution 06 — employee electronic file', () => {
  let ctx: TestContext;
  let token: string;
  let limitedToken: string;
  let superToken: string;
  let tenantId: string;
  let employeeId: string;
  let otherTenantId: string;
  const code = `${FIXTURE_PREFIX}-E06`;

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
      body: {
        code,
        nameEn: 'E06 Fixture Co.',
        nameAr: 'شركة التنفيذ السادس',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({
      where: { companyId: tenantId, code: 'company_admin' },
    });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true },
    });

    // A second tenant, to prove the file never crosses a tenant boundary.
    const other = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: `${code}-B`,
        nameEn: 'E06 Other Co.',
        nameAr: 'شركة أخرى',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    otherTenantId = other.body.company.id;

    // A principal inside the tenant that holds HR read but not salary read.
    const limitedEmail = `${FIXTURE_PREFIX.toLowerCase()}-e06-limited@oryx.local`;
    const passwordHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const limitedUser = await ctx.prisma.user.create({
      data: {
        email: limitedEmail,
        passwordHash,
        fullNameEn: 'Limited HR Officer',
        fullNameAr: 'موظف موارد بشرية محدود',
        status: 'ACTIVE',
      },
    });
    const limitedRole = await ctx.prisma.role.create({
      data: {
        companyId: tenantId,
        code: 'hr_readonly_fixture',
        nameEn: 'HR read only',
        nameAr: 'قراءة الموارد البشرية',
        permissions: {
          create: ['erp.hr.read', 'erp.hr.document.read', 'erp.hr.report.read'].map((permissionCode) => ({
            permissionCode,
          })),
        },
      },
    });
    await ctx.prisma.membership.create({
      data: { userId: limitedUser.id, companyId: tenantId, roleId: limitedRole.id, isActive: true },
    });
    limitedToken = await login(ctx.base, limitedEmail, 'FixturePass!2026');

    // Chart of accounts and an open fiscal year so payroll can post.
    const seedChart = await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    expect(seedChart.status).toBe(201);
    const year = new Date().getUTCFullYear();
    const fiscalYear = await erp('/accounting/fiscal-years', {
      method: 'POST',
      body: { code: `FY${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
    });
    expect(fiscalYear.status).toBe(201);

    const employee = await erp<{ id: string }>('/hr/employees', {
      method: 'POST',
      body: {
        fullNameEn: 'File Subject',
        fullNameAr: 'موظف الملف',
        hireDate: `${year}-01-01`,
      },
    });
    expect(employee.status).toBe(201);
    employeeId = employee.body.id;
  }, 180_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  describe('salary visibility', () => {
    it('withholds pay from an HR reader without the salary permission', async () => {
      const detail = await companyCall<Record<string, unknown>>(
        ctx.base,
        tenantId,
        `/hr/employees/${employeeId}`,
        { token: limitedToken },
      );
      expect(detail.status).toBe(200);
      expect(detail.body.salaryVisible).toBe(false);
      expect(detail.body.salaryStructures).toBeUndefined();
      expect(detail.body.advances).toBeUndefined();
    });

    it('refuses the payroll ledger without the salary permission', async () => {
      const ledger = await companyCall(ctx.base, tenantId, `/hr/employees/${employeeId}/file/payroll`, {
        token: limitedToken,
      });
      expect(ledger.status).toBe(403);
    });

    it('shows pay to a caller that holds the salary permission', async () => {
      const card = await erp<{ compensation: { visible: boolean }; employee: { code: string } }>(
        `/hr/employees/${employeeId}/file/personal-card`,
      );
      expect(card.status).toBe(200);
      expect(card.body.compensation.visible).toBe(true);
      expect(card.body.employee.code).toBeTruthy();
    });

    it('omits the pay block from the personal card without the permission', async () => {
      const card = await companyCall<{ compensation: { visible: boolean } }>(
        ctx.base,
        tenantId,
        `/hr/employees/${employeeId}/file/personal-card`,
        { token: limitedToken },
      );
      expect(card.status).toBe(200);
      expect(card.body.compensation.visible).toBe(false);
    });
  });

  describe('penalties', () => {
    it('records, lists and deletes a disciplinary action', async () => {
      const created = await erp<{ id: string; actionType: string }>(
        `/hr/employees/${employeeId}/file/penalties`,
        {
          method: 'POST',
          body: {
            actionType: 'WARNING',
            reason: 'Repeated late arrival',
            effectiveDate: new Date().toISOString().slice(0, 10),
            decidedByName: 'HR Manager',
          },
        },
      );
      expect(created.status).toBe(201);

      const list = await erp<{ items: Array<{ id: string; actionType: string; amountMinor?: number }> }>(
        `/hr/employees/${employeeId}/file/penalties`,
      );
      expect(list.status).toBe(200);
      expect(list.body.items.map((p) => p.id)).toContain(created.body.id);

      const removed = await erp(`/hr/file/penalties/${created.body.id}`, { method: 'DELETE' });
      expect(removed.status).toBe(200);

      const after = await erp<{ items: Array<{ id: string }> }>(`/hr/employees/${employeeId}/file/penalties`);
      expect(after.body.items.map((p) => p.id)).not.toContain(created.body.id);
    });

    it('does not expose a monetary penalty amount to a reader without salary access', async () => {
      const created = await erp<{ id: string }>(`/hr/employees/${employeeId}/file/penalties`, {
        method: 'POST',
        body: {
          actionType: 'FINE',
          reason: 'Policy breach',
          effectiveDate: new Date().toISOString().slice(0, 10),
          amountMinor: 25_000,
        },
      });
      expect(created.status).toBe(201);

      const limited = await companyCall<{ items: Array<Record<string, unknown>> }>(
        ctx.base,
        tenantId,
        `/hr/employees/${employeeId}/file/penalties`,
        { token: limitedToken },
      );
      expect(limited.status).toBe(200);
      const row = limited.body.items.find((p) => p.id === created.body.id);
      expect(row).toBeDefined();
      expect(row?.amountMinor).toBeUndefined();

      await erp(`/hr/file/penalties/${created.body.id}`, { method: 'DELETE' });
    });

    it('cannot be read from another tenant', async () => {
      const foreign = await companyCall(
        ctx.base,
        otherTenantId,
        `/hr/employees/${employeeId}/file/penalties`,
        { token: superToken },
      );
      // The super admin has no membership in either tenant, and the employee is
      // not in the other tenant, so the route must not resolve it.
      expect([403, 404]).toContain(foreign.status);
    });
  });

  describe('bonuses and payroll consumption', () => {
    it('pays an approved bonus once and never again', async () => {
      const year = new Date().getUTCFullYear();
      const month = new Date().getUTCMonth() + 1;
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

      const period = await erp<{ id: string }>('/hr/payroll-periods', {
        method: 'POST',
        body: {
          nameEn: `Bonus period ${month}`,
          nameAr: `فترة المكافأة ${month}`,
          startDate: periodStart,
          endDate: periodEnd,
        },
      });
      expect(period.status).toBe(201);

      const structure = await erp('/hr/salary-structures', {
        method: 'POST',
        body: {
          employeeId,
          effectiveFrom: `${year}-01-01`,
          basicMinor: 500_000,
          currency: 'BHD',
          components: [],
        },
      });
      expect(structure.status).toBe(201);

      const bonus = await erp<{ id: string }>(`/hr/employees/${employeeId}/file/bonuses`, {
        method: 'POST',
        body: { type: 'BONUS', reason: 'Quarterly performance', amountMinor: 100_000, approveNow: true },
      });
      expect(bonus.status).toBe(201);

      const run = await erp<{ id: string; payslips?: Array<{ netMinor: number }> }>('/hr/payroll-runs', {
        method: 'POST',
        body: { periodId: period.body.id },
      });
      expect(run.status).toBe(201);

      // The run pays basic 500,000 plus the 100,000 bonus.
      const slip = await ctx.prisma.payslip.findFirstOrThrow({
        where: { companyId: tenantId, employeeId, payrollRunId: run.body.id },
      });
      expect(slip.allowancesMinor).toBe(100_000);
      expect(slip.netMinor).toBe(600_000);

      const consumed = await ctx.prisma.employeeBonus.findUniqueOrThrow({ where: { id: bonus.body.id } });
      expect(consumed.payslipId).toBe(slip.id);

      // A second period and run must not pay the same bonus again.
      const nextStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      const nextEnd = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
      const nextPeriod = await erp<{ id: string }>('/hr/payroll-periods', {
        method: 'POST',
        body: {
          nameEn: `Bonus period ${month + 1}`,
          nameAr: `فترة المكافأة ${month + 1}`,
          startDate: nextStart,
          endDate: nextEnd,
        },
      });
      expect(nextPeriod.status).toBe(201);

      const secondRun = await erp<{ id: string }>('/hr/payroll-runs', {
        method: 'POST',
        body: { periodId: nextPeriod.body.id },
      });
      expect(secondRun.status).toBe(201);

      const secondSlip = await ctx.prisma.payslip.findFirstOrThrow({
        where: { companyId: tenantId, employeeId, payrollRunId: secondRun.body.id },
      });
      expect(secondSlip.allowancesMinor).toBe(0);
      expect(secondSlip.netMinor).toBe(500_000);
    });

    it('refuses to edit or delete a bonus payroll already paid', async () => {
      const paid = await ctx.prisma.employeeBonus.findFirstOrThrow({
        where: { companyId: tenantId, employeeId, payslipId: { not: null } },
      });
      const edit = await erp(`/hr/file/bonuses/${paid.id}`, {
        method: 'PATCH',
        body: { amountMinor: 999_999 },
      });
      expect(edit.status).toBe(400);
      const remove = await erp(`/hr/file/bonuses/${paid.id}`, { method: 'DELETE' });
      expect(remove.status).toBe(400);
    });

    it('reports real payroll totals for the ledger window', async () => {
      const ledger = await erp<{
        items: unknown[];
        totals: { netMinor: number; payslipCount: number; allowancesMinor: number };
      }>(`/hr/employees/${employeeId}/file/payroll`);
      expect(ledger.status).toBe(200);
      expect(ledger.body.totals.payslipCount).toBe(2);
      expect(ledger.body.totals.allowancesMinor).toBe(100_000);
      expect(ledger.body.totals.netMinor).toBe(1_100_000);
    });
  });

  describe('report pack', () => {
    it('totals the stored records rather than a sample', async () => {
      // The window must cover both payroll periods. A report ending today
      // deliberately excludes a period that has not started yet, so the upper
      // bound is pushed past the second period's end.
      const from = `${new Date().getUTCFullYear()}-01-01`;
      const to = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 2, 0))
        .toISOString()
        .slice(0, 10);
      const reports = await erp<{
        window: { from: string; to: string };
        bonuses: { summary: { totalAmountMinor: number; count: number } };
        payroll: { summary: { payslipCount: number; netMinor: number } };
        attendance: { summary: { recordedDays: number } };
      }>(`/hr/employees/${employeeId}/file/reports?from=${from}&to=${to}`);
      expect(reports.status).toBe(200);
      expect(reports.body.bonuses.summary.totalAmountMinor).toBe(100_000);
      expect(reports.body.bonuses.summary.count).toBe(1);
      expect(reports.body.payroll.summary.payslipCount).toBe(2);
      expect(reports.body.payroll.summary.netMinor).toBe(1_100_000);
    });

    it('hides the payroll and bonus sections from a reader without salary access', async () => {
      const reports = await companyCall<{
        payroll: { visible?: boolean };
        bonuses: { visible?: boolean };
        attendance: { summary: { recordedDays: number } };
      }>(ctx.base, tenantId, `/hr/employees/${employeeId}/file/reports`, { token: limitedToken });
      expect(reports.status).toBe(200);
      expect(reports.body.payroll.visible).toBe(false);
      expect(reports.body.bonuses.visible).toBe(false);
      expect(reports.body.attendance.summary.recordedDays).toBe(0);
    });

    it('rejects a reversed window', async () => {
      const bad = await erp(`/hr/employees/${employeeId}/file/reports?from=2026-12-31&to=2026-01-01`);
      expect(bad.status).toBe(400);
    });
  });

  describe('leave tab', () => {
    it('returns leave history and the current-year balances', async () => {
      const leave = await erp<{ items: unknown[]; balances: unknown[]; year: number }>(
        `/hr/employees/${employeeId}/file/leave`,
      );
      expect(leave.status).toBe(200);
      expect(Array.isArray(leave.body.items)).toBe(true);
      expect(leave.body.year).toBe(new Date().getUTCFullYear());
    });
  });

  describe('identity fields', () => {
    it('stores and returns national id, birth date, gender and nationality', async () => {
      const patch = await erp(`/hr/employees/${employeeId}`, {
        method: 'PATCH',
        body: { nationalId: '850101234', dateOfBirth: '1985-01-01', gender: 'MALE', nationality: 'Bahraini' },
      });
      expect(patch.status).toBe(200);

      const card = await erp<{ employee: Record<string, unknown> }>(
        `/hr/employees/${employeeId}/file/personal-card`,
      );
      expect(card.status).toBe(200);
      expect(card.body.employee.nationalId).toBe('850101234');
      expect(card.body.employee.gender).toBe('MALE');
      expect(card.body.employee.nationality).toBe('Bahraini');
      expect(String(card.body.employee.dateOfBirth)).toContain('1985-01-01');
    });
  });

  describe('tab counts', () => {
    it('counts the records the tabs will list', async () => {
      const counts = await erp<Record<string, number>>(`/hr/employees/${employeeId}/file/counts`);
      expect(counts.status).toBe(200);
      expect(counts.body.payslips).toBe(2);
      expect(counts.body.bonuses).toBe(1);
      expect(counts.body.penalties).toBe(0);
    });
  });
});
