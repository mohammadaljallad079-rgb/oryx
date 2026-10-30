/**
 * ORYX Marketplace demo data.
 *
 * This module is the *only* place that invents data. Every screen reads through
 * `repository.ts`, which returns these records, so replacing demo data with the
 * live API later is a change to one file rather than to sixty screens.
 *
 * The catalogue is generated from a seeded PRNG, so the same ids, prices and
 * ratings appear on every launch and in every screenshot. "Reset demo data" is
 * therefore a re-generation, not a wipe.
 *
 * Nothing here is real: no price is a quote and no report is a diagnosis. The UI
 * says so on every screen that could be mistaken for one.
 */

import { SERVICE_CATEGORIES } from '@oryx/shared';

/** Bahraini dinar, stored in minor units at scale 3 exactly as the ERP does. */
export const DEMO_CURRENCY = 'BHD';
export const DEMO_CURRENCY_SCALE = 3;

/**
 * A seeded 32-bit PRNG (mulberry32). Deterministic by design: a screenshot taken
 * today and one taken next week show the same shop, the same price and the same
 * rating, which is what makes the demo reviewable.
 */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRandom(20261025);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

export type CategoryKey = (typeof SERVICE_CATEGORIES)[number]['key'];

/** Bundled photography, keyed the way the customer website keys it. */
export type PhotoKey =
  | 'autoService'
  | 'inspectionBay'
  | 'mechanicEngine'
  | 'partsStore'
  | 'recoveryTow'
  | 'carwashPremium'
  | 'garageInterior'
  /** The splash hero: the garage photograph graded to the reference's golden hour. */
  | 'goldenHourHero'
  /** The approved hero scene, extracted from the owner's splash mockup. */
  | 'heroApproved'
  /** The approved splash scene, extracted from the owner's mockup. */
  | 'splashScene'
  | 'garageBrastad'
  | 'workshopArtdeco'
  | 'evCharging';

/** Photograph for a service category, matching what the picture actually shows. */
export const CATEGORY_PHOTO: Record<string, PhotoKey> = {
  vehicle_inspection: 'inspectionBay',
  maintenance: 'mechanicEngine',
  spare_parts: 'partsStore',
  recovery: 'recoveryTow',
  car_wash: 'carwashPremium',
};

export interface DemoCity {
  key: string;
  nameEn: string;
  nameAr: string;
}

export const DEMO_CITIES: DemoCity[] = [
  { key: 'manama', nameEn: 'Manama', nameAr: 'المنامة' },
  { key: 'riffa', nameEn: 'Riffa', nameAr: 'الرفاع' },
  { key: 'muharraq', nameEn: 'Muharraq', nameAr: 'المحرق' },
  { key: 'isa', nameEn: 'Isa Town', nameAr: 'مدينة عيسى' },
  { key: 'hamad', nameEn: 'Hamad Town', nameAr: 'مدينة حمد' },
  { key: 'sitrah', nameEn: 'Sitrah', nameAr: 'سترة' },
];

export interface DemoStore {
  id: string;
  nameEn: string;
  nameAr: string;
  cityKey: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  photo: PhotoKey;
  /** Delivery fee in minor units; 0 means free delivery. */
  deliveryMinor: number;
  /** Minimum order in minor units. */
  minimumOrderMinor: number;
  since: number;
  tags: string[];
}

export interface DemoProduct {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  storeId: string;
  categoryKey: CategoryKey;
  /** Free-text part group, used by the marketplace filters. */
  groupEn: string;
  groupAr: string;
  brand: string;
  priceMinor: number;
  /** Set when discounted; the UI strikes through `priceMinor`. */
  compareAtMinor: number | null;
  rating: number;
  reviewCount: number;
  stock: number;
  photo: PhotoKey;
  /**
   * A real product photograph from the API's media library, when one exists.
   *
   * `photo` is the bundled fallback art; when `imageUrl` is set the card renders
   * the uploaded image instead. Kept separate so a record with no photograph is
   * visibly using placeholder art rather than silently substituting it.
   */
  imageUrl?: string | null;
  /** Car makes this part is listed to fit. */
  fits: string[];
  warrantyMonths: number;
}

export interface DemoService {
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  durationMinutes: number;
}

export type ProviderKind = 'inspection' | 'maintenance' | 'recovery';

