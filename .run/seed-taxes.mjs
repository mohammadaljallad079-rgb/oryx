#!/usr/bin/env node
/** Seed the demo tenant's tax list through the real API. Idempotent. */
const BASE = 'http://127.0.0.1:3001';
const EMAIL = 'admin@oryx-auto.local';
const PASSWORD = 'ChangeMe!Oryx2026';

const TAXES = [
  { code: 'VAT5', nameEn: 'VAT 5%', nameAr: 'ضريبة القيمة المضافة ٥٪', rateBp: 500, sortOrder: 5 },
  { code: 'VAT10', nameEn: 'VAT 10%', nameAr: 'ضريبة القيمة المضافة ١٠٪', rateBp: 1000, sortOrder: 10 },
  { code: 'VAT15', nameEn: 'VAT 15%', nameAr: 'ضريبة القيمة المضافة ١٥٪', rateBp: 1500, isDefault: true, sortOrder: 15 },
  { code: 'ZERO', nameEn: 'Zero-rated', nameAr: 'معفاة', rateBp: 0, sortOrder: 20 },
];

async function main() {
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  const token = login.accessToken;
  const companyId = login.companyId ?? login.memberships?.[0]?.companyId;
  const H = { Authorization: `Bearer ${token}`, 'x-oryx-company-id': companyId, 'Content-Type': 'application/json' };

  const existing = await fetch(`${BASE}/api/v1/tax?includeInactive=true`, { headers: H }).then((r) => r.json());
  const have = new Set((existing.items ?? []).map((t) => t.code));
  for (const t of TAXES) {
    if (have.has(t.code)) { console.log('skip', t.code); continue; }
    const res = await fetch(`${BASE}/api/v1/tax`, { method: 'POST', headers: H, body: JSON.stringify(t) });
    const body = await res.json();
    console.log(res.ok ? `created ${body.code} ${body.rateBp}bp default=${body.isDefault}` : `FAILED ${t.code} ${JSON.stringify(body)}`);
  }
  const list = await fetch(`${BASE}/api/v1/tax`, { headers: H }).then((r) => r.json());
  console.log(`\n${list.total} taxes:`);
  for (const t of list.items) console.log(' ', t.code, t.rateBp + 'bp', 'default=' + t.isDefault, t.scope);
}
main().catch((e) => { console.error(e); process.exit(1); });
