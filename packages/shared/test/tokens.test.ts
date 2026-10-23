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

  it('keeps the accent gold readable on a warm gold-tinted chip', () => {
    // A 10–12% gold chip fill lifts the surface enough that the plain accent
    // gold falls below 4.5:1, so those chips use `goldOnTint`. The tint is the
    // gold mixed over the surface at the highest alpha the chips use.
    const chip = (surface: string, alpha: number) => {
      const g = hexToRgb(LIGHT_THEME.gold)!;
      const s = hexToRgb(surface)!;
      const mix = g.map((c, i) => Math.round(c * alpha + s[i] * (1 - alpha)));
      return `rgb(${mix.join(',')})`;
    };
    const lightChips = [
      ['white surface', LIGHT_THEME.surface, 0.12],
      ['warm neutral', LIGHT_THEME.surfaceRaised, 0.12],
    ] as const;
    for (const [label, surface, alpha] of lightChips) {
      expect(
        contrast(LIGHT_THEME.goldOnTint, chip(surface, alpha)),
        `goldOnTint on a 12% gold chip over ${label}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    // The darker gold must actually be darker than the plain accent, and the
    // dark theme must keep its existing gold so its approved render is intact.
    expect(luminance(hexToRgb(LIGHT_THEME.goldOnTint)!)).toBeLessThan(
      luminance(hexToRgb(LIGHT_THEME.gold)!),
    );
    expect(DARK_THEME.goldOnTint).toBe(DARK_THEME.gold);
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

  it('keeps the navy band ink readable in both themes', () => {
    // The hero and footer are navy bands in both themes, so their ink is
    // measured against the band colour rather than the page field.
    for (const theme of [LIGHT_THEME, DARK_THEME]) {
      expect(contrast(theme.bandText, theme.band)!).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.bandTextMuted, theme.band)!).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.bandAccent, theme.band)!).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the light theme the approved ivory-and-navy identity', () => {
    // The reference is an ivory page with a navy hero band and a navy footer.
    // The band must not drift back to the page field in the light theme.
    expect(LIGHT_THEME.band).toBe('#0a1b2f');
    expect(LIGHT_THEME.band).not.toBe(LIGHT_THEME.background);
    expect(LIGHT_THEME.bandFooter).toBe('#0a1b2f');
    expect(LIGHT_THEME.bandText).toBe('#ffffff');
  });

  it('resolves every gold tint to the named ramp', () => {
    // The owner's complaint was that the light theme "still looked
    // inconsistent": each chip carried its own `color-mix(... var(--gold) N%
    // ...)`, so five icon chips rendered five different golds. Every tint token
    // must now be a step on one ramp, in a fixed light-to-dark order.
    const order: Array<[string, number]> = [
      ['tintWash', 6],
      ['tintFill', 12],
      ['tintFocus', 16],
      ['tintLine', 26],
      ['tintBadgeLine', 34],
      ['tintRing', 40],
    ];
    for (const [token, pct] of order) {
      expect(LIGHT_THEME[token as keyof typeof LIGHT_THEME], token).toContain(
        `var(--gold) ${pct}%`,
      );
    }
    // The selected chip and the inset panel composite over a surface rather
    // than a transparent layer, so they carry their own form.
    expect(LIGHT_THEME.tintActive).toContain('var(--surface-raised)');
    expect(LIGHT_THEME.tintPanel).toContain('var(--surface-raised)');
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
    ['band', '--band'],
    ['bandFooter', '--band-footer'],
    ['bandText', '--band-text'],
    ['bandTextMuted', '--band-text-muted'],
    ['bandTextFaint', '--band-text-faint'],
    ['bandAccent', '--band-accent'],
    ['bandBorder', '--band-border'],
    ['goldOnTint', '--gold-on-tint'],
    ['tintWash', '--tint-wash'],
    ['tintFill', '--tint-fill'],
    ['tintFocus', '--tint-focus'],
    ['tintGlow', '--tint-glow'],
    ['tintActive', '--tint-active'],
    ['tintLine', '--tint-line'],
    ['tintBadgeLine', '--tint-badge-line'],
    ['tintRing', '--tint-ring'],
    ['tintPanel', '--tint-panel'],
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

  it('keeps every gold tint in a rule on the named ramp', () => {
    // The regression this guards: a new chip rule writing its own
    // `color-mix(in srgb, var(--gold) 15%, transparent)` reintroduces exactly
    // the inconsistency the ramp removed. Tints are only allowed where the ramp
    // defines them.
    const css = readFileSync(CUSTOMER_CSS, 'utf8');
    const themeBlocksEnd = css.indexOf(":root[data-theme='light']");
    const body = css.slice(css.indexOf('}', themeBlocksEnd));
    const offenders = [...body.matchAll(/color-mix\(in srgb, var\(--gold\) [0-9]+%/g)].map(
      (m) => body.slice(0, m.index).split('\n').length,
    );
    expect(offenders, `ad-hoc gold tints at lines ${offenders.join(', ')}`).toEqual([]);
  });

  it('mirrors the light photo scrims under RTL', () => {
    // The regression this guards: the caption sits at the inline-start edge, so
    // a scrim hard-coded at 100deg keeps its opaque end on the left while the
    // caption moves to the right in RTL. The label then lands on the 70%-opaque
    // tail and the white band ink measures 3.79:1. Every scrim angle must be the
    // token, and the light theme must flip that token for RTL.
    const css = readFileSync(CUSTOMER_CSS, 'utf8');
    const literalAngles = [...css.matchAll(/linear-gradient\(\s*[0-9]+deg,\s*\n\s*color-mix\(in srgb, var\(--band\)/g)];
    expect(literalAngles, 'scrim with a literal angle').toEqual([]);

    const flip = css.match(/:root\[data-theme='light'\]\[data-dir='rtl'\]\s*\{([^}]*)\}/);
    expect(flip, 'light RTL scrim override is missing').not.toBeNull();
    const angle = flip![1].match(/--scrim-angle:\s*([0-9]+)deg/);
    expect(angle, 'light RTL block does not set --scrim-angle').not.toBeNull();
    // 260deg is the mirror of 100deg about the vertical axis.
    expect(Number(angle![1])).toBe(260);
  });
});

const ADMIN_CSS = resolve(repoRoot, 'apps/admin/src/app/globals.css');

describe('the admin control plane shares the one theme contract', () => {
  /**
   * The admin shell was the last surface not bound to the shared tokens. Its
   * light block had drifted: it never declared `--gold-hover`, and five rules
   * wrote their own `color-mix(in srgb, var(--gold) N%, transparent)` instead of
   * taking a named step, so a chip, a badge and two nav markers resolved to four
   * different golds. The owner saw exactly that as "the light theme looks
   * inconsistent".
   *
   * The customer theme already had these two guards. These are the same guards
   * for the admin app, so the two cannot drift apart again.
   */

  /** Every token the admin stylesheet actually reads. */
  function adminUsedTokens(css: string): Set<string> {
    return new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
  }

  it('declares every shared token the admin shell reads', () => {
    const css = readFileSync(ADMIN_CSS, 'utf8');
    const used = adminUsedTokens(css);
    const dark = readThemeBlock(ADMIN_CSS, 'dark');
    const light = readThemeBlock(ADMIN_CSS, 'light');
    // The band tokens describe the customer site's full-bleed hero and footer,
    // which the admin shell does not render; the tint ramp and the accent tokens
    // are shared by both.
    const shared = [
      '--gold',
      '--gold-hover',
      '--gold-soft',
      '--gold-deep',
      '--gold-on-tint',
      '--on-gold',
      '--tint-wash',
      '--tint-fill',
      '--tint-focus',
      '--tint-glow',
      '--tint-active',
      '--tint-line',
      '--tint-badge-line',
      '--tint-ring',
      '--tint-panel',
    ];
    for (const variable of shared) {
      if (!used.has(variable)) continue;
      expect(dark[variable], `admin dark is missing ${variable}`).toBeDefined();
      expect(light[variable], `admin light is missing ${variable}`).toBeDefined();
    }
  });

  it('keeps the admin gold-tint ramp on the shared steps', () => {
    // The regression this guards: a rule writing its own percentage instead of
    // naming a ramp step. The light block must be exactly the shared ramp; the
    // dark block is the approved render, so it keeps the percentages its rules
    // already used (badge 15%/40%, collapsed nav 18%, nav gradient 20%).
    const css = readFileSync(ADMIN_CSS, 'utf8');
    const rampOf = (block: Record<string, string>) =>
      Object.entries(block)
        .filter(([name]) => name.startsWith('--tint-'))
        .map(([, value]) => {
          const m = value.match(/var\(--gold\) (\d+)%/);
          return m ? Number(m[1]) : null;
        })
        .filter((n): n is number => n !== null);

    const light = rampOf(readThemeBlock(ADMIN_CSS, 'light'));
    const dark = rampOf(readThemeBlock(ADMIN_CSS, 'dark'));
    expect(light.length).toBeGreaterThan(0);
    expect(dark.length).toBeGreaterThan(0);

    const sharedSteps = new Set([6, 12, 14, 16, 22, 26, 34, 40]);
    for (const pct of light) {
      expect(sharedSteps.has(pct), `admin light tint ${pct}% is not a shared ramp step`).toBe(true);
    }
    const approvedDarkSteps = new Set([6, 15, 16, 18, 20, 26, 40]);
    for (const pct of dark) {
      expect(approvedDarkSteps.has(pct), `admin dark tint ${pct}% left the approved ramp`).toBe(true);
    }

    // And no rule body may write its own gold tint: every `color-mix` over
    // `var(--gold)` outside a declaration is a stray.
    const bodyStart = css.indexOf('.oryx-');
    const body = css.slice(bodyStart);
    const offenders = [...body.matchAll(/color-mix\(in srgb, var\(--gold\) [0-9]+%/g)].filter(
      (m) => !/--tint-[a-z-]+:/.test(body.slice(Math.max(0, m.index - 40), m.index)),
    );
    expect(offenders.map((m) => body.slice(0, m.index).split('\n').length)).toEqual([]);
  });

  it('keeps the admin light theme the approved ivory-and-gold identity', () => {
    const light = readThemeBlock(ADMIN_CSS, 'light');
    // Ivory field, white card, warm neutral raised surface, deep charcoal ink.
    expect(light['--bg']).toBe(LIGHT_THEME.background);
    expect(light['--surface']).toBe(LIGHT_THEME.surface);
    expect(light['--surface-raised']).toBe(LIGHT_THEME.surfaceRaised);
    expect(light['--text']).toBe(LIGHT_THEME.text);
    // The accent gold darkens on hover rather than lightening.
    expect(light['--gold-hover']).toBe(LIGHT_THEME.goldHover);
  });
});