export interface DemoProvider {
  id: string;
  kind: ProviderKind;
  categoryKey: CategoryKey;
  nameEn: string;
  nameAr: string;
  cityKey: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  photo: PhotoKey;
  /** Straight-line distance used by the "nearby" sort. */
  distanceKm: number;
  services: DemoService[];
  opensAt: string;
  closesAt: string;
  closedOn: string[];
  aboutEn: string;
  aboutAr: string;
  phone: string;
}

export interface DemoVehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  vin: string;
  colourEn: string;
  colourAr: string;
  mileageKm: number;
  photo: PhotoKey;
}

export interface DemoOrderItem {
  productId: string;
  quantity: number;
  unitPriceMinor: number;
}

export type OrderStatus = 'PENDING' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface DemoOrder {
  id: string;
  reference: string;
  customerId: string;
  storeId: string;
  items: DemoOrderItem[];
  subtotalMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  status: OrderStatus;
  placedAt: string;
  /** Estimated delivery, shown on the tracking screen. */
  etaAt: string;
  addressEn: string;
  addressAr: string;
  paymentMethod: string;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface DemoBooking {
  id: string;
  reference: string;
  customerId: string;
  providerId: string;
  vehicleId: string;
  serviceNameEn: string;
  serviceNameAr: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`. */
  time: string;
  durationMinutes: number;
  totalMinor: number;
  status: BookingStatus;
  notesEn: string;
  notesAr: string;
  createdAt: string;
}

export type RecoveryStatus =
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface DemoRecoveryJob {
  id: string;
  reference: string;
  customerId: string;
  providerId: string;
  vehicleId: string;
  issueKey: string;
  pickupEn: string;
  pickupAr: string;
  dropoffEn: string;
  dropoffAr: string;
  /** Pickup/dropoff on the demo grid, 0..100. */
  pickupPoint: { x: number; y: number };
  dropoffPoint: { x: number; y: number };
  quotedPriceMinor: number;
  status: RecoveryStatus;
  requestedAt: string;
  driverNameEn: string;
  driverNameAr: string;
  driverPhone: string;
  truckPlate: string;
  truckTypeEn: string;
  truckTypeAr: string;
  /** Minutes until the truck arrives, driven by the demo simulation. */
  etaMinutes: number;
  ratingGiven: number | null;
}

export interface DemoFinding {
  severity: 'low' | 'medium' | 'high';
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  confidence: number;
  /** Indicative repair cost in minor units. */
  costMinor: number;
}

export interface DemoSensageReport {
  id: string;
  reference: string;
  customerId: string;
  vehicleId: string;
  createdAt: string;
  /** 0-100 condition score. */
  score: number;
  /** How many photos the customer submitted. */
  photoCount: number;
  findings: DemoFinding[];
  recommendationsEn: string[];
  recommendationsAr: string[];
}

export interface DemoPlan {
  id: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  periodEn: string;
  periodAr: string;
  /** Commission taken on marketplace sales, in basis points. */
  commissionBps: number;
  featuresEn: string[];
  featuresAr: string[];
  /** ERP tool keys unlocked by this plan. */
  erpModules: string[];
  highlighted: boolean;
}

export interface DemoReview {
  id: string;
  /** A provider, store or product id. */
  subjectId: string;
  subjectKind: 'provider' | 'store' | 'product';
  authorEn: string;
  authorAr: string;
  rating: number;
  createdAt: string;
  bodyEn: string;
  bodyAr: string;
}

export interface DemoNotification {
  id: string;
  audience: 'customer' | 'merchant';
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  createdAt: string;
  read: boolean;
  kind: 'order' | 'booking' | 'recovery' | 'sensage' | 'system' | 'wallet';
}

export interface DemoOffer {
  id: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  percentOff: number;
  storeId: string | null;
  categoryKey: CategoryKey | null;
  photo: PhotoKey;
  expiresAt: string;
  code: string;
}

export interface DemoBanner {
  id: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  ctaEn: string;
  ctaAr: string;
  /** Route the CTA opens. */
  href: string;
  photo: PhotoKey;
}

export interface DemoWalletEntry {
  id: string;
  accountId: string;
  titleEn: string;
  titleAr: string;
  amountMinor: number;
  createdAt: string;
  kind: 'topup' | 'purchase' | 'refund' | 'payout';
}

export interface DemoAddress {
  id: string;
  customerId: string;
  labelEn: string;
  labelAr: string;
  lineEn: string;
  lineAr: string;
  isDefault: boolean;
}

/** ERP tool keys a merchant plan may unlock, with bilingual labels. */
export interface ErpTool {
  key: string;
  en: string;
  ar: string;
}

/* ------------------------------------------------------------------ stores */

const STORE_SEEDS: Array<{
  nameEn: string;
  nameAr: string;
  cityKey: string;
  photo: PhotoKey;
  tags: string[];
}> = [
  { nameEn: 'Al Noor Auto Parts', nameAr: 'النور لقطع غيار السيارات', cityKey: 'manama', photo: 'partsStore', tags: ['OEM', 'Fast delivery'] },
  { nameEn: 'Gulf Spare Parts Centre', nameAr: 'مركز الخليج لقطع الغيار', cityKey: 'riffa', photo: 'partsStore', tags: ['Aftermarket', 'Budget'] },
  { nameEn: 'Bahrain Motor Supplies', nameAr: 'البحرين لمستلزمات السيارات', cityKey: 'muharraq', photo: 'garageInterior', tags: ['Wholesale', 'Bulk'] },
  { nameEn: 'Desert Line Tyres', nameAr: 'ديزرت لاين للإطارات', cityKey: 'isa', photo: 'autoService', tags: ['Tyres', 'Fitting'] },
  { nameEn: 'Prime Auto Electrical', nameAr: 'برايم للكهرباء', cityKey: 'hamad', photo: 'mechanicEngine', tags: ['Electrical', 'Batteries'] },
  { nameEn: 'Sitra Parts Hub', nameAr: 'سترة لقطع الغيار', cityKey: 'sitrah', photo: 'partsStore', tags: ['Japanese', 'Korean'] },
  { nameEn: 'Royal German Parts', nameAr: 'رويال للقطع الألمانية', cityKey: 'manama', photo: 'garageBrastad', tags: ['German', 'OEM'] },
  { nameEn: 'Speed Zone Accessories', nameAr: 'سبيد زون للإكسسوارات', cityKey: 'riffa', photo: 'workshopArtdeco', tags: ['Accessories', 'Styling'] },
  { nameEn: 'Coastal Oils and Fluids', nameAr: 'الساحل للزيوت', cityKey: 'muharraq', photo: 'mechanicEngine', tags: ['Oils', 'Fluids'] },
  { nameEn: 'Precision Bearings', nameAr: 'الدقة للمحامل', cityKey: 'isa', photo: 'garageInterior', tags: ['Bearings', 'Suspension'] },
  { nameEn: 'Al Manar Batteries', nameAr: 'المنار للبطاريات', cityKey: 'hamad', photo: 'evCharging', tags: ['Batteries', 'EV'] },
  { nameEn: 'Titan 4x4 Outfitters', nameAr: 'تايتن لتجهيز الدفع الرباعي', cityKey: 'sitrah', photo: 'workshopArtdeco', tags: ['4x4', 'Off-road'] },
  { nameEn: 'Nasser Cooling Systems', nameAr: 'ناصر لأنظمة التبريد', cityKey: 'manama', photo: 'mechanicEngine', tags: ['Cooling', 'AC'] },
  { nameEn: 'Elite Body Panels', nameAr: 'إيليت لهياكل السيارات', cityKey: 'riffa', photo: 'garageBrastad', tags: ['Body', 'Panels'] },
  { nameEn: 'Falcon Performance', nameAr: 'فالكون للأداء', cityKey: 'muharraq', photo: 'workshopArtdeco', tags: ['Performance', 'Tuning'] },
];

export const DEMO_STORES: DemoStore[] = STORE_SEEDS.map((seed, index) => ({
  id: `store-${String(index + 1).padStart(2, '0')}`,
  nameEn: seed.nameEn,
  nameAr: seed.nameAr,
  cityKey: seed.cityKey,
  rating: Number((3.9 + rand() * 1.1).toFixed(1)),
  reviewCount: between(38, 940),
  verified: index % 5 !== 3,
  photo: seed.photo,
  deliveryMinor: index % 3 === 0 ? 0 : between(500, 2500),
  minimumOrderMinor: pick([0, 5000, 10000, 15000]),
  since: between(2004, 2023),
  tags: seed.tags,
}));

/* ---------------------------------------------------------------- products */

/** Real part groups with a plausible Bahraini price band in minor units. */
const PART_GROUPS: Array<{
  groupEn: string;
  groupAr: string;
  names: Array<{ en: string; ar: string }>;
  minMinor: number;
  maxMinor: number;
  categoryKey: CategoryKey;
  photo: PhotoKey;
}> = [
  {
    groupEn: 'Brakes',
    groupAr: 'الفرامل',
    categoryKey: 'spare_parts',
    photo: 'mechanicEngine',
    minMinor: 4_500,
    maxMinor: 42_000,
    names: [
      { en: 'Front Brake Pad Set', ar: 'طقم فحمات فرامل أمامية' },
      { en: 'Rear Brake Disc Pair', ar: 'زوج أقراص فرامل خلفية' },
      { en: 'Brake Caliper Assembly', ar: 'كاليبر فرامل' },
      { en: 'Brake Fluid DOT 4 (1L)', ar: 'زيت فرامل DOT 4 (١ لتر)' },
    ],
  },
  {
    groupEn: 'Filters',
    groupAr: 'الفلاتر',
    categoryKey: 'spare_parts',
    photo: 'partsStore',
    minMinor: 900,
    maxMinor: 9_500,
    names: [
      { en: 'Engine Oil Filter', ar: 'فلتر زيت المحرك' },
      { en: 'Air Filter Element', ar: 'فلتر الهواء' },
      { en: 'Cabin Pollen Filter', ar: 'فلتر المكيف' },
      { en: 'Fuel Filter Cartridge', ar: 'فلتر الوقود' },
    ],
  },
  {
    groupEn: 'Engine',
    groupAr: 'المحرك',
    categoryKey: 'spare_parts',
    photo: 'mechanicEngine',
    minMinor: 3_200,
    maxMinor: 185_000,
    names: [
      { en: 'Timing Belt Kit', ar: 'طقم سير التوقيت' },
      { en: 'Water Pump', ar: 'مضخة الماء' },
      { en: 'Ignition Coil Pack', ar: 'طقم بوبينات الإشعال' },
      { en: 'Spark Plug Set (4)', ar: 'طقم شمعات إشعال (٤)' },
    ],
  },
  {
    groupEn: 'Suspension',
    groupAr: 'التعليق',
    categoryKey: 'spare_parts',
    photo: 'garageInterior',
    minMinor: 6_800,
    maxMinor: 96_000,
    names: [
      { en: 'Front Shock Absorber Pair', ar: 'زوج مساعدين أمامي' },
      { en: 'Lower Control Arm', ar: 'ذراع تعليق سفلي' },
      { en: 'Stabiliser Link Kit', ar: 'طقم وصلات الموازن' },
      { en: 'Wheel Bearing Hub', ar: 'محمل العجلة' },
    ],
  },
  {
    groupEn: 'Electrical',
    groupAr: 'الكهرباء',
    categoryKey: 'spare_parts',
    photo: 'evCharging',
    minMinor: 1_800,
    maxMinor: 78_000,
    names: [
      { en: 'AGM Battery 70Ah', ar: 'بطارية AGM ٧٠ أمبير' },
      { en: 'Alternator 120A', ar: 'دينمو ١٢٠ أمبير' },
      { en: 'Starter Motor', ar: 'سلف' },
      { en: 'LED Headlight Bulb Pair', ar: 'زوج لمبات LED' },
    ],
  },
  {
    groupEn: 'Tyres and Wheels',
    groupAr: 'الإطارات والجنوط',
    categoryKey: 'spare_parts',
    photo: 'autoService',
    minMinor: 12_000,
    maxMinor: 210_000,
    names: [
      { en: 'Tyre 225/45 R17', ar: 'إطار ٢٢٥/٤٥ R17' },
      { en: 'Tyre 265/65 R17 All-Terrain', ar: 'إطار ٢٦٥/٦٥ R17 لجميع التضاريس' },
      { en: 'Alloy Wheel 18 inch', ar: 'جنط ألمنيوم ١٨ بوصة' },
      { en: 'Tyre Pressure Sensor', ar: 'حساس ضغط الإطارات' },
    ],
  },
  {
    groupEn: 'Body and Glass',
    groupAr: 'الهيكل والزجاج',
    categoryKey: 'spare_parts',
    photo: 'garageBrastad',
    minMinor: 2_400,
    maxMinor: 145_000,
    names: [
      { en: 'Windscreen Wiper Blade Pair', ar: 'زوج مساحات الزجاج' },
      { en: 'Side Mirror Assembly', ar: 'مرآة جانبية' },
      { en: 'Front Bumper Cover', ar: 'غطاء المصد الأمامي' },
      { en: 'Windscreen Glass', ar: 'زجاج أمامي' },
    ],
  },
  {
    groupEn: 'Oils and Fluids',
    groupAr: 'الزيوت والسوائل',
    categoryKey: 'spare_parts',
    photo: 'mechanicEngine',
    minMinor: 1_200,
    maxMinor: 14_000,
    names: [
      { en: 'Fully Synthetic 5W-30 (5L)', ar: 'زيت صناعي 5W-30 (٥ لتر)' },
      { en: 'Coolant Concentrate (4L)', ar: 'سائل تبريد مركز (٤ لتر)' },
      { en: 'Automatic Gearbox Fluid (4L)', ar: 'زيت جير أوتوماتيك (٤ لتر)' },
      { en: 'Screen Wash Concentrate (1L)', ar: 'سائل مساحات مركز (١ لتر)' },
    ],
  },
  {
    groupEn: 'Car care',
    groupAr: 'العناية بالسيارة',
    categoryKey: 'car_wash',
    photo: 'carwashPremium',
    minMinor: 800,
    maxMinor: 22_000,
    names: [
      { en: 'Ceramic Coating Kit', ar: 'طقم طلاء سيراميك' },
      { en: 'Interior Detailing Kit', ar: 'طقم تنظيف داخلي' },
      { en: 'Microfibre Cloth Set (10)', ar: 'طقم قماش مايكروفايبر (١٠)' },
      { en: 'Tyre Shine Gel', ar: 'جل تلميع الإطارات' },
    ],
  },
  {
    groupEn: 'Recovery gear',
    groupAr: 'أدوات الطريق',
    categoryKey: 'recovery',
    photo: 'recoveryTow',
    minMinor: 1_500,
    maxMinor: 38_000,
    names: [
      { en: 'Tow Strap 8T', ar: 'حزام سحب ٨ طن' },
      { en: 'Jumper Cable Set', ar: 'طقم كوابل بطارية' },
      { en: 'Tyre Repair Kit', ar: 'طقم إصلاح إطار' },
      { en: 'Portable Jump Starter', ar: 'جهاز تشغيل محمول' },
    ],
  },
];

const BRANDS = ['Bosch', 'Denso', 'Mann', 'NGK', 'Valeo', 'Febi', 'SKF', 'Continental', 'Sachs', 'TRW'];
const CAR_MAKES = ['Toyota', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Mitsubishi', 'Lexus', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Land Rover'];

/** How many products each store carries; the sum is 56, above the 50 required. */
const PRODUCTS_PER_STORE = [5, 4, 4, 4, 4, 4, 4, 3, 3, 4, 3, 3, 4, 3, 4];

function buildProducts(): DemoProduct[] {
  const products: DemoProduct[] = [];
  let counter = 0;
  DEMO_STORES.forEach((store, storeIndex) => {
    const count = PRODUCTS_PER_STORE[storeIndex] ?? 3;
    for (let i = 0; i < count; i += 1) {
      const group = PART_GROUPS[(storeIndex + i) % PART_GROUPS.length] as (typeof PART_GROUPS)[number];
      const name = group.names[(storeIndex + i * 3) % group.names.length] as { en: string; ar: string };
      counter += 1;
      const price = between(group.minMinor, group.maxMinor);
      const discounted = rand() < 0.3;
      const fits: string[] = [];
      const fitsCount = between(2, 4);
      while (fits.length < fitsCount) {
        const make = pick(CAR_MAKES);
        if (!fits.includes(make)) fits.push(make);
      }
      products.push({
        id: `prod-${String(counter).padStart(3, '0')}`,
        sku: `ORYX-${group.groupEn.slice(0, 3).toUpperCase()}-${1000 + counter}`,
        nameEn: name.en,
        nameAr: name.ar,
        storeId: store.id,
        categoryKey: group.categoryKey,
        groupEn: group.groupEn,
        groupAr: group.groupAr,
        brand: pick(BRANDS),
        priceMinor: discounted ? Math.round((price * 0.78) / 100) * 100 : price,
        compareAtMinor: discounted ? price : null,
        rating: Number((3.7 + rand() * 1.3).toFixed(1)),
        reviewCount: between(4, 320),
        stock: between(0, 60),
        photo: group.photo,
        fits,
        warrantyMonths: pick([0, 6, 12, 24]),
      });
    }
  });
  return products;
}

export const DEMO_PRODUCTS: DemoProduct[] = buildProducts();

/** Product groups present in the catalogue, for the filter sheet. */
export const DEMO_PRODUCT_GROUPS = PART_GROUPS.map((g) => ({ en: g.groupEn, ar: g.groupAr }));

/** Car makes the catalogue covers, for the vehicle-fit filter. */
export const DEMO_CAR_MAKES = CAR_MAKES;
