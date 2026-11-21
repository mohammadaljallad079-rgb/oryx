import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Honesty guards for the P6/P7 surfaces.
 *
 * These are the two places where a screen could misrepresent the platform
 * without breaking a type: the SENSAGE analysis screen could present an
 * unreviewed model output as a diagnosis, and the fitment card could present
 * "no fitment data" as "does not fit". Both are source-level checks on purpose —
 * the invariant is structural and a rendering harness would not add anything the
 * source does not already state.
 */

const APP_DIR = join(__dirname, '..', 'src');

function read(relativePath: string): string {
  return readFileSync(join(APP_DIR, relativePath), 'utf8');
}

describe('SENSAGE analysis never presents a suggestion as a result', () => {
  const source = read('app/sensage/ai.tsx');

  it('labels the output by the server review state, not by local optimism', () => {
    // The badge is driven by `verified`/`reviewStatus` from the API.
    expect(source).toMatch(/suggestion\.verified/);
    expect(source).toMatch(/reviewStatus/);
  });

  it('offers the analysis only when a provider is actually configured', () => {
    expect(source).toMatch(/status\.data\?\.configured/);
    expect(source).toMatch(/configured \? \(/);
  });

  it('states plainly that an unconfigured provider produces nothing', () => {
    expect(source).toMatch(/sensageAiUnconfigured/);
  });
});

describe('fitment distinguishes unknown from incompatible', () => {
  const source = read('components/fitment.tsx');

  it('reads the server fitmentKnown flag rather than inferring it', () => {
    expect(source).toMatch(/result\.fitmentKnown/);
  });

  it('shows a distinct state for unknown fitment', () => {
    expect(source).toMatch(/fitmentUnknown/);
    expect(source).toMatch(/fitmentCompatible/);
    expect(source).toMatch(/fitmentIncompatible/);
  });

  it('is not rendered for a guest, who has no server-side garage', () => {
    const partDetail = read('app/parts/[id].tsx');
    expect(partDetail).toMatch(/\{isLive \? <FitmentCard/);
  });
});

describe('recovery tracking reads the server timeline', () => {
  const source = read('app/recovery/[id].tsx');

  it('renders the append-only trail the API returns', () => {
    expect(source).toMatch(/record\.timeline\.map/);
  });

  it('offers cancellation only when the server says the job is cancellable', () => {
    expect(source).toMatch(/record\.cancellable/);
  });

  it('polls rather than inventing a status locally while live', () => {
    expect(source).toMatch(/POLL_MS/);
    expect(source).toMatch(/live\.track\(/);
  });
});

describe('live recovery uses a real pickup point', () => {
  const source = read('app/recovery/index.tsx');

  it('requires saved coordinates instead of a free-text location', () => {
    expect(source).toMatch(/latitude != null/);
    expect(source).toMatch(/recovery\.create\(/);
    expect(source).toMatch(/pickupLatitude: point\.latitude/);
  });
});
