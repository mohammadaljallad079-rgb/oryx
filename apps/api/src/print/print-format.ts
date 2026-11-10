import { currencyScale, currencySymbol, fromMinor, fromQuantity } from '@oryx/shared';
import { computeDocumentTotals, type PricedLineInput } from '../common/document-totals';

/**
 * Amount in words for a printed document.
 *
 * The approved forms carry a written amount, so every printed document must be
 * able to produce one. The function works on integer minor units, so the words
 * can never disagree with the printed figures.
 */
const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', ' Thousand', ' Million', ' Billion', ' Trillion'];

function threeDigits(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const tens = TENS[Math.floor(rest / 10)];
      const ones = rest % 10;
      parts.push(ones > 0 ? `${tens}-${ONES[ones]}` : tens);
    }
  }
  return parts.join(' ');
}

function wholeToWords(value: number): string {
  if (value === 0) return 'Zero';
  const groups: string[] = [];
  let remaining = value;
  let scale = 0;
  while (remaining > 0) {
    const group = remaining % 1000;
    if (group > 0) groups.unshift(`${threeDigits(group)}${SCALES[scale]}`);
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return groups.join(' ').trim();
}

/**
 * Render minor units as words in the form the approved forms use, e.g.
 * `Thirty-Seven Bahraini Dinar and Five Hundred Fils Only`.
 */
export function amountInWords(minor: number, currency: string): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  // The subdivision is currency data, not a constant: BHD/KWD/OMR carry 1000
  // minor units to the major one, so dividing by 100 would misstate every
  // amount by a factor of ten.
  const scale = currencyScale(currency);
  const factor = 10 ** scale;
  const whole = Math.floor(abs / factor);
  const fraction = abs % factor;
  const names = currencyNames(currency);
  const words: string[] = [`${wholeToWords(whole)} ${names.major}`];
  if (fraction > 0) {
    words.push(`and ${wholeToWords(fraction)} ${names.minor}`);
  }
  return `${negative ? 'Minus ' : ''}${words.join(' ')} Only`;
}

function currencyNames(currency: string): { major: string; minor: string } {
  switch (currency.toUpperCase()) {
    case 'BHD':
      return { major: 'Bahraini Dinar', minor: 'Fils' };
    case 'SAR':
      return { major: 'Saudi Riyal', minor: 'Halala' };
    case 'AED':
      return { major: 'UAE Dirham', minor: 'Fils' };
    case 'USD':
      return { major: 'US Dollar', minor: 'Cent' };
    case 'EUR':
      return { major: 'Euro', minor: 'Cent' };
    case 'KWD':
      return { major: 'Kuwaiti Dinar', minor: 'Fils' };
    case 'QAR':
      return { major: 'Qatari Riyal', minor: 'Dirham' };
    case 'OMR':
      return { major: 'Omani Rial', minor: 'Baisa' };
    case 'JOD':
      return { major: 'Jordanian Dinar', minor: 'Piastre' };
    default:
      return { major: currency.toUpperCase(), minor: 'Cent' };
  }
}

export interface PrintLineSource {
  /** Product name, optionally followed by a newline and a note line. */
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercentBp: number;
  taxPercentBp: number;
}

export interface PrintTotalsSource {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  /**
   * The rate the document actually charged, in basis points, taken from its
   * lines. The approved form prints the stated rate ("Tax 10%"), not the ratio
   * the tax amount happens to work out to after a discount — the two differ
   * whenever a discount reduces the taxable base.
   */
  taxRateBp?: number | null;
}

function rateLabel(bp: number): string {
  if (bp <= 0) return '—';
  const percent = bp / 100;
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
  return `VAT ${text}%`;
}

/** Build the printable lines from a document's persisted lines. */
export function toPrintLines(lines: PrintLineSource[], currency: string) {
  const scale = currencyScale(currency);
  // The approved form prints the currency symbol ("BD"), not the ISO code
  // ("BHD"), on every amount, so the DTO carries the symbol and the client
  // renders it verbatim.
  const symbol = currencySymbol(currency, 'en');
  const priced: PricedLineInput[] = lines.map((l) => ({
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    discountPercentBp: l.discountPercentBp,
    taxPercentBp: l.taxPercentBp,
  }));
  const totals = computeDocumentTotals(priced);
  return lines.map((line, index) => {
    // A line may carry a note under its product name; the approved form prints
    // the name on the first line and the note beneath it, so the two are kept
    // apart here rather than run together.
    const [name, ...rest] = line.description.split('\n');
    const note = rest.join(' ').trim();
    return {
    description: name.trim() || line.description,
    subDescription: note.length > 0 ? note : null,
    // A whole count must read "1", not "1.0000": the reference prints the bare
    // integer. Trailing zeros are trimmed so a fractional quantity still shows
    // its own precision.
    quantity: fromQuantity(line.quantity).replace(/\.?0+$/, '') || '0',
    unitPrice: fromMinor(line.unitPriceMinor, scale),
    taxLabel: rateLabel(line.taxPercentBp),
    discountPercent: line.discountPercentBp > 0 ? `${line.discountPercentBp / 100}%` : '—',
    amount: `${fromMinor(totals.lines[index].lineTotalMinor, scale)} ${symbol}`,
    };
  });
}

/** Build the printable totals block from a document's persisted totals. */
export function toPrintTotals(source: PrintTotalsSource) {
  const scale = currencyScale(source.currency);
  const symbol = currencySymbol(source.currency, 'en');
  // Prefer the rate the document states on its lines; fall back to the ratio the
  // tax amount implies only when no line carries a rate.
  const taxRateBp =
    source.taxRateBp && source.taxRateBp > 0
      ? source.taxRateBp
      : source.subtotalMinor > 0
        ? Math.round((source.taxMinor * 10000) / source.subtotalMinor)
        : 0;
  return {
    untaxedAmount: `${fromMinor(source.subtotalMinor, scale)} ${symbol}`,
    taxLabel: taxRateBp > 0 ? `Tax ${(taxRateBp / 100).toFixed(2).replace(/\.?0+$/, '')}%` : 'Tax',
    taxAmount: `${fromMinor(source.taxMinor, scale)} ${symbol}`,
    discount: `${fromMinor(source.discountMinor, scale)} ${symbol}`,
    total: `${fromMinor(source.totalMinor, scale)} ${symbol}`,
  };
}
