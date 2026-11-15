import { type ReportColumn, type ReportResultDto } from '@oryx/shared';
import {
  CHROME_CSS,
  documentHeader,
  documentWatermark,
  type DocumentChrome,
} from './chrome';
import { esc, money, quantity, docDate, docDateTime, orDash } from './html.util';
import type { DocumentIssuer } from '../document-payload';

/**
 * The printable report document.
 *
 * A report is a *table*, not a form: the layout is a repeating header, the
 * priced rows, and a footer that carries the server's own totals. It shares the
 * invoice's identity band and watermark so a printed report and a printed
 * invoice read as one family, but the body is generated from the report
 * definition the API resolved, so a column added to the catalogue appears on
 * the sheet without a second template.
 *
 * The rows are read from the server result, never re-derived from the HTML, so
 * the figures a reader sees on paper are exactly the figures the API returned.
 */

export interface ReportRenderInput {
  issuer: DocumentIssuer;
  result: ReportResultDto;
  baseCss: string;
}

/** Renders one cell according to its column format. */
function cell(column: ReportColumn, row: Record<string, unknown>, locale: 'ar' | 'en', currency: string): string {
  const value = row[column.key];
  switch (column.format) {
    case 'money':
      return esc(money(typeof value === 'number' ? value : 0, currency, locale));
    case 'quantity':
      return esc(quantity(typeof value === 'number' ? value : 0));
    case 'percent':
      return `${esc(typeof value === 'number' ? value.toFixed(2) : '0.00')}%`;
    case 'date':
      return esc(docDate(value as string | null | undefined));
    case 'datetime':
      return esc(docDateTime(value as string | null | undefined));
    case 'number':
      return esc(typeof value === 'number' ? String(value) : orDash(value));
    default:
      return esc(orDash(value));
  }
}

/** The period/meta strip under the title. */
function metaStrip(input: ReportRenderInput, locale: 'ar' | 'en'): string {
  const { result, issuer } = input;
  const period =
    result.from || result.to
      ? `${docDate(result.from)} — ${docDate(result.to)}`
      : locale === 'ar'
        ? 'كل الفترات'
        : 'All periods';
  const items: Array<{ label: string; value: string }> = [
    { label: locale === 'ar' ? 'الفترة' : 'Period', value: period },
    { label: locale === 'ar' ? 'عدد السطور' : 'Rows', value: String(result.rowCount) },
    { label: locale === 'ar' ? 'العملة' : 'Currency', value: issuer.currency },
    { label: locale === 'ar' ? 'تاريخ الإصدار' : 'Generated', value: docDateTime(result.generatedAt) },
  ];
  return `
  <div class="rep-meta">
    ${items
      .map(
        (i) => `
    <div class="rep-meta-item">
      <span class="rep-meta-label">${esc(i.label)}</span>
      <span class="rep-meta-value num">${esc(i.value)}</span>
    </div>`,
      )
      .join('')}
  </div>`;
}

