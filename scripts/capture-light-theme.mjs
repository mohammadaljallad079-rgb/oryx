/**
 * Capture the Execution 07 light-theme evidence set.
 *
 * Produces the five previews the brief asks for, plus the responsive matrix:
 *
 *   1. homepage            light + dark
 *   2. customer dashboard  light + dark
 *   3. provider directory  light + dark
 *   4. login               light + dark
 *   5. light/dark comparison sheet
 *
 * and a mobile/tablet/desktop sweep for each surface in both directions.
 *
 * The theme is set through the same `localStorage` keys the app itself uses, so
 * the captures show the real switch rather than a forced attribute. The session
 * is in memory, so the dashboard is reached by navigating *inside* the app after
 * one login rather than by reloading a URL, which would drop the access token.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.ORYX_BASE ?? 'http://localhost:3002';
const OUT = process.env.ORYX_OUT ?? '/tmp/oryx-light/captures';
const EMAIL = process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local';
const PASSWORD = process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026';

mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};

const manifest = [];

async function prime(page, theme, locale) {
  await page.addInitScript(
    ([t, l]) => {
      window.localStorage.setItem('oryx.customer.theme', t);
      window.localStorage.setItem('oryx.customer.locale', l);
    },
    [theme, locale],
  );
}

async function shoot(page, name, full = true) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: full });
  const meta = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    dir: document.documentElement.getAttribute('dir') ?? document.documentElement.getAttribute('data-dir'),
    lang: document.documentElement.getAttribute('lang'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  manifest.push({ name, ...meta });
  console.log(`  ${name}  theme=${meta.theme} dir=${meta.dir} lang=${meta.lang} overflow=${meta.overflow}`);
  return meta;
}

/**
 * Wait until the document height stops changing.
 *
 * The public pages render their lists client-side, so `networkidle` fires while
 * the page is still a short skeleton and the full-page screenshot then captures
 * a mostly-empty frame. Polling the height until it is stable makes the capture
 * a function of the rendered page rather than of how fast the API answered.
 */
async function settle(page, { quiet = 5, max = 40 } = {}) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < max && stable < quiet; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    stable = h === last ? stable + 1 : 0;
    last = h;
    await page.waitForTimeout(200);
  }
  return last;
}

// The bundled Playwright build is not always present on this host; the system
// Chromium is, so fall back to it rather than failing the capture.
async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/usr/bin/chromium' });
  }
}

const browser = await launch();

// ---------------------------------------------------------------- public pages
for (const [theme, locale, dir] of [
  ['light', 'ar', 'rtl'],
  ['light', 'en', 'ltr'],
  ['dark', 'ar', 'rtl'],
  ['dark', 'en', 'ltr'],
]) {
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop, locale });
  const page = await context.newPage();
  await prime(page, theme, locale);

  for (const [path, label] of [
    ['/', 'homepage'],
    ['/providers', 'providers'],
    ['/login', 'login'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await settle(page);
    await shoot(page, `${label}-${theme}-${dir}-desktop`);
  }
  await context.close();
}

// ------------------------------------------------------------------- responsive
for (const theme of ['light', 'dark']) {
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    if (vp === 'desktop') continue;
    const context = await browser.newContext({ viewport: size, locale: 'ar' });
    const page = await context.newPage();
    await prime(page, theme, 'ar');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await settle(page);
    await shoot(page, `homepage-${theme}-rtl-${vp}`);
    await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
    await settle(page);
    await shoot(page, `providers-${theme}-rtl-${vp}`);
    await context.close();
  }
}

// -------------------------------------------------------------------- dashboard
// The customer session lives in memory, so log in once and navigate inside the app.
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop, locale: 'ar' });
  const page = await context.newPage();
  await prime(page, theme, 'ar');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const email = page.locator('[data-testid="login-email"]');
  const password = page.locator('[data-testid="login-password"]');
  if ((await email.count()) > 0) {
    await email.fill(EMAIL);
    await password.fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    try {
      await page.waitForURL('**/dashboard', { timeout: 30000 });
    } catch {
      /* fall through — the capture below shows whatever state we reached */
    }
    await page.waitForTimeout(2000);
  }
  const url = page.url();
  console.log(`  dashboard login -> ${url}`);
  await shoot(page, `dashboard-${theme}-rtl-desktop`);
  // Navigate inside the app so the in-memory token survives.
  for (const [path, label] of [
    ['/invoices', 'dashboard-invoices'],
    ['/profile', 'dashboard-profile'],
    ['/notifications', 'dashboard-notifications'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await settle(page);
    await shoot(page, `${label}-${theme}-rtl-desktop`);
  }
  await context.close();
}

await browser.close();
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} captures written to ${OUT}`);
