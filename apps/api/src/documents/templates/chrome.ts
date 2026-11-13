import { esc, docDateTime } from './html.util';
import type { DocumentIssuer, DocumentVerification } from '../document-payload';

/**
 * The header, footer and verification block shared by every document.
 *
 * Kept in one place so the identity band, the gold rule and the QR block cannot
 * drift between the inspection report and an invoice. The visual language is the
 * approved ORYX one: deep navy, a single gold rule, restrained type.
 */

export interface DocumentChrome {
  issuer: DocumentIssuer;
  titleEn: string;
  titleAr: string;
  documentNumber: string;
  issuedAt: Date;
  verification?: DocumentVerification | null;
  /** Extra line under the title, e.g. the vehicle identity on a report. */
  subtitle?: string | null;
}

/**
 * The subset of the chrome a page footer template needs.
 *
 * Deliberately narrower than `DocumentChrome`: the footer is its own document
 * and never renders the title, the timestamp or the verification block, so
 * requiring them would make every caller pass values it does not use.
 */
export interface DocumentFooterInput {
  issuer: DocumentIssuer;
  titleEn: string;
  titleAr: string;
  documentNumber: string;
}

function logoBlock(issuer: DocumentIssuer): string {
  if (issuer.logoDataUri) {
    return `<img class="doc-logo" src="${esc(issuer.logoDataUri)}" alt="${esc(issuer.nameEn)}">`;
  }
  // No configured logo: a typographic monogram rather than an invented mark.
  const initials = (issuer.nameEn || 'ORYX')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return `<div class="doc-monogram">${esc(initials || 'OR')}</div>`;
}

/**
 * The faint ORYX watermark behind the page content.
 *
 * Rendered as the official logo at low opacity, placed *behind* the content and
 * non-interactive. The opacity is deliberately low enough that black body text
 * and the navy table headings stay fully legible on top of it — a watermark that
 * competes with the data is worse than none.
 */
export function documentWatermark(issuer: DocumentIssuer): string {
  if (!issuer.logoDataUri) return '';
  return `<div class="doc-watermark" aria-hidden="true"><img src="${esc(issuer.logoDataUri)}" alt=""></div>`;
}

/** The running header on the first page of a document. */
export function documentHeader(chrome: DocumentChrome): string {
  const { issuer } = chrome;
  return `
  <header class="doc-head">
    <div class="doc-head-left">
      <div class="doc-issuer-en">${esc(issuer.nameEn)}</div>
      ${issuer.nameAr ? `<div class="doc-issuer-ar">${esc(issuer.nameAr)}</div>` : ''}
      <div class="doc-issuer-meta">
        ${issuer.taxNumber ? `<span>VAT: <span class="num">${esc(issuer.taxNumber)}</span></span>` : ''}
        ${issuer.crNumber ? `<span>CR: <span class="num">${esc(issuer.crNumber)}</span></span>` : ''}
        ${issuer.phone ? `<span class="num">${esc(issuer.phone)}</span>` : ''}
        ${issuer.email ? `<span class="ltr">${esc(issuer.email)}</span>` : ''}
      </div>
    </div>
    <div class="doc-head-right">
      ${logoBlock(issuer)}
    </div>
  </header>
  <div class="doc-title-band">
    <div class="doc-title-ar">${esc(chrome.titleAr)}</div>
    <div class="doc-title-en">${esc(chrome.titleEn)}</div>
  </div>
  <div class="doc-idbar">
    <div class="doc-idbar-item">
      <span class="doc-idbar-label">رقم المستند / Document No.</span>
      <span class="doc-idbar-value num">${esc(chrome.documentNumber)}</span>
    </div>
    <div class="doc-idbar-item">
      <span class="doc-idbar-label">تاريخ الإصدار / Issue Date</span>
      <span class="doc-idbar-value num">${esc(docDateTime(chrome.issuedAt))}</span>
    </div>
    ${
      chrome.subtitle
        ? `<div class="doc-idbar-item doc-idbar-wide">
             <span class="doc-idbar-label">الموضوع / Subject</span>
             <span class="doc-idbar-value">${esc(chrome.subtitle)}</span>
           </div>`
        : ''
    }
  </div>`;
}

