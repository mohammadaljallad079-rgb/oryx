/**
 * Remove fixture records that the browser suites create through the API.
 *
 * The admin API has no employee delete route on purpose — an employee is
 * offboarded, never erased — so a Playwright fixture cannot clean up after
 * itself over HTTP. Without this the demo tenant accumulates "E06UI …" rows on
 * every run, the employee list's first page fills with fixtures, and the
 * seeded `EMP-001` row that `execution03.spec.ts` asserts on is pushed off it.
 *
 * Run from the Playwright global setup and from `pnpm test:ui`. It refuses to
 * run unless the connection string looks like a development or test database.
 */

import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '';
const isDevLike = /oryx_dev|localhost|127\.0\.0\.1|_test|test_/i.test(url) && !/prod/i.test(url);

if (!isDevLike) {
  console.error('Refusing to purge fixtures: DATABASE_URL does not look like a development or test database.');
  process.exit(1);
}

/** Prefixes the browser suites use for their fixture records. */
const PREFIXES = ['E06UI'];

const prisma = new PrismaClient();

try {
  const employees = await prisma.employee.findMany({
    where: { OR: PREFIXES.map((p) => ({ fullNameEn: { startsWith: p } })) },
    select: { id: true },
  });
  const employeeIds = employees.map((e) => e.id);

  // Payslips are referenced by payroll runs and must go before the employee.
  if (employeeIds.length > 0) {
    await prisma.payslip.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  }

  const attachments = await prisma.entityAttachment.deleteMany({
    where: { OR: PREFIXES.map((p) => ({ fileName: { startsWith: p } })) },
  });

  // Payroll fixtures: a run references its period with onDelete: Restrict and
  // has no delete route, so the run goes before the period. Payslips cascade
  // from the run.
  const fixturePeriods = await prisma.payrollPeriod.findMany({
    where: { OR: PREFIXES.map((p) => ({ code: { startsWith: p } })) },
    select: { id: true },
  });
  const periodIds = fixturePeriods.map((p) => p.id);
  const payrollRuns = periodIds.length
    ? await prisma.payrollRun.deleteMany({ where: { periodId: { in: periodIds } } })
    : { count: 0 };
  const payrollPeriods = periodIds.length
    ? await prisma.payrollPeriod.deleteMany({ where: { id: { in: periodIds } } })
    : { count: 0 };

  // Records the suites create alongside an employee, matched by their own text.
  const workOrders = await prisma.workOrder.deleteMany({
    where: { OR: PREFIXES.map((p) => ({ title: { startsWith: p } })) },
  });

  // Maintenance bookings created by the automotive attachment test, matched
  // through the fixture vehicle they were booked against.
  const fixtureVehicles = await prisma.vehicle.findMany({
    where: { OR: PREFIXES.map((p) => ({ make: { startsWith: p } })) },
    select: { id: true },
  });
  const vehicleIds = fixtureVehicles.map((v) => v.id);
  const bookings = vehicleIds.length
    ? await prisma.maintenanceBooking.deleteMany({ where: { vehicleId: { in: vehicleIds } } })
    : { count: 0 };

  // Fixture vouchers post a balanced journal entry; remove the entry, its
  // lines, its account balances and the voucher together so the demo tenant's
  // trial balance is left exactly as the seed produced it.
  const payments = await prisma.payment.findMany({
    where: { OR: PREFIXES.map((p) => ({ reference: { startsWith: p } })) },
    select: { id: true, journalEntryId: true },
  });
  const entryIds = payments.map((p) => p.journalEntryId).filter(Boolean);
  if (payments.length > 0) {
    const lines = entryIds.length
      ? await prisma.journalLine.findMany({ where: { entryId: { in: entryIds } }, select: { accountId: true } })
      : [];
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    await prisma.$transaction(async (tx) => {
      await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
      await tx.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
      if (entryIds.length > 0) {
        await tx.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
        if (accountIds.length > 0) {
          await tx.accountBalance.deleteMany({ where: { accountId: { in: accountIds } } });
        }
        await tx.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
      }
    });
  }

  console.log(
    `UI fixtures purged: ${employeeIds.length} employees, ${attachments.count} attachments, ${workOrders.count} work orders, ${bookings.count} maintenance bookings, ${payments.length} payments, ${payrollRuns.count} payroll runs, ${payrollPeriods.count} payroll periods.`,
  );
} finally {
  await prisma.$disconnect();
}
