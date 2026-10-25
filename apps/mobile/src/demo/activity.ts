/**
 * Demo accounts, vehicles and the customer's activity: orders, bookings,
 * recovery jobs, SENSAGE reports, reviews, notifications, wallet and addresses.
 *
 * The activity is generated from fixed seeds so the numbers agree across
 * screens: an order shown on the dashboard is the same order the tracking screen
 * opens, with the same total. Two demo accounts exist — a customer and a
 * merchant — and both are reachable from the sign-in screen in one tap.
 */

import {
  DEMO_CURRENCY,
  DEMO_CITIES,
  DEMO_PRODUCTS,
  DEMO_STORES,
  type BookingStatus,
  type CategoryKey,
  type DemoAddress,
  type DemoBooking,
  type DemoFinding,
  type DemoNotification,
  type DemoOrder,
  type DemoOrderItem,
  type DemoRecoveryJob,
  type DemoSensageReport,
  type DemoVehicle,
  type DemoWalletEntry,
  type OrderStatus,
  type PhotoKey,
  type RecoveryStatus,
} from './catalogue';
import { DEMO_DRIVERS, DEMO_FLEET, DEMO_PROVIDERS, RECOVERY_ISSUES } from './providers';

export { DEMO_CURRENCY };

/** Re-exported so a screen or a test can import every demo record from one place. */
export { DEMO_PRODUCTS, DEMO_STORES } from './catalogue';
export { DEMO_PROVIDERS } from './providers';

/** Re-exported so a screen can import a record type from one place. */
export type {
  DemoAddress,
  DemoBooking,
  DemoNotification,
  DemoOrder,
  DemoRecoveryJob,
  DemoSensageReport,
  DemoVehicle,
  DemoWalletEntry,
};
export type { DemoProvider, DemoService } from './catalogue';

/** A fixed "today" so relative dates in the demo never drift. */
export const DEMO_TODAY = new Date(2026, 9, 25, 10, 0, 0);

function isoDaysFromToday(days: number, hour = 10): string {
  const d = new Date(DEMO_TODAY);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Deterministic band helper, independent of the catalogue generator. */
function band(seed: number, index: number, min: number, max: number): number {
  const mixed = Math.imul(seed + index * 40503, 2654435761) >>> 0;
  const unit = ((mixed ^ (mixed >>> 15)) >>> 0) / 4294967296;
  return Math.floor(unit * (max - min + 1)) + min;
}

/* ---------------------------------------------------------------- accounts */

export interface DemoAccount {
  id: string;
  role: 'customer' | 'merchant';
  email: string;
  password: string;
  fullNameEn: string;
  fullNameAr: string;
  phone: string;
  /** Set for a merchant account: the store it owns. */
  storeId: string | null;
  planId: string | null;
  walletMinor: number;
  joinedAt: string;
  avatarInitials: string;
}

export const DEMO_CUSTOMER_ID = 'cust-01';
export const DEMO_MERCHANT_ID = 'merch-01';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: DEMO_CUSTOMER_ID,
    role: 'customer',
    email: 'customer@oryx.demo',
    password: 'demo1234',
    fullNameEn: 'Ahmed Al Mannai',
    fullNameAr: 'أحمد المناعي',
    phone: '+973 3612 4477',
    storeId: null,
    planId: null,
    walletMinor: 47_500,
    joinedAt: '2024-03-11',
    avatarInitials: 'AM',
  },
  {
    id: DEMO_MERCHANT_ID,
    role: 'merchant',
    email: 'merchant@oryx.demo',
    password: 'demo1234',
    fullNameEn: 'Yousef Al Noor',
    fullNameAr: 'يوسف النور',
    phone: '+973 3944 1188',
    storeId: 'store-01',
    planId: 'growth',
    walletMinor: 1_284_000,
    joinedAt: '2022-06-02',
    avatarInitials: 'YN',
  },
];

export function demoAccountByEmail(email: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
}

/* ---------------------------------------------------------------- vehicles */

