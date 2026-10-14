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
import { DELEGABLE_PERMISSION_CODES, PERMISSION_CODES, isKnownPermission } from '../src/permissions';
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
