/** Count anonymous bootstrap refresh requests per page load. */
import { chromium } from 'playwright';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let refreshCalls = 0;
page.on('request', (r) => {
  if (r.url().includes('/customer/auth/refresh')) refreshCalls += 1;
});
await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(4000);
console.log(`anonymous homepage: ${refreshCalls} refresh request(s)`);
await browser.close();
process.exit(refreshCalls <= 1 ? 0 : 1);
