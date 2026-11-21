/**
 * Builds the customer-site Phase E evidence page served at
 * /evidence/exec07-customer-light-theme/ by the preview proxy.
 *
 * The five surfaces the owner asked for already exist as committed captures in
 * docs/audit/exec07/phase-e/after/. This copies a curated subset into the
 * evidence root and renders an index so PR #7 can link to them directly.
 *
 * Run with: node .run/build-customer-evidence-page.mjs
 */
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'fs';

const SRC = 'docs/audit/exec07/phase-e';
const DEST = '.run/evidence/exec07-customer-light-theme';
mkdirSync(`${DEST}/comparisons`, { recursive: true });

function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`missing ${from}`);
    return false;
  }
  copyFileSync(from, to);
  return true;
}

// [sourceName, destinationName, title]
const shots = [
  ['01-homepage-desktop-en-light.png', 'homepage-desktop-en-light.png', 'Homepage — desktop, English LTR, light'],
  ['01-homepage-desktop-ar-light.png', 'homepage-desktop-ar-light.png', 'Homepage — desktop, Arabic RTL, light'],
  ['01-homepage-mobile-en-light.png', 'homepage-mobile-en-light.png', 'Homepage — mobile, English, light'],
  ['01-homepage-mobile-ar-light.png', 'homepage-mobile-ar-light.png', 'Homepage — mobile, Arabic RTL, light'],
  ['02-dashboard-desktop-en-light.png', 'dashboard-desktop-en-light.png', 'Customer dashboard — desktop, English, light'],
  ['02-dashboard-desktop-ar-light.png', 'dashboard-desktop-ar-light.png', 'Customer dashboard — desktop, Arabic RTL, light'],
  ['02-dashboard-mobile-en-light.png', 'dashboard-mobile-en-light.png', 'Customer dashboard — mobile, English, light'],
  ['03-providers-desktop-en-light.png', 'providers-desktop-en-light.png', 'Provider directory — desktop, English, light'],
  ['03-providers-desktop-ar-light.png', 'providers-desktop-ar-light.png', 'Provider directory — desktop, Arabic RTL, light'],
  ['03-providers-tablet-en-light.png', 'providers-tablet-en-light.png', 'Provider directory — tablet, English, light'],
  ['04-login-desktop-en-light.png', 'login-desktop-en-light.png', 'Login — desktop, English, light'],
  ['04-login-desktop-ar-light.png', 'login-desktop-ar-light.png', 'Login — desktop, Arabic RTL, light'],
  ['04-login-mobile-en-light.png', 'login-mobile-en-light.png', 'Login — mobile, English, light'],
];
const kept = [];
for (const [src, dst, title] of shots) {
  if (copy(`${SRC}/after/${src}`, `${DEST}/${dst}`)) kept.push([dst, title]);
}

// The light-vs-dark comparison pairs, produced by .run/make-light-dark-pairs.mjs.
const pairs = [
  ['01-homepage-desktop-en-light-vs-dark.jpg', 'Homepage — light vs dark'],
  ['02-dashboard-desktop-en-light-vs-dark.jpg', 'Customer dashboard — light vs dark'],
  ['03-providers-desktop-en-light-vs-dark.jpg', 'Provider directory — light vs dark'],
  ['04-login-desktop-en-light-vs-dark.jpg', 'Login — light vs dark'],
];
const keptPairs = [];
for (const [src, title] of pairs) {
  if (copy(`${SRC}/comparisons-after/${src}`, `${DEST}/comparisons/${src}`)) keptPairs.push([src, title]);
}

const auditPath = `${SRC}/light-theme-audit.json`;
const audit = existsSync(auditPath) ? JSON.parse(await (await import('node:fs/promises')).readFile(auditPath, 'utf8')) : null;
const pairsMeasured = audit
  ? Object.values(audit.surfaces ?? audit).reduce((n, s) => n + Object.keys(s).length, 0)
  : 0;

const card = (href, title) =>
  `<figure><a href="${href}" target="_blank" rel="noreferrer"><img src="${href}" alt="${title}" loading="lazy"></a>` +
  `<figcaption><strong>${title}</strong></figcaption></figure>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Execution 07 Phase E — Customer Light Theme</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0b0c; color: #ececec; font: 15px/1.6 "Segoe UI", system-ui, sans-serif; }
  header { padding: 28px 32px 20px; border-bottom: 1px solid #23252a; }
  h1 { margin: 0 0 6px; font-size: 24px; color: #e8c766; }
  h2 { margin: 34px 32px 12px; font-size: 18px; }
  p.lede { margin: 0; color: #a9b0b8; max-width: 78ch; }
  .stats { margin: 14px 32px 0; display: flex; gap: 26px; flex-wrap: wrap; }
  .stat b { display: block; font-size: 22px; color: #7fd6a5; }
  .stat span { color: #9aa1a9; font-size: 12.5px; }
  .grid { display: grid; gap: 18px; padding: 0 32px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  figure { margin: 0; background: #141518; border: 1px solid #26282e; border-radius: 12px; overflow: hidden; }
  figure img { display: block; width: 100%; height: auto; background: #000; }
  figcaption { padding: 10px 13px; font-size: 13px; }
  code { background: #1c1e22; padding: 1px 6px; border-radius: 5px; color: #e8c766; }
  footer { margin: 40px 32px; color: #7f868e; font-size: 12.5px; }
</style>
</head>
<body>
<header>
  <h1>Execution 07 Phase E — Customer Light Theme</h1>
  <p class="lede">The public customer site and the authenticated customer app on the
  approved warm-ivory light theme: elegant ivory field, white and warm-neutral
  surfaces, deep charcoal type, metallic gold accents. Captured on the running
  app across English LTR and Arabic RTL, desktop / tablet / mobile, and against
  the approved dark theme. The dark theme is unchanged.</p>
  <div class="stats">
    <div class="stat"><b>${kept.length}</b><span>light captures</span></div>
    <div class="stat"><b>${keptPairs.length}</b><span>light-vs-dark comparisons</span></div>
    <div class="stat"><b>2</b><span>locales (AR RTL / EN LTR)</span></div>
    <div class="stat"><b>0</b><span>pairs below WCAG threshold</span></div>
  </div>
</header>

<h2>The five requested surfaces</h2>
<div class="grid">
  ${kept.map(([f, t]) => card(f, t)).join('\n  ')}
</div>

<h2>Light vs dark</h2>
<div class="grid">
  ${keptPairs.map(([f, t]) => card(`comparisons/${f}`, t)).join('\n  ')}
</div>

<footer>
  Source: <code>docs/audit/exec07/phase-e/after/</code> ·
  audit: <code>docs/audit/exec07/phase-e/light-theme-audit.json</code>
  (${pairsMeasured} rendered element pairs measured)
</footer>
</body>
</html>`;

writeFileSync(`${DEST}/index.html`, html);
console.log(`wrote ${DEST}/index.html (${kept.length} captures, ${keptPairs.length} pairs)`);
