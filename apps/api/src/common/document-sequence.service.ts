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
export const DOCUMENT_SEQUENCE_KEYS = {
  journalEntry: { key: 'JOURNAL_ENTRY', prefix: 'JE' },
  payment: { key: 'PAYMENT', prefix: 'PMT' },
  quotation: { key: 'QUOTATION', prefix: 'QT' },
  salesOrder: { key: 'SALES_ORDER', prefix: 'SO' },
  salesInvoice: { key: 'SALES_INVOICE', prefix: 'SI' },
  creditNote: { key: 'CREDIT_NOTE', prefix: 'CN' },
  cashierSession: { key: 'CASHIER_SESSION', prefix: 'CS' },
  posSale: { key: 'POS_SALE', prefix: 'POS' },
  purchaseRequisition: { key: 'PURCHASE_REQUISITION', prefix: 'PR' },
  purchaseOrder: { key: 'PURCHASE_ORDER', prefix: 'PO' },
  goodsReceipt: { key: 'GOODS_RECEIPT', prefix: 'GR' },
  supplierInvoice: { key: 'SUPPLIER_INVOICE', prefix: 'PI' },
  purchaseReturn: { key: 'PURCHASE_RETURN', prefix: 'RTN' },
  stockTransfer: { key: 'STOCK_TRANSFER', prefix: 'TR' },
  stockAdjustment: { key: 'STOCK_ADJUSTMENT', prefix: 'ADJ' },
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
    const sequence = await tx.documentSequence.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, prefix, nextNumber: 1, padding: 5 },
      update: {},
    });
    const allocated = await tx.documentSequence.update({
      where: { id: sequence.id },
      data: { nextNumber: { increment: 1 } },
    });
    // `allocated.nextNumber` is already the *next* value, so the number we hand
    // out is one less than what is now stored.
    const number = allocated.nextNumber - 1;
    return `${allocated.prefix}-${String(number).padStart(allocated.padding, '0')}`;
  }
}
