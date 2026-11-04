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
        <div class="sig-name">${esc(l.name ?? '&nbsp;')}</div>
        <div class="sig-label-ar">${esc(l.ar)}</div>
        <div class="sig-label-en">${esc(l.en)}</div>
      </div>`,
      )
      .join('')}
  </section>`;
}

/** The running footer printed on every page. */
export function documentFooter(chrome: DocumentChrome, page: number, total: number): string {
  return `
  <footer class="doc-foot">
    <div class="doc-foot-left">${esc(chrome.issuer.nameEn)} · ${esc(chrome.issuer.code)}</div>
    <div class="doc-foot-mid">${esc(chrome.documentNumber)}</div>
    <div class="doc-foot-right num">${page} / ${total}</div>
  </footer>`;
}

/** The CSS for the shared chrome. */
export const CHROME_CSS = `
  .doc-head{ display:flex; justify-content:space-between; align-items:flex-start;
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
  .doc-foot{ position:running(foot); }
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
  .signatures{ display:flex; gap:20px; margin-top:20px; }
  .sig{ flex:1 1 0; text-align:center; }
  .sig-line{ border-bottom:1px solid var(--ink); height:30px; }
  .sig-name{ font-size:9.5pt; font-weight:700; margin-top:3px; }
  .sig-label-ar{ font-size:8.5pt; color:var(--ink); }
  .sig-label-en{ font-size:7.5pt; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
`;
