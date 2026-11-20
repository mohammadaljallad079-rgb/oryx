'use client';

import type { Locale } from '@oryx/shared';
import { PRINT_EMBLEM, PRINT_LOGO_MARK } from './print-assets';

/**
 * A tabular report rendered in the approved ORYX print shell.
 *
 * The invoice form in `print-document.ts` positions every run at a measured
 * coordinate because it must reproduce a signed reference page. A ledger or a
 * payroll history has a variable number of rows, so it uses a flowing table
 * instead — but the same navy masthead, the same monogram and the same footer,
 * so an operator sees one identity across every printed artefact.
 */

export interface PrintTableColumn {
  /** Stable key, also used as the header when `label` is omitted. */
  key: string;
  /** Bilingual header. */
  labelEn: string;
  labelAr: string;
  /** Right-align numbers so columns of figures line up. */
  align?: 'start' | 'end';
}

export interface PrintTableMeta {
  /** e.g. "Payroll ledger" — printed under the employee name. */
  titleEn: string;
  titleAr: string;
  /** The record the table describes, printed in the masthead block. */
  subjectNameEn?: string;
  subjectNameAr?: string;
  subjectCode?: string;
  companyNameEn: string;
  companyNameAr: string;
  /** A human-readable description of the window, e.g. "2026-01-01 → 2026-06-30". */
  windowLabel?: string;
  /** Totals rendered as a summary strip above the table. */
  totals?: Array<{ labelEn: string; labelAr: string; value: string }>;
}

