/**
 * Preview data for the static GitHub Pages build.
 *
 * GitHub Pages serves files only: it cannot run the NestJS API or PostgreSQL,
 * so the exported build has no backend to talk to. This module supplies the
 * content the pages need, and every consumer that reads it also renders a
 * visible "preview" notice.
 *
 * What this deliberately does NOT do:
 *   - it never reports a booking, payment or sign-in as having succeeded;
 *   - it never posts to the API, so no preview interaction can create a real
 *     record or move real money;
 *   - it is not a mock of the API client. The real client is untouched and is
 *     what runs whenever the API is present.
 *
 * The catalogue mirrors the seeded platform content
 * (`scripts/seed-exec07-content.mjs` and `packages/database/prisma/seed.ts`), so
 * the preview shows the same categories, providers and copy as a seeded
 * deployment rather than invented placeholders.
 */

import { SERVICE_CATEGORIES } from '@oryx/shared';
import type {
  Address,
  BookingSlot,
  CustomerProfile,
  NotificationItem,
  NotificationPreference,
  PaymentRecord,
  PrivacySettings,
  ProviderDetail,
  ProviderSummary,
  ServiceRequestRecord,
  Vehicle,
  WebsiteContent,
} from './api';

/**
 * True in the static export.
 *
 * `NEXT_PUBLIC_ORYX_STATIC_EXPORT` is inlined into both the server and the
 * browser bundle, so the flag agrees on both sides of hydration. The bare
 * `ORYX_STATIC_EXPORT` is checked too, so the value is correct in a server-only
 * context (a script, a test) that has the variable but not the public one.
 */
export const IS_STATIC_PREVIEW =
  process.env.NEXT_PUBLIC_ORYX_STATIC_EXPORT === '1' || process.env.ORYX_STATIC_EXPORT === '1';

/** Short label for badges and the header strip. */
export const PREVIEW_LABEL_AR = 'معاينة تصميم';
export const PREVIEW_LABEL_EN = 'Design preview';

/** The one-line explanation shown wherever preview data is displayed. */
export const PREVIEW_NOTICE_AR =
  'هذه معاينة ثابتة للتصميم على GitHub Pages. لا يتصل هذا الإصدار بالخادم، فالبيانات المعروضة نموذجية ولا تُنشئ أي حجز أو دفعة حقيقية.';
export const PREVIEW_NOTICE_EN =
  'This is a static design preview on GitHub Pages. It is not connected to the API, so the records shown are samples and nothing here creates a real booking or payment.';

/** The notice in the visitor's language. */
export function previewNotice(locale: string): string {
  return locale === 'ar' ? PREVIEW_NOTICE_AR : PREVIEW_NOTICE_EN;
}

/** The label in the visitor's language. */
export function previewLabel(locale: string): string {
  return locale === 'ar' ? PREVIEW_LABEL_AR : PREVIEW_LABEL_EN;
}

// ------------------------------------------------------------ photography

/**
 * The approved photographs, copied into the export at build time.
 *
 * These are the owner-supplied files in `apps/customer/public/media`, the same
 * images the CMS attaches to each category in a seeded deployment.
 */
const PHOTO = {
  heroShowroom: '/media/hero-showroom.jpg',
  showroomJaguar: '/media/showroom-jaguar.jpg',
  workshopArtDeco: '/media/workshop-artdeco.jpg',
  mechanicEngine: '/media/mechanic-engine.jpg',
  inspectionBay: '/media/inspection-bay.jpg',
  garageBrastad: '/media/garage-brastad.jpg',
  partsStore: '/media/parts-store.jpg',
  carwashPremium: '/media/carwash-premium.jpg',
  recoveryTow: '/media/recovery-tow.jpg',
  evCharging: '/media/ev-charging.jpg',
} as const;

/** Which photograph illustrates which catalogue category. */
const CATEGORY_PHOTO: Record<string, string> = {
  vehicle_inspection: PHOTO.inspectionBay,
  maintenance: PHOTO.mechanicEngine,
  spare_parts: PHOTO.partsStore,
  recovery: PHOTO.recoveryTow,
  car_wash: PHOTO.carwashPremium,
};

