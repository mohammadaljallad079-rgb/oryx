/**
 * Mobile navigation panel — real interaction test.
 *
 * The panel is the only way to reach the primary navigation on a phone, so it
 * is exercised as a user would: open, follow a link, confirm the panel closed.
 */
import { chromium } from 'playwright';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const failures = [];
const check = (n, c, d = '') => {
  if (c) console.log(`  PASS  ${n}`);
  else {
    console.log(`  FAIL  ${n} ${d}`);
    failures.push(n);
  }
};

const browser = await chromium.launch();
for (const [locale, dir] of [['ar', 'rtl'], ['en', 'ltr']]) {
  console.log(`\n=== mobile nav ${locale} ===`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((l) => localStorage.setItem('oryx.customer.locale', l), locale);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);

  check('direction', (await page.getAttribute('html', 'dir')) === dir);
  check('desktop nav hidden', !(await page.locator('.oryx-nav').isVisible()));
  check('panel starts closed', (await page.locator('.oryx-mobile-nav').count()) === 0);

  const toggle = page.locator('[data-testid="menu-toggle"]');
  check('toggle visible', await toggle.isVisible());
  await toggle.click();
  await page.waitForTimeout(400);

  check('panel opened', (await page.locator('.oryx-mobile-nav').count()) === 1);
  // 6 primary destinations plus the 2 auth shortcuts (log in / register).
  const linkCount = await page.locator('.oryx-mobile-nav > a').count();
  check('panel lists 6 destinations', linkCount === 6, `got ${linkCount}`);
  const authCount = await page.locator('.oryx-mobile-nav__auth a').count();
  check('panel lists 2 auth shortcuts', authCount === 2, `got ${authCount}`);

  // Follow a link and confirm the panel closes and the route changed.
  await page.locator('.oryx-mobile-nav > a').nth(1).click();
  await page.waitForTimeout(2500);
  check('navigated to /services', page.url().endsWith('/services'), page.url());
  check('panel closed after navigation', (await page.locator('.oryx-mobile-nav').count()) === 0);

  // No overflow with the panel open
  await toggle.click();
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no overflow with panel open', overflow <= 2, `overflow=${overflow}px`);
  await ctx.close();
}

await browser.close();
console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
