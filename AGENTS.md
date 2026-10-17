# OpenHands / Coding Agent Guide — ORYX

Read **docs/ORYX_MASTER_REFERENCE.md**, **docs/architecture/ARCHITECTURE.md** and
**docs/architecture/PERMISSION_MATRIX.md** before writing code.

## Current state (Execution 01, 01.1, 02, 03, 04 and 05 complete)

Execution 01 delivered the working Super Admin foundation, Execution 01.1
hardened it (secure session transport, TOTP MFA, approved photography and
mobile layout fixes), Execution 02 added the enterprise ERP core, Execution 03
added HR and payroll, CRM, operations and automotive services, Execution 04
added the customer platform, the automotive marketplace, the shared booking
engine, payments, notifications and the ORYX customer mobile application, and
Execution 05 added the External Integrations Center and platform-completion
work. It is **not** a mock: a NestJS API, a Next.js admin app, a Next.js
customer site, an Expo/React Native mobile app and a PostgreSQL database run
locally and are covered by 445 automated tests (93 shared unit, 218 API
integration, 120 browser, 14 mobile).

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
- **Execution 03 (implemented and tested):** HR and payroll (employees,
  departments, contracts, documents, leave, attendance, salary structures,
  payroll runs with atomic and idempotent ledger posting, payslips, advances),
  CRM (leads, pipelines, opportunities that convert to a quotation, contacts,
  activities, SLA-tracked support tickets, segments), operations (projects,
  tasks, work orders with an enforced state machine, approvals, comments,
  attachments, calendar, internal notifications) and automotive (vehicle
  registry, inspections with approved reports, workshop job cards with estimates
  and parts that move the shared stock ledger, warranties, marketplace
  foundations).
- **Execution 04 (implemented and tested):** the customer platform (consumer
  identity and sessions, profiles, vehicle garage with per-owner isolation,
  addresses, notification preferences, privacy and data-export/deletion
  requests), the customer website (`apps/customer`), the automotive marketplace
  (provider onboarding and approval, listings and pricing, availability, service
  requests, acceptance and assignment, completion, moderated reviews and
  ratings, complaints, commissions and ledger-posted settlements), the shared
  booking engine (resources, working hours and exceptions, slot generation,
  confirmation, rescheduling, cancellation, reminders and database-backed
  double-booking prevention), payments (cash, card terminal and bank transfer
  records, an online-gateway adapter architecture, idempotent intents and
  webhooks, verified confirmations, refunds, reconciliation, commissions and
  settlements), notifications (in-app plus email, SMS, WhatsApp and push
  adapters that report themselves unconfigured without credentials) and the
  ORYX customer mobile application (`apps/mobile`, Expo/React Native).
- **Execution 05 (implemented and tested):** the External Integrations Center
  (an 8-provider catalogue declared once in `packages/shared/src/integrations.ts`,
  AES-256-GCM sealed credentials, a company-scope override, an enablement guard
  that refuses to enable a provider with a missing required credential, a real
  connection-test path with append-only check history, audit logging by key and
  never by value, and a customer capabilities endpoint that advertises only
  operational providers) plus platform-completion work.
- **Scaffolded only:** nothing. Every ERP module catalog entry is implemented and
  DB-backed across Executions 01–05.
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

### Execution 03 gotchas

- **Payroll is a snapshot.** A payroll run copies each employee's active salary
  structure and its components into the payslip, so editing a salary later never
  changes a historical run. Never read the live structure for a posted payslip.
- **Payroll posting is idempotent through the source key.** The run posting uses
  `sourceId: \`payroll:<runId>\`` so a retried approval cannot double-post. Keep
  that key when touching the payroll posting path.
- **A payroll period must be OPEN and a fiscal period must cover the run's end
  date.** Payroll posts to the ledger, so an open fiscal year is a prerequisite.
  Tests that post payroll must create a fiscal year first.
- **The workshop and inspection modules reuse the shared stock ledger and the
  shared sales invoice path.** Parts issues go through
  `InventoryService.recordMovement`; workshop and inspection invoices go through
  `SalesService.issueInvoice` inside the caller's transaction. Never create a
  second stock ledger or a second ledger for automotive.
- **State machines are enforced server-side.** Work orders and job cards have an
  explicit transition graph; a job card cannot be completed without an approved
  estimate. Do not add a status write that bypasses it.
- **The automotive modules are licensed to the Enterprise plan.** The
  Professional demo tenant does not license them, so a UI test that exercises
  automotive must sign in as `admin@oryx-auto.local` (Enterprise), not the demo
  tenant.
- **`cleanupFixtures` must delete children before parents.** The Execution 03
  tables reference customers, products and each other; the cleanup order is
  deliberate. A new table needs adding in the right place.

