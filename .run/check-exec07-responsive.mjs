/**
 * Execution 07 — responsive QA matrix.
 *
 * Loads the public site and the customer dashboard at the required viewports in
 * both directions and both themes, and fails on horizontal overflow, a
 * collapsed primary action, or a missing hero. Screenshots land in
 * docs/audit/exec07/responsive/.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = 'docs/audit/exec07/responsive';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'wide-1920', width: 1920, height: 1080 },
];

mkdirSync(OUT, { recursive: true });
const failures = [];
const check = (n, c, d = '') => {
  if (c) console.log(`  PASS  ${n}`);
  else {
    console.log(`  FAIL  ${n} ${d}`);
    failures.push(n);
  }
};

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const [locale, theme] of [['ar', 'dark'], ['en', 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ([l, t]) => {
        localStorage.setItem('oryx.customer.locale', l);
        localStorage.setItem('oryx.customer.theme', t);
      },
      [locale, theme],
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1200);

    const tag = `${vp.name}-${locale}-${theme}`;
    console.log(`\n=== ${tag} ===`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no horizontal overflow', overflow <= 2, `overflow=${overflow}px`);
    check('hero title visible', await page.locator('.oryx-hero__title').isVisible());
    const ctaBox = await page.locator('.oryx-hero__actions .oryx-btn').first().boundingBox();
    check('primary CTA tappable width', !!ctaBox && ctaBox.width >= 44, `w=${ctaBox?.width}`);
    check('footer visible', await page.locator('.oryx-footer__grid').isVisible());

    // The theme actually applied
    const appliedTheme = await page.getAttribute('html', 'data-theme');
    check('theme applied', appliedTheme === theme, `got ${appliedTheme}`);
    const dir = await page.getAttribute('html', 'dir');
    check('direction applied', dir === (locale === 'ar' ? 'rtl' : 'ltr'), `got ${dir}`);

    await page.screenshot({ path: `${OUT}/home-${tag}.png` });
    await ctx.close();
  }
}

// Customer dashboard, signed in, at the two extremes
for (const vp of [VIEWPORTS[0], VIEWPORTS[4]]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await page.goto(`${CUSTOMER}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(USER.email);
  await page.locator('input[type="password"]').first().fill(USER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4500);
  await page.goto(`${CUSTOMER}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1800);

  const tag = `dashboard-${vp.name}`;
  console.log(`\n=== ${tag} ===`);
  check('dashboard hero', await page.locator('.oryx-dash-hero').isVisible());
  check('4 KPI cards', (await page.locator('.oryx-kpi').count()) === 4, `got ${await page.locator('.oryx-kpi').count()}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal overflow', overflow <= 2, `overflow=${overflow}px`);
  await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
