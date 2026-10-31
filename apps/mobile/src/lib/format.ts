/**
 * Money, date and number formatting for the marketplace demo.
 *
 * Amounts are integer minor units with an explicit currency scale, exactly as
 * the ERP stores them (`packages/shared/src/money.ts`). The client never divides
 * by a guessed scale, so a three-decimal currency such as the Bahraini dinar
 * renders correctly.
 */

import { DEMO_CURRENCY, DEMO_CURRENCY_SCALE } from '../demo/catalogue';

/** `12.500 BHD` / `12.500 د.ب`. */
export function formatMoney(
  amountMinor: number,
  currency: string = DEMO_CURRENCY,
  scale: number = DEMO_CURRENCY_SCALE,
): string {
  const value = amountMinor / 10 ** scale;
  return `${value.toFixed(scale)} ${currency}`;
}

/** A bare number at the currency scale, without the code — for tight cards. */
export function formatAmount(amountMinor: number, scale: number = DEMO_CURRENCY_SCALE): string {
  return (amountMinor / 10 ** scale).toFixed(scale);
}

/** `17 Oct 2026`. */
export function formatDate(iso: string): string {
  // An absent bound (an open-ended offer) is not a date, and must not render as
  // "Invalid Date" or as the epoch.
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** `17 Oct 2026, 08:00`. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `08:00`. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` in local time, the format the availability API expects. */
export function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The next `count` days starting today, for the booking date strip. */
export function upcomingDays(count: number, from: Date = new Date()): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Localised digits for a plain number, so Arabic copy stays consistent. */
export function localizeDigits(value: string | number, locale: 'ar' | 'en'): string {
  const text = String(value);
  if (locale !== 'ar') return text;
  return text.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)] as string);
}

/** A short weekday and day, e.g. `Sat 25` or `السبت ٢٥`. */
export function formatDayChip(date: Date, locale: 'ar' | 'en'): { weekday: string; day: string } {
  if (locale === 'ar') {
    const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return { weekday: weekdays[date.getDay()] as string, day: localizeDigits(date.getDate(), 'ar') };
  }
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { weekday: weekdays[date.getDay()] as string, day: String(date.getDate()) };
}

/** A long date, e.g. `25 October 2026` / `٢٥ أكتوبر ٢٠٢٦`. */
export function formatLongDate(iso: string, locale: 'ar' | 'en'): string {
  const d = new Date(iso);
  if (locale === 'ar') {
    return `${localizeDigits(d.getDate(), 'ar')} ${AR_MONTHS[d.getMonth()]} ${localizeDigits(d.getFullYear(), 'ar')}`;
  }
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** A percentage discount, e.g. `22`. */
export function discountPercent(priceMinor: number, compareAtMinor: number | null): number | null {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return null;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}

/** `1.2k BHD` — a compact label for tiles. */
export function compactMoney(amountMinor: number): string {
  const value = amountMinor / 10 ** DEMO_CURRENCY_SCALE;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k ${DEMO_CURRENCY}`;
  return `${value.toFixed(0)} ${DEMO_CURRENCY}`;
}
