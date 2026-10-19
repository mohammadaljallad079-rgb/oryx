import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DARK_THEME, LIGHT_THEME, THEMES } from '../src/tokens';

/**
 * Invariants the light theme depends on.
 *
 * The owner reported that the light theme "still looked inconsistent". The
 * cause was structural rather than a single wrong hex: gold was one token doing
 * two incompatible jobs (accent text on a light surface, and a metallic fill
 * carrying dark ink), and the photo scrims were dark in both themes, so charcoal
 * captions landed on a dark scrim.
 *
 * These tests pin the two things that regression-proof the fix:
 *  1. every foreground/background pair the theme renders meets WCAG 2.1; and
 *  2. the CSS custom properties in both apps stay equal to these tokens, so the
 *     documented "single source of truth" is actually enforced.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function hexToRgb(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Parses the solid colour of an `rgb()`/`rgba()` value; null when translucent. */
function opaqueRgb(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length > 3 && parts[3] < 1) return null;
  return [parts[0], parts[1], parts[2]];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, or null when either colour is translucent. */
function contrast(foreground: string, background: string): number | null {
  const fg = opaqueRgb(foreground) ?? hexToRgb(foreground);
  const bg = opaqueRgb(background) ?? hexToRgb(background);
  if (!fg || !bg) return null;
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads a `:root[data-theme='light']` block and returns its custom properties. */
function readThemeBlock(cssPath: string, theme: string): Record<string, string> {
  const css = readFileSync(cssPath, 'utf8');
  const marker = theme === 'dark' ? ':root {' : `:root[data-theme='${theme}'] {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`${marker} not found in ${cssPath}`);
  const end = css.indexOf('}', start);
  const body = css.slice(start + marker.length, end);
  const vars: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/i);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

const CUSTOMER_CSS = resolve(repoRoot, 'apps/customer/src/app/globals.css');

describe('theme token contract', () => {
  it('exposes both themes through the THEMES map', () => {
    expect(THEMES.dark).toBe(DARK_THEME);
    expect(THEMES.light).toBe(LIGHT_THEME);
  });

  it('keeps the accent gold distinct from the metallic fill in light theme', () => {
    // The original bug: one gold served both roles, so a fill light enough for
    // dark ink was too light to read as text, and vice versa.
    expect(LIGHT_THEME.gold).not.toBe(LIGHT_THEME.goldFillTo);
    const asText = contrast(LIGHT_THEME.gold, LIGHT_THEME.background);
    const asFill = contrast(LIGHT_THEME.textInverse, LIGHT_THEME.goldFillTo);
    expect(asText).toBeGreaterThanOrEqual(4.5);
    expect(asFill).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens the accent gold on hover rather than lightening it', () => {
    // On a light surface a lighter hover colour loses contrast.
    const base = luminance(hexToRgb(LIGHT_THEME.gold)!);
    const hover = luminance(hexToRgb(LIGHT_THEME.goldHover)!);
    expect(hover).toBeLessThan(base);
    expect(contrast(LIGHT_THEME.goldHover, LIGHT_THEME.background)!).toBeGreaterThanOrEqual(4.5);
  });

  const lightPairs: Array<[string, string, string, number]> = [
    ['body text on ivory page', LIGHT_THEME.text, LIGHT_THEME.background, 4.5],
    ['body text on white card', LIGHT_THEME.text, LIGHT_THEME.surface, 4.5],
    ['body text on warm neutral', LIGHT_THEME.text, LIGHT_THEME.surfaceRaised, 4.5],
    ['muted text on ivory page', LIGHT_THEME.textMuted, LIGHT_THEME.background, 4.5],
    ['muted text on white card', LIGHT_THEME.textMuted, LIGHT_THEME.surface, 4.5],
    ['muted text on warm neutral', LIGHT_THEME.textMuted, LIGHT_THEME.surfaceRaised, 4.5],
    ['faint text on white (table head)', LIGHT_THEME.text, LIGHT_THEME.surface, 4.5],
    ['accent gold on ivory page', LIGHT_THEME.gold, LIGHT_THEME.background, 4.5],
    ['accent gold on white card', LIGHT_THEME.gold, LIGHT_THEME.surface, 4.5],
    ['accent gold on warm neutral', LIGHT_THEME.gold, LIGHT_THEME.surfaceRaised, 4.5],
    ['ink on metallic fill start', LIGHT_THEME.textInverse, LIGHT_THEME.goldFillFrom, 4.5],
    ['ink on metallic fill end', LIGHT_THEME.textInverse, LIGHT_THEME.goldFillTo, 4.5],
    ['ink on hover fill start', LIGHT_THEME.textInverse, LIGHT_THEME.goldFillHoverFrom, 4.5],
    ['ink on hover fill end', LIGHT_THEME.textInverse, LIGHT_THEME.goldFillHoverTo, 4.5],
    ['success on white card', LIGHT_THEME.success, LIGHT_THEME.surface, 4.5],
    ['warning on white card', LIGHT_THEME.warning, LIGHT_THEME.surface, 4.5],
    ['danger on white card', LIGHT_THEME.danger, LIGHT_THEME.surface, 4.5],
    ['info on white card', LIGHT_THEME.info, LIGHT_THEME.surface, 4.5],
  ];

  it.each(lightPairs)('meets WCAG 2.1 for %s', (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('keeps the dark theme surface/text pairs readable', () => {
    expect(contrast(DARK_THEME.text, DARK_THEME.background)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DARK_THEME.text, DARK_THEME.surface)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DARK_THEME.textMuted, DARK_THEME.background)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DARK_THEME.textInverse, DARK_THEME.goldFillTo)!).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the approved dark theme ink on gold unchanged', () => {
    // The dark primary button and brand mark render `--on-gold` over the gold
    // fill. It must stay the original navy: pointing this at `textInverse`
    // would shift every dark gold control by a visible blue step.
    expect(DARK_THEME.onGold).toBe('#00162b');
    expect(contrast(DARK_THEME.onGold, DARK_THEME.goldFillFrom)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DARK_THEME.onGold, DARK_THEME.goldFillTo)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT_THEME.onGold, LIGHT_THEME.goldFillFrom)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LIGHT_THEME.onGold, LIGHT_THEME.goldFillTo)!).toBeGreaterThanOrEqual(4.5);
  });

  it('uses a light scrim for the light-theme category card and a dark one for dark', () => {
    // The card scrim is what the caption sits on, so its polarity has to follow
    // the theme's text colour.
    expect(LIGHT_THEME.cardScrim).toContain('247,244,237');
    expect(DARK_THEME.cardScrim).not.toContain('247,244,237');
  });
});

describe('CSS custom properties match the shared tokens', () => {
  const mapping: Array<[keyof typeof LIGHT_THEME, string]> = [
    ['background', '--bg'],
    ['surface', '--surface'],
    ['surfaceRaised', '--surface-raised'],
    ['text', '--text'],
    ['textMuted', '--text-muted'],
    ['textInverse', '--text-inverse'],
    ['gold', '--gold'],
    ['goldHover', '--gold-hover'],
    ['goldSoft', '--gold-soft'],
    ['goldDeep', '--gold-deep'],
    ['goldFillFrom', '--gold-fill-from'],
    ['goldFillTo', '--gold-fill-to'],
    ['goldFillHoverFrom', '--gold-fill-hover-from'],
    ['goldFillHoverTo', '--gold-fill-hover-to'],
    ['onGold', '--on-gold'],
    ['success', '--success'],
    ['warning', '--warning'],
    ['danger', '--danger'],
    ['info', '--info'],
  ];

  it('keeps the customer stylesheet in step with LIGHT_THEME', () => {
    const vars = readThemeBlock(CUSTOMER_CSS, 'light');
    for (const [token, variable] of mapping) {
      expect(vars[variable], `${variable} should equal LIGHT_THEME.${token}`).toBe(
        LIGHT_THEME[token],
      );
    }
  });

  it('keeps the customer stylesheet in step with DARK_THEME', () => {
    const vars = readThemeBlock(CUSTOMER_CSS, 'dark');
    for (const [token, variable] of mapping) {
      expect(vars[variable], `${variable} should equal DARK_THEME.${token}`).toBe(
        DARK_THEME[token],
      );
    }
  });
});
