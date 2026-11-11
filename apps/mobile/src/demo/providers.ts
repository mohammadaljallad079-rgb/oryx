/**
 * Demo service providers: inspection stations, workshops and recovery operators.
 *
 * Ten inspection centres, ten workshops and eight recovery providers, as the
 * brief requires. Each carries its published service list with a price in minor
 * units and a duration, which is what the booking flow books.
 */

import type { CategoryKey, DemoService, DemoProvider, PhotoKey, ProviderKind } from './catalogue';

const INSPECTION_SEEDS: Array<{ en: string; ar: string; cityKey: string; photo: PhotoKey }> = [
  { en: 'National Inspection Centre', ar: 'المركز الوطني للفحص', cityKey: 'manama', photo: 'inspectionBay' },
  { en: 'Riffa Vehicle Testing', ar: 'فحص الرفاع للمركبات', cityKey: 'riffa', photo: 'inspectionBay' },
  { en: 'Muharraq Auto Check', ar: 'فحص المحرق للسيارات', cityKey: 'muharraq', photo: 'autoService' },
  { en: 'Isa Town Test Lane', ar: 'مسار الفحص بمدينة عيسى', cityKey: 'isa', photo: 'inspectionBay' },
  { en: 'Hamad Pre-Purchase Inspections', ar: 'فحص ما قبل الشراء بمدينة حمد', cityKey: 'hamad', photo: 'inspectionBay' },
  { en: 'Sitra Technical Testing', ar: 'الفحص الفني بسترة', cityKey: 'sitrah', photo: 'autoService' },
  { en: 'Gulf Diagnostic Centre', ar: 'مركز الخليج للتشخيص', cityKey: 'manama', photo: 'inspectionBay' },
  { en: 'Premier Vehicle Assessment', ar: 'بريمير لتقييم المركبات', cityKey: 'riffa', photo: 'garageInterior' },
  { en: 'Coastal Inspection Bay', ar: 'خليج الفحص الساحلي', cityKey: 'muharraq', photo: 'inspectionBay' },
  { en: 'Elite Pre-Purchase Reports', ar: 'إيليت لتقارير ما قبل الشراء', cityKey: 'isa', photo: 'autoService' },
];

const WORKSHOP_SEEDS: Array<{ en: string; ar: string; cityKey: string; photo: PhotoKey }> = [
  { en: 'Al Waha Auto Workshop', ar: 'ورشة الواحة للسيارات', cityKey: 'manama', photo: 'autoService' },
  { en: 'Riffa Mechanical Services', ar: 'خدمات الرفاع الميكانيكية', cityKey: 'riffa', photo: 'mechanicEngine' },
  { en: 'Muharraq Motors Garage', ar: 'جراج المحرق للسيارات', cityKey: 'muharraq', photo: 'garageInterior' },
  { en: 'Isa Town Auto Repair', ar: 'إصلاح السيارات بمدينة عيسى', cityKey: 'isa', photo: 'workshopArtdeco' },
  { en: 'Hamad Engine Specialists', ar: 'متخصصو المحركات بمدينة حمد', cityKey: 'hamad', photo: 'mechanicEngine' },
  { en: 'Sitra Transmission Centre', ar: 'مركز سترة للجير', cityKey: 'sitrah', photo: 'garageInterior' },
  { en: 'Manama German Auto Care', ar: 'المنامة للعناية بالسيارات الألمانية', cityKey: 'manama', photo: 'garageBrastad' },
  { en: 'Coastal Body and Paint', ar: 'الساحل للهيكل والدهان', cityKey: 'muharraq', photo: 'workshopArtdeco' },
  { en: 'Precision Suspension Works', ar: 'أعمال التعليق الدقيقة', cityKey: 'riffa', photo: 'garageInterior' },
  { en: 'Advanced Auto Electrical', ar: 'الكهرباء المتقدمة للسيارات', cityKey: 'isa', photo: 'evCharging' },
];

