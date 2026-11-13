import { docStamp, esc, escMultiline, money, moneyPlain, quantity, countryName } from './html.util';
import { CHROME_CSS } from './chrome';
import { DOCUMENT_LATIN_STACK } from '../pdf/document-fonts.service';
import type {
  DocumentIssuer,
  DocumentVerification,
  FinancialDocumentPayload,
} from '../document-payload';

/**
 * The official ORYX invoice / quotation layout.
 *
 * Reproduces the approved printed document (`oryx 22.pdf`, page 1 invoice and
 * page 2 quotation) rather than the generic ERP report shape: a white identity
 * band carrying the official logo and the tagline, a centred bilingual title, a
 * navy TRN strip, a two-column document/customer panel, a five-column priced
 * table, a right-aligned totals block, a thank-you line, a signature strip and a
 * contact footer.
 *
 * Geometry and colour were measured from the source PDF (595.5 x 842.25pt A4):
 * logo band y 15-49, title y 79-94, TRN strip y 108-125, info panel y 113-226,
 * table header y 233-263, totals y 377-436. The numbers in `OFFICIAL_FINANCIAL_CSS`
 * are those measurements converted to points.
 *
 * Every value is data-driven: the tax rate, the totals rows, the payment method
 * and the salesperson come from the payload built from the saved record, so no
 * tenant's tax rate or currency is hard-coded here.
 */

export interface OfficialFinancialRenderInput {
  issuer: DocumentIssuer;
  payload: FinancialDocumentPayload;
  documentNumber: string;
  issuedAt: Date;
  verification: DocumentVerification | null;
  baseCss: string;
}

/**
 * The name and the note a priced row prints.
 *
 * Newer payloads carry the note as its own `subDescription`. A document issued
 * before that field existed stores the note after a newline in `description`, so
 * it is split here as well — a reprinted old invoice then reads exactly as the
 * approved form, with the name on the first line and the note beneath it.
 */
function lineParts(line: { description: string; subDescription?: string | null }): {
  name: string;
  note: string | null;
} {
  if (line.subDescription) return { name: line.description, note: line.subDescription };
  const [name, ...rest] = (line.description ?? '').split('\n');
  const note = rest.join(' ').trim();
  return { name: (name ?? '').trim() || line.description, note: note || null };
}

/** Which label the document's own number line carries. */
function numberLabel(titleEn: string): string {
  const t = titleEn.toLowerCase();
  if (t.includes('quotation')) return 'QUOTATION';
  if (t.includes('order')) return 'ORDER';
  if (t.includes('credit') || t.includes('return')) return 'CREDIT NOTE';
  if (t.includes('receipt')) return 'RECEIPT';
  if (t.includes('voucher')) return 'VOUCHER';
  if (t.includes('statement')) return 'STATEMENT';
  if (t.includes('journal')) return 'JOURNAL';
  return 'INVOICE';
}

/**
 * The settlement reference the printed quotation carries.
 *
 * The reference quotation shows "Payment at Account" above a bank reference
 * ("NBB0155NH15454475") where the invoice shows a plain method. It is a stored
 * value on the document, so a reprint shows the same reference.
 */
function paymentReference(payload: FinancialDocumentPayload): string | null {
  return payload.paymentReference ?? null;
}

/** The settlement-method label, printed as the reference's "Payment" line. */
function paymentLabel(payload: FinancialDocumentPayload): string | null {
  // The reference quotation prints "Payment at Account" with the bank reference
  // beneath it, rather than naming the method. Reproduce that wording whenever a
  // reference is stored, so the document reads exactly as the approved one does.
  if (paymentReference(payload)) return 'Payment at Account';
  const raw = payload.paymentMethod ?? payload.payment?.method ?? null;
  if (!raw) return null;
  const map: Record<string, string> = {
    CASH: 'Cash',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank Transfer',
    CHEQUE: 'Cheque',
    WALLET: 'Benefit Pay',
    OTHER: 'Other',
  };
  return map[raw] ?? raw;
}

/**
 * The label printed above the settlement value.
 *
 * The reference invoice labels the row "Payment" and names the method; the
 * reference quotation labels it "Payment at Account" and prints the bank
 * reference beneath. Both read exactly as the approved documents do.
 */
function paymentFieldLabel(payload: FinancialDocumentPayload): string {
  return paymentReference(payload) ? 'Payment at Account' : 'Payment';
}

