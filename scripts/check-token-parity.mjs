/**
 * Compare each app's light/dark CSS blocks against the shared `ThemeTokens`
 * contract.
 *
 * The shared tokens are the documented single source of truth, and the customer
 * stylesheet is bound to them by `packages/shared/test/tokens.test.ts`. The admin
 * stylesheet is not. This reports, per app and per theme, how the two differ.
 *
 * Two rules keep the report honest:
 *
 *  - Only a token the app actually *reads* (`var(--x)`) is required. The band
 *    tokens describe the customer site's full-bleed hero and footer, which the
 *    admin shell does not render, so their absence there is not drift.
 *  - A value mismatch is graded by its largest RGB channel delta. The repository
 *    treats a delta of 12 or less as "no real colour shift" (the same tolerance
 *    `docs/audit/exec07/phase-e/after/dark-invariance.json` uses), so a
 *    near-black ink that differs by 12 is reported as within tolerance rather
 *    than as a violation.
 *
 * Usage: node scripts/check-token-parity.mjs
 */

import { readFileSync } from 'node:fs';
// The compiled shared package, so this runs without a TypeScript loader.
import { THEMES } from '../packages/shared/dist/tokens.js';

const APPS = {
  admin: 'apps/admin/src/app/globals.css',
  customer: 'apps/customer/src/app/globals.css',
};

/** The same token→variable mapping the shared parity test uses. */
const MAPPING = {
  background: '--bg',
  surface: '--surface',
  surfaceRaised: '--surface-raised',
  text: '--text',
  textMuted: '--text-muted',
  textInverse: '--text-inverse',
  gold: '--gold',
  goldHover: '--gold-hover',
  goldSoft: '--gold-soft',
  goldDeep: '--gold-deep',
  goldFillFrom: '--gold-fill-from',
  goldFillTo: '--gold-fill-to',
  goldFillHoverFrom: '--gold-fill-hover-from',
  goldFillHoverTo: '--gold-fill-hover-to',
  onGold: '--on-gold',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  info: '--info',
  band: '--band',
  bandFooter: '--band-footer',
  bandText: '--band-text',
  bandTextMuted: '--band-text-muted',
  bandTextFaint: '--band-text-faint',
  bandAccent: '--band-accent',
  bandBorder: '--band-border',
  goldOnTint: '--gold-on-tint',
  tintWash: '--tint-wash',
  tintFill: '--tint-fill',
  tintFocus: '--tint-focus',
  tintGlow: '--tint-glow',
  tintActive: '--tint-active',
  tintLine: '--tint-line',
  tintBadgeLine: '--tint-badge-line',
  tintRing: '--tint-ring',
  tintPanel: '--tint-panel',
};

const TOLERANCE = 12;

/**
 * Tokens the admin dark theme is *allowed* to set to its own value.
 *
 * The admin dark render is the approved baseline, so its gold-tint steps are the
 * percentages the rules already used (badge 15%/40%, collapsed nav 18%, nav
 * gradient 20%) rather than the customer site's. Centralising them under the
 * shared names is what removes the scattered overrides; keeping the values is
 * what keeps the approved dark render byte-identical. The light block is not
 * exempt and must match `LIGHT_THEME` exactly.
 */
const ALLOWED_DARK_DIVERGENCE = new Map([
  ['--tint-fill', 'admin dark badge fill keeps the approved 15%'],
  ['--tint-glow', 'admin dark nav gradient keeps the approved 20%'],
  ['--tint-active', 'admin dark collapsed-nav marker keeps the approved opaque 18%'],
  ['--tint-badge-line', 'admin dark badge border keeps the approved 40%'],
]);

function block(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) return {};
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    else if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) {
        const out = {};
        for (const m of css.slice(open + 1, j).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
          out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
        }
        return out;
      }
    }
  }
  return {};
}

function hex(value) {
  const h = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return null;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function delta(a, b) {
  const x = hex(a);
  const y = hex(b);
  if (!x || !y) return null;
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

let violations = 0;
for (const [app, path] of Object.entries(APPS)) {
  const css = readFileSync(path, 'utf8');
  const dark = block(css, ':root {');
  const light = block(css, ":root[data-theme='light']");
  const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));

  console.log(`\n=== ${app} (${path}) ===`);
  for (const themeName of ['dark', 'light']) {
    const vars = themeName === 'dark' ? dark : light;
    const tokens = THEMES[themeName];
    const missing = [];
    const withinTolerance = [];
    const allowedDark = [];
    const divergent = [];
    for (const [token, variable] of Object.entries(MAPPING)) {
      if (!used.has(variable)) continue;
      const expected = tokens[token];
      if (!(variable in vars)) {
        missing.push(variable);
        continue;
      }
      if (vars[variable] === expected) continue;
      if (app === 'admin' && themeName === 'dark' && ALLOWED_DARK_DIVERGENCE.has(variable)) {
        allowedDark.push(`${variable} css="${vars[variable]}" (${ALLOWED_DARK_DIVERGENCE.get(variable)})`);
        continue;
      }
      const d = delta(vars[variable], expected);
      if (d !== null && d <= TOLERANCE) {
        withinTolerance.push(`${variable} css="${vars[variable]}" shared="${expected}" delta=${d}`);
      } else {
        divergent.push(`${variable} css="${vars[variable]}" shared="${expected}" delta=${d ?? 'n/a'}`);
      }
    }
    console.log(
      `  ${themeName}: ${missing.length} missing, ${divergent.length} divergent, ` +
        `${withinTolerance.length} within tolerance`,
    );
    for (const m of missing) console.log(`      - missing ${m}`);
    for (const d of divergent) console.log(`      ! ${d}`);
    for (const t of withinTolerance) console.log(`      ~ ${t}`);
    for (const a of allowedDark) console.log(`      = ${a}`);
    violations += missing.length + divergent.length;
  }
}
console.log(`\n${violations} contract violation(s).`);
process.exit(violations > 0 ? 1 : 0);