const RECOVERY_SEEDS: Array<{ en: string; ar: string; cityKey: string; photo: PhotoKey }> = [
  { en: 'ORYX Rapid Recovery', ar: 'أوريكس للسحب السريع', cityKey: 'manama', photo: 'recoveryTow' },
  { en: 'Gulf Towing Services', ar: 'الخليج لخدمات السحب', cityKey: 'riffa', photo: 'recoveryTow' },
  { en: '24/7 Bahrain Breakdown', ar: 'البحرين للإنقاذ ٢٤ ساعة', cityKey: 'muharraq', photo: 'recoveryTow' },
  { en: 'Isa Town Recovery', ar: 'سحب مدينة عيسى', cityKey: 'isa', photo: 'recoveryTow' },
  { en: 'Highway Rescue Bahrain', ar: 'إنقاذ الطرق السريعة', cityKey: 'hamad', photo: 'recoveryTow' },
  { en: 'Sitra Flatbed Towing', ar: 'سحب سترة المسطح', cityKey: 'sitrah', photo: 'recoveryTow' },
  { en: 'Desert Recovery Unit', ar: 'وحدة إنقاذ الصحراء', cityKey: 'manama', photo: 'recoveryTow' },
  { en: 'Premier Roadside Assist', ar: 'بريمير للمساعدة على الطريق', cityKey: 'riffa', photo: 'recoveryTow' },
];

const INSPECTION_SERVICES: DemoService[] = [
  { nameEn: 'Periodic inspection', nameAr: 'الفحص الدوري', priceMinor: 12_000, durationMinutes: 45 },
  { nameEn: 'Pre-purchase inspection', nameAr: 'فحص ما قبل الشراء', priceMinor: 28_000, durationMinutes: 75 },
  { nameEn: 'Full diagnostic scan', nameAr: 'فحص تشخيصي شامل', priceMinor: 18_000, durationMinutes: 40 },
  { nameEn: 'Emissions test', nameAr: 'فحص الانبعاثات', priceMinor: 9_000, durationMinutes: 30 },
];

const MAINTENANCE_SERVICES: DemoService[] = [
  { nameEn: 'Oil and filter change', nameAr: 'تغيير الزيت والفلتر', priceMinor: 14_500, durationMinutes: 45 },
  { nameEn: 'Brake service', nameAr: 'صيانة الفرامل', priceMinor: 32_000, durationMinutes: 90 },
  { nameEn: 'Air conditioning service', nameAr: 'صيانة المكيف', priceMinor: 26_000, durationMinutes: 60 },
  { nameEn: 'Suspension repair', nameAr: 'إصلاح نظام التعليق', priceMinor: 68_000, durationMinutes: 180 },
  { nameEn: 'Full major service', nameAr: 'صيانة شاملة كبرى', priceMinor: 96_000, durationMinutes: 240 },
];

const RECOVERY_SERVICES: DemoService[] = [
  { nameEn: 'Local tow (under 15 km)', nameAr: 'سحب محلي (أقل من ١٥ كم)', priceMinor: 15_000, durationMinutes: 45 },
  { nameEn: 'Long distance tow', nameAr: 'سحب لمسافة بعيدة', priceMinor: 38_000, durationMinutes: 90 },
  { nameEn: 'Jump start', nameAr: 'تشغيل بطارية', priceMinor: 7_500, durationMinutes: 25 },
  { nameEn: 'Flat tyre change', nameAr: 'تغيير إطار مثقوب', priceMinor: 9_000, durationMinutes: 30 },
  { nameEn: 'Fuel delivery', nameAr: 'توصيل وقود', priceMinor: 8_000, durationMinutes: 35 },
];

const CATEGORY_FOR_KIND: Record<ProviderKind, CategoryKey> = {
  inspection: 'vehicle_inspection',
  maintenance: 'maintenance',
  recovery: 'recovery',
};

/** Local copy of the demo PRNG band helper, so this module stands alone. */
function seededBand(seed: number, index: number, min: number, max: number): number {
  const mixed = Math.imul(seed + index * 2654435761, 2246822519) >>> 0;
  const unit = ((mixed ^ (mixed >>> 13)) >>> 0) / 4294967296;
  return Math.floor(unit * (max - min + 1)) + min;
}

