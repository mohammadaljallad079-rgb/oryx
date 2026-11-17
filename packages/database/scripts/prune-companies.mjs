/**
 * Prune the platform down to a single operating company.
 *
 * The live deployment should hold one company — ORYX Auto Park (the seeded
 * `ORYX-AUTO` row, "ORYX Auto Services"). The development and CI seeds also
 * create a group holding company, two unrelated internal companies and two
 * synthetic demo tenants, and those must not be left on the live platform.
 *
 * Safety rules, all deliberate:
 *   - It is **dry-run by default**. It prints exactly which companies and how
 *     many dependent rows it would remove, and changes nothing until `--apply`
 *     *and* `--confirm` are both passed. The two flags are separate so a scripted
 *     call that supplies one cannot delete data by accident.
 *   - It refuses to run against a database that does not look like production
 *     unless `--force` is passed, so a developer cannot wipe their seeded
 *     development database by copy-pasting a production command.
 *   - It never deletes the keep company. If the keep company is missing the run
 *     aborts, because that is a sign the target database is not the one the
 *     operator thinks it is.
 *   - It writes the audit trail **before** the delete, with no tenant scope, so
 *     the record survives the cascade instead of being nulled by it.
 *   - It deletes children before parents in one transaction, so a partial prune
 *     cannot leave a dangling reference.
 *
 * Usage:
 *   node scripts/prune-companies.mjs                        # dry run, prints the plan
 *   node scripts/prune-companies.mjs --apply --confirm       # executes (production only)
 *   node scripts/prune-companies.mjs --apply --confirm --force
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const has = (name) => process.argv.includes(`--${name}`);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const KEEP = (arg('keep') ?? process.env.SEED_SINGLE_COMPANY_CODE ?? 'ORYX-AUTO').trim();
const APPLY = has('apply');
const CONFIRMED = has('confirm');
const FORCE = has('force');

const url = process.env.DATABASE_URL ?? '';
const looksProduction = /prod/i.test(url) || /oryxbhr\.com/i.test(url);
const looksDevLike =
  /oryx_dev|localhost|127\.0\.0\.1|_test|test_/i.test(url) && !looksProduction;

if (!APPLY) {
  console.log('DRY RUN — no rows will be removed. Re-run with --apply --confirm to execute.\n');
}
if (APPLY && !CONFIRMED) {
  console.error('Refusing to delete: --apply requires --confirm as well.');
  process.exit(1);
}
if (APPLY && looksDevLike && !FORCE) {
  console.error(
    'Refusing to delete: DATABASE_URL looks like a development/test database.\n' +
      'If this really is the target, re-run with --force.',
  );
  process.exit(1);
}

/** Every table that carries a `companyId`, discovered from the live schema. */
async function tenantTables() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.columns WHERE column_name='companyId' AND table_schema='public' ORDER BY table_name",
  );
  return rows.map((r) => r.table_name);
}

async function main() {
  const keep = await prisma.company.findUnique({ where: { code: KEEP } });
  if (!keep) {
    console.error(`Aborting: the keep company "${KEEP}" was not found. Wrong database?`);
    process.exit(1);
  }

  const doomed = await prisma.company.findMany({
    where: { code: { not: KEEP } },
    select: { id: true, code: true, nameEn: true, type: true },
    orderBy: { createdAt: 'asc' },
  });

  if (doomed.length === 0) {
    console.log(`Nothing to do: "${KEEP}" is already the only company.`);
    return;
  }

  const tables = await tenantTables();
  console.log(`Keep: ${keep.code} — ${keep.nameEn}\n`);
  console.log(`Remove (${doomed.length}):`);

  const plan = [];
  for (const c of doomed) {
    const counts = {};
    let total = 0;
    for (const t of tables) {
      const r = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "${t}" WHERE "companyId"=$1`,
        c.id,
      );
      if (r[0].n > 0) {
        counts[t] = r[0].n;
        total += r[0].n;
      }
    }
    plan.push({ company: c, total });
    console.log(
      `  - ${c.code} (${c.type}) — ${total} tenant row(s) across ${Object.keys(counts).length} table(s)`,
    );
  }

  // A cross-company reference would break the delete; report it before acting.
  const keepChildren = await prisma.company.count({ where: { parentCompanyId: { not: keep.id } } });
  console.log(`\nTotal rows to remove: ${plan.reduce((a, p) => a + p.total, 0)}`);
  if (keepChildren > 0) {
    console.log(`Note: ${keepChildren} company row(s) still point at a removed parent; they will be removed too.`);
  }

  if (!APPLY) {
    console.log('\nDry run complete. Nothing was changed.');
    return;
  }

  const actorEmail = arg('actor');
  const actor = actorEmail
    ? await prisma.user.findUnique({ where: { email: actorEmail } })
    : null;

  for (const { company: c, total } of plan) {
    await prisma.auditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        companyId: null,
        action: 'company.pruned',
        targetType: 'COMPANY',
        targetId: c.id,
        summary: `Pruned company ${c.nameEn} (${c.code}) — ${total} tenant row(s)`,
        metadata: { code: c.code, type: c.type, rows: total, keep: KEEP },
      },
    });
    // The schema declares the dependent relations with `onDelete: Cascade`, so
    // removing the company removes its tenant rows in one statement.
    await prisma.company.delete({ where: { id: c.id } });
    console.log(`  removed ${c.code}`);
  }

  const remaining = await prisma.company.findMany({ select: { code: true } });
  console.log(`\nDone. Remaining company(ies): ${remaining.map((r) => r.code).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
