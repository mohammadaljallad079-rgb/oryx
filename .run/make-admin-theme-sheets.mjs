/**
 * Builds the Phase E light-theme comparison sheets for the admin control plane:
 *
 *   1. light-before-vs-after.png  — the cold grey ramp against the corrected ivory
 *   2. light-vs-dark.png          — the corrected light theme beside the approved dark
 *
 * Each sheet is a labelled grid so a reviewer can see both the change and the
 * fact that the dark theme did not move.
 *
 * Run with: node .run/make-admin-theme-sheets.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const ROOT = 'docs/audit/exec07/admin-light';
const OUT = `${ROOT}/comparisons`;
mkdirSync(OUT, { recursive: true });

const PANEL_W = 700;

async function load(file, label) {
  const img = sharp(file).resize({ width: PANEL_W, withoutEnlargement: true });
  const { width, height } = await img.metadata();
  return { buffer: await img.png().toBuffer(), width, height, label };
}

/** Renders a caption strip above each panel. */
function caption(label, width) {
  return Buffer.from(
    `<svg width="${width}" height="34" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="34" fill="#111"/>` +
      `<text x="12" y="23" font-family="sans-serif" font-size="16" fill="#fff">${label}</text>` +
      `</svg>`,
  );
}

async function sheet(title, panels, outFile) {
  const cols = panels.length;
  const cellH = Math.max(...panels.map((p) => p.height)) + 34;
  const width = PANEL_W * cols;
  const height = cellH + 46;

  const composites = [];
  const titleSvg = Buffer.from(
    `<svg width="${width}" height="46" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="46" fill="#0a0a0a"/>` +
      `<text x="16" y="31" font-family="sans-serif" font-size="21" fill="#e8c766">${title}</text>` +
      `</svg>`,
  );
  composites.push({ input: titleSvg, top: 0, left: 0 });

  panels.forEach((p, i) => {
    const left = i * PANEL_W;
    composites.push({ input: caption(p.label, PANEL_W), top: 46, left });
    composites.push({ input: p.buffer, top: 80, left });
  });

  await sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .composite(composites)
    .png()
    .toFile(outFile);
  console.log(`wrote ${outFile}`);
}

// 1. Light theme before vs after.
const before = await load(`${ROOT}/before/01-dashboard-light.png`, 'BEFORE — cold blue-grey (#f5f6f8 field, navy type)');
const after = await load(`${ROOT}/after/01-dashboard-light.png`, 'AFTER — approved ivory (#f7f4ed field, charcoal type)');
await sheet('Admin Light Theme — Before vs After', [before, after], `${OUT}/light-before-vs-after.png`);

// 2. Corrected light vs approved dark.
const light = await load(`${ROOT}/after/01-dashboard-light.png`, 'LIGHT — elegant ivory, white surfaces, charcoal type');
const dark = await load(`${ROOT}/after/01-dashboard-dark.png`, 'DARK — approved, unchanged');
await sheet('Admin Theme — Corrected Light vs Approved Dark', [light, dark], `${OUT}/light-vs-dark.png`);

// 3. Login page, light vs dark.
const loginLight = await load(`${ROOT}/after/02-login-light.png`, 'LOGIN — light');
const loginDark = await load(`${ROOT}/after/02-login-dark.png`, 'LOGIN — dark');
await sheet('Admin Login — Light vs Dark', [loginLight, loginDark], `${OUT}/login-light-vs-dark.png`);

// 4. Settings (branding panel) light vs dark.
const setLight = await load(`${ROOT}/after/03-settings-light.png`, 'SETTINGS + BRANDING — light');
const setDark = await load(`${ROOT}/after/03-settings-dark.png`, 'SETTINGS + BRANDING — dark');
await sheet('Admin Settings — Light vs Dark', [setLight, setDark], `${OUT}/settings-light-vs-dark.png`);
