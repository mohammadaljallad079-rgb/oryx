import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_NUMBERING_TYPES,
  defaultNumberingRule,
  withDefaults,
  type DocumentNumberingRule,
} from '@oryx/shared';
import type { Prisma } from '@oryx/database';
import { PrismaService } from './prisma.service';

/**
 * Monotonic, gap-free document numbering per company and document type.
 *
 * Numbers are allocated inside the caller's transaction by incrementing a
 * single row, which takes a row lock for the duration of the transaction. Two
 * concurrent postings therefore serialise on that row and never receive the
 * same number, and a rolled-back transaction releases its number for reuse.
 *
 * The leading letter and the zero-padding are configuration, read from the
 * company's `numbering` settings section on each allocation, while the counter
 * itself lives on the `DocumentSequence` row. Keeping the counter in the row —
 * and never rewinding it from settings during allocation — is what lets an
 * administrator change a prefix without re-issuing a single existing number:
 * an already-issued document keeps the string stored on its own record.
 */

/**
 * The camel-case name each document type is called by at the call sites, mapped
 * to the stable catalogue key. The prefix comes from the catalogue's default,
 * which is also the letter used when a tenant has not overridden it. A repeated
 * letter never collides because two types keep independent counters.
 */
const SEQUENCE_NAMES = {
  journalEntry: 'JOURNAL_ENTRY',
  payment: 'PAYMENT',
  quotation: 'QUOTATION',
  salesOrder: 'SALES_ORDER',
  salesInvoice: 'SALES_INVOICE',
  creditNote: 'CREDIT_NOTE',
  cashierSession: 'CASHIER_SESSION',
  posSale: 'POS_SALE',
  purchaseRequisition: 'PURCHASE_REQUISITION',
  purchaseOrder: 'PURCHASE_ORDER',
  goodsReceipt: 'GOODS_RECEIPT',
  supplierInvoice: 'SUPPLIER_INVOICE',
  purchaseReturn: 'PURCHASE_RETURN',
  stockTransfer: 'STOCK_TRANSFER',
  stockAdjustment: 'STOCK_ADJUSTMENT',
  payrollRun: 'PAYROLL_RUN',
  employeeAdvance: 'EMPLOYEE_ADVANCE',
  lead: 'LEAD',
  opportunity: 'OPPORTUNITY',
  supportTicket: 'SUPPORT_TICKET',
  workOrder: 'WORK_ORDER',
  project: 'PROJECT',
  inspectionBooking: 'INSPECTION_BOOKING',
  inspectionSession: 'INSPECTION_SESSION',
  maintenanceBooking: 'MAINTENANCE_BOOKING',
  jobCard: 'JOB_CARD',
  repairEstimate: 'REPAIR_ESTIMATE',
  serviceRequest: 'SERVICE_REQUEST',
  customerOrder: 'CUSTOMER_ORDER',
  customerRfq: 'CUSTOMER_RFQ',
  customerReturn: 'CUSTOMER_RETURN',
  recoveryRequest: 'RECOVERY_REQUEST',
  customerStatement: 'CUSTOMER_STATEMENT',
  supplierStatement: 'SUPPLIER_STATEMENT',
} as const;

export type DocumentSequenceName = keyof typeof SEQUENCE_NAMES;

const DEFAULT_PREFIX = new Map(DOCUMENT_NUMBERING_TYPES.map((t) => [t.key, t.defaultPrefix]));

/** The catalogue key and default letter for a call-site name. */
export const DOCUMENT_SEQUENCE_KEYS = Object.fromEntries(
  Object.entries(SEQUENCE_NAMES).map(([name, key]) => [
    name,
    { key, prefix: DEFAULT_PREFIX.get(key) ?? 'X' },
  ]),
) as Record<DocumentSequenceName, { key: string; prefix: string }>;

export type Tx = Prisma.TransactionClient;

@Injectable()
export class DocumentSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocate the next document number for `name` in `companyId`.
   *
   * Must be called with the transaction client so the number is only consumed
   * if the surrounding business transaction commits.
   */
  async next(tx: Tx, companyId: string, name: DocumentSequenceName): Promise<string> {
    const { key } = DOCUMENT_SEQUENCE_KEYS[name];
    const rule = await this.resolveRule(tx, companyId, key);
    // `createMany` + `skipDuplicates` compiles to `ON CONFLICT DO NOTHING`, so
    // two concurrent *first* allocations for the same company and type cannot
    // both fail on the unique key. An `upsert` races here: the loser raises
    // P2002, which the transaction wrapper does not retry, so a legitimate
    // concurrent posting would surface as a 500.
    await tx.documentSequence.createMany({
      data: [{ companyId, key, prefix: rule.prefix, nextNumber: rule.nextNumber, padding: rule.padding }],
      skipDuplicates: true,
    });
    const sequence = await tx.documentSequence.findUniqueOrThrow({
      where: { companyId_key: { companyId, key } },
    });
    // The configured letter and padding are authoritative and are rewritten in
    // place on every allocation; the counter is only ever incremented, so a
    // prefix change never rewinds or duplicates an existing number. The
    // increment is a raw statement rather than Prisma's `{ increment: 1 }`
    // because Prisma cannot set a non-numeric column (`prefix`) and increment a
    // numeric one in the same update; the row is already locked by this
    // transaction, so the read-modify-write is safe.
    const rows = await tx.$queryRaw<Array<{ nextNumber: number; prefix: string; padding: number }>>`
      UPDATE "DocumentSequence"
      SET "nextNumber" = "nextNumber" + 1,
          "prefix" = ${rule.prefix},
          "padding" = ${rule.padding},
          "updatedAt" = NOW()
      WHERE "id" = ${sequence.id}
      RETURNING "nextNumber", "prefix", "padding"
    `;
    const allocated = rows[0];
    // `allocated.nextNumber` is already the *next* value, so the number we hand
    // out is one less than what is now stored.
    const number = allocated.nextNumber - 1;
    // The brief mandates a single leading letter followed directly by the
    // sequence — `S00001`, not `SI-00001` — so there is no separator.
    return `${allocated.prefix}${String(number).padStart(allocated.padding, '0')}`;
  }

  /**
   * The prefix, padding and seed number for a type, from the company's
   * `numbering` settings section, falling back to the catalogue default. Read
   * on each allocation so a configuration change takes effect immediately.
   */
  private async resolveRule(tx: Tx, companyId: string, key: string): Promise<DocumentNumberingRule> {
    const row = await tx.companySetting.findUnique({
      where: { companyId_section: { companyId, section: 'numbering' } },
    });
    const numbering = withDefaults('numbering', row?.value);
    const stored = numbering[key];
    const fallback = defaultNumberingRule(key);
    if (!stored) return fallback;
    return {
      prefix: stored.prefix?.trim() ? stored.prefix.trim() : fallback.prefix,
      padding: Number.isFinite(stored.padding) && stored.padding > 0 ? Math.min(stored.padding, 12) : fallback.padding,
      nextNumber: Number.isFinite(stored.nextNumber) && stored.nextNumber > 0 ? stored.nextNumber : fallback.nextNumber,
    };
  }
}
