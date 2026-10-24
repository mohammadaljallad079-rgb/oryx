import { describe, expect, it } from 'vitest';

import { directionFor, translate } from '../src/lib/i18n';
import { formatBasisPoints, formatDate, formatMoney, formatQuantity, toBasisPoints, toMinor, toScaledQuantity } from '../src/lib/format';
import { statusColor, themes } from '../src/lib/theme';
import { resourceFor, RESOURCES, visibleResources } from '../src/lib/resources';

/**
 * Pure-logic tests for the ERP app.
 *
 * They pin the pieces that decide correctness on the wire: direction, the money
 * and quantity scales, the light-theme tokens and the resource registry's
 * permission gate. All of it runs without a device, so it stays in the fast CI
 * job alongside the other unit suites.
 */

describe('direction', () => {
  it('is RTL for Arabic and LTR for English', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });
});

describe('translate', () => {
  it('returns Arabic copy for representative keys', () => {
    const keys: Array<Parameters<typeof translate>[1]> = [
      'appName',
      'signIn',
      'dashboard',
      'newInvoiceTitle',
      'newTransferTitle',
    ];
    for (const key of keys) {
      const value = translate('ar', key);
      expect(value).toBeTruthy();
      // Arabic copy must really be Arabic, not an English fallback.
      expect(value).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('returns English copy for the same keys', () => {
    const keys: Array<Parameters<typeof translate>[1]> = ['appName', 'signIn', 'dashboard'];
    for (const key of keys) expect(translate('en', key)).toBeTruthy();
  });

  it('differs between locales', () => {
    expect(translate('ar', 'dashboard')).not.toBe(translate('en', 'dashboard'));
  });
});

describe('money and quantity scales', () => {
  it('uses the currency scale rather than a fixed two decimals', () => {
    // 12500 minor units at scale 3 is 12.500 BHD, not 125.00.
    expect(formatMoney(12_500, 'BHD')).toContain('12.500');
  });

  it('renders a two-decimal currency correctly', () => {
    expect(formatMoney(12_500, 'USD')).toContain('125.00');
  });

  it('converts user input into minor units at the currency scale', () => {
    expect(toMinor('12.500', 'BHD')).toBe(12_500);
    expect(toMinor('125.00', 'USD')).toBe(12_500);
  });

  it('scales a quantity by 10^4', () => {
    expect(toScaledQuantity('2.5')).toBe(25_000);
    expect(formatQuantity(25_000)).toBe('2.5');
  });

  it('converts a percentage to basis points', () => {
    expect(toBasisPoints('15')).toBe(1500);
    expect(formatBasisPoints(1500)).toBe('15%');
  });

  it('does not lose a date to timezone drift', () => {
    expect(formatDate('2026-10-17T00:00:00.000Z')).toMatch(/2026/);
  });
});

describe('theme', () => {
  it('keeps the approved dark navy as the dark background', () => {
    expect(themes.dark.bg).toBe('#00162b');
    expect(themes.dark.gold).toBe('#d4af37');
  });

  it('uses the approved ivory and charcoal for the light theme', () => {
    expect(themes.light.bg).toBe('#f7f4ed');
    expect(themes.light.surface).toBe('#ffffff');
    expect(themes.light.text).toBe('#22201d');
  });

  it('darkens the gold in light mode so it stays legible on ivory', () => {
    // The dark theme's #d4af37 does not reach a usable ratio on #f7f4ed.
    expect(themes.light.gold).not.toBe(themes.dark.gold);
    expect(themes.light.gold).toBe('#7d5f10');
  });

  it('colours a posted document as success and a cancelled one as danger', () => {
    expect(statusColor(themes.light, 'POSTED')).toBe(themes.light.success);
    expect(statusColor(themes.light, 'CANCELLED')).toBe(themes.light.danger);
  });
});

describe('resource registry', () => {
  it('gives every resource a path, a title and a read permission', () => {
    for (const resource of RESOURCES) {
      expect(resource.path.startsWith('/')).toBe(true);
      expect(resource.title).toBeTruthy();
      expect(resource.permission).toBeTruthy();
      expect(resource.columns.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate resource key', () => {
    const keys = RESOURCES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only exposes a resource the principal may read', () => {
    expect(visibleResources(['erp.sales.read']).map((r) => r.key)).toContain('customers');
    expect(visibleResources(['erp.sales.read']).map((r) => r.key)).not.toContain('employees');
  });

  it('hides everything from a principal with no permissions', () => {
    expect(visibleResources([])).toEqual([]);
  });

  it('resolves a resource by key and rejects an unknown one', () => {
    expect(resourceFor('invoices')?.path).toBe('/sales/invoices');
    expect(resourceFor('nope')).toBeUndefined();
  });

  it('offers a create form only where the API supports a create', () => {
    const withForm = RESOURCES.filter((r) => r.fields);
    for (const resource of withForm) expect(resource.createPermission).toBeTruthy();
  });

  it('resolves every column and field label to real copy', () => {
    // A label that is not in the dictionary renders as its raw key — the list
    // showed "nameEn" and "price" instead of "Name (English)" and "Price" —
    // because `translate` falls back to the key. Guard both locales.
    for (const resource of RESOURCES) {
      for (const label of [
        ...resource.columns.map((c) => c.label),
        ...(resource.fields ?? []).map((f) => f.label),
      ]) {
        for (const locale of ['ar', 'en'] as const) {
          expect(translate(locale, label), `${resource.key}:${label}`).not.toBe(String(label));
        }
      }
    }
  });
});
