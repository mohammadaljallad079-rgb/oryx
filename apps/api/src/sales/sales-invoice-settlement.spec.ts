import { SalesService } from './sales.service';

describe('sales invoice immediate settlement', () => {
  function fixture() {
    const tx = {
      salesInvoice: { update: jest.fn().mockResolvedValue({}) },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentAllocation: { create: jest.fn().mockResolvedValue({}) },
    };
    const posting = {
      systemAccount: jest.fn().mockImplementation(async (_tx, _company, role) => `acct:${role}`),
      postJournal: jest.fn().mockResolvedValue({ id: 'journal-1' }),
    };
    const sequences = { next: jest.fn().mockResolvedValue('PAY00001') };
    const service = Object.create(SalesService.prototype) as SalesService;
    Object.assign(service, { posting, sequences });

    const settle = (method: 'CASH' | 'BANK_TRANSFER' | 'CREDIT') =>
      (service as unknown as {
        settleImmediateInvoice: (tx: unknown, input: Record<string, unknown>) => Promise<void>;
      }).settleImmediateInvoice(tx, {
        companyId: 'company-1',
        branchId: null,
        customerId: 'customer-1',
        invoiceId: 'invoice-1',
        totalMinor: 11000,
        currency: 'BHD',
        method,
        paidAt: new Date('2026-11-19T00:00:00.000Z'),
        actorUserId: 'user-1',
      });

    return { tx, posting, sequences, settle };
  }

  it('keeps a credit invoice unpaid without creating a payment', async () => {
    const { tx, posting, settle } = fixture();
    await settle('CREDIT');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.salesInvoice.update).not.toHaveBeenCalled();
    expect(posting.postJournal).not.toHaveBeenCalled();
  });

  it('creates an allocated customer receipt and balancing ledger journal for cash', async () => {
    const { tx, posting, settle } = fixture();
    await settle('CASH');
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'CASH',
        direction: 'RECEIPT',
        amountMinor: 11000,
        idempotencyKey: 'auto-sales-invoice:invoice-1',
      }),
    });
    expect(tx.paymentAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salesInvoiceId: 'invoice-1',
        amountMinor: 11000,
      }),
    });
    expect(posting.postJournal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sourceType: 'CUSTOMER_RECEIPT',
      lines: [
        { accountId: 'acct:CASH', debit: 11000 },
        { accountId: 'acct:AR_CONTROL', credit: 11000 },
      ],
    }));
    expect(tx.salesInvoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: 'PAID', amountPaidMinor: 11000 },
    });
  });

  it('settles bank-transfer invoices through the bank ledger, not cash', async () => {
    const { posting, settle } = fixture();
    await settle('BANK_TRANSFER');
    expect(posting.postJournal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lines: [
        { accountId: 'acct:BANK', debit: 11000 },
        { accountId: 'acct:AR_CONTROL', credit: 11000 },
      ],
    }));
  });

  it('does not create a second receipt for a retried invoice', async () => {
    const { tx, posting, settle } = fixture();
    tx.payment.findFirst.mockResolvedValueOnce({ id: 'already-paid' });
    await settle('CASH');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(posting.postJournal).not.toHaveBeenCalled();
  });
});
