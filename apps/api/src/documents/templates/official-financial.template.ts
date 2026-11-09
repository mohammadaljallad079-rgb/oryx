import { esc, escMultiline, money, quantity, countryName } from './html.util';
import { CHROME_CSS, signatureBlock } from './chrome';
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
 * The reference's date stamp: "Sat 20/09/2026, 3:30 PM" in Bahrain time.
 *
 * The approved invoice prints a weekday, a dd/mm/yyyy date and a 12-hour clock;
 * `docDate` produces a different (day-month-year) shape, so the official layout
 * has its own formatter rather than reusing the report one.
 */
function docStamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Asia/Bahrain' }).format(date);
  const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: 'Asia/Bahrain' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: '2-digit', timeZone: 'Asia/Bahrain' }).format(date);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'Asia/Bahrain' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Bahrain',
  })
    .format(date)
    .replace(/\u202f/g, ' ');
  return `${weekday} ${day}/${month}/${year}, ${time}`;
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
function identityBand(issuer: DocumentIssuer): string {
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
  </div>`;
}

/**
 * The navy strip carrying the issuer's TRN.
 *
 * The reference prints it as a full-width navy band (x 26.5-571, y 108.4-125.3)
 * with the number right-aligned in white, sitting directly above the
 * document/customer panel.
 */
function trnStrip(issuer: DocumentIssuer): string {
  if (!issuer.taxNumber) return '';
  return `
  <div class="of-trn">TRN: <span class="num">${esc(issuer.taxNumber)}</span></div>`;
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
  const address = [payload.counterparty.addressLine, payload.counterparty.city, country]
    .filter(Boolean)
    .map((line) => `<span class="of-addr-line">${esc(line)}</span>`)
    .join('');
  const isQuotation = /quotation/i.test(payload.titleEn);
  // The reference quotation labels the date row "Quotation Date" and carries a
  // second "Expiration Date"; an invoice labels it "Order Date" and has no
  // expiration row. The dates print as "Sat 20/09/2026, 3:30 PM" in the
  // reference, not as a bare day-month.
  return `
  <div class="of-panel">
    <div class="of-panel-left">
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
function lineTable(payload: FinancialDocumentPayload, locale: 'ar' | 'en'): string {
  const rows = payload.lines
    .map(
      (line) => `
      <tr>
        <td class="of-c-desc">
          <span class="of-line-name">${esc(line.description)}</span>
          ${line.sku ? `<span class="of-line-sku num">${esc(line.sku)}</span>` : ''}
        </td>
        <td class="of-c-qty num">${esc(quantity(line.quantity))}</td>
        <td class="of-c-price num">${esc(money(line.unitPriceMinor, payload.currency, locale))}</td>
        <td class="of-c-tax">${esc(taxLabel(line.taxPercentBp))}</td>
        <td class="of-c-amt num">${esc(money(line.lineTotalMinor, payload.currency, locale))}</td>
      </tr>`,
    )
    .join('');
  return `
  <table class="of-table">
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
  ${lineTable(payload, docLocale)}
  ${totalsBlock(payload, docLocale)}
  ${
    payload.notes
      ? `<div class="of-notes avoid-break">
           <div class="of-notes-title">Notes</div>
           <div class="of-notes-body">${escMultiline(payload.notes)}</div>
         </div>`
      : ''
  }
  <div class="of-thanks">
    <div class="of-thanks-ar">شكراً لثقتكم بنا.</div>
    <div class="of-thanks-en">Thank you for your trust.</div>
  </div>
  ${signatureBlock([
    { ar: 'اعتماد المركز', en: 'Authorized Stamp & Signature', name: null },
    { ar: 'توقيع العميل', en: 'Customer Signature', name: null },
  ])}
</section>
</body>
</html>`;
}

/**
 * Print CSS for the official layout.
 *
 * The palette is the approved identity: the reference's own navy #0a1f44 for the
 * identity text, #0f2b48 for the navy strip and #0a4175 for the shaded rows.
 * Sizes are in points and mirror the measured reference geometry.
 */
export const OFFICIAL_FINANCIAL_CSS = `
  .of-page{ position:relative; }
  /* The reference watermark is the "AUTO SERVICES" wordmark set in the identity
     navy at ~52pt and centred (measured y 374-426 on a 842pt page, i.e. ~47%),
     not the logo lockup. */
  .of-watermark{ position:absolute; left:0; right:0; top:44.4%;
    text-align:center; font-size:52pt; font-weight:700; letter-spacing:1px;
    color:#0a1f44; opacity:0.055; pointer-events:none; z-index:-1;
    font-family:Arial,Helvetica,sans-serif; }
  .of-band{ display:flex; justify-content:space-between; align-items:center;
    min-height:33pt; }
  .of-band-lead{ flex:0 0 auto; }
  .of-band-trail{ text-align:end; }
  .of-logo{ height:33pt; width:auto; }
  .of-wordmark-ar{ font-size:14.5pt; font-weight:700; color:#0a1f44; }
  .of-wordmark-en{ font-size:14.2pt; font-weight:700; color:#0a1f44; letter-spacing:.5px; }
  .of-tag-ar{ font-size:11.8pt; font-weight:700; color:#102749; }
  .of-tag-en{ font-size:7.9pt; font-weight:700; color:#102749; letter-spacing:.4px; }
  .of-title{ text-align:center; margin-top:25pt; }
  .of-title-ar{ font-size:12.3pt; font-weight:700; color:#0f2b48; line-height:1.2; }
  .of-title-en{ font-size:12.3pt; font-weight:700; color:#0f2b48; letter-spacing:.6px; line-height:1.2; }
  .of-trn{ margin-top:4pt; background:#0f2b48; color:#fff; font-size:8.8pt;
    font-weight:700; text-align:end; padding:3pt 10pt; line-height:1.2; }
  /* The reference panel has a hairline light border and no internal divider:
     the left column is wide, the customer column is a label/value grid. */
  .of-panel{ display:flex; border:0.75px solid #c2c9d5; border-top:none;
    line-height:1.2; }
  .of-panel-left{ flex:0 0 46%; padding:7pt 10pt; }
  .of-panel-right{ flex:1 1 auto; padding:7pt 10pt; }
  .of-docno{ font-size:13.3pt; font-weight:700; color:#0f2b48; margin-bottom:2pt; }
  .of-field{ margin-top:3pt; }
  /* The reference prints the date and the expiration date side by side in one
     row (invoice has only the date). */
  .of-lgrid{ display:grid; grid-template-columns:1fr 1fr; gap:0 10pt; }
  .of-field-label{ display:block; font-size:7.3pt; color:#64748b; font-weight:700; }
  .of-field-value{ display:block; font-size:8.8pt; color:#0f2b48; font-weight:700; }
  /* The customer column is a two-column grid so every value lines up on the
     same x, exactly as the reference ("Customer Name" over "Ahmed …"). */
  .of-cp-row{ display:grid; grid-template-columns:78pt 1fr; gap:0 6pt;
    margin-top:3pt; align-items:baseline; }
  .of-cp-row-top{ align-items:start; }
  .of-cp-label{ font-size:7.3pt; color:#64748b; font-weight:700; }
  .of-cp-value{ font-size:8.8pt; color:#0f2b48; font-weight:700; }
  .of-addr-line{ display:block; }
  .of-table{ margin-top:5pt; }
  .of-table th{ font-size:8.8pt; font-weight:700; color:#0f2b48; text-align:start;
    padding:10pt 6pt; background:transparent; white-space:nowrap;
    border-top:1.5px solid #94a3b8; border-bottom:1.5px solid #94a3b8; }
  .of-table td{ font-size:8.8pt; color:#0f2b48; font-weight:700; padding:10pt 6pt; }
  .of-table td.of-c-price,.of-table td.of-c-amt{ white-space:nowrap; }
  /* The reference shades alternate body rows with the #0a4175 accent. */
  .of-table tbody tr:nth-child(odd) td{ background:#dbe3ec; }
  /* Column proportions are measured from the approved reference invoice: the
     description column is much wider than a naive split, and the four numeric
     columns are close to equal. Matching them keeps every label and figure on
     the same x-position the printed document uses. */
  .of-c-desc{ width:57.5%; }
  .of-c-qty{ width:9.5%; text-align:center !important; }
  .of-c-price{ width:11.6%; text-align:end !important; }
  .of-c-tax{ width:11%; text-align:start !important; }
  .of-c-amt{ width:10.4%; text-align:end !important; }
  .of-line-name{ display:block; }
  .of-line-sku{ display:block; font-size:7.5pt; color:#64748b; font-weight:400; }
  /* The reference totals block is a right-aligned table with only two rules:
     one above the first row and one above the grand Total. */
  .of-totals{ width:58.7%; margin-inline-start:auto; margin-top:12pt;
    border-top:0.75px solid #0f2b48; }
  .of-totals th{ font-size:8.8pt; font-weight:700; color:#0f2b48; text-align:start;
    padding:3.5pt 9pt; }
  .of-totals td{ font-size:8.8pt; font-weight:700; color:#0f2b48; text-align:end;
    padding:3.5pt 9pt; }
  .of-total-grand th,.of-total-grand td{ border-top:0.75px solid #0f2b48; }
  .of-notes{ margin-top:10pt; border:1.5px solid #94a3b8; padding:6pt 10pt; }
  .of-notes-title{ font-size:9.5pt; font-weight:700; color:#0f2b48; margin-bottom:3pt; }
  .of-notes-body{ font-size:9pt; color:#334155; }
  .of-thanks{ margin-top:10pt; text-align:center; }
  .of-thanks-ar{ font-size:9pt; font-weight:700; color:#05162b; }
  .of-thanks-en{ font-size:8.5pt; font-weight:700; color:#05162b; }
  /* The shared signature and verification blocks are sized down here so a
     one-page invoice stays on one page, as the printed reference does. */
  .of-page .signatures{ margin-top:10pt; gap:24pt; }
  .of-page .sig-line{ height:16pt; }
  .of-page .sig-label-en{ text-transform:none; letter-spacing:0; color:#0f2b48; font-weight:700; }
  .of-page .sig-label-ar{ color:#0f2b48; font-weight:700; }
`;
