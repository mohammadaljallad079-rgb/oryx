import type { PrismaService } from './prisma.service';

/**
 * Allocate an opaque master-data code on the server. This is deliberately not
 * the legal document number series (invoices/receipts use DocumentSequence).
 * One PostgreSQL sequence guarantees uniqueness among concurrent requests,
 * including requests handled by separate API processes. Codes aren't reserved
 * in a browser and don't rely on MAX(code) + 1 race-prone calculations.
 */
export async function nextMasterCode(prisma: PrismaService, prefix: string): Promise<string> {
  if (!/^[A-Z]{1,4}$/.test(prefix)) throw new Error('Invalid master code prefix');
  const rows = await prisma.$queryRaw<Array<{ number: bigint }>>`
    SELECT nextval('"OryxMasterCodeSequence"') AS number
  `;
  const number = rows[0]?.number;
  if (number === undefined) throw new Error('Master code sequence returned no number');
  return `${prefix}${String(number)}`;
}
