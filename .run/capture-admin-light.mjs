/**
 * Captures the admin control plane's light theme before and after the Phase E
 * palette correction, so the change is reviewable side by side.
 *
 * The admin light theme previously used a cold blue-grey ramp that did not
 * match the approved warm-ivory identity the customer site renders. These shots
 * document the inconsistency and the correction.
 *
 * Run with: node .run/capture-admin-light.mjs before|after
 *
 * The phase must be passed explicitly. Defaulting to `before` silently
 * overwrote the committed baseline on an accidental run, and the baseline is
 * the whole point of a before/after pair, so there is no default.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const PHASE = process.argv[2];
if (PHASE !== 'before' && PHASE !== 'after') {
  console.error('usage: node .run/capture-admin-light.mjs before|after');
  process.exit(2);
}
const BASE = process.env.ORYX_ADMIN_URL ?? 'http://127.0.0.1:12000';
const OUT = `docs/audit/exec07/admin-light/${PHASE}`;

// The `before` shots are a historical record of the pre-correction palette.
// Re-shooting them after the fix would destroy the comparison.
if (PHASE === 'before' && existsSync(`${OUT}/manifest.json`)) {
  console.error(
    `refusing to overwrite the existing baseline at ${OUT} — it is the pre-correction record.\n` +
      'Delete it deliberately if a new baseline is intended.',
  );
  process.exit(2);
}

const SUPER = { email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' };

mkdirSync(OUT, { recursive: true });

const SURFACES = [
  ['01-dashboard', '/dashboard', true],
  ['02-login', '/login', false],
  ['03-settings', '/settings', true],
  ['04-companies', '/companies', true],
  ['05-users', '/users', true],
];

function parseRgb(value) {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

function relLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b || a[3] < 1 || b[3] < 1) return null;
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

const manifest = [];

const browser = await chromium.launch();

for (const [name, path, needsAuth] of SURFACES) {
  for (const [theme, viewport] of [
    ['light', { width: 1440, height: 900 }],
    ['dark', { width: 1440, height: 900 }],
  ]) {
    const context = await browser.newContext({ viewport, locale: 'en-GB' });
    const page = await context.newPage();

    if (needsAuth) {
      await page.goto(`${BASE}/login`);
      await page.getByTestId('login-email').fill(SUPER.email);
      await page.getByTestId('login-password').fill(SUPER.password);
      await page.getByTestId('login-submit').click();
      await page.waitForURL('**/dashboard', { timeout: 30_000 });
    }

    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => window.localStorage.setItem('oryx.theme', t), theme);
    await page.evaluate((l) => window.localStorage.setItem('oryx.locale', l), 'en');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const file = `${OUT}/${name}-${theme}.png`;
    await page.screenshot({ path: file, fullPage: true });

    const measured = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const shell = document.querySelector('.oryx-shell');
      const card = document.querySelector('.oryx-card');
      const h1 = document.querySelector('h1');
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        dir: document.documentElement.getAttribute('data-dir'),
        bodyBg: body.backgroundColor,
        bodyColor: body.color,
        shellBg: shell ? getComputedStyle(shell).backgroundColor : null,
        cardBg: card ? getComputedStyle(card).backgroundColor : null,
        cardColor: card ? getComputedStyle(card).color : null,
        headingColor: h1 ? getComputedStyle(h1).color : null,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    manifest.push({
      surface: name,
      path,
      theme,
      file,
      ...measured,
      contrastBody: contrast(measured.bodyColor, measured.bodyBg),
      contrastCard: measured.cardBg && measured.cardColor ? contrast(measured.cardColor, measured.cardBg) : null,
    });
    await context.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Captured ${manifest.length} shots into ${OUT}`);
for (const m of manifest) {
  console.log(
    `${m.surface.padEnd(14)} ${m.theme.padEnd(5)} bodyBg=${m.bodyBg.padEnd(22)} text=${m.bodyColor.padEnd(20)} ratio=${m.contrastBody}`,
  );
}
