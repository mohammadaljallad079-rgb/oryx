import type { INestApplication } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@oryx/shared';
import {
  SEED_COMPANY_ADMIN,
  SEED_ORYX_AUTO_ADMIN,
  SEED_SUPER_ADMIN,
  call,
  companyCall,
  createTestApp,
  login,
  type TestContext,
} from './test-app';

/**
 * Permission and functional verification suite.
 *
 * Proves, against the live HTTP surface and the seeded database, that:
 *
 *  - a platform Super Admin reaches every implemented module once a tenant is
 *    selected, and reaches nothing tenant-scoped without one;
 *  - a tenant administrator reaches every module its plan licenses, and is
 *    refused every module and every company it does not;
 *  - no tenant principal can exercise a platform-only operation or grant
 *    itself a platform permission.
 *
 * Read paths are exercised through the real guards, so a broken permission
 * code, a missing guard or a mis-scoped query fails here rather than in the UI.
 */

/**
 * Assert with a human-readable label.
 *
 * Jest's typed `expect` takes no message argument, so the label becomes the
 * object key and a failure prints the route alongside the observed status
 * instead of a bare "expected 403, received 200".
 */
function check(actual: unknown, label: string) {
  const key = label;
  const wrap = (value: unknown) => ({ [key]: value });
  return {
    toBe(expected: unknown) {
      expect(wrap(actual)).toEqual(wrap(expected));
    },
    toContain(expected: unknown) {
      expect(wrap(actual)).toEqual(wrap(expect.arrayContaining([expected])));
    },
    toEqual(expected: unknown) {
      expect(wrap(actual)).toEqual(wrap(expected));
    },
    toHaveLength(expected: number) {
      expect(wrap((actual as unknown[]).length)).toEqual(wrap(expected));
    },
    not: {
      toContain(expected: unknown) {
        const present = (actual as unknown[]).includes(expected as never);
        expect(wrap({ present, expected })).toEqual(wrap({ present: false, expected }));
      },
    },
  };
}

