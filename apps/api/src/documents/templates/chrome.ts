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
        ${issuer.taxNumber ? `<span>CR / VAT: <span class="num">${esc(issuer.taxNumber)}</span></span>` : ''}
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
  if (!verification) return '';
  return `
  <section class="verify avoid-break">
    <div class="verify-qr">
      <img src="${esc(verification.qrDataUri)}" alt="QR verification code">
    </div>
    <div class="verify-text">
      <div class="verify-title">التحقق من صحة المستند</div>
      <div class="verify-sub">Document authenticity verification</div>
      <p class="verify-body">
        امسح رمز الاستجابة السريعة أو افتح الرابط أدخل رمز التحقق للتأكد من أن هذا المستند
        صادر رسميًا من النظام ولم يُعدّل.
      </p>
      <p class="verify-body ltr">
        Scan the QR code or visit the address below and enter the verification code to confirm
        this document was issued by the system and has not been altered.
      </p>
      <div class="verify-code num">${esc(verification.token)}</div>
      <div class="verify-url ltr">${esc(verification.url)}</div>
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
  const meta = [address, issuer.taxNumber ? `CR / VAT: ${issuer.taxNumber}` : '', contact]
    .filter(Boolean)
    .join('  ·  ');
  const style = [
    'font-family:Arial,Helvetica,sans-serif',
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
    <span style="font-weight:700;color:#0b2545;">${esc(chrome.documentNumber)}</span>
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
    border-bottom:3px solid var(--navy); padding-bottom:8px; }
  .doc-head-left{ flex:1 1 auto; }
  .doc-head-right{ flex:0 0 auto; margin-inline-start:14px; }
  .doc-issuer-en{ font-size:15pt; font-weight:700; color:var(--navy); }
  .doc-issuer-ar{ font-size:12pt; color:var(--navy-soft); }
  .doc-issuer-meta{ margin-top:4px; font-size:8.5pt; color:var(--muted); display:flex; gap:10px; flex-wrap:wrap; }
  .doc-logo{ height:46px; width:auto; }
  .doc-monogram{ width:46px; height:46px; border-radius:8px; background:var(--navy);
    color:var(--gold); display:flex; align-items:center; justify-content:center;
    font-weight:700; font-size:17pt; letter-spacing:.5px; }
  .doc-title-band{ display:flex; justify-content:space-between; align-items:baseline;
    margin-top:10px; border-inline-start:5px solid var(--gold); padding-inline-start:10px; }
  .doc-title-ar{ font-size:16pt; font-weight:700; color:var(--navy); }
  .doc-title-en{ font-size:10pt; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }
  .doc-idbar{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .doc-idbar-item{ flex:1 1 30%; border:1px solid var(--line); border-radius:5px; padding:5px 8px; background:#f7f9fc; }
  .doc-idbar-wide{ flex:1 1 100%; }
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
  .sig-label-en{ font-size:7.5pt; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
`;
