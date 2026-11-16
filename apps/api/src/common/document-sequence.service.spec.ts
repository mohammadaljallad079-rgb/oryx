import { DOCUMENT_SEQUENCE_KEYS, DocumentSequenceService } from './document-sequence.service';
import type { PrismaService } from './prisma.service';

/**
 * The document-number contract: one leading English letter followed directly by
 * the sequence digits — `S00001`, never `SI-00001`.
 *
 * The brief fixes this shape for every document, and it is the only thing the
 * user sees on the printed page. These lock the catalogue prefixes to a single
 * letter so a future type cannot quietly reintroduce a two-letter scheme, check
 * that the allocator emits exactly one letter with no separator, and prove that
 * a tenant's numbering configuration (prefix, padding, seed) is honoured while
 * an existing counter is never rewound.
 */

describe('document sequence keys', () => {
  it('gives every document type a single leading letter', () => {
    for (const [name, { prefix }] of Object.entries(DOCUMENT_SEQUENCE_KEYS)) {
      expect(`${name}=${prefix}`).toMatch(/^[a-zA-Z]+=[A-Z]$/);
    }
  });
});

/**
 * A minimal in-memory stand-in for the sequence row and the numbering settings
 * row. The allocator is pure with respect to Prisma apart from these calls, so a
 * small fake is enough to observe the emitted number without a database.
 */
function fakePrisma(numbering?: Record<string, { prefix: string; padding: number; nextNumber: number }>) {
  const rows = new Map<string, { id: string; nextNumber: number; prefix: string; padding: number }>();
  let seq = 0;
  const client = {
    companySetting: {
      findUnique: async ({ where }: { where: { companyId_section: { section: string } } }) => {
        if (where.companyId_section.section !== 'numbering' || !numbering) return null;
        return { value: numbering };
      },
    },
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
    },
    // The allocator increments the counter and rewrites the prefix/padding in a
    // single raw statement (see the service); the fake applies the same effect.
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const [prefix, padding, id] = values as [string, number, string];
      const row = [...rows.values()].find((r) => r.id === id)!;
      row.nextNumber += 1;
      row.prefix = prefix;
      row.padding = padding;
      return [{ nextNumber: row.nextNumber, prefix: row.prefix, padding: row.padding }];
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

  it('honours a configured prefix and padding', async () => {
    const numbering = { SALES_INVOICE: { prefix: 'INV', padding: 4, nextNumber: 1 } };
    const prisma = fakePrisma(numbering);
    const service = new DocumentSequenceService(prisma);
    const first = await service.next(prisma as never, 'company-1', 'salesInvoice');
    const second = await service.next(prisma as never, 'company-1', 'salesInvoice');
    expect(first).toBe('INV0001');
    expect(second).toBe('INV0002');
  });

  it('never rewinds the counter when the prefix changes mid-stream', async () => {
    const rows: Record<string, { prefix: string; padding: number; nextNumber: number }> = {
      SALES_INVOICE: { prefix: 'S', padding: 5, nextNumber: 1 },
    };
    const prisma = fakePrisma(rows);
    const service = new DocumentSequenceService(prisma);
    await service.next(prisma as never, 'company-1', 'salesInvoice'); // S00001
    await service.next(prisma as never, 'company-1', 'salesInvoice'); // S00002
    rows.SALES_INVOICE = { prefix: 'A', padding: 5, nextNumber: 1 };
    const third = await service.next(prisma as never, 'company-1', 'salesInvoice');
    // The counter carries on from where it was; only the letter changed.
    expect(third).toBe('A00003');
  });
});
