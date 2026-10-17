import { chromium } from 'playwright';

const BASE = 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const b = await chromium.launch();
const out = [];

for (const [locale, label] of [['ar', 'ar'], ['en', 'en']]) {
  for (const [theme, tlabel] of [['dark', 'dark'], ['light', 'light']]) {
    for (const [w, h, vp] of [[1536, 1024, 'desktop'], [820, 1180, 'tablet'], [430, 932, 'mobile']]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 90000 });
      await p.locator('[data-testid="login-email"]').fill('superadmin@oryx.local');
      await p.locator('[data-testid="login-password"]').fill('ChangeMe!Oryx2026');
      await p.locator('[data-testid="login-submit"]').click();
      await p.waitForURL('**/dashboard', { timeout: 60000 });

      const name = `${label}-${tlabel}`;
      if (locale === 'en') {
        await p.locator('button', { hasText: 'EN' }).first().click().catch(() => {});
        await p.waitForTimeout(1200);
      }

      // The toggle is labelled in the active locale, so locate it structurally:
      // the control that carries the theme state is the one whose click flips
      // `data-theme`. Click until the document reports the theme we want.
      const toggle = p.locator('button[aria-label*="مظهر"], button[title*="مظهر"], button[aria-label*="theme" i]').first();
      for (let i = 0; i < 3; i += 1) {
        const now = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
        if (now === theme) break;
        await toggle.click().catch(() => {});
        await p.waitForTimeout(1200);
      }
      await p.waitForTimeout(800);

      const st = await p.evaluate(() => ({
        dir: document.documentElement.getAttribute('dir'),
        theme: document.documentElement.getAttribute('data-theme'),
        logout: !!document.querySelector('[data-testid="sidebar-logout"]'),
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      out.push({ name, vp, ...st, overflow: st.sw > st.cw + 2 });
      await p.screenshot({ path: `docs/audit/screenshots/variant-${vp}-${name}.png` });
      await ctx.close();
    }
  }
}

for (const o of out) {
  console.log(`${o.overflow ? 'OVERFLOW' : 'ok      '} ${o.vp.padEnd(8)} ${o.name.padEnd(9)} dir=${o.dir} theme=${o.theme} logout=${o.logout}`);
}
console.log('total', out.length, 'overflow', out.filter((o) => o.overflow).length);
await b.close();