function buildProviders(): DemoProvider[] {
  const build = (
    seeds: Array<{ en: string; ar: string; cityKey: string; photo: PhotoKey }>,
    kind: ProviderKind,
    services: DemoService[],
    seedBase: number,
  ): DemoProvider[] =>
    seeds.map((seed, index) => ({
      id: `${kind}-${String(index + 1).padStart(2, '0')}`,
      kind,
      categoryKey: CATEGORY_FOR_KIND[kind],
      nameEn: seed.en,
      nameAr: seed.ar,
      cityKey: seed.cityKey,
      rating: Number((4 + seededBand(seedBase, index, 0, 9) / 10).toFixed(1)),
      reviewCount: seededBand(seedBase + 7, index, 24, 610),
      verified: index % 4 !== 2,
      photo: seed.photo,
      distanceKm: Number((0.6 + seededBand(seedBase + 3, index, 0, 104) / 10).toFixed(1)),
      services,
      opensAt: ['07:30', '08:00', '08:30'][index % 3] as string,
      closesAt: ['17:00', '18:00', '19:00', '20:00'][index % 4] as string,
      closedOn: index % 3 === 0 ? ['Friday'] : [],
      aboutEn:
        kind === 'inspection'
          ? 'Licensed inspection station with factory-trained technicians, calibrated test lanes and same-day written reports.'
          : kind === 'maintenance'
            ? 'Licensed repair workshop covering mechanical, electrical and bodywork repairs with genuine and approved parts.'
            : 'Licensed recovery operator with flatbed and wheel-lift trucks on call across Bahrain day and night.',
      aboutAr:
        kind === 'inspection'
          ? 'محطة فحص مرخصة بفنيين مدربين ومسارات فحص معايرة وتقارير مكتوبة في نفس اليوم.'
          : kind === 'maintenance'
            ? 'ورشة إصلاح مرخصة تغطي الإصلاحات الميكانيكية والكهربائية والهيكلية بقطع أصلية ومعتمدة.'
            : 'مشغل سحب مرخص بسطحات وشاحنات رفع عجلات جاهزة في جميع أنحاء البحرين ليلاً ونهاراً.',
      phone: `+973 17${seededBand(seedBase + 11, index, 10, 99)} ${seededBand(seedBase + 13, index, 1000, 9999)}`,
    }));

  return [
    ...build(INSPECTION_SEEDS, 'inspection', INSPECTION_SERVICES, 101),
    ...build(WORKSHOP_SEEDS, 'maintenance', MAINTENANCE_SERVICES, 211),
    ...build(RECOVERY_SEEDS, 'recovery', RECOVERY_SERVICES, 331),
  ];
}

export const DEMO_PROVIDERS: DemoProvider[] = buildProviders();

/** The demo recovery fleet, used by the tracking simulation. */
export const DEMO_FLEET = [
  { en: 'Flatbed 5T', ar: 'سطح ٥ طن', plate: 'TRK-4412' },
  { en: 'Wheel-lift tow', ar: 'سحب رفع عجلات', plate: 'TRK-7781' },
  { en: 'Flatbed 3T', ar: 'سطح ٣ طن', plate: 'TRK-2093' },
  { en: 'Heavy recovery 10T', ar: 'سحب ثقيل ١٠ طن', plate: 'TRK-6620' },
  { en: 'Flatbed 5T', ar: 'سطح ٥ طن', plate: 'TRK-1188' },
];

export const DEMO_DRIVERS = [
  { en: 'Saeed Ibrahim', ar: 'سعيد إبراهيم', phone: '+973 3555 1122' },
  { en: 'Hussain Ali', ar: 'حسين علي', phone: '+973 3666 2233' },
  { en: 'Rashid Khalifa', ar: 'راشد خليفة', phone: '+973 3777 3344' },
  { en: 'Mahmood Jassim', ar: 'محمود جاسم', phone: '+973 3888 4455' },
  { en: 'Abdulla Yousif', ar: 'عبدالله يوسف', phone: '+973 3999 5566' },
];

/** The reasons a customer can pick when requesting recovery. */
export const RECOVERY_ISSUES = [
  { key: 'battery', en: 'Battery is dead', ar: 'البطارية فارغة' },
  { key: 'tyre', en: 'Flat tyre', ar: 'إطار مثقوب' },
  { key: 'engine', en: 'Engine will not start', ar: 'المحرك لا يعمل' },
  { key: 'accident', en: 'Accident damage', ar: 'أضرار حادث' },
  { key: 'overheat', en: 'Engine overheating', ar: 'ارتفاع حرارة المحرك' },
  { key: 'locked', en: 'Keys locked inside', ar: 'المفاتيح داخل السيارة' },
];
