/**
 * Admin light-theme warm/cool neutral probe.
 *
 * The owner's complaint is that the light theme "looks inconsistent". The
 * failure mode the Phase E report names is a *cold* blue-grey neutral surviving
 * somewhere in a *warm* ivory system: every pair still passes WCAG, but the page
 * reads as two palettes stitched together.
 *
 * This walks the admin control plane in the light theme, reads every rendered
 * background and text colour, and classifies each near-neutral (low saturation)
 * value as warm (r > b), cool (b > r) or true grey. A cool neutral in a warm
 * system is a defect row.
 *
 * Usage: node .run/probe-admin-warm-neutrals.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_ADMIN_URL ?? 'http://127.0.0.1:12000';
const USER = {
  email: process.env.ORYX_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.ORYX_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};
const PATHS = ['/dashboard', '/companies', '/users', '/providers', '/settings', '/accounting', '/inventory', '/hr', '/crm'];

function parseColor(v) {
  if (!v) return null;
  const srgb = v.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (srgb) return [srgb[1], srgb[2], srgb[3]].map((c) => parseFloat(c) * 255).concat([srgb[4] ? parseFloat(srgb[4]) : 1]);
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

/** A near-neutral is one whose channels differ by less than this. */
const NEUTRAL_SPREAD = 26;
/** A warm/cool skew below this on a neutral is treated as noise, not identity. */
const SKEW_FLOOR = 3;

function classify([r, g, b, a]) {
  if (a < 0.5) return null;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread > NEUTRAL_SPREAD) return null; // a tinted/status colour, not a neutral
  const skew = r - b;
  if (Math.abs(skew) < SKEW_FLOOR) return { kind: 'grey', skew, rgb: [r, g, b] };
  return { kind: skew > 0 ? 'warm' : 'cool', skew, rgb: [r, g, b] };
}

const rgbKey = ([r, g, b]) => `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', USER.email);
await page.fill('input[type="password"]', USER.password);
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('oryx.theme', 'light'));

const found = new Map();

for (const path of PATHS) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      for (const prop of ['backgroundColor', 'color', 'borderTopColor']) {
        const v = cs[prop];
        if (!v || v === 'rgba(0, 0, 0, 0)') continue;
        out.push({ prop, value: v });
      }
    }
    return out;
  });
  for (const { prop, value } of rows) {
    const c = parseColor(value);
    if (!c) continue;
    const cls = classify(c);
    if (!cls) continue;
    const key = `${cls.kind}|${rgbKey(cls.rgb)}`;
    if (!found.has(key)) found.set(key, { ...cls, prop, path, value });
  }
}

const groups = { warm: [], cool: [], grey: [] };
for (const v of found.values()) groups[v.kind].push(v);

console.log('ADMIN LIGHT THEME — NEUTRAL IDENTITY\n');
for (const kind of ['warm', 'grey', 'cool']) {
  console.log(`${kind.toUpperCase()} neutrals: ${groups[kind].length}`);
  for (const v of groups[kind].sort((a, b) => b.skew - a.skew)) {
    console.log(`  rgb(${v.rgb.map(Math.round).join(', ')})  skew ${Math.round(v.skew)}  ${v.prop}  (${v.path})`);
  }
  console.log('');
}

if (groups.cool.length) {
  console.log(`DEFECT: ${groups.cool.length} cool neutral(s) in a warm ivory system.`);
  process.exitCode = 1;
} else {
  console.log('OK: no cool neutral found; every neutral is warm or true grey.');
}

await browser.close();
