import { CHROME_CSS, documentFooter, documentHeader, signatureBlock, verificationBlock, type DocumentChrome } from './chrome';
import { esc, escMultiline, money, quantity, docDate } from './html.util';
import type { DocumentIssuer, DocumentVerification, FinancialDocumentPayload } from '../document-payload';

/**
 * The financial documents: tax invoice, quotation, order, receipt and voucher.
 *
 * One template covers them because they share a structure — a counterparty
 * block, a priced line table, a totals block and a payment block. The
 * differences are the title, whether a payment block appears and whether the
 * document is a demand for payment or a record of one; those come from the
 * payload rather than from a branch per type, so a new financial document is a
 * catalogue entry and not a second template that drifts.
 */

export interface FinancialRenderInput {
  issuer: DocumentIssuer;
  payload: FinancialDocumentPayload;
  documentNumber: string;
  issuedAt: Date;
  verification: DocumentVerification | null;
  baseCss: string;
}

/** The counterparty (customer or supplier) block. */
function counterpartyBlock(payload: FinancialDocumentPayload): string {
  const c = payload.counterparty;
  return `
  <div class="id-grid">
    <div class="id-box">
      <div class="id-box-title">بيانات الجهة · Counterparty</div>
      <table class="kv">
        <tr><th>الاسم / Name</th><td>${esc(c.nameAr || c.nameEn)}</td></tr>
        <tr><th>الاسم بالإنجليزية / English</th><td class="ltr">${esc(c.nameEn)}</td></tr>
        <tr><th>الرمز / Code</th><td class="num">${esc(c.code)}</td></tr>
        ${c.taxNumber ? `<tr><th>الرقم الضريبي / VAT</th><td class="num">${esc(c.taxNumber)}</td></tr>` : ''}
      </table>
    </div>
    <div class="id-box">
      <div class="id-box-title">تفاصيل المستند · Document</div>
      <table class="kv">
        <tr><th>التاريخ / Date</th><td class="num">${esc(docDate(payload.documentDate))}</td></tr>
        ${payload.dueDate ? `<tr><th>تاريخ الاستحقاق / Due</th><td class="num">${esc(docDate(payload.dueDate))}</td></tr>` : ''}
        <tr><th>الحالة / Status</th><td>${esc(payload.status)}</td></tr>
        <tr><th>العملة / Currency</th><td class="num">${esc(payload.currency)}</td></tr>
        ${c.phone ? `<tr><th>الهاتف / Phone</th><td class="num">${esc(c.phone)}</td></tr>` : ''}
        ${c.email ? `<tr><th>البريد / Email</th><td class="ltr">${esc(c.email)}</td></tr>` : ''}
        ${c.addressLine ? `<tr><th>العنوان / Address</th><td>${esc(c.addressLine)}${c.city ? `، ${esc(c.city)}` : ''}</td></tr>` : ''}
      </table>
    </div>
  </div>`;
}

