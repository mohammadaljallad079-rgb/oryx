/**
 * Builds the Phase E light-theme contact sheets.
 *
 * Two outputs:
 *   1. A light-vs-dark pair for each locale/viewport, so the reviewer can
 *      confirm the correction touched only the light theme.
 *   2. A light contact sheet of the four surfaces the owner asked to see.
 *
 * Images are inlined as data URIs. `page.setContent` runs on an about:blank
 * origin, which is not allowed to read `file://` subresources, so a file URL
 * renders as an empty box — the first version of this script produced sheets
 * that were entirely background for exactly that reason.
 *
 * Run with: node .run/build-phase-e-light-pairs.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = 'docs/audit/exec07/phase-e-light';
const OUT = `${SRC}/comparisons`;
const manifest = JSON.parse(readFileSync(`${SRC}/manifest.json`, 'utf8'));

const dataUri = (name) =>
  `data:image/png;base64,${readFileSync(resolve(SRC, `${name}.png`)).toString('base64')}`;

const card = (m, label, colour) =>
  `<div><div style="padding:4px 8px;color:${colour};font-weight:600">${label}</div>` +
  `<img src="${dataUri(m.name)}" style="width:100%;display:block;border:1px solid #444"></div>`;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1520, height: 1000 } });

const written = [];

// 1. Light vs dark, same locale and viewport.
for (const dark of manifest.filter((m) => m.theme === 'dark')) {
  const light = manifest.find(
    (m) => m.theme === 'light' && m.locale === dark.locale && m.viewport === dark.viewport,
  );
  if (!light) continue;
  const title = `homepage · ${dark.locale.toUpperCase()} · ${dark.viewport}`;
  await page.setContent(`<!doctype html><body style="margin:0;font:15px system-ui;background:#111;color:#eee">
    <div style="padding:10px 16px;font-weight:600">${title} — LIGHT (corrected) vs DARK (control, unchanged)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 6px 6px">
      ${card(light, 'LIGHT', '#c9a227')}
      ${card(dark, 'DARK', '#d4af37')}
    </div></body>`);
  await page.waitForTimeout(700);
  const file = `${OUT}/${dark.locale}-${dark.viewport}-light-vs-dark.png`;
  await page.screenshot({ path: file, fullPage: true });
  written.push(file);
  console.log(`pair   ${file}`);
}

// 2. The four surfaces, light theme, desktop and handset.
const tiles = [];
for (const surface of ['01-home', '02-dashboard', '03-providers', '04-login']) {
  for (const viewport of ['desktop', 'mobile']) {
    const m = manifest.find(
      (x) => x.name.startsWith(surface) && x.viewport === viewport && x.locale === 'en' && x.theme === 'light',
    );
    if (m) tiles.push(card(m, `${surface} · ${viewport}`, '#c9a227'));
  }
}
await page.setContent(`<!doctype html><body style="margin:0;font:15px system-ui;background:#111;color:#eee">
  <div style="padding:10px 16px;font-weight:600">Execution 07 Phase E — light theme, the four review surfaces</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 6px 6px">${tiles.join('')}</div>
</body>`);
await page.waitForTimeout(700);
const sheet = `${OUT}/light-surfaces-contact-sheet.png`;
await page.screenshot({ path: sheet, fullPage: true });
written.push(sheet);
console.log(`sheet  ${sheet}`);

writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify({ sheets: written }, null, 2)}\n`);
console.log(`\n${written.length} sheets written to ${OUT}`);
await browser.close();
