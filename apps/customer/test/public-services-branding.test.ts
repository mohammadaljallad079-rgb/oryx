import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dictionaries } from '../src/i18n/dictionaries';

/**
 * The public customer site must present the marketplace as ORYX services, not
 * as an independent third-party provider directory. The internal provider model
 * stays (approval, settlement, commission), but the customer never sees a
 * provider advertised as a separate business. This guard fails if public copy
 * drifts back to that framing.
 */

const PUBLIC_KEYS = [
  'nav.providers',
  'providers.title',
  'providers.subtitle',
  'providers.none',
  'services.subtitle',
  'categories.subtitle',
  'home.providersSubtitle',
  'home.ctaBrowse',
  'home.statProviders',
  'about.subtitle',
];

describe('public services branding', () => {
  it.each(PUBLIC_KEYS)('does not present an external provider on %s (English)', (key) => {
    const value = dictionaries.en[key];
    expect(value, `en ${key} is missing`).toBeTruthy();
    expect(/\bprovider(s)?\b/i.test(value), `en ${key} still says provider: "${value}"`).toBe(false);
  });

  it.each(PUBLIC_KEYS)('does not present an external provider on %s (Arabic)', (key) => {
    const value = dictionaries.ar[key];
    expect(value, `ar ${key} is missing`).toBeTruthy();
    expect(/مزود/.test(value), `ar ${key} still says مزود: "${value}"`).toBe(false);
  });

  it('names ORYX on the service-directory entry points', () => {
    expect(dictionaries.en['providers.title']).toContain('ORYX');
    expect(dictionaries.ar['providers.title']).toContain('ORYX');
    expect(dictionaries.en['nav.providers']).toContain('ORYX');
  });

  it('keeps the design-preview copy free of external-provider wording', () => {
    // `preview-data.ts` supplies the static preview copy; it must not
    // reintroduce the third-party provider framing either.
    const source = readFileSync(join(__dirname, '..', 'src', 'lib', 'preview-data.ts'), 'utf8');
    const publicCopy = source
      .split('\n')
      .filter((line) => /^\s*(ar|en):/.test(line) || /key: 'home\./.test(line));
    for (const line of publicCopy) {
      expect(/مزود/.test(line), `preview copy still says مزود: ${line.trim()}`).toBe(false);
      expect(/\bprovider(s)?\b/i.test(line), `preview copy still says provider: ${line.trim()}`).toBe(false);
    }
  });
});
