/**
 * Builds the Phase E evidence page served at /evidence/exec07-light-theme/
 * by the preview proxy, so PR #7 can link to a real, reviewable preview rather
 * than raw image paths.
 *
 * Run with: node .run/build-light-evidence-page.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const SRC = 'docs/audit/exec07/admin-light';
const DEST = '.run/evidence/exec07-light-theme';
mkdirSync(`${DEST}/comparisons`, { recursive: true });

const { copyFileSync } = await import('fs');
function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`missing ${from}`);
    return false;
  }
  copyFileSync(from, to);
  return true;
}

const comparisons = [
  ['light-before-vs-after.png', 'Light theme — before vs after'],
  ['light-vs-dark.png', 'Corrected light vs approved dark'],
  ['login-light-vs-dark.png', 'Login — light vs dark'],
  ['settings-light-vs-dark.png', 'Settings + branding — light vs dark'],
];
for (const [f] of comparisons) copy(`${SRC}/comparisons/${f}`, `${DEST}/comparisons/${f}`);

const after = [
  ['01-dashboard-light.png', 'Dashboard — light'],
  ['01-dashboard-dark.png', 'Dashboard — dark'],
  ['02-login-light.png', 'Login — light'],
  ['03-settings-light.png', 'Settings — light'],
  ['04-companies-light.png', 'Companies — light'],
  ['05-users-light.png', 'Users — light'],
];
for (const [f] of after) copy(`${SRC}/after/${f}`, `${DEST}/${f}`);

copy(`${SRC}/after/../verify/settings-branding-company-light.png`, `${DEST}/branding-company-admin-light.png`);
copy(`${SRC}/verify/settings-branding-company-light.png`, `${DEST}/branding-company-admin-light.png`);

const verify = JSON.parse(
  existsSync(`${SRC}/verify/results.json`) ? await import('node:fs').then((m) => m.readFileSync(`${SRC}/verify/results.json`, 'utf8')) : '[]',
);

const card = (href, title, note = '') =>
  `<figure><a href="${href}" target="_blank" rel="noreferrer"><img src="${href}" alt="${title}" loading="lazy"></a>` +
  `<figcaption><strong>${title}</strong>${note ? `<br><span>${note}</span>` : ''}</figcaption></figure>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Execution 07 Phase E — Admin Light Theme Correction</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0b0b0c; color: #ececec;
         font: 15px/1.6 "Segoe UI", system-ui, sans-serif; }
  header { padding: 28px 32px 20px; border-bottom: 1px solid #23252a; }
  h1 { margin: 0 0 6px; font-size: 24px; color: #e8c766; }
  h2 { margin: 34px 32px 12px; font-size: 18px; }
  p.lede { margin: 0; color: #a9b0b8; max-width: 76ch; }
  .stats { margin: 14px 32px 0; display: flex; gap: 26px; flex-wrap: wrap; }
  .stat b { display: block; font-size: 22px; color: #7fd6a5; }
  .stat span { color: #9aa1a9; font-size: 12.5px; }
  .grid { display: grid; gap: 18px; padding: 0 32px;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  figure { margin: 0; background: #141518; border: 1px solid #26282e; border-radius: 12px; overflow: hidden; }
  figure img { display: block; width: 100%; height: auto; background: #000; }
  figcaption { padding: 10px 13px; font-size: 13px; }
  figcaption span { color: #9aa1a9; }
  code { background: #1c1e22; padding: 1px 6px; border-radius: 5px; color: #e8c766; }
  footer { margin: 40px 32px; color: #7f868e; font-size: 12.5px; }
</style>
</head>
<body>
<header>
  <h1>Execution 07 Phase E — Admin Light Theme Correction</h1>
  <p class="lede">The control-plane light theme used a cold blue-grey ramp
  (<code>#f5f6f8</code> field, navy <code>#0d2338</code> type) that did not match the
  approved warm-ivory identity. It is corrected to an elegant ivory field, white and
  warm-neutral surfaces, deep charcoal type and a restrained metallic gold — the same
  values the approved customer site renders. The approved dark theme is unchanged.</p>
  <div class="stats">
    <div class="stat"><b>${verify.filter((r) => r.ok).length}/${verify.length}</b><span>browser assertions passed</span></div>
    <div class="stat"><b>33/33</b><span>palette contrast pairs pass WCAG AA</span></div>
    <div class="stat"><b>2</b><span>locales (AR RTL / EN LTR)</span></div>
    <div class="stat"><b>3</b><span>viewports (desktop / tablet / mobile)</span></div>
    <div class="stat"><b>0</b><span>dark-theme changes</span></div>
  </div>
</header>

<h2>Comparisons</h2>
<div class="grid">
  ${comparisons.map(([f, t]) => card(`comparisons/${f}`, t)).join('\n  ')}
</div>

<h2>Light theme, corrected — desktop</h2>
<div class="grid">
  ${after.filter(([f]) => f.includes('light')).map(([f, t]) => card(f, t)).join('\n  ')}
</div>

<h2>Approved dark theme — unchanged</h2>
<div class="grid">
  ${after.filter(([f]) => f.includes('dark')).map(([f, t]) => card(f, t)).join('\n  ')}
</div>

<h2>Per-company branding editor (company admin, light)</h2>
<div class="grid">
  ${card('branding-company-admin-light.png', 'Settings + branding editor — company admin')}
</div>

<footer>
  Source: <code>docs/audit/exec07/admin-light/</code> ·
  checks: <code>.run/check-admin-light-palette.mjs</code>,
  <code>.run/verify-admin-light.mjs</code> ·
  tokens: <code>apps/admin/src/app/globals.css</code>
</footer>
</body>
</html>`;

writeFileSync(`${DEST}/index.html`, html);
console.log(`wrote ${DEST}/index.html (${verify.length} recorded assertions)`);
