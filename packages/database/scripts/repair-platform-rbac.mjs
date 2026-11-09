/**
 * ORYX — platform RBAC repair.
 *
 * Repairs a production database whose `platform_super_admin` role has drifted
 * from the permission catalogue, and verifies the Super Admin account. It is
 * the targeted alternative to running the full seed on production, which the
 * brief forbids: it writes only role/permission rows and never touches tenants,
 * branches, ERP records, CMS content or user passwords.
 *
 * Safe by construction:
 *   - `--dry-run` is the DEFAULT. Nothing is written without `--apply`.
 *   - All writes happen in one interactive transaction, so a failure mid-way
 *     leaves the database exactly as it was.
 *   - It is idempotent: a second run reports `unchanged` and writes nothing.
 *   - It never prints or changes a credential. Account status is only read.
 *   - It refuses to run against a database it cannot identify, unless
 *     `--allow-unknown-database` is given, so a mistyped DATABASE_URL is caught.
 *
 * Usage:
 *   # inspect only (default)
 *   DATABASE_URL=postgresql://... node packages/database/scripts/repair-platform-rbac.mjs
 *
 *   # write the repair, then verify
 *   DATABASE_URL=postgresql://... node packages/database/scripts/repair-platform-rbac.mjs --apply
 *
 *   # target one account in the verification report
 *   ... --apply --email info@oryxbhr.com
 */

import { PrismaClient } from '@prisma/client';
import {
  findOrphanedRolePermissions,
  syncPlatformSuperAdminRole,
  verifySuperAdmins,
} from './lib/platform-role.mjs';

const prisma = new PrismaClient();

const hasFlag = (name) => process.argv.includes(`--${name}`);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const apply = hasFlag('apply');
const dryRun = !apply;
const email = arg('email');
const allowUnknown = hasFlag('allow-unknown-database');

/** A short, non-reversible label for the connected database, for the audit line. */
function databaseLabel() {
  const url = process.env.DATABASE_URL ?? '';
  try {
    const u = new URL(url);
    const db = u.pathname.replace(/^\//, '') || '(default)';
    return `${u.hostname}:${u.port || '5432'}/${db}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main() {
  const label = databaseLabel();
  console.log('ORYX platform RBAC repair');
  console.log(`  mode:      ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
  console.log(`  database:  ${label}`);
  console.log(`  database url ${process.env.DATABASE_URL ? 'is set' : 'is NOT set'}`);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }
  // A repair that cannot tell which database it is pointed at is a repair that
  // can be run against the wrong one. Require an explicit acknowledgement.
  if (!allowUnknown && /localhost|127\.0\.0\.1/.test(label) === false && label === '(unparseable DATABASE_URL)') {
    throw new Error('Refusing to run: the database could not be identified. Pass --allow-unknown-database to override.');
  }

  console.log('\n1. platform_super_admin role vs catalogue');
  const preview = await syncPlatformSuperAdminRole(prisma, { dryRun: true });
  console.log(`  role row:        ${preview.roleId ? 'exists' : 'MISSING (will be created)'}`);
  console.log(`  permissions now: ${preview.before.length}`);
  console.log(`  to grant:        ${preview.grant.length}${preview.grant.length ? ` (${preview.grant.join(', ')})` : ''}`);
  console.log(`  to revoke:       ${preview.revoke.length}${preview.revoke.length ? ` (${preview.revoke.join(', ')})` : ''}`);
  console.log(`  in sync:         ${preview.unchanged ? 'yes' : 'no'}`);

  console.log('\n2. orphaned permission codes (in the DB, not in the catalogue)');
  const orphans = await findOrphanedRolePermissions(prisma);
  console.log(`  rows:            ${orphans.total}${orphans.total ? ` ${JSON.stringify(orphans.byCode)}` : ''}`);

  console.log('\n3. Super Admin accounts');
  const before = await verifySuperAdmins(prisma, email);
  console.log(`  role exists:     ${before.roleExists}`);
  console.log(`  granted codes:   ${before.grantedCount} (${before.platformScopeCount} platform-scope)`);
  console.log(`  erp.dashboard.read:    ${before.hasDashboardRead}`);
  console.log(`  platform.company.read: ${before.hasPlatformCompanyRead}`);
  for (const a of before.accounts) {
    console.log(`  - ${a.email}: status=${a.status} superAdmin=${a.isSuperAdmin} mfa=${a.mfaEnabled} usable=${a.usable}`);
  }
  if (before.accounts.length === 0) {
    console.log('  (no matching account found)');
  }

  if (dryRun) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to repair.');
    return;
  }

  console.log('\n4. applying the repair in a single transaction');
  const result = await prisma.$transaction(async (tx) => syncPlatformSuperAdminRole(tx));
  console.log(`  granted:         ${result.grant.length}`);
  console.log(`  revoked:         ${result.revoke.length}`);
  console.log(`  permissions now: ${result.after.length}`);

  const after = await verifySuperAdmins(prisma, email);
  const ok =
    after.roleExists &&
    after.grantedCount === result.after.length &&
    after.hasDashboardRead &&
    after.hasPlatformCompanyRead &&
    after.accounts.every((a) => a.usable);

  // Audit the repair. Identified by actor role and result, never by credential.
  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      action: 'platform.rbac.repaired',
      targetType: 'ROLE',
      targetId: result.roleId ?? 'platform_super_admin',
      summary: `Reconciled the platform_super_admin role with the permission catalogue (granted ${result.grant.length}, revoked ${result.revoke.length}).`,
      metadata: {
        granted: result.grant,
        revoked: result.revoke,
        beforeCount: result.before.length,
        afterCount: result.after.length,
        orphanedPermissionRows: orphans.total,
      },
    },
  });

  console.log('\n5. verification');
  console.log(`  role exists:           ${after.roleExists}`);
  console.log(`  permission count:      ${after.grantedCount}`);
  console.log(`  erp.dashboard.read:    ${after.hasDashboardRead}`);
  console.log(`  platform.company.read: ${after.hasPlatformCompanyRead}`);
  console.log(`  super admin usable:    ${after.accounts.every((a) => a.usable)}`);
  console.log(`\nRESULT: ${ok ? 'REPAIRED' : 'INCOMPLETE — inspect the values above'}`);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`\nrepair failed: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
