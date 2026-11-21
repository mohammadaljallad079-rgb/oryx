import { renderOfficialFinancialHtml } from './official-financial.template';
import type { FinancialDocumentPayload, DocumentIssuer } from '../document-payload';

const issuer: DocumentIssuer = {
  companyId: 'company-1',
  nameEn: 'ORYX Auto Services',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX',
  currency: 'BHD',
  documentLocale: 'en',
};

function invoice(overrides: Partial<FinancialDocumentPayload> = {}): FinancialDocumentPayload {
  return {
    kind: 'FINANCIAL',
    titleEn: 'Invoice',
    titleAr: 'فاتورة',
    documentNumber: 'S00001',
    documentDate: '2026-11-19T10:00:00.000Z',
    dueDate: null,
    status: 'PAID',
    counterparty: {
      nameEn: 'Customer',
      nameAr: 'العميل',
      code: 'CUS1',
      taxNumber: null,
      email: null,
      phone: null,
      addressLine: null,
      city: null,
      countryCode: null,
    },
    lines: [{
      description: 'Oil',
      quantity: 10000,
      unitPriceMinor: 10000,
      discountMinor: 2000,
      taxMinor: 800,
      lineTotalMinor: 8800,
      taxPercentBp: 1000,
    }],
    subtotalMinor: 10000,
    discountMinor: 2000,
    taxMinor: 800,
    totalMinor: 8800,
    paidMinor: 8800,
    balanceMinor: 0,
    currency: 'BHD',
    notes: null,
    paymentMethod: 'CASH',
    ...overrides,
  };
}

function render(payload: FinancialDocumentPayload): string {
  return renderOfficialFinancialHtml({
    issuer,
    payload,
    documentNumber: payload.documentNumber,
    issuedAt: new Date(payload.documentDate),
    verification: null,
    baseCss: '',
  });
}

describe('official invoice totals and settlement print', () => {
  it('shows a VAT-exclusive line amount, numeric VAT and fixed-money discount', () => {
    const html = render(invoice());
    expect(html).toContain('class="of-c-price num">10.000</td>');
    expect(html).toContain('class="of-c-tax">VAT 10%</td>');
    expect(html).toContain('class="of-c-amt num">8.000 BD</td>');
    expect(html).toContain('Tax 10%');
    expect(html).toContain('Discount');
    expect(html).toContain('2.000 BD');
    expect(html).toContain('8.800 BD');
    expect(html).not.toContain('<th>Balance Due</th>');
    expect(html).not.toContain('<th>Paid</th>');
  });

  it('shows credit due date and Unpaid status with no duplicate balance row', () => {
    const html = render(invoice({
      status: 'POSTED',
      paymentMethod: 'CREDIT',
      dueDate: '2026-12-19T10:00:00.000Z',
      paidMinor: 0,
      balanceMinor: 8800,
    }));
    expect(html).toContain('Due Date');
    expect(html).toContain('Payment Status');
    expect(html).toContain('Unpaid');
    expect(html).not.toContain('<th>Balance Due</th>');
  });

  it('labels a partially settled credit invoice accurately', () => {
    const html = render(invoice({
      status: 'PARTIALLY_PAID',
      paymentMethod: 'CREDIT',
      dueDate: '2026-12-19T10:00:00.000Z',
      paidMinor: 3000,
      balanceMinor: 5800,
    }));
    expect(html).toContain('Partially Paid');
  });
});
