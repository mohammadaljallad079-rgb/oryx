/**
 * Captures the ORYX mobile app preview through the public HTTPS ingress.
 *
 * The customer session lives in memory plus `localStorage`, and a full page
 * reload of the Expo web export drops the in-memory token (see the mobile
 * gotchas in AGENTS.md). So this logs in once and then navigates with the app's
 * own tab bar rather than reloading a URL per screen.
 *
 * Run with: node .run/capture-mobile.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const CUSTOMER = 'https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev';
const OUT = 'docs/audit/branding/public';
const CREDS = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
const page = await ctx.newPage();

await page.goto(`${CUSTOMER}/mobile/`, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForTimeout(4000);

// Sign in through the app's own form.
await page.getByTestId('login-email').fill(CREDS.email);
await page.getByTestId('login-password').fill(CREDS.password);
await page.getByTestId('login-submit').click();
await page.waitForTimeout(6000);

const afterLogin = await page.locator('body').innerText();
console.log('after sign-in:', afterLogin.slice(0, 160).replace(/\n+/g, ' | '));

async function snap(name) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const txt = await page.locator('body').innerText();
  console.log(`shot ${name.padEnd(24)} ${txt.slice(0, 110).replace(/\n+/g, ' | ')}`);
}

await snap('14a-mobile-home');

// Navigate with the tab bar so the in-memory session survives. The app follows
// the device locale, so on a headless browser the tabs render in Arabic. Each
// tab is an anchor with role="tab", which is the stable selector.
for (const [href, name] of [
  ['/mobile/services', '14b-mobile-services'],
  ['/mobile/garage', '14c-mobile-garage'],
  ['/mobile/bookings', '14d-mobile-bookings'],
  ['/mobile/account', '14e-mobile-account'],
]) {
  const tab = page.locator(`a[role="tab"][href="${href}"]`).first();
  if (await tab.count()) {
    await tab.click({ timeout: 15_000 }).catch((e) => console.log('click failed', e.message));
    await snap(name);
  } else {
    console.log(`tab ${href} not found; skipping ${name}`);
  }
}

await browser.close();
console.log(`\nwrote mobile screenshots to ${OUT}`);
