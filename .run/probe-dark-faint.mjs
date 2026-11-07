import { chromium } from 'playwright';

const lum = (c) => {
  const s = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
await p.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.setAttribute('data-dir', 'rtl');
});
await p.waitForTimeout(1200);

// Read the label ink and the surface the harness would sample behind it.
const info = await p.evaluate(() => {
  const el = document.querySelector('.oryx-stat__label');
  const hero = document.querySelector('.oryx-hero');
  return {
    ink: getComputedStyle(el).color,
    textFaint: getComputedStyle(document.documentElement).getPropertyValue('--text-faint').trim(),
    bandTextFaint: getComputedStyle(document.documentElement).getPropertyValue('--band-text-faint').trim(),
  };
});
console.log('dark label ink   :', info.ink);
console.log('--text-faint     :', info.textFaint);
console.log('--band-text-faint:', info.bandTextFaint);

const inkRgb = info.ink.match(/\d+/g).map(Number);
// The harness samples the pixel behind the label; use the matrix's recorded value.
for (const [name, surf] of [
  ['matrix surface (dark)', [21, 37, 55]],
  ['gradient panel light end', [23, 38, 56]],
]) {
  console.log(`contrast vs ${name}:`, ratio(inkRgb, surf).toFixed(2));
}
console.log('contrast if ink were #6f8598:', ratio([0x6f, 0x85, 0x98], [21, 37, 55]).toFixed(2));
await b.close();
