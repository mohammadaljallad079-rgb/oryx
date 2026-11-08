'use client';

import { DEFAULT_CURRENCY, currencyScale, fromMinor, fromQuantity } from '@oryx/shared';

/**
 * Display helpers for the ERP pages.
 *
 * The API returns integer minor units and 10^4-scaled quantities, so every
 * figure is formatted from those integers — the UI never re-derives a total from
 * floats, which keeps what is shown identical to what was posted.
 *
 * The active currency is the base currency of the selected company (BHD by
 * default). It is pushed here by the app shell whenever the company context or
 * the Settings currency changes, so a page that calls `money(minor)` renders in
 * the tenant's own currency without threading the code through every call site.
 */
let activeCurrency = DEFAULT_CURRENCY;

/** Set the currency used by `money`/`toMinorInput` when no explicit code is given. */
export function setActiveCurrency(code: string | null | undefined): void {
  activeCurrency = code && code.trim() ? code.trim().toUpperCase() : DEFAULT_CURRENCY;
}

export function getActiveCurrency(): string {
  return activeCurrency;
}

export function money(minor: number | null | undefined, currency = activeCurrency): string {
  if (minor === null || minor === undefined) return '—';
  return `${fromMinor(minor, currencyScale(currency))} ${currency}`;
}

export function qty(scaled: number | null | undefined): string {
  if (scaled === null || scaled === undefined) return '—';
  // Trim trailing zeros so "1.0000" reads as "1".
  return fromQuantity(scaled).replace(/\.?0+$/, '') || '0';
}

/** Convert decimal input ("12.500") to minor units for the API. */
export function toMinorInput(value: string, currency = activeCurrency): number {
  const trimmed = value.trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return 0;
  const scale = currencyScale(currency);
  const [whole, fraction = ''] = trimmed.split('.');
  const padded = fraction.padEnd(scale, '0').slice(0, scale);
  const sign = whole.startsWith('-') ? -1 : 1;
  const absWhole = Math.abs(Number(whole || '0'));
  return sign * (absWhole * 10 ** scale + Number(padded || '0'));
}

/** Render integer minor units as a decimal string for a money input field. */
export function toMoneyInput(minor: number | null | undefined, currency = activeCurrency): string {
  if (minor === null || minor === undefined) return '';
  return fromMinor(minor, currencyScale(currency));
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
