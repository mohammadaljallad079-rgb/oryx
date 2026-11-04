import { footerTemplate, signatureBlock } from './chrome';
import type { DocumentIssuer } from '../document-payload';

const issuer: DocumentIssuer = {
  companyId: 'c1',
  nameEn: 'ORYX Auto Services',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX-AUTO',
  taxNumber: 'CR-998877',
  addressLine: 'Building 42, Road 15',
  city: 'Manama',
  phone: '+97317000000',
  email: 'billing@oryx.local',
  websiteUrl: 'https://oryx.local',
  currency: 'BHD',
};

describe('document chrome', () => {
  describe('signatureBlock', () => {
    it('emits a real non-breaking space rather than the escaped entity text', () => {
      // `esc('&nbsp;')` produced the literal text `&amp;nbsp;`, which the PDF
      // renderer then printed as `&nbsp;` in the signature strip.
      const html = signatureBlock([{ ar: 'المستلم', en: 'Received by' }]);
      expect(html).toContain('&nbsp;');
      expect(html).not.toContain('&amp;nbsp;');
    });

    it('prints a supplied signatory name', () => {
      const html = signatureBlock([{ ar: 'المستلم', en: 'Received by', name: 'A. Engineer' }]);
      expect(html).toContain('A. Engineer');
    });

    it('escapes a name that contains markup', () => {
      const html = signatureBlock([{ ar: 'x', en: 'y', name: '<script>x</script>' }]);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('footerTemplate', () => {
    it('leaves the page counter for Chromium to substitute', () => {
      const html = footerTemplate({
        issuer,
        titleEn: 'Tax Invoice',
        titleAr: 'فاتورة ضريبية',
        documentNumber: 'SI-00042',
      });
      expect(html).toContain('class="pageNumber"');
      expect(html).toContain('class="totalPages"');
      // A hardcoded counter is the defect this replaced.
      expect(html).not.toMatch(/1\s*\/\s*1/);
    });

    it('declares a font size, without which Chromium skips the substitution', () => {
      const html = footerTemplate({
        issuer,
        titleEn: 'Tax Invoice',
        titleAr: 'فاتورة ضريبية',
        documentNumber: 'SI-00042',
      });
      expect(html).toContain('font-size:');
    });

    it('carries the document number and the issuer identity', () => {
      const html = footerTemplate({
        issuer,
        titleEn: 'Tax Invoice',
        titleAr: 'فاتورة ضريبية',
        documentNumber: 'SI-00042',
      });
      expect(html).toContain('SI-00042');
      expect(html).toContain('ORYX Auto Services');
      expect(html).toContain('CR-998877');
    });

    it('escapes an issuer name rather than injecting it as markup', () => {
      const html = footerTemplate({
        issuer: { ...issuer, nameEn: '<img src=x onerror=alert(1)>' },
        titleEn: 'Tax Invoice',
        titleAr: 'فاتورة ضريبية',
        documentNumber: 'SI-1',
      });
      expect(html).not.toContain('<img');
    });
  });
});
