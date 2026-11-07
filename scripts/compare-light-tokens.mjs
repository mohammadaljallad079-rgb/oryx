/**
 * Compare the light-theme CSS custom properties of the admin and customer apps.
 *
 * The two surfaces share one approved identity, so a token that exists in one
 * and not the other — or that carries a different value — is exactly the
 * "inconsistent light theme" the owner reported. This is a diagnostic, not a
 * test: it prints the drift so a correction can be measured.
 *
 * Usage: node scripts/compare-light-tokens.mjs
 */

import { readFileSync } from 'node:fs';

const FILES = {
  admin: 'apps/admin/src/app/globals.css',
  customer: 'apps/customer/src/app/globals.css',
};

function block(path, selector) {
  const css = readFileSync(path, 'utf8');
  const i = css.indexOf(selector);
  if (i < 0) return {};
  const open = css.indexOf('{', i);
  let depth = 0;
  let end = open;
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    else if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  const out = {};
  for (const m of css.slice(open + 1, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return out;
}

const admin = block(FILES.admin, ":root[data-theme='light']");
const customer = block(FILES.customer, ":root[data-theme='light']");
const keys = [...new Set([...Object.keys(admin), ...Object.keys(customer)])].sort();

let drift = 0;
console.log(`${''} ${'token'.padEnd(24)} ${'ADMIN'.padEnd(44)} CUSTOMER`);
for (const key of keys) {
  const a = admin[key] ?? '(missing)';
  const c = customer[key] ?? '(missing)';
  const same = a === c;
  if (!same) drift += 1;
  console.log(`${same ? ' ' : '!'} ${key.padEnd(24)} ${a.padEnd(44)} ${c}`);
}
console.log(`\ndrift: ${drift} of ${keys.length} tokens differ`);
