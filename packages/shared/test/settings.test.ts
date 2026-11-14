import { describe, expect, it } from 'vitest';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_ENTITY_TYPES,
  SETTING_NAMESPACES,
  SettingsValidationError,
  defaultSettingsFor,
  mergeSettings,
  sanitizeSettings,
} from '../src/settings';

/**
 * Invariants the per-company settings control center depends on.
 *
 * A stored namespace must always be a complete, validated object: the API
 * sanitises on write and the UI renders whatever it reads, so a hole in the
 * shape would surface as an empty field rather than a crash. These tests make
 * the shape a build-time guarantee.
 */
describe('settings catalog', () => {
  it('has a default for every namespace', () => {
    for (const ns of SETTING_NAMESPACES) {
      const defaults = defaultSettingsFor(ns);
      expect(defaults).toBeTruthy();
      expect(Object.keys(defaults).length).toBeGreaterThan(0);
    }
  });

  it('returns a fresh default object each call', () => {
    const a = defaultSettingsFor('GENERAL');
    const b = defaultSettingsFor('GENERAL');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('merges a partial value over the defaults without dropping keys', () => {
    const merged = mergeSettings('TAX', { vatRateBp: 500 } as never);
    expect(merged.vatRateBp).toBe(500);
    // A key that was not supplied keeps its default.
    expect(merged.taxNumber).toBe(defaultSettingsFor('TAX').taxNumber);
    expect(Object.keys(merged).sort()).toEqual(Object.keys(defaultSettingsFor('TAX')).sort());
  });

  it('sanitises an incoming value: unknown keys dropped, missing keys filled', () => {
    const clean = sanitizeSettings('SALES', { defaultPaymentTermsDays: 45, notAKey: 'x' });
    expect(clean.defaultPaymentTermsDays).toBe(45);
    expect(clean).not.toHaveProperty('notAKey');
    expect(clean.quoteValidityDays).toBe(defaultSettingsFor('SALES').quoteValidityDays);
  });

  it('rejects a value outside its declared bounds', () => {
    expect(() => sanitizeSettings('TAX', { vatRateBp: 999999 })).toThrow(SettingsValidationError);
    expect(() => sanitizeSettings('TAX', { vatRateBp: -1 })).toThrow(SettingsValidationError);
  });

  it('rejects an enumerated value that is not in the list', () => {
    expect(() => sanitizeSettings('GENERAL', { locale: 'fr' })).toThrow(SettingsValidationError);
    expect(sanitizeSettings('GENERAL', { locale: 'en' }).locale).toBe('en');
  });

  it('rejects a non-object payload', () => {
    expect(() => sanitizeSettings('GENERAL', null)).toThrow(SettingsValidationError);
    expect(() => sanitizeSettings('GENERAL', [1, 2, 3])).toThrow(SettingsValidationError);
  });
});

describe('document catalog', () => {
  it('accepts the document types the brief lists', () => {
    for (const mime of [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
    ]) {
      expect(ALLOWED_DOCUMENT_MIME_TYPES).toContain(mime);
    }
  });

  it('lists the record types that accept documents', () => {
    for (const type of ['CUSTOMER', 'COMPANY', 'SUPPLIER', 'EMPLOYEE', 'VEHICLE', 'JOB_CARD']) {
      expect(DOCUMENT_ENTITY_TYPES).toContain(type);
    }
  });
});
