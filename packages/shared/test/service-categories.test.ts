import { describe, expect, it } from 'vitest';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_KEYS,
  categoryArt,
  isServiceCategoryKey,
  serviceCategory,
} from '../src/service-categories';

/**
 * The catalogue is the single source of truth for the key space shared by the
 * CMS category rows, the marketplace provider `categoryKey` and both clients.
 * These tests pin the invariants that a drift would break.
 */
describe('service category catalogue', () => {
  it('is non-empty, so a client can seed a picker from its first entry', () => {
    expect(SERVICE_CATEGORIES.length).toBeGreaterThan(0);
    expect(SERVICE_CATEGORIES[0].key).toBeTruthy();
  });

  it('has unique keys', () => {
    const keys = SERVICE_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SERVICE_CATEGORY_KEYS).toEqual(keys);
  });

  it('uses the persisted identifier shape the database expects', () => {
    for (const category of SERVICE_CATEGORIES) {
      expect(category.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('gives every category both locales of copy and artwork', () => {
    for (const category of SERVICE_CATEGORIES) {
      expect(category.nameEn).toBeTruthy();
      expect(category.nameAr).toBeTruthy();
      expect(category.descEn).toBeTruthy();
      expect(category.descAr).toBeTruthy();
      expect(category.art).toMatch(/^\/art\/.+\.svg$/);
      expect(category.sortOrder).toBeGreaterThan(0);
    }
  });

  it('keeps sort order distinct so the directory has a stable order', () => {
    const orders = SERVICE_CATEGORIES.map((c) => c.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('recognises a canonical key and rejects the retired ones', () => {
    expect(isServiceCategoryKey('maintenance')).toBe(true);
    // The pre-Execution-07 website used `automotive_*` keys that no provider
    // carried; a regression to those must fail here.
    expect(isServiceCategoryKey('automotive_maintenance')).toBe(false);
    expect(isServiceCategoryKey('WORKSHOP')).toBe(false);
    expect(isServiceCategoryKey('')).toBe(false);
  });

  it('resolves artwork by key and falls back for an unknown one', () => {
    const maintenance = serviceCategory('maintenance');
    expect(maintenance).toBeDefined();
    expect(categoryArt('maintenance')).toBe(maintenance!.art);
    expect(categoryArt('nope')).toBe('/art/hero-automotive.svg');
  });
});
