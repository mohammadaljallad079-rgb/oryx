/**
 * Lists every gold tint / gold mix in globals.css with the rule that owns it,
 * so the scattered percentages can be replaced by named tokens without changing
 * any rendered value.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('apps/customer/src/app/globals.css', 'utf8').split('\n');

let sel = '';
let depth = 0;
const rows = [];
for (let i = 0; i < css.length; i += 1) {
  const line = css[i];
  if (/^\s*[.:@#*]/.test(line) && line.includes('{')) {
    sel = line.trim();
    depth = 0;
  }
  const re = /color-mix\(in srgb,\s*var\((--[a-z-]+)\)\s*([0-9.]+%|var\([^)]*\))/g;
  let m;
  while ((m = re.exec(line))) {
    rows.push({ line: i + 1, sel, token: m[1], pct: m[2], text: line.trim() });
  }
}

const byPct = {};
for (const r of rows) {
  byPct[r.pct] ??= [];
  byPct[r.pct].push(r);
}
for (const pct of Object.keys(byPct).sort((a, b) => parseFloat(a) - parseFloat(b))) {
  console.log(`\n${pct}  (${byPct[pct].length} uses)`);
  for (const r of byPct[pct]) {
    console.log(`   L${r.line}  ${r.token}  ${r.sel.slice(0, 60)}`);
  }
}