/**
 * The verification block: the QR code, the token and the plain-language
 * instruction.
 *
 * The token is printed in full as well as encoded, so a document that is
 * photocopied or scanned at an angle — where the QR is unreadable — can still be
 * verified by typing the code.
 */
export function verificationBlock(
  verification: DocumentVerification | null | undefined,
): string {
  if (!verification?.qrDataUri) return '';

  return `
    <section class="verify avoid-break">
      <div class="verify-qr">
        <img
          src="${esc(verification.qrDataUri)}"
          alt="Document verification QR code"
        >
      </div>
    </section>`;
}

/** The signature strip, used where a document is countersigned. */
export function signatureBlock(
  labels: Array<{ ar: string; en: string; name?: string | null }>,
): string {
  if (labels.length === 0) return '';
  return `
  <section class="signatures avoid-break">
    ${labels
      .map(
        (l) => `
      <div class="sig">
        <div class="sig-line"></div>
        <div class="sig-name">${l.name ? esc(l.name) : '&nbsp;'}</div>
        <div class="sig-label-ar">${esc(l.ar)}</div>
        <div class="sig-label-en">${esc(l.en)}</div>
      </div>`,
      )
      .join('')}
  </section>`;
}

/**
 * Contact icons for the page footer templates.
 *
 * Inline SVG, sized to the footer's 6.5pt text, because a page template cannot
 * rely on an embedded face (see `officialFooterTemplate`).
 */
export const CONTACT_ICON_PHONE =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#1f2d3d" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.5px">' +
  '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 ' +
  '2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.2a2 ' +
  '2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/></svg>';

export const CONTACT_ICON_MAIL =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#1f2d3d" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.5px">' +
  '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';

export const CONTACT_ICON_GLOBE =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#1f2d3d" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.5px">' +
  '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>' +
  '<path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"/></svg>';

/**
 * The brand band the approved sheets print above the contact row.
 *
 * Both the tax invoice and the inspection report carry the same band: the ORYX
 * lockup on both outer edges with the closing line centred between them
 * (measured y 755-807 of an 842pt page). It is a Chromium page template, so it
 * lives inside the bottom margin and repeats at the same height on every page
 * regardless of how full that page is.
 *
 * The template is its own document: Chromium ignores an `@font-face` declared
 * there, so the Arabic closing line relies on the host's fallback face and the
 * logo is a data URI rather than an embedded file.
 */
function brandBand(issuer: DocumentIssuer): string {
  // The reference prints two bordered signature boxes on the outer edges with a
  // compact ORYX lockup and the closing line centred between them (measured
  // boxes x14-254 and x341-581, y755-807; the centre lockup at x257-337). The
  // outer edges are *not* the full logotype — the signature labels sit inside
  // those boxes — so the band renders the boxes and the small centred mark.
  const mark = issuer.logoDataUri
    ? `<img src="${esc(issuer.logoDataUri)}" alt="" style="height:19pt;width:auto;display:block;margin:0 auto">`
    : '';
  const box =
    'flex:0 0 auto;width:239.8pt;height:51.8pt;box-sizing:border-box;' +
    'border:0.75px solid #a3b1c2;border-radius:6pt;padding:5pt 9pt;white-space:nowrap;';
  const label = 'font-size:7.5pt;font-weight:700;color:#0f2b48;';
  const labelAr = 'font-size:7.5pt;font-weight:700;color:#0f2b48;direction:rtl;unicode-bidi:embed;';
  return `
  <div style="padding:0 14pt;display:flex;align-items:flex-start;justify-content:space-between;">
    <div style="${box}">
      <span style="${label}">Authorized Stamp &amp; Signature</span>
      <span style="${labelAr}">اعتماد المركز</span>
    </div>
    <div style="flex:0 0 auto;width:80pt;text-align:center;padding-top:1pt;line-height:1.15;">
      ${mark}
      <div style="font-size:8.3pt;font-weight:700;letter-spacing:.5px;color:#0f2b48;">AUTO SERVICES</div>
      <div style="font-size:5.6pt;font-weight:700;color:#0f2b48;direction:rtl;unicode-bidi:embed;margin-top:3pt;">شكراً لثقتكم بنا.</div>
      <div style="font-size:5.6pt;color:#64748b;">Thank you for your trust.</div>
    </div>
    <div style="${box}">
      <span style="${label}">Customer Signature</span>
      <span style="${labelAr}">توقيع العميل</span>
    </div>
  </div>`;
}

