const ORIGIN =
  process.env.PREVIEW_ORIGIN || 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';

const res = await fetch(`${ORIGIN}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@oryx.local', password: 'ChangeMe!Oryx2026' }),
});
const { accessToken } = await res.json();
const auth = { Authorization: `Bearer ${accessToken}` };

const ctx = await (await fetch(`${ORIGIN}/api/v1/auth/context`, { headers: auth })).json();
const auto = ctx.companies.find((c) => c.nameEn === 'ORYX Auto Services');
const scoped = { ...auth, 'x-oryx-company-id': auto.id };

const probes = [
  ['accounting accounts', '/api/v1/accounting/accounts'],
  ['sales customers', '/api/v1/sales/customers'],
  ['inventory products', '/api/v1/inventory/products'],
  ['hr employees', '/api/v1/hr/employees'],
  ['crm leads', '/api/v1/crm/leads'],
  ['modules catalog', '/api/v1/modules'],
];
for (const [label, path] of probes) {
  const r = await fetch(`${ORIGIN}${path}`, { headers: scoped });
  let size = '';
  if (r.status === 200) {
    const body = await r.json();
    const arr = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
    size = ` items=${Array.isArray(arr) ? arr.length : 'n/a'}`;
  }
  console.log(`${String(r.status).padEnd(4)} ${label.padEnd(22)} ${path}${size}`);
}
