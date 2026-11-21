/**
 * Demo merchandising: homepage banners, promotional offers, merchant plans and
 * the optional ERP tool catalogue.
 *
 * These are the records a Super Admin will later manage (the brief asks for the
 * categories, banners, merchants, services, products, cards, payment gateways,
 * plans and AI to become administrable). They are modelled as plain records with
 * stable ids so that admin CRUD can replace them without touching the UI.
 */

import type { DemoBanner, DemoOffer, DemoPlan, ErpTool } from './catalogue';

export const DEMO_BANNERS: DemoBanner[] = [
  {
    id: 'banner-01',
    titleEn: 'SENSAGE AI vehicle check',
    titleAr: 'الفحص الذكي SENSAGE',
    subtitleEn: 'Photograph your car and get a demo condition report in minutes.',
    subtitleAr: 'صوّر سيارتك واحصل على تقرير حالة تجريبي في دقائق.',
    ctaEn: 'Start a check',
    ctaAr: 'ابدأ الفحص',
    href: '/sensage',
    photo: 'inspectionBay',
  },
  {
    id: 'banner-02',
    titleEn: 'Genuine parts, delivered today',
    titleAr: 'قطع أصلية، توصيل اليوم',
    subtitleEn: 'Fifteen verified suppliers across Bahrain.',
    subtitleAr: 'خمسة عشر مورداً موثقاً في جميع أنحاء البحرين.',
    ctaEn: 'Shop parts',
    ctaAr: 'تسوق القطع',
    href: '/parts',
    photo: 'partsStore',
  },
  {
    id: 'banner-03',
    titleEn: 'Roadside recovery in 30 minutes',
    titleAr: 'سحب على الطريق خلال ٣٠ دقيقة',
    subtitleEn: 'Live demo tracking from pickup to drop-off.',
    subtitleAr: 'تتبع تجريبي مباشر من الاستلام حتى التسليم.',
    ctaEn: 'Request recovery',
    ctaAr: 'اطلب سحباً',
    href: '/recovery',
    photo: 'recoveryTow',
  },
  {
    id: 'banner-04',
    titleEn: 'Book maintenance online',
    titleAr: 'احجز الصيانة أونلاين',
    subtitleEn: 'Ten workshops with published prices and slots.',
    subtitleAr: 'عشر ورش بأسعار ومواعيد معلنة.',
    ctaEn: 'Find a workshop',
    ctaAr: 'ابحث عن ورشة',
    href: '/services?kind=maintenance',
    photo: 'autoService',
  },
];

export const DEMO_OFFERS: DemoOffer[] = [
  {
    id: 'offer-01',
    titleEn: '22% off brake parts',
    titleAr: 'خصم ٢٢٪ على الفرامل',
    subtitleEn: 'Al Noor Auto Parts, this week only.',
    subtitleAr: 'النور لقطع الغيار، هذا الأسبوع فقط.',
    percentOff: 22,
    storeId: 'store-01',
    categoryKey: 'spare_parts',
    photo: 'mechanicEngine',
    expiresAt: '2026-11-02',
    code: 'BRAKE22',
  },
  {
    id: 'offer-02',
    titleEn: 'Free delivery over 30 BHD',
    titleAr: 'توصيل مجاني فوق ٣٠ د.ب',
    subtitleEn: 'Across every verified parts store.',
    subtitleAr: 'في جميع متاجر القطع الموثقة.',
    percentOff: 0,
    storeId: null,
    categoryKey: 'spare_parts',
    photo: 'partsStore',
    expiresAt: '2026-12-31',
    code: 'FREEDEL',
  },
  {
    id: 'offer-03',
    titleEn: '15% off a full service',
    titleAr: 'خصم ١٥٪ على الصيانة الشاملة',
    subtitleEn: 'Al Waha Auto Workshop.',
    subtitleAr: 'ورشة الواحة للسيارات.',
    percentOff: 15,
    storeId: null,
    categoryKey: 'maintenance',
    photo: 'autoService',
    expiresAt: '2026-11-15',
    code: 'SERVICE15',
  },
  {
    id: 'offer-04',
    titleEn: 'Car wash bundle',
    titleAr: 'باقة غسيل السيارة',
    subtitleEn: 'Wash, polish and interior detail.',
    subtitleAr: 'غسيل وتلميع وتنظيف داخلي.',
    percentOff: 30,
    storeId: null,
    categoryKey: 'car_wash',
    photo: 'carwashPremium',
    expiresAt: '2026-11-08',
    code: 'WASH30',
  },
];

export const DEMO_PLANS: DemoPlan[] = [
  {
    id: 'starter',
    nameEn: 'Starter',
    nameAr: 'البداية',
    priceMinor: 12_000,
    periodEn: 'per month',
    periodAr: 'شهرياً',
    commissionBps: 600,
    featuresEn: ['Store profile', 'Up to 40 products', 'Order management', 'Basic analytics'],
    featuresAr: ['ملف المتجر', 'حتى ٤٠ منتجاً', 'إدارة الطلبات', 'تحليلات أساسية'],
    erpModules: [],
    highlighted: false,
  },
  {
    id: 'growth',
    nameEn: 'Growth',
    nameAr: 'النمو',
    priceMinor: 29_000,
    periodEn: 'per month',
    periodAr: 'شهرياً',
    commissionBps: 400,
    featuresEn: [
      'Everything in Starter',
      'Unlimited products',
      'Bookings and calendar',
      'Promotions and offers',
      'Priority placement',
      'Sales and inventory tools',
    ],
    featuresAr: [
      'كل ما في البداية',
      'منتجات غير محدودة',
      'الحجوزات والتقويم',
      'العروض والخصومات',
      'ظهور مميز',
      'أدوات المبيعات والمخزون',
    ],
    erpModules: ['sales', 'inventory'],
    highlighted: true,
  },
  {
    id: 'enterprise',
    nameEn: 'Enterprise',
    nameAr: 'المؤسسات',
    priceMinor: 79_000,
    periodEn: 'per month',
    periodAr: 'شهرياً',
    commissionBps: 200,
    featuresEn: [
      'Everything in Growth',
      'Full ERP toolset',
      'Multi-branch operations',
      'Recovery dispatch',
      'Account manager',
      'API access',
    ],
    featuresAr: [
      'كل ما في النمو',
      'حزمة ERP كاملة',
      'عمليات متعددة الفروع',
      'إدارة طلبات السحب',
      'مدير حساب',
      'الوصول عبر API',
    ],
    erpModules: ['sales', 'inventory', 'purchasing', 'accounting', 'hr', 'reports'],
    highlighted: false,
  },
];

/**
 * The optional ERP tools a merchant plan may unlock. These are *demo* screens
 * showing the merchant's own sales, stock and reports. They are deliberately not
 * connected to the internal ORYX ERP, which serves the platform's own companies.
 */
export const ERP_TOOLS: ErpTool[] = [
  { key: 'sales', en: 'Sales', ar: 'المبيعات' },
  { key: 'inventory', en: 'Inventory', ar: 'المخزون' },
  { key: 'purchasing', en: 'Purchasing', ar: 'المشتريات' },
  { key: 'accounting', en: 'Accounting', ar: 'المحاسبة' },
  { key: 'hr', en: 'Human resources', ar: 'الموارد البشرية' },
  { key: 'reports', en: 'Reports', ar: 'التقارير' },
];

/** The current merchant's plan, resolved from the demo account. */
export function planById(id: string | null): DemoPlan | undefined {
  if (!id) return undefined;
  return DEMO_PLANS.find((p) => p.id === id);
}
