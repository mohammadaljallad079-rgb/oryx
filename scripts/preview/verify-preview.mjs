import { chromium } from 'playwright';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8099';
const pages = [
  ['index', '/', 'desktop'],
  ['evidence', '/evidence/', 'desktop'],
  ['reports', '/reports/', 'desktop'],
  ['brand', '/brand/', 'desktop'],
  ['report-phasee', '/reports/04phaseelighttheme.html', 'desktop'],
  ['index-mobile', '/', 'mobile'],
];
const browser = await chromium.launch();
const issues = [];
for (const [name, url, kind] of pages) {
  const ctx = await browser.newContext({
    viewport: kind === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const broken = await page.evaluate(() =>
    Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const imgs = await page.evaluate(() => document.images.length);
  const h1 = await page.locator('h1').first().innerText().catch(() => '(none)');
  await page.screenshot({ path: `/tmp/preview-shots/${name}.png`, fullPage: false });
  console.log(`${name.padEnd(14)} h1="${h1.slice(0, 44)}" imgs=${String(imgs).padStart(3)} overflow=${overflow}px broken=${broken.length} errors=${errors.length} bad=${bad.length}`);
  if (broken.length) { console.log('   broken:', broken.slice(0, 4)); issues.push([name, 'broken images']); }
  if (errors.length) { console.log('   errors:', errors.slice(0, 3)); issues.push([name, 'console errors']); }
  if (bad.length) { console.log('   bad:', bad.slice(0, 4)); issues.push([name, 'http errors']); }
  if (overflow > 2) { issues.push([name, `overflow ${overflow}px`]); }
  await ctx.close();
}
await browser.close();
console.log('\nissues:', issues.length ? issues : 'none');
