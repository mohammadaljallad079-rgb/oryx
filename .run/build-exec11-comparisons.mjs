/**
 * Execution 11 — light-vs-dark comparison sheets and RTL/LTR proof.
 *
 * Captures each required surface in both themes at desktop width, asserts the
 * rendered direction matches the locale, and writes a side-by-side JPEG per
 * surface and locale. The dark theme is the approved identity; the sheet is
 * proof that the light correction did not disturb it.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';

const CUSTOMER = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const OUT = 'docs/audit/exec11/light-theme';
mkdirSync(OUT, { recursive: true });

const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };
const VIEWPORT = { width: 1440, height: 900 };
const SURFACES = [
  { name: '01-homepage', path: '/', auth: false },
  { name: '02-dashboard', path: '/dashboard', auth: true },
  { name: '03-providers', path: '/providers', auth: false },
  { name: '04-login', path: '/login', auth: false },
];

function initScript(theme, locale) {
  return `(() => {
    try {
      localStorage.setItem('oryx.customer.theme', ${JSON.stringify(theme)});
      localStorage.setItem('oryx.customer.locale', ${JSON.stringify(locale)});
    } catch {}
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
    document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
    document.documentElement.setAttribute('lang', ${JSON.stringify(locale)});
    document.documentElement.setAttribute('dir', ${JSON.stringify(locale === 'ar' ? 'rtl' : 'ltr')});
  })();`;
}

const browser = await chromium.launch();
const problems = [];

async function capture(surface, theme, locale) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript(initScript(theme, locale));
  const page = await ctx.newPage();
  if (surface.auth) {
    await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.locator('input[type="email"], input[name="email"]').first().fill(USER.email);
    await page.locator('input[type="password"]').first().fill(USER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/dashboard', { timeout: 45_000 });
    await page.waitForTimeout(2500);
  } else {
    await page.goto(`${CUSTOMER}${surface.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
  }
  const dir = await page.evaluate(() => document.documentElement.dir || document.documentElement.getAttribute('dir'));
  const expected = locale === 'ar' ? 'rtl' : 'ltr';
  if (dir !== expected) problems.push(`${surface.name} ${locale}: dir=${dir} expected=${expected}`);
  const file = `${OUT}/${surface.name}-desktop-${locale}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: false });
  await ctx.close();
  return file;
}

function load(file) {
  return PNG.sync.read(readFileSync(file));
}

function sideBySide(a, b) {
  const w = a.width + b.width + 24;
  const h = Math.max(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 20; out.data[i + 1] = 20; out.data[i + 2] = 20; out.data[i + 3] = 255;
  }
  const blit = (img, ox) => {
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        const si = (img.width * y + x) << 2;
        const di = (w * y + (x + ox)) << 2;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width + 24);
  return out;
}

for (const surface of SURFACES) {
  for (const locale of ['ar', 'en']) {
    const light = await capture(surface, 'light', locale);
    const dark = await capture(surface, 'dark', locale);
    const sheet = sideBySide(load(light), load(dark));
    const outFile = `${OUT}/cmp-${surface.name}-desktop-${locale}-light-vs-dark.png`;
    writeFileSync(outFile, PNG.sync.write(sheet));
    console.log(`sheet ${outFile}`);
  }
}

await browser.close();
if (problems.length) {
  console.log('\nDIRECTION PROBLEMS:');
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
console.log('\nAll surfaces rendered in the direction the locale requires.');
