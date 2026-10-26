/**
 * Captures the rebuilt Splash and Homepage of the ORYX Marketplace demo.
 *
 * Two screens, two locales, both themes where the screen has one. The splash is
 * theme-independent by design (it is the hand-off from the platform splash, which
 * is always navy), so it is captured once per locale.
 *
 * The launch screen only exists while `AppProvider` restores the session. On web
 * the store is `localStorage`, which answers in a microtask, so `ready` flips
 * before first paint and the screen is never composited. The harness therefore
 * defers `getItem` to a promise, which leaves the main thread free so the fade
 * animation can run; a busy-wait froze the animation driver and only the navy
 * background painted.
 *
 * Run: node .run/capture-splash-home.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEMO_BASE ?? 'http://127.0.0.1:8081/mobile';
const OUT = process.env.SH_OUT ?? 'docs/audit/exec07/splash-home';
const HOLD_MS = Number(process.env.LAUNCH_HOLD_MS ?? 3500);

const PHONE = { width: 412, height: 915 };
const TABLET = { width: 834, height: 1112 };
const DESKTOP = { width: 1440, height: 900 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const log = (name, detail = '') => console.log(`  ${name.padEnd(34)} ${detail}`);

/** Defers localStorage reads so the launch screen stays composited long enough. */
async function launchContext(locale, viewport, theme = 'dark') {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: locale === 'ar' ? 'ar-SA' : 'en-US',
  });
  await ctx.addInitScript(
    ([loc, th, hold]) => {
      localStorage.setItem('oryx.marketplace.locale', JSON.stringify(loc));
      localStorage.setItem('oryx.marketplace.theme', JSON.stringify(th));
      const real = localStorage.getItem.bind(localStorage);
      const pending = new Map();
      localStorage.getItem = (key) => {
        if (pending.has(key)) return pending.get(key);
        const p = new Promise((resolve) => setTimeout(() => resolve(real(key)), hold));
        pending.set(key, p);
        return p;
      };
    },
    [locale, theme, HOLD_MS],
  );
  return ctx;
}

/* ------------------------------------------------------------ the splash */

for (const locale of ['en', 'ar']) {
  for (const [label, viewport] of [['phone', PHONE], ['tablet', TABLET]]) {
    const ctx = await launchContext(locale, viewport);
    const page = await ctx.newPage();
    const nav = page.goto(`${BASE}/`, { waitUntil: 'commit', timeout: 90_000 }).catch(() => {});
    let captured = false;
    for (let i = 0; i < 160 && !captured; i += 1) {
      // The launch screen's own copy: the tagline and the three stage captions.
      // The wordmark is an image, so it is not visible to `innerText`.
      const text = await page.locator('body').innerText().catch(() => '');
      if (/Everything Your Car|كل ما تحتاجه سيارتك/.test(text)) {
        await page.waitForTimeout(900); // let the 560ms fade settle
        await page.screenshot({ path: `${OUT}/splash-${locale}-${label}.png` });
        log(`splash-${locale}-${label}`, text.replace(/\n+/g, ' | ').slice(0, 60));
        captured = true;
      }
      await page.waitForTimeout(100);
    }
    if (!captured) log(`splash-${locale}-${label}`, 'window not observed');
    await nav;
    await ctx.close();
  }
}

/* ---------------------------------------------------------- the homepage */

/** Signs in as the seeded demo customer through the app's own control. */
async function signedIn(viewport, locale, theme) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    locale: locale === 'ar' ? 'ar-SA' : 'en-US',
  });
  await ctx.addInitScript(
    ([loc, th]) => {
      localStorage.setItem('oryx.marketplace.locale', JSON.stringify(loc));
      localStorage.setItem('oryx.marketplace.theme', JSON.stringify(th));
    },
    [locale, theme],
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(4000);
  const skip = page.getByRole('button', { name: /^(Skip|تخطي)$/ }).first();
  if (await skip.count()) {
    await skip.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  const demo = page.getByTestId('demo-customer').first();
  if (await demo.count()) {
    await demo.click({ timeout: 10_000 }).catch(() => {});
  } else {
    await page.getByTestId('login-email').fill('customer@oryx.demo');
    await page.getByTestId('login-password').fill('demo1234');
    await page.getByTestId('login-submit').click();
  }
  await page.waitForTimeout(4000);
  return { ctx, page };
}

for (const theme of ['light', 'dark']) {
  for (const locale of ['en', 'ar']) {
    for (const [label, viewport] of [['phone', PHONE], ['tablet', TABLET], ['desktop', DESKTOP]]) {
      const { ctx, page } = await signedIn(viewport, locale, theme);
      await page.goto(`${BASE}/home`, { waitUntil: 'networkidle', timeout: 90_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/home-${theme}-${locale}-${label}.png` });
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      log(`home-${theme}-${locale}-${label}`, text.slice(0, 58));
      // The homepage is taller than any handset, so the rails below the fold —
      // offers and the featured stores — are only visible in a full-page capture.
      if (label === 'phone') {
        await page.screenshot({
          path: `${OUT}/home-${theme}-${locale}-full.png`,
          fullPage: true,
        });
        log(`home-${theme}-${locale}-full`, `${text.length} chars`);
      }
      await ctx.close();
    }
  }
}

await browser.close();
console.log(`\nwrote captures to ${OUT}`);
