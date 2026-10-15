/**
 * Money formatting for the mobile app.
 *
 * Amounts arrive as integer minor units with an explicit currency scale, exactly
 * as the ERP stores them (`packages/shared/src/money.ts`). The mobile client never
 * divides by a guessed scale, so a three-decimal currency such as the Bahraini
 * dinar renders correctly.
 */

export function formatMoney(amountMinor: number, currency: string, scale: number): string {
  const divisor = 10 ** scale;
  const value = amountMinor / divisor;
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

/** Short date, e.g. "17 Oct 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Date and time, e.g. "17 Oct 2026, 08:00". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `YYYY-MM-DD` in local time, which is the format the availability API expects. */
export function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `HH:mm` in local time, used to label an availability slot. */
export function toTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
