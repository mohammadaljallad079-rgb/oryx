import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Live mode must never render a demo record.
 *
 * The demo repository is the offline experience: it answers with invented
 * customers, orders, vehicles and products. A screen that reads it must also
 * read the session (`isLive` for the customer plane, `isSignedIn` for the
 * merchant plane) and branch on it, so the demo list is reachable only when
 * there is no server session. Without the branch a signed-in customer would see
 * a fabricated car beside their real one.
 *
 * This is a source-level guard on purpose: rendering every screen would need a
 * full navigation harness, and the invariant is structural — the session read
 * and the demo read must live in the same file.
 */

const APP_DIR = join(__dirname, '..', 'src', 'app');

/** Every screen file under `app`. */
function screens(dir: string = APP_DIR): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...screens(full));
      continue;
    }
    if (entry.endsWith('.tsx')) found.push(full);
  }
  return found;
}

/** Screens that legitimately read the demo repository with no session branch. */
const ALLOWED: Record<string, string> = {
  'onboarding.tsx': 'a pre-session screen; there is no session to branch on yet',
  'login.tsx': 'the sign-in form itself',
  'register.tsx': 'the registration form itself',
  'merchant-login.tsx': 'the merchant sign-in form itself',
  '_layout.tsx': 'a layout, not a screen',
};

describe('demo data is gated by the session', () => {
  const files = screens();

  it('finds the screens', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('every screen that reads the demo repository also reads the session', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const name = relative(APP_DIR, file).split(sep).join('/');
      const base = name.split('/').pop() ?? name;
      if (ALLOWED[base]) continue;
      const source = readFileSync(file, 'utf8');
      if (!/\brepository\./.test(source)) continue;
      if (/\bisLive\b/.test(source) || /\bisSignedIn\b/.test(source)) continue;
      offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('the allowlist names real files', () => {
    for (const name of Object.keys(ALLOWED)) {
      expect(files.some((f) => (relative(APP_DIR, f).split(sep).pop() ?? '') === name)).toBe(true);
    }
  });
});