function lineTable(payload: FinancialDocumentPayload): string {
  return `
  <table class="lines">
    <thead>
      <tr>
        <th class="l-idx">#</th>
        <th class="l-desc">الوصف · Description</th>
        <th class="l-qty">الكمية · Qty</th>
        <th class="l-price">سعر الوحدة · Unit Price</th>
        <th class="l-disc">الخصم · Discount</th>
        <th class="l-tax">الضريبة · VAT</th>
        <th class="l-total">الإجمالي · Total</th>
      </tr>
    </thead>
    <tbody>
      ${payload.lines
        .map(
          (line, index) => `
      <tr>
        <td class="l-idx num">${index + 1}</td>
        <td class="l-desc">
          ${esc(line.description)}
          ${line.sku ? `<span class="line-sku num">${esc(line.sku)}</span>` : ''}
        </td>
        <td class="l-qty num">${esc(quantity(line.quantity))}</td>
        <td class="l-price num">${esc(money(line.unitPriceMinor, payload.currency))}</td>
        <td class="l-disc num">${line.discountMinor ? esc(money(line.discountMinor, payload.currency)) : '—'}</td>
        <td class="l-tax num">${line.taxMinor ? esc(money(line.taxMinor, payload.currency)) : '—'}</td>
        <td class="l-total num">${esc(money(line.lineTotalMinor, payload.currency))}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

function totalsBlock(payload: FinancialDocumentPayload): string {
  const rows: Array<[string, string]> = [
    ['المجموع الفرعي / Subtotal', money(payload.subtotalMinor, payload.currency)],
  ];
  if (payload.discountMinor) rows.push(['الخصم / Discount', money(payload.discountMinor, payload.currency)]);
  if (payload.taxMinor) rows.push(['الضريبة / VAT', money(payload.taxMinor, payload.currency)]);
  rows.push(['الإجمالي / Total', money(payload.totalMinor, payload.currency)]);
  if (payload.paidMinor) rows.push(['المدفوع / Paid', money(payload.paidMinor, payload.currency)]);
  if (payload.paidMinor || payload.balanceMinor !== payload.totalMinor) {
    rows.push(['الرصيد المتبقي / Balance Due', money(payload.balanceMinor, payload.currency)]);
  }

  return `
  <div class="totals-wrap">
    <div class="amount-words">
      ${payload.notes ? `<div class="notes-title">ملاحظات · Notes</div><div class="notes-body">${escMultiline(payload.notes)}</div>` : ''}
    </div>
    <table class="totals">
      ${rows
        .map(([label, value], index) => {
          const isLast = index === rows.length - 1;
          return `<tr class="${isLast ? 'totals-grand' : ''}"><th>${esc(label)}</th><td class="num">${esc(value)}</td></tr>`;
        })
        .join('')}
    </table>
  </div>`;
}

function paymentBlock(payload: FinancialDocumentPayload): string {
  if (!payload.payment) return '';
  const p = payload.payment;
  return `
  <div class="payment-block avoid-break">
    <div class="id-box-title">تفاصيل الدفعة · Payment Details</div>
    <table class="kv">
      <tr><th>طريقة الدفع / Method</th><td>${esc(p.method)}</td></tr>
      ${p.reference ? `<tr><th>المرجع / Reference</th><td class="num">${esc(p.reference)}</td></tr>` : ''}
      <tr><th>التاريخ / Paid At</th><td class="num">${esc(docDate(p.paidAt))}</td></tr>
      ${p.receivedByName ? `<tr><th>المستلم / Received By</th><td>${esc(p.receivedByName)}</td></tr>` : ''}
    </table>
  </div>`;
}

export function renderFinancialDocumentHtml(input: FinancialRenderInput): string {
  const payload = input.payload;
  const chrome: DocumentChrome = {
    issuer: input.issuer,
    titleEn: payload.titleEn,
    titleAr: payload.titleAr,
    documentNumber: input.documentNumber,
    issuedAt: input.issuedAt,
    subtitle: payload.counterparty.nameEn,
  };

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(input.documentNumber)} · ${esc(payload.titleAr)}</title>
<style>${input.baseCss}
${CHROME_CSS}
${FINANCIAL_CSS}
</style>
</head>
<body>
<section class="doc-page">
  ${documentHeader(chrome)}
  ${counterpartyBlock(payload)}
  <div class="lines-wrap">${lineTable(payload)}</div>
  ${totalsBlock(payload)}
  ${paymentBlock(payload)}
  ${verificationBlock(input.verification)}
  ${signatureBlock([
    { ar: 'توقيع المستلم', en: 'Received By', name: payload.payment?.receivedByName ?? null },
    { ar: 'اعتماد الشركة', en: 'Authorised Signatory', name: input.issuer.nameEn },
  ])}
  ${documentFooter(chrome, 1, 1)}
</section>
</body>
</html>`;
}

export const FINANCIAL_CSS = `
  .id-grid{ display:flex; gap:10px; margin-top:12px; }
  .id-box{ flex:1 1 0; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
  .id-box-title{ background:var(--navy); color:#fff; font-size:9.5pt; font-weight:700; padding:5px 9px; }
  .kv{ font-size:9pt; }
  .kv th{ text-align:start; width:46%; padding:4px 9px; color:var(--muted); font-weight:400;
    border-bottom:1px solid var(--line); background:#f7f9fc; }
  .kv td{ padding:4px 9px; border-bottom:1px solid var(--line); font-weight:700; color:var(--ink); }
  .lines-wrap{ margin-top:12px; }
  .lines{ border:1px solid var(--line-strong); }
  .lines th,.lines td{ border-bottom:1px solid var(--line); padding:5px 7px; font-size:8.5pt; }
  .lines thead th{ background:var(--navy); color:#fff; font-size:8pt; text-align:start; }
  .l-idx{ width:5%; text-align:center; }
  .l-desc{ width:35%; }
  .l-qty{ width:9%; text-align:center; }
  .l-price,.l-disc,.l-tax,.l-total{ width:12.75%; text-align:end; }
  .l-total{ font-weight:700; }
  .line-sku{ display:block; font-size:7.5pt; color:var(--muted); }
  .totals-wrap{ display:flex; gap:12px; margin-top:12px; align-items:flex-start; }
  .amount-words{ flex:1 1 auto; }
  .notes-title{ font-size:9.5pt; font-weight:700; color:var(--navy); margin-bottom:3px; }
  .notes-body{ font-size:8.5pt; color:var(--muted); }
  .totals{ flex:0 0 58%; border:1px solid var(--line-strong); }
  .totals th{ text-align:start; padding:5px 9px; font-size:9pt; color:var(--muted); font-weight:400;
    border-bottom:1px solid var(--line); background:#f7f9fc; }
  .totals td{ padding:5px 9px; font-size:9.5pt; text-align:end; border-bottom:1px solid var(--line); }
  .totals-grand th{ color:var(--navy); font-weight:700; background:var(--navy); color:#fff; }
  .totals-grand td{ background:var(--navy); color:#fff; font-weight:700; font-size:11pt; }
  .payment-block{ margin-top:12px; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
`;
