import { footerTemplate, officialFooterTemplate, signatureBlock } from './chrome';
import type { DocumentIssuer } from '../document-payload';

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

  describe('officialFooterTemplate', () => {
    it('prints the page counter bilingually, matching the approved sheet', () => {
      const html = officialFooterTemplate(issuer);
      // English half carries the placeholders Chromium fills per page.
      expect(html).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
      // Arabic half repeats them, so both counters stay in step.
      expect(html).toContain('من <span class="totalPages"></span> صفحة');
      expect((html.match(/class="pageNumber"/g) || []).length).toBe(2);
    });

    it('keeps the registered address and CR number in the footer', () => {
      const html = officialFooterTemplate(issuer);
      expect(html).toContain('Manama');
      expect(html).toContain('CR CR-998877');
    });

    it('escapes an issuer value rather than injecting it as markup', () => {
      const html = officialFooterTemplate({ ...issuer, addressLine: '<img src=x onerror=alert(1)>' });
      expect(html).not.toContain('<img');
    });

    it('sets the contact figures above the counter and flushes the address right', () => {
      const html = officialFooterTemplate(issuer);
      // The approved sheet prints the phone/email/website a step heavier than
      // the counter, and the registered address flush right beneath it.
      expect(html).toContain('font-size:7.2pt;font-weight:700;color:#475569');
      expect(html).toContain('text-align:end');
    });

    it('prints the two signature boxes flanking the centred lockup, as the reference does', () => {
      const html = officialFooterTemplate(issuer);
      // The reference footer is not the logotype repeated at both edges: it is
      // two bordered signature boxes (authorised / customer) with the ORYX
      // lockup and the closing line centred between them. Reproducing the wrong
      // shape was the defect this locks down.
      expect(html).toContain('Authorized Stamp &amp; Signature');
      expect(html).toContain('اعتماد المركز');
      expect(html).toContain('Customer Signature');
      expect(html).toContain('توقيع العميل');
      expect(html).toContain('border:0.75px solid #a3b1c2');
      // Both boxes are the measured 239.8pt wide and the closing line sits
      // between them.
      expect((html.match(/width:239\.8pt/g) || []).length).toBe(2);
      expect(html).toContain('شكراً لثقتكم بنا');
      expect(html).toContain('Thank you for your trust.');
    });

    it('never repeats the full logotype at both outer edges', () => {
      // The old band printed the same image twice; the boxes must not.
      const html = officialFooterTemplate({ ...issuer, logoDataUri: 'data:image/png;base64,AAAA' });
      expect((html.match(/<img/g) || []).length).toBe(1);
    });
  });
});
