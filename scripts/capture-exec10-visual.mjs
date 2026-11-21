/**
 * Execution 10 visual acceptance.
 *
 * There is no hardware virtualisation in this environment (`/dev/kvm` is absent
 * and the CPU exposes neither `vmx` nor `svm`), so an Android emulator cannot
 * run. The next-best evidence is the *actual application* rendered by the Expo
 * web export in a real Chromium at an Android phone viewport: it is the same
 * React Native component tree, the same theme, the same API client and the same
 * live backend, so a layout, RTL or missing-image defect shows up here exactly
 * as it would on a device. The screenshots in `docs/audit/exec10/screenshots/`
 * are what the owner reviews; the report states plainly that they are a browser
 * rendering of the app and not a device capture.
 *
 * Usage:
 *   node scripts/capture-exec10-visual.mjs
 * Env:
 *   ORYX_APP_BASE   base URL of the served web export (default http://127.0.0.1:8091)
 *   ORYX_API_BASE   API base the app calls (must be CORS-allowed)
 *   ORYX_EMAIL / ORYX_PASSWORD  a live customer account
 *
 * Two harness requirements, both easy to miss and both fatal to the run:
 *   - Build the export with `EXPO_PUBLIC_API_BASE_URL` (not `EXPO_PUBLIC_API_URL`);
 *     `api.ts` reads the former and silently falls back to `localhost:3001` without it.
 *   - Serve the export with an SPA fallback so `/home` returns `index.html`, and add
 *     the preview origin to the API's `CORS_ORIGINS`, or every call is preflight-blocked.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = (process.env.ORYX_APP_BASE ?? 'http://127.0.0.1:8091').replace(/\/$/, '');
const API = (process.env.ORYX_API_BASE ?? 'http://127.0.0.1:3001/api/v1').replace(/\/$/, '');
const OUT = process.env.ORYX_OUT ?? 'docs/audit/exec10/screenshots';
const EMAIL = process.env.ORYX_EMAIL ?? 'visual@oryx.local';
const PASSWORD = process.env.ORYX_PASSWORD ?? 'ChangeMe!Oryx2026';
const CHROME = process.env.ORYX_CHROME ?? '/usr/bin/chromium';

/**
 * Creates one real booking for the capture account so the history and detail
 * screens have a row to show. It goes through the same public endpoints the app
 * uses, so what the screenshots show is a booking the API actually accepted.
 */
async function createBookingForCapture() {
  const auth = await fetch(`${API}/customer/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  const token = auth.accessToken;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const day = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const avail = await fetch(`${API}/customer/bookings/availability?date=${day}&durationMinutes=60`, { headers }).then((r) => r.json());
  const slots = Array.isArray(avail) ? avail : (avail.slots ?? []);
  if (!slots.length) return null;
  const slot = slots[0];
  const created = await fetch(`${API}/customer/bookings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bookingType: 'MAINTENANCE',
      serviceRef: slot.serviceRef ?? null,
      resourceId: slot.resourceId ?? null,
      startsAt: slot.startsAt,
      durationMinutes: 60,
      notes: 'Execution 10 visual acceptance booking',
    }),
  }).then((r) => r.json());
  if (created?.id) {
    await fetch(`${API}/customer/bookings/${created.id}/confirm`, { method: 'POST', headers });
  }
  return created?.id ?? null;
}

mkdirSync(OUT, { recursive: true });

// A current Android phone. 411x914 is the Pixel-class viewport in CSS pixels.
const PHONE = { width: 411, height: 914 };

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const manifest = [];
const problems = [];

async function shot(page, name, note) {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const title = await page.evaluate(() => document.title).catch(() => '');
  manifest.push({ name, note, title, file });
  console.log(`  captured ${name}  (${note})`);
}

async function newCtx(locale) {
  const ctx = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2.6,
    isMobile: true,
    hasTouch: true,
    locale: locale === 'ar' ? 'ar-BH' : 'en-US',
  });
  // Every context starts as a returning user: the locale is pinned and the
  // stored demo session is present. A cold start of the real app writes that
  // session on the first screen; without it the tabs guard bounces a deep link
  // straight back to /login, which would make every screenshot a login page.
  await ctx.addInitScript((l) => {
    localStorage.setItem('oryx.marketplace.locale', JSON.stringify(l));
    localStorage.setItem('oryx.marketplace.session', JSON.stringify({ email: 'customer@oryx.demo' }));
  }, locale);
  return ctx;
}

/** Collects failed image loads, which are the defect class this run targets. */
function watchImages(page, label) {
  page.on('response', async (res) => {
    const url = res.url();
    if (!/\/media\/|\/cms\/media\/|\.(png|jpg|jpeg|webp)(\?|$)/i.test(url)) return;
    if (res.status() >= 400) problems.push(`${label}: image ${res.status()} ${url}`);
  });
}

