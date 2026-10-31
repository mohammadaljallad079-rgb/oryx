/**
 * Measures the *rendered* contrast of light-theme text against the pixels
 * actually behind it, by screenshotting the element with the text hidden and
 * with it visible.
 *
 * `.run/audit-light-theme.mjs` composites only `background-color` layers, so a
 * panel painted with a `background-image` gradient (the navy hero band, the
 * page header, the dashboard banner) is measured against the page field and
 * reports a false low ratio. This probe reads the real pixels instead.
 *
 * Run with: node .run/probe-rendered-contrast.mjs
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};
const meanOf = (png, box) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const i = (png.width * y + x) << 2;
      // Skip near-black and near-white outlier pixels (glyph antialiasing and
      // highlights) so the sample is the surface, not the text.
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
};

const TARGETS = [
  ['homepage', '/', ['.oryx-stat__label', '.oryx-stat__value', '.oryx-hero__title', '.oryx-hero__lede', '.oryx-eyebrow']],
  ['providers', '/providers', ['.oryx-page-head__title', '.oryx-page-head__subtitle', '.oryx-page-head__back', '.oryx-card-title']],
  ['profile', '/profile', ['.oryx-page-head__title', '.oryx-card-title', '.oryx-muted']],
  ['dashboard', '/dashboard', ['.oryx-dash-hero__title', '.oryx-eyebrow', '.oryx-kpi__value']],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => window.localStorage.setItem('oryx.customer.theme', 'light'));
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(1500);

const failures = [];
for (const [name, path, selectors] of TARGETS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log(`\n== ${name} (${path}) ==`);
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) === 0) continue;
    const box = await el.boundingBox();
    if (!box || box.width < 4 || box.height < 4) continue;
    const ink = await el.evaluate((n) => getComputedStyle(n).color);

    // Hide only the glyphs, leaving every background layer in place, so the
    // shot is the surface the text actually sits on.
    const bgShot = await el.evaluate(async (n) => {
      const prev = n.style.color;
      n.style.color = 'transparent';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return prev;
    }).then(async (prev) => {
      const shot = await page.screenshot({
        clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
      });
      await el.evaluate((n, p) => {
        n.style.color = p;
      }, prev);
      return shot;
    });
    const png = PNG.sync.read(bgShot);
    const surface = meanOf(png, { x: 0, y: 0, width: png.width, height: png.height });
    const m = ink.match(/rgba?\(([^)]+)\)/);
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    const cr = ratio([p[0], p[1], p[2]], surface);
    const ok = cr >= 4.5 ? 'PASS' : cr >= 3 ? 'LARGE-ONLY' : 'FAIL';
    console.log(
      `  ${sel.padEnd(26)} ink=${ink.padEnd(20)} surface=rgb(${surface.map((v) => Math.round(v)).join(', ')}) contrast=${String(cr).padEnd(6)} ${ok}`,
    );
    if (cr < 4.5) failures.push(`${name} ${sel} ${cr}:1 (ink ${ink} on rgb(${surface.map((v) => Math.round(v)).join(', ')}))`);
  }
}

await browser.close();
console.log(`\n${failures.length} rendered pairs below 4.5:1`);
for (const f of failures) console.log('  ' + f);
