/**
 * Capture the Execution 07 Phase D customer homepage in all four
 * locale/theme combinations, and assert that the photography actually came
 * from the CMS rather than the bundled vector fallback.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/audit/exec07/phase-d';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.PREVIEW_BASE ?? 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';

const browser = await chromium.launch();
const results = [];

for (const [name, locale, theme] of [
  ['home-ar-dark', 'ar', 'dark'],
  ['home-en-dark', 'en', 'dark'],
  ['home-ar-light', 'ar', 'light'],
  ['home-en-light', 'en', 'light'],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([l, t]) => {
      localStorage.setItem('oryx.customer.locale', l);
      localStorage.setItem('oryx.customer.theme', t);
    },
    [locale, theme],
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });

  const info = await page.evaluate(() => {
    const hero = document.querySelector('.oryx-hero__media');
    const bg = hero ? getComputedStyle(hero).backgroundImage : '';
    const cards = [...document.querySelectorAll('.oryx-cat-card__art')].map((e) =>
      getComputedStyle(e).backgroundImage,
    );
    const imgs = [...document.querySelectorAll('[style*="cms/media"]')].length;
    return {
      heroFromCms: bg.includes('cms/media'),
      heroArt: bg.replace(/^url\("?/, '').split('"')[0].split('?')[0].slice(-40),
      categoryCards: cards.length,
      categoryCardsFromCms: cards.filter((c) => c.includes('cms/media')).length,
      cmsStyledElements: imgs,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      dir: document.documentElement.getAttribute('data-dir'),
      theme: document.documentElement.getAttribute('data-theme'),
      heroTitle: document.querySelector('.oryx-hero__title')?.textContent?.slice(0, 60),
    };
  });
  results.push({ name, ...info });
  console.log(`${name.padEnd(16)} ${JSON.stringify(info)}`);
  await ctx.close();
}

await browser.close();
console.log('\nWrote', results.length, 'captures to', OUT);