/**
 * The contact footer for the official financial layout.
 *
 * Reproduces the printed reference: the brand band (see `brandBand`), a hairline
 * rule, then the phone, email and website on one line with the page counter, and
 * the registered address beneath. Like `footerTemplate` it is a Chromium page
 * template, so it lives inside the bottom margin and cannot push content onto a
 * blank page.
 */
export function officialFooterTemplate(issuer: DocumentIssuer): string {
  const base = [
    'font-family:Verdana,Arial,Helvetica,sans-serif',
    'color:#64748b',
    '-webkit-print-color-adjust:exact',
  ].join(';');
  return `
<div style="${base};width:100%;box-sizing:border-box;position:relative;top:4pt;">
  ${brandBand(issuer)}
  ${contactRow(issuer)}
</div>`;
}

/**
 * The contacts row the footer templates share: a hairline rule, then the page
 * counter, the phone and email, and the website on one line, with the
 * registered address (and its CR number) flush right beneath.
 *
 * The VAT/TRN is the navy strip at the top of the page, so it is deliberately
 * not repeated here. The contact icons are inline SVG, not emoji: a footer
 * template is its own document, so Chromium ignores an `@font-face` declared
 * there and the glyphs come from the host's fallback face, where a phone/globe
 * emoji (U+1F4DE / U+1F310) is absent and printed as a broken box.
 *
 * The reference prints the page counter bilingually ("Page 1 of 1 • 1 من 1
 * صفحة"); both counters carry the same placeholders, which Chromium fills on
 * every page. The contact figures are 7.2pt in the reference (measured), a step
 * heavier and darker than the 6.5pt counter and address.
 */
function contactRow(issuer: DocumentIssuer): string {
  const phone = issuer.phone ? `${CONTACT_ICON_PHONE} ${esc(issuer.phone)}` : '';
  const email = issuer.email ? `${CONTACT_ICON_MAIL} ${esc(issuer.email)}` : '';
  const website = issuer.websiteUrl ? `${CONTACT_ICON_GLOBE} ${esc(issuer.websiteUrl)}` : '';
  const address = [issuer.addressLine, issuer.city].filter(Boolean).join(' - ');
  const registration = issuer.crNumber ? `CR ${esc(issuer.crNumber)}` : '';
  const addressLine = [address, registration].filter(Boolean).join(' | ');
  const contact = 'font-size:7.2pt;font-weight:700;color:#475569';
  return `
  <div style="border-top:0.75px solid #94a3b8;margin:10px 15.8pt 0 13.7pt;"></div>
  <div style="padding:0 13.3mm 0 15mm;display:flex;justify-content:space-between;align-items:baseline;font-size:6.5pt;font-weight:700;">
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span> &bull; <span style="direction:rtl;unicode-bidi:embed;display:inline-block;"><span class="pageNumber"></span> من <span class="totalPages"></span> صفحة</span></span>
    <span style="${contact}">${phone}${phone && email ? ' &nbsp; ' : ''}${email}</span>
    <span style="${contact}">${website}</span>
  </div>
  ${
    addressLine
      ? `<div style="margin-top:2px;padding-inline-end:13.3mm;text-align:end;font-size:6.5pt;color:#64748b;">${esc(addressLine)}</div>`
      : ''
  }`;
}

