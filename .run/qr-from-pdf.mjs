/**
 * Generates a real invoice through the API, downloads the issued PDF, and
 * decodes the QR code that is actually printed inside the PDF file. Prints the
 * decoded URL and the verification token, so the encoded origin can be checked
 * without trusting any API response.
 */
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const stamp = Date.now().toString().slice(-6);

const login = await (await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' }),
})).json();
const H = { Authorization: `Bearer ${login.accessToken}`, 'x-oryx-company-id': login.companyId ?? login.memberships?.[0]?.companyId, 'Content-Type': 'application/json' };

const cust = await (await fetch(`${BASE}/api/v1/sales/customers`, { method: 'POST', headers: H,
  body: JSON.stringify({ nameEn: `QR probe ${stamp}`, code: `QR${stamp}` }) })).json();
const prod = await (await fetch(`${BASE}/api/v1/inventory/products?pageSize=50`, { headers: H })).json();
const p = prod.items.find((x) => x.salesPriceMinor > 0) ?? prod.items[0];
const wh = await (await fetch(`${BASE}/api/v1/inventory/warehouses?pageSize=1`, { headers: H })).json();
const si = await (await fetch(`${BASE}/api/v1/sales/invoices`, { method: 'POST', headers: H,
  body: JSON.stringify({ customerId: cust.id, warehouseId: wh.items[0].id, branchId: wh.items[0].branchId,
    documentDate: new Date().toISOString(),
    lines: [{ productId: p.id, description: 'QR probe', quantity: 1000, unitPriceMinor: 7500, discountPercentBp: 0, taxPercentBp: 1000 }] }) })).json();
const iss = await (await fetch(`${BASE}/api/v1/documents/issue`, { method: 'POST', headers: H,
  body: JSON.stringify({ type: 'SALES_INVOICE', sourceId: si.id }) })).json();
const pdf = Buffer.from(await (await fetch(`${BASE}/api/v1/documents/${iss.id}/file`, { headers: H })).arrayBuffer());
const fs = await import('node:fs');
fs.writeFileSync('/tmp/qr-probe.pdf', pdf);

const { execFileSync } = await import('node:child_process');
const decoded = execFileSync('python3', ['-c', `
import pymupdf, cv2, numpy as np, json
d = pymupdf.open('/tmp/qr-probe.pdf')
found = []
for pno, page in enumerate(d):
    for dpi in (200, 300):
        pix = page.get_pixmap(dpi=dpi)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4: img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        det = cv2.QRCodeDetector()
        s, _, _ = det.detectAndDecode(gray)
        if s:
            found.append({'page': pno+1, 'url': s}); break
print(json.dumps(found))
`], { encoding: 'utf8' }).trim();

console.log(JSON.stringify({ documentNumber: iss.documentNumber, verificationToken: iss.verificationToken, bytes: pdf.length, qrInPdf: JSON.parse(decoded) }, null, 2));
