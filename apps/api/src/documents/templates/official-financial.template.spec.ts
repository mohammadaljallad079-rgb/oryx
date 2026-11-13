import { renderOfficialFinancialHtml } from './official-financial.template';
import type { DocumentIssuer, FinancialDocumentPayload } from '../document-payload';

/**
 * The official invoice/quotation layout.
 *
 * The layout is a reproduction of the owner-approved printed document, so the
 * things that must not silently drift are: the five priced columns, the totals
 * rows and the rate they state, the settlement method, the salesperson, and the
 * bilingual identity. These assertions read the rendered HTML the way the
 * document service produces it.
 */

const issuer: DocumentIssuer = {
  companyId: 'c1',
  nameEn: 'ORYX Auto Services',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX-AUTO',
  legalNameEn: 'ORYX Auto Services W.L.L.',
  taxNumber: '200001111222111',
  addressLine: 'Bldg 886, Road 533, Block 405 Tashan',
  city: 'Kingdom of Bahrain',
  phone: '+973 37702020',
  email: 'oryxbhr1@gmail.com',
  websiteUrl: 'www.oryxbhr.com',
  currency: 'BHD',
};

function payload(overrides: Partial<FinancialDocumentPayload> = {}): FinancialDocumentPayload {
  return {
    kind: 'FINANCIAL',
    titleEn: 'Tax Invoice',
    titleAr: 'فاتورة ضريبية',
    documentNumber: 'S00022',
    documentDate: '2026-09-20T15:30:00.000Z',
    dueDate: '2026-10-20T15:30:00.000Z',
    status: 'POSTED',
    counterparty: {
      nameEn: 'Ahmed mohamad Alhaddad',
      nameAr: 'أحمد محمد الحداد',
      code: 'CUST-1',
      taxNumber: '300009999888777',
      email: null,
      phone: '37702020',
      addressLine: 'Villa 1455, road 5455, block 555',
      city: 'Manama',
      countryCode: 'BH',
    },
    lines: [
      {
        description: 'Oil (Havoline 5w20)',
        quantity: 10_000,
        unitPriceMinor: 7_500,
        discountMinor: 0,
        taxMinor: 750,
        lineTotalMinor: 8_250,
        taxPercentBp: 1000,
      },
    ],
    subtotalMinor: 7_500,
    discountMinor: 0,
    taxMinor: 750,
    roundingMinor: 0,
    totalMinor: 8_250,
    paidMinor: 0,
    balanceMinor: 8_250,
    currency: 'BHD',
    notes: null,
    payment: null,
    statement: null,
    journal: null,
    paymentMethod: 'CASH',
    salespersonName: 'Hussain Alhaddad',
    taxRateBp: 1000,
    ...overrides,
  };
}

function render(overrides: Partial<FinancialDocumentPayload> = {}, issuerOverride = issuer): string {
  return renderOfficialFinancialHtml({
    issuer: issuerOverride,
    payload: payload(overrides),
    documentNumber: overrides.documentNumber ?? 'S00022',
    issuedAt: new Date('2026-09-20T15:30:00Z'),
    verification: null,
    baseCss: '',
  });
}