/** The administrator-authored category copy, mirroring the content seed. */
const CATEGORY_COPY: Record<string, { descriptionEn: string; descriptionAr: string }> = {
  vehicle_inspection: {
    descriptionEn:
      'Periodic and pre-purchase inspection carried out by an approved centre, with a written report stored against the vehicle.',
    descriptionAr:
      'فحص دوري وفحص ما قبل الشراء في مركز معتمد، مع تقرير مكتوب محفوظ في سجل المركبة.',
  },
  maintenance: {
    descriptionEn:
      'Scheduled servicing, diagnostics and mechanical repair by a vetted workshop, with every part issued from the shared stock ledger.',
    descriptionAr:
      'صيانة دورية وتشخيص وإصلاح ميكانيكي في ورشة موثوقة، مع صرف كل قطعة من سجل المخزون الموحّد.',
  },
  spare_parts: {
    descriptionEn:
      'Genuine and aftermarket parts sourced from approved suppliers, priced in the catalogue and reserved against live stock.',
    descriptionAr:
      'قطع أصلية وبديلة من موردين معتمدين، مسعّرة في الكتالوج ومحجوزة من المخزون المباشر.',
  },
  recovery: {
    descriptionEn:
      'Towing and roadside assistance dispatched to a request, with the driver, vehicle and job recorded end to end.',
    descriptionAr:
      'سحب ومساعدة على الطريق تُرسل عند الطلب، مع تسجيل السائق والمركبة والمهمة من البداية إلى النهاية.',
  },
  car_wash: {
    descriptionEn:
      'Exterior wash, interior detailing and valeting booked into a real slot with a confirmed appointment.',
    descriptionAr: 'غسيل خارجي وتنظيف داخلي وتلميع، يُحجز في موعد حقيقي مع تأكيد.',
  },
};

// ------------------------------------------------------------- providers

/**
 * The approved providers the seed creates, one per category.
 *
 * Names and codes match `providerNames` in the seed so the preview directory
 * shows the same organisations a seeded deployment would return.
 */
const PROVIDERS: ProviderSummary[] = [
  {
    id: 'city-auto-care',
    code: 'ORYX-AUTO-P1',
    nameEn: 'City Auto Care',
    nameAr: 'رعاية السيارات المدينة',
    categoryKey: 'maintenance',
    city: 'Manama',
    averageRating: 4.6,
    reviewCount: 38,
    listings: [{ id: 'l-maintenance', nameEn: 'Maintenance and repair', nameAr: 'الصيانة والإصلاح', priceMinor: 30000 }],
  },
  {
    id: 'gulf-inspection-centre',
    code: 'ORYX-AUTO-P2',
    nameEn: 'Gulf Inspection Centre',
    nameAr: 'مركز الخليج للفحص',
    categoryKey: 'vehicle_inspection',
    city: 'Manama',
    averageRating: 4.8,
    reviewCount: 52,
    listings: [{ id: 'l-inspection', nameEn: 'Vehicle inspection', nameAr: 'فحص المركبات', priceMinor: 30000 }],
  },
  {
    id: 'al-noor-parts',
    code: 'ORYX-AUTO-P3',
    nameEn: 'Al Noor Parts',
    nameAr: 'النور لقطع الغيار',
    categoryKey: 'spare_parts',
    city: 'Manama',
    averageRating: 4.3,
    reviewCount: 21,
    listings: [{ id: 'l-parts', nameEn: 'Spare parts', nameAr: 'قطع الغيار', priceMinor: 30000 }],
  },
  {
    id: 'rapid-recovery-24',
    code: 'ORYX-AUTO-P4',
    nameEn: 'Rapid Recovery 24',
    nameAr: 'الإنقاذ السريع ٢٤',
    categoryKey: 'recovery',
    city: 'Manama',
    averageRating: 4.5,
    reviewCount: 30,
    listings: [{ id: 'l-recovery', nameEn: 'Roadside recovery', nameAr: 'خدمات الطريق', priceMinor: 30000 }],
  },
  {
    id: 'premium-car-wash',
    code: 'ORYX-AUTO-P5',
    nameEn: 'Premium Car Wash',
    nameAr: 'غسيل السيارات المميز',
    categoryKey: 'car_wash',
    city: 'Manama',
    averageRating: 4.4,
    reviewCount: 27,
    listings: [{ id: 'l-carwash', nameEn: 'Car wash and detailing', nameAr: 'غسيل وتلميع السيارات', priceMinor: 30000 }],
  },
];

