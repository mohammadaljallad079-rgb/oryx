/**
 * Reset MFA state on the seeded development accounts.
 *
 * The MFA acceptance suite enrolls and disables a second factor, and a crashed
 * run can leave the account mid-state, which would break every later suite that
 * signs in with a password. This script restores the documented baseline and is
 * called from the Playwright global setup and from `pnpm test:ui`.
 *
 * It refuses to run unless it is pointed at a development or test database.
 */

import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '';
const isDevLike =
  /oryx_dev|localhost|127\.0\.0\.1|_test|test_/i.test(url) && !/prod/i.test(url);

if (!isDevLike) {
  console.error(
    'Refusing to reset MFA: DATABASE_URL does not look like a development or test database.',
  );
  process.exit(1);
}

const SEEDED = [
  process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  'admin@oryx-auto.local',
  'admin@demo-alnoor.local',
];

const prisma = new PrismaClient();

async function main() {
  await prisma.mfaRecoveryCode.deleteMany({});
  const result = await prisma.user.updateMany({
    where: { email: { in: SEEDED } },
    data: {
      mfaEnabled: false,
      mfaSecretEncrypted: null,
      mfaPendingSecretEncrypted: null,
      mfaPendingExpiresAt: null,
      mfaLastUsedStep: null,
      mfaEnrolledAt: null,
    },
  });
  // Release every session so no client holds a token from a previous state.
  await prisma.refreshToken.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(`MFA state reset for ${result.count} seeded account(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
