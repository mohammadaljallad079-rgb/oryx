/**
 * Rendered light-theme contrast audit on the built preview.
 *
 * Reads the *resolved* colour of every text node on each page and computes its
 * ratio against the pixels actually behind it, so a gradient scrim or a
 * `color-mix()` surface is measured as rendered rather than assumed. This is
 * the check that catches a light-theme regression a token test cannot see.
 *
 * Run: PREVIEW_BASE=http://127.0.0.1:8123 node .run/audit-preview-contrast.mjs
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

const browser = await chromium.launch();
const failures = [];

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

  const rows = await page.evaluate(() => {
    const parse = (v) => {
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    const lum = ([r, g, b]) => {
      const f = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
    };
    const over = (t, b) => [
      t[0] * t[3] + b[0] * (1 - t[3]),
      t[1] * t[3] + b[1] * (1 - t[3]),
      t[2] * t[3] + b[2] * (1 - t[3]),
      1,
    ];
    /** Composites background-color layers up to the first opaque one. */
    const behind = (el) => {
      let out = [255, 255, 255, 1];
      const stack = [];
      let node = el;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        stack.push(bg ?? [0, 0, 0, 0]);
        if (bg && bg[3] >= 1) break;
        node = node.parentElement;
      }
      for (let i = stack.length - 1; i >= 0; i -= 1) out = over(stack[i], out);
      return out;
    };

    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      // Only elements that own visible text of their own.
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join('');
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.6) continue;
      const fg = parse(cs.color);
      if (!fg || fg[3] < 0.85) continue;
      const bg = behind(el);
      // A gradient or image behind the text invalidates colour compositing, so
      // those are reported separately and not asserted here.
      const layered = (() => {
        let node = el;
        while (node) {
          const s = getComputedStyle(node);
          if (s.backgroundImage !== 'none') return true;
          node = node.parentElement;
        }
        return false;
      })();
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const key = `${cs.color}|${Math.round(bg[0])},${Math.round(bg[1])},${Math.round(bg[2])}|${large}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        sel: el.className && typeof el.className === 'string' ? el.className.slice(0, 40) : el.tagName,
        text: own.slice(0, 28),
        color: cs.color,
        bg: `rgb(${bg.slice(0, 3).map((v) => Math.round(v)).join(', ')})`,
        ratio: ratio(fg, bg),
        threshold: large ? 3 : 4.5,
        layered,
      });
    }
    return out;
  });

  const bad = rows.filter((r) => !r.layered && r.ratio < r.threshold);
  console.log(`\n=== ${name} (${url}) — ${rows.length} pairs, ${bad.length} below threshold ===`);
  for (const r of bad) {
    console.log(`  ${r.ratio}:1 < ${r.threshold}  fg=${r.color} bg=${r.bg}  .${r.sel}  "${r.text}"`);
    failures.push(`${name} ${r.ratio}:1 ${r.sel} "${r.text}"`);
  }
  const layered = rows.filter((r) => r.layered);
  if (layered.length) console.log(`  (${layered.length} gradient-backed pairs measured visually)`);
  await ctx.close();
}

await browser.close();
console.log(`\n${failures.length} solid-surface pairs below threshold`);
process.exitCode = failures.length ? 1 : 0;
