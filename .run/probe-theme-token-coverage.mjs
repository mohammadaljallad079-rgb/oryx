/**
 * Find tokens that are used but defined in only one theme block.
 *
 * A token defined in the dark block and consumed by a rule, but absent from the
 * light block, does not "fall back to nothing" — the custom property inherits
 * from the dark block only if it is still in scope, which it is not, so the rule
 * renders its initial value or an earlier cascade value. Either way the light
 * theme silently shows a dark-tuned colour. This is the class of defect that
 * makes a light theme look "inconsistent" while every measured pair still passes.
 *
 * Usage: node .run/probe-theme-token-coverage.mjs <css-file>
 */
import { readFileSync } from 'fs';

const file = process.argv[2] ?? 'apps/customer/src/app/globals.css';
const css = readFileSync(file, 'utf8');

/** Extracts a top-level `selector { ... }` block body, brace-matched. */
function block(sel) {
  const i = css.indexOf(sel);
  if (i < 0) return '';
  const j = css.indexOf('{', i);
  let depth = 0, k = j;
  for (; k < css.length; k++) {
    if (css[k] === '{') depth++;
    else if (css[k] === '}') { depth--; if (depth === 0) break; }
  }
  return css.slice(j + 1, k);
}

function names(text) {
  const set = new Set();
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) set.add(m[1]);
  return set;
}

const dark = names(block(':root {'));
const light = names(block(":root[data-theme='light'] {"));

// Everything after both theme blocks is where rules consume tokens.
const afterLight = css.slice(css.indexOf(":root[data-theme='light'] {"));
const consumed = new Set();
for (const m of afterLight.matchAll(/var\((--[\w-]+)/g)) consumed.add(m[1]);

console.log(`file: ${file}`);
console.log(`dark tokens: ${dark.size}   light tokens: ${light.size}`);
console.log(`tokens consumed by rules: ${consumed.size}\n`);

let problems = 0;

console.log('USED BUT DEFINED IN ONLY ONE THEME BLOCK');
for (const t of [...consumed].sort()) {
  const inDark = dark.has(t);
  const inLight = light.has(t);
  if (inDark !== inLight) {
    console.log(`  ${t}  -> ${inDark ? 'dark only' : 'light only'}`);
    problems++;
  }
}
if (!problems) console.log('  (none)');

console.log('\nDEFINED IN A THEME BLOCK BUT NEVER CONSUMED AFTER THEM');
let dead = 0;
for (const t of [...new Set([...dark, ...light])].sort()) {
  if (!consumed.has(t) && !t.startsWith('--oryx-font')) {
    console.log(`  ${t}`);
    dead++;
  }
}
if (!dead) console.log('  (none)');

console.log(`\ntheme-coverage problems: ${problems}, unused tokens: ${dead}`);
process.exitCode = problems ? 1 : 0;
