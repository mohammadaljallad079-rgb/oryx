import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the ERP tab bar.
 *
 * Expo Router registers *every* file under `(app)` as a tab, so a route that is
 * only pushed onto the stack — the record list, a detail screen — becomes an
 * extra tab labelled with its raw route name unless it is declared with
 * `href: null`. This test fails when a route is added without that declaration.
 *
 * The registered name is the file path without its extension, so a nested route
 * keeps its directory segment (`browse/[resource]`).
 */

const APP_DIR = join(__dirname, '..', 'src', 'app', '(app)');

function routeNames(dir: string = APP_DIR): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      names.push(...routeNames(full));
      continue;
    }
    if (!entry.endsWith('.tsx') || entry === '_layout.tsx') continue;
    names.push(relative(APP_DIR, full).slice(0, -'.tsx'.length).split(sep).join('/'));
  }
  return names.sort();
}

const layout = readFileSync(join(APP_DIR, '_layout.tsx'), 'utf8');

function matchNames(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

function declaredTabs(source: string): string[] {
  return matchNames(source, /<Tabs\.Screen\s+name="([^"]+)"/g);
}

function hiddenTabs(source: string): string[] {
  return matchNames(source, /<Tabs\.Screen\s+name="([^"]+)"\s*\n?\s*options=\{\{\s*href:\s*null/g);
}

describe('authenticated tab bar', () => {
  it('declares every route under (app)', () => {
    expect(declaredTabs(layout).sort()).toEqual(routeNames());
  });

  it('shows exactly the five primary destinations', () => {
    const hidden = new Set(hiddenTabs(layout));
    const visible = declaredTabs(layout).filter((name) => !hidden.has(name));
    expect(visible.sort()).toEqual(['account', 'index', 'invoice', 'records', 'transfer']);
  });

  it('keeps the record browser out of the tab bar', () => {
    expect(hiddenTabs(layout).sort()).toEqual(['browse/[resource]']);
  });
});
