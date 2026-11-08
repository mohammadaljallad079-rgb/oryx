/**
 * Normalise legacy two-letter document numbers to the mandated single-letter
 * scheme.
 *
 * The numbering contract is one leading letter followed directly by the padded
 * sequence — `S00001`, not `SI-00001`. Generators were moved to that scheme, but
 * rows created before the change still carry the retired prefixes (`SI-`, `QT-`,
 * `JE-`, `JOB-`, …), and an issued document keeps the number it was rendered
 * with. This one-off maintenance pass rewrites those stored numbers and
 * re-renders the affected official documents so the printed copy agrees with the
 * register.
 *
 * It is deliberate about what it touches:
 *   - Only system-generated document numbers are normalised. Entity codes
 *     (`Customer.code`, `Branch.code`) and operator-supplied external references
 *     (`Payment.reference`, `SupplierInvoice.supplierInvoiceNumber`) are not
 *     numbers the platform issues and are left alone.
 *   - The mapping keeps the numeric part, so `SI-00014` becomes `S00014` and the
 *     document keeps its identity. A collision is refused rather than resolved.
 *   - A statement embeds its party code and a date rather than a sequence, so it
 *     has no numeric part to keep; it is re-numbered from its own sequence.
 *
 * Usage (development/staging only):
 *   pnpm --filter @oryx/api exec tsx scripts/normalize-legacy-numbers.ts --dry-run
 *   pnpm --filter @oryx/api exec tsx scripts/normalize-legacy-numbers.ts --apply
 */

import { PrismaClient } from '@oryx/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentsService } from '../src/documents/documents.service';

const url = process.env.DATABASE_URL ?? '';
const isDevLike =
  /oryx_staging|oryx_dev|localhost|127\.0\.0\.1|_test|test_/i.test(url) && !/prod/i.test(url);
if (!isDevLike) {
  console.error(
    'Refusing to run: DATABASE_URL does not look like a development, staging or test database.',
  );
  process.exit(1);
}

const apply = process.argv.includes('--apply');

/** The retired two-letter prefix and the single letter that replaces it. */
const PREFIX_MAP = new Map<string, string>([
  ['SI', 'S'],
  ['QT', 'Q'],
  ['SO', 'O'],
  ['PO', 'P'],
  ['PMT', 'Y'],
  ['JE', 'J'],
  ['CN', 'C'],
  ['RTN', 'U'],
  ['PI', 'B'],
  ['JOB', 'Z'],
  ['CS', 'G'],
  ['SS', 'W'],
]);

const SIMPLE_TARGETS = [
  { model: 'salesInvoice', column: 'invoiceNumber', prefix: 'SI' },
  { model: 'quotation', column: 'quoteNumber', prefix: 'QT' },
  { model: 'salesOrder', column: 'orderNumber', prefix: 'SO' },
  { model: 'creditNote', column: 'creditNoteNumber', prefix: 'CN' },
  { model: 'purchaseOrder', column: 'orderNumber', prefix: 'PO' },
  { model: 'supplierInvoice', column: 'invoiceNumber', prefix: 'PI' },
  { model: 'purchaseReturn', column: 'returnNumber', prefix: 'RTN' },
  { model: 'payment', column: 'paymentNumber', prefix: 'PMT' },
  { model: 'journalEntry', column: 'entryNumber', prefix: 'JE' },
  { model: 'inspectionSession', column: 'jobNumber', prefix: 'JOB' },
] as const;

/**
 * Rewrites a legacy `<LETTERS>-<digits>` number, keeping the digits padded to
 * five places. Returns null when the value is already compliant or is not a
 * plain prefixed number (a statement has no numeric tail).
 */
function renumberSimple(value: string): string | null {
  const match = /^([A-Z]{2,})-(\d+)$/.exec(value);
  if (!match) return null;
  const letter = PREFIX_MAP.get(match[1]);
  if (!letter) return null;
  return `${letter}${match[2].padStart(5, '0')}`;
}

interface Line {
  target: string;
  renamed: number;
  collisions: number;
}

