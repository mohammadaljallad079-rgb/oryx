import type { ReportResultDto } from '@oryx/shared';
import type { DocumentIssuer } from '../document-payload';
import { renderReportHtml } from './report-document.template';

const issuer = {
  companyId: 'company-1',
  nameEn: 'Example Trading',
  nameAr: 'شركة تجريبية',
  code: 'EXAMPLE',
  currency: 'BHD',
  taxNumber: '123456789',
  documentLocale: 'ar',
} as DocumentIssuer;

const report = {
  kind: 'sales',
  titleAr: 'تقرير المبيعات',
  titleEn: 'Sales Report',
  generatedAt: '2026-11-17T10:00:00.000Z',
  from: '2026-11-01',
  to: '2026-11-17',
  columns: [
    { key: 'name', labelAr: 'الاسم', labelEn: 'Name', format: 'text' },
    { key: 'amount', labelAr: 'المبلغ', labelEn: 'Amount', format: 'money', align: 'end', total: true },
  ],
  rows: [{ name: 'Sale A', amount: 12500 }],
  totals: { amount: 12500 },
  rowCount: 1,
  truncated: false,
} as unknown as ReportResultDto;

describe('report PDF invoice design parity', () => {
  it('shares the official identity, bilingual title, tax strip and print fonts', () => {
    const html = renderReportHtml({ issuer, result: report, baseCss: '/* embedded-fonts */' });
    expect(html).toContain('/* embedded-fonts */');
    expect(html).toContain('class="of-band"');
    expect(html).toContain('class="of-trn"');
    expect(html).toContain('TRN:');
    expect(html).toContain('تقرير المبيعات');
    expect(html).toContain('Sales Report');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('class="rep-table"');
    expect(html).toContain('Sale A');
    expect(html).not.toContain('class="of-verify"');
  });

  it('honours the English document language and empty report', () => {
    const html = renderReportHtml({
      issuer: { ...issuer, documentLocale: 'en' },
      result: { ...report, rows: [], rowCount: 0 },
      baseCss: '',
    });
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('No data in this period.');
  });
});
