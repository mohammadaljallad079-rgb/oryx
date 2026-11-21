/**
 * Compares the custom properties defined in the dark `:root` block with those
 * in the light `:root[data-theme='light']` block.
 *
 * A token defined in one and not the other is exactly how a light theme leaks a
 * dark value: the light block inherits the dark declaration. Also reports any
 * `var(--x)` used in a rule with no declaration anywhere, which is how a theme
 * silently falls back to a hardcoded value.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(process.argv[2] ?? 'apps/customer/src/app/globals.css', 'utf8');

/** Extracts `--name: value;` pairs from a block that starts at `start`. */
function block(startIndex) {
  const open = css.indexOf('{', startIndex);
  let depth = 0;
  let i = open;
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return css.slice(open + 1, i);
}

const rootIdx = css.indexOf(':root {');
const lightIdx = css.indexOf(":root[data-theme='light']");

const decls = (text) => {
  const out = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(text))) out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  return out;
};

const dark = decls(block(rootIdx));
const light = decls(block(lightIdx));

const onlyDark = [...dark.keys()].filter((k) => !light.has(k));
const onlyLight = [...light.keys()].filter((k) => !dark.has(k));

console.log(`dark tokens: ${dark.size}   light tokens: ${light.size}`);
console.log(`\nonly in dark (light inherits the dark value): ${onlyDark.length}`);
for (const k of onlyDark) console.log(`  ${k} = ${dark.get(k)}`);
console.log(`\nonly in light: ${onlyLight.length}`);
for (const k of onlyLight) console.log(`  ${k} = ${light.get(k)}`);

// Which of the "only in dark" tokens are actually consumed by a rule?
const body = css.slice(css.indexOf('}', css.indexOf(":root[data-theme='light']")));
console.log('\nconsumed by a rule after the theme blocks:');
for (const k of onlyDark) {
  const uses = [...body.matchAll(new RegExp(`var\\(${k}[,)]`, 'g'))].length;
  if (uses) console.log(`  ${k}  used ${uses}x`);
}
