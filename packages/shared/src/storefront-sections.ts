/**
 * The four public storefront sections, in the approved order.
 *
 * The navigation, the footer, the homepage cards, the category hub and the
 * sitemap all read this one list, so a section cannot be named or ordered
 * differently in one place than another. The order is the owner's requirement:
 * technical inspections, maintenance services, products, spare parts.
 *
 * Each section names the *route* it opens and the *data source* behind it:
 *
 * - `inspections` reads the active `InspectionService` catalogue (the seven
 *   approved services). It is not the inspection-report engine.
 * - `maintenance` reads the published `ServiceCategory` catalogue.
 * - `products` reads the public product catalogue, excluding spare parts.
 * - `spare_parts` reads the published spare-parts catalogue — a product is a
 *   spare part when it carries a `partCategoryKey` and is published.
 *
 * Nothing here invents a service, a price or a category: it only names the
 * routes and the taxonomy the database already owns.
 */

export type StorefrontSectionKey = 'inspections' | 'maintenance' | 'products' | 'spare_parts';

export interface StorefrontSectionDefinition {
  key: StorefrontSectionKey;
  /** The canonical route the section opens. */
  href: string;
  /** Dictionary key for the navigation label. */
  navKey: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  /** Bundled photography used by the homepage card and the hero fallback. */
  art: string;
  /**
   * Hrefs an older CMS document or an older page may still carry. They are
   * redirected to `href` at render time so a stored banner cannot 404.
   */
  legacyHrefs: readonly string[];
}

export const STOREFRONT_SECTIONS: readonly [
  StorefrontSectionDefinition,
  StorefrontSectionDefinition,
  StorefrontSectionDefinition,
  StorefrontSectionDefinition,
] = [
  {
    key: 'inspections',
    href: '/services/inspections',
    navKey: 'nav.inspections',
    titleEn: 'Technical inspections',
    titleAr: 'الفحوصات الفنية',
    descriptionEn: 'Approved inspection services with a clear written report.',
    descriptionAr: 'خدمات فحص معتمدة مع تقرير مكتوب واضح.',
    art: '/media/hero-inspection.jpg',
    legacyHrefs: ['/booking', '/services/comprehensive_inspection'],
  },
  {
    key: 'maintenance',
    href: '/services/maintenance',
    navKey: 'nav.maintenance',
    titleEn: 'Maintenance services',
    titleAr: 'خدمات الصيانة',
    descriptionEn: 'Scheduled servicing, diagnostics and mechanical repair.',
    descriptionAr: 'صيانة دورية وتشخيص وإصلاح ميكانيكي.',
    art: '/media/hero-maintenance.jpg',
    legacyHrefs: [],
  },
  {
    key: 'products',
    href: '/products',
    navKey: 'nav.products',
    titleEn: 'Products',
    titleAr: 'المنتجات',
    descriptionEn: 'Published products available to order from the ORYX catalogue.',
    descriptionAr: 'منتجات منشورة ومتاحة للطلب من كتالوج ORYX.',
    art: '/media/parts-store.jpg',
    legacyHrefs: [],
  },
  {
    key: 'spare_parts',
    href: '/spare-parts',
    navKey: 'nav.spareParts',
    titleEn: 'Spare parts',
    titleAr: 'قطع الغيار',
    descriptionEn: 'Vehicle spare parts from ORYX stock with live price and availability.',
    descriptionAr: 'قطع غيار المركبات من مخزون ORYX بأسعار وتوافر مباشر.',
    art: '/media/hero-parts.jpg',
    legacyHrefs: ['/store', '/offers'],
  },
] as const;

export function storefrontSection(key: string): StorefrontSectionDefinition | undefined {
  return STOREFRONT_SECTIONS.find((section) => section.key === key);
}

/** The section a route belongs to, matched on the canonical href. */
export function storefrontSectionForHref(
  href: string | null | undefined,
): StorefrontSectionDefinition | undefined {
  if (!href) return undefined;
  const path = href.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  return STOREFRONT_SECTIONS.find((section) => section.href === path);
}

/**
 * Resolve a stored banner or page link to a route the site actually serves.
 *
 * The website document is editable, and an older document still carries links
 * such as `/booking`, `/store` or `/services/comprehensive_inspection` — routes
 * this site does not have, so a visitor clicking the banner saw a 404. Known
 * legacy targets are mapped onto the section that now owns that content. Any
 * other value is returned unchanged: an external URL or a valid route must
 * never be rewritten.
 */
export function normalizeStorefrontHref(href: string | null | undefined): string {
  if (!href) return '';
  const [rawPath, query = ''] = href.split('?');
  const path = rawPath.replace(/\/$/, '') || '/';

  const legacy = STOREFRONT_SECTIONS.find((section) => section.legacyHrefs.includes(path));
  if (legacy) return legacy.href;

  if (path === '/services' && query) {
    const category = new URLSearchParams(query).get('category');
    if (category === 'vehicle_inspection') return '/services/inspections';
    if (category === 'spare_parts') return '/spare-parts';
    if (category) return '/services/maintenance';
  }

  return href;
}

/**
 * Service-category keys that already own a storefront section of their own.
 *
 * The maintenance page shows every published service except these two: an
 * inspection is sold from the inspections section, and spare parts are a
 * product section, so listing either as a "maintenance service" would duplicate
 * a section and mix two taxonomies on one page.
 */
export const SECTION_OWNED_SERVICE_CATEGORY_KEYS: Readonly<Record<string, StorefrontSectionKey>> = {
  vehicle_inspection: 'inspections',
  spare_parts: 'spare_parts',
};

/** Whether a `ServiceCategory.key` belongs on the maintenance page. */
export function isMaintenanceServiceCategory(key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(SECTION_OWNED_SERVICE_CATEGORY_KEYS, key);
}

/**
 * The section that owns a `ServiceCategory.key`.
 *
 * Every published category belongs to exactly one of the four sections: an
 * inspection category to the inspections section, a spare-parts category to the
 * parts section, and every other service category to maintenance. A link from
 * the category index therefore lands on the section that actually lists it,
 * instead of a filter no section understands.
 */
export function storefrontSectionForCategoryKey(
  key: string,
): StorefrontSectionDefinition {
  const owned = Object.prototype.hasOwnProperty.call(SECTION_OWNED_SERVICE_CATEGORY_KEYS, key)
    ? SECTION_OWNED_SERVICE_CATEGORY_KEYS[key]
    : undefined;
  return storefrontSection(owned ?? 'maintenance') ?? STOREFRONT_SECTIONS[1];
}
