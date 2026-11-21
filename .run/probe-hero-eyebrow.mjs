/**
 * Measure the homepage hero eyebrow in both themes.
 *
 * The light theme carries a scoped override for `.oryx-hero .oryx-eyebrow`
 * because `.oryx-hero p` outranks `.oryx-eyebrow` and forces the lede's muted
 * ink and 16px size onto the eyebrow. If the dark theme shows the same muted
 * 16px eyebrow, the override is a light-only patch for a both-theme bug; if the
 * dark eyebrow is already gold, the override is redundant. This measures the
 * resolved values in both themes so the decision is evidence-based.
 *
 * Usage: node .run/probe-hero-eyebrow.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('oryx.theme', t);
  }, theme);
  await page.waitForTimeout(250);
  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('.oryx-hero .oryx-eyebrow, .oryx-hero p')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        classes: el.className,
        text: (el.textContent || '').trim().slice(0, 24),
        color: cs.color,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform,
      };
    });
  });
  console.log(`\n=== theme: ${theme} ===`);
  for (const r of rows) {
    console.log(`  <${r.tag} class="${r.classes}"> "${r.text}"`);
    console.log(`     color=${r.color} size=${r.fontSize} weight=${r.fontWeight} spacing=${r.letterSpacing} transform=${r.textTransform}`);
  }
}

await browser.close();
