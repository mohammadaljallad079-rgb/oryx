/** Attribute every >=400 response to the page and URL that produced it. */
import { chromium } from 'playwright';

const ADMIN = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';

const pages = [
  ['admin /login', `${ADMIN}/login`],
  ['customer /', `${CUSTOMER}/`],
  ['customer /services', `${CUSTOMER}/services`],
  ['customer /providers', `${CUSTOMER}/providers`],
  ['customer /login', `${CUSTOMER}/login`],
  ['customer /providers/apply', `${CUSTOMER}/providers/apply`],
  ['mobile /login', `${CUSTOMER}/mobile/login`],
  ['mobile /', `${CUSTOMER}/mobile/`],
];

const browser = await chromium.launch();
for (const [name, url] of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  if (bad.length) {
    console.log(`\n${name}  ${url}`);
    for (const b of [...new Set(bad)]) console.log(`   ${b}`);
  }
  await ctx.close();
}
await browser.close();