### Execution 04 gotchas

- **React must resolve to one version across the workspace.** The repository uses
  `node-linker=hoisted`. A workspace that pins a different React minor (the
  mobile app originally pinned `19.1.0`) hoists that copy to the root, pairs it
  with the other `react-dom`, and `next build` then fails at prerender with
  `Cannot read properties of null (reading 'useRef')`. Keep `react` aligned
  across `apps/admin`, `apps/customer` and `apps/mobile`; react-native's peer
  range is `^19.1.0`, so `19.3.0` satisfies it.
- **The consumer identity plane is separate from staff auth.** A consumer access
  token carries `audience: customer`. It is refused on a staff route and a staff
  token is refused on a consumer route; do not relax either check to make a test
  pass.
- **Booking concurrency is enforced by the database.** A unique constraint plus a
  transactional row lock make the second booking for the same resource and time
  fail. A cancelled booking releases its slot, so do not make the constraint
  unconditional.
- **Payments must never claim money moved.** `CASH` and `CARD_TERMINAL` are
  always configured (the receipt is the confirmation); `BANK_TRANSFER` stays
  awaiting confirmation until an operator confirms it; `BENEFITPAY` and
  `CARD_ONLINE` report themselves unconfigured without credentials and leave the
  intent unpaid. Do not add a path that marks an intent paid without a verified
  provider confirmation.
- **Webhooks are idempotent and signature-verified.** A redelivered signed event
  must be a no-op. Do not remove the signature check to simplify a test.
- **Provider scope comes from membership, not permission.** A peer administrator
  who is not linked to a provider must not read or act on that provider's work.
- **Reuse the Execution 02/03 ledgers.** Invoices go through
  `SalesService.issueInvoice`, parts through `InventoryService.recordMovement`
  and every posting through `AccountingPostingService.postJournal`. Do not create
  a second stock or accounting ledger for the marketplace.
- **Playwright browsers must be reinstalled after a dependency change.**
  `pnpm install` can update the Playwright build, and the suites then fail with
  `Executable doesn't exist ... headless_shell` until
  `pnpm --filter @oryx/admin exec playwright install chromium` runs again.
- **Run the browser suite through the reverse proxy, not the bare app port.**
  `apps/admin/.env.local` sets `NEXT_PUBLIC_API_BASE_URL=/api`, so the client
  calls the API same-origin. Only the proxy routes `/api/` to the API; against
  `http://localhost:3000` every authenticated test fails identically with
  `TimeoutError: page.waitForURL … **/dashboard` and a `404 POST
  /api/v1/auth/login`, which hides every real failure behind one timeout. Use
  `ORYX_ADMIN_URL=http://localhost:12000 pnpm --filter @oryx/admin test:ui`.
- **`next start` snapshots `public/` at boot.** A newly added asset under
  `apps/admin/public/` 404s until the admin server is restarted; a rebuild alone
  is not enough.
- **Do not point the browser suite at the public HTTPS host.** The admin bundle
  is built with a relative API base (`NEXT_PUBLIC_API_BASE_URL=/api`) and several
  specs call `page.evaluate(() => fetch('http://localhost:3001/…'))` directly. On
  an HTTPS page the browser blocks that plain-HTTP fetch as mixed content, and
  Playwright reports `TypeError: Failed to fetch` — 12 specs fail while the rest
  pass, which reads like a product bug and is not. Use
  `ORYX_ADMIN_URL=http://localhost:12000`; the public host is for the owner's
  browser.
- **A sandbox restart drops system packages but keeps the workspace.**
  PostgreSQL, pnpm, the preview proxy and the Playwright browser download live
  outside `/workspace`, so they vanish while `.run/pgdata`, the built `dist/` and
  `.next/` survive. `bash .run/start-stack.sh` is now self-healing and handles all
  of it: it reinstalls PostgreSQL, restores `.run/pgdata` to `0700` (the restart
  leaves it group-writable and Postgres refuses to start), restores a `pnpm` shim
  through corepack, and starts one `preview-proxy.mjs` per public host (12000 →
  admin, 12001 → customer, with a `/mobile` route). It needs no nginx and no
  re-seed — the seeded cluster is preserved. Playwright still needs
  `playwright install chromium` once more after a recycle.
- **`ss`, `netstat` and `lsof` are not installed.** Readiness checks must not use
  them, or a healthy stack reports every port as closed. `start-stack.sh` uses a
  bash `/dev/tcp` probe (`port_open`) instead, which needs no external binary.