/** The same five providers the seed writes, filtered by category. */
export function previewProviders(categoryKey?: string): ProviderSummary[] {
  if (!categoryKey) return PROVIDERS;
  return PROVIDERS.filter((p) => p.categoryKey === categoryKey);
}

/** Opening hours used by every seeded provider, matching the seed's schedule. */
const WEEKDAYS = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  opensAt: '08:00',
  closesAt: '18:00',
  // Friday, the weekend day in Bahrain.
  isClosed: dayOfWeek === 5,
}));

export function previewProvider(id: string): ProviderDetail | null {
  const base = PROVIDERS.find((p) => p.id === id);
  if (!base) return null;
  return {
    ...base,
    availability: WEEKDAYS,
    listings: base.listings ?? [],
    reviews: [
      {
        id: 'r-1',
        rating: 5,
        title: null,
        comment:
          'Booked a periodic inspection and the report was in the app before I got home. No surprises on the invoice.',
        providerReply: null,
        createdAt: '2026-09-14T09:20:00.000Z',
      },
      {
        id: 'r-2',
        rating: 4,
        title: null,
        comment: 'Clear pricing and the parts came from stock that was already reserved for the job.',
        providerReply: 'Thank you — we keep the parts reservation visible on every job card.',
        createdAt: '2026-08-30T14:05:00.000Z',
      },
    ],
  };
}

// ---------------------------------------------------------------- website

/** Website copy, mirroring the published blocks in the content seed. */
const BLOCKS: Array<{ key: string; ar: string; en: string }> = [
  { key: 'home.hero.eyebrow', ar: 'منصة خدمات السيارات الموحدة', en: 'The unified automotive services platform' },
  { key: 'home.hero.title', ar: 'كل خدمات سيارتك في مكان واحد', en: 'Every service your car needs, in one place' },
  {
    key: 'home.hero.subtitle',
    ar: 'احجز الصيانة والفحص وقطع الغيار والمساعدة على الطريق من مزودين معتمدين، وتابع كل خطوة في سجل موثّق.',
    en: 'Book maintenance, inspection, spare parts and roadside assistance from approved providers, and follow every step in a documented record.',
  },
  { key: 'home.cta.book', ar: 'احجز موعداً', en: 'Book an appointment' },
  { key: 'home.cta.browse', ar: 'تصفح المزودين', en: 'Browse providers' },
  { key: 'home.categories.title', ar: 'الخدمات التي نغطيها', en: 'Services we cover' },
  {
    key: 'home.categories.subtitle',
    ar: 'خمس فئات أساسية، كل واحدة يقدمها مزودون معتمدون بعد التحقق.',
    en: 'Five core categories, each delivered by providers who passed approval before they were listed.',
  },
  { key: 'home.value.title', ar: 'لماذا أوريكس', en: 'Why ORYX' },
  {
    key: 'home.value.subtitle',
    ar: 'منصة واحدة تربط العميل والورشة والمورد في سجل واحد.',
    en: 'One platform that connects the customer, the workshop and the supplier in a single record.',
  },
  { key: 'home.partner.title', ar: 'انضم كمزود خدمة', en: 'Become a service provider' },
  {
    key: 'home.partner.body',
    ar: 'قدّم طلبك، وسيراجعه فريق المنصة. لا يظهر أي مزود في الموقع قبل اعتماده.',
    en: 'Submit your application and the platform team reviews it. No provider appears on the site before approval.',
  },
  { key: 'home.trust.title', ar: 'الثقة مبنية على التحقق', en: 'Trust built on verification' },
  { key: 'home.contact.title', ar: 'تحتاج مساعدة؟', en: 'Need a hand?' },
  {
    key: 'home.contact.body',
    ar: 'افتح تذكرة دعم من حسابك وسيتابعها الفريق المعني.',
    en: 'Open a support ticket from your account and the right team picks it up.',
  },
];

/**
 * The published website content for the requested locale.
 *
 * The shapes match the CMS payload exactly, so the pages that consume this are
 * the same code paths that consume the API response — the preview does not fork
 * the rendering logic.
 */
