import { chromium } from 'playwright';

const base = process.env.BASE || 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.localStorage.setItem('oryx.locale', 'en');
  window.localStorage.setItem('oryx.theme', 'dark');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('login-email').fill('admin@oryx-auto.local');
await page.getByTestId('login-password').fill('ChangeMe!Oryx2026');
await page.getByTestId('login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 30000 });
await page.waitForLoadState('networkidle');

// The banner background must be the new vector art, never the reference crop.
const heroBg = await page
  .locator('.oryx-hero__media')
  .evaluate((el) => getComputedStyle(el).backgroundImage);
console.log('hero media background:', heroBg);

// The dashboard module tile must point at the generated dashboard art.
const tileBg = await page
  .getByTestId('tile-dashboard')
  .locator('.oryx-tile__media')
  .evaluate((el) => getComputedStyle(el).backgroundImage);
console.log('dashboard tile background:', tileBg);

// Nothing on the page may reference the approved reference crop.
const refs = await page.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll('*')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.includes('hero-automotive')) hits.push(el.className);
    if (el.tagName === 'IMG' && (el.src || '').includes('hero-automotive')) hits.push(el.src);
  }
  return hits;
});
console.log('forbidden hero-automotive refs:', JSON.stringify(refs));

// Confirm the new tile actually decoded as a real image.
const loaded = await page.evaluate(async () => {
  const url = getComputedStyle(
    document.querySelector('[data-testid="tile-dashboard"] .oryx-tile__media'),
  ).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1];
  if (!url) return { url: null };
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ url, error: true });
    img.src = url;
  });
});
console.log('dashboard tile image:', JSON.stringify(loaded));

await page.screenshot({ path: '/workspace/project/oryx/.run/evidence/dashboard-tile-verified.png' });
await browser.close();
