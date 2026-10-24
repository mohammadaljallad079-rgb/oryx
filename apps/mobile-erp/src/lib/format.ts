/**
 * Money and date formatting for the ERP app.
 *
 * Amounts arrive as integer minor units with an explicit currency scale, exactly
 * as the ERP stores them (`packages/shared/src/money.ts`). The scale comes from
 * `currencyScale` in `@oryx/shared` rather than a guessed constant, so a
 * three-decimal currency such as the Bahraini dinar renders correctly.
 */

import { currencyScale } from '@oryx/shared';

export function formatMoney(amountMinor: number, currency: string): string {
  const scale = currencyScale(currency);
  const value = amountMinor / 10 ** scale;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(value);
  } catch {
    return `${value.toFixed(scale)} ${currency}`;
  }
}

/** Whole-number grouping for counters such as invoices or low-stock lines. */
export function formatCount(value: number): string {
  try {
    return new Intl.NumberFormat().format(value);
  } catch {
    return String(value);
  }
}

/**
 * A quantity is stored scaled by 10^4, so 25000 renders as "2.5".
 *
 * Trailing zeros are trimmed: an inventory screen reads better as "3" than as
 * "3.0000", and the value is exact either way.
 */
export function formatQuantity(scaled: number): string {
  return String(scaled / 10_000);
}

/** A percentage is stored in basis points, so 1500 renders as "15%". */
export function formatBasisPoints(bp: number): string {
  return `${bp / 100}%`;
}

/** Short date, e.g. "17 Oct 2026". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Date and time, e.g. "17 Oct 2026, 08:00". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `YYYY-MM-DD` in local time, which is the format the API expects. */
export function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today as `YYYY-MM-DD`, for a default invoice date. */
export function today(): string {
  return toDateParam(new Date());
}

/**
 * Parse a user-entered decimal into the integer minor units the API expects.
 *
 * The ERP never accepts a float over the wire, so every amount a user types goes
 * through here: "12.500" with a 3-decimal currency becomes 12500.
 */
export function toMinor(input: string, currency: string): number {
  const scale = currencyScale(currency);
  const normalised = input.trim().replace(/[^\d.-]/g, '');
  if (!normalised) return 0;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10 ** scale);
}

/** Parse a user-entered decimal into a 10^4-scaled quantity. */
export function toScaledQuantity(input: string): number {
  const value = Number(input.trim());
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10_000);
}

/** Parse a user-entered percentage into basis points ("15" becomes 1500). */
export function toBasisPoints(input: string): number {
  const value = Number(input.trim());
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** The picker-friendly label for a record: Arabic name first in an Arabic UI. */
export function displayName(
  record: { nameEn?: string | null; nameAr?: string | null; title?: string | null; fullNameEn?: string | null; fullNameAr?: string | null },
  locale: 'ar' | 'en',
): string {
  const en = record.nameEn ?? record.fullNameEn ?? record.title ?? '';
  const ar = record.nameAr ?? record.fullNameAr ?? '';
  if (locale === 'ar') return ar || en || '—';
  return en || ar || '—';
}
