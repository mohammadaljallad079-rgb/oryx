'use client';

/**
 * Print and export helpers.
 *
 * Printing opens a dedicated document rather than relying on `window.print()`
 * over the app shell: the shell's sidebar, header and dark theme have no place
 * on paper, and a print stylesheet cannot remove them reliably across browsers.
 * The generated document is self-contained, follows the active locale's
 * direction, and carries the ORYX neutral monogram — no invented brand mark.
 */

export interface PrintColumn<T> {
  header: string;
  /** Cell text. Returning '' renders an empty cell. */
  value: (row: T) => string;
  /** Right-align numeric columns. */
  align?: 'start' | 'end';
}

export interface PrintSection {
  heading?: string;
  /** Label/value pairs rendered as a definition grid. */
  fields?: Array<{ label: string; value: string }>;
  table?: { columns: PrintColumn<Record<string, unknown>>[]; rows: Array<Record<string, unknown>> };
  /** Free paragraph, used for notes and totals. */
  note?: string;
}

export interface PrintDocumentOptions {
  title: string;
  subtitle?: string;
  locale: 'ar' | 'en';
  sections: PrintSection[];
  /** Shown in the footer, e.g. the company and the print time. */
  footer?: string;
  /**
   * Lead image for the header, already encoded as a `data:` URL.
   *
   * The print window is opened synchronously inside the click handler so the
   * popup is not blocked, which means the bytes cannot be fetched at print
   * time — the caller loads them beforehand and passes the encoded string.
   */
  photo?: { dataUrl: string; alt?: string };
}

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Build the printable HTML. Exported so a test can assert its content. */
export function buildPrintHtml(options: PrintDocumentOptions): string {
  const dir = options.locale === 'ar' ? 'rtl' : 'ltr';
  const align = options.locale === 'ar' ? 'right' : 'left';
  // Only a `data:` URL is allowed through: the value is interpolated into an
  // attribute, and any other scheme would let a caller inject markup or point
  // the printed sheet at a remote resource.
  const photo = options.photo?.dataUrl.startsWith('data:image/') ? options.photo : null;

  const sections = options.sections
    .map((section) => {
      const parts: string[] = [];
      if (section.heading) parts.push(`<h2>${esc(section.heading)}</h2>`);
      if (section.fields && section.fields.length > 0) {
        parts.push(
          `<dl class="grid">${section.fields
            .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
            .join('')}</dl>`,
        );
      }
      if (section.table && section.table.rows.length > 0) {
        const head = section.table.columns
          .map((c) => `<th style="text-align:${c.align === 'end' ? 'end' : align}">${esc(c.header)}</th>`)
          .join('');
        const body = section.table.rows
          .map(
            (row) =>
              `<tr>${section.table!.columns
                .map((c) => `<td style="text-align:${c.align === 'end' ? 'end' : align}">${esc(c.value(row))}</td>`)
                .join('')}</tr>`,
          )
          .join('');
        parts.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      }
      if (section.table && section.table.rows.length === 0) {
        parts.push('<p class="empty">—</p>');
      }
      if (section.note) parts.push(`<p class="note">${esc(section.note)}</p>`);
      return `<section>${parts.join('')}</section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="${options.locale}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${esc(options.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px;
    font-family: "Segoe UI", "Tahoma", "Noto Sans Arabic", Arial, sans-serif;
    color: #12181f; background: #fff; font-size: 12.5px; line-height: 1.55;
  }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #b8912a; padding-bottom: 12px; }
  .head-text { flex: 1; min-width: 0; }
  .photo { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; border: 1px solid #e3e6ea; flex: 0 0 auto; }
  .mark {
    width: 42px; height: 42px; border-radius: 12px; border: 1.5px solid #b8912a;
    display: grid; place-items: center; font-weight: 800; color: #8f6f18; font-size: 15px; letter-spacing: .04em;
  }
  h1 { font-size: 17px; margin: 0; }
  .subtitle { color: #5b6672; font-size: 11.5px; margin: 2px 0 0; }
  h2 { font-size: 13px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e3e6ea; }
  section { break-inside: avoid; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin: 0; }
  .grid > div { display: flex; gap: 8px; justify-content: space-between; border-bottom: 1px dotted #e3e6ea; padding: 3px 0; }
  dt { color: #5b6672; margin: 0; }
  dd { margin: 0; font-weight: 600; text-align: ${align}; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #e3e6ea; padding: 5px 7px; font-size: 11.5px; }
  th { background: #f6f7f9; font-weight: 700; }
  tbody tr:nth-child(even) { background: #fbfbfc; }
  .note { margin: 8px 0 0; color: #3c4652; }
  .empty { color: #8a939c; margin: 6px 0 0; }
  footer { margin-top: 24px; border-top: 1px solid #e3e6ea; padding-top: 8px; color: #8a939c; font-size: 10.5px; }
  @media print { body { padding: 0; } @page { margin: 14mm; } }
</style>
</head>
<body>
<header>
  <div class="mark">ORYX</div>
  <div class="head-text">
    <h1>${esc(options.title)}</h1>
    ${options.subtitle ? `<p class="subtitle">${esc(options.subtitle)}</p>` : ''}
  </div>
  ${photo ? `<img class="photo" src="${esc(photo.dataUrl)}" alt="${esc(options.photo?.alt ?? '')}" />` : ''}
</header>
${sections}
<footer>${esc(options.footer ?? '')}</footer>
</body>
</html>`;
}

/**
 * Open the print dialog for a generated document.
 *
 * Returns false when the popup was blocked, so the caller can show a plain
 * message instead of failing silently.
 */
export function printDocument(options: PrintDocumentOptions): boolean {
  const html = buildPrintHtml(options);
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the browser a frame to lay the document out before printing.
  win.setTimeout(() => win.print(), 250);
  return true;
}

/** Quote a CSV field per RFC 4180. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Export rows to CSV.
 *
 * A UTF-8 BOM is prepended so Excel renders Arabic correctly; without it the
 * file opens as mojibake.
 */
export function exportCsv(fileName: string, headers: string[], rows: string[][]): void {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