export function previewWebsiteContent(locale: string): WebsiteContent {
  return {
    locale,
    blocks: BLOCKS.map((b, index) => ({
      key: b.key,
      value: locale === 'ar' ? b.ar : b.en,
      body: null,
      linkUrl: null,
      linkLabel: null,
      sortOrder: index,
      media: null,
    })),
    banners: [
      {
        placement: 'home-hero',
        title: locale === 'ar' ? 'كل خدمات سيارتك في مكان واحد' : 'Every service your car needs, in one place',
        subtitle: null,
        actionUrl: null,
        sortOrder: 0,
        // A bundled photograph rather than a CMS media id, because the export
        // has no API to serve asset bytes from.
        imageUrl: PHOTO.heroShowroom,
        media: null,
      },
    ],
    categories: SERVICE_CATEGORIES.map((category) => {
      const copy = CATEGORY_COPY[category.key];
      return {
        key: category.key,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        domain: category.domain,
        descriptionEn: copy?.descriptionEn ?? category.descEn,
        descriptionAr: copy?.descriptionAr ?? category.descAr,
        media: null,
      };
    }),
  };
}

/**
 * Photograph for a category in the preview.
 *
 * The API path resolves this through CMS media ids; the static build has no
 * such endpoint, so the bundled file is returned directly.
 */
export function previewCategoryPhoto(categoryKey: string): string | null {
  return CATEGORY_PHOTO[categoryKey] ?? null;
}

/** The hero photograph, used when the CMS banner carries no image. */
export const PREVIEW_HERO_PHOTO = PHOTO.heroShowroom;

/** A secondary photograph for the partner panel. */
export const PREVIEW_PARTNER_PHOTO = PHOTO.mechanicEngine;

/** The gallery strip on the services page. */
export const PREVIEW_GALLERY = [
  { src: PHOTO.heroShowroom, altEn: 'A luxury car showroom with polished vehicles', altAr: 'صالة عرض فاخرة للسيارات' },
  { src: PHOTO.inspectionBay, altEn: 'A vehicle inspection bay with a car on a ramp', altAr: 'قسم فحص المركبات مع رفع السيارة' },
  { src: PHOTO.mechanicEngine, altEn: 'Two mechanics repairing an engine', altAr: 'ميكانيكيان يصلحان محركاً' },
  { src: PHOTO.partsStore, altEn: 'Shelves of organised car spare parts', altAr: 'رفوف قطع غيار منظمة' },
  { src: PHOTO.recoveryTow, altEn: 'A recovery truck loading a car', altAr: 'شاحنة إنقاذ تحمل سيارة' },
  { src: PHOTO.carwashPremium, altEn: 'A premium car wash station', altAr: 'محطة غسيل سيارات مميزة' },
  { src: PHOTO.workshopArtDeco, altEn: 'A classic automotive workshop building', altAr: 'ورشة سيارات كلاسيكية' },
  { src: PHOTO.evCharging, altEn: 'An electric vehicle charging at a station', altAr: 'سيارة كهربائية تشحن في محطة' },
] as const;

// ------------------------------------------------------- customer records

/**
 * Sample records for the signed-in screens.
 *
 * These exist only so the dashboard, garage and booking layouts can be seen in
 * the static preview. Nothing here is written anywhere, and no action on these
 * screens reports success — the mutating calls throw `preview_read_only`.
 */

/** The stand-in account shown in the preview header and dashboard. */
export const PREVIEW_PROFILE: CustomerProfile = {
  id: 'preview-customer',
  email: 'preview@oryx.local',
  fullName: 'Preview Visitor',
  phone: '+973 0000 0000',
  status: 'ACTIVE',
  preferredLocale: 'ar' as const,
  preferredTheme: 'light' as const,
  mfaEnabled: false,
  defaultCompanyId: null,
  _count: { vehicles: 2, addresses: 1, bookings: 3 },
};

export const PREVIEW_VEHICLES: Vehicle[] = [
  {
    id: 'v-1',
    vin: 'JHMCM56557C404453',
    plateNumber: '1234 ABC',
    make: 'Honda',
    model: 'Accord',
    modelYear: 2021,
    color: 'Pearl white',
    mileage: 62400,
    status: 'ACTIVE',
  },
  {
    id: 'v-2',
    vin: 'WBA5A5C51ED000000',
    plateNumber: '5678 DEF',
    make: 'BMW',
    model: '520i',
    modelYear: 2019,
    color: 'Midnight blue',
    mileage: 98150,
    status: 'ACTIVE',
  },
];

