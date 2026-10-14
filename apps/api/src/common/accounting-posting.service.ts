import { Injectable } from '@nestjs/common';
import { isBalanced, sumMinor } from '@oryx/shared';
import type { JournalSourceType, Prisma } from '@oryx/database';
import { PrismaService } from './prisma.service';
import { DocumentSequenceService, type Tx } from './document-sequence.service';
import { badRequest, ERROR_CODES, forbidden } from './errors';

/**
 * A single side of a double-entry line. `debit` and `credit` are minor units and
 * exactly one of them is non-zero per line.
 */
export interface PostingLine {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string;
  branchId?: string;
}

export interface PostJournalInput {
  companyId: string;
  branchId?: string | null;
  entryDate: Date;
  memo?: string;
  currency?: string;
  sourceType: JournalSourceType;
  /** Source document id — makes posting idempotent for that document. */
  sourceId?: string | null;
  lines: PostingLine[];
  actorUserId: string;
}

export interface PostedJournal {
  id: string;
  entryNumber: string;
  totalDebitMinor: number;
  totalCreditMinor: number;
}

/** System account roles resolved from the chart of accounts at posting time. */
export const SYSTEM_ROLES = {
  AR_CONTROL: 'AR_CONTROL',
  AP_CONTROL: 'AP_CONTROL',
  CASH: 'CASH',
  BANK: 'BANK',
  SALES_REVENUE: 'SALES_REVENUE',
  VAT_OUTPUT: 'VAT_OUTPUT',
  VAT_INPUT: 'VAT_INPUT',
  INVENTORY: 'INVENTORY',
  COGS: 'COGS',
  SALES_DISCOUNT: 'SALES_DISCOUNT',
  CASH_OVER_SHORT: 'CASH_OVER_SHORT',
  STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT',
  PURCHASE_PRICE_VARIANCE: 'PURCHASE_PRICE_VARIANCE',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * The accounting posting engine.
 *
 * Every posted journal is:
 *  - **balanced** — total debits equal total credits, asserted before insert;
 *  - **atomic** — header, lines, account balances and audit all happen in one
 *    transaction, so a partial posting is impossible;
 *  - **auditable** — it references a source document and is never edited after
 *    posting (a correction is a reversal entry);
 *  - **idempotent** — the `(companyId, sourceType, sourceId)` unique key means a
 *    retried request for the same source document cannot post twice.
 */
@Injectable()
export class AccountingPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: DocumentSequenceService,
  ) {}

  /**
   * Resolve the accounting period that contains `date`. Refuses to post into a
   * period that is closed or locked, or a date with no period at all.
   */
  async resolveOpenPeriod(tx: Tx, companyId: string, date: Date): Promise<{ id: string }> {
    const period = await tx.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!period) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `No accounting period covers ${date.toISOString().slice(0, 10)}. Open a fiscal year first.`,
      );
    }
    if (period.status !== 'OPEN') {
      throw forbidden(
        ERROR_CODES.PERIOD_NOT_OPEN,
        `Accounting period ${period.nameEn} is ${period.status.toLowerCase()} and cannot accept postings.`,
      );
    }
    return { id: period.id };
  }

  /** Resolve an account by its system role, failing loudly when it is missing. */
  async systemAccount(tx: Tx, companyId: string, role: SystemRole): Promise<string> {
    const account = await tx.account.findFirst({ where: { companyId, systemRole: role, isActive: true } });
    if (!account) {
      throw badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        `The chart of accounts has no active account for role ${role}. Seed or configure it before posting.`,
      );
    }
    return account.id;
  }

  /**
   * Post a balanced journal entry.
   *
   * `tx` must be the caller's transaction so the journal commits together with
   * the business document that produced it.
   */
  async postJournal(tx: Tx, input: PostJournalInput): Promise<PostedJournal> {
    if (input.lines.length < 2) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A journal entry needs at least two lines.');
    }

    const lines = input.lines.map((line, index) => {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Journal amounts must be non-negative integers (minor units).');
      }
      if ((debit === 0) === (credit === 0)) {
        throw badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          `Line ${index + 1} must have exactly one non-zero side (debit or credit).`,
        );
      }
      return {
        lineNumber: index + 1,
        accountId: line.accountId,
        branchId: line.branchId ?? input.branchId ?? null,
        description: line.description ?? null,
        debitMinor: debit,
        creditMinor: credit,
      };
    });

    const totalDebitMinor = sumMinor(lines.map((l) => l.debitMinor));
    const totalCreditMinor = sumMinor(lines.map((l) => l.creditMinor));
    if (!isBalanced([totalDebitMinor, -totalCreditMinor])) {
      throw badRequest(
        ERROR_CODES.UNBALANCED_ENTRY,
        `Journal does not balance: debits ${totalDebitMinor} vs credits ${totalCreditMinor}.`,
        { totalDebitMinor, totalCreditMinor },
      );
    }

    // Idempotency: if a journal already exists for this source document, return
    // it rather than posting a duplicate.
    if (input.sourceId) {
      const existing = await tx.journalEntry.findFirst({
        where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId },
      });
      if (existing) {
        return {
          id: existing.id,
          entryNumber: existing.entryNumber,
          totalDebitMinor: existing.totalDebitMinor,
          totalCreditMinor: existing.totalCreditMinor,
        };
      }
    }

    const period = await this.resolveOpenPeriod(tx, input.companyId, input.entryDate);
    const entryNumber = await this.sequences.next(tx, input.companyId, 'journalEntry');

    const entry = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId ?? null,
        fiscalPeriodId: period.id,
        entryNumber,
        entryDate: input.entryDate,
        status: 'POSTED',
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        memo: input.memo ?? null,
        currency: input.currency ?? 'SAR',
        totalDebitMinor,
        totalCreditMinor,
        postedAt: new Date(),
        postedByUserId: input.actorUserId,
        createdById: input.actorUserId,
        lines: { create: lines.map((l) => ({ ...l, companyId: input.companyId })) },
      },
    });

    // Keep the per-period account balances in step with the posted lines.
    for (const line of lines) {
      await tx.accountBalance.upsert({
        where: { accountId_fiscalPeriodId: { accountId: line.accountId, fiscalPeriodId: period.id } },
        create: {
          companyId: input.companyId,
          accountId: line.accountId,
          fiscalPeriodId: period.id,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
        },
        update: {
          debitMinor: { increment: line.debitMinor },
          creditMinor: { increment: line.creditMinor },
        },
      });
    }

    return { id: entry.id, entryNumber, totalDebitMinor, totalCreditMinor };
  }

  /**
   * Reverse a posted entry by posting its mirror image. The original is marked
   * REVERSED and never mutated; the reversal carries the negated lines so the
   * ledger nets to zero while both entries remain in the audit trail.
   */
  async reverseJournal(
    tx: Tx,
    companyId: string,
    originalId: string,
    actorUserId: string,
    reversalDate: Date,
  ): Promise<PostedJournal> {
    const original = await tx.journalEntry.findFirst({
      where: { id: originalId, companyId },
      include: { lines: true },
    });
    if (!original) throw badRequest(ERROR_CODES.RESOURCE_NOT_FOUND, 'Journal entry not found.');
    if (original.status !== 'POSTED') {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Only a posted entry can be reversed.');
    }

    const period = await this.resolveOpenPeriod(tx, companyId, reversalDate);
    const entryNumber = await this.sequences.next(tx, companyId, 'journalEntry');

    const reversalLines = original.lines.map((line) => ({
      lineNumber: line.lineNumber,
      accountId: line.accountId,
      branchId: line.branchId,
      description: `Reversal: ${line.description ?? original.entryNumber}`,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
    }));

    const reversal = await tx.journalEntry.create({
      data: {
        companyId,
        branchId: original.branchId,
        fiscalPeriodId: period.id,
        entryNumber,
        entryDate: reversalDate,
        status: 'POSTED',
        sourceType: original.sourceType,
        sourceId: null,
        memo: `Reversal of ${original.entryNumber}`,
        currency: original.currency,
        totalDebitMinor: original.totalCreditMinor,
        totalCreditMinor: original.totalDebitMinor,
        reversalOfId: original.id,
        postedAt: new Date(),
        postedByUserId: actorUserId,
        createdById: actorUserId,
        lines: { create: reversalLines.map((l) => ({ ...l, companyId })) },
      },
    });

    for (const line of reversalLines) {
      await tx.accountBalance.upsert({
        where: { accountId_fiscalPeriodId: { accountId: line.accountId, fiscalPeriodId: period.id } },
        create: {
          companyId,
          accountId: line.accountId,
          fiscalPeriodId: period.id,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
        },
        update: {
          debitMinor: { increment: line.debitMinor },
          creditMinor: { increment: line.creditMinor },
        },
      });
    }

    await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });

    return {
      id: reversal.id,
      entryNumber,
      totalDebitMinor: reversal.totalDebitMinor,
      totalCreditMinor: reversal.totalCreditMinor,
    };
  }

  /**
   * Run `fn` inside a transaction.
   *
   * The isolation level is READ COMMITTED, not SERIALIZABLE: the inventory
   * ledger already serialises concurrent movements of the same SKU with an
   * explicit `SELECT … FOR UPDATE` row lock, so READ COMMITTED is sufficient and
   * avoids the spurious serialization aborts SERIALIZABLE would raise for
   * unrelated concurrent work.
   *
   * A bounded retry still wraps the transaction so a genuine deadlock or a
   * write-conflict (`40001`/`P2034`) is retried rather than surfaced as a 500.
   */
  async withTransaction<T>(fn: (tx: Tx) => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, { isolationLevel: 'ReadCommitted' });
      } catch (error) {
        lastError = error;
        if (!isRetryableTransactionError(error) || attempt === attempts) throw error;
        // Small backoff so the competing transaction can finish.
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
      }
    }
    throw lastError;
  }
}

/** True for PostgreSQL serialization/deadlock errors that a retry may resolve. */
function isRetryableTransactionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P2034' || code === '40001' || code === '40P01') return true;
  const message = (error as { message?: string } | null)?.message ?? '';
  return message.includes('could not serialize access') || message.includes('deadlock detected');
}

export type { Prisma };
