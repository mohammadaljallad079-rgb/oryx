/**
 * Find hard-coded colours in CSS rule bodies.
 *
 * The owner asked for "centralized theme tokens rather than scattered CSS
 * overrides". A literal colour written inside a rule body (rather than read from
 * a `var(--token)`) is exactly such a scattered override: it does not follow the
 * theme, so it is the usual cause of a light theme that looks inconsistent.
 *
 * Token *declarations* (`:root` blocks) are excluded — that is where literals
 * belong. Only rule bodies are scanned.
 *
 * Usage: node scripts/find-hardcoded-colors.mjs
 */

import { readFileSync } from 'node:fs';

const FILES = {
  admin: 'apps/admin/src/app/globals.css',
  customer: 'apps/customer/src/app/globals.css',
};

/** Remove every `:root ... { ... }` block so only rule bodies remain. */
function stripRootBlocks(css) {
  let out = css;
  const re = /:root[^{]*\{/g;
  let m;
  while ((m = re.exec(out))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let j = open; j < out.length; j += 1) {
      if (out[j] === '{') depth += 1;
      else if (out[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          out = out.slice(0, m.index) + ' '.repeat(j + 1 - m.index) + out.slice(j + 1);
          break;
        }
      }
    }
    re.lastIndex = 0;
  }
  return out;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;

for (const [app, path] of Object.entries(FILES)) {
  const raw = readFileSync(path, 'utf8');
  const body = stripRootBlocks(raw);
  const lines = body.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
    for (const match of line.matchAll(COLOR_RE)) {
      hits.push({ line: i + 1, value: match[0], text: trimmed.slice(0, 90) });
    }
  });

  const byValue = new Map();
  for (const h of hits) byValue.set(h.value, (byValue.get(h.value) ?? 0) + 1);
  const sorted = [...byValue.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\n=== ${app} (${path}) ===`);
  console.log(`  ${hits.length} hard-coded colour literal(s) in rule bodies, ${byValue.size} distinct`);
  for (const [value, n] of sorted.slice(0, 18)) {
    console.log(`    ${String(n).padStart(3)}x  ${value}`);
  }
  if (sorted.length > 18) console.log(`    ... ${sorted.length - 18} more distinct`);
}