export const DEMO_VEHICLES: DemoVehicle[] = [
  {
    id: 'veh-01',
    ownerId: DEMO_CUSTOMER_ID,
    make: 'Toyota',
    model: 'Land Cruiser Prado',
    year: 2021,
    plate: '1234 ABC',
    vin: 'JTEBD9FJ0MK012345',
    colourEn: 'Pearl white',
    colourAr: 'أبيض لؤلؤي',
    mileageKm: 78_420,
    photo: 'garageBrastad',
  },
  {
    id: 'veh-02',
    ownerId: DEMO_CUSTOMER_ID,
    make: 'Nissan',
    model: 'Patrol',
    year: 2019,
    plate: '8877 XYZ',
    vin: 'JN1TBNY62U0004321',
    colourEn: 'Desert beige',
    colourAr: 'بيج صحراوي',
    mileageKm: 132_900,
    photo: 'garageInterior',
  },
  {
    id: 'veh-03',
    ownerId: DEMO_CUSTOMER_ID,
    make: 'Hyundai',
    model: 'Tucson',
    year: 2023,
    plate: '5541 KHM',
    vin: 'KMHJ3815GNU120987',
    colourEn: 'Graphite grey',
    colourAr: 'رمادي جرافيت',
    mileageKm: 24_310,
    photo: 'autoService',
  },
];

export function demoVehicle(id: string): DemoVehicle | undefined {
  return DEMO_VEHICLES.find((v) => v.id === id);
}

export function demoStore(id: string) {
  return DEMO_STORES.find((s) => s.id === id);
}

export function demoProduct(id: string) {
  return DEMO_PRODUCTS.find((p) => p.id === id);
}

export function demoProvider(id: string) {
  return DEMO_PROVIDERS.find((p) => p.id === id);
}

export function demoCityLabel(cityKey: string, locale: 'ar' | 'en'): string {
  const city = DEMO_CITIES.find((c) => c.key === cityKey);
  if (!city) return cityKey;
  return locale === 'ar' ? city.nameAr : city.nameEn;
}

/* ------------------------------------------------------------------ orders */

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'DELIVERED',
  'CANCELLED',
];

const PAYMENT_METHODS = ['BenefitPay', 'Card', 'Cash on delivery'];

function buildOrders(): DemoOrder[] {
  const orders: DemoOrder[] = [];
  for (let i = 0; i < 20; i += 1) {
    const store = DEMO_STORES[i % DEMO_STORES.length]!;
    const storeProducts = DEMO_PRODUCTS.filter((p) => p.storeId === store.id);
    const itemCount = band(11, i, 1, 3);
    const items: DemoOrderItem[] = [];
    for (let j = 0; j < itemCount; j += 1) {
      const product = storeProducts[(i + j) % storeProducts.length]!;
      items.push({
        productId: product.id,
        quantity: band(23, i * 7 + j, 1, 3),
        unitPriceMinor: product.priceMinor,
      });
    }
    const subtotalMinor = items.reduce((sum, it) => sum + it.unitPriceMinor * it.quantity, 0);
    const daysAgo = 20 - i;
    orders.push({
      id: `order-${String(i + 1).padStart(3, '0')}`,
      reference: `ORD-2026-${4100 + i}`,
      customerId: DEMO_CUSTOMER_ID,
      storeId: store.id,
      items,
      subtotalMinor,
      deliveryMinor: store.deliveryMinor,
      totalMinor: subtotalMinor + store.deliveryMinor,
      status: ORDER_STATUSES[i % ORDER_STATUSES.length] as OrderStatus,
      placedAt: isoDaysFromToday(-daysAgo),
      etaAt: isoDaysFromToday(-daysAgo + 2, 16),
      addressEn: 'Villa 214, Road 1907, Block 719, Riffa',
      addressAr: 'فيلا ٢١٤، طريق ١٩٠٧، مجمع ٧١٩، الرفاع',
      paymentMethod: PAYMENT_METHODS[i % PAYMENT_METHODS.length] as string,
    });
  }
  return orders;
}