export interface PrintTableInput {
  meta: PrintTableMeta;
  columns: PrintTableColumn[];
  rows: Array<Record<string, string>>;
  locale: Locale;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a printable HTML document for a tabular report.
 *
 * The page is A4 with a repeating header, so a multi-page ledger keeps its
 * column headings on every page. `@page` removes the browser's own header and
 * footer, which would otherwise print a URL across the approved masthead.
 */
export function renderPrintTable(input: PrintTableInput): string {
  const { meta, columns, rows, locale } = input;
  const ar = locale === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const pick = (en: string, arText: string) => (ar ? arText : en);

  const headerCells = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align === 'end' ? (ar ? 'left' : 'right') : ar ? 'right' : 'left'}">${esc(
          pick(c.labelEn, c.labelAr),
        )}</th>`,
    )
    .join('');

  const bodyRows = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${columns
              .map(
                (c) =>
                  `<td style="text-align:${c.align === 'end' ? (ar ? 'left' : 'right') : ar ? 'right' : 'left'}">${esc(
                    row[c.key] ?? '',
                  )}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${columns.length}" style="text-align:center;color:#64748B;padding:18pt 0">${pick(
        'No records in this window.',
        'لا توجد سجلات في هذه الفترة.',
      )}</td></tr>`;

  const totals = meta.totals?.length
    ? `<div class="totals">${meta.totals
        .map(
          (t) =>
            `<div class="total"><span class="total-label">${esc(pick(t.labelEn, t.labelAr))}</span>` +
            `<span class="total-value">${esc(t.value)}</span></div>`,
        )
        .join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="${ar ? 'ar' : 'en'}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${esc(pick(meta.titleEn, meta.titleAr))} — ${esc(meta.subjectCode ?? '')}</title>
<style>
  @page { size: A4; margin: 12mm 10mm 16mm 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ${ar ? "'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif" : "'Inter', 'Segoe UI', Arial, sans-serif"};
    color: #0F2B48;
    font-size: 9.5pt;
    line-height: 1.45;
  }
  .masthead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12pt;
    border-bottom: 2.2pt solid #0E2A48;
    padding-bottom: 8pt;
    margin-bottom: 12pt;
  }
  .brand { display: flex; align-items: center; gap: 10pt; }
  .brand img.mark { height: 34pt; width: auto; }
  .brand img.emblem { height: 26pt; width: auto; }
  .brand-text .company { font-size: 12.5pt; font-weight: 700; letter-spacing: .2pt; }
  .brand-text .tagline { font-size: 7.5pt; color: #64748B; letter-spacing: 1.2pt; text-transform: uppercase; }
  .title-block { text-align: ${ar ? 'left' : 'right'}; }
  .title-block .doc-title { font-size: 13pt; font-weight: 700; color: #0E2A48; }
  .title-block .subject { font-size: 10pt; font-weight: 600; margin-top: 2pt; }
  .title-block .meta { font-size: 8pt; color: #64748B; margin-top: 2pt; }
  .window {
    display: inline-block;
    border: 1pt solid #94A2B8;
    border-radius: 3pt;
    padding: 2pt 8pt;
    font-size: 8pt;
    color: #0F2B48;
    margin-bottom: 9pt;
  }
  .totals { display: flex; flex-wrap: wrap; gap: 6pt; margin-bottom: 9pt; }
  .total {
    flex: 1 1 0;
    min-width: 100pt;
    border: 1pt solid #DBE3EB;
    border-top: 2pt solid #0E2A48;
    border-radius: 3pt;
    padding: 5pt 8pt;
  }
  .total-label { display: block; font-size: 7.5pt; color: #64748B; }
  .total-value { display: block; font-size: 10.5pt; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 1pt; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th {
    background: #0E2A48;
    color: #FFFFFF;
    font-size: 8.5pt;
    font-weight: 600;
    padding: 5pt 6pt;
    border: 0.6pt solid #0E2A48;
  }
  td {
    padding: 4.2pt 6pt;
    border-bottom: 0.6pt solid #DBE3EB;
    font-size: 8.8pt;
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: #F5F8FB; }
  tr { page-break-inside: avoid; }
  .footer {
    position: fixed;
    bottom: 0;
    inset-inline: 0;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    color: #64748B;
    border-top: 0.6pt solid #DBE3EB;
    padding-top: 4pt;
  }
  .toolbar { text-align: center; margin-bottom: 10pt; }
  .toolbar button {
    cursor: pointer;
    border: 0;
    border-radius: 4pt;
    padding: 5pt 16pt;
    background: #0E2A48;
    color: #fff;
    font-size: 9pt;
    font-weight: 600;
  }
  @media print { .toolbar { display: none; } }
</style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">${pick('Print', 'طباعة')}</button></div>
  <div class="masthead">
    <div class="brand">
      <img class="mark" src="${PRINT_LOGO_MARK}" alt="" />
      <div class="brand-text">
        <div class="company">${esc(pick(meta.companyNameEn, meta.companyNameAr))}</div>
        <div class="tagline">ORYX</div>
      </div>
    </div>
    <div class="title-block">
      <div class="doc-title">${esc(pick(meta.titleEn, meta.titleAr))}</div>
      ${meta.subjectNameEn || meta.subjectNameAr
        ? `<div class="subject">${esc(pick(meta.subjectNameEn ?? '', meta.subjectNameAr ?? ''))}${
            meta.subjectCode ? ` · ${esc(meta.subjectCode)}` : ''
          }</div>`
        : ''}
      ${meta.windowLabel ? `<div class="meta">${esc(meta.windowLabel)}</div>` : ''}
    </div>
  </div>
  ${meta.windowLabel ? `<div class="window">${esc(meta.windowLabel)}</div>` : ''}
  ${totals}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">
    <span>${esc(pick('Generated by ORYX', 'أُنشئ بواسطة ORYX'))} · ${new Date().toISOString().slice(0, 10)}</span>
    <span><img src="${PRINT_EMBLEM}" alt="" style="height:11pt;vertical-align:middle" /></span>
  </div>
</body>
</html>`;
}

/**
 * Open a rendered report in a new window.
 *
 * The window is reserved synchronously in the click gesture: opening it after
 * an await loses transient user activation and the browser blocks the popup,
 * which makes the button look inert.
 */
export function openPrintTable(input: PrintTableInput, autoPrint: boolean): void {
  const win = window.open('', '_blank', 'width=920,height=1040');
  if (!win) return;
  win.document.write(renderPrintTable(input));
  win.document.close();
  if (autoPrint) {
    win.focus();
    win.setTimeout(() => win.print(), 350);
  }
}

/**
 * Export the same table as a CSV file.
 *
 * A UTF-8 BOM is written first so Excel opens Arabic text in the right
 * encoding instead of showing mojibake.
 */
export function downloadTableCsv(input: PrintTableInput, fileName: string): void {
  const { columns, rows, locale, meta } = input;
  const ar = locale === 'ar';
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => quote(ar ? c.labelAr : c.labelEn)).join(','),
    ...rows.map((row) => columns.map((c) => quote(row[c.key] ?? '')).join(',')),
  ];
  if (meta.totals?.length) {
    lines.push('');
    for (const t of meta.totals) {
      lines.push(`${quote(ar ? t.labelAr : t.labelEn)},${quote(t.value)}`);
    }
  }
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
}

/**
 * A single record's field sheet, for a preview's Print button.
 *
 * A record has no repeating rows, but it still has to leave the building on the
 * same masthead as a ledger. Reusing `renderPrintTable` with a field/value pair
 * keeps one print identity instead of growing a second document format.
 */
export function recordPrintInput(params: {
  locale: Locale;
  titleEn: string;
  titleAr: string;
  subjectName?: string;
  subjectCode?: string;
  companyNameEn: string;
  companyNameAr: string;
  windowLabel?: string;
  fields: Array<{ label: string; value: string }>;
}): PrintTableInput {
  return {
    locale: params.locale,
    columns: [
      { key: 'field', labelEn: 'Field', labelAr: 'الحقل' },
      { key: 'value', labelEn: 'Value', labelAr: 'القيمة' },
    ],
    rows: params.fields.map((f) => ({ field: f.label, value: f.value })),
    meta: {
      titleEn: params.titleEn,
      titleAr: params.titleAr,
      subjectNameEn: params.subjectName,
      subjectNameAr: params.subjectName,
      subjectCode: params.subjectCode,
      companyNameEn: params.companyNameEn,
      companyNameAr: params.companyNameAr,
      windowLabel: params.windowLabel,
    },
  };
}
