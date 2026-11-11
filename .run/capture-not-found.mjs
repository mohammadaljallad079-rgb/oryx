/**
 * Captures the themed 404 in both apps, in both themes.
 *
 * The defect this session fixed was that an unknown URL painted a white field
 * on every theme, because Next's built-in not-found injects `body{background:
 * #fff}` after the app stylesheet. These four captures are the proof the fix
 * holds: the same URL, on the theme's own `--bg`, in each app and theme.
 *
 * Run with: node .run/capture-not-found.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const OUT = 'docs/audit/exec07/phase-e-light';
mkdirSync(OUT, { recursive: true });

const TARGETS = [
  ['06-not-found-light-customer-en', CUSTOMER, 'oryx.customer.theme', 'en', 'light'],
  ['06-not-found-dark-customer-en', CUSTOMER, 'oryx.customer.theme', 'en', 'dark'],
  ['06-not-found-light-admin-en', ADMIN, 'oryx.theme', 'en', 'light'],
  ['06-not-found-dark-admin-en', ADMIN, 'oryx.theme', 'en', 'dark'],
];

const browser = await chromium.launch();
const manifest = [];

for (const [name, base, themeKey, locale, theme] of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([k, t, l]) => {
      localStorage.setItem(k, t);
      localStorage.setItem(k.includes('customer') ? 'oryx.customer.locale' : 'oryx.locale', l);
    },
    [themeKey, theme, locale],
  );
  await page.goto(`${base}/a-route-that-does-not-exist`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

  const resolved = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    dir: document.documentElement.getAttribute('dir'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bgVar: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    status: document.querySelector('h1, p')?.innerText?.slice(0, 40) ?? null,
  }));
  manifest.push({ name, app: base === ADMIN ? 'admin' : 'customer', theme, file: `${OUT}/${name}.png`, resolved });
  console.log(`${name.padEnd(34)} theme=${resolved.theme.padEnd(5)} bodyBg=${resolved.bodyBg.padEnd(20)} bg=${resolved.bgVar}`);
  await ctx.close();
}

writeFileSync(`${OUT}/manifest-not-found.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${manifest.length} captures written to ${OUT}`);
await browser.close();
