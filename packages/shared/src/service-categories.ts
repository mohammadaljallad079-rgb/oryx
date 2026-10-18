/**
 * The service category catalogue.
 *
 * One list feeds four consumers that used to disagree: the `ServiceCategory`
 * rows the seed writes (which the CMS attaches photography and copy to), the
 * `categoryKey` a marketplace provider and its listings carry, the customer
 * website's category chips, and the mobile app's service picker. When those
 * drifted apart a category chip filtered the provider directory by a key no
 * provider had, so it returned nothing — the exact failure this list prevents.
 *
 * The `key` values are the persisted `ServiceCategory.key` values. They are the
 * contract; do not rename one without migrating the rows that reference it.
 */

export interface ServiceCategoryDefinition {
  /** Persisted identifier, shared by the CMS row, the provider and the clients. */
  key: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  /** Business domain, mirroring `ServiceCategory.domain`. */
  domain: 'automotive' | 'marketplace';
  sortOrder: number;
  /** Bundled fallback artwork; the CMS photograph overrides it when present. */
  art: string;
}

/**
 * The catalogue is declared as a non-empty tuple so `SERVICE_CATEGORIES[0]` is
 * typed as present, which the client pickers rely on for their initial value.
 */
export const SERVICE_CATEGORIES: readonly [
  ServiceCategoryDefinition,
  ...ServiceCategoryDefinition[],
] = [
  {
    key: 'vehicle_inspection',
    nameEn: 'Vehicle inspection',
    nameAr: 'فحص المركبات',
    descEn: 'Periodic and pre-purchase inspection with a written report.',
    descAr: 'فحص دوري وفحص ما قبل الشراء مع تقرير مكتوب.',
    domain: 'automotive',
    sortOrder: 1,
    art: '/art/service-inspection.svg',
  },
  {
    key: 'maintenance',
    nameEn: 'Maintenance and repair',
    nameAr: 'الصيانة والإصلاح',
    descEn: 'Scheduled servicing, diagnostics and mechanical repair.',
    descAr: 'صيانة دورية وتشخيص وإصلاح ميكانيكي.',
    domain: 'automotive',
    sortOrder: 2,
    art: '/art/service-maintenance.svg',
  },
  {
    key: 'spare_parts',
    nameEn: 'Spare parts',
    nameAr: 'قطع الغيار',
    descEn: 'Genuine and aftermarket parts fitted by approved workshops.',
    descAr: 'قطع غيار أصلية وبديلة تُركَّب في ورش معتمدة.',
    domain: 'marketplace',
    sortOrder: 3,
    art: '/art/service-tyres.svg',
  },
  {
    key: 'recovery',
    nameEn: 'Roadside recovery',
    nameAr: 'خدمات الطريق',
    descEn: 'Towing and roadside assistance when the car will not move.',
    descAr: 'سحب السيارة وخدمات المساعدة على الطريق.',
    domain: 'automotive',
    sortOrder: 4,
    art: '/art/service-recovery.svg',
  },
  {
    key: 'car_wash',
    nameEn: 'Car wash and detailing',
    nameAr: 'غسيل وتلميع السيارات',
    descEn: 'Exterior wash, interior detailing and paint protection.',
    descAr: 'غسيل خارجي وتنظيف داخلي وحماية الطلاء.',
    domain: 'marketplace',
    sortOrder: 5,
    art: '/art/service-bodywork.svg',
  },
] as const;

export type ServiceCategoryKey = (typeof SERVICE_CATEGORIES)[number]['key'];

/** The canonical keys, for validating an incoming `categoryKey`. */
export const SERVICE_CATEGORY_KEYS: readonly string[] = SERVICE_CATEGORIES.map((c) => c.key);

export function isServiceCategoryKey(value: string): value is ServiceCategoryKey {
  return SERVICE_CATEGORY_KEYS.includes(value);
}

export function serviceCategory(key: string): ServiceCategoryDefinition | undefined {
  return SERVICE_CATEGORIES.find((c) => c.key === key);
}

/** Artwork for a category, falling back to the generic hero motif. */
export function categoryArt(key: string): string {
  return serviceCategory(key)?.art ?? '/art/hero-automotive.svg';
}