/**
 * The bilingual document title exactly as the approved reference prints it.
 *
 * The reference names the page "فاتورة / INVOICE" and "تسعيرة / QUOTATION" — the
 * short words, not the ERP's longer catalogue labels ("Tax Invoice"). The
 * printed document is the artifact the owner signed off, so its words win over
 * the menu label; the catalogue label stays for the register and the pickers.
 */
function documentTitle(payload: FinancialDocumentPayload): { ar: string; en: string } {
  const t = payload.titleEn.toLowerCase();
  if (t.includes('quotation')) return { ar: 'تسعيرة', en: 'QUOTATION' };
  if (t.includes('credit') || t.includes('return')) return { ar: 'إشعار دائن', en: 'CREDIT NOTE' };
  if (t.includes('pos')) return { ar: 'إيصال نقطة بيع', en: 'POS RECEIPT' };
  if (t.includes('receipt')) return { ar: 'سند قبض', en: 'RECEIPT' };
  if (t.includes('voucher')) return { ar: 'سند صرف', en: 'VOUCHER' };
  if (t.includes('statement')) return { ar: 'كشف حساب', en: 'STATEMENT' };
  if (t.includes('journal')) return { ar: 'قيد محاسبي', en: 'JOURNAL ENTRY' };
  if (t.includes('order')) return { ar: 'طلب', en: 'ORDER' };
  return { ar: 'فاتورة', en: 'INVOICE' };
}

/** "VAT 10%" from a line's basis-point rate, or an em dash when untaxed. */
function taxLabel(bp: number | null | undefined): string {
  if (!bp) return '—';
  const percent = bp / 100;
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/\.?0+$/, '');
  return `VAT ${text}%`;
}

/** The document's own effective tax rate, taken from the payload or the lines. */
function documentTaxRate(payload: FinancialDocumentPayload): number {
  if (payload.taxRateBp) return payload.taxRateBp;
  return payload.lines.find((l) => (l.taxPercentBp ?? 0) > 0)?.taxPercentBp ?? 0;
}

/**
 * The identity band: the official logo on the leading edge and the tagline on
 * the trailing edge, measured from the approved reference (logo lockup at
 * x 16.5-154, y 16.3-49.5; tagline right-aligned at the same height).
 *
 * The tagline is fixed English/Arabic marketing copy that is part of the
 * approved identity, not tenant data, so it is written here rather than read
 * from a settings row.
 */
export function identityBand(issuer: DocumentIssuer): string {
  const logo = issuer.logoDataUri
    ? `<img class="of-logo" src="${esc(issuer.logoDataUri)}" alt="${esc(issuer.nameEn)}">`
    : `<div class="of-wordmark">
         <div class="of-wordmark-ar">اوريكس لخـدمات السيارات</div>
         <div class="of-wordmark-en">AUTO SERVICES</div>
       </div>`;
  return `
  <div class="of-band">
    <div class="of-band-lead">${logo}</div>
    <div class="of-band-trail">
      <div class="of-tag-ar">خبراء فحص المركبات</div>
      <div class="of-tag-en">VEHICLE INSPECTION EXPERTS</div>
    </div>
    <div class="of-badge" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill="#0e4477"/>
        <path d="M6.9 12.5 10.4 16 17.2 7.8" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  </div>`;
}

/**
 * The navy strip carrying the issuer's TRN.
 *
 * The reference prints it as a full-width navy band (x 26.5-571, y 108.4-125.3)
 * with the number right-aligned in white, sitting directly above the
 * document/customer panel.
 */
export function trnStrip(issuer: DocumentIssuer): string {
  if (!issuer.taxNumber) return '';
  return `
  <div class="of-trn">TRN: <span class="num">${esc(issuer.taxNumber)}</span></div>`;
}

/**
 * The verification block for the official layout: a compact, ruled strip that
 * carries the QR code, the plain-language instruction and the token.
 *
 * The approved reference predates QR verification and so carries none; the
 * requirement is that a verifiable document shows its code without disturbing
 * the approved sheet. The strip is therefore rendered only when the document is
 * verifiable (every type except the internal journal entry) and only when the
 * caller supplied a verification block, and it sits between the notes and the
 * pinned signature strip where the reference leaves its whitespace. A document
 * that is not verifiable prints nothing here, so no code is invented for it.
 */
