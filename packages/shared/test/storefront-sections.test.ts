import { describe, expect, it } from 'vitest';
import {
  STOREFRONT_SECTIONS,
  isMaintenanceServiceCategory,
  normalizeStorefrontHref,
  storefrontSection,
  storefrontSectionForCategoryKey,
  storefrontSectionForHref,
} from '../src/storefront-sections';
import { SERVICE_CATEGORIES } from '../src/service-categories';

/**
 * The storefront taxonomy is the single source of truth for the navigation,
 * the homepage cards, the footer and the sitemap. These tests pin the approved
 * order and the legacy-link mapping, which is what keeps a stored banner from
 * sending a visitor to a route the site does not serve.
 */
describe('storefront sections', () => {
  it('keeps the four approved sections in the required order', () => {
    expect(STOREFRONT_SECTIONS.map((section) => section.key)).toEqual([
      'inspections',
      'maintenance',
      'products',
      'spare_parts',
    ]);
  });

  it('gives every section a distinct absolute route and both languages of copy', () => {
    expect(new Set(STOREFRONT_SECTIONS.map((section) => section.href)).size).toBe(
      STOREFRONT_SECTIONS.length,
    );
    for (const section of STOREFRONT_SECTIONS) {
      expect(section.href.startsWith('/')).toBe(true);
      expect(section.titleEn.length).toBeGreaterThan(0);
      expect(section.titleAr.length).toBeGreaterThan(0);
      expect(section.descriptionEn.length).toBeGreaterThan(0);
      expect(section.descriptionAr.length).toBeGreaterThan(0);
      expect(section.navKey.startsWith('nav.')).toBe(true);
    }
  });

  it('looks a section up by key and by route', () => {
    expect(storefrontSection('spare_parts')?.href).toBe('/spare-parts');
    expect(storefrontSectionForHref('/services/inspections')?.key).toBe('inspections');
    expect(storefrontSectionForHref('/services/inspections/')?.key).toBe('inspections');
    expect(storefrontSectionForHref('/about')).toBeUndefined();
    expect(storefrontSectionForHref(null)).toBeUndefined();
  });
});

describe('normalizeStorefrontHref', () => {
  it('maps the legacy banner targets onto the section that owns them', () => {
    expect(normalizeStorefrontHref('/booking')).toBe('/services/inspections');
    expect(normalizeStorefrontHref('/services/comprehensive_inspection')).toBe(
      '/services/inspections',
    );
    expect(normalizeStorefrontHref('/store')).toBe('/spare-parts');
    expect(normalizeStorefrontHref('/offers')).toBe('/spare-parts');
  });

  it('routes a legacy service-category link to the matching section', () => {
    expect(normalizeStorefrontHref('/services?category=vehicle_inspection')).toBe(
      '/services/inspections',
    );
    expect(normalizeStorefrontHref('/services?category=spare_parts')).toBe('/spare-parts');
    expect(normalizeStorefrontHref('/services?category=maintenance')).toBe('/services/maintenance');
  });

  it('leaves a route the site already serves, and an external URL, untouched', () => {
    for (const section of STOREFRONT_SECTIONS) {
      expect(normalizeStorefrontHref(section.href)).toBe(section.href);
    }
    expect(normalizeStorefrontHref('/about')).toBe('/about');
    expect(normalizeStorefrontHref('/services')).toBe('/services');
    expect(normalizeStorefrontHref('https://example.com/offer')).toBe('https://example.com/offer');
    expect(normalizeStorefrontHref('')).toBe('');
  });
});

describe('maintenance section taxonomy', () => {
  it('keeps inspection and spare parts out of the maintenance page', () => {
    expect(isMaintenanceServiceCategory('vehicle_inspection')).toBe(false);
    expect(isMaintenanceServiceCategory('spare_parts')).toBe(false);
    expect(isMaintenanceServiceCategory('maintenance')).toBe(true);
    expect(isMaintenanceServiceCategory('recovery')).toBe(true);
    expect(isMaintenanceServiceCategory('car_wash')).toBe(true);
  });

  it('leaves at least one published service category on the maintenance page', () => {
    const maintenance = SERVICE_CATEGORIES.filter((category) =>
      isMaintenanceServiceCategory(category.key),
    );
    expect(maintenance.length).toBeGreaterThan(0);
    expect(maintenance.map((category) => category.key)).not.toContain('vehicle_inspection');
  });
});

describe('category key to section mapping', () => {
  it('sends an inspection category to the inspections section', () => {
    expect(storefrontSectionForCategoryKey('vehicle_inspection').href).toBe('/services/inspections');
  });

  it('sends a spare-parts category to the parts section', () => {
    expect(storefrontSectionForCategoryKey('spare_parts').href).toBe('/spare-parts');
  });

  it('sends every other service category to maintenance', () => {
    for (const key of ['maintenance', 'recovery', 'car_wash']) {
      expect(storefrontSectionForCategoryKey(key).href).toBe('/services/maintenance');
    }
  });

  it('maps every published category onto a route the site serves', () => {
    for (const category of SERVICE_CATEGORIES) {
      const section = storefrontSectionForCategoryKey(category.key);
      expect(STOREFRONT_SECTIONS.map((item) => item.href)).toContain(section.href);
    }
  });
});
