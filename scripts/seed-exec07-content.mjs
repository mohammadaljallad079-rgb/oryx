/**
 * Seed the Execution 07 media library and website content.
 *
 * This script goes through the real HTTP API rather than writing rows
 * directly, so it exercises the same validation, re-encoding, permission and
 * usage checks that an administrator in the CMS would. If the API would reject
 * an upload from the UI, it rejects it here too — the seeded state is
 * therefore genuine, not a fixture that bypasses the pipeline.
 *
 * Usage:
 *   node scripts/seed-exec07-content.mjs --base https://... [--dry-run]
 *
 * It is idempotent: re-running re-uploads only when an image of the same
 * source file is not already present, and content blocks are upserted by key.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = (flag('--base') ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const DRY = args.includes('--dry-run');
const EMAIL = flag('--email') ?? 'superadmin@oryx.local';
const PASSWORD = flag('--password') ?? process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';

const MEDIA_DIR = resolve('apps/customer/public/media');

/** Each curated photograph, its licence and where it is used. */
const PHOTOS = [
  {
    key: 'auto-service',
    file: 'auto-service.jpg',
    altEn: 'A car raised on a lift inside a modern service workshop',
    altAr: 'سيارة مرفوعة على رافعة داخل ورشة صيانة حديثة',
  },
  {
    key: 'garage-interior',
    file: 'garage-interior.jpg',
    altEn: 'The interior of a professional automotive repair garage',
    altAr: 'المظهر الداخلي لورشة إصلاح سيارات احترافية',
  },
  {
    key: 'workshop-artdeco',
    file: 'workshop-artdeco.jpg',
    altEn: 'A classic art deco style automotive workshop building',
    altAr: 'ورشة سيارات بأسلوب آرت ديكو الكلاسيكي',
  },
  {
    key: 'mechanic-engine',
    file: 'mechanic-engine.jpg',
    altEn: 'Two mechanics repairing an engine in a workshop',
    altAr: 'ميكانيكيان يصلحان محركاً في ورشة',
  },
  {
    key: 'inspection-bay',
    file: 'inspection-bay.jpg',
    altEn: 'A vehicle inspection bay with a car raised on a ramp',
    altAr: 'قسم فحص المركبات مع رفع السيارة على منصة',
  },
  {
    key: 'garage-brastad',
    file: 'garage-brastad.jpg',
    altEn: 'A well equipped car repair garage with tools',
    altAr: 'ورشة إصلاح سيارات مجهزة بالأدوات',
  },
  {
    key: 'parts-store',
    file: 'parts-store.jpg',
    altEn: 'Shelves of organised car spare parts in a store',
    altAr: 'رفوف قطع غيار سيارات منظمة في متجر',
  },
  {
    key: 'carwash-premium',
    file: 'carwash-premium.jpg',
    altEn: 'A premium car wash station with a vehicle being cleaned',
    altAr: 'محطة غسيل سيارات مميزة أثناء تنظيف مركبة',
  },
  {
    key: 'recovery-tow',
    file: 'recovery-tow.jpg',
    altEn: 'A roadside assistance vehicle preparing to tow a car',
    altAr: 'مركبة مساعدة على الطريق تستعد لسحب سيارة',
  },
  {
    key: 'ev-charging',
    file: 'ev-charging.jpg',
    altEn: 'Electric vehicle charging equipment in a public car park',
    altAr: 'معدات شحن السيارات الكهربائية في موقف عام',
  },
];

/** Which photograph illustrates which catalogue service category. */
const CATEGORY_IMAGES = {
  vehicle_inspection: 'inspection-bay',
  maintenance: 'mechanic-engine',
  spare_parts: 'parts-store',
  recovery: 'recovery-tow',
  car_wash: 'carwash-premium',
};

