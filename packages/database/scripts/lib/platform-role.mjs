/**
 * Platform Super Admin role synchronisation.
 *
 * One implementation, shared by three callers that must never disagree:
 *
 *   prisma/seed.ts                     development / demonstration
 *   scripts/production-init.mjs        first production bootstrap
 *   scripts/repair-platform-rbac.mjs   re-runnable repair of a drifted database
 *
 * Why this exists: the role was previously populated with an upsert-only loop.
 * That adds missing codes but never removes anything, so a database whose role
 * had drifted (or held codes the catalogue has since removed) could not be
 * repaired by re-running the bootstrap — the loop reported success while the
 * role stayed wrong. The dashboard then failed with
 * `Missing any of the required permissions: erp.dashboard.read,
 * platform.company.read`, because it is reachable through *either* code and the
 * drifted role held neither.
 *
 * The sync is two-directional and idempotent: it grants what the catalogue
 * defines and revokes what it does not, so re-running it converges on the
 * correct state no matter what the row contained before.
 *
 * A platform role has `companyId = NULL`. Postgres treats NULL as distinct in a
 * unique index, so `upsert` cannot address it; `findFirst` + `update` is the
 * only idempotent form.
 */

export const PLATFORM_ROLE_CODE = 'platform_super_admin';

const ROLE_PROFILE = {
  code: PLATFORM_ROLE_CODE,
  nameEn: 'Platform Super Admin',
  nameAr: 'مدير المنصة',
  descriptionEn: 'Full platform governance across every company and tenant.',
  isSystem: true,
  isPlatform: true,
};

/**
 * Bring the platform super admin role into sync with the permission catalogue.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 * @param {readonly string[]} [options.expected] permission codes the role must hold
 * @param {boolean} [options.dryRun] compute the diff without writing
 */
export async function syncPlatformSuperAdminRole(prisma, options = {}) {
  const { expected, dryRun = false } = options;

  // Resolve the catalogue from the compiled shared package when the caller does
  // not supply it, so the expected set is always the official one.
  const catalogue = expected ?? (await loadExpectedPermissions());

  const existing = await prisma.role.findFirst({
    where: { companyId: null, code: PLATFORM_ROLE_CODE },
    include: { permissions: { select: { permissionCode: true } } },
  });

  const before = existing ? existing.permissions.map((p) => p.permissionCode).sort() : [];
  const have = new Set(before);
  const want = new Set(catalogue);
  const grant = catalogue.filter((c) => !have.has(c));
  const revoke = before.filter((c) => !want.has(c));

  if (dryRun) {
    return {
      roleId: existing?.id ?? null,
      created: false,
      grant,
      revoke,
      before,
      after: [...want].sort(),
      unchanged: grant.length === 0 && revoke.length === 0,
    };
  }

  const role = existing
    ? await prisma.role.update({ where: { id: existing.id }, data: { isPlatform: true, isSystem: true } })
    : await prisma.role.create({ data: ROLE_PROFILE });

  // Revoke first. Removing a code that is no longer in the catalogue is what
  // makes the role converge; granting first would leave a window in which the
  // role holds both the stale and the correct codes.
  if (revoke.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionCode: { in: revoke } },
    });
  }
  for (const code of grant) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionCode: { roleId: role.id, permissionCode: code } },
      update: {},
      create: { roleId: role.id, permissionCode: code },
    });
  }

  const after = (
    await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionCode: true },
    })
  )
    .map((p) => p.permissionCode)
    .sort();

  return {
    roleId: role.id,
    created: !existing,
    grant,
    revoke,
    before,
    after,
    unchanged: grant.length === 0 && revoke.length === 0,
  };
}

/**
 * Read the official catalogue from `@oryx/shared`.
 *
 * Imported lazily so a caller that already holds the list (the seed, which
 * bundles it) does not pay for a second module load, and so this file can be
 * syntax-checked without the package being built.
 */
async function loadExpectedPermissions() {
  const shared = await import('@oryx/shared');
  return shared.PLATFORM_SUPER_ADMIN_PERMISSION_CODES;
}

/**
 * Find RolePermission rows whose code no longer exists in the catalogue.
 *
 * A removed permission code left behind on any role is dead weight that still
 * satisfies a guard if a stale `@RequirePermission` for it survives, so the
 * repair reports it. It is reported rather than deleted automatically: the
 * caller decides, because deleting from a tenant-owned role is a destructive
 * act that deserves an explicit decision.
 */
export async function findOrphanedRolePermissions(prisma) {
  const shared = await import('@oryx/shared');
  const known = new Set(shared.PERMISSION_CODES);
  const rows = await prisma.rolePermission.findMany({
    select: { roleId: true, permissionCode: true },
  });
  const orphaned = rows.filter((r) => !known.has(r.permissionCode));
  const byCode = new Map();
  for (const r of orphaned) {
    byCode.set(r.permissionCode, (byCode.get(r.permissionCode) ?? 0) + 1);
  }
  return { total: orphaned.length, byCode: Object.fromEntries([...byCode].sort()) };
}

/**
 * Verify the Super Admin account itself: it exists, is active, is flagged
 * `isSuperAdmin`, and its role resolves to the full platform-scope set.
 *
 * `email` is optional; when omitted the check reports on every platform
 * principal it finds.
 */
export async function verifySuperAdmins(prisma, email) {
  const users = await prisma.user.findMany({
    where: email ? { email } : { isSuperAdmin: true },
    select: { id: true, email: true, status: true, isSuperAdmin: true, mfaEnabled: true },
  });

  const role = await prisma.role.findFirst({
    where: { companyId: null, code: PLATFORM_ROLE_CODE },
    include: { permissions: { select: { permissionCode: true } } },
  });
  const granted = role?.permissions.map((p) => p.permissionCode) ?? [];
  const shared = await import('@oryx/shared');
  const platformScope = granted.filter((c) => shared.getPermission(c)?.scope === 'PLATFORM');

  return {
    roleExists: Boolean(role),
    grantedCount: granted.length,
    platformScopeCount: platformScope.length,
    // The dashboard guard is satisfied by either code; report both so a
    // failure names the exact missing requirement rather than "no access".
    hasDashboardRead: granted.includes('erp.dashboard.read'),
    hasPlatformCompanyRead: granted.includes('platform.company.read'),
    accounts: users.map((u) => ({
      id: u.id,
      email: u.email,
      status: u.status,
      isSuperAdmin: u.isSuperAdmin,
      mfaEnabled: u.mfaEnabled,
      usable: u.isSuperAdmin && u.status === 'ACTIVE',
    })),
  };
}
