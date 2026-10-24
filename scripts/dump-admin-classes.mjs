/** Dump the distinct class names and their painted colours on the admin dashboard. */
import { chromium } from 'playwright';

const ADMIN = process.env.ORYX_ADMIN_BASE ?? 'http://127.0.0.1:12000';
const USER = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
};
const theme = process.argv[2] ?? 'light';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(`(() => {
  try { localStorage.setItem('oryx.theme', ${JSON.stringify(theme)}); localStorage.setItem('oryx.locale','en'); } catch {}
  const d = document.documentElement;
  d.setAttribute('data-theme', ${JSON.stringify(theme)});
  d.style.colorScheme = ${JSON.stringify(theme)};
  d.setAttribute('lang','en'); d.setAttribute('data-dir','ltr'); d.dir='ltr';
})()`);
const page = await ctx.newPage();
await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.locator('input[name="email"]').first().fill(USER.email);
await page.locator('input[type="password"]').first().fill(USER.password);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(4000);

const rows = await page.evaluate(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    if (!cls || seen.has(cls)) continue;
    seen.add(cls);
    const st = getComputedStyle(el);
    const hasPaint = st.backgroundColor !== 'rgba(0, 0, 0, 0)' || st.backgroundImage !== 'none';
    if (!hasPaint) continue;
    out.push({
      cls: cls.slice(0, 58),
      bg: st.backgroundColor,
      img: st.backgroundImage === 'none' ? '' : 'grad',
      border: st.borderTopWidth !== '0px' ? st.borderTopColor : '',
    });
  }
  return out;
});
console.log(`theme=${theme}  ${rows.length} painted classes`);
for (const r of rows) console.log(`  ${r.cls.padEnd(58)} ${r.bg.padEnd(26)} ${r.img.padEnd(5)} ${r.border}`);
await browser.close();
