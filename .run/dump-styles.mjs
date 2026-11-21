/**
 * Dumps the resolved theme tokens and the computed style of a fixed set of
 * selectors, so two builds can be compared by value instead of by pixels.
 *
 * Usage: node .run/dump-styles.mjs <out.json> [theme]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = process.argv[2] || '/tmp/styles.json';
const THEME = process.argv[3] || 'light';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8123';
const SITE = process.env.ORYX_BASE_PATH || '/oryx';

const TOKENS = [
  '--surface',
  '--surface-raised',
  '--panel-bg',
  '--panel-ink',
  '--panel-scrim',
  '--card-scrim',
  '--hero-scrim',
  '--text',
  '--text-muted',
  '--gold',
  '--gold-on-tint',
  '--band',
  '--band-accent',
  '--band-text',
  '--band-text-muted',
  '--border-soft',
];

const SELECTORS = [
  'body',
  '.oryx-header',
  '.oryx-preview-strip',
  '.oryx-preview-strip__badge',
  '.oryx-nav a',
  '.oryx-btn',
  '.oryx-btn-primary',
  '.oryx-card',
  '.oryx-hero',
  '.oryx-hero .oryx-eyebrow',
  '.oryx-hero__title',
  '.oryx-hero__lede',
  '.oryx-cat-card',
  '.oryx-cat-card__body',
  '.oryx-section-title',
  '.oryx-footer',
  '.oryx-input',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
await ctx.addInitScript((t) => {
  try {
    window.localStorage.setItem('oryx.customer.theme', t);
    window.localStorage.setItem('oryx.customer.locale', 'ar');
  } catch {
    /* no storage */
  }
}, THEME);
const page = await ctx.newPage();
await page.goto(`${BASE}${SITE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const result = await page.evaluate(
  ({ tokens, selectors }) => {
    const root = getComputedStyle(document.documentElement);
    const tok = {};
    for (const t of tokens) tok[t] = root.getPropertyValue(t).trim();

    const styles = {};
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) {
        styles[sel] = null;
        continue;
      }
      const cs = getComputedStyle(el);
      styles[sel] = {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage.slice(0, 120),
        borderColor: cs.borderTopColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontFamily: cs.fontFamily.slice(0, 60),
        letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight,
        padding: cs.padding,
        margin: cs.margin,
        boxShadow: cs.boxShadow.slice(0, 120),
        textTransform: cs.textTransform,
      };
    }
    return { theme: document.documentElement.dataset.theme, tokens: tok, styles };
  },
  { tokens: TOKENS, selectors: SELECTORS },
);

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`wrote ${OUT} (theme=${result.theme})`);
await browser.close();
