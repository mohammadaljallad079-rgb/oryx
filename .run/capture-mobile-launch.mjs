/**
 * Captures the launch screen of the ORYX Marketplace mobile app.
 *
 * The launch screen shows while `AppProvider` restores the session. On web the
 * store is `localStorage`, which answers in a microtask, so `ready` flips before
 * the browser's first paint and the screen is never composited — there is no
 * window to screenshot.
 *
 * The harness therefore slows the store to a device-like latency. It must defer,
 * not block: an earlier version busy-waited on the main thread, which froze the
 * `requestAnimationFrame` driver the screen's fade runs on, so only the navy
 * background ever painted. Returning a promise from `getItem` instead leaves the
 * thread free — `getSecret` is `async`, so it adopts the promise — and the screen
 * fades in and holds for the delay, exactly as it does on a handset.
 *
 * The delay is deliberately longer than a device's keychain read so the window is
 * easy to land on. The shipped code is untouched.
 *
 * Run with: node .run/capture-mobile-launch.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MOBILE_WEB_URL ?? 'http://127.0.0.1:8081/mobile';
const OUT = process.env.LAUNCH_OUT ?? 'docs/audit/exec07/marketplace-demo/screenshots';
const HOLD_MS = Number(process.env.LAUNCH_HOLD_MS ?? 3000);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const locale of ['en', 'ar']) {
  // The launch screen reads the device locale, not the stored preference — the
  // stored one is only applied once the restore resolves, which is after this
  // screen is gone. Setting localStorage alone therefore produced an English
  // frame for both languages. The context locale is what the device locale maps
  // to on web, so it is what decides the launch copy and its direction.
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    locale: locale === 'ar' ? 'ar-SA' : 'en-US',
  });
  await ctx.addInitScript(
    ([loc, hold]) => {
      localStorage.setItem('oryx.marketplace.locale', JSON.stringify(loc));
      localStorage.setItem('oryx.marketplace.theme', JSON.stringify('light'));
      // No session: the launch screen is what shows before one is restored.
      const real = localStorage.getItem.bind(localStorage);
      const pending = new Map();
      localStorage.getItem = (key) => {
        if (pending.has(key)) return pending.get(key);
        const p = new Promise((resolve) => {
          setTimeout(() => resolve(real(key)), hold);
        });
        pending.set(key, p);
        return p;
      };
    },
    [locale, HOLD_MS],
  );

  const page = await ctx.newPage();
  const nav = page.goto(`${BASE}/`, { waitUntil: 'commit', timeout: 90_000 }).catch(() => {});

  // The launch screen is up from first paint until the restore resolves. Poll for
  // its own copy so the shot lands inside that window, not after it. The tagline
  // is the screen's own text; the wordmark is an image, so `innerText` cannot see
  // it, and the tagline is what distinguishes this screen from the shell.
  let captured = false;
  for (let i = 0; i < 120 && !captured; i += 1) {
    const text = await page.locator('body').innerText().catch(() => '');
    if (/Everything Your Car|كل ما تحتاجه سيارتك/.test(text)) {
      // Let the 520ms fade settle so the capture is the composed screen.
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/launch-${locale}.png` });
      console.log(`launch-${locale}: captured :: ${text.replace(/\n+/g, ' | ').slice(0, 70)}`);
      captured = true;
    }
    await page.waitForTimeout(100);
  }
  if (!captured) console.log(`launch-${locale}: window not observed`);
  await nav;
  await ctx.close();
}

await browser.close();