export const PREVIEW_ADDRESSES: Address[] = [
  {
    id: 'a-1',
    label: 'Home',
    addressLine1: 'Building 214, Road 2803',
    addressLine2: 'Block 428',
    city: 'Manama',
    countryCode: 'BH',
    isDefault: true,
  },
];

export const PREVIEW_BOOKINGS: BookingSlot[] = [
  {
    id: 'b-1',
    reference: 'BK-2026-000118',
    bookingType: 'INSPECTION',
    status: 'CONFIRMED',
    startsAt: '2026-10-22T09:00:00.000Z',
    endsAt: '2026-10-22T10:00:00.000Z',
    durationMinutes: 60,
    serviceRef: 'inspection-basic',
  },
  {
    id: 'b-2',
    reference: 'BK-2026-000119',
    bookingType: 'MAINTENANCE',
    status: 'PENDING',
    startsAt: '2026-10-27T13:30:00.000Z',
    endsAt: '2026-10-27T15:00:00.000Z',
    durationMinutes: 90,
    serviceRef: 'maintenance-service',
  },
  {
    id: 'b-3',
    reference: 'BK-2026-000114',
    bookingType: 'PROVIDER_SERVICE',
    status: 'COMPLETED',
    startsAt: '2026-10-02T08:00:00.000Z',
    endsAt: '2026-10-02T09:00:00.000Z',
    durationMinutes: 60,
    serviceRef: 'car_wash',
  },
];

export const PREVIEW_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n-1',
    title: 'Inspection report ready',
    body: 'The written report for BK-2026-000114 is attached to the vehicle record.',
    category: 'BOOKING',
    readAt: null,
    createdAt: '2026-10-03T10:12:00.000Z',
  },
  {
    id: 'n-2',
    title: 'Appointment confirmed',
    body: 'Gulf Inspection Centre confirmed your appointment for 22 October at 09:00.',
    category: 'BOOKING',
    readAt: null,
    createdAt: '2026-10-18T07:40:00.000Z',
  },
];

export const PREVIEW_PAYMENTS: PaymentRecord[] = [
  {
    id: 'p-1',
    intentNumber: 'PAY-2026-000241',
    targetType: 'BOOKING',
    amountMinor: 30000,
    currency: 'BHD',
    currencyScale: 3,
    status: 'SUCCEEDED',
    provider: 'CASH',
    description: 'Vehicle inspection',
    succeededAt: '2026-10-02T09:05:00.000Z',
    createdAt: '2026-10-02T09:00:00.000Z',
    refunds: [],
  },
  {
    id: 'p-2',
    intentNumber: 'PAY-2026-000256',
    targetType: 'BOOKING',
    amountMinor: 45000,
    currency: 'BHD',
    currencyScale: 3,
    status: 'PENDING',
    provider: 'BANK_TRANSFER',
    description: 'Maintenance and repair',
    succeededAt: null,
    createdAt: '2026-10-18T07:41:00.000Z',
    refunds: [],
  },
];

export const PREVIEW_SERVICE_REQUESTS: ServiceRequestRecord[] = [
  {
    id: 'sr-1',
    requestNumber: 'SR-2026-000087',
    categoryKey: 'maintenance',
    description: 'Rattle from the front suspension over speed bumps.',
    status: 'ACCEPTED',
    createdAt: '2026-10-12T11:00:00.000Z',
  },
];

export const PREVIEW_PRIVACY: PrivacySettings = {
  allowMarketingEmails: false,
  shareContactWithProvider: true,
  allowDataAnalytics: false,
};

export const PREVIEW_NOTIFICATION_PREFERENCES: NotificationPreference[] = [
  { channel: 'IN_APP', category: 'BOOKING', enabled: true },
  { channel: 'EMAIL', category: 'BOOKING', enabled: true },
  { channel: 'SMS', category: 'BOOKING', enabled: false },
  { channel: 'EMAIL', category: 'MARKETING', enabled: false },
];

/** The error a mutating call raises in the static preview. */
export const PREVIEW_READ_ONLY_MESSAGE =
  'The static preview is read-only: this action needs the ORYX API, which GitHub Pages cannot host.';