export function renderReportHtml(input: ReportRenderInput): string {
  const { result, issuer } = input;
  const locale: 'ar' | 'en' = issuer.documentLocale === 'en' ? 'en' : 'ar';
  const chrome: DocumentChrome = {
    issuer,
    titleEn: result.titleEn,
    titleAr: result.titleAr,
    documentNumber: result.kind,
    issuedAt: new Date(result.generatedAt),
  };

  const columns = result.columns;
  const totalRow = columns.some((c) => c.total)
    ? `
    <tfoot>
      <tr class="rep-total">
        <td colspan="${columns.findIndex((c) => c.total) >= 0 ? columns.findIndex((c) => c.total) : columns.length}">
          ${esc(locale === 'ar' ? 'الإجمالي' : 'Total')}
        </td>
        ${columns
          .slice(columns.findIndex((c) => c.total) >= 0 ? columns.findIndex((c) => c.total) : columns.length)
          .map((c) =>
            c.total
              ? `<td class="rep-num">${
                  c.format === 'money'
                    ? esc(money(result.totals[c.key] ?? 0, issuer.currency, locale))
                    : c.format === 'quantity'
                      ? esc(quantity(result.totals[c.key] ?? 0))
                      : esc(String(result.totals[c.key] ?? 0))
                }</td>`
              : '<td></td>',
          )
          .join('')}
      </tr>
    </tfoot>`
    : '';

  return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${esc(result.titleEn)}</title>
<style>${CHROME_CSS}
${REPORT_CSS}
</style>
</head>
<body>
<div class="doc-page">
  ${documentWatermark(issuer)}
  ${documentHeader(chrome)}
  <div class="rep-title-band">
    <div class="rep-title-ar">${esc(result.titleAr)}</div>
    <div class="rep-title-en">${esc(result.titleEn)}</div>
  </div>
  ${metaStrip(input, locale)}
  ${
    result.rows.length === 0
      ? `<p class="rep-empty">${esc(locale === 'ar' ? 'لا توجد بيانات في هذه الفترة.' : 'No data in this period.')}</p>`
      : `
  <table class="rep-table">
    <thead>
      <tr>
        <th class="rep-idx">#</th>
        ${columns
          .map((c) => `<th class="${c.align === 'end' ? 'rep-num' : ''}">${esc(locale === 'ar' ? c.labelAr : c.labelEn)}</th>`)
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${result.rows
        .map(
          (row, index) => `
      <tr>
        <td class="rep-idx num">${index + 1}</td>
        ${columns
          .map((c) => `<td class="${c.align === 'end' ? 'rep-num' : ''}">${cell(c, row, locale, issuer.currency)}</td>`)
          .join('')}
      </tr>`,
        )
        .join('')}
    </tbody>
    ${totalRow}
  </table>
  ${
    result.truncated
      ? `<p class="rep-note">${esc(
          locale === 'ar'
            ? `تم عرض أول ${result.rows.length} سطر من ${result.rowCount}. ضيّق الفترة أو صدّر CSV للقائمة الكاملة.`
            : `Showing the first ${result.rows.length} of ${result.rowCount} rows. Narrow the period or export CSV for the full list.`,
        )}</p>`
      : ''
  }`}
</div>
</body>
</html>`;
}

/** The report body styles, layered on top of the shared chrome. */
export const REPORT_CSS = `
  .rep-title-band{ margin-top:8px; border-inline-start:5px solid var(--gold); padding-inline-start:10px; }
  .rep-title-ar{ font-size:15pt; font-weight:700; color:var(--navy); }
  .rep-title-en{ font-size:9.5pt; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; }
  .rep-meta{ display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .rep-meta-item{ flex:1 1 22%; border:1px solid var(--line); border-radius:5px; padding:4px 8px; background:#f7f9fc; }
  .rep-meta-label{ display:block; font-size:7pt; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
  .rep-meta-value{ display:block; font-size:9.5pt; font-weight:700; color:var(--navy); }
  .rep-table{ margin-top:10px; font-size:8.5pt; }
  .rep-table th{ background:var(--navy); color:#fff; text-align:start; padding:5px 6px; font-size:8pt;
    font-weight:700; border:1px solid var(--navy); }
  .rep-table td{ padding:4px 6px; border:1px solid var(--line); vertical-align:top; }
  .rep-table tbody tr:nth-child(even){ background:#f4f7fb; }
  .rep-idx{ width:22pt; text-align:center; color:var(--muted); }
  .rep-num{ text-align:end; }
  .rep-total td{ background:#eef3f9; font-weight:700; color:var(--navy); border-top:2px solid var(--navy); }
  .rep-empty{ margin-top:14px; color:var(--muted); font-size:10pt; }
  .rep-note{ margin-top:8px; color:var(--muted); font-size:8pt; }
`;
