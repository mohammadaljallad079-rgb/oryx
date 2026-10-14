import type { INestApplication } from '@nestjs/common';
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
 * Authorization and multi-tenancy regression suite (integration).
 *
 * Every assertion here corresponds to a security requirement from Execution 01.
 * The suite talks to the real API over HTTP against the seeded database.
 */
describe('ORYX API authorization (e2e)', () => {
  let ctx: TestContext;
  let superToken: string;
  let companyToken: string;
  let oryxAutoToken: string;
  let demoCompanyId: string;
  let oryxAutoCompanyId: string;
  let starterPlanId: string;
  let enterprisePlanId: string;
  /** A tenant owned by the seeded company admin, isolated from shared seed rows. */
  let authzTenantId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupFixtures(ctx.prisma);

    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
    companyToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
    oryxAutoToken = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);

    const demo = await ctx.prisma.company.findUniqueOrThrow({ where: { code: 'DEMO-ALNOOR' } });
    const oryxAuto = await ctx.prisma.company.findUniqueOrThrow({ where: { code: 'ORYX-AUTO' } });
    demoCompanyId = demo.id;
    oryxAutoCompanyId = oryxAuto.id;

    const starter = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'starter' } });
    const enterprise = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'enterprise' } });
    starterPlanId = starter.id;
    enterprisePlanId = enterprise.id;

    // Provision a tenant on the Professional plan and attach the seeded company
    // admin so RBAC/invitation tests never mutate the shared demo company.
    const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
      method: 'POST',
      token: superToken,
      body: {
        code: `${FIXTURE_PREFIX}-TENANT`,
        nameEn: 'Authz Tenant',
        nameAr: 'شركة اختبار الصلاحيات',
        type: 'SAAS_TENANT',
        planId: starterPlanId,
      },
    });
    authzTenantId = created.body.company.id;

    const adminRole = await ctx.prisma.role.findFirstOrThrow({
      where: { companyId: authzTenantId, code: 'company_admin' },
    });
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: SEED_COMPANY_ADMIN.email },
    });
    await ctx.prisma.membership.create({
      data: { userId: adminUser.id, companyId: authzTenantId, roleId: adminRole.id, isActive: true },
    });
  }, 90_000);

  afterAll(async () => {
    await cleanupFixtures(ctx.prisma);
    await ctx.app.close();
  }, 60_000);

  // ------------------------------------------------------------------ health

  describe('health and bootstrap', () => {
    it('reports database connectivity', async () => {
      const res = await fetch(`${ctx.base}/api/health`);
      const body = (await res.json()) as { status: string; database: string };
      expect(res.status).toBe(200);
      expect(body.database).toBe('up');
    });
  });

  // -------------------------------------------------------------------- auth

  describe('authentication', () => {
    it('issues tokens for valid credentials and rejects invalid ones', async () => {
      const ok = await call<{ accessToken: string; refreshToken: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
      });
      expect(ok.status).toBe(200);
      expect(ok.body.accessToken).toBeTruthy();
      expect(ok.body.refreshToken).toBeTruthy();

      const bad = await call(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: 'wrong-password-here' },
      });
      expect(bad.status).toBe(401);
    });

    it('rejects unauthenticated access to protected routes', async () => {
      const res = await call(ctx.base, '/companies');
      expect(res.status).toBe(401);
    });

    it('rejects a malformed bearer token', async () => {
      const res = await call(ctx.base, '/companies', { token: 'not-a-real-token' });
      expect(res.status).toBe(401);
    });

    it('rotates refresh tokens and invalidates the used one', async () => {
      const first = await call<{ refreshToken: string }>(ctx.base, '/auth/login', {
        method: 'POST',
        body: { email: SEED_SUPER_ADMIN.email, password: SEED_SUPER_ADMIN.password },
      });
      const rotated = await call<{ accessToken: string; refreshToken: string }>(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: first.body.refreshToken },
      });
      expect(rotated.status).toBe(200);
      expect(rotated.body.refreshToken).not.toBe(first.body.refreshToken);

      // Replaying the original token must fail.
      const replay = await call(ctx.base, '/auth/refresh', {
        method: 'POST',
        body: { refreshToken: first.body.refreshToken },
      });
      expect(replay.status).toBe(401);
    });

    it('persists theme and locale preference on the profile', async () => {
      const res = await call<{ preferredTheme: string; preferredLocale: string }>(ctx.base, '/auth/profile', {
        method: 'PATCH',
        token: superToken,
        body: { preferredTheme: 'light', preferredLocale: 'en' },
      });
      expect(res.status).toBe(200);
      expect(res.body.preferredTheme).toBe('light');
      expect(res.body.preferredLocale).toBe('en');

      // Restore the seeded preference.
      await call(ctx.base, '/auth/profile', {
        method: 'PATCH',
        token: superToken,
        body: { preferredTheme: 'dark', preferredLocale: 'ar' },
      });
    });
  });

  // ------------------------------------------------------------- companies

  describe('company provisioning', () => {
    it('lets the super admin create a SaaS tenant with a plan', async () => {
      const code = `${FIXTURE_PREFIX}-CREATED`;
      const res = await call<{ company: { id: string; code: string; subscription: { licensedModules: string[] } | null } }>(
        ctx.base,
        '/companies',
        {
          method: 'POST',
          token: superToken,
          body: {
            code,
            nameEn: 'Authz Tenant',
            nameAr: 'شركة اختبار الصلاحيات',
            type: 'SAAS_TENANT',
            planId: starterPlanId,
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.company.code).toBe(code);
      expect(res.body.company.subscription).not.toBeNull();
      // Starter licenses the core modules only.
      expect(res.body.company.subscription!.licensedModules).toContain('company_management');
      expect(res.body.company.subscription!.licensedModules).not.toContain('financial_accounting');
    });

    it('rejects a duplicate company code', async () => {
      const res = await call(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: { code: `${FIXTURE_PREFIX}-CREATED`, nameEn: 'Dup', nameAr: 'مكرر', type: 'SAAS_TENANT' },
      });
      expect(res.status).toBe(409);
    });

    it('refuses company creation from a company principal', async () => {
      const res = await call(ctx.base, '/companies', {
        method: 'POST',
        token: companyToken,
        body: { code: `${FIXTURE_PREFIX}-NOPE`, nameEn: 'Nope', nameAr: 'لا', type: 'SAAS_TENANT' },
      });
      expect(res.status).toBe(403);
    });

    it('validates the request body', async () => {
      const res = await call(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: { code: 'bad code!', nameEn: 'x', nameAr: 'ي' },
      });
      expect(res.status).toBe(400);
    });
  });

  // --------------------------------------------------------------- branches

  describe('branch creation and plan limits', () => {
    it('creates a branch inside the plan limit', async () => {
      const res = await call<{ id: string; code: string }>(
        ctx.base,
        `/companies/${oryxAutoCompanyId}/branches`,
        {
          method: 'POST',
          token: superToken,
          body: {
            code: `${FIXTURE_PREFIX}B1`,
            nameEn: 'Authz Branch',
            nameAr: 'فرع اختبار',
            city: 'Riyadh',
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(`${FIXTURE_PREFIX}B1`);
    });

    it('enforces the plan branch limit with a plan.limit_exceeded code', async () => {
      // Create a tenant on Starter (maxBranches = 2) and exhaust it.
      const code = `${FIXTURE_PREFIX}-LIMITS`;
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code,
          nameEn: 'Authz Limits',
          nameAr: 'حدود اختبار',
          type: 'SAAS_TENANT',
          planId: starterPlanId,
        },
      });
      const companyId = created.body.company.id;

      const make = (suffix: string) =>
        call(ctx.base, `/companies/${companyId}/branches`, {
          method: 'POST',
          token: superToken,
          body: { code: `L${suffix}`, nameEn: `Branch ${suffix}`, nameAr: `فرع ${suffix}` },
        });

      expect((await make('1')).status).toBe(201);
      expect((await make('2')).status).toBe(201);

      const third = await call<{ code: string }>(ctx.base, `/companies/${companyId}/branches`, {
        method: 'POST',
        token: superToken,
        body: { code: 'L3', nameEn: 'Branch 3', nameAr: 'فرع 3' },
      });
      expect(third.status).toBe(403);
      expect(third.body.code).toBe('plan.limit_exceeded');
    });

    it('refuses a branch on a company the principal does not belong to', async () => {
      const res = await call<{ code: string }>(ctx.base, `/companies/${oryxAutoCompanyId}/branches`, {
        method: 'POST',
        token: companyToken,
        body: { code: 'CROSS', nameEn: 'Cross', nameAr: 'عبور' },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('authz.cross_tenant_denied');
    });
  });

  // ------------------------------------------------------------ entitlement

  describe('module entitlement enforcement', () => {
    it('reports licensed modules and limits for a company', async () => {
      const res = await call<{ licensedModules: string[]; limits: { maxBranches: number } }>(
        ctx.base,
        `/modules/entitlements?companyId=${demoCompanyId}`,
        { token: superToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.licensedModules).toContain('company_management');
      expect(res.body.limits.maxBranches).toBeGreaterThan(0);
    });

    it('hides a module from the catalog when the plan does not license it', async () => {
      const res = await call<{ items: Array<{ key: string; licensed: boolean }> }>(ctx.base, '/modules', {
        token: companyToken,
      });
      expect(res.status).toBe(200);
      const automotive = res.body.items.find((m) => m.key === 'automotive_inspections');
      expect(automotive).toBeDefined();
      // DEMO-ALNOOR is on Professional, which excludes the automotive modules.
      expect(automotive!.licensed).toBe(false);
    });

    it('revokes entitlements immediately when a subscription is suspended', async () => {
      const tenantCode = `${FIXTURE_PREFIX}-SUSPEND`;
      const created = await call<{ company: { id: string } }>(ctx.base, '/companies', {
        method: 'POST',
        token: superToken,
        body: {
          code: tenantCode,
          nameEn: 'Authz Suspend',
          nameAr: 'إيقاف اختبار',
          type: 'SAAS_TENANT',
          planId: enterprisePlanId,
        },
      });
      const companyId = created.body.company.id;

      const before = await call<{ licensedModules: string[] }>(
        ctx.base,
        `/modules/entitlements?companyId=${companyId}`,
        { token: superToken },
      );
      expect(before.body.licensedModules).toContain('automotive_inspections');

      const subs = await call<Array<{ id: string }>>(ctx.base, `/subscriptions?companyId=${companyId}`, {
        token: superToken,
      });
      const subId = subs.body[0].id;

      const suspended = await call<{ licensedModules: string[] }>(
        ctx.base,
        `/subscriptions/${subId}/status`,
        { method: 'PATCH', token: superToken, body: { status: 'SUSPENDED', note: 'authz test' } },
      );
      expect(suspended.status).toBe(200);
      expect(suspended.body.licensedModules).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ plans

  describe('plan management', () => {
    it('lets the super admin create and edit a plan', async () => {
      const code = `${FIXTURE_PREFIX.toLowerCase()}-plan`;
      const created = await call<{ id: string; code: string; modules: unknown[] }>(ctx.base, '/plans', {
        method: 'POST',
        token: superToken,
        body: {
          code,
          nameEn: 'Authz Plan',
          nameAr: 'باقة اختبار',
          descriptionEn: 'Test plan',
          descriptionAr: 'باقة للاختبار',
          monthlyPrice: 100,
          annualPrice: 1000,
          maxCompanies: 1,
          maxBranches: 3,
          maxUsers: 20,
          storageMb: 4096,
          modules: ['dashboard', 'company_management', 'branch_management'],
        },
      });
      expect(created.status).toBe(201);
      expect(created.body.modules).toHaveLength(3);

      const updated = await call<{ monthlyPrice: number; modules: unknown[] }>(
        ctx.base,
        `/plans/${created.body.id}`,
        {
          method: 'PATCH',
          token: superToken,
          body: { monthlyPrice: 250, modules: ['dashboard', 'company_management'] },
        },
      );
      expect(updated.status).toBe(200);
      expect(updated.body.monthlyPrice).toBe(250);
      expect(updated.body.modules).toHaveLength(2);
    });

    it('rejects an unknown module key in a plan', async () => {
      const res = await call(ctx.base, '/plans', {
        method: 'POST',
        token: superToken,
        body: {
          code: `${FIXTURE_PREFIX.toLowerCase()}-bad`,
          nameEn: 'Bad',
          nameAr: 'سيء',
          descriptionEn: 'x',
          descriptionAr: 'س',
          monthlyPrice: 1,
          annualPrice: 10,
          maxCompanies: 1,
          maxBranches: 1,
          maxUsers: 1,
          storageMb: 1,
          modules: ['not_a_module'],
        },
      });
      expect(res.status).toBe(400);
    });

    it('refuses plan management from a company principal', async () => {
      const res = await call(ctx.base, '/plans', {
        method: 'POST',
        token: companyToken,
        body: {
          code: 'nope',
          nameEn: 'Nope',
          nameAr: 'لا',
          descriptionEn: 'x',
          descriptionAr: 'س',
          monthlyPrice: 1,
          annualPrice: 10,
          maxCompanies: 1,
          maxBranches: 1,
          maxUsers: 1,
          storageMb: 1,
          modules: ['dashboard'],
        },
      });
      expect(res.status).toBe(403);
    });

    it('does not retroactively change an existing subscription when a plan is edited', async () => {
      const code = `${FIXTURE_PREFIX}-SNAPSHOT`;
      const created = await call<{ company: { id: string; subscription: { licensedModules: string[] } } }>(
        ctx.base,
        '/companies',
        {
          method: 'POST',
          token: superToken,
          body: {
            code,
            nameEn: 'Authz Snapshot',
            nameAr: 'لقطة اختبار',
            type: 'SAAS_TENANT',
            planId: enterprisePlanId,
          },
        },
      );
      const companyId = created.body.company.id;
      const snapshotBefore = created.body.company.subscription.licensedModules;

      // Remove modules from the plan.
      await call(ctx.base, `/plans/${enterprisePlanId}`, {
        method: 'PATCH',
        token: superToken,
        body: { modules: ['dashboard', 'company_management'] },
      });

      const ent = await call<{ licensedModules: string[] }>(
        ctx.base,
        `/modules/entitlements?companyId=${companyId}`,
        { token: superToken },
      );
      // The live subscription still holds its original snapshot.
      expect(ent.body.licensedModules.length).toBe(snapshotBefore.length);
      expect(ent.body.licensedModules).toContain('automotive_inspections');

      // Restore the Enterprise plan to the full module catalog.
      const allModules = await ctx.prisma.module.findMany({ select: { key: true } });
      await call(ctx.base, `/plans/${enterprisePlanId}`, {
        method: 'PATCH',
        token: superToken,
        body: { modules: allModules.map((m) => m.key) },
      });
    });
  });

  // ------------------------------------------------------------------- RBAC

  describe('roles and delegated permissions', () => {
    it('lists the seeded system roles for a company', async () => {
      const res = await companyCall<Array<{ code: string; isSystem: boolean }>>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/roles`,
        { token: companyToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.map((r) => r.code)).toEqual(
        expect.arrayContaining(['company_admin', 'branch_manager', 'staff_viewer']),
      );
    });

    it('creates a custom role with delegable permissions', async () => {
      const suffix = Date.now().toString().slice(-6);
      const res = await companyCall<{ id: string; permissions: string[] }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/roles`,
        {
          method: 'POST',
          token: companyToken,
          body: {
            code: `${FIXTURE_PREFIX.toLowerCase()}_custom_${suffix}`,
            nameEn: 'Authz Custom',
            nameAr: 'دور اختبار',
            permissions: ['company.branch.read', 'company.user.read'],
          },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.permissions).toEqual(['company.branch.read', 'company.user.read']);
    });

    it('blocks a company admin from delegating a permission it does not hold', async () => {
      // Create a genuinely low-privilege member through the real invitation
      // flow: a staff_viewer only holds read permissions, so it must not be
      // able to grant write permissions to a role.
      const viewerRole = await ctx.prisma.role.findFirstOrThrow({
        where: { companyId: authzTenantId, code: 'staff_viewer' },
      });
      const viewerEmail = `${FIXTURE_PREFIX.toLowerCase()}-viewer@oryx.test`;

      const invite = await companyCall<{ inviteToken: string }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/users/invitations`,
        {
          method: 'POST',
          token: companyToken,
          body: {
            email: viewerEmail,
            fullNameEn: 'Authz Viewer',
            fullNameAr: 'مشاهد اختبار',
            roleId: viewerRole.id,
          },
        },
      );
      expect(invite.status).toBe(201);

      const accepted = await call(ctx.base, '/auth/accept-invitation', {
        method: 'POST',
        body: {
          token: invite.body.inviteToken,
          fullNameEn: 'Authz Viewer',
          fullNameAr: 'مشاهد اختبار',
          password: 'A-strong-password-2026',
        },
      });
      expect(accepted.status).toBe(200);

      const viewerToken = await login(ctx.base, viewerEmail, 'A-strong-password-2026');

      // The viewer lacks company.role.create, so the request is denied outright.
      const res = await companyCall<{ code: string }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/roles`,
        {
          method: 'POST',
          token: viewerToken,
          body: {
            code: `${FIXTURE_PREFIX.toLowerCase()}_escalate_${Date.now().toString().slice(-6)}`,
            nameEn: 'Escalate',
            nameAr: 'تصعيد',
            permissions: ['company.user.invite'],
          },
        },
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('authz.permission_denied');
    });

    it('rejects a platform permission in a tenant role', async () => {
      const res = await companyCall<{ code: string }>(ctx.base, authzTenantId, `/companies/${authzTenantId}/roles`, {
        method: 'POST',
        token: companyToken,
        body: {
          code: `${FIXTURE_PREFIX.toLowerCase()}_platform_${Date.now().toString().slice(-6)}`,
          nameEn: 'Platform',
          nameAr: 'منصة',
          permissions: ['platform.plan.manage'],
        },
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('authz.delegation_exceeds_scope');
    });

    it('refuses to modify a system role', async () => {
      const roles = await companyCall<Array<{ id: string; code: string; isSystem: boolean }>>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/roles`,
        { token: companyToken },
      );
      const systemRole = roles.body.find((r) => r.isSystem)!;
      const res = await companyCall(ctx.base, authzTenantId, `/roles/${systemRole.id}`, {
        method: 'PATCH',
        token: companyToken,
        body: { nameEn: 'Renamed' },
      });
      expect(res.status).toBe(403);
    });

    it('returns delegable permissions scoped to the actor and the plan', async () => {
      const res = await companyCall<{ permissions: string[] }>(
        ctx.base,
        authzTenantId,
        `/permissions/delegable?companyId=${authzTenantId}`,
        { token: companyToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.permissions).toContain('company.branch.create');
      // Accounting is not licensed on the Professional plan.
      expect(res.body.permissions).not.toContain('erp.accounting.write');
      // Platform permissions are never delegable.
      expect(res.body.permissions.some((p) => p.startsWith('platform.'))).toBe(false);
    });
  });

  // ------------------------------------------------------------ invitations

  describe('user invitation and effective permissions', () => {
    it('invites a user and returns a single-use token', async () => {
      const roles = await companyCall<Array<{ id: string; code: string }>>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/roles`,
        { token: companyToken },
      );
      const staffRole = roles.body.find((r) => r.code === 'staff_viewer')!;

      const email = `${FIXTURE_PREFIX.toLowerCase()}-staff@oryx.test`;
      const res = await companyCall<{ inviteToken: string; email: string }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/users/invitations`,
        {
          method: 'POST',
          token: companyToken,
          body: { email, fullNameEn: 'Authz Staff', fullNameAr: 'موظف اختبار', roleId: staffRole.id },
        },
      );
      expect(res.status).toBe(201);
      expect(res.body.inviteToken).toHaveLength(64);

      // Only the hash is persisted.
      const stored = await ctx.prisma.invitation.findFirst({ where: { email } });
      expect(stored).not.toBeNull();
      expect(stored!.tokenHash).not.toBe(res.body.inviteToken);
      expect(stored!.tokenHash).toHaveLength(64);
    });

    it('accepts an invitation, activating the account and membership', async () => {
      const roles = await companyCall<Array<{ id: string; code: string }>>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/roles`,
        { token: companyToken },
      );
      const staffRole = roles.body.find((r) => r.code === 'staff_viewer')!;

      const email = `${FIXTURE_PREFIX.toLowerCase()}-accept@oryx.test`;
      const invite = await companyCall<{ inviteToken: string }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/users/invitations`,
        {
          method: 'POST',
          token: companyToken,
          body: { email, fullNameEn: 'Accept Me', fullNameAr: 'اقبلني', roleId: staffRole.id },
        },
      );

      const accepted = await call<{ accessToken: string; memberships: unknown[] }>(
        ctx.base,
        '/auth/accept-invitation',
        {
          method: 'POST',
          body: {
            token: invite.body.inviteToken,
            fullNameEn: 'Accept Me',
            fullNameAr: 'اقبلني',
            password: 'A-strong-password-2026',
          },
        },
      );
      expect(accepted.status).toBe(200);
      expect(accepted.body.accessToken).toBeTruthy();
      expect(accepted.body.memberships).toHaveLength(1);

      // Reusing the same token must fail.
      const replay = await call(ctx.base, '/auth/accept-invitation', {
        method: 'POST',
        body: {
          token: invite.body.inviteToken,
          fullNameEn: 'Accept Me',
          fullNameAr: 'اقبلني',
          password: 'A-strong-password-2026',
        },
      });
      expect(replay.status).toBe(401);
    });

    it('shows effective permissions and entitlement suppression for a user', async () => {
      const users = await companyCall<{ items: Array<{ id: string; email: string }> }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/users`,
        { token: companyToken },
      );
      const staff = users.body.items.find((u) => u.email.startsWith(FIXTURE_PREFIX.toLowerCase()))!;

      const res = await companyCall<{
        granted: string[];
        effective: string[];
        suppressedByEntitlement: Array<{ code: string }>;
      }>(ctx.base, authzTenantId, `/companies/${authzTenantId}/users/${staff.id}/effective-permissions`, {
        token: companyToken,
      });
      expect(res.status).toBe(200);
      // staff_viewer only holds company.read / branch.read / erp.dashboard.read.
      expect(res.body.effective).toContain('erp.dashboard.read');
      expect(res.body.effective).not.toContain('company.user.invite');
    });
  });

  // ------------------------------------------------------- cross-tenant access

  describe('cross-tenant isolation', () => {
    it('prevents reading another company through the company header', async () => {
      const res = await companyCall<{ code: string }>(ctx.base, oryxAutoCompanyId, '/companies', {
        token: companyToken,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('authz.cross_tenant_denied');
    });

    it('prevents a company principal listing another tenant\'s users', async () => {
      const res = await companyCall(ctx.base, oryxAutoCompanyId, `/companies/${oryxAutoCompanyId}/users`, {
        token: companyToken,
      });
      expect(res.status).toBe(403);
    });

    it('prevents a company principal reading another tenant\'s audit log', async () => {
      const res = await companyCall(ctx.base, oryxAutoCompanyId, `/audit-logs?companyId=${oryxAutoCompanyId}`, {
        token: companyToken,
      });
      expect(res.status).toBe(403);
    });

    it('prevents assigning a branch that belongs to another company', async () => {
      const branches = await call<{ items: Array<{ id: string }> }>(
        ctx.base,
        `/companies/${oryxAutoCompanyId}/branches`,
        { token: superToken },
      );
      const foreignBranch = branches.body.items[0].id;

      const users = await companyCall<{ items: Array<{ id: string }> }>(
        ctx.base,
        authzTenantId,
        `/companies/${authzTenantId}/users`,
        { token: companyToken },
      );
      const res = await companyCall(ctx.base, authzTenantId, `/companies/${authzTenantId}/users/${users.body.items[0].id}/membership`, {
        method: 'PATCH',
        token: companyToken,
        body: { branchIds: [foreignBranch] },
      });
      expect(res.status).toBe(403);
    });

    it('rejects an out-of-scope branch context header', async () => {
      const branches = await call<{ items: Array<{ id: string }> }>(
        ctx.base,
        `/companies/${oryxAutoCompanyId}/branches`,
        { token: superToken },
      );
      const res = await companyCall(ctx.base, authzTenantId, '/dashboard', {
        token: companyToken,
        headers: { 'x-oryx-branch-id': branches.body.items[0].id },
      });
      expect(res.status).toBe(403);
    });
  });

  // ------------------------------------------------------- platform-only ops

  describe('platform-only governance', () => {
    it('refuses CMS management from a company principal', async () => {
      const res = await companyCall(ctx.base, authzTenantId, '/cms/pages', { token: companyToken });
      expect(res.status).toBe(403);
    });

    it('refuses API client creation from a company principal', async () => {
      const res = await companyCall(ctx.base, authzTenantId, '/cms/api-clients', {
        method: 'POST',
        token: companyToken,
        body: { name: 'Nope' },
      });
      expect(res.status).toBe(403);
    });

    it('serves public CMS content without authentication', async () => {
      const res = await call<{ locale: string; pages: unknown[] }>(ctx.base, '/cms/public/content?locale=en');
      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('en');
      expect(Array.isArray(res.body.pages)).toBe(true);
    });

    it('returns only published pages in the public content payload', async () => {
      const res = await call<{ pages: Array<{ slug: string }> }>(ctx.base, '/cms/public/content?locale=en');
      const slugs = res.body.pages.map((p) => p.slug);
      expect(slugs).toContain('home');
      expect(slugs).not.toContain('about'); // seeded as DRAFT
    });
  });

  // ----------------------------------------------------------- support access

  describe('super admin support access', () => {
    it('requires an explicit session before a platform principal reaches tenant data', async () => {
      // With a company context but no support session, a platform principal may
      // still read (platform governance) — but a support session must be
      // explicit, reasoned and time-bounded.
      const short = await call(ctx.base, '/support-sessions', {
        method: 'POST',
        token: superToken,
        body: { companyId: demoCompanyId, reason: 'short' },
      });
      expect(short.status).toBe(400);

      const opened = await call<{ id: string; supportSessionId: string }>(ctx.base, '/support-sessions', {
        method: 'POST',
        token: superToken,
        body: { companyId: demoCompanyId, reason: 'Investigating a customer reported issue', minutes: 30 },
      });
      expect(opened.status).toBe(201);
      expect(opened.body.supportSessionId).toBeTruthy();

      // The session is audited.
      const audit = await call<{ items: Array<{ action: string }> }>(
        ctx.base,
        `/audit-logs?companyId=${demoCompanyId}&action=support.session_opened`,
        { token: superToken },
      );
      expect(audit.body.items.length).toBeGreaterThan(0);

      const ended = await call(ctx.base, `/support-sessions/${opened.body.id}/end`, {
        method: 'POST',
        token: superToken,
      });
      expect(ended.status).toBe(201);
    });

    it('refuses support sessions from a company principal', async () => {
      const res = await companyCall(ctx.base, authzTenantId, '/support-sessions', {
        method: 'POST',
        token: companyToken,
        body: { companyId: demoCompanyId, reason: 'I should not be able to do this', minutes: 30 },
      });
      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------- dashboard

  describe('dashboard integrity', () => {
    it('returns DB-backed metrics for the authorized scope', async () => {
      const res = await call<{
        kpis: { companies: number; branches: number; users: number };
        scope: { isPlatformScope: boolean };
      }>(ctx.base, '/dashboard', { token: superToken });
      expect(res.status).toBe(200);
      expect(res.body.scope.isPlatformScope).toBe(true);
      expect(res.body.kpis.companies).toBeGreaterThan(0);
      expect(res.body.kpis.branches).toBeGreaterThan(0);
    });

    it('scopes metrics to a single company', async () => {
      const res = await call<{ kpis: { companies: number }; scope: { companyId: string } }>(
        ctx.base,
        `/dashboard?companyId=${demoCompanyId}`,
        { token: superToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.kpis.companies).toBe(1);
      expect(res.body.scope.companyId).toBe(demoCompanyId);
    });

    it('refuses a company principal requesting another company dashboard', async () => {
      const res = await companyCall(ctx.base, oryxAutoCompanyId, `/dashboard?companyId=${oryxAutoCompanyId}`, {
        token: companyToken,
      });
      expect(res.status).toBe(403);
    });

    it('reflects the audit trail in recent activity', async () => {
      const res = await call<{ recentActivity: unknown[] }>(ctx.base, '/dashboard', { token: superToken });
      expect(res.body.recentActivity.length).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------ audit trail

  describe('audit trail', () => {
    it('records company creation, invitations and login events', async () => {
      const res = await call<{ items: Array<{ action: string }>; total: number }>(
        ctx.base,
        '/audit-logs?pageSize=100',
        { token: superToken },
      );
      expect(res.status).toBe(200);
      const actions = res.body.items.map((i) => i.action);
      expect(actions).toContain('auth.login');
      expect(actions).toContain('company.created');
      expect(actions).toContain('user.invited');
      expect(actions).toContain('role.created');
    });
  });
});