export function verificationStrip(verification: DocumentVerification | null): string {
  if (!verification) return '';
  return `
  <div class="of-verify avoid-break">
    <div class="of-verify-qr">
      <img src="${esc(verification.qrDataUri)}" alt="QR verification code">
    </div>
    <div class="of-verify-text">
      <div class="of-verify-title">التحقق من صحة المستند · Document authenticity</div>
      <p class="of-verify-body">
        امسح رمز الاستجابة السريعة أو افتح الرابط وأدخل رمز التحقق للتأكد من أن هذا المستند صادر
        رسميًا عن النظام ولم يُعدّل. / Scan the QR code or open the address and enter the code to
        confirm this document was issued by the system and has not been altered.
      </p>
      <div class="of-verify-code num">${esc(verification.token)}</div>
      <div class="of-verify-url ltr">${esc(verification.url)}</div>
    </div>
  </div>`;
}

/** The centred bilingual document title (reference y 79.7 / 93.9). */
function titleBlock(payload: FinancialDocumentPayload): string {
  const title = documentTitle(payload);
  return `
  <div class="of-title">
    <div class="of-title-ar">${esc(title.ar)}</div>
    <div class="of-title-en">${esc(title.en)}</div>
  </div>`;
}

/** The two-column document / customer information panel. */
function infoPanel(
  payload: FinancialDocumentPayload,
  counterpartyName: string,
  dateLabel: string,
): string {
  const payment = paymentLabel(payload);
  const reference = paymentReference(payload);
  const country = countryName(payload.counterparty.countryCode);
  // The reference prints the country once; a record whose city and country are
  // the same word must not print it twice.
  const addrLines = [payload.counterparty.addressLine, payload.counterparty.city, country]
    .filter(Boolean)
    .filter((line, index, all) => all.findIndex((x) => x?.toLowerCase() === line?.toLowerCase()) === index);
  const address = addrLines
    .map((line) => `<span class="of-addr-line">${esc(line)}</span>`)
    .join('');
  const isQuotation = /quotation/i.test(payload.titleEn);
  // The reference quotation labels the date row "Quotation Date" and carries a
  // second "Expiration Date"; an invoice labels it "Order Date" and has no
  // expiration row. The dates print as "Sat 20/09/2026, 3:30 PM" in the
  // reference, not as a bare day-month.
  return `
  <div class="of-panel">
    <div class="of-panel-left${isQuotation ? ' of-panel-left-quote' : ''}">
      <div class="of-docno">${esc(numberLabel(payload.titleEn))} # <span class="num">${esc(
        payload.documentNumber ?? '',
      )}</span></div>
      <div class="of-lgrid">
        <div class="of-field">
          <span class="of-field-label">${esc(dateLabel)}</span>
          <span class="of-field-value num">${esc(docStamp(payload.documentDate))}</span>
        </div>
        ${
          isQuotation && payload.dueDate
            ? `<div class="of-field">
                 <span class="of-field-label">Expiration Date</span>
                 <span class="of-field-value num">${esc(docStamp(payload.dueDate))}</span>
               </div>`
            : ''
        }
      </div>
      ${
        payload.salespersonName
          ? `<div class="of-field">
               <span class="of-field-label">Staf Name</span>
               <span class="of-field-value">${esc(payload.salespersonName)}</span>
             </div>`
          : ''
      }
      ${
        reference
          ? `<div class="of-field">
               <span class="of-field-label">Payment at Account</span>
               <span class="of-field-value num">${esc(reference)}</span>
             </div>`
          : payment
            ? `<div class="of-field">
                 <span class="of-field-label">Payment</span>
                 <span class="of-field-value">${esc(payment)}</span>
               </div>`
            : ''
      }
    </div>
    <div class="of-panel-right">
      <div class="of-cp-row">
        <span class="of-cp-label">Customer Name</span>
        <span class="of-cp-value">${esc(counterpartyName)}</span>
      </div>
      ${
        payload.counterparty.phone
          ? `<div class="of-cp-row">
               <span class="of-cp-label">Contact No.</span>
               <span class="of-cp-value num">${esc(payload.counterparty.phone)}</span>
             </div>`
          : ''
      }
      ${
        address
          ? `<div class="of-cp-row of-cp-row-top">
               <span class="of-cp-label">Address:</span>
               <span class="of-cp-value">${address}</span>
             </div>`
          : ''
      }
    </div>
  </div>`;
}

