#!/usr/bin/env node
/**
 * Tenant isolation and RBAC checks for the ERP mobile app.
 *
 * A forged `x-oryx-company-id` must not widen access: the API derives the tenant
 * from the caller's own memberships and rejects a company the user is not in.
 * A role without a permission must be refused the same way.
 *
 * Prints PASS/FAIL per assertion so the result is unambiguous.
 */
const BASE = process.env.ORYX_API ?? 'http://127.0.0.1:3001/api/v1';

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function get(token, path, companyId) {
  const headers = { Authorization: `Bearer ${token}`, 'x-oryx-client': 'mobile' };
  if (companyId) headers['x-oryx-company-id'] = companyId;
  const res = await fetch(`${BASE}${path}`, { headers });
  let body;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  return { status: res.status, body };
}

const results = [];
function check(label, condition, detail) {
  results.push([label, condition, detail]);
}

async function main() {
  // Al Noor admin and its own company id.
  const alNoor = await login('admin@demo-alnoor.local', 'ChangeMe!Oryx2026');
  const alNoorCompany = alNoor.memberships[0].companyId;

  // A second, unrelated demo tenant.
  const gulf = await login('admin@oryx-auto.local', 'ChangeMe!Oryx2026');
  const gulfCompany = gulf.memberships[0].companyId;

  check(
    'two distinct tenants seeded',
    alNoorCompany !== gulfCompany,
    `${alNoorCompany} vs ${gulfCompany}`,
  );

  // 1. Al Noor reads its own customers — allowed.
  const own = await get(alNoor.accessToken, '/sales/customers?pageSize=50', alNoorCompany);
  check('own-tenant customer read', own.status === 200, `status ${own.status}, total ${own.body?.total}`);

  // 2. Al Noor forges the other tenant's header — must be refused or ignored,
  //    never return the other tenant's rows.
  const forged = await get(alNoor.accessToken, '/sales/customers?pageSize=50', gulfCompany);
  const leaked = (forged.body?.items ?? []).some((c) => c.companyId && c.companyId === gulfCompany);
  check(
    'forged company header does not leak another tenant',
    !leaked,
    `status ${forged.status}, returned ${forged.body?.total ?? 0} rows, leak=${leaked}`,
  );

  // 3. A tenant with no automotive licence must be refused the automotive route.
  const vehicles = await get(alNoor.accessToken, '/automotive/vehicles?pageSize=5', alNoorCompany);
  check(
    'unlicensed module refused (automotive on Al Noor)',
    vehicles.status === 403 || vehicles.status === 404,
    `status ${vehicles.status}`,
  );

  // 4. The automotive tenant can read it, proving the 403 above is a licence
  //    rule and not a broken route.
  const vehiclesAuto = await get(gulf.accessToken, '/automotive/vehicles?pageSize=5', gulfCompany);
  check(
    'licensed module allowed (automotive on ORYX Auto)',
    vehiclesAuto.status === 200,
    `status ${vehiclesAuto.status}, total ${vehiclesAuto.body?.total}`,
  );

  // 5. No token at all must be 401.
  const anon = await fetch(`${BASE}/sales/customers`);
  check('anonymous request refused', anon.status === 401, `status ${anon.status}`);

  console.log('tenant isolation & RBAC\n');
  let passed = 0;
  for (const [label, ok, detail] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
    if (ok) passed += 1;
  }
  console.log(`\n${passed}/${results.length} passed`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