export const DEMO_ORDERS: DemoOrder[] = buildOrders();

export function demoOrder(id: string): DemoOrder | undefined {
  return DEMO_ORDERS.find((o) => o.id === id);
}

/* ---------------------------------------------------------------- bookings */

const BOOKING_SERVICES = [
  { en: 'Pre-purchase inspection', ar: 'فحص ما قبل الشراء', price: 28_000, minutes: 75 },
  { en: 'Oil and filter change', ar: 'تغيير الزيت والفلتر', price: 14_500, minutes: 45 },
  { en: 'Air conditioning service', ar: 'صيانة المكيف', price: 26_000, minutes: 60 },
  { en: 'Brake service', ar: 'صيانة الفرامل', price: 32_000, minutes: 90 },
  { en: 'Full major service', ar: 'صيانة شاملة كبرى', price: 96_000, minutes: 240 },
];

const BOOKING_TIMES = ['09:00', '10:30', '12:00', '14:00', '16:30'];
const BOOKING_STATUSES: BookingStatus[] = [
  'CONFIRMED',
  'PENDING',
  'COMPLETED',
  'COMPLETED',
  'CANCELLED',
];

function buildBookings(): DemoBooking[] {
  const bookable = DEMO_PROVIDERS.filter((p) => p.kind !== 'recovery');
  const bookings: DemoBooking[] = [];
  for (let i = 0; i < 10; i += 1) {
    const provider = bookable[i % bookable.length]!;
    const vehicle = DEMO_VEHICLES[i % DEMO_VEHICLES.length]!;
    const service = BOOKING_SERVICES[i % BOOKING_SERVICES.length]!;
    const dayOffset = (i % 8) - 3;
    const day = 25 + dayOffset;
    bookings.push({
      id: `booking-${String(i + 1).padStart(3, '0')}`,
      reference: `BKG-2026-${7200 + i}`,
      customerId: DEMO_CUSTOMER_ID,
      providerId: provider.id,
      vehicleId: vehicle.id,
      serviceNameEn: service.en,
      serviceNameAr: service.ar,
      date: `2026-10-${String(Math.max(1, Math.min(31, day))).padStart(2, '0')}`,
      time: BOOKING_TIMES[i % BOOKING_TIMES.length] as string,
      durationMinutes: service.minutes,
      totalMinor: service.price,
      status: BOOKING_STATUSES[i % BOOKING_STATUSES.length] as BookingStatus,
      notesEn: 'Please check the front brakes as well.',
      notesAr: 'يرجى فحص الفرامل الأمامية أيضاً.',
      createdAt: isoDaysFromToday(-(12 - i)),
    });
  }
  return bookings;
}

export const DEMO_BOOKINGS: DemoBooking[] = buildBookings();

export function demoBooking(id: string): DemoBooking | undefined {
  return DEMO_BOOKINGS.find((b) => b.id === id);
}

/* --------------------------------------------------------------- recovery */

const RECOVERY_STATUSES: RecoveryStatus[] = [
  'COMPLETED',
  'COMPLETED',
  'EN_ROUTE',
  'SEARCHING',
  'ACCEPTED',
];