- **Point the browser suite at the proxy port, not the app port.** The admin
  bundle calls the API same-origin, so `ORYX_ADMIN_URL=http://127.0.0.1:12000`
  (with `ORYX_API=http://127.0.0.1:12000/api/v1`) is required; against the bare
  port 3000 every authenticated test 404s at login and the failure looks like a
  routing bug. Also export `DATABASE_URL` — `scripts/reset-seed-mfa.mjs` in the
  Playwright global setup refuses to run without a recognisable dev/test URL.
- **`pnpm` can hang where `tsc`/`next`/`playwright` run fine.** In this sandbox
  the pnpm shim stalls indefinitely on `--filter … build` and `exec`; invoking
  `node_modules/.bin/<tool>` directly is reliable. Prefer that when a pnpm
  command times out with no output.
- **The approved design reference is never artwork.** The owner's rule is that
  `docs/assets/ORYX Auto Services Dashboard.png` is a design *reference*, not a
  source of imagery. It used to be cropped into `tiles/*.jpg` by
  `scripts/extract-approved-assets.py`; that script is now a no-op tombstone and
  every tile is original vector art from `scripts/generate-tile-art.py`, served
  as SVG (`tileImageUrl()` resolves `.svg`). If you add a tile, add its motif to
  the generator — do not crop the reference. `branding.spec.ts` sweeps every
  tile, asserts each URL ends in `.svg` and asserts each one decodes.
- **ESLint runs through flat configs, not `next lint`.** `apps/admin`,
  `apps/customer` and `apps/mobile` each have an `eslint.config.mjs` and their
  `lint` script is `eslint . --max-warnings=0`. `next lint` is deprecated in
  Next 15 and prompts interactively when no config exists, which made
  `pnpm -r lint` hang in CI. CI runs admin and customer lint.

### Execution 05 gotchas

- **`OPERATIONAL` means it works, nothing weaker.** `deriveState` in
  `apps/api/src/integrations/integrations.service.ts` is the single place that
  decides a provider's state, and `AWAITING_CREDENTIALS` must be checked before
  a stored `verificationStatus` is trusted. Only `OPERATIONAL` may be advertised
  through `GET /customer/capabilities`. A gateway holding credentials that have
  never produced a verified call is `CONFIGURED`, not operational. Do not widen
  that rule to make a screen look better.
- **The catalogue lives once.** `INTEGRATION_PROVIDERS` in
  `packages/shared/src/integrations.ts` feeds the API, the admin page and the
  customer capabilities endpoint. Add a provider there, not in a second list.
- **Prisma cannot `upsert` a nullable unique key.** The
  `(providerKey, scope, companyId)` compound unique does not accept `null`, and
  Postgres treats `NULL` as distinct anyway, so a platform row is created with
  `findFirst` + `create`. The `IntegrationProvider_platform_key` partial index
  (hand-written in the migration, not expressible in the Prisma schema) is what
  actually enforces one platform row per provider — keep it.
- **Credential values never leave the API.** Reads return `hint` only. An empty
  value in `PUT /integrations/:key/credentials` deletes the row. Never add a
  response field that echoes a sealed value, and never put a value into the
  audit trail — audit by credential key.
- **Changing a credential clears the verification.** Otherwise a "Verified"
  badge survives a key rotation and misrepresents the deployment.
- **Internal providers are `IMPLEMENTED`, external ones are `ADAPTER_ONLY`.**
  `IMPLEMENTED` means no credentials are needed and the work is real (cash, card
  terminal). `ADAPTER_ONLY` means the adapter exists but the vendor call is not
  implemented, so `verify` must report "not implemented" rather than a success.
- **The browser suite mutates integration state.** A test that stores
  credentials must remove them again, or the later tests that assert
  `AWAITING_CREDENTIALS` fail. `execution05.spec.ts` seeds and clears
  BenefitPay credentials inside test 5 for exactly this reason.
- **Seed state from Node, not from the page.** Storing credentials with
  `page.evaluate` races the page's own refresh rotation, which produced a login
  `403` on one CI trigger and a pass on another for the same commit. A
  `request.newContext()` call carries no ambient cookie, so `CsrfGuard` has
  nothing to reject and the call is deterministic. Remove the state in a
  `finally` block.
- **Playwright drops the path prefix of a `baseURL`.** A request to `'/auth/login'`
  against `baseURL: 'http://localhost:3001/api/v1'` resolves to
  `http://localhost:3001/auth/login` — a `404` that looks like a routing bug.
  Build absolute URLs, or set the baseURL to the origin only.
- **`apiToken`'s login fallback needs the CSRF header.** `signIn` has already
  set the refresh cookie, and `CsrfGuard` rejects any unsafe method carrying that
  cookie without a matching `x-oryx-csrf` header. The refresh branch above it
  echoes the cookie; the login branch must too.

