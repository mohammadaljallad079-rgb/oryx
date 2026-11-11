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

for (const q of ['', '?from=2026-10-01&to=2026-10-31']) {
  const r = await fetch(`${API}/bookings/calendar${q}`, { headers: auth });
  console.log(r.status, q || '(no params)', (await r.text()).slice(0, 200));
}