function buildRecoveryJobs(): DemoRecoveryJob[] {
  const recoveryProviders = DEMO_PROVIDERS.filter((p) => p.kind === 'recovery');
  const jobs: DemoRecoveryJob[] = [];
  for (let i = 0; i < 5; i += 1) {
    const provider = recoveryProviders[i % recoveryProviders.length]!;
    const vehicle = DEMO_VEHICLES[i % DEMO_VEHICLES.length]!;
    const issue = RECOVERY_ISSUES[i % RECOVERY_ISSUES.length]!;
    const driver = DEMO_DRIVERS[i % DEMO_DRIVERS.length]!;
    const truck = DEMO_FLEET[i % DEMO_FLEET.length]!;
    const status = RECOVERY_STATUSES[i % RECOVERY_STATUSES.length] as RecoveryStatus;
    jobs.push({
      id: `recovery-${String(i + 1).padStart(3, '0')}`,
      reference: `RCV-2026-${3300 + i}`,
      customerId: DEMO_CUSTOMER_ID,
      providerId: provider.id,
      vehicleId: vehicle.id,
      issueKey: issue.key,
      pickupEn: 'Manama Corniche, near Bahrain Bay',
      pickupAr: 'كورنيش المنامة، قرب خليج البحرين',
      dropoffEn: 'Al Waha Auto Workshop, Manama',
      dropoffAr: 'ورشة الواحة، المنامة',
      pickupPoint: { x: 26, y: 62 },
      dropoffPoint: { x: 64, y: 30 },
      quotedPriceMinor: band(41, i, 12_000, 45_000),
      status,
      requestedAt: isoDaysFromToday(-(9 - i * 2)),
      driverNameEn: driver.en,
      driverNameAr: driver.ar,
      driverPhone: driver.phone,
      truckPlate: truck.plate,
      truckTypeEn: truck.en,
      truckTypeAr: truck.ar,
      etaMinutes: band(53, i, 4, 22),
      ratingGiven: status === 'COMPLETED' ? band(61, i, 4, 5) : null,
    });
  }
  return jobs;
}

export const DEMO_RECOVERY_JOBS: DemoRecoveryJob[] = buildRecoveryJobs();

export function demoRecoveryJob(id: string): DemoRecoveryJob | undefined {
  return DEMO_RECOVERY_JOBS.find((j) => j.id === id);
}

export function recoveryIssueLabel(key: string, locale: 'ar' | 'en'): string {
  const issue = RECOVERY_ISSUES.find((x) => x.key === key);
  if (!issue) return key;
  return locale === 'ar' ? issue.ar : issue.en;
}

/* ---------------------------------------------------------------- sensage */

/**
 * The finding library. Every entry is a *plausible* condition with an indicative
 * cost, never a diagnosis — the report screen repeats that in both languages.
 */
export const SENSAGE_FINDINGS: DemoFinding[] = [
  {
    severity: 'high',
    titleEn: 'Brake pad wear detected',
    titleAr: 'تآكل في فحمات الفرامل',
    detailEn:
      'The front pads show uneven wear on the inner face, which usually points to a sticking caliper. Worth a physical check before a long drive.',
    detailAr:
      'تظهر الفحمات الأمامية تآكلاً غير متساوٍ على الوجه الداخلي، وعادةً يشير ذلك إلى كاليبر عالق. يستحق فحصاً فعلياً قبل رحلة طويلة.',
    confidence: 0.86,
    costMinor: 24_000,
  },
  {
    severity: 'medium',
    titleEn: 'Tyre tread below recommendation',
    titleAr: 'عمق مداس الإطار أقل من الموصى به',
    detailEn: 'The rear tread looks close to the 1.6 mm legal minimum. Replace before the next long drive.',
    detailAr: 'يبدو مداس الإطار الخلفي قريباً من الحد القانوني ١٫٦ مم. يُنصح بالاستبدال قبل الرحلة القادمة.',
    confidence: 0.72,
    costMinor: 48_000,
  },
  {
    severity: 'low',
    titleEn: 'Minor oil seepage',
    titleAr: 'تسرب زيت بسيط',
    detailEn: 'A light film around the valve cover gasket. Monitor it and re-check at the next service.',
    detailAr: 'طبقة خفيفة حول وجه غطاء الصمامات. يُنصح بالمراقبة وإعادة الفحص في الصيانة القادمة.',
    confidence: 0.64,
    costMinor: 12_000,
  },
  {
    severity: 'medium',
    titleEn: 'Battery voltage low',
    titleAr: 'جهد البطارية منخفض',
    detailEn: 'Resting voltage reads under 12.4 V, which shortens cold-start reliability.',
    detailAr: 'قراءة الجهد عند الراحة أقل من ١٢٫٤ فولت، ما يقلل موثوقية التشغيل البارد.',
    confidence: 0.79,
    costMinor: 32_000,
  },
  {
    severity: 'high',
    titleEn: 'Suspension knock suspected',
    titleAr: 'احتمال طرق في نظام التعليق',
    detailEn: 'The stance suggests a worn stabiliser link or a lower control arm bush.',
    detailAr: 'تشير وضعية السيارة إلى تآكل في وصلة الموازن أو جلبة ذراع التعليق السفلي.',
    confidence: 0.68,
    costMinor: 56_000,
  },
  {
    severity: 'low',
    titleEn: 'Wiper blades streaking',
    titleAr: 'خطوط في مساحات الزجاج',
    detailEn: 'The blade edges look hardened. Cheap to replace and it improves wet-weather visibility.',
    detailAr: 'تبدو حواف المساحات متصلبة. استبدالها غير مكلف ويحسن الرؤية في المطر.',
    confidence: 0.81,
    costMinor: 4_500,
  },
  {
    severity: 'medium',
    titleEn: 'Air filter looks loaded',
    titleAr: 'فلتر الهواء يبدو متسخاً',
    detailEn: 'Dust loading is visible on the element. A restriction costs fuel economy.',
    detailAr: 'يظهر تراكم غبار على الفلتر. انسداد الفلتر يزيد استهلاك الوقود.',
    confidence: 0.75,
    costMinor: 3_500,
  },
];

