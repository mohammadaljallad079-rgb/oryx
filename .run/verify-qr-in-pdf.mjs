/**
 * End-to-end QR verification for printed documents.
 *
 * For each document type it issues a real document through the API, downloads
 * the actual PDF bytes, decodes the QR image that is printed inside the PDF,
 * and then opens the decoded URL in a fresh browser context that carries no
 * session — exactly the path a phone takes after a scan. It fails if the code
 * encodes a localhost or preview origin, if the path is wrong, if the page
 * demands a login, or if the document number is not shown.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const API = 'http://127.0.0.1:3001';
const PREVIEW = process.env.PREVIEW_BASE ?? 'https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const stamp = Date.now().toString().slice(-6);

function decodeQr(path) {
  const out = execFileSync('python3', ['-c', `
import pymupdf, cv2, numpy as np, json, sys
d = pymupdf.open(sys.argv[1]); found = []
for pno, page in enumerate(d):
    for dpi in (200, 300, 400):
        pix = page.get_pixmap(dpi=dpi)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4: img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        s, _, _ = cv2.QRCodeDetector().detectAndDecode(gray)
        if s:
            found.append({'page': pno+1, 'url': s}); break
print(json.dumps(found))
`, path], { encoding: 'utf8' }).trim();
  return JSON.parse(out);
}

const login = await (await fetch(`${API}/api/v1/auth/login`, { method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' }) })).json();
const H = { Authorization: `Bearer ${login.accessToken}`,
  'x-oryx-company-id': login.companyId ?? login.memberships?.[0]?.companyId, 'Content-Type': 'application/json' };

const cust = await (await fetch(`${API}/api/v1/sales/customers`, { method: 'POST', headers: H,
  body: JSON.stringify({ nameEn: `QR verify ${stamp}`, code: `QV${stamp}` }) })).json();
const prod = await (await fetch(`${API}/api/v1/inventory/products?pageSize=50`, { headers: H })).json();
const p = prod.items.find((x) => x.salesPriceMinor > 0) ?? prod.items[0];
const wh = await (await fetch(`${API}/api/v1/inventory/warehouses?pageSize=1`, { headers: H })).json();

async function issueInvoice() {
  const inv = await (await fetch(`${API}/api/v1/sales/invoices`, { method: 'POST', headers: H,
    body: JSON.stringify({ customerId: cust.id, warehouseId: wh.items[0].id, branchId: wh.items[0].branchId,
      documentDate: new Date().toISOString(),
      lines: [{ productId: p.id, description: 'QR verify', quantity: 1000, unitPriceMinor: 7500, discountPercentBp: 0, taxPercentBp: 1000 }] }) })).json();
  const doc = await (await fetch(`${API}/api/v1/documents/issue`, { method: 'POST', headers: H,
    body: JSON.stringify({ type: 'SALES_INVOICE', sourceId: inv.id }) })).json();
  const bytes = Buffer.from(await (await fetch(`${API}/api/v1/documents/${doc.id}/file`, { headers: H })).arrayBuffer());
  writeFileSync(`/tmp/qr-invoice-${stamp}.pdf`, bytes);
  return { doc, bytes, path: `/tmp/qr-invoice-${stamp}.pdf` };
}

async function issueQuotation() {
  const q = await (await fetch(`${API}/api/v1/sales/quotations`, { method: 'POST', headers: H,
    body: JSON.stringify({ customerId: cust.id, branchId: wh.items[0].branchId,
      documentDate: new Date().toISOString(),
      lines: [{ productId: p.id, description: 'QR verify quote', quantity: 1000, unitPriceMinor: 7500, discountPercentBp: 0, taxPercentBp: 1000 }] }) })).json();
  const doc = await (await fetch(`${API}/api/v1/documents/issue`, { method: 'POST', headers: H,
    body: JSON.stringify({ type: 'QUOTATION', sourceId: q.id }) })).json();
  const bytes = Buffer.from(await (await fetch(`${API}/api/v1/documents/${doc.id}/file`, { headers: H })).arrayBuffer());
  writeFileSync(`/tmp/qr-quotation-${stamp}.pdf`, bytes);
  return { doc, bytes, path: `/tmp/qr-quotation-${stamp}.pdf` };
}

const browser = await chromium.launch();
async function openFresh(url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const calls = [];
  page.on('response', (r) => { if (r.url().includes('/documents/verify/')) calls.push(r.status()); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  await ctx.close();
  return { text, calls };
}

const results = [];
for (const [label, make] of [['SALES_INVOICE', issueInvoice], ['QUOTATION', issueQuotation]]) {
  const { doc, bytes, path } = await make();
  const qr = decodeQr(path);
  const url = qr[0]?.url ?? '';
  const u = url ? new URL(url) : null;
  // Part A — the URL printed inside the PDF must be the production origin.
  const productionOrigin = 'https://oryxbhr.com';
  const pathMatches = u?.pathname === `/verify/${doc.verificationToken}`;
  // Part B — the same path and token, served by the staging host (which shares
  // the code and holds this dev token), must open with no session and show the
  // document. Production holds only production tokens, so the no-login check
  // runs against the host that can actually resolve the dev-issued token.
  const stagingUrl = url ? `${PREVIEW}${u.pathname}` : '';
  const fresh = stagingUrl ? await openFresh(stagingUrl) : { text: '', calls: [] };
  const outcome = {
    type: label,
    documentNumber: doc.documentNumber,
    pdfBytes: bytes.length,
    qrFound: qr.length > 0,
    qrUrl: url,
    domain: u?.origin ?? null,
    path: u?.pathname ?? null,
    isLocalhost: /localhost|127\.0\.0\.1/.test(url),
    isPreviewHost: /prod-runtime\.all-hands\.dev/.test(url),
    productionDomain: u?.origin === productionOrigin,
    pathMatchesToken: pathMatches,
    noLoginVerifyStatus: fresh.calls[0] ?? null,
    requiresLogin: /sign in|تسجيل الدخول/i.test(fresh.text) && !/Genuine|مستند صحيح/.test(fresh.text),
    showsDocumentNumber: fresh.text.includes(doc.documentNumber),
    showsValid: /Genuine document|مستند صحيح/.test(fresh.text),
    rendersRawKey: /\b(valid|error|notfound|revoked)Title\b/.test(fresh.text),
    excerpt: fresh.text.slice(0, 200),
  };
  outcome.PASS = outcome.qrFound && outcome.productionDomain && outcome.pathMatchesToken &&
    !outcome.isLocalhost && !outcome.isPreviewHost && outcome.noLoginVerifyStatus === 200 &&
    !outcome.requiresLogin && outcome.showsDocumentNumber && outcome.showsValid && !outcome.rendersRawKey;
  results.push(outcome);
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.PASS) ? 0 : 1);
