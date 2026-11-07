/**
 * Confirms which rule wins for the homepage hero title by re-injecting the
 * removed `.oryx-hero h1` declaration and re-measuring. If the injected rule
 * changes the computed size, the removed rule was live and its removal is a
 * visible change; if not, the rule was dead.
 */
import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  try {
    window.localStorage.setItem('oryx.customer.theme', 'dark');
  } catch {}
});
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8123/oryx/', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);

const before = await p.evaluate(() => getComputedStyle(document.querySelector('.oryx-hero__title')).fontSize);
await p.addStyleTag({ content: '.oryx-hero h1 { font-size: 38px; line-height: 1.2; }' });
await p.waitForTimeout(200);
const after = await p.evaluate(() => getComputedStyle(document.querySelector('.oryx-hero__title')).fontSize);
console.log(`title size as built: ${before}`);
console.log(`title size with the removed rule re-injected: ${after}`);
console.log(after !== before ? '=> the removed rule WAS live (its removal is a visible change)' : '=> the removed rule was dead');
await b.close();