function buildSensageReports(): DemoSensageReport[] {
  const reports: DemoSensageReport[] = [];
  for (let i = 0; i < 5; i += 1) {
    const vehicle = DEMO_VEHICLES[i % DEMO_VEHICLES.length]!;
    const findingCount = band(71, i, 2, 4);
    const findings: DemoFinding[] = [];
    for (let j = 0; j < findingCount; j += 1) {
      const finding = SENSAGE_FINDINGS[(i * 2 + j) % SENSAGE_FINDINGS.length]!;
      if (!findings.some((f) => f.titleEn === finding.titleEn)) findings.push(finding);
    }
    reports.push({
      id: `sensage-${String(i + 1).padStart(3, '0')}`,
      reference: `SNS-2026-${9100 + i}`,
      customerId: DEMO_CUSTOMER_ID,
      vehicleId: vehicle.id,
      createdAt: isoDaysFromToday(-(i * 6 + 2), 14),
      score: band(83, i, 58, 92),
      photoCount: band(89, i, 4, 9),
      findings,
      recommendationsEn: [
        'Book the high severity items within the next two weeks.',
        'Repeat the check after the repairs to confirm the score improves.',
        'Keep the photos; a workshop can quote from them directly.',
      ],
      recommendationsAr: [
        'احجز البنود عالية الأهمية خلال الأسبوعين القادمين.',
        'أعد الفحص بعد الإصلاح للتأكد من تحسن التقييم.',
        'احتفظ بالصور؛ يمكن للورشة تقديم عرض سعر منها مباشرة.',
      ],
    });
  }
  return reports;
}

export const DEMO_SENSAGE_REPORTS: DemoSensageReport[] = buildSensageReports();

export function demoSensageReport(id: string): DemoSensageReport | undefined {
  return DEMO_SENSAGE_REPORTS.find((r) => r.id === id);
}

/** The photo slots the SENSAGE capture flow asks the customer to fill. */
export const SENSAGE_PHOTO_SLOTS = [
  { key: 'front', en: 'Front three-quarter', ar: 'الزاوية الأمامية' },
  { key: 'rear', en: 'Rear three-quarter', ar: 'الزاوية الخلفية' },
  { key: 'left', en: 'Left side', ar: 'الجانب الأيسر' },
  { key: 'right', en: 'Right side', ar: 'الجانب الأيمن' },
  { key: 'interior', en: 'Interior and dashboard', ar: 'المقصورة ولوحة القيادة' },
  { key: 'tyres', en: 'Tyres and wheels', ar: 'الإطارات والجنوط' },
] as const;

