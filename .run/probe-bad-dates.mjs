const API = 'http://localhost:3001/api/v1';
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@oryx-auto.local',
    password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
  }),
});
const { accessToken } = await login.json();
const auth = { Authorization: `Bearer ${accessToken}` };

const paths = [
  '/reports/accounting?from=not-a-date&to=also-bad',
  '/reports/sales?from=not-a-date&to=also-bad',
  '/reports/purchasing?from=not-a-date&to=also-bad',
  '/reports/inventory?from=not-a-date&to=also-bad',
  '/accounting/general-ledger?from=not-a-date&to=also-bad',
  '/accounting/trial-balance?from=not-a-date&to=also-bad',
];
for (const p of paths) {
  const r = await fetch(`${API}${p}`, { headers: auth });
  console.log(r.status, p, (await r.text()).slice(0, 120));
}
