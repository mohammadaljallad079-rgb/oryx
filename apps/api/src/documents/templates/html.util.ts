import { currencySymbol, fromMinor, toMajor } from '@oryx/shared';

/**
 * Escapes text for interpolation into generated HTML.
 *
 * Every value in a document comes from a database row that a user typed — a
 * customer name, a vehicle note, a fault description. Chromium renders the
 * generated HTML with full script support, so an unescaped value is a stored-XSS
 * vector inside the PDF pipeline. This is the only place a value is allowed into
 * markup, and it escapes all five characters that matter in an HTML context.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes and preserves line breaks as `<br>` for a free-text block. */
export function escMultiline(value: unknown): string {
  if (value === null || value === undefined) return '';
  return esc(value).replace(/\r?\n/g, '<br>');
}

/**
 * Formats minor units for a document.
 *
 * Latin digits are used deliberately, even in the Arabic document: an invoice
 * total is read against a bank statement and a card receipt, and Arabic-Indic
 * digits would make the printed figure impossible to reconcile character by
 * character. The currency symbol is the Arabic one, so the document still reads
 * natively.
 */
export function money(minor: number | null | undefined, currency = 'BHD'): string {
  const value = minor ?? 0;
  const scale = currency === 'BHD' || currency === 'KWD' || currency === 'OMR' ? 3 : 2;
  const major = toMajor(value, scale);
  const body = major.toLocaleString('en-US', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  return `${body} ${currencySymbol(currency, 'ar')}`;
}

/** A plain quantity, without a currency symbol. */
export function quantity(value: number): string {
  return value.toLocaleString('en-US');
}

/** A short date in both the Gregorian and the Bahraini convention. */
export function docDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bahrain',
  }).format(date);
}

/** A date and time, to the minute. */
export function docDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bahrain',
  }).format(date);
}

/** A number that may legitimately be absent, rendered as an em dash. */
export function orDash(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

/** A grouped integer with Latin digits, e.g. an odometer reading. */
export function grouped(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US');
}

/** Converts a value to a safe CSS length from a number. */
export function pct(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`;
}

/** Re-exported so templates share one money scale rule. */
export { fromMinor };
