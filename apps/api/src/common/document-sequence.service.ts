import { Injectable } from '@nestjs/common';
import type { Prisma } from '@oryx/database';
import { PrismaService } from './prisma.service';

/**
 * Monotonic, gap-free document numbering per company and document type.
 *
 * Numbers are allocated inside the caller's transaction by incrementing a
 * single row, which takes a row lock for the duration of the transaction. Two
 * concurrent postings therefore serialise on that row and never receive the
 * same number, and a rolled-back transaction releases its number for reuse.
 */
/**
 * The single leading letter each document type prints before its sequence
 * number. The brief fixes two of them — a sales invoice is `S00001` and a
 * purchase (supplier) invoice is `B00001` — and asks for one appropriate letter
 * per type with no separator. Thirty-two types cannot each own a distinct
 * letter, so a letter is unique within a numbering scope (company + type),
 * which is the scope the numbers are allocated in and printed from. The letters
 * are chosen to read as the document they name (S = sale, B = bill, Q = quote,
 * O = order, J = job, …); a repeated letter never collides because two types
 * keep independent counters.
 */
export const DOCUMENT_SEQUENCE_KEYS = {
  journalEntry: { key: 'JOURNAL_ENTRY', prefix: 'J' },
  payment: { key: 'PAYMENT', prefix: 'Y' },
  quotation: { key: 'QUOTATION', prefix: 'Q' },
  salesOrder: { key: 'SALES_ORDER', prefix: 'O' },
  salesInvoice: { key: 'SALES_INVOICE', prefix: 'S' },
  creditNote: { key: 'CREDIT_NOTE', prefix: 'C' },
  cashierSession: { key: 'CASHIER_SESSION', prefix: 'K' },
  posSale: { key: 'POS_SALE', prefix: 'T' },
  purchaseRequisition: { key: 'PURCHASE_REQUISITION', prefix: 'E' },
  purchaseOrder: { key: 'PURCHASE_ORDER', prefix: 'P' },
  goodsReceipt: { key: 'GOODS_RECEIPT', prefix: 'G' },
  supplierInvoice: { key: 'SUPPLIER_INVOICE', prefix: 'B' },
  purchaseReturn: { key: 'PURCHASE_RETURN', prefix: 'U' },
  stockTransfer: { key: 'STOCK_TRANSFER', prefix: 'F' },
  stockAdjustment: { key: 'STOCK_ADJUSTMENT', prefix: 'D' },
  // Execution 03
  payrollRun: { key: 'PAYROLL_RUN', prefix: 'L' },
  employeeAdvance: { key: 'EMPLOYEE_ADVANCE', prefix: 'A' },
  lead: { key: 'LEAD', prefix: 'N' },
  opportunity: { key: 'OPPORTUNITY', prefix: 'V' },
  supportTicket: { key: 'SUPPORT_TICKET', prefix: 'I' },
  workOrder: { key: 'WORK_ORDER', prefix: 'W' },
  project: { key: 'PROJECT', prefix: 'X' },
  inspectionBooking: { key: 'INSPECTION_BOOKING', prefix: 'H' },
  // Execution Phase 2 — the structured inspection job number.
  inspectionSession: { key: 'INSPECTION_SESSION', prefix: 'Z' },
  maintenanceBooking: { key: 'MAINTENANCE_BOOKING', prefix: 'M' },
  jobCard: { key: 'JOB_CARD', prefix: 'R' },
  repairEstimate: { key: 'REPAIR_ESTIMATE', prefix: 'N' },
  serviceRequest: { key: 'SERVICE_REQUEST', prefix: 'I' },
  // Execution 11 — the consumer marketplace order placed from the mobile app.
  customerOrder: { key: 'CUSTOMER_ORDER', prefix: 'O' },
  // Execution 20 — planned automotive ecosystem (P3–P7).
  customerRfq: { key: 'CUSTOMER_RFQ', prefix: 'Q' },
  customerReturn: { key: 'CUSTOMER_RETURN', prefix: 'U' },
  recoveryRequest: { key: 'RECOVERY_REQUEST', prefix: 'R' },
} as const;

export type DocumentSequenceName = keyof typeof DOCUMENT_SEQUENCE_KEYS;

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
    const { key, prefix } = DOCUMENT_SEQUENCE_KEYS[name];
    // `createMany` + `skipDuplicates` compiles to `ON CONFLICT DO NOTHING`, so
    // two concurrent *first* allocations for the same company and type cannot
    // both fail on the unique key. An `upsert` races here: the loser raises
    // P2002, which the transaction wrapper does not retry, so a legitimate
    // concurrent posting would surface as a 500.
    await tx.documentSequence.createMany({
      data: [{ companyId, key, prefix, nextNumber: 1, padding: 5 }],
      skipDuplicates: true,
    });
    const sequence = await tx.documentSequence.findUniqueOrThrow({
      where: { companyId_key: { companyId, key } },
    });
    // A pre-existing row may still carry a retired prefix (the older
    // `SI-`/`QT-` scheme). The configured letter is authoritative, so the row is
    // rewritten in place: the counter is untouched, and every already-issued
    // document keeps the number stored on the record.
    const allocated = await tx.documentSequence.update({
      where: { id: sequence.id },
      data: { nextNumber: { increment: 1 }, prefix },
    });
    // `allocated.nextNumber` is already the *next* value, so the number we hand
    // out is one less than what is now stored.
    const number = allocated.nextNumber - 1;
    // The brief mandates a single leading letter followed directly by the
    // sequence — `S00001`, not `SI-00001` — so there is no separator.
    return `${allocated.prefix}${String(number).padStart(allocated.padding, '0')}`;
  }
}
