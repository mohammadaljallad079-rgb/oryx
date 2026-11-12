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

  // The Execution 08 UI suite files a leave request against a seeded employee.
  // Leave requests have no delete endpoint (an approved one is an audit record),
  // so the row it leaves behind would decrement that employee's balance on every
  // run and eventually make the request fail. Remove the tagged requests and
  // recompute only the balances they touched, so the seeded baseline is
  // identical on the next run and no untouched seeded balance is disturbed.
  const UI_LEAVE_TAG = 'E08UI-';
  const tagged = await prisma.leaveRequest.findMany({
    where: { reason: { startsWith: UI_LEAVE_TAG } },
    select: { employeeId: true, leaveTypeId: true },
  });
  if (tagged.length > 0) {
    await prisma.leaveRequest.deleteMany({ where: { reason: { startsWith: UI_LEAVE_TAG } } });
    const touched = new Set(tagged.map((r) => `${r.employeeId}:${r.leaveTypeId}`));
    const balances = await prisma.leaveBalance.findMany();
    for (const balance of balances) {
      if (!touched.has(`${balance.employeeId}:${balance.leaveTypeId}`)) continue;
      const requests = await prisma.leaveRequest.findMany({
        where: {
          employeeId: balance.employeeId,
          leaveTypeId: balance.leaveTypeId,
          startDate: {
            gte: new Date(Date.UTC(balance.year, 0, 1)),
            lt: new Date(Date.UTC(balance.year + 1, 0, 1)),
          },
        },
        select: { days: true, status: true },
      });
      const pendingDays = requests.filter((r) => r.status === 'SUBMITTED').reduce((sum, r) => sum + r.days, 0);
      const usedDays = requests.filter((r) => r.status === 'APPROVED').reduce((sum, r) => sum + r.days, 0);
      await prisma.leaveBalance.update({ where: { id: balance.id }, data: { pendingDays, usedDays } });
    }
    console.log(`Removed ${tagged.length} Execution 08 leave fixture(s) and reconciled balances.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
