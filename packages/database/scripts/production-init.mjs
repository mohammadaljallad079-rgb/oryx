/**
 * ORYX — production bootstrap.
 *
 * Initialises a *production* database with the platform catalogue and the first
 * Platform Super Administrator. It is the counterpart to `prisma/seed.ts`:
 *
 *   prisma/seed.ts      development and demonstration — synthetic tenants,
 *                       published default password, sample ERP data.
 *   production-init     production — catalogue only, plus one real principal
 *                       whose password is generated and never stored in clear.
 *
 * It lives in the database package rather than the repository root because that
 * is where `@oryx/shared` and `@prisma/client` resolve; a root-level script
 * cannot import either.
 *
 * What it writes:
 *   - the ERP module catalogue        (from @oryx/shared MODULES)
 *   - the subscription plans          (from @oryx/shared PLANS)
 *   - the platform_super_admin role   (with every permission in the catalogue)
 *   - the service-area catalogue      (from @oryx/shared BAHRAIN_SERVICE_AREAS)
 *   - the market platform settings    (country, currency, timezone, VAT)
 *   - exactly one Super Admin account
 *
 * What it deliberately does not write: tenants, branches, staff, sample ERP
 * records, CMS content or demo data of any kind.
 *
 * It is idempotent. Running it twice updates the catalogue and leaves the
 * existing Super Admin's password alone unless `--rotate-password` is given.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... \
 *     node packages/database/scripts/production-init.mjs \
 *     --email owner@example.com \
 *     --name-en "Owner" \
 *     --name-ar "المالك" \
 *     --authorize
 *
 * To keep the generated password out of the shell scrollback:
 *   ... --password-file /root/oryx-owner-password.txt
 *
 * The script refuses to run without `--authorize`, so a stray invocation cannot
 * create a platform principal.
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  BAHRAIN_SERVICE_AREAS,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  MODULES,
  PERMISSIONS,
  PLANS,
} from '@oryx/shared';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

function die(message) {
  console.error(`production-init: ${message}`);
  process.exit(1);
}

// ------------------------------------------------------------------ arguments
const email = (arg('email') ?? '').trim().toLowerCase();
const nameEn = arg('name-en');
const nameAr = arg('name-ar');
const passwordFile = arg('password-file');
const rotatePassword = has('rotate-password');

if (!email || !nameEn || !nameAr) {
  die('missing required arguments --email, --name-en and --name-ar');
}
if (!has('authorize')) {
  die('refusing to run without --authorize (owner approval required)');
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  die('--email must be a valid email address');
}

const url = process.env.DATABASE_URL ?? '';
if (!url) die('DATABASE_URL is not set');
// A bootstrap that silently ran against the development database would create a
// production-shaped principal in a sandbox. Ask for the confirmation explicitly.
if (/oryx_dev|_test|test_|localhost|127\.0\.0\.1/i.test(url) && !has('allow-dev-database')) {
  die(
    'DATABASE_URL looks like a development or test database. ' +
      'Pass --allow-dev-database if that is intentional.',
  );
}

const prisma = new PrismaClient();

// ------------------------------------------------------------------ catalogue
async function seedModules() {
  for (const [index, m] of MODULES.entries()) {
    await prisma.module.upsert({
      where: { key: m.key },
      update: {
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        descriptionEn: m.descriptionEn,
        descriptionAr: m.descriptionAr,
        group: m.group,
        icon: m.icon,
        route: m.route,
        status: m.status,
        deliveryPhase: m.deliveryPhase,
        readPermission: m.readPermission,
        writePermission: m.writePermission ?? null,
        sortOrder: index,
      },
      create: {
        key: m.key,
        nameEn: m.nameEn,
        nameAr: m.nameAr,
        descriptionEn: m.descriptionEn,
        descriptionAr: m.descriptionAr,
        group: m.group,
        icon: m.icon,
        route: m.route,
        status: m.status,
        deliveryPhase: m.deliveryPhase,
        readPermission: m.readPermission,
        writePermission: m.writePermission ?? null,
        sortOrder: index,
      },
    });
  }
  return MODULES.length;
}

async function seedPlans() {
  for (const plan of PLANS) {
    const data = {
      nameEn: plan.nameEn,
      nameAr: plan.nameAr,
      descriptionEn: plan.descriptionEn,
      descriptionAr: plan.descriptionAr,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      trialDays: plan.trialDays,
      maxCompanies: plan.maxCompanies,
      maxBranches: plan.maxBranches,
      maxUsers: plan.maxUsers,
      storageMb: plan.storageMb,
      apiRequestsPerMonth: plan.apiRequestsPerMonth,
      isActive: true,
    };
    const record = await prisma.plan.upsert({
      where: { code: plan.code },
      update: data,
      create: { code: plan.code, ...data },
    });

    // Modules live on `PlanModule`, not on `Plan`.
    for (const moduleKey of plan.licensedModules) {
      await prisma.planModule.upsert({
        where: { planId_moduleKey: { planId: record.id, moduleKey } },
        update: {},
        create: { planId: record.id, moduleKey },
      });
    }
    // Remove modules that are no longer part of the plan definition.
    await prisma.planModule.deleteMany({
      where: { planId: record.id, moduleKey: { notIn: plan.licensedModules } },
    });
  }
  return PLANS.length;
}

async function seedPlatformRole() {
  // A platform role has `companyId = NULL`, which Postgres treats as distinct in
  // a unique index, so `upsert` cannot be used. findFirst + update is the only
  // idempotent form.
  const existing = await prisma.role.findFirst({
    where: { companyId: null, code: 'platform_super_admin' },
  });
  const role = existing
    ? await prisma.role.update({
        where: { id: existing.id },
        data: { isPlatform: true, isSystem: true },
      })
    : await prisma.role.create({
        data: {
          code: 'platform_super_admin',
          nameEn: 'Platform Super Admin',
          nameAr: 'مدير المنصة',
          descriptionEn: 'Full platform governance across every company and tenant.',
          isSystem: true,
          isPlatform: true,
        },
      });

  for (const permission of PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionCode: { roleId: role.id, permissionCode: permission.code } },
      update: {},
      create: { roleId: role.id, permissionCode: permission.code },
    });
  }
  return { role, permissions: PERMISSIONS.length };
}

async function seedServiceAreas() {
  let created = 0;
  for (const [index, area] of BAHRAIN_SERVICE_AREAS.entries()) {
    const existing = await prisma.serviceArea.findUnique({ where: { code: area.code } });
    if (existing) continue;
    await prisma.serviceArea.create({
      data: {
        code: area.code,
        nameEn: area.nameEn,
        nameAr: area.nameAr,
        countryCode: DEFAULT_COUNTRY_CODE,
        sortOrder: index,
      },
    });
    created += 1;
  }
  return { total: BAHRAIN_SERVICE_AREAS.length, created };
}

async function seedPlatformSettings() {
  const settings = [
    ['market.country_code', DEFAULT_COUNTRY_CODE],
    ['market.currency', DEFAULT_CURRENCY],
    ['market.timezone', DEFAULT_TIMEZONE],
    ['finance.default_vat_rate_bp', 0],
  ];
  for (const [key, value] of settings) {
    await prisma.platformSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  return settings.length;
}

// -------------------------------------------------------------------- account
/** A high-entropy password that satisfies the platform policy without a pattern. */
function generatePassword() {
  return `${randomBytes(24).toString('base64url')}Aa1!`;
}

