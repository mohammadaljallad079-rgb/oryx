/**
 * Captures the branded in-app launch screen.
 *
 * The screen is mounted only while `AppProvider` reads the stored session. On a
 * device that is a secure-store read plus JS start-up; in the web export it
 * resolves in a few milliseconds, so a screenshot taken after the page settles
 * never lands on it.
 *
 * The window is widened with CDP CPU throttling rather than by touching app
 * code. The first few frames after `commit` are a blank white page — the shell
 * has parsed but the bundle has not run — so a frame is only accepted as the
 * launch screen when the wordmark stage text is present in the DOM. Reading the
 * DOM before each shot is what makes that test trustworthy; the cost is why the
 * throttle is heavy.
 *
 * Run: node .run/capture-launch.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEMO_BASE ?? 'https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/mobile';
const OUT = '.run/evidence/exec07-phase-e/marketplace';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });

await page.goto(`${BASE}/`, { waitUntil: 'commit', timeout: 60_000 });

// The launch screen's own stage strings. Present only while it is mounted.
const STAGE = /Preparing the marketplace|جارٍ تجهيز السوق|Parts you can trust|قطع غيار موثقة|Verified services|خدمات وفحص وصيانة|SENSAGE photo check|فحص ذكي بالصور/;

let caught = 0;
for (let i = 0; i < 40; i += 1) {
  await page.waitForTimeout(45);
  const text = await page.locator('body').innerText().catch(() => '');
  if (!STAGE.test(text)) continue;
  const name = `launch-${String(i).padStart(2, '0')}`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  caught += 1;
  console.log(`  ${name}  ${text.replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  if (caught >= 3) break;
}

await browser.close();
console.log(`\nlaunch frames caught: ${caught}; wrote to ${OUT}`);