async function main() {
  console.log(`Normalising legacy document numbers (${apply ? 'APPLY' : 'DRY RUN'})…`);
  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const documents = app.get(DocumentsService);
  const lines: Line[] = [];

  try {
    for (const target of SIMPLE_TARGETS) {
      const delegate = (prisma as unknown as Record<string, any>)[target.model];
      const rows = (await delegate.findMany({
        where: { [target.column]: { startsWith: `${target.prefix}-` } },
        select: { id: true, companyId: true, [target.column]: true },
      })) as Array<Record<string, string>>;
      let renamed = 0;
      let collisions = 0;
      for (const row of rows) {
        const next = renumberSimple(row[target.column]);
        if (!next) continue;
        const clash = await delegate.findFirst({
          where: { companyId: row.companyId, [target.column]: next },
          select: { id: true },
        });
        if (clash) {
          collisions += 1;
          console.error(`  ! ${target.model}.${target.column} ${row[target.column]} -> ${next} collides`);
          continue;
        }
        if (apply) {
          await delegate.update({ where: { id: row.id }, data: { [target.column]: next } });
        }
        renamed += 1;
      }
      lines.push({ target: `${target.model}.${target.column}`, renamed, collisions });
    }

    // Official documents: re-number and re-render, because the stored PDF was
    // printed with the old number in its header and footer.
    const allDocs = await prisma.officialDocument.findMany({
      orderBy: [{ companyId: 'asc' }, { issuedAt: 'asc' }],
      select: { id: true, companyId: true, type: true, documentNumber: true, seriesId: true },
    });
    const legacyDocs = allDocs.filter((d) => /^[A-Z]{2,}-/.test(d.documentNumber));

    let docsRenamed = 0;
    let docsCollisions = 0;
    const statementCounters = new Map<string, number>();
    // Versions of one logical document share a series and must share the new
    // number too; only a statement needs this memo, because its legacy number
    // carries no sequence to map.
    const seriesNumber = new Map<string, string>();

    for (const doc of legacyDocs) {
      let next = renumberSimple(doc.documentNumber);
      if (!next) {
        const seriesKey = `${doc.companyId}:${doc.type}:${doc.seriesId}`;
        const remembered = seriesNumber.get(seriesKey);
        if (remembered) {
          next = remembered;
        } else {
          const isCustomer = doc.type === 'CUSTOMER_STATEMENT';
          const key = isCustomer ? 'CUSTOMER_STATEMENT' : 'SUPPLIER_STATEMENT';
          const prefix = isCustomer ? 'G' : 'W';
          const composite = `${doc.companyId}:${key}`;
          const used = (statementCounters.get(composite) ?? 0) + 1;
          statementCounters.set(composite, used);
          next = `${prefix}${String(used).padStart(5, '0')}`;
          seriesNumber.set(seriesKey, next);
        }
      }
      const clash = await prisma.officialDocument.findFirst({
        where: {
          companyId: doc.companyId,
          type: doc.type,
          documentNumber: next,
          NOT: { seriesId: doc.seriesId },
        },
        select: { id: true },
      });
      if (clash) {
        docsCollisions += 1;
        console.error(`  ! OfficialDocument ${doc.documentNumber} -> ${next} collides`);
        continue;
      }
      if (apply) {
        await documents.rerenderForMaintenance(doc.id, { renumber: next });
      } else {
        console.log(`  would renumber ${doc.type} ${doc.documentNumber} -> ${next}`);
      }
      docsRenamed += 1;
    }
    lines.push({ target: 'OfficialDocument.documentNumber', renamed: docsRenamed, collisions: docsCollisions });

    // Advance the statement sequences past the numbers just handed out so a
    // later statement cannot collide with a normalised legacy one.
    if (apply) {
      for (const [composite, used] of statementCounters) {
        const [companyId, key] = composite.split(':');
        const prefix = key === 'CUSTOMER_STATEMENT' ? 'G' : 'W';
        await prisma.documentSequence.upsert({
          where: { companyId_key: { companyId, key } },
          create: { companyId, key, prefix, nextNumber: used + 1, padding: 5 },
          update: { prefix, nextNumber: used + 1 },
        });
      }
    }

    console.log(`\n${apply ? 'APPLIED' : 'DRY RUN — no writes'}`);
    for (const l of lines) {
      console.log(`  ${l.target.padEnd(40)} renamed=${l.renamed} collisions=${l.collisions}`);
    }
  } finally {
    await app.close();
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error('Normalisation failed:', error);
  process.exit(1);
});
