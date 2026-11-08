/**
 * Opens the QR target in a brand-new browser context that carries no cookie and
 * no session, exactly as a phone would after a scan. Asserts the page renders
 * the document number and a valid status with no sign-in.
 */
import { chromium } from 'playwright';
const url = process.argv[2];
const expected = process.argv[3];
const b = await chromium.launch();
const ctx = await b.newContext();           // no storage state: no session
const p = await ctx.newPage();
const responses = [];
p.on('response', (r) => { if (r.url().includes('/documents/verify/')) responses.push(`${r.status()} ${r.url()}`); });
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2500);
const text = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
await p.screenshot({ path: '/workspace/project/oryx/.run/evidence/mandate-6/8-qr-verify-external.png', fullPage: true });
const signedOut = !/sign in|تسجيل الدخول/i.test(text);
const hasDoc = expected ? text.includes(expected) : true;
const valid = /VALID|صحيح|ساري|valid/i.test(text);
console.log(JSON.stringify({ url, httpResponses: responses, signedOut, hasDocumentNumber: hasDoc, showsValid: valid, excerpt: text.slice(0, 400) }, null, 2));
await b.close();
process.exit(signedOut && hasDoc && valid ? 0 : 1);
