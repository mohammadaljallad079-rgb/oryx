import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SCALE,
  currencyDefinition,
  currencyScale,
  currencySymbol,
  isKnownCurrency,
} from '../src/currency';
import { fromMinor, toMinor } from '../src/money';

/**
 * Bahrain uses the Dinar, subdivided into 1000 fils. Reading BHD as a
 * two-decimal currency misstates every amount by a factor of ten, so the scale
 * is asserted directly and then proved end-to-end through the money helpers.
 */
describe('currency — minor-unit scale', () => {
  it('treats the Bahraini Dinar as a three-decimal currency', () => {
    expect(currencyScale('BHD')).toBe(3);
  });

  it('treats the other Gulf three-decimal currencies correctly', () => {
    expect(currencyScale('KWD')).toBe(3);
    expect(currencyScale('OMR')).toBe(3);
  });

  it('treats two-decimal currencies correctly', () => {
    expect(currencyScale('SAR')).toBe(2);
    expect(currencyScale('USD')).toBe(2);
    expect(currencyScale('EUR')).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(currencyScale('bhd')).toBe(3);
    expect(currencyScale('Sar')).toBe(2);
  });

  it('defaults to the launch currency when the code is absent', () => {
    expect(currencyScale(null)).toBe(DEFAULT_CURRENCY_SCALE);
    expect(currencyScale(undefined)).toBe(DEFAULT_CURRENCY_SCALE);
    expect(currencyScale('')).toBe(DEFAULT_CURRENCY_SCALE);
    expect(DEFAULT_CURRENCY).toBe('BHD');
  });

  it('falls back to two decimals for an unknown code rather than throwing', () => {
    expect(currencyScale('XYZ')).toBe(2);
  });

  it('prices ORYX automotive services in Bahraini Dinars', () => {
    expect(DEFAULT_CURRENCY_SCALE).toBe(3);
  });

  it('exposes a definition and symbol for every listed currency', () => {
    for (const currency of CURRENCIES) {
      expect(currencyDefinition(currency.code)).toBeDefined();
      expect(currencySymbol(currency.code, 'en')).toBeTruthy();
      expect(currencySymbol(currency.code, 'ar')).toBeTruthy();
    }
  });

  it('reports currency support', () => {
    expect(isKnownCurrency('BHD')).toBe(true);
    expect(isKnownCurrency('XYZ')).toBe(false);
  });

  it('returns the code itself for an unknown currency symbol', () => {
    expect(currencySymbol('XYZ')).toBe('XYZ');
  });
});

describe('currency — scale end to end through the money helpers', () => {
  it('parses one Dinar as 1000 fils, not 100', () => {
    expect(toMinor('1.000', currencyScale('BHD'))).toBe(1000);
  });

  it('parses a typical Bahraini service price exactly', () => {
    // BD 25.500 → 25500 fils.
    expect(toMinor('25.500', currencyScale('BHD'))).toBe(25500);
  });

  it('renders fils back to a three-decimal Dinar string', () => {
    expect(fromMinor(25500, currencyScale('BHD'))).toBe('25.500');
  });

  it('rejects a BHD amount carrying four decimals', () => {
    expect(() => toMinor('1.0001', currencyScale('BHD'))).toThrow();
  });

  it('still round-trips a two-decimal currency unchanged', () => {
    const scale = currencyScale('SAR');
    expect(toMinor('25.50', scale)).toBe(2550);
    expect(fromMinor(2550, scale)).toBe('25.50');
  });

  it('shows the factor-of-ten difference between BHD and a 2-decimal reading', () => {
    // The bug this guards: "1.000" read with scale 2 truncates to 100 minor
    // units and silently loses 90% of the amount.
    expect(toMinor('1.000', 3)).toBe(1000);
    expect(toMinor('1.00', 2)).toBe(100);
  });
});
