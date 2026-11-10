import { Injectable } from '@nestjs/common';
import { fromMinor, currencyScale, currencySymbol, type PrintDocumentDto, type PrintDocumentKind, type PrintPartyDto } from '@oryx/shared';
import { notFound, ERROR_CODES } from '../common/errors';
import { ErpContextService } from '../common/erp-context.service';
import { PrismaService } from '../common/prisma.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { amountInWords, toPrintLines, toPrintTotals } from './print-format';

/**
 * Format a date the way the approved forms do: `Sat 20/09/2026, 3:30 PM`.
 *
 * The reference prints a weekday, a dd/mm/yyyy date and a 12-hour clock in
 * Bahrain time, so the same shape is produced here rather than a bare date. The
 * client renderer prints this string verbatim, so it must already carry the time
 * the approved form shows.
 */
function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Bahrain',
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Bahrain',
  })
    .format(d)
    .replace(/\u202f/g, ' ');
  return `${pick('weekday')} ${pick('day')}/${pick('month')}/${pick('year')}, ${time}`;
}

/**
 * The settlement-method label the approved form prints on its "Payment" line.
 *
 * The invoice and the receipt each store their own settlement method, so the
 * printed value is read from the document rather than only from a linked payment
 * allocation. The enum is mapped to the wording the approved sheet uses ("Cash",
 * "Card terminal", "Benefit Pay") instead of the raw uppercase constant, so the
 * line reads the way the reference does.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  CARD_TERMINAL: 'Card terminal',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  WALLET: 'Benefit Pay',
  OTHER: 'Other',
};

function paymentMethodLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return PAYMENT_METHOD_LABELS[raw] ?? raw.replace(/_/g, ' ');
}

interface TitleSpec {
  titleEn: string;
  titleAr: string;
  dateLabel: string;
  secondaryLabel?: string;
}

const TITLES: Record<PrintDocumentKind, TitleSpec> = {
  // The approved invoice prints its date as "Order Date" and carries no second
  // date row; only the quotation shows an "Expiration Date" (reference p1/p2).
  SALES_INVOICE: { titleEn: 'INVOICE', titleAr: 'فاتورة', dateLabel: 'Order Date' },
  QUOTATION: { titleEn: 'QUOTATION', titleAr: 'تسعيرة', dateLabel: 'Quotation Date', secondaryLabel: 'Expiration Date' },
  SALES_ORDER: { titleEn: 'SALES ORDER', titleAr: 'أمر بيع', dateLabel: 'Order Date' },
  CREDIT_NOTE: { titleEn: 'CREDIT NOTE', titleAr: 'إشعار دائن', dateLabel: 'Issue Date' },
  RECEIPT: { titleEn: 'RECEIPT VOUCHER', titleAr: 'سند قبض', dateLabel: 'Payment Date' },
};

/**
 * Resolves a printable document from the database.
 *
 * The print model is built from the document's own persisted rows — never from
 * a live lookup — so a printed document always reflects what was actually
 * issued, and the fields the template needs map one-to-one to stored data.
 */
