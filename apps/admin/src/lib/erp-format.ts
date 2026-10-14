'use client';

import { fromQuantity, fromMinor } from '@oryx/shared';

/**
 * Display helpers for the ERP pages.
 *
 * The API returns integer minor units and 10^4-scaled quantities, so every
 * figure is formatted from those integers — the UI never re-derives a total from
 * floats, which keeps what is shown identical to what was posted.
 */
export function money(minor: number | null | undefined, currency = 'SAR'): string {
  if (minor === null || minor === undefined) return '—';
  return `${fromMinor(minor)} ${currency}`;
}

export function qty(scaled: number | null | undefined): string {
  if (scaled === null || scaled === undefined) return '—';
  // Trim trailing zeros so "1.0000" reads as "1".
  return fromQuantity(scaled).replace(/\.?0+$/, '') || '0';
}

/** Convert a decimal input ("12.50") to minor units for the API. */
export function toMinorInput(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return 0;
  const [whole, fraction = ''] = trimmed.split('.');
  const padded = fraction.padEnd(2, '0').slice(0, 2);
  const sign = whole.startsWith('-') ? -1 : 1;
  const absWhole = Math.abs(Number(whole || '0'));
  return sign * (absWhole * 100 + Number(padded || '0'));
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