/**
 * The inspection report's page footer.
 *
 * The approved report prints a *different* footer on the cover than on the
 * section pages: the cover carries the two bordered signature boxes flanking
 * the centred lockup (reproduced in flow by the cover section itself), while
 * pages two to five carry a compact left-aligned lockup, the closing line and a
 * small verification QR captioned `للتأكد من صحة التقرير`. Chromium paints one
 * footer template on every page, so the boxes cannot live here — a template
 * would repeat them on the inner pages, which the approved sheet does not do.
 * The template therefore prints the section-page shape, and the cover supplies
 * its own boxes in flow.
 *
 * The QR is the document's own verification code, so scanning any section page
 * resolves the same report. It is painted from a data URI because a page
 * template is its own document and cannot read the fonts or images of the page.
 */
export function reportFooterTemplate(issuer: DocumentIssuer, qrDataUri?: string): string {
  const base = [
    'font-family:Verdana,Arial,Helvetica,sans-serif',
    'color:#64748b',
    '-webkit-print-color-adjust:exact',
  ].join(';');
  // The lockup band is kept at the invoice band's height (see `brandBand`) so
  // the contacts row lands on the reference's measured y positions on every
  // page rather than riding up when the band is short.
  const lockup = `
  <div style="line-height:1.15;">
    <div style="font-size:8.3pt;font-weight:700;letter-spacing:.5px;color:#0f2b48;">AUTO SERVICES</div>
    <div style="font-size:5.6pt;font-weight:700;color:#0f2b48;direction:rtl;unicode-bidi:embed;margin-top:3pt;">شكراً لثقتكم بنا.</div>
    <div style="font-size:5.6pt;color:#64748b;">Thank you for your trust.</div>
  </div>`;
  // The reference prints the verify caption above a 33pt QR at x137-170, y774-807
  // (measured), i.e. to the right of the lockup and a step lower.
  const verify = qrDataUri
    ? `
  <div style="text-align:center;line-height:1;">
    <div style="font-size:4.9pt;font-weight:700;color:#0f2b48;direction:rtl;unicode-bidi:embed;margin-bottom:8pt;">للتأكد من صحة التقرير</div>
    <img src="${esc(qrDataUri)}" alt="" style="width:33pt;height:33pt;display:block;">
  </div>`
    : '';
  return `
<div style="${base};width:100%;box-sizing:border-box;position:relative;top:4pt;">
  <div style="padding:0 15.8pt;min-height:52pt;display:flex;align-items:flex-end;">
    <div style="flex:0 0 auto;margin-left:26pt;">${lockup}</div>
    ${verify ? `<div style="flex:0 0 auto;margin-left:17pt;">${verify}</div>` : ''}
  </div>
  ${contactRow(issuer)}
</div>`;
}

/**
 * The running footer, rendered by Chromium as a page *footer template*.
 *
 * A footer in the normal flow sits after the content, so a document that only
 * just fits is pushed onto a second page whose only content is the footer. The
 * template is painted inside the bottom page margin instead, which keeps the
 * footer at the foot of every printed page and consumes no content height.
 *
 * The template is its own document: it cannot rely on the page stylesheet, the
 * embedded Arabic faces or the CSS variables, so everything is inlined and the
 * identity is Latin-only. The Arabic identity belongs in the in-flow header.
 * `.pageNumber` and `.totalPages` are substituted by Chromium, and it only
 * performs that substitution when the template declares a `font-size`.
 */
