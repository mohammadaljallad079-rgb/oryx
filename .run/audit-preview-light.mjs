/**
 * Light-theme consistency audit against the built preview.
 *
 * The owner's report was that the light theme "still looks inconsistent". The
 * palette test proves the token values are accessible; it cannot prove the
 * primitives *use* them consistently. This script reads the resolved style of
 * every shared primitive on every light-theme page and prints the distinct
 * background/foreground/border values it finds, so a card that is one shade on
 * the homepage and another on the dashboard shows up as two rows instead of
 * being argued about.
 *
 * Run: PREVIEW_BASE=http://127.0.0.1:8123 node .run/audit-preview-light.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8123';
const SITE = process.env.ORYX_BASE_PATH || '/oryx';

const PAGES = [
  ['home', `${SITE}/`],
  ['dashboard', `${SITE}/dashboard/`],
  ['providers', `${SITE}/providers/`],
  ['login', `${SITE}/login/`],
  ['register', `${SITE}/register/`],
  ['services', `${SITE}/services/`],
  ['garage', `${SITE}/garage/`],
  ['bookings', `${SITE}/bookings/`],
  ['profile', `${SITE}/profile/`],
  ['invoices', `${SITE}/invoices/`],
  ['notifications', `${SITE}/notifications/`],
  ['support', `${SITE}/support/`],
  ['provider-detail', `${SITE}/providers/city-auto-care/`],
  ['provider-apply', `${SITE}/providers/apply/`],
];

const SELECTORS = [
  'body',
  '.oryx-header',
  '.oryx-nav a',
  '.oryx-footer',
  '.oryx-card',
  '.oryx-btn',
  '.oryx-btn-primary',
  '.oryx-input',
  '.oryx-select',
  '.oryx-textarea',
  '.oryx-table th',
  '.oryx-table td',
  '.oryx-badge',
  '.oryx-page-head',
  '.oryx-hero--home',
  '.oryx-cat-card',
  '.oryx-stat',
  '.oryx-stat__label',
  '.oryx-stat__value',
  '.oryx-kpi',
  '.oryx-muted',
  '.oryx-eyebrow',
  '.oryx-auth__card',
  '.oryx-slot',
  '.oryx-feature',
  '.oryx-feature__icon',
  '.oryx-field label',
  '.oryx-tabs a',
];

const browser = await chromium.launch();
const seen = new Map();

for (const [name, url] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem('oryx.customer.theme', 'light');
      window.localStorage.setItem('oryx.customer.locale', 'ar');
    } catch {
      /* no storage */
    }
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (theme !== 'light') console.log(`!! ${name} rendered theme=${theme}, expected light`);

  for (const selector of SELECTORS) {
    const rows = await page.evaluate((sel) => {
      const els = [...document.querySelectorAll(sel)].slice(0, 3);
      return els.map((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          fg: cs.color,
          border: cs.borderTopWidth === '0px' ? '' : cs.borderTopColor,
          radius: cs.borderTopLeftRadius,
          size: cs.fontSize,
          weight: cs.fontWeight,
          bgImage: cs.backgroundImage === 'none' ? '' : 'gradient',
        };
      });
    }, selector);
    for (const r of rows) {
      const key = `${selector}|${r.bg}|${r.fg}|${r.border}|${r.radius}|${r.size}|${r.weight}|${r.bgImage}`;
      if (!seen.has(key)) seen.set(key, []);
      const pages = seen.get(key);
      if (!pages.includes(name)) pages.push(name);
    }
  }
  await ctx.close();
}

await browser.close();

// Group by selector so the output reads as "these primitives disagree".
const bySelector = new Map();
for (const [key, pages] of seen) {
  const selector = key.split('|')[0];
  if (!bySelector.has(selector)) bySelector.set(selector, []);
  bySelector.get(selector).push({ key, pages });
}

let inconsistencies = 0;
for (const [selector, entries] of bySelector) {
  const variants = entries.filter((e) => e.key.split('|').slice(1).some(Boolean));
  if (variants.length <= 1) continue;
  inconsistencies += 1;
  console.log(`\n### ${selector} — ${variants.length} distinct treatments`);
  for (const e of variants) {
    const [, bg, fg, border, radius, size, weight, bgImage] = e.key.split('|');
    console.log(
      `  bg=${bg.padEnd(24)} fg=${fg.padEnd(24)} border=${border.padEnd(24)} ` +
        `r=${radius.padEnd(7)} ${size.padEnd(7)} ${weight.padEnd(4)} ${bgImage.padEnd(8)} ` +
        `[${e.pages.join(', ')}]`,
    );
  }
}

console.log(`\n${bySelector.size} selectors observed, ${inconsistencies} with more than one treatment`);
