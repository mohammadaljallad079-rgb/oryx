/**
 * ORYX public storefront catalogue.
 *
 * The public website presents automotive services and spare-parts categories
 * that are declared once here and reused by the API, the web pages and the
 * filters, exactly as `INTEGRATION_PROVIDERS` is the single source for the
 * integrations centre. Nothing in this file invents prices or stock: it only
 * names the taxonomy that real database rows are filed under.
 */

export interface ServiceCategoryDefinition {
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  /// Image under `/media`, resolved by the web app.
  image: string;
  /** Default appointment length when no database service overrides it. */
  defaultDurationMinutes: number;
  /** `null` when the service is quoted rather than priced. */
  defaultPriceMinor: number | null;
  /** Human-readable turnaround shown on the card. */
  turnaroundEn: string;
  turnaroundAr: string;
}

/**
 * The ten services the owner listed, in order. Keys are stable and are what the
 * booking request stores as `serviceRef`.
 */
export const SERVICE_CATEGORIES: readonly ServiceCategoryDefinition[] = [
  {
    key: 'periodic_maintenance',
    nameEn: 'Scheduled car maintenance',
    nameAr: 'صيانة السيارات الدورية',
    descriptionEn:
      'Manufacturer-scheduled servicing that keeps your warranty valid and your vehicle reliable.',
    descriptionAr:
      'صيانة دورية وفق جدول الشركة المصنّعة تحافظ على الضمان وعلى اعتمادية سيارتك.',
    image: '/media/svc-periodic.jpg',
    defaultDurationMinutes: 90,
    defaultPriceMinor: null,
    turnaroundEn: 'Same day',
    turnaroundAr: 'في نفس اليوم',
  },
  {
    key: 'comprehensive_inspection',
    nameEn: 'Comprehensive vehicle inspection',
    nameAr: 'الفحص الشامل للسيارات',
    descriptionEn:
      'A full-point examination with a clear written report you can act on with confidence.',
    descriptionAr: 'فحص شامل بعدد نقاط متكامل مع تقرير مكتوب واضح يمكنك الاعتماد عليه.',
    image: '/media/svc-inspection.jpg',
    defaultDurationMinutes: 60,
    defaultPriceMinor: null,
    turnaroundEn: 'About an hour',
    turnaroundAr: 'حوالي ساعة',
  },
  {
    key: 'mechanical_repair',
    nameEn: 'Mechanical repair',
    nameAr: 'الإصلاح الميكانيكي',
    descriptionEn: 'Diagnosis and repair of steering, transmission, suspension and drivetrain faults.',
    descriptionAr: 'تشخيص وإصلاح أعطال التوجيه وناقل الحركة ونظام التعليق ومجموعة نقل القدرة.',
    image: '/media/svc-mechanical.jpg',
    defaultDurationMinutes: 120,
    defaultPriceMinor: null,
    turnaroundEn: 'Same day to two days',
    turnaroundAr: 'من يوم إلى يومين',
  },
  {
    key: 'engine_repair',
    nameEn: 'Engine repair and overhaul',
    nameAr: 'إصلاح المحركات',
    descriptionEn: 'Timing, cylinder head, cooling and full engine overhaul work by specialists.',
    descriptionAr: 'أعمال التوقيت ورأس الأسطوانات والتبريد وتوضيب المحرك بالكامل على يد مختصين.',
    image: '/media/svc-engine.jpg',
    defaultDurationMinutes: 180,
    defaultPriceMinor: null,
    turnaroundEn: 'By assessment',
    turnaroundAr: 'حسب التقييم',
  },
  {
    key: 'brake_service',
    nameEn: 'Brake services',
    nameAr: 'خدمات الفرامل',
    descriptionEn: 'Pads, discs, fluid and ABS diagnosis, tested before the car is released.',
    descriptionAr: 'الفحمات والأقراص والزيت وتشخيص نظام ABS، مع اختبار قبل تسليم السيارة.',
    image: '/media/svc-brakes.jpg',
    defaultDurationMinutes: 90,
    defaultPriceMinor: null,
    turnaroundEn: 'Same day',
    turnaroundAr: 'في نفس اليوم',
  },
  {
    key: 'tyre_service',
    nameEn: 'Tyre services',
    nameAr: 'خدمات الإطارات',
    descriptionEn: 'Fitting, balancing, puncture repair and wheel alignment with printed readings.',
    descriptionAr: 'تركيب وموازنة وإصلاح البناشر وضبط الاتجاه مع قياسات مطبوعة.',
    image: '/media/svc-tyres.jpg',
    defaultDurationMinutes: 60,
    defaultPriceMinor: null,
    turnaroundEn: 'Under an hour',
    turnaroundAr: 'أقل من ساعة',
  },
  {
    key: 'electrical_service',
    nameEn: 'Auto electrical services',
    nameAr: 'خدمات الكهرباء',
    descriptionEn: 'Batteries, alternators, starters, lighting and fault tracing on modern wiring.',
    descriptionAr: 'البطاريات والدينمو والسلف والإضاءة وتتبع الأعطال في أنظمة التمديدات الحديثة.',
    image: '/media/svc-electrical.jpg',
    defaultDurationMinutes: 90,
    defaultPriceMinor: null,
    turnaroundEn: 'Same day',
    turnaroundAr: 'في نفس اليوم',
  },
  {
    key: 'oil_and_filters',
    nameEn: 'Oil and filter change',
    nameAr: 'تغيير الزيوت والفلاتر',
    descriptionEn: 'Genuine-grade oil, oil filter and air filter change with a service stamp.',
    descriptionAr: 'تغيير الزيت وفلتر الزيت وفلتر الهواء بزيوت معتمدة مع ختم الصيانة.',
    image: '/media/svc-oil.jpg',
    defaultDurationMinutes: 45,
    defaultPriceMinor: null,
    turnaroundEn: 'Under an hour',
    turnaroundAr: 'أقل من ساعة',
  },
  {
    key: 'computer_diagnostics',
    nameEn: 'Computer diagnostics',
    nameAr: 'فحص الكمبيوتر',
    descriptionEn: 'OBD scan of every control module with the fault codes explained to you.',
    descriptionAr: 'قراءة أعطال جميع وحدات التحكم عبر OBD مع شرح رموز الأعطال لك.',
    image: '/media/svc-diagnostics.jpg',
    defaultDurationMinutes: 45,
    defaultPriceMinor: null,
    turnaroundEn: 'Under an hour',
    turnaroundAr: 'أقل من ساعة',
  },
  {
    key: 'specialist_care',
    nameEn: 'Specialist maintenance',
    nameAr: 'خدمات الصيانة المتخصصة',
    descriptionEn: 'Air conditioning, transmission, hybrid and performance work on approved equipment.',
    descriptionAr: 'التكييف وناقل الحركة والهجينة وأعمال الأداء باستخدام معدات معتمدة.',
    image: '/media/svc-specialized.jpg',
    defaultDurationMinutes: 120,
    defaultPriceMinor: null,
    turnaroundEn: 'By assessment',
    turnaroundAr: 'حسب التقييم',
  },
] as const;

export type ServiceCategoryKey = (typeof SERVICE_CATEGORIES)[number]['key'];

export function serviceCategory(key: string): ServiceCategoryDefinition | undefined {
  return SERVICE_CATEGORIES.find((c) => c.key === key);
}

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

/**
 * Vehicle makes the compatibility filter offers.
 *
 * This is the list the demo catalogue actually carries fitment rows for; the
 * API intersects it with the makes present in `PartCompatibility`, so a make
 * with no fitment never appears as a filter that returns nothing.
 */
export const VEHICLE_MAKES: readonly string[] = [
  'Toyota',
  'Nissan',
  'Honda',
  'Mitsubishi',
  'Hyundai',
  'Kia',
  'Ford',
  'Chevrolet',
  'Mercedes-Benz',
  'BMW',
  'Lexus',
  'Mazda',
] as const;

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