/** The five-column priced table from the reference document. */
function lineTable(
  payload: FinancialDocumentPayload,
  locale: 'ar' | 'en',
  quotation = false,
): string {
  const rows = payload.lines
    .map((line) => {
      const { name, note } = lineParts(line);
      return `
      <tr>
        <td class="of-c-desc">
          <span class="of-line-name">${esc(name)}</span>
          ${note ? `<span class="of-line-sub">${esc(note)}</span>` : ''}
        </td>
        <td class="of-c-qty num">${esc(quantity(line.quantity))}</td>
        <td class="of-c-price num">${esc(moneyPlain(line.unitPriceMinor, payload.currency))}</td>
        <td class="of-c-tax">${esc(taxLabel(line.taxPercentBp))}</td>
        <td class="of-c-amt num">${esc(money(line.lineTotalMinor, payload.currency, locale))}</td>
      </tr>`;
    })
    .join('');
  return `
  <table class="of-table${quotation ? ' of-table-quote' : ''}">
    <thead>
      <tr>
        <th class="of-c-desc">Description</th>
        <th class="of-c-qty">Quantity</th>
        <th class="of-c-price">Unit Price</th>
        <th class="of-c-tax">Taxes</th>
        <th class="of-c-amt">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** The right-aligned totals block: untaxed amount, tax, discount, total. */
function totalsBlock(payload: FinancialDocumentPayload, locale: 'ar' | 'en'): string {
  const rate = documentTaxRate(payload);
  const rows: Array<[string, string]> = [
    ['Untaxed Amount', money(payload.subtotalMinor, payload.currency, locale)],
  ];
  rows.push([rate ? `Tax ${rate / 100}%` : 'Tax', money(payload.taxMinor, payload.currency, locale)]);
  rows.push(['Discount', money(payload.discountMinor, payload.currency, locale)]);
  if (payload.roundingMinor) {
    rows.push(['Rounding', money(payload.roundingMinor, payload.currency, locale)]);
  }
  rows.push(['Total', money(payload.totalMinor, payload.currency, locale)]);
  if (payload.paidMinor) {
    rows.push(['Paid', money(payload.paidMinor, payload.currency, locale)]);
    rows.push(['Balance Due', money(payload.balanceMinor, payload.currency, locale)]);
  }
  return `
  <table class="of-totals">
    ${rows
      .map(
        ([label, value], index) =>
          `<tr class="${index === rows.length - 1 ? 'of-total-grand' : ''}">
             <th>${esc(label)}</th><td class="num">${esc(value)}</td>
           </tr>`,
      )
      .join('')}
  </table>`;
}

export function renderOfficialFinancialHtml(input: OfficialFinancialRenderInput): string {
  const payload = input.payload;
  const counterpartyName = payload.counterparty.nameEn || payload.counterparty.nameAr;
  const dateLabel = /quotation/i.test(payload.titleEn) ? 'Quotation Date' : 'Order Date';
  const numbered = { ...payload, documentNumber: input.documentNumber };
  // The tenant's document language decides the reading direction. Arabic prints
  // right-to-left (the identity band starts on the right, the description column
  // leads on the right, the totals block sits at the left) and English the
  // reverse. The CSS uses logical properties throughout, so the single `dir`
  // attribute flips the whole page; both languages' labels are always present.
  const docLocale: 'ar' | 'en' = input.issuer.documentLocale === 'ar' ? 'ar' : 'en';
  const dir = docLocale === 'en' ? 'ltr' : 'rtl';
  const lang = docLocale;

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${esc(input.documentNumber)} · ${esc(dir === 'ltr' ? payload.titleEn : payload.titleAr)}</title>
<style>${input.baseCss}
${CHROME_CSS}
${OFFICIAL_FINANCIAL_CSS}
</style>
</head>
<body>
<section class="of-page">
  <div class="of-watermark" aria-hidden="true">AUTO SERVICES</div>
  ${identityBand(input.issuer)}
  ${titleBlock(payload)}
  ${trnStrip(input.issuer)}
  ${infoPanel(numbered, counterpartyName, dateLabel)}
  ${lineTable(payload, docLocale, /quotation/i.test(payload.titleEn))}
  ${totalsBlock(payload, docLocale)}
  ${
    payload.notes
      ? `<div class="of-notes avoid-break">
           <div class="of-notes-body">${escMultiline(payload.notes)}</div>
         </div>`
      : ''
  }
  ${verificationStrip(input.verification)}
  <div class="of-bottom">
    ${signatureStrip()}
    <div class="of-thanks">
      <div class="of-thanks-ar">شكراً لثقتكم بنا.</div>
      <div class="of-thanks-en">Thank you for your trust.</div>
    </div>
  </div>
</section>
</body>
</html>`;
}

