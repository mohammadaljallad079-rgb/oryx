/**
 * ORYX public website content.
 *
 * This is the single source of truth for every editable block on the public
 * site: the brand palette, the hero slider, the trust strip, the homepage
 * section headings, the About page, the Contact details and the footer.
 *
 * The defaults here are the approved ORYX copy and palette. The database holds
 * a per-locale document that an administrator edits in the admin console; the
 * website reads that document and falls back to these defaults for anything it
 * does not override, so the site is never empty and a partial edit can never
 * blank a section.
 */

import type { Locale } from './tokens';

export interface BrandPalette {
  /** Primary navy, `#00162b`. */
  navy: string;
  /** Primary gold, `#d4af37`. */
  gold: string;
  /** Light ivory, `#f7f4ed`. */
  ivory: string;
  /** Lighter gold used at the start of primary gradients. */
  goldSoft: string;
  /** Deeper gold used at the end of hover gradients. */
  goldDeep: string;
}

export interface HeroSlideContent {
  image: string;
  altEn: string;
  altAr: string;
  headlineEn: string;
  headlineAr: string;
  descriptionEn: string;
  descriptionAr: string;
  ctaLabelEn: string;
  ctaLabelAr: string;
  ctaHref: string;
  secondaryLabelEn: string;
  secondaryLabelAr: string;
  secondaryHref: string;
}

export interface TrustItemContent {
  icon: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
}

export interface SectionHeadingContent {
  eyebrowEn: string;
  eyebrowAr: string;
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
}

export interface AboutBlockContent {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
}

export interface ContactSocialContent {
  instagram: string;
  facebook: string;
  twitter: string;
  youtube: string;
  linkedin: string;
}

export interface SiteContent {
  brand: {
    nameEn: string;
    nameAr: string;
    taglineEn: string;
    taglineAr: string;
  };
  palette: BrandPalette;
  hero: {
    slides: HeroSlideContent[];
  };
  trust: {
    items: TrustItemContent[];
  };
  sections: {
    services: SectionHeadingContent;
    categories: SectionHeadingContent;
    featured: SectionHeadingContent;
    offers: SectionHeadingContent;
    branches: SectionHeadingContent;
    cta: SectionHeadingContent;
  };
  about: {
    titleEn: string;
    titleAr: string;
    introEn: string;
    introAr: string;
    image: string;
    blocks: AboutBlockContent[];
    servicesTitleEn: string;
    servicesTitleAr: string;
  };
  contact: {
    titleEn: string;
    titleAr: string;
    subtitleEn: string;
    subtitleAr: string;
    phone: string;
    email: string;
    whatsapp: string;
    addressEn: string;
    addressAr: string;
    hoursEn: string;
    hoursAr: string;
    social: ContactSocialContent;
  };
  footer: {
    introEn: string;
    introAr: string;
  };
}

/** The approved ORYX palette, used whenever the database holds no override. */
export const DEFAULT_PALETTE: BrandPalette = {
  navy: '#00162b',
  gold: '#d4af37',
  ivory: '#f7f4ed',
  goldSoft: '#c9a24a',
  goldDeep: '#96761c',
};

