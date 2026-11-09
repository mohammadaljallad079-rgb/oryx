/**
 * Capture the Execution 09 visual evidence: the homepage, the customer
 * dashboard, the provider directory and the login page in the light theme,
 * plus a light/dark comparison of the homepage.
 *
 * Each surface is shot at desktop, tablet and mobile in both directions so the
 * evidence covers Arabic RTL and English LTR. Output lands in
 * docs/audit/exec09/screenshots/ and a manifest is written next to it.
 *
 * Usage:
 *   ORYX_BASE=https://www.example.com ORYX_INSECURE=1 node scripts/capture-exec09-light.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.ORYX_BASE ?? 'http://127.0.0.1:3002';
const OUT = process.env.ORYX_OUT ?? 'docs/audit/exec09/screenshots';
const INSECURE = process.env.ORYX_INSECURE === '1';
const EMAIL = process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local';
const PASSWORD = process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
};

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const manifest = [];

async function newPage({ theme, locale, viewport }) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    ignoreHTTPSErrors: INSECURE,
    locale,
  });
  await ctx.addInitScript(
    ([t, l]) => {
      try {
        window.localStorage.setItem('oryx.customer.theme', t);
        window.localStorage.setItem('oryx.customer.locale', l);
      } catch {
        /* ignore */
      }
    },
    [theme, locale],
  );
  return { ctx, page: await ctx.newPage() };
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: file });
  manifest.push({ name, file, url: page.url() });
  console.log(file);
}

// ---------------------------------------------------------------- light theme
for (const [surface, path] of [
  ['homepage', '/'],
  ['providers', '/providers'],
  ['login', '/login'],
]) {
  for (const viewport of ['desktop', 'tablet', 'mobile']) {
    const { ctx, page } = await newPage({ theme: 'light', locale: 'ar', viewport });
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(900);
    await shot(page, `light-${surface}-${viewport}-rtl`);
    await ctx.close();
  }
  const { ctx, page } = await newPage({ theme: 'light', locale: 'en', viewport: 'desktop' });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(900);
  await shot(page, `light-${surface}-desktop-ltr`);
  await ctx.close();
}

// ------------------------------------------------------- customer dashboard
{
  const { ctx, page } = await newPage({ theme: 'light', locale: 'ar', viewport: 'desktop' });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.locator('[data-testid="login-email"]').fill(EMAIL);
  await page.locator('[data-testid="login-password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot(page, 'light-dashboard-desktop-rtl');
  await ctx.close();
}

// ------------------------------------------------------- light/dark compare
for (const theme of ['light', 'dark']) {
  for (const [viewport, locale, dir] of [
    ['desktop', 'ar', 'rtl'],
    ['tablet', 'ar', 'rtl'],
    ['mobile', 'ar', 'rtl'],
    ['desktop', 'en', 'ltr'],
  ]) {
    const { ctx, page } = await newPage({ theme, locale, viewport });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.waitForTimeout(900);
    await shot(page, `compare-homepage-${viewport}-${dir}-${theme}`);
    await ctx.close();
  }
}

await browser.close();
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), shots: manifest }, null, 2));
console.log(`\n${manifest.length} screenshots written to ${OUT}`);
