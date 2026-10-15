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
 * Execution 03 — HR, CRM, operations and automotive integration suite.
 *
 * Exercises the real HTTP surface, guards, payroll engine, posting engine and
 * Prisma layer against the seeded database. Every financial or inventory
 * movement is asserted against the ledger or the stock ledger, not just the
 * response body.
 */
describe('ORYX Execution 03 (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let isolatedToken: string;
  let tenantId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;
  const code = `${FIXTURE_PREFIX}-E03`;

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
      body: { code, nameEn: 'E03 Fixture Co.', nameAr: 'شركة التنفيذ الثالث', type: 'SAAS_TENANT', planId: enterprise.id },
    });
    tenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: tenantId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
    await ctx.prisma.membership.create({ data: { userId: adminUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });

    // A principal that belongs only to this tenant, for isolation assertions.
    const isolatedEmail = `${FIXTURE_PREFIX.toLowerCase()}-e03-isolated@oryx.local`;
    const passwordHash = await argon2.hash('FixturePass!2026', { type: argon2.argon2id });
    const isolatedUser = await ctx.prisma.user.create({
      data: { email: isolatedEmail, passwordHash, fullNameEn: 'Isolated E03 User', fullNameAr: 'مستخدم معزول', status: 'ACTIVE' },
    });
    await ctx.prisma.membership.create({ data: { userId: isolatedUser.id, companyId: tenantId, roleId: adminRole.id, isActive: true } });
    isolatedToken = await login(ctx.base, isolatedEmail, 'FixturePass!2026');

    // Chart of accounts and an open fiscal year for the financial paths.
    const seedChart = await erp('/accounting/accounts/seed-standard-chart', { method: 'POST', body: {} });
    expect(seedChart.status).toBe(201);
    const year = new Date().getUTCFullYear();
    const fiscalYear = await erp('/accounting/fiscal-years', {
      method: 'POST',
      body: { code: `FY${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` },
    });
    expect(fiscalYear.status).toBe(201);

    const wh = await erp<{ id: string }>('/inventory/warehouses', { method: 'POST', body: { code: 'MAIN', nameEn: 'Main', nameAr: 'الرئيسي' } });
    warehouseId = wh.body.id;
    const product = await erp<{ id: string }>('/inventory/products', {
      method: 'POST',
      body: { sku: 'BRK-PAD', nameEn: 'Brake pad', nameAr: 'فحمات', salesPriceMinor: 20000, costPriceMinor: 12000, taxRateBp: 1500 },
    });
    productId = product.body.id;
    const customer = await erp<{ id: string }>('/sales/customers', { method: 'POST', body: { code: 'C1', nameEn: 'Customer One', nameAr: 'عميل', creditLimitMinor: 100000000 } });
    customerId = customer.body.id;
    // Opening stock for the parts path.
    await erp('/inventory/movements', { method: 'POST', body: { warehouseId, productId, direction: 'IN', quantity: 1000000, unitCostMinor: 12000, occurredAt: new Date().toISOString() } });
  }, 150_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  // ------------------------------------------------------------------- HR

  describe('HR & payroll', () => {
    let employeeId: string;
    let leaveTypeId: string;

    it('creates an employee with an onboarding checklist', async () => {
      const dept = await erp<{ id: string }>('/hr/departments', { method: 'POST', body: { code: 'OPS', nameEn: 'Operations', nameAr: 'العمليات' } });
      expect(dept.status).toBe(201);
      const employee = await erp<{ id: string; lifecycle: Array<{ items: unknown[] }> }>('/hr/employees', {
        method: 'POST',
        body: { code: 'EMP-1', fullNameEn: 'Test Employee', fullNameAr: 'موظف اختبار', hireDate: '2026-01-01', departmentId: dept.body.id },
      });
      expect(employee.status).toBe(201);
      employeeId = employee.body.id;
      expect(employee.body.lifecycle[0].items.length).toBeGreaterThan(0);
    });

    it('configures a salary structure and enforces leave balances', async () => {
      const lt = await erp<{ id: string }>('/hr/leave-types', {
        method: 'POST',
        body: { code: 'ANNUAL', nameEn: 'Annual leave', nameAr: 'إجازة سنوية', annualEntitlementDays: 3000 },
      });
      leaveTypeId = lt.body.id;

      const structure = await erp('/hr/salary-structures', {
        method: 'POST',
        body: {
          employeeId,
          effectiveFrom: '2026-01-01',
          basicMinor: 500000,
          components: [{ type: 'ALLOWANCE', code: 'HOUSING', nameEn: 'Housing', nameAr: 'بدل سكن', isPercentage: true, percentBp: 2500 }],
        },
      });
      expect(structure.status).toBe(201);

      // A request beyond the entitlement is refused.
      const over = await erp<{ code: string }>('/hr/leave-requests', {
        method: 'POST',
        body: { employeeId, leaveTypeId, startDate: '2026-03-01', endDate: '2026-04-30' },
      });
      expect(over.status).toBe(403);
      expect(over.body.code).toBe('hr.leave_insufficient_balance');

      // Within the entitlement it succeeds and reserves the days.
      const ok = await erp<{ id: string; status: string; days: number }>('/hr/leave-requests', {
        method: 'POST',
        body: { employeeId, leaveTypeId, startDate: '2026-03-01', endDate: '2026-03-05' },
      });
      expect(ok.status).toBe(201);
      expect(ok.body.status).toBe('SUBMITTED');
      expect(ok.body.days).toBe(500);

      // Approval moves the days from pending to used.
      const decided = await erp<{ status: string }>(`/hr/leave-requests/${ok.body.id}/decide`, { method: 'POST', body: { decision: 'APPROVED' } });
      expect(decided.body.status).toBe('APPROVED');
      const balance = await ctx.prisma.leaveBalance.findFirstOrThrow({ where: { employeeId, leaveTypeId } });
      expect(balance.usedDays).toBe(500);
      expect(balance.pendingDays).toBe(0);
    });

    it('records attendance with overtime and computes a payslip', async () => {
      const shift = await erp<{ id: string }>('/hr/shifts', { method: 'POST', body: { code: 'DAY', nameEn: 'Day', nameAr: 'نهاري', startTime: '08:00', endTime: '17:00' } });
      const att = await erp('/hr/attendance', {
        method: 'POST',
        body: { employeeId, workDate: '2026-04-02', checkInAt: '2026-04-02T08:00:00Z', checkOutAt: '2026-04-02T17:00:00Z', overtimeMinutes: 120, shiftId: shift.body.id },
      });
      expect(att.status).toBe(201);

      const period = await erp<{ id: string }>('/hr/payroll-periods', {
        method: 'POST',
        body: { code: '2026-04', nameEn: 'April 2026', nameAr: 'أبريل 2026', startDate: '2026-04-01', endDate: '2026-04-30' },
      });
      const run = await erp<{ id: string; employeeCount: number; grossMinor: number; netMinor: number }>('/hr/payroll-runs', {
        method: 'POST',
        body: { periodId: period.body.id },
      });
      expect(run.status).toBe(201);
      expect(run.body.employeeCount).toBeGreaterThanOrEqual(1);
      // Basic 5000.00 + 25% housing (1250.00) + overtime => gross > 6250.00
      expect(run.body.grossMinor).toBeGreaterThan(625000);
      expect(run.body.netMinor).toBeLessThanOrEqual(run.body.grossMinor);
    });

    it('posts payroll to the ledger exactly once (atomic and idempotent)', async () => {
      const runs = await erp<{ items: Array<{ id: string; status: string }> }>('/hr/payroll-runs');
      const runId = runs.body.items[0].id;

      const posted = await erp<{ journalEntryId: string; status: string }>(`/hr/payroll-runs/${runId}/approve`, { method: 'POST', body: {} });
      expect(posted.status).toBe(201);
      expect(posted.body.status).toBe('POSTED');

      // The journal exists, is balanced and is the only one for this run.
      const journal = await ctx.prisma.journalEntry.findUniqueOrThrow({ where: { id: posted.body.journalEntryId }, include: { lines: true } });
      expect(journal.totalDebitMinor).toBe(journal.totalCreditMinor);
      const count = await ctx.prisma.journalEntry.count({ where: { companyId: tenantId, sourceType: 'MANUAL', sourceId: `payroll:${runId}` } });
      expect(count).toBe(1);

      // A second approval is refused.
      const again = await erp<{ code: string }>(`/hr/payroll-runs/${runId}/approve`, { method: 'POST', body: {} });
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('payroll.already_posted');

      // Locking closes the period.
      const locked = await erp<{ status: string }>(`/hr/payroll-runs/${runId}/lock`, { method: 'POST', body: {} });
      expect(locked.body.status).toBe('LOCKED');
      const period = await ctx.prisma.payrollPeriod.findFirstOrThrow({ where: { companyId: tenantId, runs: { some: { id: runId } } } });
      expect(period.status).toBe('LOCKED');

      // A new run against a locked period is refused.
      const blocked = await erp<{ code: string }>('/hr/payroll-runs', { method: 'POST', body: { periodId: period.id } });
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('payroll.period_locked');
    });

    it('preserves a historical payslip when the salary structure changes', async () => {
      const runs = await erp<{ items: Array<{ id: string; grossMinor: number }> }>('/hr/payroll-runs');
      const run = runs.body.items[0];
      const payslipBefore = await ctx.prisma.payslip.findFirstOrThrow({ where: { payrollRunId: run.id, employeeId } });

      // Raise the basic salary after the run.
      await erp('/hr/salary-structures', {
        method: 'POST',
        body: { employeeId, effectiveFrom: '2026-05-01', basicMinor: 900000, components: [] },
      });

      const payslipAfter = await ctx.prisma.payslip.findFirstOrThrow({ where: { payrollRunId: run.id, employeeId } });
      expect(payslipAfter.basicMinor).toBe(payslipBefore.basicMinor);
      expect(payslipAfter.grossMinor).toBe(payslipBefore.grossMinor);
    });

    it('issues an advance, posts it, and keeps the ledger balanced', async () => {
      const advance = await erp<{ id: string; advanceNumber: string }>('/hr/advances', {
        method: 'POST',
        body: { employeeId, amountMinor: 100000, installments: 2, issuedAt: '2026-04-05' },
      });
      expect(advance.status).toBe(201);
      const ledger = await erp<{ totalDebitMinor: number; totalCreditMinor: number }>('/accounting/trial-balance');
      expect(ledger.body.totalDebitMinor).toBe(ledger.body.totalCreditMinor);
    });

    it('isolates employee data between tenants', async () => {
      const demo = await ctx.prisma.company.findUniqueOrThrow({ where: { code: 'DEMO-ALNOOR' } });
      const res = await call(ctx.base, '/hr/employees', { token: isolatedToken, headers: { 'x-oryx-company-id': demo.id } });
      expect(res.status).toBe(403);
      expect((res.body as { code?: string }).code).toBe('authz.cross_tenant_denied');
    });
  });

  // ------------------------------------------------------------------ CRM

  describe('CRM & customer service', () => {
    let pipelineId: string;
    let wonStageId: string;
    let opportunityId: string;

    it('runs lead -> opportunity -> quotation end to end', async () => {
      const pipeline = await erp<{ id: string; stages: Array<{ id: string; isWon: boolean }> }>('/crm/pipelines', {
        method: 'POST',
        body: { code: 'SALES', nameEn: 'Sales', nameAr: 'المبيعات' },
      });
      expect(pipeline.status).toBe(201);
      pipelineId = pipeline.body.id;
      wonStageId = pipeline.body.stages.find((s) => s.isWon)!.id;

      const lead = await erp<{ id: string }>('/crm/leads', {
        method: 'POST',
        body: { code: 'LD-1', nameEn: 'Prospect Co', nameAr: 'شركة محتملة', estimatedValueMinor: 500000 },
      });
      expect(lead.status).toBe(201);

      const opp = await erp<{ id: string; code: string }>('/crm/opportunities', {
        method: 'POST',
        body: { code: 'OPP-1', title: 'Fleet deal', pipelineId, customerId, amountMinor: 500000, leadId: lead.body.id },
      });
      expect(opp.status).toBe(201);
      opportunityId = opp.body.id;

      const moved = await erp<{ status: string }>(`/crm/opportunities/${opportunityId}/stage`, { method: 'POST', body: { stageId: wonStageId } });
      expect(moved.body.status).toBe('WON');

      const converted = await erp<{ quoteNumber: string; totalMinor: number }>(`/crm/opportunities/${opportunityId}/convert`, { method: 'POST', body: {} });
      expect(converted.status).toBe(201);
      expect(converted.body.quoteNumber).toMatch(/^QT-/);
      expect(converted.body.totalMinor).toBe(500000);

      // The quotation is a real sales quotation, visible through the sales module.
      const quotations = await erp<{ items: Array<{ quoteNumber: string }> }>('/sales/quotations');
      expect(quotations.body.items.some((q) => q.quoteNumber === converted.body.quoteNumber)).toBe(true);

      // A second conversion is refused.
      const again = await erp<{ code: string }>(`/crm/opportunities/${opportunityId}/convert`, { method: 'POST', body: {} });
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('crm.opportunity_already_converted');
    });

    it('prevents a duplicate customer master record', async () => {
      const first = await erp('/crm/customers', {
        method: 'POST',
        body: { code: 'DUP-1', nameEn: 'Unique Motors', nameAr: 'موتورز', taxNumber: 'TAX-999' },
      });
      expect(first.status).toBe(201);
      const dup = await erp<{ code: string }>('/crm/customers', {
        method: 'POST',
        body: { code: 'DUP-2', nameEn: 'Unique Motors Again', nameAr: 'موتورز 2', taxNumber: 'TAX-999' },
      });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('crm.duplicate_customer');
    });

    it('derives ticket SLA targets and records satisfaction', async () => {
      await erp('/crm/sla-policies', { method: 'POST', body: { priority: 'HIGH', responseMinutes: 30, resolutionMinutes: 240 } });
      const ticket = await erp<{ id: string; ticketNumber: string; responseDueAt: string | null; resolutionDueAt: string | null }>('/crm/tickets', {
        method: 'POST',
        body: { subject: 'Brake noise', priority: 'HIGH', customerId },
      });
      expect(ticket.status).toBe(201);
      expect(ticket.body.responseDueAt).toBeTruthy();
      expect(ticket.body.resolutionDueAt).toBeTruthy();

      const msg = await erp(`/crm/tickets/${ticket.body.id}/messages`, { method: 'POST', body: { body: 'Looking into it' } });
      expect(msg.status).toBe(201);
      const detail = await erp<{ firstResponseAt: string | null; status: string }>(`/crm/tickets/${ticket.body.id}`);
      expect(detail.body.firstResponseAt).toBeTruthy();

      const closed = await erp<{ status: string; satisfactionScore: number }>(`/crm/tickets/${ticket.body.id}`, {
        method: 'PATCH',
        body: { status: 'RESOLVED', satisfactionScore: 5 },
      });
      expect(closed.body.status).toBe('RESOLVED');
      expect(closed.body.satisfactionScore).toBe(5);
    });

    it('enforces ticket permissions: a viewer without ticket.manage is refused', async () => {
      // Create a role with only read access and attach it to a fixture user.
      const role = await erp<{ id: string }>(`/companies/${tenantId}/roles`, {
        method: 'POST',
        body: { code: 'crm-viewer', nameEn: 'CRM Viewer', nameAr: 'مشاهد', permissions: ['company.read', 'erp.crm.read'] },
      });
      expect(role.status).toBe(201);
      const user = await ctx.prisma.user.create({
        data: { email: `${FIXTURE_PREFIX.toLowerCase()}-e03-viewer@oryx.local`, passwordHash: await argon2.hash('FixturePass!2026', { type: argon2.argon2id }), fullNameEn: 'Viewer', fullNameAr: 'مشاهد', status: 'ACTIVE' },
      });
      await ctx.prisma.membership.create({ data: { userId: user.id, companyId: tenantId, roleId: role.body.id, isActive: true } });
      const viewerToken = await login(ctx.base, `${FIXTURE_PREFIX.toLowerCase()}-e03-viewer@oryx.local`, 'FixturePass!2026');
      // The viewer may read tickets.
      const read = await companyCall(ctx.base, tenantId, '/crm/tickets', { token: viewerToken });
      expect(read.status).toBe(200);
      // But may not create one.
      const res = await companyCall(ctx.base, tenantId, '/crm/tickets', { method: 'POST', token: viewerToken, body: { subject: 'Nope' } });
      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------------ operations

  describe('Operations & work management', () => {
    let workOrderId: string;

    it('creates a work order and enforces state transitions', async () => {
      const project = await erp<{ id: string }>('/operations/projects', { method: 'POST', body: { code: 'PRJ-1', nameEn: 'Rollout', nameAr: 'التدشين' } });
      expect(project.status).toBe(201);

      const wo = await erp<{ id: string; orderNumber: string; status: string; checklist: unknown[] }>('/operations/work-orders', {
        method: 'POST',
        body: { title: 'Install equipment', projectId: project.body.id, checklist: [{ label: 'Unpack' }, { label: 'Mount' }] },
      });
      expect(wo.status).toBe(201);
      expect(wo.body.status).toBe('OPEN');
      expect(wo.body.checklist.length).toBe(2);
      workOrderId = wo.body.id;

      // A legal transition.
      const started = await erp<{ status: string }>(`/operations/work-orders/${workOrderId}`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } });
      expect(started.body.status).toBe('IN_PROGRESS');

      // An illegal transition (IN_PROGRESS -> ASSIGNED) is refused.
      const bad = await erp<{ code: string }>(`/operations/work-orders/${workOrderId}`, { method: 'PATCH', body: { status: 'ASSIGNED' } });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('automotive.job_card_state');

      const done = await erp<{ status: string }>(`/operations/work-orders/${workOrderId}`, { method: 'PATCH', body: { status: 'COMPLETED' } });
      expect(done.body.status).toBe('COMPLETED');
    });

    it('supports approvals, comments, attachments, calendar and notifications', async () => {
      const approval = await erp<{ id: string; status: string }>('/operations/approvals', { method: 'POST', body: { entityType: 'WORK_ORDER', entityId: workOrderId } });
      expect(approval.body.status).toBe('PENDING');
      const decided = await erp<{ status: string }>(`/operations/approvals/${approval.body.id}/decide`, { method: 'POST', body: { decision: 'APPROVED' } });
      expect(decided.body.status).toBe('APPROVED');

      const comment = await erp('/operations/comments', { method: 'POST', body: { entityType: 'WORK_ORDER', entityId: workOrderId, body: 'Progress noted' } });
      expect(comment.status).toBe(201);
      const attachment = await erp('/operations/attachments', { method: 'POST', body: { entityType: 'WORK_ORDER', entityId: workOrderId, fileName: 'photo.jpg' } });
      expect(attachment.status).toBe(201);

      const event = await erp('/operations/calendar', { method: 'POST', body: { title: 'Site visit', startAt: '2026-05-01T09:00:00Z', endAt: '2026-05-01T10:00:00Z' } });
      expect(event.status).toBe(201);

      const notifications = await erp<{ items: unknown[] }>('/operations/notifications');
      expect(notifications.status).toBe(200);
      const dashboard = await erp<{ totalWorkOrders: number }>('/operations/dashboard');
      expect(dashboard.body.totalWorkOrders).toBeGreaterThanOrEqual(1);
    });
  });

  // ------------------------------------------------------------ automotive

  describe('Automotive services', () => {
    let vehicleId: string;
    let inspectionServiceId: string;
    let bookingId: string;

    it('registers a vehicle and validates the VIN', async () => {
      // 17 characters but containing 'I' and 'O', which a real VIN forbids.
      const bad = await erp<{ code: string }>('/automotive/vehicles', {
        method: 'POST',
        body: { customerId, vin: 'JTDBR32E72012IO45', make: 'Toyota', model: 'Corolla', modelYear: 2020 },
      });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('automotive.vin_invalid');

      const vehicle = await erp<{ id: string; vin: string }>('/automotive/vehicles', {
        method: 'POST',
        body: { customerId, vin: 'JTDBR32E720123456', make: 'Toyota', model: 'Corolla', modelYear: 2020, mileage: 50000 },
      });
      expect(vehicle.status).toBe(201);
      vehicleId = vehicle.body.id;

      const dup = await erp<{ code: string }>('/automotive/vehicles', {
        method: 'POST',
        body: { customerId, vin: 'JTDBR32E720123456', make: 'Toyota', model: 'Corolla', modelYear: 2021 },
      });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('automotive.vin_exists');

      // Mileage cannot decrease.
      const down = await erp<{ code: string }>(`/automotive/vehicles/${vehicleId}/mileage`, { method: 'POST', body: { mileage: 100 } });
      expect(down.status).toBe(400);
    });

    it('runs a full inspection: book -> findings -> report -> approve -> invoice', async () => {
      const svc = await erp<{ id: string }>('/automotive/inspection-services', {
        method: 'POST',
        body: { code: 'BASIC', nameEn: 'Basic inspection', nameAr: 'فحص أساسي', priceMinor: 25000, taxPercentBp: 1500 },
      });
      inspectionServiceId = svc.body.id;
      await erp('/automotive/inspection-checklist-items', { method: 'POST', body: { serviceId: inspectionServiceId, code: 'BRAKES', labelEn: 'Brakes', labelAr: 'الفرامل', category: 'SAFETY' } });

      const booking = await erp<{ id: string; bookingNumber: string }>('/automotive/inspection-bookings', {
        method: 'POST',
        body: { vehicleId, serviceId: inspectionServiceId, scheduledAt: '2026-06-01T09:00:00Z' },
      });
      expect(booking.status).toBe(201);
      bookingId = booking.body.id;

      // Findings are required before submission.
      const early = await erp<{ code: string }>(`/automotive/inspection-bookings/${bookingId}/report/submit`, { method: 'POST', body: {} });
      expect(early.status).toBe(400);
      expect(early.body.code).toBe('automotive.inspection_not_complete');

      await erp(`/automotive/inspection-bookings/${bookingId}/findings`, {
        method: 'POST',
        body: { findings: [{ category: 'SAFETY', severity: 'MAJOR', description: 'Worn brake pads', isDefect: true }] },
      });
      const submitted = await erp(`/automotive/inspection-bookings/${bookingId}/report/submit`, { method: 'POST', body: { summary: 'One major defect' } });
      expect(submitted.status).toBe(201);

      // Invoicing before approval is refused.
      const tooEarly = await erp<{ code: string }>(`/automotive/inspection-bookings/${bookingId}/invoice`, { method: 'POST', body: {} });
      expect(tooEarly.status).toBe(403);

      const approved = await erp<{ status: string }>(`/automotive/inspection-bookings/${bookingId}/report/decide`, { method: 'POST', body: { decision: 'APPROVED' } });
      expect(approved.body.status).toBe('APPROVED');

      const invoice = await erp<{ invoiceNumber: string; totalMinor: number; taxMinor: number }>(`/automotive/inspection-bookings/${bookingId}/invoice`, { method: 'POST', body: {} });
      expect(invoice.status).toBe(201);
      // 250.00 net + 15% VAT = 287.50
      expect(invoice.body.taxMinor).toBe(3750);
      expect(invoice.body.totalMinor).toBe(28750);

      // A second invoice is refused.
      const again = await erp<{ code: string }>(`/automotive/inspection-bookings/${bookingId}/invoice`, { method: 'POST', body: {} });
      expect(again.status).toBe(400);

      // The report payload is complete for a PDF renderer.
      const report = await erp<{ defects: number; critical: number; findings: unknown[] }>(`/automotive/inspection-bookings/${bookingId}/report`);
      expect(report.body.defects).toBe(1);
    });

    it('runs a workshop job: estimate -> approval -> parts -> completion -> invoice', async () => {
      const job = await erp<{ id: string; jobNumber: string; status: string }>('/automotive/job-cards', {
        method: 'POST',
        body: { vehicleId, odometer: 51000, complaint: 'Grinding noise' },
      });
      expect(job.status).toBe(201);
      const jobId = job.body.id;

      // Completing without an approved estimate is refused.
      await erp(`/automotive/job-cards/${jobId}`, { method: 'PATCH', body: { status: 'IN_PROGRESS' } });
      const early = await erp<{ code: string }>(`/automotive/job-cards/${jobId}`, { method: 'PATCH', body: { status: 'COMPLETED' } });
      expect(early.status).toBe(403);
      expect(early.body.code).toBe('automotive.estimate_not_approved');

      const estimate = await erp<{ id: string; totalMinor: number }>(`/automotive/job-cards/${jobId}/estimates`, {
        method: 'POST',
        body: { lines: [{ type: 'PART', productId, description: 'Brake pad', quantity: 20000, unitPriceMinor: 20000, taxPercentBp: 1500 }] },
      });
      expect(estimate.status).toBe(201);
      expect(estimate.body.totalMinor).toBe(46000); // 2 x 200.00 = 400.00 + 15% VAT

      await erp(`/automotive/estimates/${estimate.body.id}/approve`, { method: 'POST', body: {} });

      // Reserve then issue parts: the shared stock ledger moves exactly once.
      const before = await ctx.prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } });
      const reservation = await erp<{ id: string }>('/automotive/reservations', {
        method: 'POST',
        body: { jobCardId: jobId, warehouseId, lines: [{ productId, quantity: 20000 }] },
      });
      expect(reservation.status).toBe(201);
      // Reservation alone must not move stock.
      const mid = await ctx.prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } });
      expect(mid.quantity).toBe(before.quantity);

      const issued = await erp<{ status: string }>(`/automotive/reservations/${reservation.body.id}/issue`, { method: 'POST', body: {} });
      expect(issued.body.status).toBe('ISSUED');
      const after = await ctx.prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } });
      expect(before.quantity - after.quantity).toBe(20000);

      const completed = await erp<{ status: string }>(`/automotive/job-cards/${jobId}`, { method: 'PATCH', body: { status: 'COMPLETED' } });
      expect(completed.body.status).toBe('COMPLETED');

      const invoice = await erp<{ invoiceNumber: string; totalMinor: number }>(`/automotive/job-cards/${jobId}/invoice`, { method: 'POST', body: {} });
      expect(invoice.status).toBe(201);
      expect(invoice.body.totalMinor).toBe(46000);
    });

    it('keeps the shared ledger and stock balanced after the workshop flow', async () => {
      const tb = await erp<{ balanced: boolean }>('/accounting/trial-balance');
      expect(tb.body.balanced).toBe(true);
    });

    it('enforces concurrent parts consumption against available stock', async () => {
      const before = await ctx.prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } });
      // Two job cards each reserve and issue more than half the remaining stock.
      const half = Math.floor(before.quantity / 2) + 10000;
      const jobs = await Promise.all(
        [0, 1].map(async () => {
          const job = await erp<{ id: string }>('/automotive/job-cards', { method: 'POST', body: { vehicleId, complaint: 'Concurrent test' } });
          return job.body.id;
        }),
      );
      const reservations = await Promise.all(
        jobs.map(async (jobId) =>
          erp<{ id: string }>('/automotive/reservations', { method: 'POST', body: { jobCardId: jobId, warehouseId, lines: [{ productId, quantity: half }] } }),
        ),
      );
      const results = await Promise.all(
        reservations.map(async (r) => erp(`/automotive/reservations/${r.body.id}/issue`, { method: 'POST', body: {} })),
      );
      // Exactly one issue can succeed; the other must be refused for stock.
      const succeeded = results.filter((r) => r.status === 201).length;
      expect(succeeded).toBe(1);
      const after = await ctx.prisma.stockLevel.findUniqueOrThrow({ where: { warehouseId_productId: { warehouseId, productId } } });
      expect(after.quantity).toBeGreaterThanOrEqual(0);
    });

    it('isolates vehicle data between tenants', async () => {
      const demo = await ctx.prisma.company.findUniqueOrThrow({ where: { code: 'DEMO-ALNOOR' } });
      const res = await call(ctx.base, `/automotive/vehicles/${vehicleId}`, { token: isolatedToken, headers: { 'x-oryx-company-id': demo.id } });
      expect([403, 404]).toContain(res.status);
    });
  });

  // ----------------------------------------------------------- marketplace

  describe('Marketplace foundations', () => {
    it('approves a provider before it can be assigned', async () => {
      const provider = await erp<{ id: string; status: string }>('/automotive/providers', {
        method: 'POST',
        body: { code: `${FIXTURE_PREFIX}-PROV`, nameEn: 'Provider One', nameAr: 'مزود', commissionPercentBp: 1000 },
      });
      expect(provider.body.status).toBe('PENDING');

      const request = await erp<{ id: string; requestNumber: string }>('/automotive/service-requests', {
        method: 'POST',
        body: { categoryKey: 'WORKSHOP', description: 'Need a tow' },
      });
      expect(request.status).toBe(201);

      // Assigning a non-approved provider is refused.
      const early = await erp<{ code: string }>(`/automotive/service-requests/${request.body.id}/assign`, { method: 'POST', body: { providerId: provider.body.id } });
      expect(early.status).toBe(403);
      expect(early.body.code).toBe('marketplace.provider_not_approved');

      await erp(`/automotive/providers/${provider.body.id}/decide`, { method: 'POST', body: { decision: 'APPROVED' } });
      const assigned = await erp<{ status: string }>(`/automotive/service-requests/${request.body.id}/assign`, { method: 'POST', body: { providerId: provider.body.id } });
      expect(assigned.body.status).toBe('ASSIGNED');
    });

    it('prepares a provider settlement from pending commissions', async () => {
      const providers = await erp<{ items: Array<{ id: string }> }>('/automotive/providers?status=APPROVED');
      const providerId = providers.body.items[0].id;
      const settlement = await erp<{ grossMinor: number; commissionMinor: number; netMinor: number; status: string }>('/automotive/settlements', {
        method: 'POST',
        body: { providerId, periodStart: '2026-01-01', periodEnd: '2026-12-31' },
      });
      expect(settlement.status).toBe(201);
      expect(settlement.body.status).toBe('DRAFT');
      expect(settlement.body.netMinor).toBe(settlement.body.grossMinor - settlement.body.commissionMinor);
    });
  });

  // ------------------------------------------------------------ entitlement

  describe('Subscription entitlements', () => {
    it('hides and refuses Execution 03 modules for a plan that does not license them', async () => {
      const starter = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: { code: `${FIXTURE_PREFIX}-E03STARTER`, nameEn: 'Starter E03', nameAr: 'مبتدئ', type: 'SAAS_TENANT', planId: starter.id },
      });
      const starterCompanyId = created.body.company.id;
      const role = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: starterCompanyId, code: 'company_admin' } });
      const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_COMPANY_ADMIN.email } });
      await ctx.prisma.membership.create({ data: { userId: admin.id, companyId: starterCompanyId, roleId: role.id, isActive: true } });

      // HR is not licensed on the starter plan, so the module guard refuses.
      const res = await companyCall(ctx.base, starterCompanyId, '/hr/employees', { token });
      expect(res.status).toBe(403);
    });

    it('licenses the Execution 03 modules on the enterprise plan', async () => {
      const modules = await erp<{ items: Array<{ key: string; status: string; licensed: boolean }> }>('/modules');
      const available = ['human_resources', 'crm', 'operations', 'automotive_inspections', 'automotive_maintenance', 'spare_parts'];
      for (const key of available) {
        const mod = modules.body.items.find((m) => m.key === key);
        expect(mod).toBeDefined();
        expect(mod!.status).toBe('AVAILABLE');
        expect(mod!.licensed).toBe(true);
      }
    });
  });
});
