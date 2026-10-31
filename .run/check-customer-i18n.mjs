/**
 * Guard for the customer i18n dictionary.
 *
 * The dictionary promises that "every key exists in both dictionaries; the UI
 * never falls back to a raw key". A missing key renders as the literal key in
 * the UI, which is how `common.delete` reached the profile page. This asserts
 * the promise: the two locales hold the same key set, and every key the source
 * references exists.
 *
 * Run with: node .run/check-customer-i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DICT = 'apps/customer/src/i18n/dictionaries.ts';
const SRC = 'apps/customer/src';

const source = readFileSync(DICT, 'utf8');

/** Returns the key set of one locale block, found by brace matching. */
function keysOf(locale) {
  const start = source.indexOf(`\n  ${locale}: {`);
  if (start < 0) throw new Error(`locale block ${locale} not found`);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return new Set([...source.slice(start, end).matchAll(/'([^']+)':/g)].map((m) => m[1]));
}

/** Collects every literal key passed to `t(...)` under the source tree. */
function usedKeys(dir, acc = new Set()) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) usedKeys(path, acc);
    else if (/\.tsx?$/.test(entry)) {
      for (const m of readFileSync(path, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) acc.add(m[1]);
    }
  }
  return acc;
}

const ar = keysOf('ar');
const en = keysOf('en');
const used = usedKeys(SRC);

const problems = [];
for (const key of ar) if (!en.has(key)) problems.push(`only in ar: ${key}`);
for (const key of en) if (!ar.has(key)) problems.push(`only in en: ${key}`);
for (const key of used) if (!ar.has(key)) problems.push(`used but undefined: ${key}`);

console.log(`ar keys=${ar.size} en keys=${en.size} used=${used.size}`);
if (problems.length) {
  for (const p of problems) console.log(`  FAIL ${p}`);
  process.exit(1);
}
console.log('OK: both locales are in step and every referenced key is defined');
