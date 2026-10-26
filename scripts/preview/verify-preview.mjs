/**
 * Renders the built preview in a browser and fails on anything a visitor would
 * see as broken.
 *
 * This is the check that stops the published URL regressing to an evidence
 * gallery: it loads the real website pages under the repository sub-path, in
 * both directions and both themes, and asserts that each one renders, loads
 * every image, logs no error and does not overflow horizontally.
 *
 * Run: PREVIEW_BASE=http://127.0.0.1:8099 node scripts/preview/verify-preview.mjs
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8099';
const SITE = process.env.ORYX_BASE_PATH || '/oryx';
const SHOTS = process.env.PREVIEW_SHOTS || '/tmp/preview-shots';

/** The website surfaces the owner asked to see, plus the document pages. */
const pages = [
  ['home', `${SITE}/`, 'desktop'],
  ['dashboard', `${SITE}/dashboard/`, 'desktop'],
  ['providers', `${SITE}/providers/`, 'desktop'],
  ['login', `${SITE}/login/`, 'desktop'],
  ['services', `${SITE}/services/`, 'desktop'],
  ['garage', `${SITE}/garage/`, 'desktop'],
  ['bookings', `${SITE}/bookings/`, 'desktop'],
  ['profile', `${SITE}/profile/`, 'desktop'],
  ['invoices', `${SITE}/invoices/`, 'desktop'],
  ['notifications', `${SITE}/notifications/`, 'desktop'],
  ['support', `${SITE}/support/`, 'desktop'],
  ['provider-detail', `${SITE}/providers/city-auto-care/`, 'desktop'],
  ['register', `${SITE}/register/`, 'desktop'],
  ['provider-apply', `${SITE}/providers/apply/`, 'desktop'],
  ['home-tablet', `${SITE}/`, 'tablet'],
  ['home-mobile', `${SITE}/`, 'mobile'],
  ['providers-mobile', `${SITE}/providers/`, 'mobile'],
  ['overview', '/overview/', 'desktop'],
  ['mobile', '/mobile/', 'desktop'],
  ['evidence', '/evidence/', 'desktop'],
  ['reports', '/reports/', 'desktop'],
  ['brand', '/brand/', 'desktop'],
  ['report-phasee', '/reports/04phaseelighttheme.html', 'desktop'],
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

/**
 * The website reads its theme and locale from `localStorage`, not from the
 * system preference, so a `colorScheme` context option would not change it.
 * Seeding the two keys before the document runs is what actually renders the
 * dark theme and the English direction — and it is the same path a visitor's
 * saved preference takes, so the check exercises real behaviour.
 */
async function seedPreference(ctx, theme, locale) {
  await ctx.addInitScript(
    ([t, l]) => {
      try {
        window.localStorage.setItem('oryx.customer.theme', t);
        window.localStorage.setItem('oryx.customer.locale', l);
      } catch {
        /* a storage-less context simply keeps the defaults */
      }
    },
    [theme, locale],
  );
}

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const issues = [];
let checked = 0;

for (const [name, url, kind] of pages) {
  // The website is checked in both themes and both directions; the document
  // pages only follow the system preference.
  const isSite = url.startsWith(SITE);
  const variants = isSite
    ? [
        ['ar', 'light'],
        ['ar', 'dark'],
        ['en', 'light'],
      ]
    : [
        ['en', 'light'],
        ['en', 'dark'],
      ];

  for (const [locale, theme] of variants) {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS[kind],
      deviceScaleFactor: 1,
      colorScheme: theme,
    });
    if (isSite) await seedPreference(ctx, theme, locale);

    const page = await ctx.newPage();
    const errors = [];
    const bad = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (r) => {
      if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    // The preview must not call the API: there is no API on a static host, and
    // a failed call is what a visitor would see as a broken page.
    page.on('requestfailed', (r) => bad.push(`FAILED ${r.url()}`));

    const response = await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const broken = await page.evaluate(() =>
      Array.from(document.images)
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.currentSrc || i.src),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const imgs = await page.evaluate(() => document.images.length);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    const h1 = await page
      .locator('h1')
      .first()
      .innerText()
      .catch(() => '(none)');

    // Keep one screenshot per site variant; the document pages are shot once.
    if (isSite || theme === 'light') {
      await page.screenshot({
        path: `${SHOTS}/${name}-${kind}-${locale}-${theme}.png`,
        fullPage: false,
      });
    }

    checked += 1;
    const label = `${name}-${kind}-${locale}-${theme}`;
    const status = response?.status() ?? 0;
    console.log(
      `${label.padEnd(30)} ${String(status).padStart(3)} dir=${dir ?? '-'} h1="${h1.slice(0, 28)}" ` +
        `imgs=${String(imgs).padStart(3)} overflow=${String(overflow).padStart(3)}px broken=${broken.length} ` +
        `errors=${errors.length} bad=${bad.length} bg=${bodyBg}`,
    );
    if (status >= 400) issues.push([label, `status ${status}`]);
    if (broken.length) {
      console.log('   broken:', broken.slice(0, 4));
      issues.push([label, 'broken images']);
    }
    if (errors.length) {
      console.log('   errors:', errors.slice(0, 3));
      issues.push([label, 'console errors']);
    }
    if (bad.length) {
      console.log('   bad:', bad.slice(0, 4));
      issues.push([label, 'http errors']);
    }
    if (overflow > 2) issues.push([label, `overflow ${overflow}px`]);
    if (isSite && dir !== (locale === 'ar' ? 'rtl' : 'ltr')) {
      issues.push([label, `direction ${dir} for ${locale}`]);
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\nrendered ${checked} page/theme combinations`);
console.log('issues:', issues.length ? issues : 'none');
process.exitCode = issues.length ? 1 : 0;

