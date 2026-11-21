/**
 * Captures the ORYX Marketplace demo screens for the design-approval pack.
 *
 * The app is a self-contained demo: there is no backend call, and the customer
 * session is persisted to `localStorage` under `oryx.marketplace.session`. That
 * is what makes this capture straightforward — the session survives a reload, so
 * each screen can be opened by its own URL instead of being driven through the
 * tab bar. (An earlier revision clicked tabs; the hrefs are the flattened route
 * paths — `/mobile/home`, not `/(tabs)/home` — and a wrong selector silently
 * left every screen on the homepage.)
 *
 * The theme is switched through the app's own control on the Account tab, so the
 * shots show exactly what a reviewer sees, and the choice persists to
 * `localStorage` for the screens that follow.
 *
 * Run: node .run/capture-marketplace-demo.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DEMO_BASE ?? 'https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/mobile';
const OUT = process.env.DEMO_OUT ?? '.run/evidence/exec07-phase-e/marketplace';

/** A mid-range handset, the primary target for this build. */
const PHONE = { width: 412, height: 915 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const log = (name, detail = '') => console.log(`  ${name.padEnd(30)} ${detail}`);

/** Waits for the route to render and any photo/asset to settle. */
async function open(route, { wait = 2200 } = {}) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(wait);
}

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  log(name, text.slice(0, 72));
}

/** Switches theme through the Account tab control, which persists the choice. */
async function setTheme(mode) {
  await open('/account');
  const control = page.getByTestId(`settings-theme-${mode}`).first();
  if (await control.count()) {
    await control.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
  } else {
    log('setTheme', `settings-theme-${mode} not found`);
  }
}

/** Every screen the demo exposes, in a reviewer's order. */
const SCREENS = [
  ['/home', '02-home'],
  ['/parts', '03-parts'],
  ['/services', '04-services'],
  ['/sensage', '05-sensage'],
  ['/recovery', '06-recovery'],
  ['/orders', '07-orders'],
  ['/bookings', '08-bookings'],
  ['/vehicles/new', '09-vehicle-add'],
  ['/parts/prod-006', '09b-part-detail'],
  ['/services/inspection-05', '09c-provider-detail'],
  ['/cart', '10-cart'],
  ['/checkout', '11-checkout'],
  ['/wallet', '12-wallet'],
  ['/favourites', '13-favourites'],
  ['/notifications', '14-notifications'],
  ['/support', '15-support'],
  ['/account', '16-account'],
];

/* ------------------------------------------------------------- first run */

// A fresh context has no stored session, so the entry gate shows onboarding.
await open('/', { wait: 5000 });
const skip = page.getByRole('button', { name: /^(Skip|تخطي)$/ }).first();
if (await skip.count()) {
  await shot('00-onboarding-dark');
  await skip.click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(2200);
}

await shot('01-login-dark');

// One-tap demo sign-in against the seeded customer. No backend is involved.
const demoCustomer = page.getByTestId('demo-customer').first();
if (await demoCustomer.count()) {
  await demoCustomer.click({ timeout: 10_000 });
  await page.waitForTimeout(3500);
} else {
  await page.getByTestId('login-email').fill('customer@oryx.demo');
  await page.getByTestId('login-password').fill('demo1234');
  await page.getByTestId('login-submit').click();
  await page.waitForTimeout(3500);
}

/* ------------------------------------------------------------- dark pass */

await setTheme('dark');
for (const [route, name] of SCREENS) {
  await open(route);
  await shot(`${name}-dark`);
}

/* ------------------------------------------------------------ light pass */

await setTheme('light');
for (const [route, name] of SCREENS) {
  await open(route);
  await shot(`${name}-light`);
}

/* ----------------------------------------------------------- login, last */

// Signing out clears the session, so it is captured last. The light theme is
// already persisted, which is the state a returning customer sees.
await open('/account');
const signOut = page.getByText(/^(Sign out|تسجيل الخروج)$/).first();
if (await signOut.count()) {
  await signOut.click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot('01-login-light');
} else {
  log('sign-out', 'control not found; login-light skipped');
}

await browser.close();
console.log(`\nwrote marketplace captures to ${OUT}`);
