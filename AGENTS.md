# OpenHands / Coding Agent Guide — ORYX

Read **docs/ORYX_MASTER_REFERENCE.md**, **docs/architecture/ARCHITECTURE.md** and
**docs/architecture/PERMISSION_MATRIX.md** before writing code.

## Current state (Execution 01, 01.1 and 02 complete)

Execution 01 delivered the working Super Admin foundation, Execution 01.1
hardened it (secure session transport, TOTP MFA, approved photography and
mobile layout fixes), and Execution 02 added the enterprise ERP core. It is
**not** a mock: a NestJS API, a Next.js admin app and a PostgreSQL database run
locally and are covered by 238 automated tests (30 shared unit, 109 API
integration, 99 browser).

Security baseline (do not regress):
- The refresh token lives in an HttpOnly cookie scoped to `/api/v1/auth`. It is
  never returned in a response body and never stored client-side.
- Every non-GET request that presents the refresh cookie must echo the readable
  `oryx_csrf` cookie in the `x-oryx-csrf` header (double-submit). `CsrfGuard`
  runs first in the global guard pipeline.
- MFA is TOTP with AES-256-GCM secret encryption under `MFA_ENCRYPTION_KEY`,
  replay protection, and hashed single-use recovery codes.
- Set `MFA_REQUIRE_SUPER_ADMIN=true` in production.

- **Implemented and tested:** authentication and sessions, organization
  hierarchy (platform → company → branch), tenant isolation, RBAC with a
  permission catalog, delegated administration, ERP module catalog, SaaS plans
  and snapshot entitlements, company/branch/user/role/invitation management,
  DB-backed dashboard, website/application CMS, audit trail, support sessions,
  dark/light themes, Arabic RTL and English LTR.
- **Execution 02 (implemented and tested):** financial accounting (chart of
  accounts, fiscal years/periods, balanced double-entry journals, general
  ledger, trial balance, AR/AP aging, payments, reversals, period locking,
  statements), sales/POS (customers, quotations, orders, invoices, credit notes,
  cashier sessions, POS sales), procurement (suppliers, requisitions, purchase
  orders, goods receipts, supplier invoices, returns), inventory (warehouses,
  SKUs, moving-average stock ledger, transfers, adjustments, reorder alerts,
  valuation) and permission-aware reports.
- **Scaffolded only:** the ERP modules owned by later executions (HR, CRM,
  operations, automotive). Routes exist and are permission-protected, but the
  screens state plainly that the workflow is unimplemented and show no
  fabricated data.
- **Missing assets:** the official ORYX logo and the approved dashboard
  photography are not in the repository. The UI uses a neutral monogram
  placeholder and generated vector tile art. Do not invent brand marks.

## Non-negotiable rules

- One system with **platform / group / company / branch** hierarchy and explicit
  tenant boundaries. Never conflate ORYX internal companies with paying tenants.
- Authorization is enforced **server-side**. The UI only hides what the API
  would reject. Never rely on hidden controls for security.
- A company administrator can never grant a permission it does not hold, that is
  not delegable, or that the plan does not license. See `validateDelegation` and
  `resolveEffectivePermissions` in `packages/shared/src/authorization.ts` — these
  are the only places those rules live.
- Entitlements come from `Subscription.licensedModules` (a snapshot), never from
  a live plan lookup. Editing a plan must not retroactively change a tenant.
- Packages are admin-created and editable, never hard-coded.
- A platform principal carries **no tenant scope** until it opens an explicit,
  reasoned, time-bounded support session.
- Every tenant-owned table carries `companyId`.
- Report incomplete work honestly. Never claim a module works, or that something
  is deployed, without verification.

## Working in this repository

```bash
pnpm install
cp .env.example .env
pnpm db:generate && pnpm db:migrate && pnpm db:seed

pnpm dev:api                        # :3001  (docs at /api/docs)
pnpm dev:admin                      # :3000

pnpm --filter @oryx/shared test     # authorization invariants (no DB needed)
pnpm --filter @oryx/api test:e2e    # API integration (needs the seeded DB)
pnpm --filter @oryx/admin test:ui   # Playwright (needs both services running)
```

### Gotchas learned the hard way

- **Refresh cookies change the test shape.** API tests that exercise sessions
  need the `CookieJar` helper in `apps/api/test/test-app.ts`; the refresh token
  is no longer in the JSON body.
- **MFA tests mutate shared accounts.** Always reset MFA state afterwards. The
  Playwright global setup calls `scripts/reset-seed-mfa.mjs`, and the Jest
  harness resets it in `cleanupFixtures`. Never leave a seeded account behind a
  second factor, or every later password login fails.
- **otplib ships ESM.** Jest needs
  `transformIgnorePatterns: ['node_modules/(?!(otplib|@otplib|@scure|@noble)/)']`.