@Injectable()
export class PrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
  ) {}

  async build(kind: PrintDocumentKind, id: string, principal: RequestPrincipal): Promise<PrintDocumentDto> {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');

    const meta = {
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      legalNameEn: company.legalNameEn,
      taxNumber: company.taxNumber,
      currency: company.currency,
      countryCode: company.countryCode,
      phone: company.phone,
      email: company.email,
      website: company.website,
      addressLine: company.addressLine,
      crNumber: company.crNumber,
    };

    switch (kind) {
      case 'SALES_INVOICE':
        return this.buildInvoice(id, companyId, meta);
      case 'QUOTATION':
        return this.buildQuotation(id, companyId, meta);
      case 'SALES_ORDER':
        return this.buildOrder(id, companyId, meta);
      case 'CREDIT_NOTE':
        return this.buildCreditNote(id, companyId, meta);
      case 'RECEIPT':
        return this.buildReceipt(id, companyId, meta);
      default:
        throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Unknown document kind.');
    }
  }

  /**
   * The name the "Staf Name" line prints.
   *
   * The document's own stored salesperson wins, so a reprint shows the same
   * name the approved form did; only a document that carries no salesperson
   * falls back to the operator who created it.
   */
  private async staffName(
    preferred: string | null | undefined,
    userId: string | null | undefined,
  ): Promise<string> {
    const stored = preferred?.trim();
    if (stored) return stored;
    if (!userId) return '—';
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.fullNameEn ?? user?.email ?? '—';
  }

  private partyFromCustomer(customer: {
    nameEn: string;
    nameAr: string | null;
    addressLine: string | null;
    city: string | null;
    countryCode: string | null;
    phone: string | null;
    email: string | null;
    taxNumber: string | null;
  }): PrintPartyDto {
    return {
      name: customer.nameEn,
      nameAr: customer.nameAr,
      addressLine: customer.addressLine,
      city: customer.city,
      countryCode: customer.countryCode,
      phone: customer.phone,
      email: customer.email,
      taxNumber: customer.taxNumber,
    };
  }

  private async buildInvoice(id: string, companyId: string, company: PrintDocumentDto['company']): Promise<PrintDocumentDto> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        lines: { orderBy: { sortOrder: 'asc' } },
        allocations: { include: { payment: true } },
      },
    });
    if (!invoice) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales invoice not found.');

    const lines = toPrintLines(
      invoice.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountPercentBp: l.discountPercentBp,
        taxPercentBp: l.taxPercentBp,
      })),
      invoice.currency,
    );
    const payment = invoice.allocations[0]?.payment;
    const spec = TITLES.SALES_INVOICE;
    // The reference invoice always prints a "Payment" line naming how the sale
    // was settled. That value lives on the invoice itself; a linked allocation
    // is only a fallback for records issued before the column existed.
    const settlement = paymentMethodLabel(invoice.paymentMethod ?? payment?.method ?? null);
    return {
      kind: 'SALES_INVOICE',
      documentNumber: invoice.invoiceNumber,
      titleEn: spec.titleEn,
      titleAr: spec.titleAr,
      issueDateLabel: spec.dateLabel,
      issueDateValue: formatDate(invoice.invoiceDate),
      secondaryDateLabel: spec.secondaryLabel ?? null,
      secondaryDateValue: invoice.dueDate ? formatDate(invoice.dueDate) : null,
      staffName: await this.staffName(invoice.salespersonName, invoice.createdById),
      paymentLabel: settlement ? 'Payment' : null,
      paymentValue: settlement,
      reference: invoice.notes,
      company,
      party: this.partyFromCustomer(invoice.customer),
      lines,
      totals: toPrintTotals({
        subtotalMinor: invoice.subtotalMinor,
        discountMinor: invoice.discountMinor,
        taxMinor: invoice.taxMinor,
        totalMinor: invoice.totalMinor,
        currency: invoice.currency,
        taxRateBp: invoice.lines.find((l) => (l.taxPercentBp ?? 0) > 0)?.taxPercentBp ?? 0,
      }),
      amountInWords: amountInWords(invoice.totalMinor, invoice.currency),
      notes: invoice.notes,
      currency: invoice.currency,
    };
  }

  private async buildQuotation(id: string, companyId: string, company: PrintDocumentDto['company']): Promise<PrintDocumentDto> {
    const quote = await this.prisma.quotation.findFirst({
      where: { id, companyId },
      include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quote) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Quotation not found.');
    const spec = TITLES.QUOTATION;
    return {
      kind: 'QUOTATION',
      documentNumber: quote.quoteNumber,
      titleEn: spec.titleEn,
      titleAr: spec.titleAr,
      issueDateLabel: spec.dateLabel,
      issueDateValue: formatDate(quote.issueDate),
      secondaryDateLabel: spec.secondaryLabel ?? null,
      secondaryDateValue: quote.validUntil ? formatDate(quote.validUntil) : null,
      staffName: await this.staffName(quote.salespersonName, quote.createdById),
      paymentLabel: null,
      paymentValue: null,
      reference: quote.notes,
      company,
      party: this.partyFromCustomer(quote.customer),
      lines: toPrintLines(
        quote.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: l.discountPercentBp,
          taxPercentBp: l.taxPercentBp,
        })),
        quote.currency,
      ),
      totals: toPrintTotals({
        subtotalMinor: quote.subtotalMinor,
        discountMinor: quote.discountMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        currency: quote.currency,
        taxRateBp: quote.lines.find((l) => (l.taxPercentBp ?? 0) > 0)?.taxPercentBp ?? 0,
      }),
      amountInWords: amountInWords(quote.totalMinor, quote.currency),
      notes: quote.notes,
      currency: quote.currency,
    };
  }

  private async buildOrder(id: string, companyId: string, company: PrintDocumentDto['company']): Promise<PrintDocumentDto> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, companyId },
      include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Sales order not found.');
    const spec = TITLES.SALES_ORDER;
    return {
      kind: 'SALES_ORDER',
      documentNumber: order.orderNumber,
      titleEn: spec.titleEn,
      titleAr: spec.titleAr,
      issueDateLabel: spec.dateLabel,
      issueDateValue: formatDate(order.orderDate),
      secondaryDateLabel: null,
      secondaryDateValue: null,
      staffName: await this.staffName(order.salespersonName, order.createdById),
      paymentLabel: null,
      paymentValue: null,
      reference: order.notes,
      company,
      party: this.partyFromCustomer(order.customer),
      lines: toPrintLines(
        order.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: l.discountPercentBp,
          taxPercentBp: l.taxPercentBp,
        })),
        order.currency,
      ),
      totals: toPrintTotals({
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        currency: order.currency,
        taxRateBp: order.lines.find((l) => (l.taxPercentBp ?? 0) > 0)?.taxPercentBp ?? 0,
      }),
      amountInWords: amountInWords(order.totalMinor, order.currency),
      notes: order.notes,
      currency: order.currency,
    };
  }

  private async buildCreditNote(id: string, companyId: string, company: PrintDocumentDto['company']): Promise<PrintDocumentDto> {
    const note = await this.prisma.creditNote.findFirst({
      where: { id, companyId },
      include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!note) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Credit note not found.');
    const spec = TITLES.CREDIT_NOTE;
    return {
      kind: 'CREDIT_NOTE',
      documentNumber: note.creditNoteNumber,
      titleEn: spec.titleEn,
      titleAr: spec.titleAr,
      issueDateLabel: spec.dateLabel,
      issueDateValue: formatDate(note.issueDate),
      secondaryDateLabel: null,
      secondaryDateValue: null,
      staffName: await this.staffName(null, note.createdById),
      paymentLabel: null,
      paymentValue: null,
      reference: note.reason,
      company,
      party: this.partyFromCustomer(note.customer),
      lines: toPrintLines(
        note.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
          discountPercentBp: 0,
          taxPercentBp: l.taxPercentBp,
        })),
        note.currency,
      ),
      totals: toPrintTotals({
        subtotalMinor: note.subtotalMinor,
        discountMinor: 0,
        taxMinor: note.taxMinor,
        totalMinor: note.totalMinor,
        currency: note.currency,
        taxRateBp: note.lines.find((l) => (l.taxPercentBp ?? 0) > 0)?.taxPercentBp ?? 0,
      }),
      amountInWords: amountInWords(note.totalMinor, note.currency),
      notes: note.reason,
      currency: note.currency,
    };
  }

  private async buildReceipt(id: string, companyId: string, company: PrintDocumentDto['company']): Promise<PrintDocumentDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        supplier: true,
        allocations: { include: { salesInvoice: { select: { invoiceNumber: true } } } },
      },
    });
    if (!payment) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Receipt not found.');

    const party = payment.customer
      ? this.partyFromCustomer(payment.customer)
      : {
          name: payment.supplier?.nameEn ?? '—',
          nameAr: payment.supplier?.nameAr ?? null,
          addressLine: payment.supplier?.addressLine ?? null,
          city: payment.supplier?.city ?? null,
          countryCode: payment.supplier?.countryCode ?? null,
          phone: payment.supplier?.phone ?? null,
          email: payment.supplier?.email ?? null,
          taxNumber: payment.supplier?.taxNumber ?? null,
        };

    const invoiceNumber = payment.allocations.find((a) => a.salesInvoice)?.salesInvoice?.invoiceNumber ?? null;
    const spec = TITLES.RECEIPT;
    // The line must be rendered at the currency's own scale (BHD/KWD/OMR carry
    // three minor units), or a 10.000 BHD receipt would print a 100.00 BHD line
    // beside a 10.000 BHD total. The amount also carries the approved form's
    // currency symbol ("BD"), not the ISO code.
    const scale = currencyScale(payment.currency);
    const symbol = currencySymbol(payment.currency, 'en');
    const amount = fromMinor(payment.amountMinor, scale);
    const lines = [
      {
        description: invoiceNumber ? `Settlement of invoice ${invoiceNumber}` : 'Payment received',
        quantity: '1',
        unitPrice: amount,
        taxLabel: '—',
        discountPercent: '—',
        amount: `${amount} ${symbol}`,
      },
    ];
    return {
      kind: 'RECEIPT',
      documentNumber: payment.paymentNumber,
      titleEn: spec.titleEn,
      titleAr: spec.titleAr,
      issueDateLabel: spec.dateLabel,
      issueDateValue: formatDate(payment.paidAt),
      secondaryDateLabel: null,
      secondaryDateValue: null,
      staffName: await this.staffName(payment.receivedByName, payment.createdById),
      paymentLabel: 'Payment Method',
      paymentValue: paymentMethodLabel(payment.method) ?? payment.method.replace(/_/g, ' '),
      reference: payment.reference,
      company,
      party,
      lines,
      totals: toPrintTotals({
        subtotalMinor: payment.amountMinor,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: payment.amountMinor,
        currency: payment.currency,
      }),
      amountInWords: amountInWords(payment.amountMinor, payment.currency),
      notes: payment.notes,
      currency: payment.currency,
    };
  }
}
