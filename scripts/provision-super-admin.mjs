/**
 * Provision a Platform Super Administrator.
 *
 * ORYX supports more than one independent platform principal: `isSuperAdmin`
 * lives on the user, and the platform role is resolved by its well-known code
 * (`platform_super_admin`), never by identity. Adding a principal therefore
 * needs no schema change and no code change — it needs an *owner-authorized*
 * provisioning step, which is this script.
 *
 * Safety rules, all deliberate:
 *   - It refuses to run against a database that does not look like development,
 *     staging or test. A production principal must be created by the owner with
 *     an explicit approval step, not by an unattended script.
 *   - It requires `--authorize`, so a bare invocation cannot create a second
 *     platform principal by accident.
 *   - It requires `--actor <email>` naming an existing, active Super Admin. The
 *     authorization is attributed to a real principal and written to the audit
 *     trail.
 *   - The generated password is printed once, to stdout, and is never written to
 *     the database in clear, to a log file, or to the audit trail. Audit records
 *     identify the credential by account, never by value.
 *
 * Usage (staging):
 *   node scripts/provision-super-admin.mjs \
 *     --email admin2@oryx-staging.local \
 *     --name-en "Platform Super Admin 2" \
 *     --name-ar "مدير المنصة ٢" \
 *     --actor superadmin@oryx.local \
 *     --authorize
 *
 * To keep the secret out of the shell scrollback, pass `--password-file <path>`
 * with a path outside the repository; the password is written there (mode 0600)
 * and only the path is printed.
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const url = process.env.DATABASE_URL ?? '';
const isDevLike =
  /oryx_staging|oryx_dev|localhost|127\.0\.0\.1|_test|test_/i.test(url) && !/prod/i.test(url);
if (!isDevLike) {
  console.error(
    'Refusing to provision: DATABASE_URL does not look like a development, staging or test database.',
  );
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

const email = (arg('email') ?? '').trim().toLowerCase();
const nameEn = arg('name-en');
const nameAr = arg('name-ar');
const actorEmail = (arg('actor') ?? '').trim().toLowerCase();

if (!email || !nameEn || !nameAr || !actorEmail) {
  console.error('Missing required arguments. See the header of this file for usage.');
  process.exit(1);
}
if (!has('authorize')) {
  console.error('Refusing to provision without --authorize (owner approval required).');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('--email must be a valid email address.');
  process.exit(1);
}

/** A high-entropy password that satisfies the platform policy without echoing a pattern. */
function generatePassword() {
  return `${randomBytes(24).toString('base64url')}Aa1!`;
}

const prisma = new PrismaClient();

async function main() {
  const actor = await prisma.user.findUnique({ where: { email: actorEmail } });
  if (!actor || !actor.isSuperAdmin || actor.status !== 'ACTIVE') {
    console.error(`--actor ${actorEmail} is not an active Platform Super Admin.`);
    process.exit(1);
  }

  const role = await prisma.role.findFirst({
    where: { isPlatform: true, code: 'platform_super_admin' },
    include: { permissions: true },
  });
  if (!role) {
    console.error(
      'The platform_super_admin role is missing. Run `pnpm db:seed` before provisioning.',
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const password = generatePassword();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          isSuperAdmin: true,
          status: 'ACTIVE',
          fullNameEn: nameEn,
          fullNameAr: nameAr,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          isSuperAdmin: true,
          status: 'ACTIVE',
          fullNameEn: nameEn,
          fullNameAr: nameAr,
          preferredLocale: 'ar',
          preferredTheme: 'dark',
        },
      });

  // Rotating the credential of an existing principal must not leave old
  // sessions alive; a new principal has none to revoke.
  const revoked = await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: existing ? 'platform.super_admin_rotated' : 'platform.super_admin_provisioned',
      targetType: 'USER',
      targetId: user.id,
      summary: `${existing ? 'Rotated' : 'Provisioned'} Platform Super Admin ${email}`,
      // Identify the account; never record the credential.
      metadata: { email, platformPermissions: role.permissions.length, sessionsRevoked: revoked.count },
    },
  });

  // Printed once, deliberately: this is the only place the secret exists in clear.
  const passwordFile = arg('password-file');
  console.log('Platform Super Admin ready.');
  console.log(`  account : ${email}`);
  console.log(`  name    : ${nameEn} / ${nameAr}`);
  if (passwordFile) {
    writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
    console.log(`  password: written to ${passwordFile} (mode 0600) — move it to the owner password manager`);
  } else {
    console.log(`  password: ${password}`);
  }
  console.log(`  role    : platform_super_admin (${role.permissions.length} permissions)`);
  if (!passwordFile) {
    console.log('Store the password in the owner password manager now; it is not recoverable.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
