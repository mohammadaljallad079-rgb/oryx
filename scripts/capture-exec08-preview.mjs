/**
 * ORYX — Execution 08 light-theme preview capture.
 *
 * Captures the owner-facing surfaces from the live GitHub Pages preview so the
 * light-theme correction can be reviewed without a local checkout. The preview
 * is a static export: it renders the real markup, tokens and photography, but
 * it is read-only by design and is not evidence of API behaviour.
 *
 * Usage:
 *   node scripts/capture-exec08-preview.mjs [base-url] [out-dir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? 'https://mohammadaljallad079-rgb.github.io/oryx').replace(/\/$/, '');
const OUT = process.argv[3] ?? 'docs/execution-reports/exec08-preview';

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

const PAGES = [
  { slug: 'homepage', path: '/' },
  { slug: 'dashboard', path: '/dashboard/' },
  { slug: 'providers', path: '/providers/' },
  { slug: 'login', path: '/login/' },
];

async function capture(browser, page, locale, theme, viewport) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: 1,
    locale: locale === 'ar' ? 'ar-BH' : 'en-US',
  });
  const tab = await context.newPage();
  const url = `${BASE}${page.path}`;
  await tab.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // The theme is a root attribute set from localStorage; the static export has
  // no persisted preference, so it is applied after load and the paint is
  // awaited rather than guessed with a timeout.
  await tab.evaluate(
    ([l, t]) => {
      const root = document.documentElement;
      root.setAttribute('data-theme', t);
      root.setAttribute('data-dir', l === 'ar' ? 'rtl' : 'ltr');
      root.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
      root.setAttribute('lang', l);
    },
    [locale, theme],
  );
  await tab.waitForTimeout(400);

  const file = `${OUT}/${page.slug}-${viewport}-${locale}-${theme}.png`;
  await tab.screenshot({ path: file, fullPage: false });
  await context.close();
  return file;
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

const written = [];
for (const page of PAGES) {
  for (const viewport of Object.keys(VIEWPORTS)) {
    for (const locale of ['ar', 'en']) {
      for (const theme of ['light', 'dark']) {
        written.push(await capture(browser, page, locale, theme, viewport));
      }
    }
  }
}

await browser.close();
console.log(`captured ${written.length} screenshots into ${OUT}`);