/**
 * Create or refresh the Super Admin account.
 *
 * A platform principal is identified by `User.isSuperAdmin`, and its
 * permissions come from the `platform_super_admin` role — which
 * `AuthService.effectivePermissionCodes` looks up by `isPlatform`, not through
 * a membership. A `Membership` row would therefore be wrong here: it requires a
 * `companyId`, and a platform principal has no tenant scope until it opens a
 * support session.
 */
async function provisionSuperAdmin() {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && !rotatePassword) {
    return { user: existing, password: null, created: false };
  }

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
          preferredTheme: 'light',
        },
      });

  return { user, password, created: !existing };
}

// ----------------------------------------------------------------------- main
async function main() {
  console.log('ORYX production-init — start');

  const modules = await seedModules();
  const plans = await seedPlans();
  const { role, permissions } = await seedPlatformRole();
  const areas = await seedServiceAreas();
  const settings = await seedPlatformSettings();

  console.log(`  modules:              ${modules}`);
  console.log(`  plans:                ${plans}`);
  console.log(`  platform role:        ${role.code} (${permissions} permissions)`);
  console.log(`  service areas:        ${areas.total} (${areas.created} created)`);
  console.log(`  platform settings:    ${settings}`);

  const { user, password, created } = await provisionSuperAdmin();

  // Audit the provisioning. The credential is identified by account, never by
  // value.
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: created ? 'platform.bootstrap.super_admin_created' : 'platform.bootstrap.super_admin_updated',
      targetType: 'USER',
      targetId: user.id,
      summary: created
        ? `Bootstrapped the first Platform Super Admin (${email})`
        : `Re-applied the Platform Super Admin bootstrap to ${email}`,
      metadata: { email, created, passwordRotated: password !== null },
    },
  });

  console.log(`  super admin:          ${email} (${created ? 'created' : 'already existed'})`);

  if (password === null) {
    console.log('\n  The account already existed. Its password was left unchanged.');
    console.log('  Pass --rotate-password to issue a new one.');
  } else if (passwordFile) {
    writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
    console.log(`\n  Password written to ${passwordFile} (mode 0600).`);
    console.log('  Move it to your password manager and delete the file.');
  } else {
    console.log('\n  ============================================================');
    console.log('  Generated password — shown once, never stored in clear:');
    console.log(`\n      ${password}\n`);
    console.log('  Store it in your password manager now, then enrol MFA.');
    console.log('  ============================================================');
  }

  console.log('\n  Next steps:');
  console.log('    1. Set MFA_REQUIRE_SUPER_ADMIN=true and restart the API.');
  console.log(`    2. Sign in at your admin host as ${email} and enrol TOTP MFA.`);
  console.log('    3. Create the first real tenant company and assign a plan.');
  console.log('    4. Run deploy/scripts/health-check.sh.');
  console.log('\nORYX production-init — done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
