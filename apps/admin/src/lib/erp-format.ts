'use client';

import { currencyScale, DEFAULT_CURRENCY, fromMinor, fromQuantity, toMinor } from '@oryx/shared';

/**
 * Display helpers for the ERP pages.
 *
 * The API returns integer minor units and 10^4-scaled quantities, so every
 * figure is formatted from those integers — the UI never re-derives a total from
 * floats, which keeps what is shown identical to what was posted.
 *
 * The number of minor units in one major unit is a property of the currency,
 * not a constant: the Bahraini Dinar is divided into 1000 fils, so a helper that
 * assumes two decimals misreads every BHD amount by a factor of ten. Both the
 * formatter and the input parser therefore take the scale from `currencyScale`.
 */
export function money(minor: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (minor === null || minor === undefined) return '—';
  return `${fromMinor(minor, currencyScale(currency))} ${currency}`;
}

export function qty(scaled: number | null | undefined): string {
  if (scaled === null || scaled === undefined) return '—';
  // Trim trailing zeros so "1.0000" reads as "1".
  return fromQuantity(scaled).replace(/\.?0+$/, '') || '0';
}

/**
 * Convert a decimal input ("12.500") to minor units for the API, in the given
 * currency's own scale. An unparseable value yields 0, matching the previous
 * behaviour; a value with too many decimals throws from `toMinor` rather than
 * silently truncating a third of a fils.
 */
export function toMinorInput(value: string, currency = DEFAULT_CURRENCY): number {
  const trimmed = value.trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return 0;
  return toMinor(trimmed, currencyScale(currency));
}

/** Convert a decimal quantity to 10^4-scaled units for the API. */
export function toQuantityInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return 0;
  return Math.round(Number(trimmed) * 10000);
}

/** Convert a percentage input ("15") to basis points. */
export function toBasisPoints(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return 0;
  return Math.round(Number(trimmed) * 100);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
