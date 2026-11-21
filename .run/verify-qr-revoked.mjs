/**
 * Issues a real invoice, revokes it through the API, and opens its printed QR
 * target in a session-less browser to prove the public page reports the
 * withdrawal — a document status the scanner must surface, not hide.
 */
import { chromium } from 'playwright';
const API = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const PREVIEW = process.env.PREVIEW_BASE ?? 'https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const stamp = Date.now().toString().slice(-6);
const login = await (await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' }) })).json();
const H = { Authorization: `Bearer ${login.accessToken}`, 'x-oryx-company-id': login.companyId ?? login.memberships[0].companyId, 'Content-Type': 'application/json' };
const cust = await (await fetch(`${API}/api/v1/sales/customers`, { method: 'POST', headers: H, body: JSON.stringify({ nameEn: `Revoke ${stamp}`, code: `RV${stamp}` }) })).json();
const prod = await (await fetch(`${API}/api/v1/inventory/products?pageSize=50`, { headers: H })).json();
const p = prod.items.find((x) => x.salesPriceMinor > 0) ?? prod.items[0];
const wh = await (await fetch(`${API}/api/v1/inventory/warehouses?pageSize=1`, { headers: H })).json();
const si = await (await fetch(`${API}/api/v1/sales/invoices`, { method: 'POST', headers: H, body: JSON.stringify({ customerId: cust.id, warehouseId: wh.items[0].id, branchId: wh.items[0].branchId, documentDate: new Date().toISOString(), lines: [{ productId: p.id, description: 'revoke', quantity: 1000, unitPriceMinor: 7500, discountPercentBp: 0, taxPercentBp: 1000 }] }) })).json();
const doc = await (await fetch(`${API}/api/v1/documents/issue`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'SALES_INVOICE', sourceId: si.id }) })).json();
const rev = await (await fetch(`${API}/api/v1/documents/${doc.id}/revoke`, { method: 'POST', headers: H, body: JSON.stringify({ reason: 'Live status check' }) })).json();
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'en-GB' });
const pg = await ctx.newPage();
await pg.goto(`${PREVIEW}/verify/${doc.verificationToken}`, { waitUntil: 'networkidle', timeout: 60000 });
await pg.waitForTimeout(2000);
const text = (await pg.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
await pg.screenshot({ path: '/workspace/project/oryx/.run/evidence/mandate-6/8-qr-verify-revoked-en.png', fullPage: true });
await b.close();
const out = { documentNumber: doc.documentNumber, revokeHttpStatus: rev.status, showsRevoked: /Withdrawn document|مستند مسحوب/.test(text), rendersRawKey: /\b(valid|revoked)Title\b/.test(text), excerpt: text.slice(0, 180) };
console.log(JSON.stringify(out, null, 2));
process.exit(out.showsRevoked && !out.rendersRawKey ? 0 : 1);
