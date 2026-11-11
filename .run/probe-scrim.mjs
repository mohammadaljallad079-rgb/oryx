import { chromium } from 'playwright';
const b = await chromium.launch();
for (const dir of ['ltr', 'rtl']) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: dir === 'rtl' ? 'ar' : 'en' });
  await p.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
  await p.evaluate((d) => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-dir', d);
    document.documentElement.setAttribute('dir', d);
    document.documentElement.lang = d === 'rtl' ? 'ar' : 'en';
  }, dir);
  await p.waitForTimeout(1000);
  const out = await p.evaluate(async () => {
    const el = document.querySelector('.oryx-stat__label');
    const r = el.getBoundingClientRect();
    // Sample the rendered pixel behind the label's own text baseline.
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    return {
      x,
      y,
      viewport: innerWidth,
      rect: { left: Math.round(r.left), width: Math.round(r.width) },
      scrim: getComputedStyle(document.querySelector('.oryx-hero__scrim')).backgroundImage.slice(0, 120),
      ink: getComputedStyle(el).color,
    };
  });
  console.log(dir, JSON.stringify(out));
  await p.close();
}
await b.close();
