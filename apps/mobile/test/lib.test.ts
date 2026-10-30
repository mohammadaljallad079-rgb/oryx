import { describe, expect, it } from 'vitest';

import { directionFor, translate, localized, type Locale } from '../src/lib/i18n';
import {
  formatDate,
  formatDayChip,
  formatMoney,
  localizeDigits,
  toDateParam,
  upcomingDays,
} from '../src/lib/format';
import { statusColor, themes } from '../src/lib/theme';
import { SPLASH_MIN_MS } from '../src/lib/splash-timing';
import {
  DEMO_BOOKINGS,
  DEMO_ORDERS,
  DEMO_PRODUCTS,
  DEMO_PROVIDERS,
  DEMO_STORES,
  DEMO_VEHICLES,
} from '../src/demo/activity';
import { filterProducts } from '../src/lib/repository';

/**
 * The marketplace demo has no backend to test against, so these tests pin the
 * pieces that are pure logic and that a reviewer will actually see: direction,
 * money, dates, the theme tokens and the catalogue filters. They run without a
 * device, which keeps them in the fast CI job.
 */

describe('direction', () => {
  it('is RTL for Arabic and LTR for English', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });
});

describe('translate', () => {
  it('returns Arabic text for representative keys', () => {
    const keys: Array<Parameters<typeof translate>[1]> = [
      'appName',
      'signIn',
      'parts',
      'recovery',
      'availableSlots',
      'sensageTitle',
    ];
    for (const key of keys) {
      const value = translate('ar', key);
      expect(value).toBeTruthy();
      // Arabic copy must actually be Arabic, not a fallback to English.
      expect(value).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('returns English text for representative keys', () => {
    const keys: Array<Parameters<typeof translate>[1]> = [
      'appName',
      'signIn',
      'parts',
      'recovery',
      'availableSlots',
      'sensageTitle',
    ];
    for (const key of keys) {
      expect(translate('en', key)).toBeTruthy();
    }
  });

  it('translates a key to different text per locale', () => {
    expect(translate('ar', 'parts')).not.toBe(translate('en', 'parts'));
  });

  it('picks the right side of a bilingual pair', () => {
    expect(localized('ar', { en: 'Parts', ar: 'قطع' })).toBe('قطع');
    expect(localized('en', { en: 'Parts', ar: 'قطع' })).toBe('Parts');
  });
});

describe('money', () => {
  it('renders a three-decimal currency without guessing the scale', () => {
    // 12500 minor units at scale 3 is 12.500 BHD, not 125.00.
    expect(formatMoney(12_500, 'BHD', 3)).toContain('12.500');
  });

  it('renders a two-decimal currency at scale 2', () => {
    expect(formatMoney(12_500, 'USD', 2)).toContain('125.00');
  });

  it('handles zero and negative amounts', () => {
    expect(formatMoney(0, 'BHD', 3)).toContain('0.000');
    expect(formatMoney(-4_500, 'BHD', 3)).toContain('-4.500');
  });
});

describe('dates', () => {
  it('formats a date param as YYYY-MM-DD in local time', () => {
    // Local-time construction, so the assertion is timezone independent.
    expect(toDateParam(new Date(2026, 9, 17))).toBe('2026-10-17');
  });

  it('pads single-digit months and days', () => {
    expect(toDateParam(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formats a date without throwing', () => {
    const iso = new Date(2026, 9, 17, 8, 30).toISOString();
    expect(formatDate(iso)).toBeTruthy();
  });

  it('produces the requested number of consecutive days', () => {
    const days = upcomingDays(7, new Date(2026, 9, 25));
    expect(days).toHaveLength(7);
    expect(days[0]?.getDate()).toBe(25);
    expect(days[6]?.getDate()).toBe(31);
  });

  it('labels a day chip in both locales', () => {
    const date = new Date(2026, 9, 25);
    expect(formatDayChip(date, 'en').weekday).toMatch(/^[A-Z][a-z]{2}$/);
    expect(formatDayChip(date, 'ar').weekday).toMatch(/[\u0600-\u06FF]/);
    // Arabic renders Arabic-Indic digits.
    expect(formatDayChip(date, 'ar').day).toMatch(/[\u0660-\u0669]/);
  });

  it('converts Western digits to Arabic-Indic only for Arabic', () => {
    expect(localizeDigits(2026, 'ar')).toBe('٢٠٢٦');
    expect(localizeDigits(2026, 'en')).toBe('2026');
  });
});

describe('status colours', () => {
  it('maps settled statuses to success and failed statuses to danger', () => {
    for (const mode of ['dark', 'light'] as const) {
      const theme = themes[mode];
      expect(statusColor(theme, 'COMPLETED')).toBe(theme.success);
      expect(statusColor(theme, 'DELIVERED')).toBe(theme.success);
      expect(statusColor(theme, 'PENDING')).toBe(theme.warning);
      expect(statusColor(theme, 'EN_ROUTE')).toBe(theme.warning);
      expect(statusColor(theme, 'FAILED')).toBe(theme.danger);
      expect(statusColor(theme, 'CANCELLED')).toBe(theme.danger);
    }
  });

  it('falls back to the muted text colour for an unknown status', () => {
    expect(statusColor(themes.dark, 'SOMETHING_ELSE')).toBe(themes.dark.textMuted);
  });

  it('exposes both a dark and a light theme', () => {
    expect(themes.dark.mode).toBe('dark');
    expect(themes.light.mode).toBe('light');
    expect(themes.dark.bg).not.toBe(themes.light.bg);
  });

  it('keeps the dark theme the approved navy', () => {
    // The dark theme is the approved identity and must not drift. The gold is
    // #d7b878 because the owner's written specification sets that value for the
    // accent; the earlier #d4af37 was the previous revision of the palette.
    expect(themes.dark.bg).toBe('#00162b');
    expect(themes.dark.bgDeep).toBe('#00101f');
    expect(themes.dark.surface).toBe('#061b32');
    expect(themes.dark.gold).toBe('#d7b878');
    expect(themes.dark.goldSoft).toBe('#f0c46c');
    expect(themes.dark.goldDeep).toBe('#c6a15b');
    expect(themes.dark.text).toBe('#ffffff');
    expect(themes.dark.textMuted).toBe('#b6bec9');
    expect(themes.dark.textFaint).toBe('#8995a7');
    expect(themes.dark.border).toBe('#30445b');
    expect(themes.dark.search).toBe('#1b3047');
  });
});

describe('demo catalogue', () => {
  it('carries at least fifty products', () => {
    expect(DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(50);
  });

  it('carries fifteen stores', () => {
    expect(DEMO_STORES).toHaveLength(15);
  });

  it('carries ten inspection, ten maintenance and eight recovery providers', () => {
    expect(DEMO_PROVIDERS.filter((p) => p.kind === 'inspection')).toHaveLength(10);
    expect(DEMO_PROVIDERS.filter((p) => p.kind === 'maintenance')).toHaveLength(10);
    expect(DEMO_PROVIDERS.filter((p) => p.kind === 'recovery')).toHaveLength(8);
  });

  it('gives every product a positive price and a known store', () => {
    const storeIds = new Set(DEMO_STORES.map((s) => s.id));
    for (const product of DEMO_PRODUCTS) {
      expect(product.priceMinor).toBeGreaterThan(0);
      expect(storeIds.has(product.storeId)).toBe(true);
    }
  });

  it('gives every provider at least one priced service', () => {
    for (const provider of DEMO_PROVIDERS) {
      expect(provider.services.length).toBeGreaterThan(0);
      expect(provider.services[0]?.priceMinor).toBeGreaterThan(0);
    }
  });

  it('keeps every order total equal to its subtotal plus delivery', () => {
    for (const order of DEMO_ORDERS) {
      expect(order.totalMinor).toBe(order.subtotalMinor + order.deliveryMinor);
    }
  });

  it('books every booking against a real provider and vehicle', () => {
    const providerIds = new Set(DEMO_PROVIDERS.map((p) => p.id));
    const vehicleIds = new Set(DEMO_VEHICLES.map((v) => v.id));
    for (const booking of DEMO_BOOKINGS) {
      expect(providerIds.has(booking.providerId)).toBe(true);
      expect(vehicleIds.has(booking.vehicleId)).toBe(true);
    }
  });
});

describe('product filtering', () => {
  it('returns everything when the filter is empty', () => {
    expect(filterProducts(DEMO_PRODUCTS, {})).toHaveLength(DEMO_PRODUCTS.length);
  });

  it('filters by part group', () => {
    const brakes = filterProducts(DEMO_PRODUCTS, { groupEn: 'Brakes' });
    expect(brakes.length).toBeGreaterThan(0);
    expect(brakes.every((p) => p.groupEn === 'Brakes')).toBe(true);
  });

  it('filters by a make the part is listed to fit', () => {
    const toyota = filterProducts(DEMO_PRODUCTS, { make: 'Toyota' });
    expect(toyota.every((p) => p.fits.includes('Toyota'))).toBe(true);
  });

  it('filters by a price ceiling', () => {
    const cheap = filterProducts(DEMO_PRODUCTS, { maxPriceMinor: 10_000 });
    expect(cheap.every((p) => p.priceMinor <= 10_000)).toBe(true);
  });

  it('filters to discounted items only', () => {
    const discounted = filterProducts(DEMO_PRODUCTS, { discountedOnly: true });
    expect(discounted.length).toBeGreaterThan(0);
    expect(discounted.every((p) => p.compareAtMinor != null)).toBe(true);
  });

  it('sorts by ascending price', () => {
    const sorted = filterProducts(DEMO_PRODUCTS, { sort: 'price_asc' });
    for (let i = 1; i < sorted.length; i += 1) {
      expect((sorted[i]?.priceMinor ?? 0) >= (sorted[i - 1]?.priceMinor ?? 0)).toBe(true);
    }
  });

  it('matches a free-text query across both locales', () => {
    const byEnglish = filterProducts(DEMO_PRODUCTS, { query: 'brake' });
    expect(byEnglish.length).toBeGreaterThan(0);
    const byArabic = filterProducts(DEMO_PRODUCTS, { query: 'فرامل' });
    expect(byArabic.length).toBeGreaterThan(0);
  });

  it('combines a group filter and a query', () => {
    const result = filterProducts(DEMO_PRODUCTS, { groupEn: 'Filters', query: 'oil' });
    expect(result.every((p) => p.groupEn === 'Filters')).toBe(true);
    expect(result.every((p) => p.nameEn.toLowerCase().includes('oil'))).toBe(true);
  });
});

describe('locale type', () => {
  it('covers both supported locales', () => {
    const locales: Locale[] = ['ar', 'en'];
    expect(locales).toHaveLength(2);
  });
});

describe('splash duration contract', () => {
  // The owner rejected an earlier build because the splash was gone before it
  // painted. The gate must hold the splash for a measurable minimum, and that
  // minimum has to be a real duration rather than a frame.
  it('holds the splash for at least two seconds', () => {
    expect(SPLASH_MIN_MS).toBeGreaterThanOrEqual(2000);
  });
});
