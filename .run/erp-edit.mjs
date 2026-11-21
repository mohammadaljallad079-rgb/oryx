#!/usr/bin/env node
/**
 * Prove the app's new edit path works against the live API.
 *
 * For every resource whose registry entry declares an update, this drives the
 * exact request the EditForm builds: the registry's verb (POST /:id for sales
 * customers and purchasing suppliers, PATCH /:id otherwise), a payload limited
 * to the editable fields, and no immutable key. It then reads the record back and
 * asserts the new value persisted.
 *
 * It is deliberately additive: every record it creates carries an `ERP-EDIT-`
 * prefix so it can be identified and removed without touching seeded data.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.ORYX_API ?? 'http://127.0.0.1:3001/api/v1';
const EMAIL = process.env.ORYX_EMAIL ?? 'admin@demo-alnoor.local';
const PASSWORD = process.env.ORYX_PASSWORD ?? 'ChangeMe!Oryx2026';
/**
 * Vehicles live in the automotive module, which the demo tenant is not licensed
 * for. The second tenant below is licensed, so the vehicle path is exercised
 * there rather than being reported as an app failure.
 */
const AUTO_EMAIL = process.env.ORYX_AUTO_EMAIL ?? 'admin@oryx-auto.local';
const AUTO_PASSWORD = process.env.ORYX_AUTO_PASSWORD ?? 'ChangeMe!Oryx2026';
const STAMP = Date.now().toString().slice(-6);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Read the registry straight from the TypeScript source so this probe cannot
 * drift from the app: if the registry's verb or immutable list is wrong, the
 * probe fails the same way the app would.
 */
function readRegistry() {
  const src = readFileSync(resolve(ROOT, 'apps/mobile-erp/src/lib/resources.ts'), 'utf8');
  const blocks = src.split('\n  {\n').slice(1);
  const specs = [];
  for (const b of blocks) {
    const key = /key: '([^']+)'/.exec(b)?.[1];
    if (!key) continue;
    const path = /path: '([^']+)'/.exec(b)?.[1];
    const updatePermission = /updatePermission: '([^']+)'/.exec(b)?.[1];
    if (!updatePermission) continue;
    const updateMethod = /updateMethod: '([^']+)'/.exec(b)?.[1] ?? 'PATCH';
    const immRaw = /immutable: \[([^\]]*)\]/.exec(b)?.[1] ?? '';
    const immutable = [...immRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const fieldsBlock = /fields: \[([\s\S]*?)\n    \],/.exec(b)?.[1] ?? '';
    const fields = [...fieldsBlock.matchAll(/\{ key: '([^']+)'[^}]*kind: '([^']+)'/g)].map((m) => ({
      key: m[1],
      kind: m[2],
    }));
    const searchParam = /searchParam: '([^']+)'/.exec(b)?.[1];
    specs.push({ key, path, updatePermission, updateMethod, immutable, fields, searchParam });
  }
  return specs;
}

async function login(email = EMAIL, password = PASSWORD) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-oryx-client': 'mobile' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
  return res.json();
}

