/**
 * Execution 07 Phase E — the light-theme evidence set.
 *
 * Captures the five surfaces the owner asked to see in the corrected light
 * theme, in both languages, at desktop, tablet and handset widths:
 *
 *   1. homepage          — the customer site landing page
 *   2. customer dashboard — signed in as the demo consumer
 *   3. provider directory — the service directory
 *   4. login              — the customer sign-in page
 *   5. light vs dark      — the homepage in each theme, for a direct pair
 *
 * Every shot is taken from the live render, so the evidence is the product and
 * not a mock. The dark captures exist to prove the approved dark theme is
 * unchanged; the light captures are the deliverable.
 *
 * Run with: node .run/capture-phase-e-light.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const OUT = 'docs/audit/exec07/phase-e-light';
const CUSTOMER_USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const VIEWPORTS = {
  desktop: { width: 1440, height: 1024 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

// [name, path, locale, theme, viewport]
const SHOTS = [
  ['01-home-light-desktop-en', '/', 'en', 'light', 'desktop'],
  ['01-home-light-desktop-ar', '/', 'ar', 'light', 'desktop'],
  ['01-home-light-mobile-en', '/', 'en', 'light', 'mobile'],
  ['01-home-light-mobile-ar', '/', 'ar', 'light', 'mobile'],
  ['02-dashboard-light-desktop-en', '/dashboard', 'en', 'light', 'desktop'],
  ['02-dashboard-light-desktop-ar', '/dashboard', 'ar', 'light', 'desktop'],
  ['02-dashboard-light-tablet-en', '/dashboard', 'en', 'light', 'tablet'],
  ['02-dashboard-light-mobile-en', '/dashboard', 'en', 'light', 'mobile'],
  ['03-providers-light-desktop-en', '/providers', 'en', 'light', 'desktop'],
  ['03-providers-light-desktop-ar', '/providers', 'ar', 'light', 'desktop'],
  ['03-providers-light-tablet-ar', '/providers', 'ar', 'light', 'tablet'],
  ['03-providers-light-mobile-en', '/providers', 'en', 'light', 'mobile'],
  ['04-login-light-desktop-en', '/login', 'en', 'light', 'desktop'],
  ['04-login-light-desktop-ar', '/login', 'ar', 'light', 'desktop'],
  ['04-login-light-mobile-en', '/login', 'en', 'light', 'mobile'],
  ['04-login-light-mobile-ar', '/login', 'ar', 'light', 'mobile'],
  // The comparison pair: the same page and viewport, one per theme.
  ['05-compare-home-dark-desktop-en', '/', 'en', 'dark', 'desktop'],
  ['05-compare-home-light-desktop-en', '/', 'en', 'light', 'desktop'],
  ['05-compare-home-dark-mobile-ar', '/', 'ar', 'dark', 'mobile'],
  ['05-compare-home-light-mobile-ar', '/', 'ar', 'light', 'mobile'],
];

mkdirSync(OUT, { recursive: true });

async function signIn(page, creds) {
  await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
}

async function applyPrefs(page, locale, theme) {
  if (new URL(page.url()).origin === 'null') {
    await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate(
    ([l, t]) => {
      window.localStorage.setItem('oryx.customer.locale', l);
      window.localStorage.setItem('oryx.customer.theme', t);
    },
    [locale, theme],
  );
}

const browser = await chromium.launch();
const manifest = [];

for (const [name, path, locale, theme, viewportKey] of SHOTS) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewportKey] });
  const page = await ctx.newPage();
  const signedIn = path !== '/' && path !== '/login';
  if (signedIn) await signIn(page, CUSTOMER_USER);
  await applyPrefs(page, locale, theme);

  await page.goto(`${CUSTOMER}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });

  const resolved = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    dir: document.documentElement.getAttribute('dir'),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
    gold: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(),
  }));

  manifest.push({ name, path, locale, theme, viewport: viewportKey, file, resolved });
  console.log(
    `${name.padEnd(36)} ${path.padEnd(11)} ${locale} ${theme.padEnd(5)} ${viewportKey.padEnd(7)} ` +
      `bg=${resolved.bg} surface=${resolved.surface} text=${resolved.text} gold=${resolved.gold} dir=${resolved.dir}`,
  );
  await ctx.close();
}

writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${manifest.length} captures written to ${OUT}`);
await browser.close();
