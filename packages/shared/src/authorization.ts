/**
 * ORYX authorization engine.
 *
 * These functions are pure and dependency-free so they can be unit tested in
 * isolation and reused identically by the API and the admin UI. The API is the
 * authority: the UI only uses these helpers to avoid rendering controls the
 * backend would reject.
 *
 * Invariants enforced here:
 *  1. Platform permissions require a platform principal.
 *  2. Company/branch permissions require an active company membership.
 *  3. A permission attached to an ERP module is only effective when the
 *     company's active subscription licenses that module.
 *  4. A company administrator can only delegate permissions that are marked
 *     delegable, that the administrator itself holds, and whose module is
 *     licensed to the company. Privilege escalation is therefore impossible.
 */

import { DELEGABLE_PERMISSION_CODES, PERMISSION_BY_CODE, type PermissionScope } from './permissions';
import { MODULE_BY_KEY } from './modules';

export type PrincipalKind = 'PLATFORM' | 'COMPANY';

export interface CompanyScope {
  companyId: string;
  /** Modules licensed by the company's active subscription. */
  licensedModuleKeys: readonly string[];
  /** Branch ids the principal may act on. Empty array = all branches in company. */
  branchIds: readonly string[];
  membershipActive: boolean;
}

export interface Principal {
  kind: PrincipalKind;
  userId: string;
  /** Permission codes granted through roles. */
  grantedPermissions: readonly string[];
  /** Platform principals have no company scope. */
  company?: CompanyScope;
}

export interface EffectivePermissions {
  permissions: string[];
  /** Permissions granted by role but suppressed because the module is unlicensed. */
  suppressedByEntitlement: string[];
  /** Branch ids the principal may act on; empty = company-wide. */
  branchIds: string[];
}

function moduleLicensed(permissionCode: string, licensed: ReadonlySet<string>): boolean {
  const def = PERMISSION_BY_CODE.get(permissionCode);
  if (!def || !def.moduleKey) return true;
  return licensed.has(def.moduleKey);
}

/**
 * Compute the effective permission set for a principal.
 * This is the ONLY place entitlement gating is applied, so API guards and UI
 * navigation can never diverge.
 */
export function resolveEffectivePermissions(principal: Principal): EffectivePermissions {
  const granted = new Set(principal.grantedPermissions);
  const out: string[] = [];
  const suppressed: string[] = [];

  if (principal.kind === 'PLATFORM') {
    for (const code of granted) {
      const def = PERMISSION_BY_CODE.get(code);
      if (!def) continue;
      if (def.scope !== 'PLATFORM') continue;
      out.push(code);
    }
    return { permissions: out.sort(), suppressedByEntitlement: [], branchIds: [] };
  }

  const company = principal.company;
  if (!company || !company.membershipActive) {
    return { permissions: [], suppressedByEntitlement: [], branchIds: [] };
  }

  const licensed = new Set(company.licensedModuleKeys);

  for (const code of granted) {
    const def = PERMISSION_BY_CODE.get(code);
    if (!def) continue;
    if (def.scope === 'PLATFORM') continue;
    if (!moduleLicensed(code, licensed)) {
      suppressed.push(code);
      continue;
    }
    out.push(code);
  }

  return {
    permissions: out.sort(),
    suppressedByEntitlement: suppressed.sort(),
    branchIds: [...company.branchIds],
  };
}

export interface DelegationRequest {
  /** Permissions the delegating administrator currently holds effectively. */
  actorPermissions: readonly string[];
  /** Permissions the administrator wants to grant. */
  requestedPermissions: readonly string[];
  /** Modules licensed to the company. */
  licensedModuleKeys: readonly string[];
  /** When true, the actor is a platform super admin acting on the company. */
  actorIsPlatform?: boolean;
}

export interface DelegationResult {
  ok: boolean;
  granted: string[];
  rejected: Array<{ code: string; reason: string }>;
}

/**
 * Validate a permission delegation. Returns the accepted subset plus explicit
 * rejection reasons. Any rejected entry means the whole request must fail.
 *
 * Note on unlicensed modules: a permission attached to a module the company
 * does not license is *suppressed* rather than rejected. It confers no
 * effective privilege (resolveEffectivePermissions strips it at request time),
 * and accepting it lets a role template widen automatically when the plan is
 * upgraded, instead of blocking the first invitation for a newly provisioned
 * company. Escalation is still impossible: the actor must hold the permission
 * and it must be delegable.
 */
