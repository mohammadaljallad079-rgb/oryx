// Prove the scrim change cannot reach the dark theme, by reading the computed
// token in each theme/direction rather than trusting the stylesheet's cascade.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3002';
const browser = await chromium.launch();

for (const [theme, locale, dir] of [
  ['dark', 'ar', 'rtl'],
  ['dark', 'en', 'ltr'],
  ['light', 'en', 'ltr'],
  ['light', 'ar', 'rtl'],
]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale });
  const page = await context.newPage();
  await page.addInitScript(
    ([t, l]) => {
      window.localStorage.setItem('oryx.customer.theme', t);
      window.localStorage.setItem('oryx.customer.locale', l);
    },
    [theme, locale],
  );
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const v = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const hero = document.querySelector('.oryx-hero, .oryx-dash-hero');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      dir: document.documentElement.getAttribute('data-dir'),
      angle: cs.getPropertyValue('--scrim-angle').trim(),
      heroScrim: cs.getPropertyValue('--hero-scrim').trim().replace(/\s+/g, ' ').slice(0, 90),
      heroBg: hero ? getComputedStyle(hero).backgroundImage.replace(/\s+/g, ' ').slice(0, 120) : '(no hero)',
    };
  });
  console.log(`${theme}/${dir}:`, JSON.stringify(v, null, 1));
  await context.close();
}
await browser.close();