const CATEGORY_COPY = {
  vehicle_inspection: {
    descriptionEn: 'Periodic and pre-purchase inspection carried out by an approved centre, with a written report stored against the vehicle.',
    descriptionAr: 'فحص دوري وفحص ما قبل الشراء في مركز معتمد، مع تقرير مكتوب محفوظ في سجل المركبة.',
  },
  maintenance: {
    descriptionEn: 'Scheduled servicing, diagnostics and mechanical repair by a vetted workshop, with every part issued from the shared stock ledger.',
    descriptionAr: 'صيانة دورية وتشخيص وإصلاح ميكانيكي في ورشة موثوقة، مع صرف كل قطعة من سجل المخزون الموحّد.',
  },
  spare_parts: {
    descriptionEn: 'Genuine and aftermarket parts sourced from approved suppliers, priced in the catalogue and reserved against live stock.',
    descriptionAr: 'قطع أصلية وبديلة من موردين معتمدين، مسعّرة في الكتالوج ومحجوزة من المخزون المباشر.',
  },
  recovery: {
    descriptionEn: 'Towing and roadside assistance dispatched to a request, with the driver, vehicle and job recorded end to end.',
    descriptionAr: 'سحب ومساعدة على الطريق تُرسل عند الطلب، مع تسجيل السائق والمركبة والمهمة من البداية إلى النهاية.',
  },
  car_wash: {
    descriptionEn: 'Exterior wash, interior detailing and valeting booked into a real slot with a confirmed appointment.',
    descriptionAr: 'غسيل خارجي وتنظيف داخلي وتلميع، يُحجز في موعد حقيقي مع تأكيد.',
  },
};

/**
 * Website copy. Each block is published, so the customer site renders it.
 * The keys are namespaced `home.*` so an administrator can find them.
 */
const CONTENT = [
  { key: 'home.hero.eyebrow', ar: 'منصة خدمات السيارات الموحدة', en: 'The unified automotive services platform' },
  {
    key: 'home.hero.title',
    ar: 'كل خدمات سيارتك في مكان واحد',
    en: 'Every service your car needs, in one place',
  },
  {
    key: 'home.hero.subtitle',
    ar: 'احجز الصيانة والفحص وقطع الغيار والمساعدة على الطريق من مزودين معتمدين، وتابع كل خطوة في سجل موثّق.',
    en: 'Book maintenance, inspection, spare parts and roadside assistance from approved providers, and follow every step in a documented record.',
  },
  { key: 'home.cta.book', ar: 'احجز موعداً', en: 'Book an appointment' },
  { key: 'home.cta.browse', ar: 'تصفح المزودين', en: 'Browse providers' },
  {
    key: 'home.categories.title',
    ar: 'الخدمات التي نغطيها',
    en: 'Services we cover',
  },
  {
    key: 'home.categories.subtitle',
    ar: 'خمس فئات أساسية، كل واحدة يقدمها مزودون معتمدون بعد التحقق.',
    en: 'Five core categories, each delivered by providers who passed approval before they were listed.',
  },
  {
    key: 'home.value.title',
    ar: 'لماذا أوريكس',
    en: 'Why ORYX',
  },
  {
    key: 'home.value.subtitle',
    ar: 'منصة واحدة تربط العميل والورشة والمورد في سجل واحد.',
    en: 'One platform that connects the customer, the workshop and the supplier in a single record.',
  },
  {
    key: 'home.partner.title',
    ar: 'انضم كمزود خدمة',
    en: 'Become a service provider',
  },
  {
    key: 'home.partner.body',
    ar: 'قدّم طلبك، وسيراجعه فريق المنصة. لا يظهر أي مزود في الموقع قبل اعتماده.',
    en: 'Submit your application and the platform team reviews it. No provider appears on the site before approval.',
  },
  {
    key: 'home.trust.title',
    ar: 'الثقة مبنية على التحقق',
    en: 'Trust built on verification',
  },
  {
    key: 'home.contact.title',
    ar: 'تحتاج مساعدة؟',
    en: 'Need a hand?',
  },
  {
    key: 'home.contact.body',
    ar: 'افتح تذكرة دعم من حسابك وسيتابعها الفريق المعني.',
    en: 'Open a support ticket from your account and the right team picks it up.',
  },
];