export const DEFAULT_SITE_CONTENT: Record<Locale, SiteContent> = {
  ar: {
    brand: {
      nameEn: 'ORYX Auto Services',
      nameAr: 'أوريكس لخدمات السيارات',
      taglineEn: 'Automotive services, done right.',
      taglineAr: 'خدمات سيارات بمعايير احترافية.',
    },
    palette: DEFAULT_PALETTE,
    hero: {
      slides: [
        {
          image: '/media/hero-services.jpg',
          altEn: 'A modern automotive workshop',
          altAr: 'ورشة صيانة سيارات حديثة',
          headlineEn: 'Complete automotive services in one place',
          headlineAr: 'خدمات السيارات المتكاملة في مكان واحد',
          descriptionEn:
            'From maintenance and inspection to repair and genuine spare parts, we deliver a complete experience to professional standards.',
          descriptionAr:
            'من الصيانة والفحص إلى الإصلاح وقطع الغيار الأصلية، نقدم لك تجربة متكاملة بمعايير احترافية.',
          ctaLabelEn: 'Book your appointment',
          ctaLabelAr: 'احجز موعدك الآن',
          ctaHref: '/booking',
          secondaryLabelEn: 'Explore our services',
          secondaryLabelAr: 'اكتشف خدماتنا',
          secondaryHref: '/services',
        },
        {
          image: '/media/hero-maintenance.jpg',
          altEn: 'A mechanic working on a modern engine',
          altAr: 'فني يعمل على محرك سيارة حديثة',
          headlineEn: 'Professional care for your vehicle',
          headlineAr: 'عناية احترافية لسيارتك',
          descriptionEn:
            'A specialist team, modern equipment and maintenance work to the highest quality standards.',
          descriptionAr: 'فريق متخصص ومعدات حديثة وخدمات صيانة وفق أعلى معايير الجودة.',
          ctaLabelEn: 'Explore maintenance services',
          ctaLabelAr: 'استكشف خدمات الصيانة',
          ctaHref: '/services',
          secondaryLabelEn: 'Book your appointment',
          secondaryLabelAr: 'احجز موعدك الآن',
          secondaryHref: '/booking',
        },
        {
          image: '/media/hero-parts.jpg',
          altEn: 'Shelves of automotive spare parts',
          altAr: 'رفوف قطع غيار سيارات',
          headlineEn: 'Spare parts for your car, made easy',
          headlineAr: 'قطع غيار لسيارتك بكل سهولة',
          descriptionEn: 'Browse spare parts and search by vehicle, model and year of manufacture.',
          descriptionAr: 'اكتشف قطع الغيار وابحث حسب السيارة والموديل وسنة الصنع.',
          ctaLabelEn: 'Shop spare parts',
          ctaLabelAr: 'تسوق قطع الغيار',
          ctaHref: '/store',
          secondaryLabelEn: 'Current offers',
          secondaryLabelAr: 'العروض الحالية',
          secondaryHref: '/offers',
        },
        {
          image: '/media/hero-inspection.jpg',
          altEn: 'A vehicle inspection centre',
          altAr: 'مركز فحص سيارات',
          headlineEn: 'Inspect your vehicle with confidence',
          headlineAr: 'افحص سيارتك بثقة',
          descriptionEn:
            'Professional inspection services and clear reports that help you make the right decision.',
          descriptionAr: 'خدمات فحص احترافية وتقارير واضحة تساعدك على اتخاذ القرار الصحيح.',
          ctaLabelEn: 'Learn about inspection',
          ctaLabelAr: 'تعرف على خدمات الفحص',
          ctaHref: '/services/comprehensive_inspection',
          secondaryLabelEn: 'Book an inspection',
          secondaryLabelAr: 'احجز فحصاً',
          secondaryHref: '/booking',
        },
      ],
    },
    trust: {
      items: [
        {
          icon: '🛠',
          titleEn: 'Integrated services',
          titleAr: 'خدمات متكاملة',
          subtitleEn: 'Maintenance, repair and parts',
          subtitleAr: 'صيانة وإصلاح وقطع غيار',
        },
        {
          icon: '👨‍🔧',
          titleEn: 'Specialist technicians',
          titleAr: 'فنيون متخصصون',
          subtitleEn: 'Trained and certified',
          subtitleAr: 'مدربون ومعتمدون',
        },
        {
          icon: '⚙',
          titleEn: 'Trusted spare parts',
          titleAr: 'قطع غيار موثوقة',
          subtitleEn: 'Genuine and approved',
          subtitleAr: 'أصلية ومعتمدة',
        },
        {
          icon: '📅',
          titleEn: 'Easy online booking',
          titleAr: 'حجز إلكتروني سهل',
          subtitleEn: 'Real availability',
          subtitleAr: 'مواعيد فعلية متاحة',
        },
        {
          icon: '✓',
          titleEn: 'Quality and professionalism',
          titleAr: 'جودة واحترافية',
          subtitleEn: 'Standards you can trust',
          subtitleAr: 'معايير تثق بها',
        },
        {
          icon: '📋',
          titleEn: 'Service follow-up',
          titleAr: 'متابعة الخدمات',
          subtitleEn: 'Track every step',
          subtitleAr: 'تابع كل خطوة',
        },
      ],
    },
    sections: {
      services: {
        eyebrowEn: 'Why ORYX',
        eyebrowAr: 'لماذا أوريكس',
        titleEn: 'Our automotive services',
        titleAr: 'خدماتنا للسيارات',
        subtitleEn: 'Everything your vehicle needs, handled by specialists.',
        subtitleAr: 'كل ما تحتاجه سيارتك، على يد مختصين.',
      },
      categories: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Spare-parts categories',
        titleAr: 'أقسام قطع الغيار',
        subtitleEn: 'Browse parts by the category you need.',
        subtitleAr: 'تصفح القطع حسب القسم الذي تحتاجه.',
      },
      featured: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Featured parts',
        titleAr: 'قطع غيار مميزة',
        subtitleEn: 'Popular parts from our catalogue.',
        subtitleAr: 'قطع مختارة من متجرنا.',
      },
      offers: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Current offers',
        titleAr: 'العروض الحالية',
        subtitleEn: 'Discounts on parts and services.',
        subtitleAr: 'خصومات على القطع والخدمات.',
      },
      branches: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Our branches',
        titleAr: 'فروعنا',
        subtitleEn: 'Visit the branch nearest to you.',
        subtitleAr: 'زر الفرع الأقرب إليك.',
      },
      cta: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Book your appointment online',
        titleAr: 'احجز موعدك عبر الإنترنت',
        subtitleEn: 'Pick a service, a branch and a time that suits you.',
        subtitleAr: 'اختر الخدمة والفرع والوقت الذي يناسبك.',
      },
    },
    about: {
      titleEn: 'About ORYX',
      titleAr: 'عن أوريكس',
      introEn:
        'ORYX Auto Services delivers maintenance, repair, inspection and genuine spare parts to professional standards.',
      introAr:
        'أوريكس لخدمات السيارات تقدم الصيانة والإصلاح والفحص وقطع الغيار الأصلية وفق معايير احترافية.',
      image: '/media/about-workshop.jpg',
      blocks: [
        {
          titleEn: 'Our mission',
          titleAr: 'مهمتنا',
          bodyEn: 'To give every driver a reliable, transparent and professional automotive service.',
          bodyAr: 'أن نمنح كل سائق خدمة سيارات موثوقة وشفافة واحترافية.',
        },
        {
          titleEn: 'Our values',
          titleAr: 'قيمنا',
          bodyEn: 'Honesty, quality workmanship and respect for your time and your vehicle.',
          bodyAr: 'الأمانة وجودة العمل واحترام وقتك وسيارتك.',
        },
        {
          titleEn: 'Automotive expertise',
          titleAr: 'خبرتنا في السيارات',
          bodyEn: 'Specialist teams and modern equipment for mechanical, electrical and body work.',
          bodyAr: 'فرق متخصصة ومعدات حديثة للأعمال الميكانيكية والكهربائية والهيكل.',
        },
        {
          titleEn: 'Quality commitment',
          titleAr: 'التزامنا بالجودة',
          bodyEn: 'We use approved parts and follow manufacturer procedures on every job.',
          bodyAr: 'نستخدم قطعاً معتمدة ونتبع إجراءات الشركة المصنّعة في كل مهمة.',
        },
      ],
      servicesTitleEn: 'What we do',
      servicesTitleAr: 'ماذا نقدم',
    },
    contact: {
      titleEn: 'Contact us',
      titleAr: 'اتصل بنا',
      subtitleEn: 'Send us a message and our team will get back to you.',
      subtitleAr: 'أرسل لنا رسالة وسيتواصل معك فريقنا.',
      phone: '+973 1700 0000',
      email: 'info@oryx-auto.local',
      whatsapp: '',
      addressEn: 'Bahrain',
      addressAr: 'البحرين',
      hoursEn: 'Saturday–Thursday, 8:00–18:00',
      hoursAr: 'السبت–الخميس، 8:00–18:00',
      social: { instagram: '', facebook: '', twitter: '', youtube: '', linkedin: '' },
    },
    footer: {
      introEn:
        'ORYX Auto Services — maintenance, repair, inspection and genuine spare parts, to professional standards.',
      introAr:
        'أوريكس لخدمات السيارات — صيانة وإصلاح وفحص وقطع غيار أصلية بمعايير احترافية.',
    },
  },
  en: {
    brand: {
      nameEn: 'ORYX Auto Services',
      nameAr: 'أوريكس لخدمات السيارات',
      taglineEn: 'Automotive services, done right.',
      taglineAr: 'خدمات سيارات بمعايير احترافية.',
    },
    palette: DEFAULT_PALETTE,
    hero: {
      slides: [
        {
          image: '/media/hero-services.jpg',
          altEn: 'A modern automotive workshop',
          altAr: 'ورشة صيانة سيارات حديثة',
          headlineEn: 'Complete automotive services in one place',
          headlineAr: 'خدمات السيارات المتكاملة في مكان واحد',
          descriptionEn:
            'From maintenance and inspection to repair and genuine spare parts, we deliver a complete experience to professional standards.',
          descriptionAr:
            'من الصيانة والفحص إلى الإصلاح وقطع الغيار الأصلية، نقدم لك تجربة متكاملة بمعايير احترافية.',
          ctaLabelEn: 'Book your appointment',
          ctaLabelAr: 'احجز موعدك الآن',
          ctaHref: '/booking',
          secondaryLabelEn: 'Explore our services',
          secondaryLabelAr: 'اكتشف خدماتنا',
          secondaryHref: '/services',
        },
        {
          image: '/media/hero-maintenance.jpg',
          altEn: 'A mechanic working on a modern engine',
          altAr: 'فني يعمل على محرك سيارة حديثة',
          headlineEn: 'Professional care for your vehicle',
          headlineAr: 'عناية احترافية لسيارتك',
          descriptionEn:
            'A specialist team, modern equipment and maintenance work to the highest quality standards.',
          descriptionAr: 'فريق متخصص ومعدات حديثة وخدمات صيانة وفق أعلى معايير الجودة.',
          ctaLabelEn: 'Explore maintenance services',
          ctaLabelAr: 'استكشف خدمات الصيانة',
          ctaHref: '/services',
          secondaryLabelEn: 'Book your appointment',
          secondaryLabelAr: 'احجز موعدك الآن',
          secondaryHref: '/booking',
        },
        {
          image: '/media/hero-parts.jpg',
          altEn: 'Shelves of automotive spare parts',
          altAr: 'رفوف قطع غيار سيارات',
          headlineEn: 'Spare parts for your car, made easy',
          headlineAr: 'قطع غيار لسيارتك بكل سهولة',
          descriptionEn: 'Browse spare parts and search by vehicle, model and year of manufacture.',
          descriptionAr: 'اكتشف قطع الغيار وابحث حسب السيارة والموديل وسنة الصنع.',
          ctaLabelEn: 'Shop spare parts',
          ctaLabelAr: 'تسوق قطع الغيار',
          ctaHref: '/store',
          secondaryLabelEn: 'Current offers',
          secondaryLabelAr: 'العروض الحالية',
          secondaryHref: '/offers',
        },
        {
          image: '/media/hero-inspection.jpg',
          altEn: 'A vehicle inspection centre',
          altAr: 'مركز فحص سيارات',
          headlineEn: 'Inspect your vehicle with confidence',
          headlineAr: 'افحص سيارتك بثقة',
          descriptionEn:
            'Professional inspection services and clear reports that help you make the right decision.',
          descriptionAr: 'خدمات فحص احترافية وتقارير واضحة تساعدك على اتخاذ القرار الصحيح.',
          ctaLabelEn: 'Learn about inspection',
          ctaLabelAr: 'تعرف على خدمات الفحص',
          ctaHref: '/services/comprehensive_inspection',
          secondaryLabelEn: 'Book an inspection',
          secondaryLabelAr: 'احجز فحصاً',
          secondaryHref: '/booking',
        },
      ],
    },
    trust: {
      items: [
        {
          icon: '🛠',
          titleEn: 'Integrated services',
          titleAr: 'خدمات متكاملة',
          subtitleEn: 'Maintenance, repair and parts',
          subtitleAr: 'صيانة وإصلاح وقطع غيار',
        },
        {
          icon: '👨‍🔧',
          titleEn: 'Specialist technicians',
          titleAr: 'فنيون متخصصون',
          subtitleEn: 'Trained and certified',
          subtitleAr: 'مدربون ومعتمدون',
        },
        {
          icon: '⚙',
          titleEn: 'Trusted spare parts',
          titleAr: 'قطع غيار موثوقة',
          subtitleEn: 'Genuine and approved',
          subtitleAr: 'أصلية ومعتمدة',
        },
        {
          icon: '📅',
          titleEn: 'Easy online booking',
          titleAr: 'حجز إلكتروني سهل',
          subtitleEn: 'Real availability',
          subtitleAr: 'مواعيد فعلية متاحة',
        },
        {
          icon: '✓',
          titleEn: 'Quality and professionalism',
          titleAr: 'جودة واحترافية',
          subtitleEn: 'Standards you can trust',
          subtitleAr: 'معايير تثق بها',
        },
        {
          icon: '📋',
          titleEn: 'Service follow-up',
          titleAr: 'متابعة الخدمات',
          subtitleEn: 'Track every step',
          subtitleAr: 'تابع كل خطوة',
        },
      ],
    },
    sections: {
      services: {
        eyebrowEn: 'Why ORYX',
        eyebrowAr: 'لماذا أوريكس',
        titleEn: 'Our automotive services',
        titleAr: 'خدماتنا للسيارات',
        subtitleEn: 'Everything your vehicle needs, handled by specialists.',
        subtitleAr: 'كل ما تحتاجه سيارتك، على يد مختصين.',
      },
      categories: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Spare-parts categories',
        titleAr: 'أقسام قطع الغيار',
        subtitleEn: 'Browse parts by the category you need.',
        subtitleAr: 'تصفح القطع حسب القسم الذي تحتاجه.',
      },
      featured: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Featured parts',
        titleAr: 'قطع غيار مميزة',
        subtitleEn: 'Popular parts from our catalogue.',
        subtitleAr: 'قطع مختارة من متجرنا.',
      },
      offers: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Current offers',
        titleAr: 'العروض الحالية',
        subtitleEn: 'Discounts on parts and services.',
        subtitleAr: 'خصومات على القطع والخدمات.',
      },
      branches: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Our branches',
        titleAr: 'فروعنا',
        subtitleEn: 'Visit the branch nearest to you.',
        subtitleAr: 'زر الفرع الأقرب إليك.',
      },
      cta: {
        eyebrowEn: '',
        eyebrowAr: '',
        titleEn: 'Book your appointment online',
        titleAr: 'احجز موعدك عبر الإنترنت',
        subtitleEn: 'Pick a service, a branch and a time that suits you.',
        subtitleAr: 'اختر الخدمة والفرع والوقت الذي يناسبك.',
      },
    },
    about: {
      titleEn: 'About ORYX',
      titleAr: 'عن أوريكس',
      introEn:
        'ORYX Auto Services delivers maintenance, repair, inspection and genuine spare parts to professional standards.',
      introAr:
        'أوريكس لخدمات السيارات تقدم الصيانة والإصلاح والفحص وقطع الغيار الأصلية وفق معايير احترافية.',
      image: '/media/about-workshop.jpg',
      blocks: [
        {
          titleEn: 'Our mission',
          titleAr: 'مهمتنا',
          bodyEn: 'To give every driver a reliable, transparent and professional automotive service.',
          bodyAr: 'أن نمنح كل سائق خدمة سيارات موثوقة وشفافة واحترافية.',
        },
        {
          titleEn: 'Our values',
          titleAr: 'قيمنا',
          bodyEn: 'Honesty, quality workmanship and respect for your time and your vehicle.',
          bodyAr: 'الأمانة وجودة العمل واحترام وقتك وسيارتك.',
        },
        {
          titleEn: 'Automotive expertise',
          titleAr: 'خبرتنا في السيارات',
          bodyEn: 'Specialist teams and modern equipment for mechanical, electrical and body work.',
          bodyAr: 'فرق متخصصة ومعدات حديثة للأعمال الميكانيكية والكهربائية والهيكل.',
        },
        {
          titleEn: 'Quality commitment',
          titleAr: 'التزامنا بالجودة',
          bodyEn: 'We use approved parts and follow manufacturer procedures on every job.',
          bodyAr: 'نستخدم قطعاً معتمدة ونتبع إجراءات الشركة المصنّعة في كل مهمة.',
        },
      ],
      servicesTitleEn: 'What we do',
      servicesTitleAr: 'ماذا نقدم',
    },
    contact: {
      titleEn: 'Contact us',
      titleAr: 'اتصل بنا',
      subtitleEn: 'Send us a message and our team will get back to you.',
      subtitleAr: 'أرسل لنا رسالة وسيتواصل معك فريقنا.',
      phone: '+973 1700 0000',
      email: 'info@oryx-auto.local',
      whatsapp: '',
      addressEn: 'Bahrain',
      addressAr: 'البحرين',
      hoursEn: 'Saturday–Thursday, 8:00–18:00',
      hoursAr: 'السبت–الخميس، 8:00–18:00',
      social: { instagram: '', facebook: '', twitter: '', youtube: '', linkedin: '' },
    },
    footer: {
      introEn:
        'ORYX Auto Services — maintenance, repair, inspection and genuine spare parts, to professional standards.',
      introAr:
        'أوريكس لخدمات السيارات — صيانة وإصلاح وفحص وقطع غيار أصلية بمعايير احترافية.',
    },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge an edited document over a default.
 *
 * Objects merge key by key, arrays (the hero slides, the trust items, the About
 * blocks) are taken whole when present so an administrator can add, remove or
 * reorder them, and a missing key keeps the default. This is what lets a
 * partial or older stored document still render a complete page.
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base)) return (Array.isArray(override) ? override : base) as T;
  if (isPlainObject(base)) {
    if (!isPlainObject(override)) return base;
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = key in (base as Record<string, unknown>)
        ? deepMerge((base as Record<string, unknown>)[key], value)
        : value;
    }
    return out as T;
  }
  return (override as T) ?? base;
}

/** Merge a stored (possibly partial) document over the approved defaults. */
export function resolveSiteContent(locale: Locale, stored: unknown): SiteContent {
  const base = DEFAULT_SITE_CONTENT[locale] ?? DEFAULT_SITE_CONTENT.ar;
  return deepMerge(base, stored);
}

/** Resolve both locales from a map of stored documents. */
export function resolveSiteContentPair(
  stored: Partial<Record<Locale, unknown>>,
): Record<Locale, SiteContent> {
  return {
    ar: resolveSiteContent('ar', stored.ar),
    en: resolveSiteContent('en', stored.en),
  };
}

/** A stored document plus its identity, as returned by the admin API. */
export interface SiteContentDto {
  id: string;
  key: string;
  locale: Locale;
  data: SiteContent;
  updatedAt: string;
}