/* --------------------------------------------------------- notifications */

export const DEMO_NOTIFICATIONS: DemoNotification[] = [
  {
    id: 'notif-01',
    audience: 'customer',
    titleEn: 'Your order is on the way',
    titleAr: 'طلبك في الطريق',
    bodyEn: 'Order ORD-2026-4102 has left Al Noor Auto Parts.',
    bodyAr: 'الطلب ORD-2026-4102 خرج من النور لقطع الغيار.',
    createdAt: isoDaysFromToday(0, 9),
    read: false,
    kind: 'order',
  },
  {
    id: 'notif-02',
    audience: 'customer',
    titleEn: 'Booking confirmed',
    titleAr: 'تم تأكيد الحجز',
    bodyEn: 'Your inspection is confirmed for 10:30 at the National Inspection Centre.',
    bodyAr: 'تم تأكيد فحصك الساعة ١٠:٣٠ في المركز الوطني للفحص.',
    createdAt: isoDaysFromToday(-1, 11),
    read: false,
    kind: 'booking',
  },
  {
    id: 'notif-03',
    audience: 'customer',
    titleEn: 'SENSAGE report ready',
    titleAr: 'تقرير SENSAGE جاهز',
    bodyEn: 'Your demo condition report scored 74 out of 100.',
    bodyAr: 'تقرير الحالة التجريبي حصل على ٧٤ من ١٠٠.',
    createdAt: isoDaysFromToday(-2, 15),
    read: false,
    kind: 'sensage',
  },
  {
    id: 'notif-04',
    audience: 'customer',
    titleEn: 'Recovery driver assigned',
    titleAr: 'تم تعيين سائق السحب',
    bodyEn: 'Saeed Ibrahim is on the way in a flatbed, about 12 minutes out.',
    bodyAr: 'سعيد إبراهيم في الطريق بسطحة، حوالي ١٢ دقيقة.',
    createdAt: isoDaysFromToday(-3, 18),
    read: true,
    kind: 'recovery',
  },
  {
    id: 'notif-05',
    audience: 'customer',
    titleEn: 'Wallet top-up received',
    titleAr: 'تم استلام رصيد المحفظة',
    bodyEn: '20.000 BHD added to your demo wallet.',
    bodyAr: 'تمت إضافة ٢٠٫٠٠٠ د.ب إلى محفظتك التجريبية.',
    createdAt: isoDaysFromToday(-5, 13),
    read: true,
    kind: 'wallet',
  },
  {
    id: 'notif-06',
    audience: 'merchant',
    titleEn: 'New order received',
    titleAr: 'طلب جديد',
    bodyEn: 'ORD-2026-4108 needs preparing before 16:00.',
    bodyAr: 'الطلب ORD-2026-4108 يحتاج تحضيراً قبل الساعة ١٦:٠٠.',
    createdAt: isoDaysFromToday(0, 8),
    read: false,
    kind: 'order',
  },
  {
    id: 'notif-07',
    audience: 'merchant',
    titleEn: 'Low stock warning',
    titleAr: 'تنبيه انخفاض المخزون',
    bodyEn: 'Two products are below their reorder point.',
    bodyAr: 'منتجان أقل من حد إعادة الطلب.',
    createdAt: isoDaysFromToday(-1, 10),
    read: false,
    kind: 'system',
  },
  {
    id: 'notif-08',
    audience: 'merchant',
    titleEn: 'New review',
    titleAr: 'تقييم جديد',
    bodyEn: 'A customer rated your store 5 out of 5.',
    bodyAr: 'عميل قيّم متجرك بـ ٥ من ٥.',
    createdAt: isoDaysFromToday(-2, 19),
    read: true,
    kind: 'system',
  },
];

/* ------------------------------------------------------------------ wallet */

