import { Injectable } from '@nestjs/common';
import { fromMinor, type PrintDocumentDto, type PrintDocumentKind, type PrintPartyDto } from '@oryx/shared';
import { notFound, ERROR_CODES } from '../common/errors';
import { ErpContextService } from '../common/erp-context.service';
import { PrismaService } from '../common/prisma.service';
import type { RequestPrincipal } from '../auth/auth.decorators';
import { amountInWords, toPrintLines, toPrintTotals } from './print-format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Format a date the way the approved forms do: `Sat 20/09/2026`. */
function formatDate(value: Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${WEEKDAYS[d.getUTCDay()]} ${dd}/${mm}/${yyyy}`;
}

interface TitleSpec {
  titleEn: string;
  titleAr: string;
  dateLabel: string;
  secondaryLabel?: string;
}

const TITLES: Record<PrintDocumentKind, TitleSpec> = {
  SALES_INVOICE: { titleEn: 'INVOICE', titleAr: 'فاتورة', dateLabel: 'Invoice Date', secondaryLabel: 'Due Date' },
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
   * The staff name the printed form shows: the operator chosen when the
   * document was created, falling back to the account that created it. A
   * document created before the field existed still prints a name.
   */
  private async staffName(
    stored: string | null | undefined,
    userId: string | null | undefined,
  ): Promise<string> {
    if (stored && stored.trim()) return stored.trim();
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
    return {
      kind: 'SALES_INVOICE',
      documentNumber: invoice.invoiceNumber,
      titleEn: spec.titleEn,
      titleAr: spec.titleAr,
      issueDateLabel: spec.dateLabel,
      issueDateValue: formatDate(invoice.invoiceDate),
      secondaryDateLabel: spec.secondaryLabel ?? null,
      secondaryDateValue: invoice.dueDate ? formatDate(invoice.dueDate) : null,
      staffName: await this.staffName(invoice.staffName, invoice.createdById),
      paymentLabel: payment ? 'Payment' : null,
      paymentValue: payment ? payment.method.replace(/_/g, ' ') : null,
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
      staffName: await this.staffName(quote.staffName, quote.createdById),
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
      staffName: await this.staffName(order.staffName, order.createdById),
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
      staffName: await this.staffName(note.staffName, note.createdById),
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
    const lines = [
      {
        description: invoiceNumber ? `Settlement of invoice ${invoiceNumber}` : 'Payment received',
        quantity: '1',
        unitPrice: fromMinor(payment.amountMinor),
        taxLabel: '—',
        discountPercent: '—',
        amount: `${fromMinor(payment.amountMinor)} ${payment.currency}`,
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
      staffName: await this.staffName(payment.staffName, payment.createdById),
      paymentLabel: 'Payment Method',
      paymentValue: payment.method.replace(/_/g, ' '),
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
