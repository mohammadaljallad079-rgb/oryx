/**
 * ORYX public storefront catalogue — the spare-parts taxonomy and the product
 * filters the public web store exposes.
 *
 * The service taxonomy lives in `service-categories.ts` and the vehicle makes
 * in `vehicle-catalog.ts`; both are seeded to the database and shared with the
 * admin and mobile clients, so they are declared once there and not repeated
 * here. Nothing in this file invents prices or stock: it only names the
 * taxonomy that real database rows are filed under.
 */


export interface PartCategoryDefinition {
  key: string;
  nameEn: string;
  nameAr: string;
  image: string;
}

/** The spare-parts aisles, in the order the owner listed them. */
export const PART_CATEGORIES: readonly PartCategoryDefinition[] = [
  { key: 'engine', nameEn: 'Engine parts', nameAr: 'قطع المحرك', image: '/media/cat-engine.jpg' },
  { key: 'filters', nameEn: 'Filters', nameAr: 'الفلاتر', image: '/media/cat-filters.jpg' },
  { key: 'oil', nameEn: 'Oil and lubricants', nameAr: 'الزيوت والشحوم', image: '/media/cat-oil.jpg' },
  { key: 'brakes', nameEn: 'Brake systems', nameAr: 'أنظمة الفرامل', image: '/media/cat-brakes.jpg' },
  { key: 'tyres', nameEn: 'Tyres', nameAr: 'الإطارات', image: '/media/cat-tyres.jpg' },
  { key: 'batteries', nameEn: 'Batteries', nameAr: 'البطاريات', image: '/media/cat-batteries.jpg' },
  {
    key: 'electrical',
    nameEn: 'Electrical components',
    nameAr: 'القطع الكهربائية',
    image: '/media/cat-electrical.jpg',
  },
  { key: 'suspension', nameEn: 'Suspension', nameAr: 'نظام التعليق', image: '/media/cat-suspension.jpg' },
  { key: 'cooling', nameEn: 'Cooling systems', nameAr: 'أنظمة التبريد', image: '/media/cat-cooling.jpg' },
  { key: 'accessories', nameEn: 'Accessories', nameAr: 'الكماليات', image: '/media/cat-accessories.jpg' },
  { key: 'other', nameEn: 'Other spare parts', nameAr: 'قطع غيار أخرى', image: '/media/cat-other.jpg' },
] as const;

export type PartCategoryKey = (typeof PART_CATEGORIES)[number]['key'];

export function partCategory(key: string): PartCategoryDefinition | undefined {
  return PART_CATEGORIES.find((c) => c.key === key);
}
/** Fuel/engine families the catalogue can record against a product. */
export const ENGINE_TYPES: readonly { key: string; nameEn: string; nameAr: string }[] = [
  { key: 'petrol', nameEn: 'Petrol', nameAr: 'بنزين' },
  { key: 'diesel', nameEn: 'Diesel', nameAr: 'ديزل' },
  { key: 'hybrid', nameEn: 'Hybrid', nameAr: 'هجين' },
  { key: 'electric', nameEn: 'Electric', nameAr: 'كهربائي' },
] as const;

export type EngineTypeKey = (typeof ENGINE_TYPES)[number]['key'];

export function engineTypeLabel(key: string, locale: 'ar' | 'en'): string {
  const found = ENGINE_TYPES.find((e) => e.key === key);
  if (!found) return key;
  return locale === 'ar' ? found.nameAr : found.nameEn;
}

/** Newest model year the storefront filter offers; the list is derived from data. */
export const CATALOGUE_YEARS_FROM = 1995;

export const AVAILABILITY_FILTERS: readonly {
  key: 'in_stock' | 'out_of_stock';
  nameEn: string;
  nameAr: string;
}[] = [
  { key: 'in_stock', nameEn: 'In stock', nameAr: 'متوفر' },
  { key: 'out_of_stock', nameEn: 'Out of stock', nameAr: 'غير متوفر' },
] as const;

export const CONDITION_FILTERS: readonly {
  key: 'NEW' | 'REFURBISHED';
  nameEn: string;
  nameAr: string;
}[] = [
  { key: 'NEW', nameEn: 'New', nameAr: 'جديد' },
  { key: 'REFURBISHED', nameEn: 'Refurbished', nameAr: 'مُجدّد' },
] as const;

export const PRODUCT_SORTS: readonly {
  key: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'name_asc';
  nameEn: string;
  nameAr: string;
}[] = [
  { key: 'relevance', nameEn: 'Relevance', nameAr: 'الأكثر ملاءمة' },
  { key: 'price_asc', nameEn: 'Price: low to high', nameAr: 'السعر: من الأقل إلى الأعلى' },
  { key: 'price_desc', nameEn: 'Price: high to low', nameAr: 'السعر: من الأعلى إلى الأقل' },
  { key: 'newest', nameEn: 'Newest', nameAr: 'الأحدث' },
  { key: 'name_asc', nameEn: 'Name', nameAr: 'الاسم' },
] as const;

export type ProductSortKey = (typeof PRODUCT_SORTS)[number]['key'];