export const DEMO_WALLET_ENTRIES: DemoWalletEntry[] = [
  { id: 'wal-01', accountId: DEMO_CUSTOMER_ID, titleEn: 'Wallet top-up', titleAr: 'شحن المحفظة', amountMinor: 20_000, createdAt: isoDaysFromToday(-5, 13), kind: 'topup' },
  { id: 'wal-02', accountId: DEMO_CUSTOMER_ID, titleEn: 'Order ORD-2026-4102', titleAr: 'الطلب ORD-2026-4102', amountMinor: -18_400, createdAt: isoDaysFromToday(-4, 16), kind: 'purchase' },
  { id: 'wal-03', accountId: DEMO_CUSTOMER_ID, titleEn: 'Order ORD-2026-4106', titleAr: 'الطلب ORD-2026-4106', amountMinor: -9_750, createdAt: isoDaysFromToday(-2, 12), kind: 'purchase' },
  { id: 'wal-04', accountId: DEMO_CUSTOMER_ID, titleEn: 'Refund ORD-2026-4109', titleAr: 'استرجاع ORD-2026-4109', amountMinor: 6_200, createdAt: isoDaysFromToday(-1, 9), kind: 'refund' },
  { id: 'wal-05', accountId: DEMO_MERCHANT_ID, titleEn: 'Marketplace payout', titleAr: 'تحويل أرباح المتجر', amountMinor: 412_500, createdAt: isoDaysFromToday(-7, 10), kind: 'payout' },
  { id: 'wal-06', accountId: DEMO_MERCHANT_ID, titleEn: 'Subscription — Growth', titleAr: 'الاشتراك — النمو', amountMinor: -29_000, createdAt: isoDaysFromToday(-3, 10), kind: 'purchase' },
];

/* --------------------------------------------------------------- addresses */

export const DEMO_ADDRESSES: DemoAddress[] = [
  { id: 'addr-01', customerId: DEMO_CUSTOMER_ID, labelEn: 'Home', labelAr: 'المنزل', lineEn: 'Villa 214, Road 1907, Block 719, Riffa', lineAr: 'فيلا ٢١٤، طريق ١٩٠٧، مجمع ٧١٩، الرفاع', isDefault: true },
  { id: 'addr-02', customerId: DEMO_CUSTOMER_ID, labelEn: 'Work', labelAr: 'العمل', lineEn: 'Office 1104, Bahrain Financial Harbour, Manama', lineAr: 'مكتب ١١٠٤، مرفأ البحرين المالي، المنامة', isDefault: false },
  { id: 'addr-03', customerId: DEMO_CUSTOMER_ID, labelEn: 'Family', labelAr: 'العائلة', lineEn: 'House 9, Road 33, Block 201, Muharraq', lineAr: 'منزل ٩، طريق ٣٣، مجمع ٢٠١، المحرق', isDefault: false },
];

/* ------------------------------------------------------------- favourites */

/** Demo favourites, keyed `product:<id>` / `store:<id>` / `provider:<id>`. */
export const DEMO_FAVOURITES: string[] = [
  'product:prod-001',
  'product:prod-007',
  'product:prod-013',
  'store:store-04',
  'provider:inspection-01',
];

/* ---------------------------------------------------------------- reviews */

export interface DemoReview {
  id: string;
  subjectId: string;
  subjectKind: 'provider' | 'store' | 'product';
  authorEn: string;
  authorAr: string;
  rating: number;
  createdAt: string;
  bodyEn: string;
  bodyAr: string;
}

const REVIEW_AUTHORS = [
  { en: 'Khalid M.', ar: 'خالد م.' },
  { en: 'Fatima A.', ar: 'فاطمة أ.' },
  { en: 'Omar S.', ar: 'عمر س.' },
  { en: 'Noor H.', ar: 'نور ح.' },
  { en: 'Ali R.', ar: 'علي ر.' },
  { en: 'Maryam T.', ar: 'مريم ت.' },
  { en: 'Jassim K.', ar: 'جاسم ك.' },
];

