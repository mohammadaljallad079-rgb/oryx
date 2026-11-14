import { currencySymbol, fromMinor, fromQuantity, toMajor } from '@oryx/shared';

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
 * character. The currency symbol follows the document language — an English
 * document prints the Latin symbol ("BD"), an Arabic one the Arabic symbol
 * ("د.ب") — so the printed amount reads natively in either direction.
 */
export function money(
  minor: number | null | undefined,
  currency = 'BHD',
  locale: 'ar' | 'en' = 'ar',
): string {
  const value = minor ?? 0;
  const scale = currency === 'BHD' || currency === 'KWD' || currency === 'OMR' ? 3 : 2;
  const major = toMajor(value, scale);
  const body = major.toLocaleString('en-US', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  return `${body} ${currencySymbol(currency, locale)}`;
}

/**
 * A plain quantity, without a currency symbol.
 *
 * `line.quantity` is stored scaled by `QUANTITY_SCALE` (10^4), the same
 * convention `lineAmountMinor` consumes, so it must be divided back down before
 * it is printed. Rendering the raw integer would print "10,000" for one unit,
 * which misstates the invoice. Trailing zeros are trimmed so a whole count
 * reads "2" rather than "2.0000".
 */
export function quantity(value: number): string {
  return fromQuantity(value).replace(/\.?0+$/, '') || '0';
}

/**
 * A formatted amount without the currency symbol.
 *
 * The approved reference prints the unit-price column as a bare figure
 * ("7.500") and carries the currency only on the Amount column, so the priced
 * table needs one number without a symbol beside figures that have one.
 */
export function moneyPlain(minor: number | null | undefined, currency = 'BHD'): string {
  const value = minor ?? 0;
  const scale = currency === 'BHD' || currency === 'KWD' || currency === 'OMR' ? 3 : 2;
  return toMajor(value, scale).toLocaleString('en-US', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
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

/**
 * The approved documents' date stamp: "Sat 20/09/2026, 3:30 PM".
 *
 * The reference prints a short weekday, a dd/mm/yyyy date and a 12-hour clock
 * with an AM/PM suffix, all in Bahrain time. It is used by both the financial
 * sheets and the inspection report so the two read as one family.
 */
export function docStamp(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
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

/**
 * The display name of an ISO 3166-1 alpha-2 country code.
 *
 * The customer record stores a code ("BH"); the printed address shows the
 * country name ("Bahrain"), so it must be resolved rather than printed raw. An
 * unknown or absent code yields an empty string, which the caller drops.
 */
export function countryName(
  code: string | null | undefined,
  locale: 'ar' | 'en' = 'en',
): string {
  if (!code) return '';
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== 2) return code.trim();
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
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