describe('ORYX permissions and functional verification (e2e)', () => {
  let ctx: TestContext;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A representative read endpoint per implemented module. */
  const MODULE_PROBE: Record<string, string> = {
    dashboard: '/dashboard',
    company_management: '/companies',
    branch_management: '/companies/:companyId/branches',
    financial_accounting: '/accounting/accounts',
    sales_pos: '/sales/invoices',
    purchasing_procurement: '/purchasing/suppliers',
    warehouses_inventory: '/inventory/warehouses',
    human_resources: '/hr/employees',
    crm: '/crm/leads',
    operations: '/operations/projects',
    automotive_inspections: '/automotive/vehicles',
    automotive_maintenance: '/automotive/job-cards',
    spare_parts: '/automotive/part-references',
    reports_analytics: '/reports/accounting',
    users_permissions: '/companies/:companyId/users',
    subscription_management: '/subscriptions',
    settings: '/companies/:companyId',
    customer_portal: '/customer-platform/summary',
    booking_engine: '/bookings',
    provider_portal: '/marketplace/providers',
    payments: '/payments/intents',
  };

  interface CompanyRef {
    id: string;
    code: string;
    nameEn: string;
  }

  async function contextFor(token: string, companyId?: string) {
    return call<{
      companies: CompanyRef[];
      permissions: string[];
      licensedModules: string[];
      user?: { id: string; kind: string };
    }>(ctx.base, '/auth/context', {
      token,
      headers: companyId ? { 'x-oryx-company-id': companyId } : {},
    });
  }

  const probePath = (moduleKey: string, companyId: string) =>
    MODULE_PROBE[moduleKey].replace(':companyId', companyId);

  describe('Super Admin — platform-wide access', () => {
    it('holds every PLATFORM permission in the catalog', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const context = await contextFor(token);
      expect(context.status).toBe(200);

      // With no tenant context only the PLATFORM-scope codes are effective.
      const platformCodes = PERMISSIONS.filter((p) => p.scope === 'PLATFORM').map((p) => p.code);
      for (const code of platformCodes) {
        check(context.body.permissions, `platform principal must hold ${code}`).toContain(code);
      }
      check(context.body.permissions, 'no tenant permission without a tenant context').not.toContain(
        'erp.accounting.read',
      );
    });

    it('resolves every company-scope permission once a company is selected', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const base = await contextFor(token);
      const company = base.body.companies.find((c) => c.nameEn === 'ORYX Auto Services');
      expect(company).toBeTruthy();

      const scoped = await contextFor(token, company!.id);
      expect(scoped.status).toBe(200);
      check(scoped.body.licensedModules, 'the enterprise tenant licenses every module').toHaveLength(
        MODULES.length,
      );

      const licensed = new Set(scoped.body.licensedModules);
      const expected = PERMISSIONS.filter((p) => !p.moduleKey || licensed.has(p.moduleKey)).map((p) => p.code);
      for (const code of expected) {
        check(scoped.body.permissions, `super admin must hold ${code} in tenant context`).toContain(code);
      }
    });

    it('reaches every implemented module once a company is selected', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const base = await contextFor(token);
      const company = base.body.companies.find((c) => c.nameEn === 'ORYX Auto Services')!;
      const scoped = await contextFor(token, company.id);

      const failures: string[] = [];
      for (const moduleKey of scoped.body.licensedModules) {
        const probe = MODULE_PROBE[moduleKey];
        if (!probe) continue;
        const res = await companyCall(ctx.base, company.id, probePath(moduleKey, company.id), { token });
        if (res.status !== 200) failures.push(`${moduleKey} -> ${res.status}`);
      }
      check(failures, 'super admin must reach every licensed module').toEqual([]);
    });

    it('is refused tenant data when no company context is selected', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      // Endpoints that resolve their tenant from the selected company rather
      // than from the path. Platform governance routes (the dashboard, the
      // company register, a company's branch or user list, a company profile)
      // are deliberately readable platform-wide.
      const tenantScoped = [
        'financial_accounting',
        'sales_pos',
        'purchasing_procurement',
        'warehouses_inventory',
        'human_resources',
        'crm',
        'operations',
        'automotive_inspections',
        'automotive_maintenance',
        'spare_parts',
        'reports_analytics',
        'customer_portal',
        'booking_engine',
        'payments',
      ];
      for (const moduleKey of tenantScoped) {
        const probe = MODULE_PROBE[moduleKey];
        const res = await call(ctx.base, probe, { token });
        check([401, 403], `${moduleKey} must require a tenant context`).toContain(res.status);
      }
    });

    it('is refused tenant data on a tenant-scoped module without a company', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const res = await call(ctx.base, '/accounting/accounts', { token });
      check(res.status, 'accounting needs a tenant context even for a super admin').toBe(403);
      // Without a tenant the company-scope permission is not effective, so the
      // permission guard refuses before the tenant boundary is reached.
      check(
        ['authz.permission_denied', 'authz.cross_tenant_denied'],
        'missing-tenant refusal code',
      ).toContain((res.body as { code?: string }).code);
    });

    it('reads the platform governance surfaces', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      for (const path of [
        '/plans',
        '/modules',
        '/subscriptions',
        '/audit-logs',
        '/support-sessions',
        '/permissions/catalog',
      ]) {
        const res = await call(ctx.base, path, { token });
        check(res.status, `${path} should be readable by the super admin`).toBe(200);
      }
    });
  });

  describe('Tenant Admin — company-scoped access', () => {
    it('reaches every module its plan licenses and no other', async () => {
      const token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
      const base = await contextFor(token);
      const company = base.body.companies.find((c) => c.nameEn === 'ORYX Auto Services')!;
      const scoped = await contextFor(token, company.id);
      const licensed = new Set(scoped.body.licensedModules);

      const failures: string[] = [];
      for (const moduleKey of Object.keys(MODULE_PROBE)) {
        if (moduleKey === 'company_management') continue; // covered by /companies
        const res = await companyCall(ctx.base, company.id, probePath(moduleKey, company.id), { token });
        const shouldPass = licensed.has(moduleKey);
        if (shouldPass && res.status !== 200) failures.push(`${moduleKey} should pass, got ${res.status}`);
        if (!shouldPass && res.status === 200) failures.push(`${moduleKey} should be refused, got 200`);
      }
      check(failures, 'tenant access must follow plan entitlements').toEqual([]);
    });

    it('is refused a module the plan does not license', async () => {
      // The Professional demo tenant does not license the automotive modules.
      const token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
      const base = await contextFor(token);
      const company = base.body.companies.find((c) => c.nameEn === 'Al Noor Trading (Demo)')!;
      const scoped = await contextFor(token, company.id);
      check(scoped.body.licensedModules, 'professional tenant must not license automotive').not.toContain(
        'automotive_inspections',
      );

      const res = await companyCall(ctx.base, company.id, '/automotive/vehicles', { token });
      check(res.status, 'unlicensed module must be refused').toBe(403);
      // PermissionsGuard runs before ModuleEntitlementGuard, so an unlicensed
      // module surfaces as a permission denial once entitlement suppression has
      // removed the permission. Either code is a correct refusal.
      check(
        ['authz.permission_denied', 'authz.module_not_licensed'],
        'unlicensed module refusal code',
      ).toContain((res.body as { code?: string }).code);
    });

    it('cannot reach another tenant', async () => {
      // A tenant context lists only its own company, so the target is resolved
      // through the platform principal.
      const platformToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const platform = await contextFor(platformToken);
      const other = platform.body.companies.find((c) => c.nameEn === 'ORYX Auto Services')!;

      const token = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
      for (const path of ['/accounting/accounts', '/sales/invoices', '/hr/employees', '/crm/leads']) {
        const res = await companyCall(ctx.base, other.id, path, { token });
        check(res.status, `${path} must refuse cross-tenant access`).toBe(403);
        check((res.body as { code?: string }).code, `${path} cross-tenant error code`).toBe(
          'authz.cross_tenant_denied',
        );
      }
    });

    it('cannot read or act on another company profile', async () => {
      const platformToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const platform = await contextFor(platformToken);
      const other = platform.body.companies.find((c) => c.nameEn === 'Al Noor Trading (Demo)')!;

      const token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
      const res = await call(ctx.base, `/companies/${other.id}`, { token });
      check(res.status, 'another company profile must be refused').toBe(403);
    });

    it('cannot exercise a platform-only operation', async () => {
      const token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
      const base = await contextFor(token);
      const company = base.body.companies.find((c) => c.nameEn === 'ORYX Auto Services')!;

      const cases: Array<{ method: 'POST'; path: string; body?: unknown }> = [
        {
          method: 'POST',
          path: '/plans',
          body: { code: 'esc', nameEn: 'Esc', nameAr: 'فحص', priceMinor: 1, currency: 'BHD', modules: [] },
        },
        { method: 'POST', path: '/companies', body: { code: 'ESC', nameEn: 'Esc', nameAr: 'فحص', kind: 'SAAS' } },
        {
          method: 'POST',
          path: '/support-sessions',
          body: { companyId: company.id, reason: 'probe', minutes: 5 },
        },
      ];
      for (const c of cases) {
        const res = await companyCall(ctx.base, company.id, c.path, {
          method: c.method,
          token,
          body: c.body,
        });
        check(res.status, `${c.method} ${c.path} must be platform-only`).toBe(403);
      }
    });

    it('cannot grant itself a platform permission through a role', async () => {
      const token = await login(ctx.base, SEED_ORYX_AUTO_ADMIN.email, SEED_ORYX_AUTO_ADMIN.password);
      const base = await contextFor(token);
      const company = base.body.companies.find((c) => c.nameEn === 'ORYX Auto Services')!;

      const res = await companyCall(ctx.base, company.id, `/companies/${company.id}/roles`, {
        method: 'POST',
        token,
        body: {
          code: `esc_probe_${Date.now()}`,
          nameEn: 'Escalation Probe',
          nameAr: 'فحص',
          permissions: ['platform.company.create', 'platform.user.manage'],
        },
      });
      check(res.status, 'platform permissions must not be delegable').toBe(403);
      check((res.body as { code?: string }).code, 'delegation error code').toBe(
        'authz.delegation_exceeds_scope',
      );
    });

    it('only ever lists its own company', async () => {
      for (const credentials of [SEED_COMPANY_ADMIN, SEED_ORYX_AUTO_ADMIN]) {
        const token = await login(ctx.base, credentials.email, credentials.password);
        const res = await call<{ items?: Array<{ code: string }> }>(ctx.base, '/companies?pageSize=100', {
          token,
        });
        expect(res.status).toBe(200);
        const codes = (res.body.items ?? []).map((c) => c.code);
        check(codes.length, `${credentials.email} sees exactly one company`).toBe(1);
        check(codes.some((c) => c.startsWith('E2E')), `${credentials.email} sees no fixture tenant`).toBe(
          false,
        );
      }
    });

    it('only ever reads its own audit trail', async () => {
      for (const credentials of [SEED_COMPANY_ADMIN, SEED_ORYX_AUTO_ADMIN]) {
        const token = await login(ctx.base, credentials.email, credentials.password);
        const base = await contextFor(token);
        const company = base.body.companies[0];
        const res = await call<{ items?: Array<{ companyId: string | null }> }>(
          ctx.base,
          '/audit-logs?pageSize=100',
          { token },
        );
        expect(res.status).toBe(200);
        for (const entry of res.body.items ?? []) {
          check(entry.companyId, `${credentials.email} audit entry scope`).toBe(company.id);
        }
      }
    });
  });

  describe('module catalog integrity', () => {
    it('ships every catalog module as AVAILABLE with a real route', async () => {
      const token = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);
      const res = await call<{ items?: Array<{ key: string; status: string }> }>(ctx.base, '/modules', {
        token,
      });
      expect(res.status).toBe(200);
      const items = res.body.items ?? [];
      check(items.length, 'module catalog size').toBe(MODULES.length);
      check(
        items.filter((m) => m.status !== 'AVAILABLE'),
        'no module may be scaffolded or planned',
      ).toEqual([]);
    });

    it('maps every module to a probed read endpoint', async () => {
      const unmapped = MODULES.map((m) => m.key).filter((k) => !MODULE_PROBE[k]);
      check(unmapped, 'every module needs a read probe').toEqual([]);
    });
  });
});