const REVIEW_BODIES = [
  { en: 'Fast service and the price matched the quote exactly.', ar: 'خدمة سريعة والسعر مطابق للعرض تماماً.' },
  { en: 'Staff explained everything clearly. Will use again.', ar: 'شرح الفريق كل شيء بوضوح. سأكرر التعامل.' },
  { en: 'Good quality parts, and they arrived a day early.', ar: 'قطع بجودة جيدة ووصلت قبل الموعد بيوم.' },
  { en: 'Tidy workshop and they showed me the old parts.', ar: 'ورشة منظمة وأظهروني القطع القديمة.' },
  { en: 'Booked online and there was no waiting when I arrived.', ar: 'حجزت أونلاين ولم أنتظر عند الوصول.' },
  { en: 'Reasonable price for the work done. Recommended.', ar: 'سعر معقول مقابل العمل. أنصح به.' },
  { en: 'Clear written report, which I needed for the sale.', ar: 'تقرير مكتوب واضح، وكنت أحتاجه للبيع.' },
];

function buildReviews(): DemoReview[] {
  const subjects: Array<{ id: string; kind: 'provider' | 'store' | 'product' }> = [
    ...DEMO_PROVIDERS.map((p) => ({ id: p.id, kind: 'provider' as const })),
    ...DEMO_STORES.map((s) => ({ id: s.id, kind: 'store' as const })),
    ...DEMO_PRODUCTS.map((p) => ({ id: p.id, kind: 'product' as const })),
  ];
  const reviews: DemoReview[] = [];
  let counter = 0;
  for (const subject of subjects) {
    const count = band(97, counter, 3, 5);
    for (let i = 0; i < count; i += 1) {
      counter += 1;
      const author = REVIEW_AUTHORS[(counter + i) % REVIEW_AUTHORS.length]!;
      const body = REVIEW_BODIES[(counter + i * 2) % REVIEW_BODIES.length]!;
      reviews.push({
        id: `review-${String(counter).padStart(4, '0')}`,
        subjectId: subject.id,
        subjectKind: subject.kind,
        authorEn: author.en,
        authorAr: author.ar,
        rating: band(103, counter, 3, 5),
        createdAt: isoDaysFromToday(-band(107, counter, 2, 120)),
        bodyEn: body.en,
        bodyAr: body.ar,
      });
    }
  }
  return reviews;
}

export const DEMO_REVIEWS: DemoReview[] = buildReviews();

export function reviewsFor(subjectId: string): DemoReview[] {
  return DEMO_REVIEWS.filter((r) => r.subjectId === subjectId);
}

/* ----------------------------------------------------- merchant analytics */

/** Thirty days of revenue in minor units, deterministic, for the dashboard. */
export const DEMO_REVENUE_SERIES: number[] = Array.from({ length: 30 }, (_, i) => {
  const weekday = (i + 3) % 7;
  const weekendLift = weekday === 5 || weekday === 6 ? 1.35 : 1;
  return Math.round(band(131, i, 24_000, 96_000) * weekendLift);
});

/** Orders per status for the merchant's fulfilment board. */
export function merchantOrderStats(storeId: string) {
  const orders = DEMO_ORDERS.filter((o) => o.storeId === storeId);
  const byStatus: Record<string, number> = {};
  for (const order of orders) byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
  const revenueMinor = orders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + o.totalMinor, 0);
  return { orders, byStatus, revenueMinor, count: orders.length };
}

/** The catalogue categories a merchant sells, with counts. */
export function merchantCategoryMix(storeId: string): Array<{ key: CategoryKey; count: number }> {
  const mix = new Map<CategoryKey, number>();
  for (const p of DEMO_PRODUCTS.filter((x) => x.storeId === storeId)) {
    mix.set(p.categoryKey, (mix.get(p.categoryKey) ?? 0) + 1);
  }
  return [...mix.entries()].map(([key, count]) => ({ key, count }));
}

/** A product photo for a store, falling back to the store's own photo. */
export function photoForStore(storeId: string): PhotoKey {
  return demoStore(storeId)?.photo ?? 'partsStore';
}