export function validateDelegation(req: DelegationRequest): DelegationResult {
  const actor = new Set(req.actorPermissions);
  const licensed = new Set(req.licensedModuleKeys);
  const granted: string[] = [];
  const rejected: DelegationResult['rejected'] = [];

  for (const code of req.requestedPermissions) {
    const def = PERMISSION_BY_CODE.get(code);
    if (!def) {
      rejected.push({ code, reason: 'unknown_permission' });
      continue;
    }
    if (def.scope === 'PLATFORM') {
      rejected.push({ code, reason: 'platform_permission_not_delegable' });
      continue;
    }
    if (req.actorIsPlatform) {
      granted.push(code);
      continue;
    }
    if (!def.delegable) {
      rejected.push({ code, reason: 'not_delegable' });
      continue;
    }
    if (!actor.has(code)) {
      rejected.push({ code, reason: 'exceeds_actor_permissions' });
      continue;
    }
    // Unlicensed-module permissions are inert at runtime, so they are recorded
    // as granted-without-effect rather than a hard failure.
    if (def.moduleKey && !licensed.has(def.moduleKey)) {
      granted.push(code);
      continue;
    }
    granted.push(code);
  }

  return { ok: rejected.length === 0, granted, rejected };
}

/** Permissions a given actor is allowed to offer in a delegation UI. */
export function delegablePermissionsFor(
  actorPermissions: readonly string[],
  licensedModuleKeys: readonly string[],
): string[] {
  const actor = new Set(actorPermissions);
  const licensed = new Set(licensedModuleKeys);
  return DELEGABLE_PERMISSION_CODES.filter((code) => {
    if (!actor.has(code)) return false;
    const def = PERMISSION_BY_CODE.get(code);
    if (def?.moduleKey && !licensed.has(def.moduleKey)) return false;
    return true;
  }).sort();
}

export interface BranchScopeCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Assert a principal may act on a specific branch. An empty `branchIds` array
 * means company-wide access (all branches of the company).
 */
export function canAccessBranch(
  effectiveBranchIds: readonly string[],
  companyId: string,
  branch: { id: string; companyId: string },
): BranchScopeCheck {
  if (branch.companyId !== companyId) {
    return { ok: false, reason: 'cross_company_branch' };
  }
  if (effectiveBranchIds.length === 0) return { ok: true };
  if (!effectiveBranchIds.includes(branch.id)) {
    return { ok: false, reason: 'branch_out_of_scope' };
  }
  return { ok: true };
}

/** Assert a principal may act on a company. */
export function canAccessCompany(
  principal: Principal,
  targetCompanyId: string,
  opts: { supportSessionCompanyId?: string } = {},
): BranchScopeCheck {
  if (principal.kind === 'PLATFORM') {
    const active = opts.supportSessionCompanyId;
    if (active && active !== targetCompanyId) {
      return { ok: false, reason: 'support_session_scope' };
    }
    return { ok: true };
  }
  if (!principal.company) return { ok: false, reason: 'no_company_scope' };
  if (principal.company.companyId !== targetCompanyId) {
    return { ok: false, reason: 'cross_tenant_access' };
  }
  return { ok: true };
}

/** Plan limit evaluation used by company provisioning and branch/user creation. */
export interface PlanLimits {
  maxCompanies: number;
  maxBranches: number;
  maxUsers: number;
  storageMb: number;
  apiRequestsPerMonth: number;
}

export type LimitName = keyof PlanLimits;

export interface LimitCheck {
  ok: boolean;
  limit: number;
  current: number;
  exceeded?: LimitName;
}

export function checkLimit(limits: PlanLimits, name: LimitName, current: number, delta = 1): LimitCheck {
  const limit = limits[name];
  // 0 is treated as "unlimited" for storage/API style limits is NOT assumed;
  // the platform stores explicit values and -1 means unlimited.
  if (limit === -1) return { ok: true, limit, current };
  const next = current + delta;
  if (next > limit) return { ok: false, limit, current, exceeded: name };
  return { ok: true, limit, current };
}

export const UNLIMITED = -1;

/** Modules a company may actually use, intersected with shipped availability. */
export function entitledModules(licensedModuleKeys: readonly string[]): string[] {
  const licensed = new Set(licensedModuleKeys);
  return [...licensed].filter((key) => MODULE_BY_KEY.has(key)).sort();
}

export function scopeAllowsPlatform(scope: PermissionScope): boolean {
  return scope === 'PLATFORM';
}
