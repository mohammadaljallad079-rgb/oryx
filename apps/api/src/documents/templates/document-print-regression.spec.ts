import type { DocumentIssuer } from '../document-payload';
import {
  footerTemplate,
  officialFooterTemplate,
  reportFooterTemplate,
} from './chrome';
import { identityBand, renderOfficialFinancialHtml, OFFICIAL_FINANCIAL_CSS } from './official-financial.template';
import type { FinancialDocumentPayload } from '../document-payload';
import { OFFICIAL_PDF_MARGINS } from '../pdf/pdf-renderer.service';

const issuer: DocumentIssuer = {
  companyId: 'test-company',
  nameEn: 'ORYX AUTO SERVICES',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX',
  currency: 'BHD',
  documentLocale: 'ar',
  crNumber: '12345',
};

describe('official print layout regressions', () => {
  it('uses only English page numbering below the footer rule on financial reports and receipts', () => {
    const footer = officialFooterTemplate(issuer);
    expect(footer).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
    expect(footer).not.toContain('صفحة <span class="pageNumber">');
    expect(footer).toContain('top:2pt;direction:ltr');
  });

  it('keeps English-only page numbers for generic and inspection document footers', () => {
    const generic = footerTemplate({
      issuer,
      titleEn: 'Invoice',
      titleAr: 'فاتورة',
      documentNumber: 'S00001',
    });
    expect(generic).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
    const inspection = reportFooterTemplate(issuer);
    expect(inspection).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
    expect(inspection).not.toContain('صفحة <span class="pageNumber">');
  });

  it('keeps the approved Arabic tagline and blue check mark in the shared upper-right identity', () => {
    const html = identityBand(issuer);
    expect(html).toContain('خبراء فحص المركبات');
    expect(html).toContain('VEHICLE INSPECTION EXPERTS');
    expect(html).toContain('class="of-badge"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('M12.48,12.16 C13.53,10.02');
    expect(html).toContain('M21.70,6.62 L19.98,8.34');
    expect(html).not.toContain('<circle cx="12" cy="12" r="11"');
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('lang="en" dir="ltr"');
  });

  it('uses the invoice identity and each document\'s own bilingual title, sequence and date label', () => {
    const make = (titleEn: string, titleAr: string, number: string) => {
      const payload: FinancialDocumentPayload = {
        kind: 'FINANCIAL', titleEn, titleAr, documentNumber: number,
        documentDate: '2026-11-19', dueDate: null, status: 'POSTED',
        counterparty: {
          nameEn: 'Example', nameAr: 'مثال', code: 'EX', taxNumber: null,
          email: null, phone: null, addressLine: null, city: null, countryCode: null,
        },
        lines: [], subtotalMinor: 0, discountMinor: 0, taxMinor: 0,
        totalMinor: 0, paidMinor: 0, balanceMinor: 0, currency: 'BHD',
        notes: null, payment: null, statement: null, journal: null,
      };
      return renderOfficialFinancialHtml({
        issuer, payload, documentNumber: number,
        issuedAt: new Date('2026-11-19T10:00:00Z'), verification: null, baseCss: '',
      });
    };
    const receipt = make('Payment Receipt', 'سند قبض', 'RCPT-001');
    const voucher = make('Payment Voucher', 'سند صرف', 'PV-002');
    const invoice = make('Tax Invoice', 'فاتورة ضريبية', 'INV-003');
    for (const html of [receipt, voucher, invoice]) {
      expect(html).toContain('class="of-badge"');
      expect(html).toContain('VEHICLE INSPECTION EXPERTS');
    }
    expect(receipt).toContain('سند قبض');
    expect(receipt).toContain('RECEIPT #');
    expect(receipt).toContain('RCPT-001');
    expect(receipt).toContain('Receipt Date');
    expect(receipt).toContain('Customer / Payer');
    expect(voucher).toContain('سند صرف');
    expect(voucher).toContain('VOUCHER #');
    expect(voucher).toContain('PV-002');
    expect(voucher).toContain('Payment Date');
    expect(voucher).toContain('Supplier / Payee');
    expect(invoice).toContain('INV-003');
    expect(invoice).toContain('Customer Name');
  });

  it('uses the embedded Arabic face rather than the Latin-only display face for Arabic headings', () => {
    expect(OFFICIAL_FINANCIAL_CSS).toMatch(/\.of-title-ar\{[^}]*font-family:'ORYX Arabic'/);
    expect(OFFICIAL_FINANCIAL_CSS).toMatch(/\.of-tag-ar\{[^}]*font-family:'ORYX Arabic'/);
  });
});


describe('official footer contact visibility contract', () => {
  it('keeps the financial page body at the established 28mm margin to avoid extra invoice pages', () => {
    expect(OFFICIAL_PDF_MARGINS.bottom).toBe('28mm');
  });
  it('fits the compact signature band above the configured contact and address lines', () => {
    const html = officialFooterTemplate(issuer);
    expect(html).toContain('height:40pt');
    expect(html).toContain('border-top:0.75px solid #94a3b8');
  });
  it('renders every configured phone, email, website and address in the printable footer', () => {
    const fixture: DocumentIssuer = {
      ...issuer,
      phone: '+973 37702020',
      email: 'service@oryxbhr.com',
      websiteUrl: 'www.oryxbhr.com',
      addressLine: 'Building 886, Road 533',
      city: 'Bahrain',
    };
    const html = officialFooterTemplate(fixture);
    for (const value of ['+973 37702020', 'service@oryxbhr.com', 'www.oryxbhr.com', 'Building 886, Road 533', 'Bahrain']) {
      expect(html).toContain(value);
    }
    expect(html).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
  });
  it('does not fabricate contact details when company settings are empty', () => {
    const html = officialFooterTemplate(issuer);
    expect(html).not.toContain('service@oryxbhr.com');
    expect(html).not.toContain('+973 37702020');
  });
});