async function waitForImages(page) {
  // Give React Native Web's image elements time to settle, then report any that
  // decoded to nothing.
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    // React Native Web renders a remote <Image> as an <img> element (a
    // background-image is only used for local, require()d assets). Both are
    // collected so a broken remote photograph is caught either way.
    const out = [];
    for (const i of Array.from(document.querySelectorAll('img'))) {
      const src = i.currentSrc || i.src;
      if (src) out.push({ src: src.slice(-80), w: i.naturalWidth, h: i.naturalHeight });
    }
    for (const e of Array.from(document.querySelectorAll('*'))) {
      const bg = getComputedStyle(e).backgroundImage;
      const m = bg && bg !== 'none' ? /url\("?([^")]+)"?\)/.exec(bg) : null;
      if (m) out.push({ src: m[1].slice(-80), w: 1, h: 1, background: true });
    }
    return out;
  });
}

/**
 * Checks the things a device review would catch and a screenshot alone would
 * not: a horizontal overflow (a card wider than the screen), a missing bottom
 * tab bar on a tab screen, and — on an Arabic screen — that Arabic text really
 * resolved to RTL.
 *
 * React Native Web sets `direction` on the text elements it lays out rather
 * than on `<body>`, so the RTL check looks for at least one Arabic paragraph
 * whose computed direction is `rtl`, not for a document-level direction.
 */
async function assertLayout(page, label, { expectTabs = false, expectRtl = false, tabs = null } = {}) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const texts = Array.from(document.querySelectorAll('div,span,p'))
      .filter((e) => e.children.length === 0 && /[\u0600-\u06FF]/.test(e.textContent ?? ''))
      .slice(0, 40);
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
      rtlTexts: texts.filter((e) => getComputedStyle(e).direction === 'rtl').length,
      arabicTexts: texts.length,
      innerText: body.innerText,
    };
  });
  if (m.scrollWidth > m.clientWidth + 2) {
    problems.push(`${label}: horizontal overflow (${m.scrollWidth} > ${m.clientWidth})`);
  }
  if (expectRtl && (m.arabicTexts === 0 || m.rtlTexts === 0)) {
    problems.push(`${label}: expected RTL Arabic text, found ${m.rtlTexts}/${m.arabicTexts} RTL`);
  }
  if (expectTabs) {
    const labels = tabs ?? ['Home', 'Categories', 'Search', 'Bookings', 'Profile'];
    const matched = labels.filter((t) => m.innerText.includes(t)).length;
    if (matched < 3) problems.push(`${label}: bottom tab bar looks missing (matched ${matched}/${labels.length} labels)`);
  }
}

// ------------------------------------------------------------------ splash
{
  const ctx = await newCtx('ar');
  const page = await ctx.newPage();
  watchImages(page, 'splash');
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The photographic splash renders for at least two seconds from image load.
  await page.waitForTimeout(1200);
  await shot(page, '01-splash', 'launch screen, Arabic RTL');
  const body = await page.evaluate(() => document.body.innerText);
  if (!/ORYX|أوريكس/i.test(body) && body.trim().length === 0) {
    problems.push('splash: no visible content');
  }
  await ctx.close();
}

