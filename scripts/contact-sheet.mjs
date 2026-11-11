/**
 * Build a contact sheet from a capture directory so the whole light-theme
 * surface set can be reviewed (and archived as evidence) in one image.
 *
 * Usage: node scripts/contact-sheet.mjs <captureDir> <outPng> [filterSubstring]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { chromium } from 'playwright';

const dir = process.argv[2];
const out = process.argv[3];
const filter = process.argv[4] ?? '';

if (!dir || !out || !existsSync(dir)) {
  console.error('usage: node scripts/contact-sheet.mjs <captureDir> <outPng> [filter]');
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.png') && f.includes(filter))
  .sort();

const cells = files
  .map((f) => {
    const b64 = readFileSync(join(dir, f)).toString('base64');
    return `<figure><img src="data:image/png;base64,${b64}" /><figcaption>${basename(f, '.png')}</figcaption></figure>`;
  })
  .join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; background:#0b1622; font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif; color:#dce6f0; }
  h1 { font-size:15px; padding:14px 18px; margin:0; letter-spacing:.06em; text-transform:uppercase; color:#d4af37; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:0 18px 22px; }
  figure { margin:0; background:#101d2b; border:1px solid rgba(212,175,55,.25); border-radius:8px; overflow:hidden; }
  img { width:100%; display:block; }
  figcaption { padding:7px 9px; font-size:11px; letter-spacing:.03em; color:#9fb3c8; }
</style></head><body>
<h1>${filter || 'all captures'} — ${files.length} shots</h1>
<div class="grid">${cells}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`${files.length} shots -> ${out}`);