### Branding and preview gotchas

- **An exported `NEXT_PUBLIC_API_BASE_URL` silently overrides `.env.local`.** A
  shell that has the variable exported — a test harness, for instance — bakes its
  value into the client bundle, so a preview built that way calls
  `http://localhost:3001` from the browser and every login fails CORS. `.env.local`
  is correct with `NEXT_PUBLIC_API_BASE_URL=/api`; build from a clean environment
  and confirm with `grep -r 'http://localhost:3001' apps/*/.next/static/`.
- **The customer app's preference keys are namespaced.** It reads
  `oryx.customer.locale` and `oryx.customer.theme`, while the admin app reads
  `oryx.locale` and `oryx.theme`. Seeding the wrong pair leaves the app on its
  default and the capture looks correct-but-unintended.
- **The official logo has no alpha channel.** `docs/assets/logo.png.jpeg` is a
  JPEG on a flat grey field, so `.run/gen-brand.cjs` crops to the ink bounding box
  and rebuilds alpha from the distance to that field, emitting an on-dark and an
  on-light colourway into **both** apps' `public/brand/`. The two are stacked and
  swapped by `data-theme` in CSS so the right one paints before hydration.
- **Grid columns already follow the inline axis.** `dir="rtl"` on `<html>` puts
  the sidebar column on the right by itself. A `[data-dir='rtl'] .oryx-shell`
  rule that also swaps `grid-template-columns` cancels that out and lands the
  sidebar back on the left — the opposite of the requirement.
- **`next lint` is not the lint gate.** Each app runs `eslint . --max-warnings=0`
  through a flat config, so a single warning fails the build. Suppress
  `@next/next/no-img-element` inline where the asset is a static raster, as the
  MFA QR code already does.
- **`module` is a reserved lint identifier.** `@next/next/no-assign-module-variable`
  rejects a `for (const module of …)` loop in an app that shares the admin ESLint
  config. Name the binding something else.


### Platform seed gotchas

- **A nullable unique key cannot be upserted on a sentinel.** `Role` has
  `@@unique([companyId, code])` and a platform role has `companyId = NULL`.
  Postgres treats `NULL` as distinct in a unique index, so
  `upsert({ where: { companyId_code: { companyId: '', … } } })` never matches the
  `NULL` row and inserts a duplicate on every seed. `seedPlatformRoles()` uses
  `findFirst({ where: { companyId: null, code } })` + update instead. The same
  trap already applied to `IntegrationProvider`, which needed a hand-written
  partial index — do not reintroduce the sentinel form.
- **The platform role is resolved with `findFirst` and no `orderBy`.** After a
  duplicate existed, `PrincipalGuard`, `AuthService` and `RbacService` picked up
  the stale row and the Super Admin silently lost every company-scope permission
  (18 instead of 153), so all `erp.*` endpoints answered `403`. Keep the platform
  role unique.
- **Run the browser suite through the proxy origin, not `:3000`.** The admin
  bundle calls a same-origin `/api`, which only `preview-proxy.mjs` (port 12000)
  forwards; several specs also `fetch` the absolute `http://localhost:3001/api/v1`
  from inside `page.evaluate`. Use
  `ORYX_ADMIN_URL=http://localhost:12000 ORYX_API=http://localhost:3001/api/v1`.
  Against the public **HTTPS** origin that absolute `http` fetch is blocked as
  mixed content and those specs fail with `TypeError: Failed to fetch` even
  though the product works.
- **The seed needs `DATABASE_URL`; Playwright's global setup does too.** The
  MFA-reset global setup shells out to `scripts/reset-seed-mfa.mjs`, which exits
  non-zero without it. Source the root `.env` before `pnpm db:seed` or `test:ui`:
  `set -a; . ./.env; set +a`.

### Mobile gotchas

- **Every file under `(app)` becomes a tab.** Expo Router registers the whole
  directory, so a screen that is only pushed onto the stack (a detail screen, the
  booking wizard, invoices, notifications) renders as an extra tab whose label is
  the raw route name. Declare it with `options={{ href: null }}`. The route name
  is the flattened file path: a nested index is `bookings/index`, not
  `bookings`, and the wrong name silently renders a stray tab instead of the
  screen you meant. `apps/mobile/test/tabs.test.ts` derives the route list from
  the filesystem and fails when a new screen is added without a declaration.
- **The customer session is in memory.** A full page reload of the Expo web
  export drops the access token, so an automated check must log in once and then
  navigate *inside* the app rather than reloading a URL per screen. A reload also
  makes the browser present the refresh cookie, which the API rejects for a
  body-carried token — an artefact of running a native client in a browser, not a
  product path.

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
