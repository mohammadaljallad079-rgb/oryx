import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the authenticated tab bar against a regression that shipped once
 * already: Expo Router turns *every* file under `(app)` into a tab, so a route
 * that is only meant to be pushed onto the stack (a detail screen, the booking
 * wizard, invoices) silently becomes an extra tab whose label is the raw route
 * name. The fix is an explicit `<Tabs.Screen name="…" options={{ href: null }} />`
 * for each one, and this test fails if a new route is added without it.
 *
 * The name Expo Router uses is the file path without its extension, so the
 * bookings tab is `bookings/index`, not `bookings`.
 */

const APP_DIR = join(__dirname, '..', 'src', 'app', '(app)');

/** Every route file under `(app)`, as the name expo-router registers it. */
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

/** `name` values declared on a `<Tabs.Screen>` element. */
function declaredTabs(source: string): string[] {
  return matchNames(source, /<Tabs\.Screen\s+name="([^"]+)"/g);
}

/** Names declared with `href: null`, i.e. registered but not shown in the bar. */
function hiddenTabs(source: string): string[] {
  return matchNames(
    source,
    /<Tabs\.Screen\s+name="([^"]+)"\s*\n?\s*options=\{\{\s*href:\s*null/g,
  );
}

/** The first capture group of every match, which is the route name. */
function matchNames(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

describe('authenticated tab bar', () => {
  it('declares every route under (app)', () => {
    expect(declaredTabs(layout).sort()).toEqual(routeNames());
  });

  it('shows exactly the five primary destinations', () => {
    const hidden = new Set(hiddenTabs(layout));
    const visible = declaredTabs(layout).filter((name) => !hidden.has(name));
    expect(visible.sort()).toEqual(['account', 'bookings/index', 'garage', 'index', 'services']);
  });

  it('keeps detail and wizard routes out of the tab bar', () => {
    expect(hiddenTabs(layout).sort()).toEqual([
      'bookings/new',
      'garage/[id]',
      'invoices',
      'notifications',
      'providers/[id]',
    ]);
  });
});
