// Controlled experiment for defect E14: does the RTL scrim angle actually move
// the stat-label contrast? Measures the label as the theme matrix does (glyphs
// set transparent, background left painted), once with the committed cascade and
// once with `--scrim-angle` forced back to the LTR value through an inline style.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const BASE = 'http://localhost:3002';

const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const meanOf = (png) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < png.width * png.height; i++) {
    r += png.data[i * 4]; g += png.data[i * 4 + 1]; b += png.data[i * 4 + 2]; n++;
  }
  return [r / n, g / n, b / n];
};

const browser = await chromium.launch();

async function measure(page, sel) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);
  const box = await el.boundingBox();
  const ink = await el.evaluate((n) => getComputedStyle(n).color);
  const inkRgb = ink.match(/rgba?\(([^)]+)\)/)[1].split(',').map((v) => parseFloat(v));
  const prev = await el.evaluate(async (n) => {
    const p = n.style.color;
    n.style.color = 'transparent';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return p;
  });
  const shot = await page.screenshot({
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
  });
  await el.evaluate((n, p) => { n.style.color = p; }, prev);
  const surface = meanOf(PNG.sync.read(shot));
  return { ink, surface: surface.map((v) => Math.round(v)), contrast: +ratio(inkRgb, surface).toFixed(2) };
}

for (const [theme, locale, dir] of [['light', 'ar', 'rtl'], ['light', 'en', 'ltr']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale });
  const page = await ctx.newPage();
  await page.addInitScript(
    ([t, l]) => {
      window.localStorage.setItem('oryx.customer.theme', t);
      window.localStorage.setItem('oryx.customer.locale', l);
    },
    [theme, locale],
  );
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const angle = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scrim-angle').trim());
  const committed = await measure(page, '.oryx-stat__label');

  // Force the LTR angle inline: inline style outranks the [data-theme][data-dir] rule.
  await page.evaluate(() => document.documentElement.style.setProperty('--scrim-angle', '100deg'));
  await page.waitForTimeout(250);
  const forced = await measure(page, '.oryx-stat__label');

  console.log(`${theme}/${dir}  committed angle=${angle}`);
  console.log(`   committed : ink ${committed.ink} on rgb(${committed.surface}) = ${committed.contrast}:1`);
  console.log(`   angle=100 : ink ${forced.ink} on rgb(${forced.surface}) = ${forced.contrast}:1`);
  await ctx.close();
}
await browser.close();
