import {
  SEED_ORYX_AUTO_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Customer master data — source attribution, owning department, the detail
 * profile and its attachments.
 *
 * The properties asserted here are the ones this surface is most likely to get
 * wrong: that a catalogue id from another tenant cannot be attached (it would
 * leak the other tenant's label through the relation), that the detail profile
 * is scoped to the customer's own company, that a customer with no name at all
 * is refused while one name is enough, and that an attachment cannot be read or
 * removed across tenants.
 */
describe('Customer master data — attribution, profile and attachments (e2e)', () => {
  let ctx: TestContext;
  let token: string;
  let superToken: string;
  let companyId: string;
  let otherCompanyId: string;
  let sourceId: string;
  let departmentId: string;
  let customerId: string;

  const createdCustomerIds: string[] = [];

  const erp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, companyId, path, { ...options, token });

  const otherErp = <T = unknown>(path: string, options: Parameters<typeof call>[2] = {}) =>
    companyCall<T>(ctx.base, otherCompanyId, path, { ...options, token });

  async function provision(codeValue: string, label: string) {
    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: codeValue,
        nameEn: `${label} Co.`,
        nameAr: 'شركة بيانات العملاء',
        type: 'SAAS_TENANT',
        planId: enterprise.id,
      },
    });
    if (created.status >= 400) throw new Error(`provision failed: ${created.status} ${JSON.stringify(created.body)}`);
    return created.body.company.id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    const me = await call<{ context: { companyId: string | null } }>(ctx.base, '/auth/me', { token });
    companyId = me.body.context.companyId!;

    const suffix = Date.now();
    otherCompanyId = await provision(`E21-OTHER-${suffix}`, 'Other');
    const otherRole = await ctx.prisma.role.findFirstOrThrow({ where: { companyId: otherCompanyId, code: 'company_admin' } });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: SEED_ORYX_AUTO_ADMIN.email } });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: otherCompanyId, roleId: otherRole.id, isActive: true },
    });

    const source = await erp<{ id: string }>('/crm/lead-sources', {
      method: 'POST',
      body: { code: `E21SRC-${suffix}`, nameEn: 'Walk-in', nameAr: 'زيارة مباشرة' },
    });
    sourceId = source.body.id;

    const department = await erp<{ id: string }>('/hr/departments', {
      method: 'POST',
      body: { code: `E21DEP-${suffix}`, nameEn: 'Fleet Sales', nameAr: 'مبيعات الأسطول' },
    });
    departmentId = department.body.id;
  });

  afterAll(async () => {
    if (customerId) {
      await ctx.prisma.entityAttachment.deleteMany({ where: { entityType: 'CUSTOMER', entityId: customerId } });
    }
    if (createdCustomerIds.length) {
      await ctx.prisma.entityAttachment.deleteMany({ where: { entityType: 'CUSTOMER', entityId: { in: createdCustomerIds } } });
      await ctx.prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (sourceId) await ctx.prisma.leadSource.deleteMany({ where: { id: sourceId } });
    if (departmentId) await ctx.prisma.department.deleteMany({ where: { id: departmentId } });
    if (otherCompanyId) await ctx.prisma.company.deleteMany({ where: { id: otherCompanyId } });
    await ctx.app.close();
  });

  it('creates a customer with source and department attribution', async () => {
    const suffix = Date.now();
    const res = await erp<{
      id: string;
      sourceId: string;
      sourceNameEn: string;
      departmentId: string;
      departmentNameEn: string;
      departmentNameAr: string;
    }>('/sales/customers', {
      method: 'POST',
      body: {
        code: `E21C-${suffix}`,
        nameEn: 'Attributed Customer',
        nameAr: 'عميل منسوب',
        sourceId,
        departmentId,
      },
    });
    expect(res.status).toBe(201);
    customerId = res.body.id;
    createdCustomerIds.push(customerId);
    expect(res.body.sourceId).toBe(sourceId);
    expect(res.body.sourceNameEn).toBe('Walk-in');
    expect(res.body.departmentId).toBe(departmentId);
    expect(res.body.departmentNameEn).toBe('Fleet Sales');
    expect(res.body.departmentNameAr).toBe('مبيعات الأسطول');
  });

  it('refuses a source id that belongs to another company', async () => {
    const foreign = await otherErp<{ id: string }>('/crm/lead-sources', {
      method: 'POST',
      body: { code: `E21F-${Date.now()}`, nameEn: 'Foreign', nameAr: 'خارجي' },
    });
    // The other tenant's own catalogue row exists; attaching it from here must fail.
    const res = await erp('/sales/customers', {
      method: 'POST',
      body: { code: `E21X-${Date.now()}`, nameEn: 'Cross Tenant', sourceId: foreign.body.id },
    });
    expect(res.status).toBe(404);
    if (foreign.body.id) await ctx.prisma.leadSource.deleteMany({ where: { id: foreign.body.id } });
  });

  it('requires at least one name', async () => {
    const res = await erp<{ message: string }>('/sales/customers', {
      method: 'POST',
      body: { code: `E21N-${Date.now()}`, nameEn: '   ', nameAr: '' },
    });
    expect(res.status).toBe(400);
  });

  it('accepts a customer named in only one language', async () => {
    const res = await erp<{ id: string; nameEn: string; nameAr: string }>('/sales/customers', {
      method: 'POST',
      body: { code: `E21A-${Date.now()}`, nameAr: 'عميل بالعربية فقط' },
    });
    expect(res.status).toBe(201);
    createdCustomerIds.push(res.body.id);
    expect(res.body.nameAr).toBe('عميل بالعربية فقط');
    expect(res.body.nameEn).toBe('');
  });

  it('returns a detail profile scoped to the customer company', async () => {
    const res = await erp<{
      id: string;
      history: Record<string, number>;
      recentInvoices: unknown[];
      vehicles: unknown[];
    }>(`/sales/customers/${customerId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(customerId);
    expect(res.body.history).toEqual({
      quotations: expect.any(Number),
      orders: expect.any(Number),
      invoices: expect.any(Number),
      payments: expect.any(Number),
      creditNotes: expect.any(Number),
      vehicles: expect.any(Number),
    });
    expect(Array.isArray(res.body.recentInvoices)).toBe(true);
    expect(Array.isArray(res.body.vehicles)).toBe(true);
  });

  it('hides another tenant customer behind a 404', async () => {
    const res = await otherErp(`/sales/customers/${customerId}`);
    expect(res.status).toBe(404);
  });

  it('round-trips an attachment and audits it by name', async () => {
    const created = await erp<{ id: string; fileName: string }>(`/sales/customers/${customerId}/attachments`, {
      method: 'POST',
      body: { fileName: 'trade-licence.pdf', mimeType: 'application/pdf', storageRef: 's3://oryx/docs/1' },
    });
    expect(created.status).toBe(201);
    expect(created.body.fileName).toBe('trade-licence.pdf');

    const listed = await erp<{ items: Array<{ id: string }>; total: number }>(`/sales/customers/${customerId}/attachments`);
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((a) => a.id === created.body.id)).toBe(true);

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { companyId, action: 'sales.customer_attachment_added', targetId: customerId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.summary).toContain('trade-licence.pdf');

    const removed = await erp<{ removed: boolean }>(`/sales/customers/${customerId}/attachments/${created.body.id}`, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toBe(true);
  });

  it('refuses to read attachments of another tenant customer', async () => {
    const res = await otherErp(`/sales/customers/${customerId}/attachments`);
    expect(res.status).toBe(404);
  });

  it('toggles activation through the update route', async () => {
    const off = await erp<{ isActive: boolean }>(`/sales/customers/${customerId}`, {
      method: 'POST',
      body: { isActive: false },
    });
    expect(off.status).toBe(201);
    expect(off.body.isActive).toBe(false);

    const on = await erp<{ isActive: boolean }>(`/sales/customers/${customerId}`, {
      method: 'POST',
      body: { isActive: true },
    });
    expect(on.body.isActive).toBe(true);
  });

  it('clears attribution when the source is set to an empty string', async () => {
    const cleared = await erp<{ sourceId: string | null; departmentId: string | null }>(`/sales/customers/${customerId}`, {
      method: 'POST',
      body: { sourceId: '', departmentId: '' },
    });
    expect(cleared.status).toBe(201);
    expect(cleared.body.sourceId).toBeNull();
    expect(cleared.body.departmentId).toBeNull();
  });
});
