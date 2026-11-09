/** Quantitative sanity check on a screenshot: colour variety + non-blankness. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const file = process.argv[2];
const b64 = readFileSync(file).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<img id="i" src="data:image/png;base64,${b64}">`);
await page.waitForSelector('#i');
const stats = await page.evaluate(async () => {
  const img = document.getElementById('i');
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const buckets = new Set();
  let sum = 0;
  let gold = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    buckets.add(`${r >> 4},${g >> 4},${bl >> 4}`);
    sum += (r + g + bl) / 3;
    if (r > 140 && g > 110 && bl < 130 && r > bl + 40) gold++;
  }
  return {
    w: c.width,
    h: c.height,
    distinctColourBuckets: buckets.size,
    meanLuma: +(sum / total).toFixed(1),
    goldPixelPct: +((gold / total) * 100).toFixed(2),
  };
});
await browser.close();
console.log(file, JSON.stringify(stats));
