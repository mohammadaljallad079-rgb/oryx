import { describe, expect, it } from 'vitest';

import { directionFor, translate, type Locale } from '../src/lib/i18n';
import { formatDate, formatMoney, toDateParam, toTimeLabel } from '../src/lib/format';
import { statusColor, themes } from '../src/lib/theme';

/**
 * The mobile app shares the customer website's contract, so these tests pin the
 * pieces that are pure logic: direction, money, dates and status colours. They
 * run without a device, which keeps them in the fast CI job.
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
      'garage',
      'bookInspection',
      'availableSlots',
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
      'garage',
      'bookInspection',
      'availableSlots',
    ];
    for (const key of keys) {
      expect(translate('en', key)).toBeTruthy();
    }
  });

  it('translates a key to different text per locale', () => {
    expect(translate('ar', 'garage')).not.toBe(translate('en', 'garage'));
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
    expect(formatMoney(-4_500, 'BHD', 3)).toContain('4.500');
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

  it('formats a date and a time label without throwing', () => {
    const iso = new Date(2026, 9, 17, 8, 30).toISOString();
    expect(formatDate(iso)).toBeTruthy();
    expect(toTimeLabel(iso)).toBeTruthy();
  });
});

describe('status colours', () => {
  it('maps settled statuses to success and failed statuses to danger', () => {
    for (const mode of ['dark', 'light'] as const) {
      const theme = themes[mode];
      expect(statusColor(theme, 'COMPLETED')).toBe(theme.success);
      expect(statusColor(theme, 'SUCCEEDED')).toBe(theme.success);
      expect(statusColor(theme, 'PENDING')).toBe(theme.warning);
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
});

describe('locale type', () => {
  it('covers both supported locales', () => {
    const locales: Locale[] = ['ar', 'en'];
    expect(locales).toHaveLength(2);
  });
});
