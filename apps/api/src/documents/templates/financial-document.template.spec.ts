import { renderFinancialDocumentHtml } from './financial-document.template';
import type { DocumentIssuer, FinancialDocumentPayload } from '../document-payload';

/**
 * The invoice line table.
 *
 * A line's `quantity` is stored scaled by `QUANTITY_SCALE` (10^4). The template
 * must print the human quantity, not the raw integer: a real invoice printed
 * "10,000" for a single unit, which misstates the document. This renders the
 * template the way the document service does and reads the quantity cell.
 */

const issuer: DocumentIssuer = {
  companyId: 'c1',
  nameEn: 'ORYX Auto Services',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX-AUTO',
  taxNumber: '998877',
  crNumber: 'CR-998877',
  addressLine: 'Building 42, Road 15',
  city: 'Manama',
  phone: '+97317000000',
  email: 'billing@oryx.local',
  websiteUrl: 'https://oryx.local',
  currency: 'BHD',
};

function payloadWithQuantity(quantity: number): FinancialDocumentPayload {
  return {
    kind: 'FINANCIAL',
    titleEn: 'Tax Invoice',
    titleAr: 'فاتورة ضريبية',
    documentNumber: 'SI-1',
    documentDate: '2026-01-01',
    dueDate: null,
    status: 'POSTED',
    counterparty: {
      nameEn: 'Acme Trading',
      nameAr: 'أكمي',
      code: 'CUST-1',
      taxNumber: null,
      email: null,
      phone: null,
      addressLine: null,
      city: null,
      countryCode: null,
    },
    lines: [
      {
        description: 'Brake pad set',
        quantity,
        unitPriceMinor: 10_000,
        discountMinor: 0,
        taxMinor: 1_000,
        lineTotalMinor: 11_000,
      },
    ],
    subtotalMinor: 10_000,
    discountMinor: 0,
    taxMinor: 1_000,
    totalMinor: 11_000,
    paidMinor: 0,
    balanceMinor: 11_000,
    currency: 'BHD',
    notes: null,
    payment: null,
    statement: null,
    journal: null,
  };
}

function render(quantity: number): string {
  return renderFinancialDocumentHtml({
    issuer,
    payload: payloadWithQuantity(quantity),
    documentNumber: 'SI-1',
    issuedAt: new Date('2026-01-01T00:00:00Z'),
    verification: null,
    baseCss: '',
  });
}

/** The text of the quantity cell of the first line. */
function quantityCell(html: string): string {
  const match = html.match(/<td class="l-qty num">([^<]*)<\/td>/);
  if (!match) throw new Error('quantity cell not found');
  return match[1];
}

describe('financial document template — line quantity', () => {
  it('prints one unit, not the scaled integer', () => {
    expect(quantityCell(render(10_000))).toBe('1');
  });

  it('prints a fractional quantity', () => {
    expect(quantityCell(render(25_000))).toBe('2.5');
  });

  it('prints a whole count without trailing zeros', () => {
    expect(quantityCell(render(200_000))).toBe('20');
  });
});

/**
 * The "المستلم / Received By" line.
 *
 * The receipt and payment voucher carry a received-by line in both the document
 * info table and the signature strip. The field used to be hard-coded to null,
 * so a stored name never reached the printed page. These lock in that a stored
 * name is printed in both places and that an absent name is omitted rather than
 * printed as an empty row.
 */
describe('financial document template — received by', () => {
  function renderPayment(receivedByName: string | null): string {
    const payload = payloadWithQuantity(10_000);
    return renderFinancialDocumentHtml({
      issuer,
      payload: {
        ...payload,
        titleEn: 'Payment Receipt',
        titleAr: 'سند قبض',
        payment: {
          method: 'CASH',
          reference: 'REF-1',
          receivedByName,
          paidAt: '2026-01-01T00:00:00.000Z',
        },
      },
      documentNumber: 'Y-1',
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      verification: null,
      baseCss: '',
    });
  }

  it('prints the stored name in the info table and the signature strip', () => {
    const html = renderPayment('Fatima Al-Zahra');
    const occurrences = html.split('Fatima Al-Zahra').length - 1;
    expect(occurrences).toBe(2);
    expect(html).toContain('المستلم / Received By');
  });

  it('omits the info row when no name is stored', () => {
    const html = renderPayment(null);
    expect(html).not.toContain('المستلم / Received By');
  });
});
