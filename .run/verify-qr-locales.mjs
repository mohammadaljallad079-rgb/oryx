/**
 * Captures the public verification page in both locales and for an unknown
 * token, so the outcome strings (valid / not found) are shown to resolve from
 * the dictionary rather than rendering a raw key.
 */
import { chromium } from 'playwright';
const PREVIEW = process.env.PREVIEW_BASE ?? 'https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const OUT = '/workspace/project/oryx/.run/evidence/mandate-6';
const token = process.argv[2];
const browser = await chromium.launch();
const shots = [];
async function shot(name, url, locale) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const rawKey = /\b(valid|error|notfound|revoked|superseded|cancelled)Title\b/.test(text);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  shots.push({ name, rawKey, excerpt: text.slice(0, 160) });
  await ctx.close();
}
await shot('8-qr-verify-valid-en', `${PREVIEW}/verify/${token}`, 'en-GB');
await shot('8-qr-verify-notfound-en', `${PREVIEW}/verify/this-token-does-not-exist-000000`, 'en-GB');
await browser.close();
console.log(JSON.stringify(shots, null, 2));
process.exit(shots.every((s) => !s.rawKey) ? 0 : 1);
