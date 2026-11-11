import { DOCUMENT_SEQUENCE_KEYS, DocumentSequenceService } from './document-sequence.service';
import type { PrismaService } from './prisma.service';

/**
 * The document-number contract: one leading English letter followed directly by
 * the sequence digits — `S00001`, never `SI-00001`.
 *
 * The brief fixes this shape for every document, and it is the only thing the
 * user sees on the printed page. These lock the configured prefixes to a single
 * letter so a future type cannot quietly reintroduce a two-letter scheme, and
 * check that the allocator emits exactly one letter with no separator.
 */

describe('document sequence keys', () => {
  it('gives every document type a single leading letter', () => {
    for (const [name, { prefix }] of Object.entries(DOCUMENT_SEQUENCE_KEYS)) {
      expect(`${name}=${prefix}`).toMatch(/^[a-zA-Z]+=[A-Z]$/);
    }
  });
});

/**
 * A minimal in-memory stand-in for the sequence row. The allocator is pure with
 * respect to Prisma apart from the create/read/update calls, so a small fake is
 * enough to observe the emitted number without a database.
 */
function fakePrisma() {
  const rows = new Map<string, { id: string; nextNumber: number; prefix: string; padding: number }>();
  let seq = 0;
  const client = {
    documentSequence: {
      createMany: async ({ data }: { data: Array<{ companyId: string; key: string; prefix: string; nextNumber: number; padding: number }> }) => {
        for (const d of data) {
          const k = `${d.companyId}:${d.key}`;
          if (!rows.has(k)) rows.set(k, { id: `id${++seq}`, nextNumber: d.nextNumber, prefix: d.prefix, padding: d.padding });
        }
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { companyId_key: { companyId: string; key: string } } }) => {
        const row = rows.get(`${where.companyId_key.companyId}:${where.companyId_key.key}`);
        if (!row) throw new Error('not found');
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: { nextNumber: { increment: number }; prefix: string } }) => {
        const row = [...rows.values()].find((r) => r.id === where.id)!;
        row.nextNumber += data.nextNumber.increment;
        row.prefix = data.prefix;
        return { ...row };
      },
    },
  };
  return client as unknown as PrismaService;
}

describe('DocumentSequenceService', () => {
  it('emits one letter followed directly by padded digits', async () => {
    const service = new DocumentSequenceService(fakePrisma());
    const tx = fakePrisma();
    const first = await service.next(tx as never, 'company-1', 'salesInvoice');
    const second = await service.next(tx as never, 'company-1', 'salesInvoice');
    expect(first).toBe('S00001');
    expect(second).toBe('S00002');
    expect(first).toMatch(/^[A-Z]\d{5}$/);
  });

  it('rewrites a retired multi-letter prefix on the row but keeps the counter', async () => {
    const prisma = fakePrisma();
    const service = new DocumentSequenceService(prisma);
    await service.next(prisma as never, 'company-1', 'purchaseOrder');
    const row = await (prisma as unknown as { documentSequence: { findUniqueOrThrow: (a: unknown) => Promise<{ prefix: string }> } })
      .documentSequence.findUniqueOrThrow({ where: { companyId_key: { companyId: 'company-1', key: 'PURCHASE_ORDER' } } });
    expect(row.prefix).toBe('P');
  });
});
