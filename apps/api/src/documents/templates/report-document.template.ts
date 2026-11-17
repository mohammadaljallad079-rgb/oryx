import { type ReportColumn, type ReportResultDto } from '@oryx/shared';
import { identityBand, trnStrip, watermark, OFFICIAL_FINANCIAL_CSS } from './official-financial.template';
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
<style>${input.baseCss}
${OFFICIAL_FINANCIAL_CSS}
${REPORT_CSS}
</style>
</head>
<body>
<section class="rep-page">
  ${watermark(issuer)}
  ${identityBand(issuer)}
  <div class="rep-content">
  <div class="rep-title-band">
    <div class="rep-title-ar">${esc(result.titleAr)}</div>
    <div class="rep-title-en">${esc(result.titleEn)}</div>
  </div>
  ${trnStrip(issuer)}
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
</section>
</body>
</html>`;
}

/** The report body styles, layered on top of the shared chrome. */
export const REPORT_CSS = `
  /* Reports share the printed invoice identity; tables remain report-specific. */
  /* No forced A4 page height: the printable area is A4 minus the renderer's
     top/bottom margins (~730pt with REPORT_PDF_MARGINS). A 740pt minimum
     overflows that area and creates a blank second page for short reports. */
  .rep-page{ position:relative; }
  .rep-content{ position:relative; z-index:1; padding-inline:10pt 8pt; }
  .rep-title-band{ text-align:center; margin:14pt 0 10pt; padding:0 0 9pt;
    border-bottom:1pt solid #cbd5e1; }
  .rep-title-ar{ font-size:15pt; line-height:1.3; font-weight:700; color:#0f2b48; }
  .rep-title-en{ font-size:10pt; font-weight:700; color:#0f2b48;
    text-transform:uppercase; letter-spacing:.8px; margin-top:3pt; }
  .rep-meta{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7pt;
    margin-top:10pt; margin-bottom:12pt; }
  .rep-meta-item{ border:1px solid #cbd5e1; border-radius:3pt; padding:6pt 9pt;
    background:#f7f9fc; min-width:0; }
  .rep-meta-label{ display:block; font-size:7.4pt; color:#5b6472; }
  .rep-meta-value{ display:block; font-size:9pt; font-weight:700; color:#0f2b48;
    overflow-wrap:anywhere; }
  .rep-table{ margin-top:12pt; font-size:8.4pt; table-layout:auto; width:100%;
    border-collapse:collapse; }
  .rep-table thead{ display:table-header-group; }
  .rep-table th{ background:#0f2b48; color:#fff; text-align:start; padding:7pt 6pt;
    font-size:8pt; font-weight:700; border:1px solid #0f2b48;
    overflow-wrap:anywhere; }
  .rep-table td{ padding:6pt; border-bottom:1px solid #d7dce3; vertical-align:top;
    overflow-wrap:anywhere; }
  .rep-table tbody tr:nth-child(even){ background:#f3f6fa; }
  .rep-table tbody tr{ break-inside:avoid; }
  .rep-idx{ width:25pt; text-align:center; color:#5b6472; }
  .rep-num{ text-align:end; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .rep-total{ break-inside:avoid; }
  .rep-total td{ background:#eaf0f7; font-weight:700; color:#0f2b48;
    border-top:2px solid #0f2b48; border-bottom:1px solid #94a3b8; }
  .rep-empty{ margin-top:18pt; padding:14pt; background:#f7f9fc;
    border:1px solid #d7dce3; color:#5b6472; font-size:10pt; text-align:center; }
  .rep-note{ margin-top:10pt; color:#5b6472; font-size:8pt; }
`;
