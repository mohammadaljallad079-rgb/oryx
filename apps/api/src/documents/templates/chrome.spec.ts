import { footerTemplate, officialFooterTemplate, reportFooterTemplate, signatureBlock } from './chrome';
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
    it('prints English-only page numbering with Chromium placeholders', () => {
      const html = officialFooterTemplate(issuer);
      expect(html).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
      expect(html).not.toContain('صفحة <span');
      expect((html.match(/class="pageNumber"/g) || []).length).toBe(1);
      expect(html).toContain('top:2pt;direction:ltr');
    });

    it('keeps contacts in the printable footer margin below the signature band', () => {
      const html = officialFooterTemplate(issuer);
      expect(html).toContain('+97317000000');
      expect(html).toContain('https://oryx.local');
      expect(html).toContain('billing@oryx.local');
      expect(html).toContain('Building 42, Road 15');
      expect(html).toContain('Manama');
      expect(html).toContain('position:relative;top:0;');
      expect(html).toContain('border-top:0.75px solid #94a3b8;margin:3px');
      expect(html).not.toContain('top:14.8pt');
      expect(html).not.toContain('margin:20px 15.8pt');
    });

    it('wraps long footer contact details rather than hiding them off-page', () => {
      const html = officialFooterTemplate({
        ...issuer,
        phone: '+973 1700 0000',
        email: 'billing-and-reports@long-example-company.bh',
        websiteUrl: 'https://www.long-example-company.bh',
      });
      expect(html).toContain('+973 1700 0000');
      expect(html).toContain('billing-and-reports@long-example-company.bh');
      expect(html).toContain('https://www.long-example-company.bh');
      expect(html).toContain('flex-wrap:wrap;text-align:end');
      expect(html).toContain('min-width:0');
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
      expect(html).toContain('font-size:6.2pt;font-weight:700;color:#475569');
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
      // Both signature boxes flex within the printable page width so neither
      // can shove contact values off the edge of the sheet.
      expect(html).toContain('flex:1 1 0;min-width:0;height:46pt');
      expect(html).toContain('شكراً لثقتكم بنا');
      expect(html).toContain('Thank you for your trust.');
    });

    it('never repeats the full logotype at both outer edges', () => {
      // The old band printed the same image twice; the boxes must not.
      const html = officialFooterTemplate({ ...issuer, logoDataUri: 'data:image/png;base64,AAAA' });
      expect((html.match(/<img/g) || []).length).toBe(2); // centre mark plus issuer-signature watermark
    });
  });

  describe('reportFooterTemplate', () => {
    it('does not print the signature boxes on the section pages', () => {
      // The approved report carries the signature boxes on its *cover* only;
      // pages two to five print a compact left lockup and the closing line. A
      // single Chromium footer template repeats on every page, so the boxes must
      // not appear here — the cover supplies them in flow. Printing them here is
      // the defect this locks down.
      const html = reportFooterTemplate(issuer);
      expect(html).not.toContain('Authorized Stamp &amp; Signature');
      expect(html).not.toContain('Customer Signature');
      expect(html).not.toContain('border:0.75px solid #a3b1c2');
    });

    it('prints the left-aligned lockup with the closing line', () => {
      const html = reportFooterTemplate(issuer);
      expect(html).toContain('AUTO SERVICES');
      expect(html).toContain('شكراً لثقتكم بنا');
      expect(html).toContain('Thank you for your trust.');
      expect(html).toContain('align-items:flex-end');
    });

    it('prints the verification QR with its caption when given one', () => {
      // The approved section pages carry the document's verification QR beneath
      // the caption `للتأكد من صحة التقرير`, so any page resolves the same
      // report. The QR arrives as a data URI because a page template cannot read
      // the page's own images.
      const html = reportFooterTemplate(issuer, 'data:image/png;base64,AAAA');
      expect(html).toContain('للتأكد من صحة التقرير');
      expect(html).toContain('src="data:image/png;base64,AAAA"');
      expect(html).toContain('width:46pt;height:46pt');
    });

    it('omits the QR when no verification code is supplied', () => {
      // A non-verifiable document (an internal journal entry) must not print a
      // verification code it cannot honour.
      const html = reportFooterTemplate(issuer);
      expect(html).not.toContain('للتأكد من صحة التقرير');
      expect(html).not.toContain('<img');
    });

    it('keeps the shared contact row and its real page counter', () => {
      const html = reportFooterTemplate(issuer);
      expect(html).toContain('Page <span class="pageNumber"></span> of <span class="totalPages"></span>');
      expect((html.match(/class="pageNumber"/g) || []).length).toBe(1);
      expect(html).toContain('Manama');
      expect(html).toContain('CR CR-998877');
    });
  });
});
