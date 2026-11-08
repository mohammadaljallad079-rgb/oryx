import { esc, escMultiline, money, quantity, docDate } from './html.util';
import { CHROME_CSS, signatureBlock, verificationBlock } from './chrome';
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
  if (t.includes('return')) return 'CREDIT NOTE';
  return 'INVOICE';
}

/** The settlement-method label, printed as the reference's "Payment" line. */
function paymentLabel(payload: FinancialDocumentPayload): string | null {
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
 * The identity band: the official logo on the leading edge, the tagline on the
 * trailing edge and a navy rule beneath.
 *
 * The tagline is fixed English/Arabic marketing copy that is part of the
 * approved identity, not tenant data, so it is written here rather than read
 * from a settings row.
 */
function identityBand(issuer: DocumentIssuer): string {
  const logo = issuer.logoDataUri
    ? `<img class="of-logo" src="${esc(issuer.logoDataUri)}" alt="${esc(issuer.nameEn)}">`
    : `<div class="of-wordmark">
         <div class="of-wordmark-ar">اوريكس لخدمات السيارات</div>
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

/** The navy strip carrying the issuer's TRN, as on the printed invoice. */
function trnStrip(issuer: DocumentIssuer): string {
  if (!issuer.taxNumber) return '';
  return `
  <div class="of-trn">TRN: <span class="num">${esc(issuer.taxNumber)}</span></div>`;
}

/** The centred bilingual document title. */
function titleBlock(payload: FinancialDocumentPayload): string {
  return `
  <div class="of-title">
    <div class="of-title-ar">${esc(payload.titleAr)}</div>
    <div class="of-title-en">${esc(payload.titleEn)}</div>
  </div>`;
}

/** The two-column document / customer information panel. */
function infoPanel(
  payload: FinancialDocumentPayload,
  counterpartyName: string,
  dateLabel: string,
): string {
  const payment = paymentLabel(payload);
  return `
  <div class="of-panel">
    <div class="of-panel-left">
      <div class="of-docno">${numberLabel(payload.titleEn)} # <span class="num">${esc(
        payload.documentNumber ?? '',
      )}</span></div>
      <div class="of-field">
        <span class="of-field-label">${esc(dateLabel)}</span>
        <span class="of-field-value num">${esc(docDate(payload.documentDate))}</span>
      </div>
      ${
        payload.dueDate
          ? `<div class="of-field">
               <span class="of-field-label">Expiration Date</span>
               <span class="of-field-value num">${esc(docDate(payload.dueDate))}</span>
             </div>`
          : ''
      }
      ${
        payload.salespersonName
          ? `<div class="of-field">
               <span class="of-field-label">Staf Name</span>
               <span class="of-field-value">${esc(payload.salespersonName)}</span>
             </div>`
          : ''
      }
      ${
        payment
          ? `<div class="of-field">
               <span class="of-field-label">Payment</span>
               <span class="of-field-value">${esc(payment)}</span>
             </div>`
          : ''
      }
    </div>
    <div class="of-panel-right">
      <div class="of-field">
        <span class="of-field-label">Customer Name</span>
        <span class="of-field-value">${esc(counterpartyName)}</span>
      </div>
      ${
        payload.counterparty.phone
          ? `<div class="of-field">
               <span class="of-field-label">Contact No.</span>
               <span class="of-field-value num">${esc(payload.counterparty.phone)}</span>
             </div>`
          : ''
      }
      ${
        payload.counterparty.addressLine || payload.counterparty.city
          ? `<div class="of-field">
               <span class="of-field-label">Address:</span>
               <span class="of-field-value">${esc(payload.counterparty.addressLine ?? '')}${
                 payload.counterparty.city ? `<br>${esc(payload.counterparty.city)}` : ''
               }</span>
             </div>`
          : ''
      }
      ${
        payload.counterparty.taxNumber
          ? `<div class="of-field">
               <span class="of-field-label">TRN</span>
               <span class="of-field-value num">${esc(payload.counterparty.taxNumber)}</span>
             </div>`
          : ''
      }
    </div>
  </div>`;
}

/** The five-column priced table from the reference document. */
function lineTable(payload: FinancialDocumentPayload): string {
  const rows = payload.lines
    .map(
      (line) => `
      <tr>
        <td class="of-c-desc">
          <span class="of-line-name">${esc(line.description)}</span>
          ${line.sku ? `<span class="of-line-sku num">${esc(line.sku)}</span>` : ''}
        </td>
        <td class="of-c-qty num">${esc(quantity(line.quantity))}</td>
        <td class="of-c-price num">${esc(money(line.unitPriceMinor, payload.currency))}</td>
        <td class="of-c-tax">${esc(taxLabel(line.taxPercentBp))}</td>
        <td class="of-c-amt num">${esc(money(line.lineTotalMinor, payload.currency))}</td>
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
function totalsBlock(payload: FinancialDocumentPayload): string {
  const rate = documentTaxRate(payload);
  const rows: Array<[string, string]> = [
    ['Untaxed Amount', money(payload.subtotalMinor, payload.currency)],
  ];
  rows.push([rate ? `Tax ${rate / 100}%` : 'Tax', money(payload.taxMinor, payload.currency)]);
  rows.push(['Discount', money(payload.discountMinor, payload.currency)]);
  if (payload.roundingMinor) {
    rows.push(['Rounding', money(payload.roundingMinor, payload.currency)]);
  }
  rows.push(['Total', money(payload.totalMinor, payload.currency)]);
  if (payload.paidMinor) {
    rows.push(['Paid', money(payload.paidMinor, payload.currency)]);
    rows.push(['Balance Due', money(payload.balanceMinor, payload.currency)]);
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

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<title>${esc(input.documentNumber)} · ${esc(payload.titleEn)}</title>
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
  ${lineTable(payload)}
  ${totalsBlock(payload)}
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
    { ar: 'توقيع العميل', en: 'Customer Signature', name: null },
    { ar: 'اعتماد المركز', en: 'Authorized Stamp & Signature', name: null },
  ])}
  ${verificationBlock(input.verification)}
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
     navy at ~52pt and centred, not the logo lockup. */
  .of-watermark{ position:absolute; left:0; right:0; top:47%;
    text-align:center; font-size:52pt; font-weight:700; letter-spacing:1px;
    color:#0a1f44; opacity:0.055; pointer-events:none; z-index:-1;
    font-family:Arial,Helvetica,sans-serif; }
  .of-band{ display:flex; justify-content:space-between; align-items:center;
    padding-bottom:6px; }
  .of-band-lead{ flex:0 0 auto; }
  .of-band-trail{ text-align:end; }
  .of-logo{ height:42px; width:auto; }
  .of-wordmark-ar{ font-size:15pt; font-weight:700; color:#0a1f44; }
  .of-wordmark-en{ font-size:12pt; font-weight:700; color:#0a1f44; letter-spacing:.5px; }
  .of-tag-ar{ font-size:9.5pt; font-weight:700; color:#102749; }
  .of-tag-en{ font-size:7pt; font-weight:700; color:#102749; letter-spacing:.4px; }
  .of-title{ text-align:center; margin-top:20px; }
  .of-title-ar{ font-size:12pt; font-weight:700; color:#0f2b48; }
  .of-title-en{ font-size:12pt; font-weight:700; color:#0f2b48; letter-spacing:.6px; }
  .of-trn{ margin-top:12px; background:#0f2b48; color:#fff; font-size:8.5pt;
    font-weight:700; text-align:end; padding:3px 10px; }
  .of-panel{ display:flex; border:1px solid #94a3b8; border-top:none; }
  .of-panel-left{ flex:0 0 42%; border-inline-end:1px solid #94a3b8; padding:8px 10px; }
  .of-panel-right{ flex:1 1 auto; padding:8px 10px; }
  .of-docno{ font-size:12pt; font-weight:700; color:#0f2b48; margin-bottom:4px; }
  .of-field{ margin-top:5px; }
  .of-field-label{ display:block; font-size:7.5pt; color:#64748b; font-weight:700; }
  .of-field-value{ display:block; font-size:9.5pt; color:#0f2b48; font-weight:700; }
  .of-table{ margin-top:14px; border-top:1.5px solid #94a3b8; border-bottom:1.5px solid #94a3b8; }
  .of-table th{ font-size:9.5pt; font-weight:700; color:#0f2b48; text-align:start;
    padding:8px 7px; background:transparent; }
  .of-table td{ font-size:9.5pt; color:#0f2b48; font-weight:700; padding:8px 7px;
    border-top:1px solid #cbd5e1; }
  .of-table tbody tr:nth-child(odd) td{ background:rgba(10,65,117,0.16); }
  .of-c-desc{ width:42%; }
  .of-c-qty{ width:9%; text-align:center !important; }
  .of-c-price{ width:15%; text-align:end !important; }
  .of-c-tax{ width:16%; text-align:start !important; }
  .of-c-amt{ width:18%; text-align:end !important; }
  .of-line-name{ display:block; }
  .of-line-sku{ display:block; font-size:7.5pt; color:#64748b; font-weight:400; }
  .of-totals{ width:52%; margin-inline-start:auto; margin-top:16px; }
  .of-totals th{ font-size:9.5pt; font-weight:700; color:#0f2b48; text-align:start;
    padding:6px 9px; border-bottom:1px solid #cbd5e1; }
  .of-totals td{ font-size:9.5pt; font-weight:700; color:#0f2b48; text-align:end;
    padding:6px 9px; border-bottom:1px solid #cbd5e1; }
  .of-total-grand th,.of-total-grand td{ border-top:1.5px solid #0f2b48; border-bottom:none; }
  .of-notes{ margin-top:16px; border:1px solid #94a3b8; padding:8px 10px; }
  .of-notes-title{ font-size:9.5pt; font-weight:700; color:#0f2b48; margin-bottom:3px; }
  .of-notes-body{ font-size:9pt; color:#334155; }
  .of-thanks{ margin-top:18px; text-align:center; }
  .of-thanks-ar{ font-size:9pt; font-weight:700; color:#05162b; }
  .of-thanks-en{ font-size:8.5pt; font-weight:700; color:#05162b; }
  /* The shared signature and verification blocks are sized down here so a
     one-page invoice stays on one page, as the printed reference does. */
  .of-page .signatures{ margin-top:16px; gap:24px; }
  .of-page .sig-line{ height:24px; }
  .of-page .sig-label-en{ text-transform:none; letter-spacing:0; color:#0f2b48; font-weight:700; }
  .of-page .sig-label-ar{ color:#0f2b48; font-weight:700; }
  .of-page .verify{ margin-top:16px; }
  .of-page .verify-qr img{ width:84px; height:84px; }
`;
