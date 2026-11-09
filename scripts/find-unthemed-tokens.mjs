/**
 * Find light-theme tokens that silently keep their dark value.
 *
 * A theme is switched by overriding custom properties under
 * `[data-theme='light']`. Any property that a rule *uses* but the light block
 * does not *declare* therefore keeps the `:root` (dark) value in light mode —
 * the exact mechanism that makes a light theme look "inconsistent": most of the
 * page is ivory and a few controls are still styled for navy.
 *
 * This reports, per app, the used-but-not-overridden set. It is a diagnostic.
 *
 * Usage: node scripts/find-unthemed-tokens.mjs
 */

import { readFileSync } from 'node:fs';

const FILES = {
  admin: 'apps/admin/src/app/globals.css',
  customer: 'apps/customer/src/app/globals.css',
};

/** Extract a top-level rule body by selector prefix. */
function block(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    else if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, j);
    }
  }
  return '';
}

function declared(body) {
  const out = new Set();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:/g)) out.add(m[1]);
  return out;
}

function used(css) {
  const out = new Set();
  // Only count reads (`var(--x)`), not the declarations themselves.
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) out.add(m[1]);
  return out;
}

for (const [app, path] of Object.entries(FILES)) {
  const css = readFileSync(path, 'utf8');
  const root = block(css, ':root {') || block(css, ':root{');
  const light = block(css, ":root[data-theme='light']");
  const usedTokens = used(css);
  const rootDeclared = declared(root);
  const lightDeclared = declared(light);

  const leaked = [...usedTokens]
    .filter((t) => rootDeclared.has(t) && !lightDeclared.has(t))
    .sort();

  console.log(`\n=== ${app} (${path}) ===`);
  console.log(`  declared in :root        ${rootDeclared.size}`);
  console.log(`  overridden in light      ${lightDeclared.size}`);
  console.log(`  used but NOT overridden  ${leaked.length}`);
  for (const t of leaked) console.log(`      ! ${t}`);
}
