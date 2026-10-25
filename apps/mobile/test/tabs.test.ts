import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the two tab shells against a regression that shipped once already:
 * Expo Router turns *every* file under a tab group into a tab, so a route that is
 * only meant to be pushed onto the stack (a product detail, the cart, the
 * checkout, the merchant plan screen) silently becomes an extra tab whose label
 * is the raw route name. The fix is an explicit
 * `<Tabs.Screen name="…" options={{ href: null }} />` for each one, and this test
 * fails if a new route is added without it.
 *
 * The name Expo Router uses is the file path without its extension, so a nested
 * index is `orders/index`, not `orders`.
 */

const APP_DIR = join(__dirname, '..', 'src', 'app');

/** The shells that render a tab bar, with the destinations each one shows. */
const SHELLS = [
  { dir: '(tabs)', tabs: ['account', 'home', 'parts', 'sensage', 'services'] },
  { dir: 'merchant', tabs: ['dashboard', 'orders', 'products', 'profile', 'services'] },
];

/** Every route file under a shell, as the name expo-router registers it. */
function routeNames(shellDir: string, dir: string = join(APP_DIR, shellDir)): string[] {
  const names: string[] = [];
  const root = join(APP_DIR, shellDir);
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      names.push(...routeNames(shellDir, full));
      continue;
    }
    if (!entry.endsWith('.tsx') || entry === '_layout.tsx') continue;
    names.push(relative(root, full).slice(0, -'.tsx'.length).split(sep).join('/'));
  }
  return names.sort();
}

/** Every route file under `app`, as its router path and its real file path. */
function allRouteFiles(dir: string = APP_DIR): Array<{ path: string; file: string }> {
  const routes: Array<{ path: string; file: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routes.push(...allRouteFiles(full));
      continue;
    }
    if (!entry.endsWith('.tsx') || entry === '_layout.tsx') continue;
    const parts = relative(APP_DIR, full).slice(0, -'.tsx'.length).split(sep);
    // A `(group)` directory is not part of the URL.
    const path = parts.filter((p) => !(p.startsWith('(') && p.endsWith(')'))).join('/');
    if (path) routes.push({ path, file: full });
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}


/** The router path a shell route resolves to, e.g. `(tabs)/home` -> `home`. */
function routerPath(shellDir: string, route: string): string {
  return shellDir.startsWith('(') ? route : `${shellDir}/${route}`;
}

/** A route path split into segments, with group segments and a trailing `index` removed. */
function segments(path: string): string[] {
  return path
    .split('/')
    .filter((part) => part && !(part.startsWith('(') && part.endsWith(')')))
    .filter((part) => part !== 'index');
}

/** Every route file as a segment pattern, plus its `index`-less alias. */
function routePatterns(): string[][] {
  const patterns: string[][] = [];
  for (const { path } of allRouteFiles()) {
    const parts = segments(path);
    patterns.push(parts);
    // A dynamic segment matches anything, so `orders/[id]` and `orders/index`
    // both answer a push to `/orders`.
    if (path.endsWith('/index')) patterns.push(parts);
  }
  return patterns;
}

/** A router target as segments, with `${...}` interpolation kept as a wildcard. */
function normalizeTarget(raw: string): string[] {
  const withoutQuery = raw.replace(/\$\{[^}]*\}/g, '*').split('?')[0] ?? '';
  return segments(withoutQuery);
}

/** Whether a route pattern answers a target, treating `[param]` and `*` as one segment. */
function matches(pattern: string[], target: string[]): boolean {
  if (pattern.length !== target.length) return false;
  return pattern.every((part, i) => {
    const wanted = target[i] ?? '';
    return part.startsWith('[') || part === '*' || part === wanted;
  });
}

/** `name` values declared on a `<Tabs.Screen>` element. */
function declaredTabs(source: string): string[] {
  return [...source.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
}

/** `name` values declared with `href: null`, i.e. registered but not shown. */
function hiddenTabs(source: string): string[] {
  return [...source.matchAll(/<Tabs\.Screen\s+name="([^"]+)"\s+options=\{\{\s*href:\s*null/g)].flatMap(
    (m) => (m[1] === undefined ? [] : [m[1]]),
  );
}

describe.each(SHELLS)('the $dir tab shell', ({ dir, tabs }) => {
  const layout = readFileSync(join(APP_DIR, dir, '_layout.tsx'), 'utf8');

  it('declares every route in the group', () => {
    expect(declaredTabs(layout).sort()).toEqual(routeNames(dir));
  });

  it('shows exactly the expected destinations', () => {
    const shown = declaredTabs(layout).filter((name) => !hiddenTabs(layout).includes(name));
    expect(shown.sort()).toEqual(tabs);
  });

  it('hides every route that is not a destination', () => {
    const hidden = hiddenTabs(layout);
    for (const route of routeNames(dir)) {
      if (tabs.includes(route)) {
        expect(hidden, `${dir}/${route} must not be hidden`).not.toContain(route);
        continue;
      }
      expect(hidden, `${dir}/${route} needs href: null`).toContain(route);
    }
  });
});

describe('route tree', () => {
  it('gives every shell route a unique router path', () => {
    const seen = new Map<string, string>();
    for (const { dir } of SHELLS) {
      for (const route of routeNames(dir)) {
        const path = routerPath(dir, route);
        const previous = seen.get(path);
        expect(previous, `${path} is claimed by both ${previous} and ${dir}`).toBeUndefined();
        seen.set(path, dir);
      }
    }
  });

  it('gives the root stack one entry per shell and per auth screen', () => {
    const root = readFileSync(join(APP_DIR, '_layout.tsx'), 'utf8');
    const declared = [...root.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].flatMap((m) =>
      m[1] === undefined ? [] : [m[1]],
    );
    expect(declared.sort()).toEqual(['(tabs)', 'index', 'login', 'merchant', 'onboarding', 'register']);
  });

  it('resolves every literal router target to a real route file', () => {
    // A push to a route that does not exist fails at runtime, not at build time,
    // so every literal target is checked here against the filesystem. A
    // `${...}` interpolation stands for one dynamic segment, a group segment is
    // dropped, and a trailing `index` is optional.
    const routes = routePatterns();
    const sources = allRouteFiles().map((r) => r.file);
    sources.push(join(APP_DIR, '_layout.tsx'));
    for (const { dir } of SHELLS) sources.push(join(APP_DIR, dir, '_layout.tsx'));

    const missing: string[] = [];
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/router\.(?:push|replace)\(\s*[`'"]([^`'"]+)/g)) {
        const raw = match[1] ?? '';
        if (!raw || raw.startsWith('http')) continue;
        const target = normalizeTarget(raw);
        if (target.length === 0 || routes.some((r) => matches(r, target))) continue;
        missing.push(`${relative(APP_DIR, file)} -> ${raw}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