describe('official financial template — reference columns', () => {
  it('prints the five reference columns in order', () => {
    const html = render();
    const headers = ['Description', 'Quantity', 'Unit Price', 'Taxes', 'Amount'];
    const positions = headers.map((h) => html.indexOf(`>${h}<`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('prints the line tax rate as "VAT 10%" from basis points', () => {
    expect(render()).toContain('VAT 10%');
  });

  it('prints an em dash for an untaxed line instead of "VAT 0%"', () => {
    const html = render({
      lines: [
        {
          description: 'Exempt item',
          quantity: 10_000,
          unitPriceMinor: 1_000,
          discountMinor: 0,
          taxMinor: 0,
          lineTotalMinor: 1_000,
          taxPercentBp: 0,
        },
      ],
    });
    expect(html).toContain('of-c-tax">—<');
  });

  it('prints the document number on the number line', () => {
    const html = render({ documentNumber: 'S00252' });
    expect(html).toContain('S00252');
  });

  it('prints a line note as a second line under the description', () => {
    const html = render({
      lines: [
        {
          description: 'Car Battry (AMARON 55)',
          subDescription: '1 Years Warranty Car Battry (AMARON 55).',
          quantity: 10_000,
          unitPriceMinor: 22_500,
          discountMinor: 0,
          taxMinor: 2_250,
          lineTotalMinor: 24_750,
          taxPercentBp: 1000,
        },
      ],
    });
    expect(html).toContain('of-line-name">Car Battry (AMARON 55)</span>');
    expect(html).toContain('of-line-sub">1 Years Warranty Car Battry (AMARON 55).</span>');
  });

  it('never prints a line SKU under the description', () => {
    // The approved reference sheet carries no SKU column and no SKU line, so a
    // product code must not leak into the printed form even when the payload
    // still carries one from the source record.
    const html = render({
      lines: [
        {
          description: 'Oil (Havoline 5w20)',
          sku: 'AC-REFRIGERANT',
          quantity: 10_000,
          unitPriceMinor: 7_500,
          discountMinor: 0,
          taxMinor: 750,
          lineTotalMinor: 8_250,
          taxPercentBp: 1000,
        },
      ],
    });
    expect(html).not.toContain('AC-REFRIGERANT');
    expect(html).not.toContain('of-line-sku');
  });

  it('splits a legacy description that carries its note after a newline', () => {
    const html = render({
      lines: [
        {
          description: 'Car Battry (AMARON 55)\n1 Years Warranty Car Battry (AMARON 55).',
          quantity: 10_000,
          unitPriceMinor: 22_500,
          discountMinor: 0,
          taxMinor: 2_250,
          lineTotalMinor: 24_750,
          taxPercentBp: 1000,
        },
      ],
    });
    expect(html).toContain('of-line-name">Car Battry (AMARON 55)</span>');
    expect(html).toContain('of-line-sub">1 Years Warranty Car Battry (AMARON 55).</span>');
  });
});

describe('official financial template — totals block', () => {
  it('prints the four reference totals rows', () => {
    const html = render();
    for (const label of ['Untaxed Amount', 'Tax 10%', 'Discount', 'Total']) {
      expect(html).toContain(label);
    }
  });

  it('states the effective rate it charged, not a hard-coded one', () => {
    const html = render({ taxRateBp: 500 });
    expect(html).toContain('Tax 5%');
    expect(html).not.toContain('Tax 10%');
  });

  it('adds Paid and Balance Due only when money has been received', () => {
    expect(render()).not.toContain('Balance Due');
    const settled = render({ paidMinor: 8_250, balanceMinor: 0 });
    expect(settled).toContain('Paid');
    expect(settled).toContain('Balance Due');
  });

  it('prints a Rounding row only when rounding was applied', () => {
    expect(render()).not.toContain('Rounding');
    expect(render({ roundingMinor: 15 })).toContain('Rounding');
  });
});

describe('official financial template — settlement and salesperson', () => {
  it('prints the settlement method as a Payment line', () => {
    expect(render()).toContain('Payment');
    expect(render()).toContain('Cash');
  });

  it('maps a wallet settlement to Benefit Pay', () => {
    expect(render({ paymentMethod: 'WALLET' })).toContain('Benefit Pay');
  });

  it('omits the Payment row when no method is stored', () => {
    expect(render({ paymentMethod: null })).not.toContain('>Payment<');
  });

  it('prints the salesperson as "Staf Name", matching the reference spelling', () => {
    expect(render()).toContain('Staf Name');
    expect(render()).toContain('Hussain Alhaddad');
  });
});

describe('official financial template — document direction', () => {
  it('prints an English document left-to-right', () => {
    const html = render({}, { ...issuer, documentLocale: 'en' });
    expect(html).toContain('<html lang="en" dir="ltr">');
  });

  it('prints an Arabic document right-to-left', () => {
    const html = render({}, { ...issuer, documentLocale: 'ar' });
    expect(html).toContain('<html lang="ar" dir="rtl">');
  });

  it('defaults to left-to-right when the tenant has not chosen a language', () => {
    const html = render({}, { ...issuer, documentLocale: null });
    expect(html).toContain('dir="ltr"');
  });

  it('prints the Latin currency symbol on an English document', () => {
    const html = render({}, { ...issuer, documentLocale: 'en' });
    expect(html).toContain('BD');
    expect(html).not.toContain('د.ب');
  });

  it('prints the Arabic currency symbol on an Arabic document', () => {
    const html = render({}, { ...issuer, documentLocale: 'ar' });
    expect(html).toContain('د.ب');
  });
});

describe('official financial template — reference titles', () => {
  it('names an invoice page "فاتورة / INVOICE", not the catalogue label', () => {
    const html = render({ titleEn: 'Tax Invoice', titleAr: 'فاتورة ضريبية' });
    expect(html).toContain('>INVOICE<');
    expect(html).toContain('>فاتورة<');
    expect(html).not.toContain('فاتورة ضريبية');
  });

  it('names a quotation page "تسعيرة / QUOTATION"', () => {
    const html = render({ titleEn: 'Quotation', titleAr: 'عرض سعر' });
    expect(html).toContain('>QUOTATION<');
    expect(html).toContain('>تسعيرة<');
  });

  it('names a receipt page "سند قبض / RECEIPT", not "فاتورة / INVOICE"', () => {
    const html = render({ titleEn: 'Payment Receipt', titleAr: 'سند قبض' });
    expect(html).toContain('>RECEIPT<');
    expect(html).toContain('>سند قبض<');
    expect(html).not.toContain('>INVOICE<');
  });

  it('names a voucher page "سند صرف / VOUCHER"', () => {
    const html = render({ titleEn: 'Payment Voucher', titleAr: 'سند صرف' });
    expect(html).toContain('>VOUCHER<');
    expect(html).toContain('>سند صرف<');
  });

  it('names a POS receipt page "إيصال نقطة بيع / POS RECEIPT"', () => {
    const html = render({ titleEn: 'POS Receipt', titleAr: 'إيصال نقطة بيع' });
    expect(html).toContain('>POS RECEIPT<');
    expect(html).toContain('>إيصال نقطة بيع<');
  });
});

describe('official financial template — quotation payment reference', () => {
  it('prints the bank reference beneath the payment line', () => {
    const html = render({ titleEn: 'Quotation', paymentReference: 'NBB0155NH15454475' });
    expect(html).toContain('NBB0155NH15454475');
  });

  it('omits the reference line when none is stored', () => {
    expect(render({ paymentReference: null })).not.toContain('NBB0155NH15454475');
  });
});

describe('official financial template — identity', () => {
  it('prints the bilingual title and the ORYX tagline', () => {
    const html = render();
    expect(html).toContain('>فاتورة<');
    expect(html).toContain('VEHICLE INSPECTION EXPERTS');
  });

  it('prints the issuer TRN when one is configured', () => {
    expect(render()).toContain('TRN:');
    expect(render()).toContain('200001111222111');
  });

  it('omits the TRN strip when no tax number is configured', () => {
    const html = render({}, { ...issuer, taxNumber: null });
    // The class name is always in the stylesheet; assert on the rendered strip.
    expect(html).not.toContain('class="of-trn"');
  });

  it('falls back to a typographic wordmark when no logo is uploaded', () => {
    const html = render({}, { ...issuer, logoDataUri: null });
    expect(html).toContain('of-wordmark-en');
    expect(html).not.toContain('<img class="of-logo"');
  });

  it('uses the uploaded logo when one exists', () => {
    const html = render({}, { ...issuer, logoDataUri: 'data:image/png;base64,AAAA' });
    expect(html).toContain('<img class="of-logo"');
  });

  it('escapes a customer name rather than emitting raw markup', () => {
    const html = render({
      counterparty: {
        ...payload().counterparty,
        nameEn: '<script>alert(1)</script>',
      },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('official financial template — reference watermark parity (Execution 19)', () => {
  it('sets the AUTO SERVICES watermark in the brand display face at the measured size', () => {
    const html = render();
    expect(html).toContain('class="of-watermark"');
    expect(html).toContain("font-family:'ORYX Display'");
    expect(html).toContain('font-size:51.747pt');
    expect(html).toContain('letter-spacing:6.72pt');
    expect(html).toMatch(/opacity:0\.10/);
  });

  it('keeps the header badge inside the printable box so the sheet is not scaled', () => {
    const html = render();
    // A negative right offset made the page wider than the sheet, which made
    // Chromium shrink the whole invoice and drift every measured size.
    expect(html).toContain('.of-badge{ position:absolute; right:0; top:13pt');
    expect(html).not.toContain('right:-8.6pt');
  });
});