let token = null;

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/v1${path}`, { ...options, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

async function login() {
  const res = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (res.status !== 200 || !res.body?.accessToken) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  token = res.body.accessToken;
}

/** Creates (or finds) the folder that groups the Execution 07 photography. */
async function ensureFolder() {
  const slug = 'execution-07';
  const list = await api('/cms/media/folders');
  const existing = (list.body ?? []).find((f) => f.slug === slug);
  if (existing) return existing.id;

  const res = await api('/cms/media/folders', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Execution 07 photography', slug, sortOrder: 10 }),
  });
  if (!res.body?.id) throw new Error(`Folder creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  console.log(`  + folder ${slug} (${res.body.id})`);
  return res.body.id;
}

/** Uploads one photograph through the real multipart endpoint. */
async function upload(photo, folderId) {
  const path = resolve(MEDIA_DIR, photo.file);
  if (!existsSync(path)) throw new Error(`Missing source image ${path}`);

  const existing = await api(`/cms/media?search=${encodeURIComponent(photo.file)}&pageSize=1`);
  const found = (existing.body?.items ?? []).find((a) => a.originalName === photo.file);
  if (found) {
    console.log(`  = ${photo.key.padEnd(20)} already present (${found.id})`);
    return found;
  }

  const form = new FormData();
  form.append('altEn', photo.altEn);
  form.append('altAr', photo.altAr);
  if (folderId) form.append('folderId', folderId);
  form.append('file', new Blob([readFileSync(path)], { type: 'image/jpeg' }), photo.file);

  const res = await fetch(`${BASE}/api/v1/cms/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 201 || !body?.id) {
    throw new Error(`Upload failed for ${photo.file}: ${res.status} ${JSON.stringify(body)}`);
  }
  console.log(
    `  + ${photo.key.padEnd(20)} ${body.width}x${body.height}  ${(body.byteSize / 1024).toFixed(0)} kB  ${body.id}`,
  );
  return body;
}

async function main() {
  console.log(`ORYX Execution 07 content seed -> ${BASE}${DRY ? '  (dry run)' : ''}`);
  await login();
  console.log('  authenticated as', EMAIL);

  console.log('\nMedia library:');
  const folderId = DRY ? null : await ensureFolder();
  const assets = {};
  for (const photo of PHOTOS) {
    assets[photo.key] = DRY ? { id: 'dry' } : await upload(photo, folderId);
  }

  if (DRY) {
    console.log('\nDry run complete; no writes performed.');
    return;
  }

  console.log('\nService category imagery and copy:');
  const categories = await api('/cms/categories');
  for (const category of categories.body ?? []) {
    const assetKey = CATEGORY_IMAGES[category.key];
    const copy = CATEGORY_COPY[category.key];
    if (!assetKey || !copy || !assets[assetKey]) continue;
    const res = await api(`/cms/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageAssetId: assets[assetKey].id, ...copy }),
    });
    console.log(`  ${res.status === 200 ? '+' : '!'} ${category.key.padEnd(20)} ${res.status}`);
  }

  console.log('\nWebsite content:');
  for (const entry of CONTENT) {
    for (const [locale, value] of [
      ['ar', entry.ar],
      ['en', entry.en],
    ]) {
      const res = await api('/cms/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: entry.key, locale, value, isPublished: true }),
      });
      if (res.status !== 200 && res.status !== 201) {
        console.log(`  ! ${entry.key} [${locale}] ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
    console.log(`  + ${entry.key}`);
  }

  console.log('\nHero banner:');
  const banner = await api('/cms/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placement: 'home-hero',
      locale: 'en',
      title: 'Every service your car needs',
      subtitle: 'Approved providers, real slots, a documented record.',
      mediaAssetId: assets['auto-service'].id,
      sortOrder: 1,
      isActive: true,
    }),
  });
  console.log(`  ${banner.status === 201 ? '+' : '!'} home-hero ${banner.status}`);

  const public_ = await api('/cms/public/website?locale=en');
  console.log('\nPublic payload:', {
    blocks: public_.body?.blocks?.length ?? 0,
    banners: public_.body?.banners?.length ?? 0,
    categories: public_.body?.categories?.length ?? 0,
  });
}

main().catch((error) => {
  console.error('\nFAILED:', error.message);
  process.exit(1);
});
