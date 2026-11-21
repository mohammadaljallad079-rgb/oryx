/**
 * Contact sheet of every captured mobile screen, so the whole app is reviewable
 * in one image. Groups the customer screens by locale and the merchant shell
 * separately.
 *
 * Images are inlined as data URIs. A `file://` subresource is not readable from
 * a `setContent` document (about:blank origin), so it silently renders an empty
 * box — the first version of this kind of script produced blank sheets.
 *
 * Run with: node .run/build-mobile-contact-sheet.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = 'docs/audit/exec07/marketplace-demo/screenshots';
const uri = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
const tile = (p, label) =>
  `<figure style="margin:0"><img src="${uri(p)}" style="width:100%;display:block;border:1px solid #333">` +
  `<figcaption style="font:12px system-ui;color:#c9a227;padding:3px 0">${label}</figcaption></figure>`;

const groups = [
  ['Customer · English LTR', `${SRC}/en`],
  ['Customer · Arabic RTL', `${SRC}/ar`],
  ['Merchant shell · English', `${SRC}/merchant`],
];

// The launch frame sits at the top level, not under a locale directory.
const launchFiles = readdirSync(SRC)
  .filter((f) => f.startsWith('launch-') && f.endsWith('.png'))
  .sort();

const sections = groups
  .map(([title, dir]) => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    return (
      `<h2 style="font:600 18px system-ui;color:#eee;margin:26px 0 10px">${title} · ${files.length} screens</h2>` +
      `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">` +
      files.map((f) => tile(resolve(dir, f), f.replace(/\.png$/, ''))).join('') +
      '</div>'
    );
  })
  .join('');

const total = groups.reduce((n, [, dir]) => n + readdirSync(dir).filter((f) => f.endsWith('.png')).length, 0) + launchFiles.length;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
await page.setContent(`<!doctype html><body style="margin:0;background:#111;padding:20px 24px">
  <h1 style="font:700 24px system-ui;color:#d4af37;margin:0">ORYX Marketplace — every screen</h1>
  <p style="font:14px system-ui;color:#9aa;margin:6px 0 0">${total} screens captured from the running Expo web build: the launch frame, the customer app in both locales, and the merchant shell.</p>
  <h2 style="font:600 18px system-ui;color:#eee;margin:26px 0 10px">Launch frame · ${launchFiles.length} screens</h2>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
    ${launchFiles.map((f) => tile(resolve(SRC, f), f.replace(/\.png$/, ''))).join('')}
  </div>
  ${sections}
</body>`);
await page.waitForTimeout(1500);
const out = `${SRC}/contact-sheet.png`;
await page.screenshot({ path: out, fullPage: true });
console.log(`wrote ${out}`);
await browser.close();
