import { describe, expect, it } from 'vitest';
import {
  canAccessBranch,
  canAccessCompany,
  checkLimit,
  delegablePermissionsFor,
  resolveEffectivePermissions,
  validateDelegation,
  type Principal,
} from '../src/authorization';
import { DELEGABLE_PERMISSION_CODES, PERMISSION_CODES, PLATFORM_SUPER_ADMIN_PERMISSION_CODES, isKnownPermission, reconcilePermissions } from '../src/permissions';
import { AVAILABLE_MODULE_KEYS, MODULE_KEYS, isKnownModule } from '../src/modules';

/**
 * Authorization regression suite.
 *
 * These are the invariants the whole platform depends on. They run without a
 * database so they can execute on every commit.
 */

const LICENSED = ['dashboard', 'company_management', 'branch_management', 'users_permissions', 'settings'];

describe('permission catalog integrity', () => {
  it('exposes unique, well-formed codes', () => {
    const seen = new Set<string>();
    for (const code of PERMISSION_CODES) {
      expect(code).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
    expect(isKnownPermission('company.branch.create')).toBe(true);
    expect(isKnownPermission('company.branch.teleport')).toBe(false);
  });

  it('never marks a platform permission as delegable', () => {
    for (const code of DELEGABLE_PERMISSION_CODES) {
      expect(code.startsWith('platform.')).toBe(false);
    }
  });

  it('knows every module in the catalog', () => {
    for (const key of MODULE_KEYS) {
      expect(isKnownModule(key)).toBe(true);
    }
    expect(AVAILABLE_MODULE_KEYS).toContain('company_management');
    expect(AVAILABLE_MODULE_KEYS).toContain('branch_management');
    expect(AVAILABLE_MODULE_KEYS).toContain('users_permissions');
  });
});

/**
 * The platform Super Admin role is defined once in the catalogue and synced
 * two-directionally. These tests pin the behaviour that a drifted production
 * role depends on: an upsert-only sync reported success while leaving the role
 * broken, and the dashboard then failed with
 * `Missing any of the required permissions: erp.dashboard.read,
 * platform.company.read`.
 */
describe('platform super admin permission reconciliation', () => {
  it('grants the whole catalogue to the platform super admin role', () => {
    expect(PLATFORM_SUPER_ADMIN_PERMISSION_CODES).toEqual(PERMISSION_CODES);
  });

  it('exposes the two dashboard requirements in the catalogue', () => {
    // The dashboard guard is satisfied by either code; a repair that produced
    // neither is the exact production failure this suite guards against.
    expect(PERMISSION_CODES).toContain('erp.dashboard.read');
    expect(PERMISSION_CODES).toContain('platform.company.read');
  });

  it('reports a drifted role as needing the missing codes', () => {
    const drifted = ['platform.company.read', 'platform.audit.read'];
    const result = reconcilePermissions(drifted);
    expect(result.inSync).toBe(false);
    expect(result.grant).toContain('erp.dashboard.read');
    expect(result.grant).not.toContain('platform.company.read');
    expect(result.revoke).toEqual([]);
  });

  it('revokes a code the catalogue no longer defines', () => {
    const stale = ['platform.company.read', 'platform.legacy.removed'];
    const result = reconcilePermissions(stale);
    expect(result.revoke).toEqual(['platform.legacy.removed']);
    expect(result.inSync).toBe(false);
  });

  it('is a no-op when the role already holds the catalogue', () => {
    const result = reconcilePermissions(PERMISSION_CODES);
    expect(result.grant).toEqual([]);
    expect(result.revoke).toEqual([]);
    expect(result.inSync).toBe(true);
  });

  it('is idempotent: reconciling a reconciled set changes nothing', () => {
    const once = reconcilePermissions([]);
    const twice = reconcilePermissions(once.grant);
    expect(twice.grant).toEqual([]);
    expect(twice.revoke).toEqual([]);
    expect(twice.inSync).toBe(true);
  });

  it('never revokes a code it also grants', () => {
    const result = reconcilePermissions(['company.read', 'platform.legacy.removed']);
    const overlap = result.grant.filter((c) => result.revoke.includes(c));
    expect(overlap).toEqual([]);
  });
});

describe('effective permission resolution', () => {
  it('grants a platform principal only platform-scope permissions', () => {
    const principal: Principal = {
      kind: 'PLATFORM',
      userId: 'u1',
      grantedPermissions: ['platform.company.create', 'company.read', 'erp.dashboard.read'],
    };
    const result = resolveEffectivePermissions(principal);
    expect(result.permissions).toEqual(['platform.company.create']);
  });

  it('grants a platform principal the company-scope permissions of its tenant context', () => {
    const principal: Principal = {
      kind: 'PLATFORM',
      userId: 'u1',
      grantedPermissions: ['platform.company.create', 'company.read', 'erp.dashboard.read'],
      company: {
        companyId: 'c1',
        licensedModuleKeys: ['dashboard'],
        branchIds: [],
        membershipActive: true,
      },
    };
    const result = resolveEffectivePermissions(principal);
    expect(result.permissions).toContain('platform.company.create');
    expect(result.permissions).toContain('company.read');
    expect(result.permissions).toContain('erp.dashboard.read');
  });

  it('still suppresses unlicensed modules for a platform principal in tenant context', () => {
    const principal: Principal = {
      kind: 'PLATFORM',
      userId: 'u1',
      grantedPermissions: ['erp.accounting.read', 'erp.hr.read', 'erp.dashboard.read'],
      company: {
        companyId: 'c1',
        licensedModuleKeys: ['dashboard'],
        branchIds: [],
        membershipActive: true,
      },
    };
    const result = resolveEffectivePermissions(principal);
    expect(result.permissions).toContain('erp.dashboard.read');
    expect(result.permissions).not.toContain('erp.accounting.read');
    expect(result.suppressedByEntitlement).toContain('erp.accounting.read');
  });

  it('does not widen a platform principal to company permissions without an active membership', () => {
    const principal: Principal = {
      kind: 'PLATFORM',
      userId: 'u1',
      grantedPermissions: ['platform.company.create', 'company.read'],
      company: {
        companyId: 'c1',
        licensedModuleKeys: ['dashboard'],
        branchIds: [],
        membershipActive: false,
      },
    };
    const result = resolveEffectivePermissions(principal);
    expect(result.permissions).toEqual(['platform.company.create']);
  });

  it('suppresses permissions for modules the plan does not license', () => {
    const principal: Principal = {
      kind: 'COMPANY',
      userId: 'u1',
      grantedPermissions: ['company.read', 'erp.dashboard.read', 'erp.accounting.read', 'erp.hr.read'],
      company: {
        companyId: 'c1',
        licensedModuleKeys: LICENSED,
        branchIds: [],
        membershipActive: true,
      },
    };
    const result = resolveEffectivePermissions(principal);
    expect(result.permissions).toContain('erp.dashboard.read');
    expect(result.permissions).not.toContain('erp.accounting.read');
    expect(result.permissions).not.toContain('erp.hr.read');
    expect(result.suppressedByEntitlement).toEqual(['erp.accounting.read', 'erp.hr.read']);
  });

  it('grants nothing when the membership is inactive', () => {
    const principal: Principal = {
      kind: 'COMPANY',
      userId: 'u1',
      grantedPermissions: ['company.read', 'erp.dashboard.read'],
      company: { companyId: 'c1', licensedModuleKeys: LICENSED, branchIds: [], membershipActive: false },
    };
    expect(resolveEffectivePermissions(principal).permissions).toEqual([]);
  });

  it('re-activates suppressed permissions once the module is licensed', () => {
    const base = {
      kind: 'COMPANY' as const,
      userId: 'u1',
      grantedPermissions: ['erp.accounting.read'],
    };
    const before = resolveEffectivePermissions({
      ...base,
      company: { companyId: 'c1', licensedModuleKeys: LICENSED, branchIds: [], membershipActive: true },
    });
    expect(before.permissions).toEqual([]);

    const after = resolveEffectivePermissions({
      ...base,
      company: {
        companyId: 'c1',
        licensedModuleKeys: [...LICENSED, 'financial_accounting'],
        branchIds: [],
        membershipActive: true,
      },
    });
    expect(after.permissions).toEqual(['erp.accounting.read']);
  });
});

describe('delegation guardrails (privilege escalation)', () => {
  it('rejects granting a permission the actor does not hold', () => {
    const result = validateDelegation({
      actorPermissions: ['company.read', 'company.branch.read'],
      requestedPermissions: ['company.user.invite'],
      licensedModuleKeys: LICENSED,
    });
    expect(result.ok).toBe(false);
    expect(result.rejected[0]).toEqual({ code: 'company.user.invite', reason: 'exceeds_actor_permissions' });
  });

  it('rejects granting a platform permission from a tenant role', () => {
    const result = validateDelegation({
      actorPermissions: ['company.read'],
      requestedPermissions: ['platform.plan.manage'],
      licensedModuleKeys: LICENSED,
    });
    expect(result.ok).toBe(false);
    expect(result.rejected[0].reason).toBe('platform_permission_not_delegable');
  });

  it('rejects unknown permission codes', () => {
    const result = validateDelegation({
      actorPermissions: ['company.read'],
      requestedPermissions: ['company.nonexistent'],
      licensedModuleKeys: LICENSED,
    });
    expect(result.ok).toBe(false);
    expect(result.rejected[0].reason).toBe('unknown_permission');
  });

  it('accepts an unlicensed-module permission but it stays inert', () => {
    // A role template may reference ERP permissions the current plan does not
    // cover; they grant no effective privilege and activate on plan upgrade.
    const result = validateDelegation({
      actorPermissions: ['erp.accounting.read', 'company.read'],
      requestedPermissions: ['erp.accounting.read'],
      licensedModuleKeys: LICENSED,
    });
    expect(result.ok).toBe(true);
    expect(result.granted).toEqual(['erp.accounting.read']);

    const effective = resolveEffectivePermissions({
      kind: 'COMPANY',
      userId: 'u1',
      grantedPermissions: result.granted,
      company: { companyId: 'c1', licensedModuleKeys: LICENSED, branchIds: [], membershipActive: true },
    });
    expect(effective.permissions).toEqual([]);
    expect(effective.suppressedByEntitlement).toEqual(['erp.accounting.read']);
  });

  it('a company admin cannot delegate beyond its own permission set', () => {
    const adminPermissions = DELEGABLE_PERMISSION_CODES.filter((c) => !c.startsWith('platform.'));
    const delegable = delegablePermissionsFor(adminPermissions, LICENSED);

    const subset = validateDelegation({
      actorPermissions: adminPermissions,
      requestedPermissions: delegable.slice(0, 5),
      licensedModuleKeys: LICENSED,
    });
    expect(subset.ok).toBe(true);

    const escalation = validateDelegation({
      actorPermissions: ['company.read'],
      requestedPermissions: ['company.user.invite', 'company.role.create'],
      licensedModuleKeys: LICENSED,
    });
    expect(escalation.ok).toBe(false);
    expect(escalation.rejected).toHaveLength(2);
  });

  it('offers only held + licensed permissions in a delegation UI', () => {
    const offered = delegablePermissionsFor(['company.branch.read', 'company.read', 'erp.accounting.read'], LICENSED);
    // Held, licensed and delegable.
    expect(offered).toContain('company.branch.read');
    expect(offered).toContain('company.read');
    // Held but the module is not licensed — never offered.
    expect(offered).not.toContain('erp.accounting.read');
    // Platform permissions are never offered.
    expect(offered.some((p) => p.startsWith('platform.'))).toBe(false);
  });

  it('lets a platform administrator grant any company permission', () => {
    const result = validateDelegation({
      actorPermissions: [],
      requestedPermissions: ['company.user.invite', 'erp.hr.write'],
      licensedModuleKeys: LICENSED,
      actorIsPlatform: true,
    });
    expect(result.ok).toBe(true);
    expect(result.granted).toHaveLength(2);
  });
});

describe('tenant and branch isolation', () => {
  it('rejects cross-company access', () => {
    const principal: Principal = {
      kind: 'COMPANY',
      userId: 'u1',
      grantedPermissions: ['company.read'],
      company: { companyId: 'c1', licensedModuleKeys: LICENSED, branchIds: [], membershipActive: true },
    };
    expect(canAccessCompany(principal, 'c1').ok).toBe(true);
    expect(canAccessCompany(principal, 'c2')).toEqual({ ok: false, reason: 'cross_tenant_access' });
  });

  it('rejects a branch belonging to another company', () => {
    const check = canAccessBranch([], 'c1', { id: 'b1', companyId: 'c2' });
    expect(check).toEqual({ ok: false, reason: 'cross_company_branch' });
  });

  it('enforces an explicit branch assignment', () => {
    expect(canAccessBranch(['b1', 'b2'], 'c1', { id: 'b1', companyId: 'c1' }).ok).toBe(true);
    expect(canAccessBranch(['b1'], 'c1', { id: 'b9', companyId: 'c1' })).toEqual({
      ok: false,
      reason: 'branch_out_of_scope',
    });
  });

  it('treats an empty branch list as company-wide access', () => {
    expect(canAccessBranch([], 'c1', { id: 'anything', companyId: 'c1' }).ok).toBe(true);
  });

  it('confines a platform support session to its target company', () => {
    const principal: Principal = { kind: 'PLATFORM', userId: 'p1', grantedPermissions: [] };
    expect(canAccessCompany(principal, 'c1', { supportSessionCompanyId: 'c1' }).ok).toBe(true);
    expect(canAccessCompany(principal, 'c2', { supportSessionCompanyId: 'c1' })).toEqual({
      ok: false,
      reason: 'support_session_scope',
    });
  });
});

describe('plan limit enforcement', () => {
  const limits = {
    maxCompanies: 1,
    maxBranches: 2,
    maxUsers: 10,
    storageMb: 1024,
    apiRequestsPerMonth: 10000,
  };

  it('allows a create below the limit', () => {
    expect(checkLimit(limits, 'maxBranches', 0, 1).ok).toBe(true);
    expect(checkLimit(limits, 'maxBranches', 1, 1).ok).toBe(true);
  });

  it('blocks a create that would exceed the limit', () => {
    const result = checkLimit(limits, 'maxBranches', 2, 1);
    expect(result.ok).toBe(false);
    expect(result.exceeded).toBe('maxBranches');
    expect(result.limit).toBe(2);
  });

  it('treats -1 as unlimited', () => {
    expect(checkLimit({ ...limits, maxUsers: -1 }, 'maxUsers', 10_000, 1).ok).toBe(true);
  });
});
