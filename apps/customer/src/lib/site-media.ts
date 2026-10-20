/**
 * The website's bundled photography.
 *
 * Every photograph in `apps/customer/public/media` is listed here with the
 * service it actually shows, its alt text in both locales and its licence. The
 * site resolves an image in one order:
 *
 *   administrator's CMS photograph  ->  this bundled photograph  ->  vector motif
 *
 * so a category can never render an unrelated or empty image. The mapping was
 * audited so each picture matches the service it accompanies: a vehicle on a
 * lift illustrates inspection, a parts store illustrates spare parts, and so on.
 *
 * The bytes are committed and served from the site itself, so this works in a
 * normal deployment and in the static export alike. Licences and the required
 * attribution are recorded in `docs/audit/execution-07-media-licenses.json` and
 * surfaced to readers on the `/credits` page.
 */

export interface SitePhoto {
  /** Path under `public`, without the base path. */
  src: string;
  /** What the photograph shows, for screen readers and when it fails to load. */
  altEn: string;
  altAr: string;
  /** Short human-readable credit, shown on the credits page. */
  credit: string;
  /** Licence name, e.g. `CC0`, `CC BY 4.0`, `CC BY-SA 4.0`. */
  license: string;
  licenseUrl: string;
  /** Where the original came from. */
  sourceUrl: string;
}

/**
 * The approved photographs. Keys are stable identifiers used by the mapping
 * below and by the CMS seed; the file is `<key>.jpg` with optional `-sm` and
 * `-lg` responsive variants.
 */
export const SITE_PHOTOS: Record<string, SitePhoto> = {
  autoService: {
    src: '/media/auto-service.jpg',
    altEn: 'A car raised on a lift inside a modern service workshop',
    altAr: 'سيارة مرفوعة على رافعة داخل ورشة صيانة حديثة',
    credit: 'Sergej Majboroda via Poly Haven',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Auto_service_%E2%80%93_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg',
  },
  garageInterior: {
    src: '/media/garage-interior.jpg',
    altEn: 'The interior of a professional automotive repair garage',
    altAr: 'المظهر الداخلي لورشة إصلاح سيارات احترافية',
    credit: 'Greg Zaal via Poly Haven',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Garage_%E2%80%93_Panorama_(Greg_Zaal_via_Poly_Haven).jpg',
  },
  inspectionBay: {
    src: '/media/inspection-bay.jpg',
    altEn: 'A vehicle inspection bay with a car raised on a ramp',
    altAr: 'قسم فحص المركبات مع رفع السيارة على منصة',
    credit: 'Hullian111',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Queens_Road_125_Vehicle_Inspection_Bay.jpg',
  },
  mechanicEngine: {
    src: '/media/mechanic-engine.jpg',
    altEn: 'Two mechanics repairing an engine in a workshop',
    altAr: 'ميكانيكيان يصلحان محركاً في ورشة',
    credit: 'Kwamitsey',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Two_mechanic_working_on_a_car_engine.jpg',
  },
  partsStore: {
    src: '/media/parts-store.jpg',
    altEn: 'Shelves of organised car spare parts in a store',
    altAr: 'رفوف قطع غيار سيارات منظمة في متجر',
    credit: 'Visitor7',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Auto_Parts_Store.jpg',
  },
  recoveryTow: {
    src: '/media/recovery-tow.jpg',
    altEn: 'A roadside assistance vehicle preparing to tow a car',
    altAr: 'مركبة مساعدة على الطريق تستعد لسحب سيارة',
    credit: 'CEphoto, Uwe Aranas',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Naha_Okinawa_Japan_JAF-Towing-car-01.jpg',
  },
  carwashPremium: {
    src: '/media/carwash-premium.jpg',
    altEn: 'A premium car wash station with a vehicle being cleaned',
    altAr: 'محطة غسيل سيارات مميزة أثناء تنظيف مركبة',
    credit: 'Le Sharkoïste',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Premium_Car_Wash_-_La_Louvi%C3%A8re.jpg',
  },
  garageBrastad: {
    src: '/media/garage-brastad.jpg',
    altEn: 'A well equipped car repair garage with tools',
    altAr: 'ورشة إصلاح سيارات مجهزة بالأدوات',
    credit: 'W.carter',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Car_repair_garage_in_Brastad_-_cropped.jpg',
  },
  workshopArtDeco: {
    src: '/media/workshop-artdeco.jpg',
    altEn: 'A classic art deco style automotive workshop',
    altAr: 'ورشة سيارات بأسلوب آرت ديكو الكلاسيكي',
    credit: 'John K Thorne',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Art_Deco_Car_Workshop._Haynes_Ford,_Maidstone.jpg',
  },
  evCharging: {
    src: '/media/ev-charging.jpg',
    altEn: 'Electric vehicle charging equipment in a public car park',
    altAr: 'معدات شحن السيارات الكهربائية في موقف عام',
    credit: 'Steven Baltakatei Sandoval',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Electric_car_charging_station_equipment_2,_Vancouver,_WA,_March_2020.jpg',
  },
};

/**
 * Which photograph illustrates which catalogue category.
 *
 * The keys are `ServiceCategory.key` values. A category shows the photograph
 * that matches its service, so the tile cannot advertise the wrong work.
 */
export const CATEGORY_PHOTO_KEY: Record<string, keyof typeof SITE_PHOTOS> = {
  vehicle_inspection: 'inspectionBay',
  maintenance: 'mechanicEngine',
  spare_parts: 'partsStore',
  recovery: 'recoveryTow',
  car_wash: 'carwashPremium',
};

/** The homepage hero and the services page header. */
export const HERO_PHOTO_KEY: keyof typeof SITE_PHOTOS = 'autoService';

/** The bundled photograph for a category, if one is mapped. */
export function sitePhotoForCategory(categoryKey: string): SitePhoto | null {
  const key = CATEGORY_PHOTO_KEY[categoryKey];
  return key ? SITE_PHOTOS[key] : null;
}

export function sitePhoto(key: keyof typeof SITE_PHOTOS): SitePhoto {
  return SITE_PHOTOS[key];
}

/**
 * The `srcset` for a bundled photograph.
 *
 * Three widths are committed (`-sm` 800, default 1600, `-lg` up to 2400), so a
 * phone downloads a small file and a wide desktop a large one. Callers pair
 * this with a `sizes` attribute.
 */
export function sitePhotoSrcSet(photo: SitePhoto): string {
  const stem = photo.src.replace(/\.jpg$/, '');
  return [`${stem}-sm.jpg 800w`, `${stem}.jpg 1600w`, `${stem}-lg.jpg 2400w`].join(', ');
}

/** Every photograph, for the credits page. */
export function allSitePhotos(): SitePhoto[] {
  return Object.values(SITE_PHOTOS);
}