/**
 * The signature strip exactly as the approved reference prints it.
 *
 * The reference places the English and Arabic labels of each signatory on one
 * line — "Authorized Stamp & Signature اعتماد المركز" on the leading edge and
 * "Customer Signature توقيع العميل" on the trailing edge — rather than the
 * stacked three-line block the shared `signatureBlock` renders. This local strip
 * keeps the approved wording and geometry without changing the shared chrome
 * used by the other document kinds.
 */
function signatureStrip(): string {
  return `
  <div class="of-signrow">
    <div class="of-sign">
      <span class="of-sign-en">Authorized Stamp &amp; Signature</span>
      <span class="of-sign-ar">اعتماد المركز</span>
    </div>
    <div class="of-sign">
      <span class="of-sign-en">Customer Signature</span>
      <span class="of-sign-ar">توقيع العميل</span>
    </div>
  </div>`;
}

/**
 * Print CSS for the official layout.
 *
 * The palette is the approved identity: the reference's own navy #0a1f44 for the
 * identity text, #0f2b48 for the navy strip and #0a4175 for the shaded rows.
 * Sizes are in points and mirror the measured reference geometry.
 */
export const OFFICIAL_FINANCIAL_CSS = `
  /* The approved sheet is a single A4 page whose thanks/signature strip sits at
     the foot, not directly under the table. The page box therefore fills the
     printable area (842.25 - 5.7mm top - 14mm bottom ≈ 786pt) and the bottom
     strip is pinned to its end, so a short invoice still prints its signatures
     where the reference does. */
  .of-page{ position:relative; min-height:746pt; box-sizing:border-box;
    display:flex; flex-direction:column; padding-bottom:0;
    /* The approved sheet sets its Latin labels and figures in a Latin face
       (Verdana/CodecPro) and its Arabic in an Arabic face. The base print CSS
       is Arabic-first, which would set every Latin word in the wide Naskh face
       and widen the labels; the official sheet therefore leads with the Latin
       stack and falls back to the Arabic face for the Arabic runs. */
    font-family:${DOCUMENT_LATIN_STACK}; }
  /* The reference watermark is the "AUTO SERVICES" wordmark set in the brand
     display face (Codec Pro Bold) at 51.75pt with a 6.9pt tracking, so the run
     measures the reference's 476pt ink width, in the identity navy at ~9.6%
     opacity (measured from the approved PDF), centred on the sheet. */
  .of-watermark{ position:absolute; left:0; right:0; top:350.2pt;
    text-align:center; white-space:pre;
    font-size:51.747pt; font-weight:700; letter-spacing:6.72pt;
    color:#0a1f44; opacity:0.101; pointer-events:none; z-index:0;
    font-family:'ORYX Display',Verdana,Arial,Helvetica,sans-serif; }
  .of-band{ display:flex; justify-content:space-between; align-items:center;
    min-height:37pt; position:relative; }
  /* The reference prints the same 22pt circled tick at the top-right of the
     invoice header as on the report (measured x557-579, y29-51). It must sit
     inside the printable box: a negative offset made the page wider than the
     sheet, which made Chromium shrink the whole invoice ~1.6%. */
  .of-badge{ position:absolute; right:0; top:13pt; line-height:0; }
  .of-badge svg{ display:block; width:24pt; height:24pt; }
  .of-band-lead{ flex:0 0 auto; }
  .of-band-trail{ text-align:end; }
  .of-logo{ height:31.3pt; width:auto; }
  .of-wordmark-ar{ font-size:14.5pt; font-weight:700; color:#0a1f44; }
  .of-wordmark-en{ font-size:14.2pt; font-weight:700; color:#0a1f44; letter-spacing:.5px; }
  .of-tag-ar{ font-size:11.8pt; font-weight:700; color:#102749; }
  .of-tag-en{ font-size:7.9pt; font-weight:700; color:#102749; letter-spacing:.4px; }
  .of-title{ text-align:center; margin-top:33pt; }
  .of-title-ar{ font-size:12.3pt; font-weight:700; color:#0f2b48; line-height:1.0; }
  .of-title-en{ font-size:12.3pt; font-weight:700; color:#0f2b48; letter-spacing:.6px; line-height:1.0; }
  .of-trn{ margin-top:1pt; background:#0f2b48; color:#fff; font-size:8.8pt;
    font-weight:700; text-align:end; padding:2pt 10pt; line-height:1.0; }
  /* The reference panel has a hairline light border and no internal divider:
     the left column is wide, the customer column is a label/value grid. */
  .of-panel{ display:flex; border:1.5px solid #94a3b8; border-top:none;
    line-height:1.2; }
  /* Measured from the reference: the customer column's labels begin at x≈327
     on a 545pt content width, so the left column is ~51% (not an even split). */
  .of-panel-left{ flex:0 0 52%; padding:7pt 10pt; }
  /* The approved quotation sets its field block 3.3pt lower than the invoice's
     (Quotation Date 155.3 against Order Date 152.0) while the document number
     stays at the same height, so only the field grid is inset. */
  .of-panel-left-quote .of-lgrid{ margin-top:3.3pt; }
  .of-panel-right{ flex:1 1 auto; padding:1.5pt 10pt; }
  .of-docno{ font-size:13.3pt; font-weight:700; color:#0f2b48; margin-bottom:2pt; }
  .of-field{ margin-top:4.5pt; }
  /* The reference prints the date and the expiration date side by side in one
     row (invoice has only the date). */
  .of-lgrid{ display:grid; grid-template-columns:1fr 1fr; gap:0 10pt; }
  .of-field-label{ display:block; font-size:7.3pt; color:#64748b; font-weight:700; }
  .of-field-value{ display:block; font-size:8.8pt; color:#0f2b48; font-weight:700;
    white-space:nowrap; }
  /* The reference customer column is a label/value grid whose labels are
     right-aligned (every label ends on the same x, ≈392) with the values on a
     common left edge (≈400), exactly as the approved sheet prints them. */
  .of-cp-row{ display:grid; grid-template-columns:72pt 1fr; gap:0 8pt;
    margin-top:6pt; align-items:baseline; }
  .of-cp-row-top{ align-items:start; }
  .of-cp-label{ font-size:7.3pt; color:#64748b; font-weight:700; text-align:end; }
  .of-cp-value{ font-size:8.8pt; color:#0f2b48; font-weight:700; }
  .of-addr-line{ display:block; }
  .of-table{ margin-top:4pt; table-layout:fixed; }
  /* The approved quotation sheet leaves a wider gap between the info panel
     and the table than the invoice does (measured 31pt vs 17.5pt). */
  .of-table-quote{ margin-top:18.4pt; }
  .of-table th{ font-size:8.8pt; font-weight:700; color:#0f2b48; text-align:start;
    padding:10pt 7pt; background:transparent; white-space:nowrap;
    border-top:1.5px solid #94a3b8; border-bottom:1.5px solid #94a3b8; }
  /* The reference shades a fixed band per body row and spaces the rows 33.5pt
     apart (measured band tops 265.1, 298.5, 332.0), so a row that carries a
     product name *and* a note beneath it occupies the same pitch as a
     name-only row. Without the fixed pitch the note row grows by its second
     line and pushes the totals block ~7pt down the page. */
  .of-table tbody tr{ height:33.5pt; }
  .of-table td{ font-size:8.8pt; color:#0f2b48; font-weight:700; padding:2pt 7pt;
    vertical-align:middle; }
  /* The reference insets the description column a little further than the
     numeric columns, so its text starts at x≈37.5 rather than the cell edge. */
  .of-table th.of-c-desc,.of-table td.of-c-desc{ padding-inline-start:10pt; }
  .of-table td.of-c-price,.of-table td.of-c-amt{ white-space:nowrap; }
  /* The approved sheet prints the tax label on one line inside a body row
     ("VAT 10%"); without this it wraps and the row doubles in height. */
  .of-table td.of-c-tax{ white-space:nowrap; }
  /* The reference shades alternate body rows with the #0a4175 accent. */
  .of-table tbody tr:nth-child(odd) td{ background:#dbe3ec; }
  /* Column proportions are measured from the approved reference invoice: the
     description column is much wider than a naive split, and the four numeric
     columns are close to equal. Matching them keeps every label and figure on
     the same x-position the printed document uses. */
  .of-c-desc{ width:58.2%; }
  .of-c-qty{ width:9.8%; text-align:center !important; }
  .of-c-price{ width:10.8%; text-align:end !important; }
  .of-c-tax{ width:10.9%; text-align:start !important; }
  .of-c-amt{ width:10.3%; text-align:end !important; }
  .of-line-name{ display:block; }
  /* The line's note prints on its own line under the name, smaller and lighter,
     exactly as the approved sheet prints a product's warranty note. */
  .of-line-sub{ display:block; font-size:7.5pt; color:#64748b; font-weight:400; }
  /* The reference totals block is a right-aligned table with only two rules:
     one above the first row and one above the grand Total. */
  .of-totals{ width:59.6%; margin-inline-start:auto; margin-top:6pt;
    border-top:0.75px solid #0f2b48; }
  .of-totals th{ font-size:8.8pt; font-weight:700; color:#0f2b48; text-align:start;
    padding:3.5pt 9pt; }
  .of-totals td{ font-size:8.8pt; font-weight:700; color:#0f2b48; text-align:end;
    padding:3.5pt 9pt; }
  .of-total-grand th,.of-total-grand td{ border-top:0.75px solid #0f2b48; }
  /* The approved reference prints the note as a bordered box with no heading,
     so the box height is exactly the note text and its padding. */
  .of-notes{ margin-top:9pt; border:1px solid #c2c9d5; padding:7pt 10pt; }
  .of-notes-body{ font-size:9pt; color:#334155; }
  .of-thanks{ margin-top:10pt; text-align:center; }
  /* The reference thank-you line is 5.6pt (measured), noticeably smaller than
     the signature labels, so it reads as a footnote rather than a heading. */
  .of-thanks-ar{ font-size:5.6pt; font-weight:700; color:#05162b; }
  .of-thanks-en{ font-size:5.6pt; font-weight:700; color:#05162b; }
  /* The thanks/signature strip is pinned to the foot of the page box, as the
     approved reference prints it, rather than trailing the last table row. The
     reference leaves ~3.5pt more clearance below the strip than the box end, so
     a small bottom margin lifts the strip and the thank-you line onto the
     measured reference positions (signature 761.1, thanks 797.9). */
  .of-bottom{ margin-top:auto; margin-bottom:12pt; }
  /* The reference leaves a clear gap between the signature strip and the
     thank-you line (measured 761pt to 798pt), so the strip is not cramped. */
  .of-bottom .of-thanks{ margin-top:18pt; }
  /* The reference signature strip is a single row. Each signatory's English and
     Arabic label sit inline on one line; the first label starts at the content
     edge and the second at ~60% across, exactly as the approved sheet prints
     them (measured x 24.3 and 351.1 on a 595.5pt page). */
  .of-signrow{ display:flex; margin-top:12pt; }
  .of-sign{ display:flex; gap:8pt; justify-content:flex-start; align-items:baseline; }
  .of-sign:first-child{ flex:0 0 60%; }
  .of-sign:last-child{ flex:1 1 auto; }
  .of-sign-en{ font-size:7.5pt; font-weight:700; color:#0f2b48; }
  .of-sign-ar{ font-size:7.5pt; font-weight:700; color:#0f2b48; }
  /* The verification strip: a compact ruled box above the signature strip. It is
     deliberately restrained so it reads as a security footnote and never
     competes with the priced table or the approved identity band. */
  .of-verify{ display:flex; gap:12pt; align-items:center; margin-top:11pt;
    border:0.75px solid #c2c9d5; border-radius:4pt; padding:7pt 10pt; }
  .of-verify-qr{ flex:0 0 auto; }
  .of-verify-qr img{ width:74pt; height:74pt; display:block; }
  .of-verify-text{ flex:1 1 auto; }
  .of-verify-title{ font-size:8.8pt; font-weight:700; color:#0f2b48; }
  .of-verify-body{ font-size:7.2pt; color:#475569; margin:3pt 0 0; line-height:1.35; }
  .of-verify-code{ margin-top:4pt; font-size:9pt; font-weight:700; color:#0f2b48;
    letter-spacing:.6px; }
  .of-verify-url{ font-size:7.2pt; color:#0a4175; margin-top:2pt; word-break:break-all; }
`;
