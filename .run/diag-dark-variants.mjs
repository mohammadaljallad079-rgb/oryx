/**
 * Attribute the dark-homepage pixel shift to a specific rule.
 *
 * Captures the dark homepage as it renders now, then again with each change
 * from this session reverted at runtime through `addStyleTag`. Comparing the
 * two against the committed baseline says which rule, if any, moved the
 * approved dark render.
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const OUT = process.argv[2] ?? '/tmp/diag';

const VARIANTS = {
  now: '',
  'revert-desc': '.oryx-cat-card__desc { font-size: 12.5px !important; }',
  'revert-btnlg': '.oryx-btn-lg { border-radius: 12px !important; }',
  'revert-both':
    '.oryx-cat-card__desc { font-size: 12.5px !important; } .oryx-btn-lg { border-radius: 12px !important; }',
};

const browser = await chromium.launch();
for (const [name, css] of Object.entries(VARIANTS)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.setItem('oryx.customer.locale', 'en');
    window.localStorage.setItem('oryx.customer.theme', 'dark');
  });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  if (css) await page.addStyleTag({ content: css });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/dark-${name}.png` });
  console.log(`captured dark-${name}`);
  await ctx.close();
}
await browser.close();
