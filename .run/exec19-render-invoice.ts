/**
 * Fast invoice/quotation parity harness.
 *
 * Renders the *real* official-financial template through the real PDF renderer
 * with a synthetic payload, so a CSS change can be measured against
 * `oryx 22.pdf` in seconds instead of a full API rebuild + re-issue.
 *
 *   pnpm tsx .run/exec19-render-invoice.mts [invoice|quotation] [out.pdf]
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentFontService } from '../apps/api/src/documents/pdf/document-fonts.service';
import { PdfRendererService, OFFICIAL_PDF_MARGINS } from '../apps/api/src/documents/pdf/pdf-renderer.service';
import { renderOfficialFinancialHtml } from '../apps/api/src/documents/templates/official-financial.template';
import { officialFooterTemplate } from '../apps/api/src/documents/templates/chrome';
import type { DocumentIssuer, FinancialDocumentPayload } from '../apps/api/src/documents/document-payload';

const kind = (process.argv[2] ?? 'invoice') as 'invoice' | 'quotation';
const out = process.argv[3] ?? `/tmp/exec19-${kind}.pdf`;

// The production path inlines the official brand mark from the API assets dir;
// the harness does the same so the measured header matches the live document.
const brandPath = join(__dirname, '..', 'apps', 'api', 'assets', 'brand', 'oryx-logo.png');
const logoDataUri = existsSync(brandPath)
  ? `data:image/png;base64,${readFileSync(brandPath).toString('base64')}`
  : null;

const issuer: DocumentIssuer = {
  companyId: 'x',
  nameEn: 'ORYX Auto Services',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX-AUTO',
  legalNameEn: 'ORYX Auto Services W.L.L.',
  taxNumber: '200001111222111',
  crNumber: '146375-2',
  addressLine: 'Bldg 886, Road 533, Block 405 Tashan',
  city: 'Kingdom of Bahrain',
  countryCode: 'BH',
  phone: '+973 37702020',
  email: 'oryxbhr1@gmail.com',
  websiteUrl: 'www.oryxbhr.com',
  currency: 'BHD',
  logoDataUri,
  primaryColor: null,
  accentColor: null,
  documentLocale: 'en',
};

const line = (
  description: string,
  unitPriceMinor: number,
  taxMinor: number,
  lineTotalMinor: number,
  subDescription?: string,
) => ({
  description,
  subDescription: subDescription ?? null,
  quantity: 10000, // 1.0000 at QUANTITY_SCALE=4
  unitPriceMinor,
  discountMinor: 0,
  taxMinor,
  lineTotalMinor,
  taxPercentBp: 1000,
});

const payload: FinancialDocumentPayload = {
  kind: 'FINANCIAL',
  titleEn: kind === 'invoice' ? 'INVOICE' : 'QUOTATION',
  titleAr: kind === 'invoice' ? 'فاتورة' : 'تسعيرة',
  documentNumber: 'S00022',
  documentDate: '2026-09-20T15:30:00.000Z',
  dueDate: kind === 'quotation' ? '2026-09-27T15:30:00.000Z' : null,
  status: 'ISSUED',
  counterparty: {
    nameEn: 'Ahmed mohamad Alhaddad',
    nameAr: 'أحمد محمد الحداد',
    code: 'C0001',
    taxNumber: null,
    email: null,
    phone: '37702020',
    addressLine: 'Villa 1455, road 5455, block 555',
    city: 'Manama',
    countryCode: 'BH',
  },
  lines: [
    line('Oil (Havoline 5w20)', 7500, 750, 8250),
    line('Oil filter Mazda - orginal', 2000, 200, 2200),
    line('Car Battry (AMARON 55)', 22500, 2250, 24750, '1 Years Warranty Car Battry (AMARON 55).'),
  ],
  subtotalMinor: 35200,
  discountMinor: 1720,
  taxMinor: 3520,
  totalMinor: 37000,
  paidMinor: 0,
  balanceMinor: 37000,
  currency: 'BHD',
  notes: null,
  paymentMethod: kind === 'invoice' ? 'Benefit Pay' : null,
  salespersonName: 'Hussain Alhaddad',
  paymentReference: kind === 'quotation' ? 'NBB0155NH15454475' : null,
} as never;

const fonts = new DocumentFontService();
const renderer = new PdfRendererService(fonts);

async function main() {
  const baseCss = await renderer.baseStyles();
  const html = renderOfficialFinancialHtml({
    issuer,
    payload,
    documentNumber: 'S00022',
    issuedAt: new Date(),
    verification: null,
    baseCss,
  });
  const { pdf } = await renderer.render(html, {
    footerHtml: officialFooterTemplate(issuer),
    margins: OFFICIAL_PDF_MARGINS,
  });
  writeFileSync(out, pdf);
  console.log('wrote', out, pdf.length, 'bytes');
  process.exit(0);
}

void main();
