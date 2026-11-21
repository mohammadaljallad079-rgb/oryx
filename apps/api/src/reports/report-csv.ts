import type { ReportResultDto } from '@oryx/shared';
import { fromQuantity, toMajor } from '@oryx/shared';

/**
 * Serialises a report to CSV.
 *
 * The header row uses the English column labels and the body uses the raw
 * values, not the formatted ones: a spreadsheet should re-format a date or a
 * currency itself, and a pre-formatted "1,234.500 BHD" cell would arrive as
 * text. Money is written in major units at the currency's own scale so a BHD
 * column keeps its three decimals.
 */
export function toCsv(result: ReportResultDto): string {
  const scale = ['BHD', 'KWD', 'OMR'].includes(result.currency) ? 3 : 2;
  const header = ['#', ...result.columns.map((c) => c.labelEn)];
  const lines = [header, ...result.rows.map((row, index) => [
    String(index + 1),
    ...result.columns.map((c) => formatCell(c.format, row[c.key], scale)),
  ])];
  return lines.map((cells) => cells.map(escapeCell).join(',')).join('\r\n');
}

function formatCell(format: string, value: unknown, scale: number): string {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'money':
      return typeof value === 'number' ? toMajor(value, scale).toFixed(scale) : String(value);
    case 'quantity':
      return typeof value === 'number' ? fromQuantity(value).replace(/\.?0+$/, '') || '0' : String(value);
    case 'percent':
      return typeof value === 'number' ? value.toFixed(2) : String(value);
    case 'date':
      return typeof value === 'string' ? value.slice(0, 10) : String(value);
    default:
      return String(value);
  }
}

/**
 * Quotes a cell when it contains a comma, quote or newline.
 *
 * A customer name with a comma would otherwise shift every later column, so the
 * value is wrapped and its own quotes doubled, which is what RFC 4180 requires.
 */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
