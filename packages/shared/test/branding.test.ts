import { describe, expect, it } from 'vitest';
import {
  ORYX_DEFAULT_BRANDING,
  contrastRatioWithWhite,
  isValidHexColor,
  normalizeHexColor,
  readableForegroundOn,
  resolveBranding,
} from '../src/branding';

/**
 * Per-company branding resolution.
 *
 * These run without a database. The colour checks are security-relevant: the
 * resolved value reaches a `style` attribute, so the validator is the only thing
 * standing between an uploaded tenant and CSS injection.
 */

describe('hex colour validation', () => {
  it('accepts 6-digit hex in either case', () => {
    expect(isValidHexColor('#d4af37')).toBe(true);
    expect(isValidHexColor('#D4AF37')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
    expect(isValidHexColor('#ffffff')).toBe(true);
  });

  it('rejects shorthand, alpha, names and injection attempts', () => {
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('#d4af3780')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('d4af37')).toBe(false);
    // The important case: a value that starts like a colour and then escapes.
    expect(isValidHexColor('#d4af37; background:url(x)')).toBe(false);
    expect(isValidHexColor('#d4af37}')).toBe(false);
    expect(isValidHexColor('')).toBe(false);
  });

  it('normalises case and treats empty as unset', () => {
    expect(normalizeHexColor('#D4AF37')).toBe('#d4af37');
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });

  it('throws on a malformed colour rather than silently dropping it', () => {
    expect(() => normalizeHexColor('#fff')).toThrow();
    expect(() => normalizeHexColor('#d4af37; x')).toThrow();
  });
});

describe('readable foreground selection', () => {
  it('picks white text on a dark brand colour', () => {
    expect(contrastRatioWithWhite('#00162b')).toBeGreaterThan(4.5);
    expect(readableForegroundOn('#00162b')).toBe('#ffffff');
  });

  it('picks dark text on a bright brand colour', () => {
    // Gold and yellow are the realistic failure: white on #d4af37 is unreadable.
    expect(contrastRatioWithWhite('#d4af37')).toBeLessThan(4.5);
    expect(readableForegroundOn('#d4af37')).toBe('#0b0b0c');
  });

  it('rejects an invalid colour instead of guessing', () => {
    expect(() => readableForegroundOn('gold')).toThrow();
  });
});

describe('branding fallback resolution', () => {
  it('returns the ORYX default when a company has set nothing', () => {
    expect(resolveBranding(null)).toEqual(ORYX_DEFAULT_BRANDING);
    expect(resolveBranding(undefined)).toEqual(ORYX_DEFAULT_BRANDING);
  });

  it('inherits the default field by field, so a partial row stays intentional', () => {
    const resolved = resolveBranding({ nameEn: 'Al Noor Motors', primaryColor: '#123456' });
    expect(resolved.nameEn).toBe('Al Noor Motors');
    expect(resolved.primaryColor).toBe('#123456');
    // Untouched fields inherit rather than rendering empty.
    expect(resolved.nameAr).toBe(ORYX_DEFAULT_BRANDING.nameAr);
    expect(resolved.accentColor).toBe(ORYX_DEFAULT_BRANDING.accentColor);
  });

  it('treats an empty string as unset, not as a blank value', () => {
    const resolved = resolveBranding({ nameEn: '', logoAssetId: '' });
    expect(resolved.nameEn).toBe(ORYX_DEFAULT_BRANDING.nameEn);
    expect(resolved.logoAssetId).toBeNull();
  });

  it('lets a company override the ORYX accent without touching the rest', () => {
    const resolved = resolveBranding({ accentColor: '#abcdef' });
    expect(resolved.accentColor).toBe('#abcdef');
    expect(resolved.primaryColor).toBe(ORYX_DEFAULT_BRANDING.primaryColor);
  });

  it('does not mutate the default object', () => {
    const before = { ...ORYX_DEFAULT_BRANDING };
    const resolved = resolveBranding({ nameEn: 'Changed' });
    resolved.nameEn = 'Mutated';
    expect(ORYX_DEFAULT_BRANDING).toEqual(before);
  });
});
