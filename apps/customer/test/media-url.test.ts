import { describe, expect, it } from 'vitest';

import { resolveImage } from '../src/lib/api';

/**
 * Guards a defect that shipped on the customer catalogue: the API returns media
 * as `/api/v1/cms/media/<id>/file`, a path relative to the API origin, and the
 * product and category screens rendered it verbatim. Because the website runs
 * on its own origin, the browser requested the *website* for that path and got a
 * 404 — every uploaded product photograph disappeared while the page still
 * looked structurally fine. `resolveImage` sends API paths to the API origin and
 * leaves bundled assets, which the site serves itself, on the site origin.
 */

describe('resolveImage', () => {
  it('points an API media path at the API origin, not the website origin', () => {
    expect(resolveImage('/api/v1/cms/media/abc/file?variant=card')).toBe(
      'http://localhost:3001/api/v1/cms/media/abc/file?variant=card',
    );
  });

  it('leaves a bundled site asset relative, so the base path still applies', () => {
    expect(resolveImage('/media/parts-store.jpg')).toBe('/media/parts-store.jpg');
    expect(resolveImage('/art/service-tyres.svg')).toBe('/art/service-tyres.svg');
  });

  it('returns an absolute URL unchanged', () => {
    const url = 'https://cdn.example.com/p/1.webp';
    expect(resolveImage(url)).toBe(url);
  });

  it('returns null for a missing image so a caller can fall back', () => {
    expect(resolveImage(null)).toBeNull();
    expect(resolveImage(undefined)).toBeNull();
    expect(resolveImage('')).toBeNull();
  });
});
