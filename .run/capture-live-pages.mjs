/**
 * Captures the owner-requested surfaces from the *published* GitHub Pages
 * preview, so the evidence proves the deployed site rather than a local build.
 *
 * The preview is a static export: sign-in cannot succeed, so the dashboard is
 * reached with the bundled preview session the export ships.
 *
 * Usage: node .run/capture-live-pages.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.argv[2] || 'https://mohammadaljallad079-rgb.github.io/oryx';
const OUT = 'docs/audit/exec07/phase-e/live-pages';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  ['desktop', { width: 1440, height: 1024 }],
  ['tablet', { width: 834, height: 1112 }],
  ['mobile', { width: 390, height: 844 }],
];
const LOCALES = ['ar', 'en'];
const SURFACES = [
  ['01-homepage', '/'],
  ['02-dashboard', '/dashboard'],
  ['03-providers', '/providers'],
  ['04-login', '/login'],
];

const browser = await chromium.launch();
const manifest = [];

for (const [name, path] of SURFACES) {
  for (const [width, viewport] of VIEWPORTS) {
    for (const locale of LOCALES) {
      for (const theme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport });
        await ctx.addInitScript(
          ([l, t]) => {
            try {
              window.localStorage.setItem('oryx.customer.locale', l);
              window.localStorage.setItem('oryx.customer.theme', t);
            } catch {}
          },
          [locale, theme],
        );
        const page = await ctx.newPage();
        const res = await page.goto(BASE + path + '/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);
        const m = await page.evaluate(() => {
          const cs = getComputedStyle(document.body);
          return {
            dir: document.documentElement.getAttribute('dir'),
            lang: document.documentElement.getAttribute('lang'),
            bodyBg: cs.backgroundColor,
            bodyColor: cs.color,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            broken: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
            images: document.images.length,
          };
        });
        const file = `${name}-${width}-${locale}-${theme}.png`;
        await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
        manifest.push({ surface: name, path, width, locale, theme, status: res?.status(), ...m, file });
        await ctx.close();
      }
    }
  }
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
const bad = manifest.filter((m) => m.status !== 200 || m.overflow > 0 || m.broken > 0);
console.log(`captures: ${manifest.length}`);
console.log(`dirs: ${[...new Set(manifest.map((m) => m.dir))].join(',')}`);
console.log(`light bg: ${manifest.find((m) => m.theme === 'light').bodyBg}`);
console.log(`dark bg:  ${manifest.find((m) => m.theme === 'dark').bodyBg}`);
console.log(`problems: ${bad.length}`);
bad.slice(0, 5).forEach((b) => console.log('  ', b.file, b.status, b.overflow, b.broken));
await browser.close();