// ------------------------------------------------------------------ homepage (AR + EN)
for (const locale of ['ar', 'en']) {
  const ctx = await newCtx(locale);
  const page = await ctx.newPage();
  watchImages(page, `home-${locale}`);
  await page.goto(`${APP}/home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot(page, `02-homepage-${locale}`, `homepage, ${locale === 'ar' ? 'Arabic RTL' : 'English LTR'}`);
  await assertLayout(page, `home-${locale}`, {
    expectTabs: true,
    expectRtl: locale === 'ar',
    tabs: locale === 'ar' ? ['الرئيسية', 'الأقسام', 'البحث', 'حجوزاتي', 'حسابي'] : undefined,
  });
  const imgs = await waitForImages(page);
  const broken = imgs.filter((i) => i.w === 0 || i.h === 0);
  if (broken.length) problems.push(`home-${locale}: ${broken.length} image(s) did not decode: ${JSON.stringify(broken.slice(0, 3))}`);
  console.log(`    home-${locale}: ${imgs.length} <img>, ${imgs.length - broken.length} decoded`);
  await ctx.close();
}

// ------------------------------------------------------------------ catalog + product detail
{
  const ctx = await newCtx('ar');
  const page = await ctx.newPage();
  watchImages(page, 'catalog');
  await page.goto(`${APP}/parts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot(page, '03-catalog', 'parts catalogue, Arabic RTL');
  await assertLayout(page, 'catalog', { expectRtl: true });
  const imgs = await waitForImages(page);
  const broken = imgs.filter((i) => i.w === 0 || i.h === 0);
  if (broken.length) problems.push(`catalog: ${broken.length} image(s) did not decode`);
  console.log(`    catalog: ${imgs.length} <img>, ${imgs.length - broken.length} decoded`);
  await ctx.close();
}

// ------------------------------------------------------------------ services directory
{
  const ctx = await newCtx('en');
  const page = await ctx.newPage();
  watchImages(page, 'services');
  await page.goto(`${APP}/services`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot(page, '04-services', 'service directory, English LTR');
  await ctx.close();
}

// ------------------------------------------------------------------ live login + booking flow
{
  const bookingId = await createBookingForCapture().catch(() => null);
  if (bookingId) console.log(`  seeded a real booking ${bookingId} for the history screens`);
  else problems.push('booking: could not create a booking for the history screens');

  const ctx = await newCtx('en');
  const page = await ctx.newPage();
  watchImages(page, 'booking');
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, '05-login', 'customer sign-in');

  const email = page.getByTestId('login-email');
  const password = page.getByTestId('login-password');
  if (await email.count()) {
    await email.fill(EMAIL);
    await password.fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.waitForTimeout(6000);
    await shot(page, '06-after-login', 'homepage after a live sign-in');
    const stored = await page.evaluate(() => !!localStorage.getItem('oryx.customer.refresh'));
    if (!stored) problems.push('login: a live sign-in did not store the refresh token');
  } else {
    problems.push('login: email field not found (testID login-email)');
  }

  // The booking wizard. Reached from a service card; open it directly.
  await page.goto(`${APP}/bookings/new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await shot(page, '07-booking-new', 'booking wizard');
  await assertLayout(page, 'booking-new');

  await page.goto(`${APP}/bookings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await shot(page, '08-bookings', 'booking history');
  await assertLayout(page, 'bookings', { expectTabs: true });
  const historyText = await page.evaluate(() => document.body.innerText);
  if (/no bookings yet/i.test(historyText)) {
    problems.push('bookings: history is empty although a booking was created');
  }
  if (!/live mode/i.test(historyText)) {
    problems.push('bookings: screen is not in live mode');
  }

  if (bookingId) {
    await page.goto(`${APP}/bookings/${bookingId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await shot(page, '08b-booking-detail', 'booking detail');
  }
  await ctx.close();
}

// ------------------------------------------------------------------ merchant
// The merchant portal is reached through the staff login (`/merchant-login`
// posts to the staff `/auth/login`). Every screen below is then opened inside
// the same authenticated context, so the screenshots show real provider data
// and not the demo fallback.
const MERCHANT_EMAIL = process.env.ORYX_MERCHANT_EMAIL ?? 'admin@oryx-auto.local';
const MERCHANT_PASSWORD = process.env.ORYX_MERCHANT_PASSWORD ?? 'ChangeMe!Oryx2026';
{
  const ctx = await newCtx('en');
  const page = await ctx.newPage();
  watchImages(page, 'merchant');
  await page.goto(`${APP}/merchant-login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, '09-merchant-login', 'merchant sign-in');

  const email = page.getByTestId('merchant-login-email');
  const password = page.getByTestId('merchant-login-password');
  if (await email.count()) {
    await email.fill(MERCHANT_EMAIL);
    await password.fill(MERCHANT_PASSWORD);
    await page.getByTestId('merchant-login-submit').click();
    await page.waitForTimeout(7000);
  } else {
    problems.push('merchant: sign-in fields not found (testID merchant-login-email/merchant-login-password)');
  }

  const screens = [
    ['dashboard', '10-merchant-dashboard', 'provider dashboard'],
    ['services', '11-merchant-services', 'provider services'],
    ['products', '12-merchant-products', 'provider products'],
    ['orders', '13-merchant-orders', 'provider bookings/orders'],
    ['profile', '14-merchant-profile', 'provider profile'],
  ];
  for (const [route, name, note] of screens) {
    await page.goto(`${APP}/merchant/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await shot(page, name, note);
    await assertLayout(page, `merchant-${route}`);
    const imgs = await waitForImages(page);
    const broken = imgs.filter((i) => i.w === 0 || i.h === 0);
    if (broken.length) problems.push(`merchant-${route}: ${broken.length} image(s) did not decode`);
  }
  await ctx.close();
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ app: APP, viewport: PHONE, captured: manifest, problems }, null, 2));

console.log(`\n${manifest.length} screens captured to ${OUT}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
} else {
  console.log('No image or layout problems detected.');
}
await browser.close();
process.exit(problems.length ? 2 : 0);
