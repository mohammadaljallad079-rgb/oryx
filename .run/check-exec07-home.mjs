/**
 * Functional assertions for the redesigned customer homepage.
 *
 * Checks that the real DOM contains every new section, that the five service
 * categories each render a *distinct* artwork URL, and that the page works in
 * Arabic RTL and English LTR. Fails loudly rather than printing a pass.
 */
import { chromium } from 'playwright';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${detail}`);
    failures.push(name);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

for (const locale of ['ar', 'en']) {
  console.log(`\n=== locale=${locale} ===`);
  await page.goto(`${CUSTOMER}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((l) => window.localStorage.setItem('oryx.customer.locale', l), locale);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);

  check('dir attribute', (await page.getAttribute('html', 'dir')) === (locale === 'ar' ? 'rtl' : 'ltr'));

  // Section headings present
  for (const [label, sel] of [
    ['hero title', '.oryx-hero__title'],
    ['stat row', '.oryx-stat-row'],
    ['value section', '.oryx-feature'],
    ['how-it-works steps', '.oryx-step'],
    ['partner block', '.oryx-partner'],
    ['faq items', '.oryx-faq__item'],
    ['contact block', '.oryx-contact'],
    ['footer grid', '.oryx-footer__grid'],
  ]) {
    check(label, (await page.locator(sel).count()) > 0);
  }

  // Distinct category artwork
  const arts = await page.locator('.oryx-cat-card__art').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).backgroundImage),
  );
  check('5 category cards', arts.length === 5, `got ${arts.length}`);
  check('category art all distinct', new Set(arts).size === arts.length, `distinct=${new Set(arts).size}`);

  const steps = await page.locator('.oryx-step').count();
  check('3 how-it-works steps', steps === 3, `got ${steps}`);
  const faqs = await page.locator('.oryx-faq__item').count();
  check('4 faq items', faqs === 4, `got ${faqs}`);

  // No untranslated raw keys leaking into the page
  const body = await page.locator('body').innerText();
  const rawKeys = body.match(/\b(home|footer|nav|common)\.[a-zA-Z]+/g);
  check('no raw i18n keys', !rawKeys, rawKeys?.slice(0, 4).join(','));

  // No horizontal overflow (responsive sanity)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal overflow', overflow <= 2, `overflow=${overflow}px`);
}

// ---------------------------------------------------------- /services
for (const locale of ['ar', 'en']) {
  console.log(`\n=== /services locale=${locale} ===`);
  await page.goto(`${CUSTOMER}/services`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((l) => window.localStorage.setItem('oryx.customer.locale', l), locale);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  const cards = await page.locator('.oryx-service-card').count();
  check('5 service cards', cards === 5, `got ${cards}`);
  const arts = await page.locator('.oryx-service-card__art').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).backgroundImage),
  );
  check('service art all distinct', new Set(arts).size === arts.length, `distinct=${new Set(arts).size}`);
  const body = await page.locator('body').innerText();
  check('no raw category keys', !/automotive_[a-z]+/.test(body), body.match(/automotive_[a-z]+/)?.[0]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal overflow', overflow <= 2, `overflow=${overflow}px`);
}

await browser.close();
console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