- **Build the workspace packages first.** `apps/api` and `apps/admin` resolve
  `@oryx/shared` and `@oryx/database` from their compiled `dist/`. After a clean
  checkout run `pnpm --filter @oryx/shared build && pnpm --filter @oryx/database build`
  before typechecking or building the apps, or you will see hundreds of
  "Cannot find module '@oryx/shared'" errors.
- **API build:** `pnpm --filter @oryx/api build` clears a stale
  `tsconfig.build.tsbuildinfo` first. Without that, `nest build` can silently
  emit nothing and `dist/main.js` goes missing.
- **Route prefix:** every route is under `/api/v1`. Health is the exception and
  lives at `/api/health` (version-neutral).
- **Throttling:** the Playwright suite performs many logins; run the API with
  `AUTH_THROTTLE_LIMIT=500 THROTTLE_LIMIT=5000` when running UI tests, or the
  suite will see 429s and time out.
- **Admin default locale is Arabic.** Tests that assert English text must set
  the locale explicitly (`setLocale(page, 'en')`).
- **Company list is paginated.** After provisioning in a test, search for the
  new company rather than assuming it appears on page 1.
- **Both dev servers** must be running before `test:ui`. Restart `next start`
  after a rebuild — the old server keeps serving stale chunks and logins hang.
- **Locale switching** must happen after a page has loaded; `localStorage` is
  unavailable on `about:blank`.
- **Modals stay in the DOM.** A trigger button behind an open modal is still
  "visible" to Playwright, so wait for `.oryx-modal` to have count 0 as the
  completion signal, not for the trigger.
- **A company with no subscription has zero capacity.** Assign a plan before
  testing branch or user creation against a freshly provisioned tenant.
- **Raise `REFRESH_THROTTLE_LIMIT` too when running UI tests.** Setting only
  `AUTH_THROTTLE_LIMIT` is not enough: the suites rotate sessions heavily and the
  refresh endpoint's default ceiling (120/min) will return 429, silently dropping
  sessions and failing late tests with a login 403. Use
  `AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000`.
- **Rebuild the API before running UI tests after an API change.** `next start`
  and the Node API serve compiled output; a stale `dist/main.js` will fail tests
  with request-validation errors that the source no longer produces.

### ERP core (Execution 02) gotchas

- **Money is integer minor units, never a float.** Use `packages/shared/src/money.ts`
  (`toMinor`, `lineAmountMinor`, `basisPointsOfMinor`, `allocateMinor`). Percentages
  in the data model are **basis points** (1500 = 15%); `percentOfMinor`'s scale
  argument is easy to get wrong, so prefer `basisPointsOfMinor`.
- **Every posting goes through `AccountingPostingService.postJournal`.** It asserts
  balance, resolves the open period, allocates the entry number and updates
  account balances in one transaction. Never write journal rows directly.
- **Reversed entries stay in the ledger.** A reversal is a new POSTED entry that
  mirrors the original; the original is only marked `REVERSED`. Queries that sum
  the ledger must include `status: { not: 'DRAFT' }`, not `status: 'POSTED'`, or
  the trial balance will not balance.
- **Stock changes go through `InventoryService.recordMovement`.** It locks the
  level row with `SELECT … FOR UPDATE`; do not update `StockLevel` directly.
  `StockLevel.averageCostMinor` is stored scaled by 100 and converted with
  `wholeAverageCost`.
- **Transactions are READ COMMITTED with a bounded retry**, not SERIALIZABLE. The
  inventory row lock provides the serialisation that matters; SERIALIZABLE aborts
  unrelated concurrent work.
- **Idempotency is a unique key.** `JournalEntry(companyId, sourceType, sourceId)`
  makes a retried posting a no-op; do not remove it.
- **The accounting service and the seed both define the standard chart.** Keep
  `STANDARD_CHART` in `apps/api/src/accounting/accounting.service.ts` and in
  `packages/database/prisma/seed.ts` in step, or a new system role will be
  missing in one path.

### Adding a new ERP module

1. Add a `ModuleDefinition` to `packages/shared/src/modules.ts`.
2. Add its permissions to `packages/shared/src/permissions.ts`.
3. `pnpm db:seed` to upsert the module row.
4. Add the module key to the relevant plans.
5. Add the route under `apps/admin/src/app/(app)/`.

Navigation, guards, plan editing and dashboard tiles all read the same catalog,
so nothing else needs changing.

## Constraints from the owner

- Keep future app services structurally ready; the consumer app belongs to a
  later execution.
- Do not rebuild unrelated projects, start the mobile app first, or replace the
  approved visual identity.
- Prefer increments with true DB-backed CRUD and tests over blanket placeholder
  modules.
- Never modify or delete pre-existing project code without auditing it first.
- Do not commit production credentials, tokens or secret keys.
