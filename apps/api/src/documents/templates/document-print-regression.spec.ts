import type { DocumentIssuer } from '../document-payload';
import {
  footerTemplate,
  officialFooterTemplate,
  reportFooterTemplate,
} from './chrome';
import { identityBand, OFFICIAL_FINANCIAL_CSS } from './official-financial.template';

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
    expect(footer).toContain('top:1pt');
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
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('lang="en" dir="ltr"');
  });

  it('uses the embedded Arabic face rather than the Latin-only display face for Arabic headings', () => {
    expect(OFFICIAL_FINANCIAL_CSS).toMatch(/\.of-title-ar\{[^}]*font-family:'ORYX Arabic'/);
    expect(OFFICIAL_FINANCIAL_CSS).toMatch(/\.of-tag-ar\{[^}]*font-family:'ORYX Arabic'/);
  });
});
