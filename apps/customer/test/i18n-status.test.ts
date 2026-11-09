import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dictionaries } from '../src/i18n/dictionaries';

/**
 * Guards a defect that shipped in the customer account area: `StatusBadge`
 * printed the raw API enum, so an Arabic RTL interface showed `held`,
 * `in_progress` and `no_show` in English. The fix routes every status through
 * the dictionary, and this test fails if a dictionary entry disappears, if the
 * two locales drift, or if a screen goes back to printing an enum directly.
 */

const STATUSES = [
  // BookingStatus
  'HELD',
  'CONFIRMED',
  'RESCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  // CustomerOrderStatus
  'PENDING',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  // PaymentIntentStatus
  'REQUIRES_METHOD',
  'REQUIRES_ACTION',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  // Refund / return / RFQ lifecycle
  'REQUESTED',
  'APPROVED',
  'PROCESSED',
  'REJECTED',
  'OPEN',
  'QUOTED',
  'ACCEPTED',
  'WITHDRAWN',
  'RESOLVED',
  'CLOSED',
  'UNDER_REVIEW',
  'AWAITING_PROVIDER',
  'ESCALATED',
  'ACTIVE',
  'INACTIVE',
  'SOLD',
  'RECEIVED',
  'REFUNDED',
  'ASSIGNED',
  'EN_ROUTE',
  'ON_SITE',
  'PUBLISHED',
  'HIDDEN',
  'VOIDED',
  'NEW',
];

const BOOKING_TYPES = ['INSPECTION', 'MAINTENANCE', 'PROVIDER_SERVICE'];

describe('customer status localisation', () => {
  it.each(STATUSES)('has an Arabic and an English label for %s', (status) => {
    expect(dictionaries.ar[`status.${status}`]).toBeTruthy();
    expect(dictionaries.en[`status.${status}`]).toBeTruthy();
  });

  it.each(BOOKING_TYPES)('has a localised label for booking type %s', (type) => {
    expect(dictionaries.ar[`bookingType.${type}`]).toBeTruthy();
    expect(dictionaries.en[`bookingType.${type}`]).toBeTruthy();
  });

  it('gives each verification outcome a distinct label in both locales', () => {
    // A scanned document reports one of four outcomes. `revoked` and
    // `cancelled` both read "ملغى" before this guard, so an Arabic reader
    // could not tell a withdrawn report from a cancelled one.
    for (const locale of ['ar', 'en'] as const) {
      const titles = ['valid', 'revoked', 'superseded', 'cancelled'].map((outcome) => {
        const title = dictionaries[locale][`verify.${outcome}Title`];
        expect(title, `${locale} verify.${outcome}Title`).toBeTruthy();
        return title;
      });
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it('resolves every verification outcome title and body from the dictionary', () => {
    // The page builds these as `verify.<outcome>Title` / `verify.<outcome>Body`.
    // It once omitted the `verify.` prefix, so a scan rendered the raw key
    // `validTitle` instead of a sentence. Every templated outcome — including
    // the transport-failure `error` outcome — needs both strings.
    const templated = ['valid', 'revoked', 'superseded', 'cancelled', 'error'];
    for (const locale of ['ar', 'en'] as const) {
      for (const outcome of templated) {
        expect(dictionaries[locale][`verify.${outcome}Title`], `${locale} verify.${outcome}Title`).toBeTruthy();
        expect(dictionaries[locale][`verify.${outcome}Body`], `${locale} verify.${outcome}Body`).toBeTruthy();
      }
      // `notfound` is rendered through an explicitly-cased key on the page.
      expect(dictionaries[locale]['verify.notFoundTitle']).toBeTruthy();
      expect(dictionaries[locale]['verify.notFoundBody']).toBeTruthy();
    }
  });

  it('keeps the verification page namespacing its outcome keys under verify.', () => {
    // Guards the defect at its source: the key template must carry the prefix.
    const page = readFileSync(
      join(__dirname, '..', 'src', 'app', 'verify', '[[...token]]', 'page.tsx'),
      'utf8',
    );
    expect(page).toContain('`verify.${outcome}Title`');
    expect(page).toContain('`verify.${outcome}Body`');
  });

  it('never renders a status label as the raw enum', () => {
    for (const status of STATUSES) {
      expect(dictionaries.ar[`status.${status}`]).not.toBe(status);
      expect(dictionaries.en[`status.${status}`]).not.toBe(status);
    }
  });

  it('keeps Arabic distinct from English for every status', () => {
    for (const status of STATUSES) {
      expect(dictionaries.ar[`status.${status}`]).not.toBe(dictionaries.en[`status.${status}`]);
    }
  });

  it('does not print a raw status enum on an account screen', () => {
    // The exact shapes the defect took before the fix.
    const offenders = [
      '<td>{booking.bookingType}</td>',
      'text={order.status}',
      'text={booking.status}',
      'text={rfq.status}',
    ];
    for (const file of accountScreens()) {
      const source = readFileSync(file, 'utf8');
      for (const offender of offenders) {
        expect(source.includes(offender), `${file} still renders ${offender}`).toBe(false);
      }
    }
  });
});

/** Every `.tsx` file under the customer app. */
function accountScreens(dir = join(__dirname, '..', 'src', 'app')): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...accountScreens(full));
      continue;
    }
    if (entry.endsWith('.tsx')) files.push(full);
  }
  return files;
}
