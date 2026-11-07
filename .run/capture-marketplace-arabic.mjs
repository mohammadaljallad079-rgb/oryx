/**
 * Verifies that the marketplace app actually renders Arabic RTL, and captures
 * the Arabic pass in both themes.
 *
 * The app does not set `dir` on `<html>`; `Screen` and the text components carry
 * `direction`/`writingDirection` from the locale, and the layout reverses rows
 * with `flexDirection: row-reverse`. So the witness for RTL is the computed
 * style of the rendered shell and of a text node, not the document element.
 *
 * Run: node .run/capture-marketplace-arabic.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEMO_BASE ?? 'https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/mobile';
const OUT = '.run/evidence/exec07-phase-e/marketplace';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const open = async (route, wait = 2200) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(wait);
};

/**
 * Reads the layout direction the app applied, from the count of elements that
 * compute to `rtl`, plus the text alignment of the first real text node.
 */
async function readDirection() {
  return page.evaluate(() => {
    const rtlElements = [...document.querySelectorAll('*')].filter(
      (el) => getComputedStyle(el).direction === 'rtl',
    ).length;
    const texts = [...document.querySelectorAll('div,span,p')].filter(
      (el) => el.textContent && el.textContent.trim().length > 12 && el.children.length === 0,
    );
    const first = texts[0];
    return {
      rtlElements,
      textAlign: first ? getComputedStyle(first).textAlign : 'n/a',
    };
  });
}

async function signIn() {
  await open('/');
  const skip = page.getByRole('button', { name: /^(Skip|تخطي)$/ }).first();
  if (await skip.count()) {
    await skip.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2200);
  }
  const demo = page.getByTestId('demo-customer').first();
  if (await demo.count()) {
    await demo.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(3500);
  }
}

async function switchLocale() {
  await open('/home');
  const toggle = page.getByTestId('locale-toggle').first();
  if (!(await toggle.count())) return 'locale-toggle not found';
  await toggle.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  return 'clicked';
}

await signIn();

// Record the English pass first, so the RTL measurement has a baseline.
await open('/home');
console.log('english :', JSON.stringify(await readDirection()));

console.log('switch  :', await switchLocale());
console.log('arabic  :', JSON.stringify(await readDirection()));

const SCREENS = [
  ['/home', 'ar-02-home'],
  ['/parts', 'ar-03-parts'],
  ['/services', 'ar-04-services'],
  ['/orders', 'ar-07-orders'],
  ['/account', 'ar-16-account'],
];

for (const theme of ['dark', 'light']) {
  await open('/account');
  const ctl = page.getByTestId(`settings-theme-${theme}`).first();
  if (await ctl.count()) {
    await ctl.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  for (const [route, name] of SCREENS) {
    await open(route);
    const dir = await readDirection();
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    console.log(`  ${`${name}-${theme}`.padEnd(22)} rtlEls=${String(dir.rtlElements).padStart(3)} align=${dir.textAlign.padEnd(6)} ${text.slice(0, 40)}`);
  }
}

await browser.close();
console.log(`\nwrote Arabic captures to ${OUT}`);
