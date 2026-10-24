/**
 * Execution 11 — live acceptance for Super Admin RBAC, internal-company
 * creation and financial accounting.
 *
 * Exercises the running stack over HTTP only, so it is the same code path a
 * browser takes. Writes are limited to one probe company, which is archived in
 * a `finally` block so seeded data is left as it was found.
 *
 * Usage: ORYX_ORIGIN=http://127.0.0.1:12000 node .run/acceptance-exec11.mjs
 */
const ORIGIN = process.env.ORYX_ORIGIN ?? 'http://127.0.0.1:12000';
const SA = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@oryx.local',
  password: process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe!Oryx2026',
};
const SAAS = { email: 'admin@demo-alnoor.local', password: 'ChangeMe!Oryx2026' };
const PROBE_CODE = 'EXEC11-ACCEPT';

const results = [];
const record = (ok, area, label, detail = '') => {
  results.push({ ok, area, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${label}${detail ? ` — ${detail}` : ''}`);
};

async function login(creds) {
  const res = await fetch(`${ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${creds.email} -> ${res.status}`);
  return body.accessToken;
}

const call = (token, path, init = {}) =>
  fetch(`${ORIGIN}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const listOf = (body) => body?.items ?? body?.data ?? (Array.isArray(body) ? body : []);

// ---------------------------------------------------------------- RBAC
const saToken = await login(SA);
const saContext = await (await call(saToken, '/auth/context')).json();

{
  record(true, 'rbac', 'super admin authenticates');
  record(
    (saContext.permissions ?? []).some((p) => String(p).startsWith('platform.')),
    'rbac',
    'super admin holds platform permissions',
    `n=${(saContext.permissions ?? []).length}`,
  );
  record(
    Array.isArray(saContext.licensedModules),
    'rbac',
    'context reports module entitlements',
    `n=${(saContext.licensedModules ?? []).length}`,
  );

  const companies = await call(saToken, '/companies?page=1&pageSize=100');
  const list = listOf(await companies.json());
  record(companies.status === 200, 'rbac', 'platform can list companies', `n=${list.length}`);

  const internal = list.filter((c) => c.type === 'INTERNAL' && /^ORYX /.test(c.nameEn ?? ''));
  record(internal.length >= 4, 'rbac', 'seeded internal companies are present', `n=${internal.length}`);

  // Platform-only provisioning must be refused to a tenant administrator.
  const saasToken = await login(SAAS);
  const denied = await call(saasToken, '/companies', {
    method: 'POST',
    body: JSON.stringify({ code: 'RBAC-PROBE', nameEn: 'RBAC Probe', nameAr: 'فحص', type: 'INTERNAL' }),
  });
  record(denied.status === 403, 'rbac', 'tenant admin cannot provision a company', `status=${denied.status}`);

  const saasContext = await (await call(saasToken, '/auth/context')).json();
  const tenant = (saasContext.companies ?? []).find((c) => c.type === 'SAAS_TENANT') ?? saasContext.companies?.[0];
  if (tenant) {
    const roles = await call(saasToken, `/companies/${tenant.id}/roles`);
    record(roles.status === 200, 'rbac', 'tenant admin reads its own roles', `status=${roles.status}`);

    // A tenant may read the plan catalog for its own subscription context, but
    // must never be able to author a plan. Read and write are different gates.
    const plansRead = await call(saasToken, '/plans');
    record(plansRead.status === 200, 'rbac', 'tenant admin reads the plan catalog', `status=${plansRead.status}`);
    const plansWrite = await call(saasToken, '/plans', {
      method: 'POST',
      body: JSON.stringify({ code: 'RBAC-PLAN', nameEn: 'Probe', nameAr: 'فحص' }),
    });
    record(plansWrite.status === 403, 'rbac', 'tenant admin cannot author a plan', `status=${plansWrite.status}`);
  }
}

// ------------------------------------------------- internal company model
let probeId = null;
try {
  // Reuse a probe from an earlier run rather than piling up rows.
  const existing = listOf(await (await call(saToken, '/companies?page=1&pageSize=100')).json()).find(
    (c) => c.code === PROBE_CODE,
  );

  if (existing) {
    probeId = existing.id;
    // A previous run archived this probe. Archival is a real governance action
    // even for an internal company, so reactivate it before asserting on it.
    await call(saToken, `/companies/${probeId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    record(true, 'internal', 'probe company already exists (reused and reactivated)', `code=${PROBE_CODE}`);
  } else {
    const created = await call(saToken, '/companies', {
      method: 'POST',
      body: JSON.stringify({
        code: PROBE_CODE,
        nameEn: 'Execution 11 Acceptance Probe',
        nameAr: 'فحص القبول',
        type: 'INTERNAL',
        countryCode: 'BH',
        currency: 'BHD',
      }),
    });
    const body = await created.json().catch(() => ({}));
    probeId = body.company?.id ?? null;
    record(
      created.status === 201 && Boolean(probeId),
      'internal',
      'super admin creates an INTERNAL company',
      `status=${created.status}`,
    );
    record(body.company?.type === 'INTERNAL', 'internal', 'created company is INTERNAL', `type=${body.company?.type}`);
  }

  if (probeId) {
    const detail = await call(saToken, `/companies/${probeId}`);
    // GET /companies/:id returns the company DTO directly (the create endpoint
    // is the one that wraps it in { company }).
    const d = await detail.json();
    record(detail.status === 200, 'internal', 'internal company is readable', `status=${detail.status}`);
    // The point of the fix: an internal company has no subscription row and is
    // still fully entitled, because it is governed by the platform, not a plan.
    record(
      d.subscription == null,
      'internal',
      'internal company has no subscription',
      `sub=${d.subscription ? 'present' : 'null'}`,
    );
    record(d.type === 'INTERNAL', 'internal', 'detail reports the INTERNAL type', `type=${d.type}`);

    const entRes = await call(saToken, `/modules/entitlements?companyId=${probeId}`);
    if (entRes.status === 200) {
      const e = await entRes.json();
      record(e.isInternal === true, 'internal', 'entitlements report isInternal', `isInternal=${e.isInternal}`);
      record(e.isActive === true, 'internal', 'internal company is active without a plan', `isActive=${e.isActive}`);
      record(e.subscriptionId == null, 'internal', 'entitlements carry no subscription id', `subId=${e.subscriptionId}`);
      record(
        e.limits?.maxBranches === -1 && e.limits?.maxUsers === -1,
        'internal',
        'internal company limits are unlimited',
        `branches=${e.limits?.maxBranches} users=${e.limits?.maxUsers}`,
      );
      record(
        Array.isArray(e.licensedModules) && e.licensedModules.length > 0,
        'internal',
        'internal company licenses modules',
        `n=${e.licensedModules?.length}`,
      );
    } else {
      record(false, 'internal', 'entitlements endpoint reachable', `status=${entRes.status}`);
    }

    // The other half of the fix must not have regressed: a SaaS tenant without
    // a licensed module is still refused.
    const saasToken = await login(SAAS);
    const saasCtx = await (await call(saasToken, '/auth/context')).json();
    const tenant = (saasCtx.companies ?? []).find((c) => c.type === 'SAAS_TENANT') ?? saasCtx.companies?.[0];
    if (tenant) {
      const automotive = await call(saasToken, '/automotive/vehicles', {
        headers: { 'x-oryx-company-id': tenant.id },
      });
      record(
        automotive.status === 403,
        'internal',
        'unlicensed module stays refused for a SaaS tenant',
        `status=${automotive.status}`,
      );
    }
  }
} catch (error) {
  record(false, 'internal', 'internal company probe threw', String(error).slice(0, 160));
} finally {
  if (probeId) {
    const archived = await call(saToken, `/companies/${probeId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ARCHIVED', reason: 'Execution 11 acceptance cleanup' }),
    });
    record(archived.ok, 'internal', 'probe company archived (cleanup)', `status=${archived.status}`);
  }
}

// ------------------------------------------------------------- accounting
{
  const list = listOf(await (await call(saToken, '/companies?page=1&pageSize=100')).json());
  const auto =
    list.find((c) => c.type === 'INTERNAL' && /^ORYX Auto Services$/.test(c.nameEn ?? '')) ??
    list.find((c) => c.type === 'INTERNAL');
  record(Boolean(auto), 'accounting', 'an internal company is available', `company=${auto?.nameEn}`);

  if (auto) {
    const scoped = { 'x-oryx-company-id': auto.id };

    const accounts = await call(saToken, '/accounting/accounts', { headers: scoped });
    const accList = listOf(await accounts.json());
    record(accounts.status === 200, 'accounting', 'chart of accounts is readable', `status=${accounts.status}`);
    record(accList.length >= 10, 'accounting', 'standard chart is seeded', `n=${accList.length}`);

    const years = await call(saToken, '/accounting/fiscal-years', { headers: scoped });
    record(years.status === 200, 'accounting', 'fiscal years are readable', `n=${listOf(await years.json()).length}`);

    // The strongest accounting invariant: the ledger must balance.
    const tb = await call(saToken, '/accounting/trial-balance', { headers: scoped });
    if (tb.status === 200) {
      const t = await tb.json();
      const rows = t.rows ?? [];
      record(
        t.balanced === true && t.totalDebitMinor === t.totalCreditMinor,
        'accounting',
        'trial balance debits equal credits',
        `debit=${t.totalDebitMinor} credit=${t.totalCreditMinor} rows=${rows.length}`,
      );
    } else {
      record(false, 'accounting', 'trial balance reachable', `status=${tb.status}`);
    }

    for (const [label, path] of [
      ['general ledger', '/accounting/general-ledger'],
      ['income statement', '/accounting/income-statement'],
      ['balance sheet', '/accounting/balance-sheet'],
      ['receivables aging', '/accounting/receivables-aging'],
      ['payables aging', '/accounting/payables-aging'],
    ]) {
      const r = await call(saToken, path, { headers: scoped });
      record(r.status === 200, 'accounting', `${label} renders`, `status=${r.status}`);
    }

    // Journals must be readable and every sampled entry balanced.
    const journals = await call(saToken, '/accounting/journals', { headers: scoped });
    if (journals.status === 200) {
      const jList = listOf(await journals.json());
      let unbalanced = 0;
      for (const j of jList.slice(0, 25)) {
        const lines = j.lines ?? [];
        if (!lines.length) continue;
        const d = lines.reduce((s, l) => s + (l.debitMinor ?? 0), 0);
        const c = lines.reduce((s, l) => s + (l.creditMinor ?? 0), 0);
        if (d !== c) unbalanced += 1;
      }
      record(
        unbalanced === 0,
        'accounting',
        'sampled journal entries are balanced',
        `checked=${Math.min(jList.length, 25)} unbalanced=${unbalanced}`,
      );
    } else {
      record(false, 'accounting', 'journals readable', `status=${journals.status}`);
    }
  }
}

// ------------------------------------- financial posting, end to end
// The read-only checks above prove the reports render. This proves the posting
// engine actually moves numbers: a balanced entry shifts the trial balance by
// exactly the posted amount, and an unbalanced one is rejected.
{
  const code = 'EXEC11-FIN';
  let finId = null;
  try {
    const existing = listOf(await (await call(saToken, '/companies?page=1&pageSize=100')).json()).find(
      (c) => c.code === code,
    );
    if (existing) {
      finId = existing.id;
      await call(saToken, `/companies/${finId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
    } else {
      const created = await call(saToken, '/companies', {
        method: 'POST',
        body: JSON.stringify({
          code,
          nameEn: 'Execution 11 Finance Probe',
          nameAr: 'فحص المالية',
          type: 'INTERNAL',
          countryCode: 'BH',
          currency: 'BHD',
        }),
      });
      finId = (await created.json()).company?.id ?? null;
    }
    record(Boolean(finId), 'posting', 'isolated finance probe company is available', `id=${finId}`);

    if (finId) {
      const scoped = { 'x-oryx-company-id': finId };

      // An internal company has no plan, so the chart is seeded explicitly.
      const seeded = await call(saToken, '/accounting/accounts/seed-standard-chart', {
        method: 'POST',
        headers: scoped,
      });
      record(seeded.status === 200 || seeded.status === 201, 'posting', 'standard chart seeds for a planless company', `status=${seeded.status}`);

      const accounts = listOf(await (await call(saToken, '/accounting/accounts', { headers: scoped })).json());
      const cash = accounts.find((a) => a.type === 'ASSET');
      const revenue = accounts.find((a) => a.type === 'REVENUE');
      record(Boolean(cash && revenue), 'posting', 'chart exposes asset and revenue accounts', `cash=${cash?.code} revenue=${revenue?.code}`);

      const year = await call(saToken, '/accounting/fiscal-years', {
        method: 'POST',
        headers: scoped,
        body: JSON.stringify({ code: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31', monthlyPeriods: true }),
      });
      record([200, 201, 409].includes(year.status), 'posting', 'fiscal year exists for the probe', `status=${year.status}`);

      const before = await (await call(saToken, '/accounting/trial-balance', { headers: scoped })).json();

      // An unbalanced entry must be refused: debits != credits is the one thing
      // double-entry accounting may never accept.
      const unbalanced = await call(saToken, '/accounting/journals', {
        method: 'POST',
        headers: scoped,
        body: JSON.stringify({
          entryDate: '2026-06-15',
          memo: 'unbalanced probe',
          lines: [
            { accountId: cash.id, debitMinor: 10000 },
            { accountId: revenue.id, creditMinor: 9000 },
          ],
        }),
      });
      record(unbalanced.status === 400 || unbalanced.status === 422, 'posting', 'unbalanced entry is rejected', `status=${unbalanced.status}`);

      const balanced = await call(saToken, '/accounting/journals', {
        method: 'POST',
        headers: scoped,
        body: JSON.stringify({
          entryDate: '2026-06-15',
          memo: 'acceptance probe entry',
          lines: [
            { accountId: cash.id, debitMinor: 10000, description: 'cash in' },
            { accountId: revenue.id, creditMinor: 10000, description: 'revenue out' },
          ],
        }),
      });
      const entry = await balanced.json().catch(() => ({}));
      record(
        balanced.status === 200 || balanced.status === 201,
        'posting',
        'balanced entry posts',
        `status=${balanced.status} id=${entry.id ?? entry.entry?.id ?? 'n/a'}`,
      );

      const after = await (await call(saToken, '/accounting/trial-balance', { headers: scoped })).json();
      const delta = (after.totalDebitMinor ?? 0) - (before.totalDebitMinor ?? 0);
      record(delta === 10000, 'posting', 'trial balance moved by exactly the posted amount', `delta=${delta}`);
      record(
        after.balanced === true,
        'posting',
        'ledger still balances after posting',
        `debit=${after.totalDebitMinor} credit=${after.totalCreditMinor}`,
      );

      const entryId = entry.id ?? entry.entry?.id;
      if (entryId) {
        const reversed = await call(saToken, `/accounting/journals/${entryId}/reverse`, {
          method: 'POST',
          headers: scoped,
          body: JSON.stringify({ reason: 'acceptance cleanup' }),
        });
        record(reversed.ok, 'posting', 'entry reverses', `status=${reversed.status}`);
        const postReverse = await (await call(saToken, '/accounting/trial-balance', { headers: scoped })).json();
        record(
          postReverse.balanced === true,
          'posting',
          'ledger balances after reversal',
          `debit=${postReverse.totalDebitMinor} credit=${postReverse.totalCreditMinor}`,
        );
      }
    }
  } catch (error) {
    record(false, 'posting', 'posting probe threw', String(error).slice(0, 160));
  } finally {
    if (finId) {
      const archived = await call(saToken, `/companies/${finId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ARCHIVED', reason: 'Execution 11 acceptance cleanup' }),
      });
      record(archived.ok, 'posting', 'finance probe archived (cleanup)', `status=${archived.status}`);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} acceptance checks passed`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log(`  [${f.area}] ${f.label} — ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
