/**
 * Mirrors the committed marketplace screenshot gallery into the servable
 * evidence root, so the preview proxy shows exactly what GitHub has rather than
 * a stale copy from an earlier session.
 *
 * Run with: node .run/sync-committed-screenshots.mjs
 */
import { mkdirSync, copyFileSync, readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';

const SRC = 'docs/audit/exec07/marketplace-demo/screenshots';
const DEST = '.run/evidence/exec07-phase-e/marketplace-screens';

mkdirSync(DEST, { recursive: true });
for (const dir of ['en', 'ar', 'merchant']) {
  mkdirSync(`${DEST}/${dir}`, { recursive: true });
  for (const f of readdirSync(`${SRC}/${dir}`)) {
    if (f.endsWith('.png')) copyFileSync(`${SRC}/${dir}/${f}`, `${DEST}/${dir}/${f}`);
  }
}
for (const f of ['contact-sheet.png', 'manifest.json']) {
  if (existsSync(`${SRC}/${f}`)) copyFileSync(`${SRC}/${f}`, `${DEST}/${f}`);
}

// The launch frame lives at the top level, not under a locale directory.
for (const f of readdirSync(SRC)) {
  if (f.startsWith('launch-') && f.endsWith('.png')) copyFileSync(`${SRC}/${f}`, `${DEST}/${f}`);
}

const manifest = JSON.parse(readFileSync(`${SRC}/manifest.json`, 'utf8'));
const isLaunch = (x) => x.name.startsWith('launch-');
const groups = [
  ['Launch frame', '', manifest.filter(isLaunch)],
  ['Customer — English (LTR)', 'en', manifest.filter((x) => x.locale === 'en' && !x.route.startsWith('/merchant') && !isLaunch(x))],
  ['Customer — Arabic (RTL)', 'ar', manifest.filter((x) => x.locale === 'ar' && !x.route.startsWith('/merchant') && !isLaunch(x))],
  ['Merchant shell', 'merchant', manifest.filter((x) => x.route.startsWith('/merchant'))],
];

const sections = groups
  .map(
    ([title, dir, items]) => `  <h2>${title} <span class="n">${items.length}</span></h2>
  <div class="grid">
${items
  .map(
    (x) =>
      `    <figure><img src="${dir ? `${dir}/` : ''}${x.name}.png" alt="${x.label}" loading="lazy"><figcaption>${x.label}<code>${x.route}</code></figcaption></figure>`,
  )
  .join('\n')}
  </div>`,
  )
  .join('\n');

writeFileSync(
  `${DEST}/index.html`,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ORYX Marketplace — every screen</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px; background:#f7f4ed; color:#22201d;
         font:15px/1.5 ui-sans-serif,system-ui,sans-serif; }
  h1 { font-size:26px; margin:0 0 4px; }
  .lede { color:#6b655c; max-width:70ch; }
  h2 { font-size:18px; margin:36px 0 12px; border-bottom:2px solid #d4af37; padding-bottom:6px; }
  .n { color:#7d5f10; font-weight:400; font-size:14px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
  figure { margin:0; background:#fff; border:1px solid #e4ded2; border-radius:10px; overflow:hidden; }
  img { width:100%; display:block; }
  figcaption { padding:8px 10px; font-size:13px; display:flex; flex-direction:column; gap:2px; }
  code { color:#7d5f10; font-size:11px; }
  .sheet img { border-radius:10px; border:1px solid #e4ded2; }
</style></head><body>
<h1>ORYX Marketplace — every screen</h1>
<p class="lede">${manifest.length} screens captured from the running app: the
light theme, both languages, plus the merchant shell. Committed to
<code>docs/audit/exec07/marketplace-demo/screenshots/</code>.</p>
${sections}
<h2>Contact sheet</h2>
<div class="sheet"><img src="contact-sheet.png" alt="All screens"></div>
</body></html>
`,
);
console.log(`synced ${manifest.length} screens to ${DEST}`);