function makeClient(token, companyId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-oryx-client': 'mobile',
    'x-oryx-company-id': companyId,
    'Content-Type': 'application/json',
  };
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const message = data?.message ?? data?.error ?? text;
      throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(message)}`);
    }
    return data;
  };
}

/** A create payload for the resource, matching its real required fields. */
async function createPayload(key, call) {
  const suffix = STAMP;
  switch (key) {
    case 'customers':
    case 'suppliers':
      return {
        code: `ERP-EDIT-${key === 'customers' ? 'C' : 'S'}-${suffix}`,
        nameEn: `Edit Probe ${suffix}`,
        nameAr: `فحص التعديل ${suffix}`,
        email: `edit-${suffix}@example.test`,
        phone: '+97300000000',
        city: 'Manama',
      };
    case 'products':
      return {
        sku: `ERP-EDIT-P-${suffix}`,
        nameEn: `Edit Probe ${suffix}`,
        nameAr: `فحص التعديل ${suffix}`,
        type: 'PRODUCT',
        unit: 'EA',
      };
    case 'warehouses':
      return {
        code: `ERP-EDIT-W-${suffix}`,
        nameEn: `Edit Probe ${suffix}`,
        nameAr: `فحص التعديل ${suffix}`,
      };
    case 'employees':
      return {
        code: `ERP-EDIT-E-${suffix}`,
        fullNameEn: `Edit Probe ${suffix}`,
        fullNameAr: `فحص التعديل ${suffix}`,
        hireDate: '2026-01-01',
      };
    case 'leads':
      return {
        code: `ERP-EDIT-L-${suffix}`,
        nameEn: `Edit Probe ${suffix}`,
        nameAr: `فحص التعديل ${suffix}`,
        contactName: `Edit Probe ${suffix}`,
      };
    case 'tickets':
      return { subject: `ERP-EDIT-T-${suffix}`, priority: 'NORMAL' };
    case 'projects':
      return {
        code: `ERP-EDIT-PR-${suffix}`,
        nameEn: `Edit Probe ${suffix}`,
        nameAr: `فحص التعديل ${suffix}`,
      };
    case 'tasks':
      return { title: `ERP-EDIT-TK-${suffix}`, priority: 'NORMAL' };
    case 'vehicles': {
      // A vehicle needs a real customer in the same tenant; the caller creates
      // one first and passes it in.
      const customer = await call('POST', '/sales/customers', {
        code: `ERP-EDIT-VC-${suffix}`,
        nameEn: `Edit Probe ${suffix}`,
        nameAr: `فحص التعديل ${suffix}`,
      });
      return {
        customerId: customer.id,
        // 11–17 alphanumeric characters, and no I, O or Q per the DTO.
        vin: `V${suffix}00000000`.slice(0, 15).toUpperCase(),
        make: 'Toyota',
        model: 'Corolla',
        modelYear: 2024,
        mileage: 1000,
      };
    }
    default:
      return null;
  }
}

/**
 * Read a record back through the API.
 *
 * Only a few ERP resources expose `GET /:id`, so the probe lists with the
 * resource's own search parameter and scans for the id. That is the same call
 * the app's list screen makes, so it also proves the record is visible to the
 * list the user actually sees.
 */
async function readBack(call, spec, id, uniqueValue) {
  const params = new URLSearchParams({ pageSize: '200' });
  if (spec.searchParam) params.set(spec.searchParam, uniqueValue);
  const page = await call('GET', `${spec.path}?${params}`);
  const items = page.items ?? [];
  const found = items.find((row) => row.id === id);
  if (found) return found;
  // A resource without a server-side search may need a wider scan.
  const wide = await call('GET', `${spec.path}?pageSize=500`);
  return (wide.items ?? []).find((row) => row.id === id);
}

/** The editable field the probe will change, per resource. */
const EDIT_FIELD = {
  customers: 'nameEn',
  suppliers: 'nameEn',
  products: 'nameEn',
  warehouses: 'nameEn',
  employees: 'fullNameEn',
  leads: 'nameEn',
  tickets: 'priority',
  projects: 'nameEn',
  tasks: 'title',
  vehicles: 'color',
};

async function main() {
  const session = await login();
  const companyId = session.memberships[0].companyId;
  const call = makeClient(session.accessToken, companyId);
  const specs = readRegistry();

  console.log(`company: ${session.memberships[0].companyName ?? companyId}`);
  console.log(`stamp: ${STAMP}`);
  console.log(`registry resources with an update: ${specs.map((s) => s.key).join(', ')}\n`);

  // The automotive module is licensed to the Enterprise tenant, not the demo
  // one, so vehicles run against a second session.
  let autoCall = null;
  try {
    const autoSession = await login(AUTO_EMAIL, AUTO_PASSWORD);
    autoCall = makeClient(autoSession.accessToken, autoSession.memberships[0].companyId);
    console.log(`automotive company: ${autoSession.memberships[0].companyName ?? 'n/a'}\n`);
  } catch (err) {
    console.log(`automotive session unavailable (${String(err.message).slice(0, 60)})\n`);
  }

  const rows = [];
  let pass = 0;
  let fail = 0;

  for (const spec of specs) {
    const tenantCall = spec.key === 'vehicles' ? autoCall : call;
    if (!tenantCall) {
      rows.push([spec.key, 'SKIP', 'no licensed tenant session']);
      continue;
    }
    let payload;
    try {
      payload = await createPayload(spec.key, tenantCall);
    } catch (err) {
      fail += 1;
      rows.push([spec.key, 'FAIL', `setup: ${String(err.message ?? err).slice(0, 100)}`]);
      continue;
    }
    if (!payload) {
      rows.push([spec.key, 'SKIP', 'no create payload in this probe']);
      continue;
    }
    try {
      const created = await tenantCall('POST', spec.path, payload);
      const id = created.id;

      // Build the edit exactly as EditForm does: editable fields only.
      const editable = spec.fields.filter((f) => !spec.immutable.includes(f.key));
      const editKey = EDIT_FIELD[spec.key];
      const body = {};
      for (const f of editable) {
        const current = created[f.key];
        if (current !== undefined && current !== null) body[f.key] = current;
      }
      // Change one editable field to a new, checkable value.
      const newValue = editKey === 'priority' ? 'HIGH' : `Edited ${STAMP}`;
      body[editKey] = newValue;

      await tenantCall(spec.updateMethod, `${spec.path}/${id}`, body);

      // Read back through the API, not the app's own state.
      const after = await readBack(tenantCall, spec, id, `ERP-EDIT-${STAMP}`);
      if (!after) {
        fail += 1;
        rows.push([spec.key, 'FAIL', 'record not found on read-back']);
        continue;
      }
      const got = after[editKey];
      const ok = String(got) === String(newValue);
      if (ok) pass += 1;
      else fail += 1;
      rows.push([spec.key, ok ? 'PASS' : 'FAIL', `${spec.updateMethod} ${spec.path}/:id -> ${editKey}="${got}"`]);
    } catch (err) {
      fail += 1;
      rows.push([spec.key, 'FAIL', String(err.message ?? err).slice(0, 120)]);
    }
  }

  const w = Math.max(...rows.map((r) => r[0].length), 8);
  for (const [k, s, d] of rows) console.log(`  ${k.padEnd(w)}  ${s.padEnd(5)}  ${d}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
