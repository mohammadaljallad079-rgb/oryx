/**
 * Probes the rendered ORYX brand lockup in both themes and on both apps.
 *
 * Reports the natural size, the on-screen box and the dominant ink colours, so a
 * silently-broken image or an inverted colourway is visible in the output rather
 * than hidden behind a "visible" assertion.
 *
 * Run with: node .run/probe-brand.mjs
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const ADMIN = 'http://localhost:3000';
const CUSTOMER = 'http://localhost:3002';

const browser = await chromium.launch();

async function probe(url, selector, locale, theme, keys) {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  // Seed the preference before any app script runs. Setting it after load
  // races the provider's own hydration write and is not deterministic.
  await ctx.addInitScript(
    ([l, t, localeKey, themeKey]) => {
      localStorage.setItem(localeKey, l);
      localStorage.setItem(themeKey, t);
    },
    [locale, theme, keys.locale, keys.theme],
  );
  const page = await ctx.newPage();
  await page.goto(`${url}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (t) => document.documentElement.getAttribute('data-theme') === t,
    theme,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(2500);
  const attrs = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    dir: document.documentElement.getAttribute('data-dir'),
  }));

  const el = page.locator(selector).first();
  if (!(await el.count())) {
    console.log(`${url} ${selector}: NOT FOUND`);
    await ctx.close();
    return;
  }

  const info = await el.evaluate((node) => {
    const imgs = Array.from(node.querySelectorAll('img'));
    const visible = imgs.find((i) => {
      const s = getComputedStyle(i);
      return s.display !== 'none' && s.visibility !== 'hidden' && i.getBoundingClientRect().width > 0;
    });
    const img = visible ?? node;
    const box = node.getBoundingClientRect();
    return {
      tag: img.tagName,
      natural: img.naturalWidth ? `${img.naturalWidth}x${img.naturalHeight}` : 'n/a',
      src: (img.currentSrc || img.src || '').split('/').slice(-1)[0],
      box: `${Math.round(box.width)}x${Math.round(box.height)} @${Math.round(box.x)},${Math.round(box.y)}`,
      opacity: getComputedStyle(node).opacity,
      display: getComputedStyle(node).display,
    };
  });

  const buf = await el.screenshot().catch(() => null);
  let ink = 'n/a';
  if (buf) {
    const { data, info: meta } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hist = new Map();
    for (let i = 0; i < data.length; i += meta.channels) {
      const a = data[i + 3];
      if (a < 40) continue;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    ink = [...hist.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${k}(${n})`)
      .join(' ');
  }

  console.log(`${theme}/${locale} ${url.replace(/^https?:\/\//, '')} ${selector} html=${JSON.stringify(attrs)}`);
  console.log(`  ${JSON.stringify(info)}`);
  console.log(`  dominant ink (rgb>>4): ${ink}`);
  await ctx.close();
}

const ADMIN_KEYS = { locale: 'oryx.locale', theme: 'oryx.theme' };
const CUSTOMER_KEYS = { locale: 'oryx.customer.locale', theme: 'oryx.customer.theme' };

await probe(ADMIN, '.oryx-brand-logo', 'ar', 'dark', ADMIN_KEYS);
await probe(ADMIN, '.oryx-brand-logo', 'en', 'light', ADMIN_KEYS);
await probe(CUSTOMER, '.oryx-brand-logo', 'ar', 'dark', CUSTOMER_KEYS);
await probe(CUSTOMER, '.oryx-brand-logo', 'en', 'light', CUSTOMER_KEYS);

await browser.close();
