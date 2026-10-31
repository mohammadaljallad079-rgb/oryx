import { currencyScale, DEFAULT_CURRENCY } from './currency';

/**
 * ORYX monetary arithmetic.
 *
 * Money is never represented as a floating-point value. Every amount is an
 * integer count of minor units (halalas/cents), which makes addition,
 * subtraction and comparison exact. Multiplication by a rate (tax, discount) or
 * by a fractional quantity is performed in BigInt and rounded half-up once, at
 * the point where the fractional result must become an integer, so a journal
 * entry can always be balanced to the last minor unit.
 *
 * The same helpers are used by the API (posting) and the admin app (display),
 * so a total shown in the UI is byte-identical to the total that was posted.
 */

/** Number of decimal places a quantity may carry (1/10000 of a unit). */
export const QUANTITY_SCALE = 4;
const QUANTITY_FACTOR = 10n ** BigInt(QUANTITY_SCALE);

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafeInteger(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError(`${label} exceeds the safe integer range.`);
  }
  return Number(value);
}

/** Round a rational `numerator / denominator` half-away-from-zero to an integer. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new MoneyError('Denominator must be positive.');
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Parse a human decimal string ("12.50", "-3", "1,234.5") into integer minor
 * units. Rejects anything that is not a plain decimal number with at most
 * `scale` fractional digits, so a malformed amount can never silently truncate.
 */
export function toMinor(value: string | number, scale = 2): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyError('Amount is not a finite number.');
    value = value.toString();
  }
  const trimmed = value.trim().replace(/,/g, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError(`"${value}" is not a valid monetary amount.`);
  }
  const negative = trimmed.startsWith('-');
  const unsigned = trimmed.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  if (fraction.length > scale) {
    throw new MoneyError(`"${value}" has more than ${scale} decimal places.`);
  }
  const padded = fraction.padEnd(scale, '0');
  const minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded || '0');
  return assertSafeInteger(negative ? -minor : minor, 'Amount');
}

/** Render integer minor units as a fixed-scale decimal string. */
export function fromMinor(minor: number, scale = 2): string {
  if (!Number.isInteger(minor)) throw new MoneyError('Minor units must be an integer.');
  const factor = 10 ** scale;
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / factor);
  const fraction = String(abs % factor).padStart(scale, '0');
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/** Minor units as a JavaScript number of major units (display only). */
export function toMajor(minor: number, scale = 2): number {
  return minor / 10 ** scale;
}

export function addMinor(...amounts: number[]): number {
  let total = 0n;
  for (const a of amounts) {
    if (!Number.isInteger(a)) throw new MoneyError('Minor units must be integers.');
    total += BigInt(a);
  }
  return assertSafeInteger(total, 'Sum');
}

export function subMinor(a: number, b: number): number {
  return addMinor(a, -b);
}

/** Multiply minor units by an integer factor (quantities in whole units). */
export function mulMinorInt(minor: number, factor: number): number {
  if (!Number.isInteger(minor) || !Number.isInteger(factor)) {
    throw new MoneyError('mulMinorInt requires integer operands.');
  }
  return assertSafeInteger(BigInt(minor) * BigInt(factor), 'Product');
}

/** Parse a fractional quantity ("2.5") into scaled integer units. */
export function toQuantity(value: string | number): number {
  return toMinor(value, QUANTITY_SCALE);
}

/** Render scaled quantity units back to a decimal string. */
export function fromQuantity(value: number): string {
  return fromMinor(value, QUANTITY_SCALE);
}

/**
 * line amount = quantity × unit price, rounded half-up exactly once.
 * `quantity` is scaled by QUANTITY_SCALE; `unitPriceMinor` is minor units.
 */
export function lineAmountMinor(quantity: number, unitPriceMinor: number): number {
  if (!Number.isInteger(quantity) || !Number.isInteger(unitPriceMinor)) {
    throw new MoneyError('lineAmountMinor requires integer operands.');
  }
  return assertSafeInteger(divRoundHalfUp(BigInt(quantity) * BigInt(unitPriceMinor), QUANTITY_FACTOR), 'Line amount');
}

/**
 * Apply a percentage rate to an amount, rounded half-up exactly once.
 * `ratePercent` is scaled by `rateScale` (default 2, i.e. 1500 = 15.00%).
 */
export function percentOfMinor(minor: number, ratePercent: number, rateScale = 2): number {
  if (!Number.isInteger(minor) || !Number.isInteger(ratePercent)) {
    throw new MoneyError('percentOfMinor requires integer operands.');
  }
  const denominator = 100n * 10n ** BigInt(rateScale);
  return assertSafeInteger(divRoundHalfUp(BigInt(minor) * BigInt(ratePercent), denominator), 'Percentage');
}

/**
 * Apply a rate expressed in **basis points** (1500 = 15.00%).
 *
 * Basis points are the unit the data model stores (`taxPercentBp`,
 * `discountPercentBp`), so this is the helper the pricing code should use. It is
 * `percentOfMinor` with the scale fixed at 2, which removes the ambiguity that
 * caused a rate to be read as hundredths of a percent.
 */
export function basisPointsOfMinor(minor: number, rateBp: number): number {
  return percentOfMinor(minor, rateBp, 2);
}

/**
 * Split an amount into parts that sum exactly to the original.
 *
 * The remainder after an even split is distributed one minor unit at a time to
 * the first parts, so a 0.01 rounding residue is never lost or invented. This is
 * what keeps a multi-line tax or discount allocation balanced.
 */
export function allocateMinor(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total)) throw new MoneyError('Minor units must be an integer.');
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) throw new MoneyError('Allocation weights must sum to a positive value.');

  const negative = total < 0;
  const abs = BigInt(Math.abs(total));
  const weightSum = BigInt(totalWeight);
  const parts: bigint[] = [];
  let allocated = 0n;
  for (const weight of weights) {
    const part = (abs * BigInt(weight)) / weightSum;
    parts.push(part);
    allocated += part;
  }
  let remainder = abs - allocated;
  let index = 0;
  while (remainder > 0n) {
    parts[index % parts.length] += 1n;
    remainder -= 1n;
    index += 1;
  }
  return parts.map((p) => assertSafeInteger(negative ? -p : p, 'Allocation part'));
}

/** Sum of a list of minor-unit amounts. */
export function sumMinor(amounts: number[]): number {
  return addMinor(...amounts);
}

/** True when a set of debit/credit pairs balances to zero. */
export function isBalanced(amounts: number[]): boolean {
  return sumMinor(amounts) === 0;
}

/** Format minor units for display with a currency code. */
export function formatMinor(
  minor: number,
  currency = DEFAULT_CURRENCY,
  locale: 'ar' | 'en' = 'en',
  scale = currencyScale(currency),
): string {
  const major = toMajor(minor, scale);
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(major);
  } catch {
    return `${fromMinor(minor, scale)} ${currency}`;
  }
}
