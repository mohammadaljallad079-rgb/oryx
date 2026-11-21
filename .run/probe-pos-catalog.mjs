const BASE = 'http://127.0.0.1:3001/api/v1';
const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@oryx-auto.local', password: 'ChangeMe!Oryx2026' }),
}).then((r) => r.json());
const cid = login.memberships[0].companyId;
const H = {
  Authorization: `Bearer ${login.accessToken}`,
  'x-oryx-company-id': cid,
  'Content-Type': 'application/json',
  'x-oryx-csrf': login.csrfToken,
};
const get = async (p) => {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  let b;
  try {
    b = await r.json();
  } catch {
    b = null;
  }
  return { status: r.status, body: b };
};
const rec = (n, ok, d) => console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : '??'}  ${n}  ${d ?? ''}`);

const r = await get('/inventory/pos-catalog');
rec('pos-catalog 200', r.status === 200, `total=${r.body?.total}`);
const items = r.body?.items ?? [];
const withStatus = items.filter((p) => ['IN_STOCK', 'LOW', 'OUT'].includes(p.stockStatus));
rec('every item has a stockStatus', items.length > 0 && withStatus.length === items.length, `${withStatus.length}/${items.length}`);
rec('every item has imageUrl key', items.length > 0 && items.every((p) => 'imageUrl' in p));
rec('every item has onHand', items.length > 0 && items.every((p) => Number.isInteger(p.onHand)));
const inactive = items.filter((p) => p.isActive === false);
rec('only active products', inactive.length === 0, `inactive=${inactive.length}`);
const sample = items[0];
console.log('sample:', JSON.stringify(sample));

const s = await get('/inventory/pos-catalog?search=' + encodeURIComponent(sample?.barcode ?? sample?.sku ?? ''));
rec('search by barcode/sku', s.status === 200, `total=${s.body?.total}`);
