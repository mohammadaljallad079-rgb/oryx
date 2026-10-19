/**
 * Exhaustive light-theme contrast sweep.
 *
 * Rather than auditing a fixed list of primitives, this walks *every* text node
 * on each customer surface and measures its rendered contrast against the real
 * pixels behind it. A low-contrast pair anywhere — a stray rule overriding the
 * band ink, an unthemed badge, a faint caption — shows up here even if nobody
 * thought to add it to a selector list.
 *
 * Run with: node .run/sweep-light-contrast.mjs
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';

const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => window.localStorage.setItem('oryx.customer.theme', t), THEME);
await page.locator('input[type="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL('**/dashboard', { timeout: 45_000 });
await page.waitForTimeout(1500);

const failures = [];
const seen = new Set();

for (const path of ['/', '/dashboard', '/providers', '/login', '/profile']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Collect every element that renders its own text, with its ink colour and
  // the sampled pixels behind the glyphs.
  const items = await page.evaluate(() => {
    const out = [];
    let idx = 0;
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3 && n.textContent.trim())
        .map((n) => n.textContent.trim())
        .join(' ');
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      el.setAttribute('data-sweep', String(idx));
      out.push({
        idx,
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 48),
        text: own.slice(0, 32),
        color: cs.color,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: cs.fontWeight,
        bold: parseInt(cs.fontWeight, 10) >= 700,
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
      });
      idx += 1;
    }
    return out;
  });

  for (const it of items) {
    const vp = page.viewportSize();
    const x = Math.max(0, Math.round(it.box.x));
    const y = Math.max(0, Math.round(it.box.y));
    const w = Math.min(Math.round(it.box.w), vp.width - x);
    const h = Math.min(Math.round(it.box.h), vp.height - y);
    if (w < 2 || h < 2) continue;
    // Hide the glyphs, keep every background layer, and read the surface.
    const prev = await page.evaluate((i) => {
      const el = document.querySelector(`[data-sweep="${i}"]`);
      const p = el.style.color;
      el.style.color = 'transparent';
      return p;
    }, it.idx);
    await page.waitForTimeout(30);
    let shot;
    try {
      shot = await page.screenshot({ clip: { x, y, width: w, height: h } });
    } finally {
      await page.evaluate(([i, p]) => {
        document.querySelector(`[data-sweep="${i}"]`).style.color = p;
      }, [it.idx, prev]);
    }
    const png = PNG.sync.read(shot);
    let r = 0;
    let g = 0;
    let b = 0;
    const n = png.width * png.height;
    for (let i = 0; i < png.data.length; i += 4) {
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
    }
    const surface = [r / n, g / n, b / n];
    const m = it.color.match(/rgba?\(([^)]+)\)/);
    if (!m) continue;
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    if (p[3] !== undefined && p[3] < 1) continue;
    const cr = ratio([p[0], p[1], p[2]], surface);
    // WCAG: large text (>=24px, or >=18.66px bold) needs 3:1, body needs 4.5:1.
    const large = it.fontSize >= 24 || (it.bold && it.fontSize >= 18.66);
    const threshold = large ? 3 : 4.5;
    const key = `${it.cls}|${it.color}`;
    if (cr < threshold && !seen.has(key)) {
      seen.add(key);
      failures.push(
        `${path} <${it.tag} class="${it.cls}"> "${it.text}" ${cr}:1 < ${threshold}:1 ink=${it.color} surface=rgb(${surface.map((v) => Math.round(v)).join(', ')})`,
      );
    }
  }
}

await browser.close();
console.log(`${THEME} theme: ${failures.length} text pairs below their WCAG threshold`);
for (const f of failures) console.log('  ' + f);
process.exitCode = failures.length ? 1 : 0;
