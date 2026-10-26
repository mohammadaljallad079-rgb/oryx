/**
 * Exhaustive light-theme contrast sweep across *every* customer route.
 *
 * `.run/sweep-light-contrast.mjs` covers the five owner-named surfaces. The
 * owner's complaint is broader — "the light theme looks inconsistent" — so this
 * walks every route in the customer app (public and authenticated) and measures
 * the rendered contrast of every text node against the pixels actually behind
 * it, the same way the five-surface sweep found defect E7.
 *
 * Run with: node .run/sweep-light-all-routes.mjs [light|dark]
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const BASE = process.env.ORYX_CUSTOMER_BASE ?? 'http://127.0.0.1:12001';
const USER = {
  email: process.env.ORYX_CUSTOMER_EMAIL ?? 'rider@oryx.local',
  password: process.env.ORYX_CUSTOMER_PASSWORD ?? 'ChangeMe!Oryx2026',
};
const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';

const ROUTES = [
  ['/', false],
  ['/services', false],
  ['/providers', false],
  ['/providers/apply', false],
  ['/login', false],
  ['/register', false],
  ['/forgot-password', false],
  ['/dashboard', true],
  ['/bookings', true],
  ['/invoices', true],
  ['/credits', true],
  ['/garage', true],
  ['/notifications', true],
  ['/profile', true],
  ['/support', true],
  ['/this-route-does-not-exist', false],
];

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
const parse = (v) => {
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
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

for (const [path, auth] of ROUTES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const landed = new URL(page.url()).pathname;
  if (auth && landed !== path) {
    console.log(`  skip ${path} (landed ${landed})`);
    continue;
  }

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
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 48),
        text: own.slice(0, 32),
        color: cs.color,
        fontSize: parseFloat(cs.fontSize),
        bold: parseInt(cs.fontWeight, 10) >= 700,
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
      });
      idx += 1;
    }
    return out;
  });

  for (const it of items) {
    const vp = page.viewportSize();
    const x = Math.max(0, Math.round(it.box.x + 2));
    const y = Math.max(0, Math.round(it.box.y + it.box.h / 2 - 1));
    const w = Math.min(Math.round(it.box.w - 4), vp.width - x);
    if (w < 3 || y < 0 || y >= vp.height) continue;
    // Hide every glyph on the page, not just this element's own: a nested link
    // has its own `color`, so setting only the parent transparent leaves the
    // child's ink in the sampled strip and reports a false failure.
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.id = 'oryx-sweep-hide';
      s.textContent = '*:not(svg):not(path){color:transparent !important}';
      document.head.appendChild(s);
    });
    let bg;
    try {
      const shot = await page.screenshot({ clip: { x, y, width: w, height: 2 } });
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
      bg = [r / n, g / n, b / n];
    } finally {
      await page.evaluate(() => document.getElementById('oryx-sweep-hide')?.remove());
    }
    const fg = parse(it.color);
    if (!fg || !bg) continue;
    const big = it.fontSize >= 24 || (it.bold && it.fontSize >= 18.66);
    const need = big ? 3 : 4.5;
    const got = ratio(fg.slice(0, 3), bg);
    if (got < need) {
      failures.push({ path, cls: it.cls, text: it.text, got, need, fg: it.color, bg: bg.map((v) => Math.round(v)).join(',') });
    }
  }
  await page.evaluate(() => document.querySelectorAll('[data-sweep]').forEach((e) => e.removeAttribute('data-sweep')));
}

console.log(`\n${THEME} theme — all customer routes`);
if (failures.length === 0) {
  console.log(`  0 text pairs below their WCAG threshold across ${ROUTES.length} routes`);
} else {
  for (const f of failures) {
    console.log(`  FAIL ${f.path}  .${f.cls}  "${f.text}"  ${f.got}:1 (need ${f.need})  fg=${f.fg} bg=rgb(${f.bg})`);
  }
  console.log(`  ${failures.length} failing pairs`);
}
await browser.close();
