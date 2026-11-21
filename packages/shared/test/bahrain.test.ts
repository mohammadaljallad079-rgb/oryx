import { describe, expect, it } from 'vitest';

import {
  BAHRAIN_FINANCIAL_DEFAULTS,
  BAHRAIN_SERVICE_AREAS,
  BH_CALLING_CODE,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_TIMEZONE,
  isValidBahrainPhone,
  normaliseBahrainPhone,
  toE164BahrainPhone,
  toNationalDigits,
} from '../src/bahrain';
import { currencyScale } from '../src/currency';

/**
 * Bahrain is the launch market, so these values are the platform defaults, not
 * examples. The numbering plan assertions matter because a rejected valid number
 * locks a customer out of an account they can never verify.
 */
describe('bahrain — market defaults', () => {
  it('launches in Bahrain', () => {
    expect(DEFAULT_COUNTRY_CODE).toBe('BH');
    expect(BH_CALLING_CODE).toBe('973');
  });

  it('uses the Asia/Bahrain zone, which has no daylight saving', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Bahrain');
  });

  it('prices in the three-decimal Dinar', () => {
    expect(BAHRAIN_FINANCIAL_DEFAULTS.currency).toBe('BHD');
    expect(BAHRAIN_FINANCIAL_DEFAULTS.currencyScale).toBe(3);
    expect(currencyScale(BAHRAIN_FINANCIAL_DEFAULTS.currency)).toBe(3);
  });

  it('asserts no VAT rate of its own', () => {
    // The owner sets the operative rate. A non-zero default here would be an
    // invented tax rate, which the brief forbids.
    expect(BAHRAIN_FINANCIAL_DEFAULTS.vatRateBp).toBe(0);
  });
});

describe('bahrain — mobile numbering plan', () => {
  it('accepts a bare eight-digit mobile number', () => {
    expect(normaliseBahrainPhone('36123456')).toEqual({
      e164: '+97336123456',
      local: '36123456',
      valid: true,
    });
  });

  it('accepts E.164 with and without the plus', () => {
    expect(toE164BahrainPhone('+97336123456')).toBe('+97336123456');
    expect(toE164BahrainPhone('97336123456')).toBe('+97336123456');
    expect(toE164BahrainPhone('0097336123456')).toBe('+97336123456');
  });

  it('ignores spaces, dashes and parentheses', () => {
    expect(toE164BahrainPhone('3612 3456')).toBe('+97336123456');
    expect(toE164BahrainPhone('+973 3612-3456')).toBe('+97336123456');
    expect(toE164BahrainPhone('(973) 3612 3456')).toBe('+97336123456');
  });

  it('rejects a landline, because a consumer is contacted by mobile', () => {
    const result = normaliseBahrainPhone('17123456');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_prefix');
  });

  it('reports a wrong length distinctly from a wrong prefix', () => {
    expect(normaliseBahrainPhone('3612345').reason).toBe('wrong_length');
    expect(normaliseBahrainPhone('361234567').reason).toBe('wrong_length');
  });

  it('reports a foreign number as a country mismatch', () => {
    expect(normaliseBahrainPhone('+971501234567').reason).toBe('wrong_country');
    expect(normaliseBahrainPhone('+966501234567').reason).toBe('wrong_country');
  });

  it('reports an empty value as empty, not as malformed', () => {
    expect(normaliseBahrainPhone('').reason).toBe('empty');
    expect(normaliseBahrainPhone(null).reason).toBe('empty');
    expect(normaliseBahrainPhone(undefined).reason).toBe('empty');
    expect(normaliseBahrainPhone('   ').reason).toBe('empty');
  });

  it('rejects a value containing letters', () => {
    expect(normaliseBahrainPhone('3612abcd').reason).toBe('not_a_number');
    expect(normaliseBahrainPhone('+973-ORRX').reason).toBe('not_a_number');
  });

  it('never returns a value for a rejected input', () => {
    for (const bad of ['', '123', '17123456', '+971501234567', 'abc']) {
      const result = normaliseBahrainPhone(bad);
      expect(result.valid).toBe(false);
      expect(result.e164).toBeNull();
      expect(result.local).toBeNull();
    }
  });

  it('exposes a boolean helper that agrees with the result object', () => {
    expect(isValidBahrainPhone('36123456')).toBe(true);
    expect(isValidBahrainPhone('17123456')).toBe(false);
  });
});

describe('bahrain — national digit extraction', () => {
  it('reduces every accepted form to the same national number', () => {
    for (const form of ['36123456', '+97336123456', '97336123456', '0097336123456', '3612 3456']) {
      expect(toNationalDigits(form)).toBe('36123456');
    }
  });

  it('returns null when no digits can be recovered', () => {
    expect(toNationalDigits('no digits')).toBeNull();
    expect(toNationalDigits(null)).toBeNull();
  });
});

describe('bahrain — service areas', () => {
  it('seeds the administrative areas of Bahrain', () => {
    expect(BAHRAIN_SERVICE_AREAS.length).toBeGreaterThanOrEqual(5);
    for (const area of BAHRAIN_SERVICE_AREAS) {
      expect(area.code).toMatch(/^BH-[A-Z]{3}$/);
      expect(area.nameEn.length).toBeGreaterThan(0);
      expect(area.nameAr.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes', () => {
    const codes = BAHRAIN_SERVICE_AREAS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
