/**
 * Confirms the exact URL printed on a document is reachable on the production
 * host: the domain resolves, the /verify/<token> path is served, and the page
 * asks for no session. The token itself was issued by the dev database, so the
 * production host correctly answers "not found" — what is proven here is the
 * origin and path, which is what a scan depends on.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'en-GB' });   // no session
const p = await ctx.newPage();
const seen = [];
p.on('response', (r) => { if (r.url().includes('/verify')) seen.push(`${r.status()} ${r.url()}`); });
let status = null;
try { const r = await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); status = r?.status(); }
catch (e) { console.log('NAV ERROR', String(e).slice(0, 200)); }
await p.waitForTimeout(2000);
const text = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
await p.screenshot({ path: '/workspace/project/oryx/.run/evidence/mandate-6/9-qr-production-url.png', fullPage: true });
await b.close();
console.log(JSON.stringify({ url, httpStatus: status, verifyResponses: seen,
  asksForLogin: /sign in to continue|تسجيل الدخول للمتابعة/i.test(text),
  pageLoaded: text.length > 100, excerpt: text.slice(0, 220) }, null, 2));