export function footerTemplate(chrome: DocumentFooterInput): string {
  const issuer = chrome.issuer;
  const contact = [issuer.phone, issuer.email, issuer.websiteUrl].filter(Boolean).join(' · ');
  const address = [issuer.addressLine, issuer.city].filter(Boolean).join(', ');
  const registration = [
    issuer.crNumber ? `CR ${issuer.crNumber}` : '',
    issuer.taxNumber ? `VAT ${issuer.taxNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const meta = [address, registration, contact].filter(Boolean).join('  ·  ');
  const style = [
    'font-family:Verdana,Arial,Helvetica,sans-serif',
    'font-size:8px',
    'color:#5b6472',
    'width:100%',
    'padding:0 12mm',
    'box-sizing:border-box',
    '-webkit-print-color-adjust:exact',
  ].join(';');
  return `
<div style="${style}">
  <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #9aa4b2;padding-top:4px;">
    <span>${esc(issuer.nameEn)}${issuer.code ? ` · ${esc(issuer.code)}` : ''}</span>
    <span style="font-weight:700;color:#0F2B48;">${esc(chrome.documentNumber)}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
  ${meta ? `<div style="margin-top:2px;text-align:center;font-size:7px;">${esc(meta)}</div>` : ''}
</div>`;
}

/** The CSS for the shared chrome. */
export const CHROME_CSS = `
  .doc-watermark{ position:absolute; inset:0; display:flex; align-items:center;
    justify-content:center; pointer-events:none; z-index:-1; }
  .doc-watermark img{ width:78%; height:auto; opacity:0.05; }
  .doc-head{ position:relative; z-index:1; display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom:3px solid var(--navy); padding-bottom:6px; }
  .doc-head-left{ flex:1 1 auto; }
  .doc-head-right{ flex:0 0 auto; margin-inline-start:14px; }
  .doc-issuer-en{ font-size:15pt; font-weight:700; color:var(--navy); }
  .doc-issuer-ar{ font-size:12pt; color:var(--navy-soft); }
  .doc-issuer-meta{ margin-top:4px; font-size:8.5pt; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; }
  /* The approved lockup prints the mark at 136pt wide (its 41.8pt height is
   * driven by the mark's own aspect). The previous 46px box printed it at
   * 124pt, visibly smaller than the reference. */
  .doc-logo{ height:51px; width:auto; }
  .doc-monogram{ width:46px; height:46px; border-radius:8px; background:var(--navy);
    color:var(--gold); display:flex; align-items:center; justify-content:center;
    font-weight:700; font-size:17pt; letter-spacing:.5px; }
  .doc-title-band{ display:flex; justify-content:space-between; align-items:baseline;
    margin-top:6px; border-inline-start:5px solid var(--gold); padding-inline-start:10px; }
  .doc-title-ar{ font-size:16pt; font-weight:700; color:var(--navy); }
  .doc-title-en{ font-size:10pt; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }
  .doc-idbar{ display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
  .doc-idbar-item{ flex:1 1 30%; border:1px solid var(--line); border-radius:5px; padding:3px 8px; background:#f7f9fc; }
  .doc-idbar-wide{ flex:1 1 34%; }
  .doc-idbar-label{ display:block; font-size:7.5pt; color:var(--muted); }
  .doc-idbar-value{ display:block; font-size:10.5pt; font-weight:700; color:var(--navy); }
  .verify{ display:flex; gap:12px; align-items:center; margin-top:14px;
    border:1px solid var(--line-strong); border-radius:6px; padding:10px; background:#fbfcfe; }
  .verify-qr img{ width:96px; height:96px; display:block; }
  .verify-text{ flex:1 1 auto; }
  .verify-title{ font-size:11pt; font-weight:700; color:var(--navy); }
  .verify-sub{ font-size:8pt; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
  .verify-body{ font-size:8pt; color:var(--muted); margin:4px 0 0; }
  .verify-code{ margin-top:6px; font-size:9.5pt; font-weight:700; color:var(--ink);
    word-break:break-all; border:1px dashed var(--line-strong); border-radius:4px; padding:4px 6px; background:#fff; }
  .verify-url{ font-size:8pt; color:var(--navy-soft); margin-top:3px; word-break:break-all; }
  /* Kept compact on purpose: an invoice that fits one page must not spill a
     page whose only content is the signature strip. */
  .signatures{ display:flex; gap:20px; margin-top:10px; }
  .sig{ flex:1 1 0; text-align:center; }
  .sig-line{ border-bottom:1px solid var(--ink); height:22px; }
  .sig-name{ font-size:9.5pt; font-weight:700; margin-top:3px; }
  .sig-label-ar{ font-size:8.5pt; color:var(--ink); }
  .sig-label-en{ font-size:7.5pt; color:var(--muted); letter-spacing:.2px; }
`;
