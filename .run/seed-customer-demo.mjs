/**
 * Seeds a small, realistic consumer dataset for the Execution 07 Phase E
 * light-theme evidence captures: one address and two vehicles, so the dashboard
 * and garage screens render populated rather than empty.
 *
 * The consumer identity plane has no seeder (a real account is created through
 * the public register endpoint), so this script creates the account if it is
 * absent and is idempotent on re-run.
 *
 * Run with: node .run/seed-customer-demo.mjs
 */
const API = process.env.ORYX_API ?? 'http://127.0.0.1:3001/api/v1';
const creds = { email: 'customer@oryx-demo.local', password: 'OryxDemo!2026' };

async function register() {
  const r = await fetch(`${API}/customer/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify({ ...creds, fullName: 'Demo Customer', phone: '+97333000000' }),
  });
  if (r.status !== 201 && r.status !== 409) {
    console.log(`register -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  } else {
    console.log(`register -> ${r.status}`);
  }
}

async function login() {
  const r = await fetch(`${API}/customer/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify(creds),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${r.status} ${JSON.stringify(j)}`);
  return j.accessToken;
}

async function send(method, path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  console.log(`${method} ${path} -> ${r.status} ${t.slice(0, 160)}`);
  return r.ok ? JSON.parse(t) : null;
}

await register();
const token = await login();
console.log('token ok');

const existingVehicles = await send('GET', '/customer/vehicles', token);
const vehicles = Array.isArray(existingVehicles) ? existingVehicles : existingVehicles?.items ?? [];
if (!vehicles.length) {
  await send('POST', '/customer/vehicles', token, {
    make: 'Toyota',
    model: 'Land Cruiser',
    modelYear: 2023,
    plateNumber: 'BH-482913',
    vin: 'JTEBH9FJ0PK123456',
    color: 'White',
    mileage: 42500,
  });
  await send('POST', '/customer/vehicles', token, {
    make: 'Lexus',
    model: 'ES 350',
    modelYear: 2021,
    plateNumber: 'BH-771204',
    vin: 'JTHBK1GG0M2012345',
    color: 'Graphite',
    mileage: 88000,
  });
}

const addresses = await send('GET', '/customer/addresses', token);
const addrList = Array.isArray(addresses) ? addresses : addresses?.items ?? [];
if (!addrList.length) {
  await send('POST', '/customer/addresses', token, {
    label: 'المنزل',
    addressLine1: 'شارع 12، مجمع 305',
    city: 'المنامة',
    countryCode: 'BH',
    isDefault: true,
  });
}

console.log('done');
