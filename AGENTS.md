# OpenHands / Coding Agent Guide — ORYX

Read **docs/ORYX_MASTER_REFERENCE.md**, **docs/architecture/ARCHITECTURE.md** and
**docs/architecture/PERMISSION_MATRIX.md** before writing code.

## Current state (Executions 01–20 complete)

Execution 01 delivered the working Super Admin foundation, Execution 01.1
hardened it (secure session transport, TOTP MFA, approved photography and
mobile layout fixes), Execution 02 added the enterprise ERP core, Execution 03
added HR and payroll, CRM, operations and automotive services, Execution 04
added the customer platform, the automotive marketplace, the shared booking
engine, payments, notifications and the ORYX customer mobile application, and
Execution 05 added the External Integrations Center and platform-completion
work. Later executions added the vehicle inspection engine, official documents
with QR verification, the tenant tax module and the POS terminal. It is **not**
a mock: a NestJS API, a Next.js admin app, a Next.js customer site, an
Expo/React Native mobile app and a PostgreSQL database run locally.

Current automated coverage (2026-11-07, re-run on the working tree): **231**
shared unit, **685** API integration (37 suites), **20** API unit, **224**
admin browser, **206** mobile, **31** mobile-ERP. See
`docs/audit/ORYX_FINAL_ACCEPTANCE.md` for the authoritative, dated matrix.

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
  (a 10-provider catalogue declared once in `packages/shared/src/integrations.ts`,
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
- **Labour hours are hundredths, not `QUANTITY_SCALE` units.** A duration such as
  2.5 h is stored as `250`, while an inventory quantity of 2.5 is `25000`. Price a
  labour line with `hoursAmountMinor(hours, rateMinor)`, never `lineAmountMinor` —
  the latter divides by `10^4` and under-prices the work by 100×. Convert hours
  onto an invoice line's quantity with `hoursToQuantity`. The same rule covers
  payroll overtime and unpaid leave.
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

- **React must resolve to exactly one version, and it must be the one
  react-native bundles.** The repository uses `node-linker=hoisted`. Two rules,
  and the second one is the one that shipped a crashing APK:

  1. Keep `react` aligned across `apps/admin`, `apps/customer`, `apps/mobile`
     and `apps/mobile-erp`. A workspace pinning a different React minor hoists
     that copy to the root, pairs it with the other `react-dom`, and `next build`
     fails at prerender with `Cannot read properties of null (reading 'useRef')`.

  2. **Do not treat react-native's `^19.1.0` peer range as permission to pick a
     higher patch.** React asserts an *exact* version match against
     `react-native-renderer`, which ships inside react-native. `react-native`
     0.81.5 bundles renderer `19.1.0`, so `react` must be `19.1.0`. With
     `19.3.0` the app crashed on startup on a real device:

         E/ReactNativeJS: Incompatible React versions: The "react" and
           "react-native-renderer" packages must have the exact same version.
           - react: 19.3.0
           - react-native-renderer: 19.1.0

     The web build never caught it, because the renderer only exists on native.
     `node_modules/expo/bundledNativeModules.json` is the authority: it pins
     `react` and `react-dom` to `19.1.0` for `react-native` 0.81.5. Read it before
     changing a React version. Verify the resolved version with
     `cat node_modules/react/package.json`, and check the renderer's own version
     with
     `grep -o '"19\.[0-9]\+\.[0-9]\+"' node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js | sort -u`.
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
- **Pin the Chromium jobs to `ubuntu-24.04`, not `ubuntu-latest`.** GitHub moved
  the `ubuntu-latest` label to Ubuntu 26.04, and Playwright 1.56.1 refuses to
  install Chromium on it (`Playwright does not support chromium on
  ubuntu26.04-x64`). The failure lands at `playwright install --with-deps
  chromium`, before any test runs, so it looks like the commit it happened to be
  attached to rather than image drift. `test-ui` in `ci.yml` and `verify` in
  `preview.yml` are pinned; lift the pin when Playwright supports 26.04.

### Vehicle inspection gotchas

- **The approved body-panel artwork is an image, not vector geometry.** The
  inspection form's paint diagram (`apps/admin/src/components/inspection/diagrams.tsx`)
  now draws the owner's reference artwork itself, extracted from `oryx out put.pdf`
  page 2 (embedded image xref 1816 + its alpha mask xref 2408) and served from
  `apps/admin/public/inspection/body-scheme.png` (323×436, portrait). Do not
  reintroduce the reconstructed `BODY_SILHOUETTE`/`BODY_PANELS` SVG: it is a
  different vehicle and does not match the approved form.
- **Marker panel tagging is remapped, not raw.** The canvas shows the artwork
  edge to edge, so `artworkToPanelSpace` maps a normalised point from the
  artwork's vehicle box onto the older `BODY_VIEWBOX` vehicle box before calling
  `bodyPanelAt`. If the artwork crop or canvas aspect changes, update
  `ART_VEHICLE`/`VB_VEHICLE` in the same file, or a marker lands on the wrong
  panel.
- **The body canvas is portrait** (`aspect-ratio: 323 / 436`, `max-width: 420px`).
  The old `1000 / 420` landscape ratio stretched the drawing.

### Execution 05 gotchas

- **A Prisma `upsert` on a sequence row races when the row does not exist yet.**
  `DocumentSequenceService.next()` used `upsert`, so two concurrent *first*
  postings for the same company and document type both inserted and the loser
  raised `P2002`. `withTransaction` retries `40001`/`40P01`/`P2034` but **not**
  `P2002`, so a valid concurrent posting surfaced as a `500`. It now uses
  `createMany({ skipDuplicates: true })` (`INSERT … ON CONFLICT DO NOTHING`)
  then `findUniqueOrThrow` + `update`, which converges on one row and serialises
  on its lock. `apps/api/test/document-numbering.e2e-spec.ts` locks this in.

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
  Two `ADAPTER_ONLY` providers are exceptions whose vendor call *is* written:
  `SENSAGE_AI` and `REGISTRATION_OCR` perform a real request in `verify`, so a
  failure there is a genuine failure and only a validated response is
  `VERIFIED`. Do not extend that exception to a provider without a working
  adapter.
- **Registration-card OCR extracts, it never saves.** `POST
  /automotive/vehicles/:id/documents/ocr` reads a scan and returns suggested
  fields for an operator to review; it writes no `VehicleDocument` and no
  `CmsMediaAsset`, so a discarded extraction leaves nothing behind. The scan
  bytes stay in memory. With no `OCR_API_KEY` it returns `configured:false` and
  no fields — never a canned answer. The deterministic adapter is selected only
  by an explicit `test://` base URL.
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

### Official-document QR gotchas

- **A printed QR code is not testable through the API alone.** `verificationUrl`
  falls back to `http://localhost:3000`, and that fallback is reachable from the
  build host, so every API test passes while a real printed invoice encodes a
  dead URL. The only way to catch it is to decode the QR image *inside the
  generated PDF*. `DOCUMENT_VERIFY_BASE_URL` must be set in every environment
  (`.env.example`, `deploy/env/production.env.example`, and the deployed env);
  production now refuses to issue without it. Verify with
  `.run/verify-qr-in-pdf.mjs`, which decodes the printed code and opens the
  decoded URL in a session-less browser context.
- **`/verify` lives in the customer app, not the admin app.** The public
  verification page is `apps/customer/src/app/verify/[[...token]]/page.tsx`
  (`:3002` in the preview). Pointing `DOCUMENT_VERIFY_BASE_URL` at the admin
  origin (`:3000`) yields a 404 for every scan even though the API returns a
  perfectly valid token. In the preview set it to the customer origin.
- **A duplicate variable definition silently wins with the last value.** Both
  `.env` and the tracked `.env.example` once declared `DOCUMENT_VERIFY_BASE_URL`
  twice; the later `:3000` line overrode the correct `:3002` one, so the printed
  QR was dead while the source "looked" right. When a printed-code or config
  value misbehaves, `grep -n` the key in every env file before anything else.
- **The verification page namespaces its keys under `verify.`.** The outcome
  key template must be `` `verify.${outcome}Title` ``, not `` `${outcome}Title` ``;
  without the prefix the page renders the raw key. `apps/customer/test/i18n-status.test.ts`
  guards both the strings and the template.
- **`NEXT_PUBLIC_*` is inlined at build time.** The customer app needs
  `NEXT_PUBLIC_API_BASE_URL=/api` for the preview (a gitignored `.env.local`
  locally) and an absolute public origin in the container deployment. A shell
  that has the variable exported — which happens if you `source .env` before
  building, and the root `.env` sets `http://localhost:3001/api` — **outranks the
  app's `.env.local`**, so the bundle bakes a loopback origin no other device can
  reach. Both `apps/admin` and `apps/customer` `next.config.ts` therefore **throw
  at build time** when the value points at `localhost`, `127.0.0.1`, `::1` or a
  `*.prod-runtime.all-hands.dev` preview host. A real public origin is allowed —
  do not widen the check to reject it, or the container build breaks.

### Whole-amount rounding gotchas

- **`NONE` is the default and must stay exact.** `roundMinor` in
  `packages/shared/src/money.ts` returns `{ rounded: total, adjustment: 0 }` when
  the mode is `NONE`, so a tenant that never opts in is byte-for-byte unchanged.
  Do not "simplify" the default to a non-zero increment.
- **The rounding difference is posted, never dropped.** A document stores the
  rounded `totalMinor` and a signed `roundingMinor`; `postSalesInvoice` splits
  the receivable from `ROUNDING_GAIN_LOSS` (account `5930`) so the journal still
  balances. The invariant is `subtotal − discount + tax + rounding === total`.
  Any new document path that rounds must post the same way.
- **The chart defines `5930` in two places.** Keep `STANDARD_CHART` in
  `apps/api/src/accounting/accounting.service.ts` and in
  `packages/database/prisma/seed.ts` in step, exactly as for every other system
  role, or a freshly seeded tenant will miss the rounding account.
- **The POS preview must mirror the server.** `sales/page.tsx` calls the same
  `roundMinor` the API does, so the cashier sees the charged total before
  submit. Do not compute the POS total a second, different way.

### Malformed-input gotchas (Execution 16)
- **An unvalidated `?status=` string is a 400, not a 500.** Most list routes pass
  the query straight into a Prisma filter (`status: query.status as never`).
  A value that is not a member of the enum makes Prisma throw
  `PrismaClientValidationError`, and a non-UUID `?companyId=` makes it throw
  P2023. Both are the caller's mistake. `PrismaExceptionFilter`
  (`apps/api/src/common/prisma-exception.filter.ts`, registered globally in
  `createApp`) maps the validation error to 400 and P2025/P2002/P2003/P2023 to
  404/409/400. A genuine bug stays a 500 and is logged, never returned. Do not
  re-derive this per call site.
- **Never `throw new Error(...)` from a request path.** Nest reports a plain
  `Error` as a 500. `resolveCompanyId` in `rbac.controller.ts` did this for a
  cross-tenant or missing company scope; use `forbidden()` / `badRequest()` from
  `common/errors.ts` so the status is honest.
- **Sweep before claiming "no 5xx".** A GET fuzz over every path in
  `GET /api/docs-json` with junk query values (non-enum `status`, non-UUID
  `companyId`, `page=abc`, negative `pageSize`) caught 36 failing routes that a
  happy-path suite never touches. `apps/api/test/execution16-malformed-input.e2e-spec.ts`
  pins representative cases.

### Sales date and test-isolation gotchas (Execution 17)

- **`@Transform` never fires for an absent key.** `class-transformer` runs a
  property's transform only when that property is present on the source object.
  `SalesDocumentDateDto` used a `documentDate` transform to fold the historical
  `issueDate`/`orderDate`/`invoiceDate` aliases onto it, so a payload carrying
  only an alias never reached the transform and `@IsISO8601()` rejected a
  perfectly valid date. Declare each name and read the effective value with
  `resolveDocumentDate(dto)`; use `@ValidateIf` to require `documentDate` only
  when no alias is supplied. Verified: `plainToInstance(D, { issueDate })` leaves
  `documentDate` `undefined`.
- **Keep `forbidNonWhitelisted` on.** The fix for the alias bug was to *declare*
  the aliases, not to relax the whitelist. Every name keeps its own
  `@IsISO8601()`, so a malformed legacy value is still a 400.
- **A suite that does not test stock must not move stock.** The e2e specs run
  against the dev database, so `issueStock` defaults to true and an invoice
  create drains the seeded product. A manual curl check had already consumed the
  stock, and the suite then failed with a 403 "Insufficient stock" that looked
  like a date regression. Pass `issueStock: false` (and `restockInventory: false`
  on a credit note) in specs that assert dates or totals, and re-seed
  (`pnpm db:seed`) after manual write verification.
- **Never run two Playwright suites at once.** Concurrent runs contend and every
  login times out at ~30 s, which looks like a broken app. One suite at a time.
- **`apps/api` has no unit tests.** `pnpm --filter @oryx/api test` prints
  "No tests found" because `jest.config.js` ignores `test/`; every API test is an
  e2e spec run by `test:e2e`. That exit code is not a regression.

### Production-readiness gotchas (Execution 09)

- **`MFA_REQUIRE_SUPER_ADMIN=true` must not lock the owner out.** The guard
  refuses an unenrolled Super Admin on every route, so without an exemption the
  owner could log in, get a token, and then be 403'd on `auth/me` — the shell
  drops the session and bounces back to sign-in, forever. `@AllowMfaEnrollment()`
  on `auth/me`, `auth/mfa/status`, `auth/mfa/enroll` and `auth/mfa/enroll/confirm`
  is what makes the documented "set the flag, sign in, enrol TOTP" runbook
  work. Keep the exemption to those routes: every other platform route stays
  refused until the second factor exists.
- **The shipped API image must contain `packages/database/scripts/`.** The
  first-deploy step runs `production-init` inside the API container so it
  reaches PostgreSQL on the internal network. The runtime stage copies the
  script and recreates the `packages/database/node_modules/@oryx/shared`
  symlink the pruned install omits, and `chown`s both to `oryx` — the file is
  root-owned and mode 660 in the build stage, so without the `chown` the
  unprivileged runtime user gets `EACCES` reading its own bootstrap script.
- **Prisma needs `openssl` in the image.** The `node:*-slim` base omits it, so
  Prisma logs `failed to detect the libssl/openssl version … Defaulting to
  "openssl-1.1.x"` and loads a 1.1.x engine against Debian 12's OpenSSL 3. It
  happens to connect, but the warning is a real mismatch — install `openssl` in
  the base stage.
- **Contrast must be measured, not eyeballed.** `scripts/verify-theme-matrix.mjs`
  drives the real pages and computes WCAG contrast per element. The light theme
  passes; the approved dark theme has one pre-existing miss,
  `.oryx-stat__label` at 4.42–4.49 against a 4.5 floor (documented as defect E8,
  left alone under the "do not alter the approved theme" rule).

### Existing-server pre-deployment gotchas (Execution 10)

- **The deployment host is not reachable from the agent sandbox.** There is no
  SSH client, no key, no `~/.ssh`, no `DEPLOY_*` variable, and no docker daemon.
  `deploy.yml` reads its host from repository secrets that an integration token
  cannot read (`403 Resource not accessible by integration`), and the
  `production` environment does not exist. A pre-deployment task therefore
  starts by asking for access, not by assuming a hostname — do not invent one.
- **`deploy/scripts/inspect-server.sh` is the read-only survey.** It answers the
  OS, resources, ORYX roots, PM2/Docker, nginx, PostgreSQL, DNS, certificate,
  version, uploads and env-file questions without writing anything. It prints
  env-file **paths and modes only, never values**. Run it with `sudo` for the
  root-only sections; without root it skips them and still produces a partial
  audit.
- **Staging isolation is the compose project name, not a second compose file.**
  `docker compose -p oryx-staging … --env-file .env.staging` gives separate
  volumes automatically, because compose prefixes volume names with the project.
  Also change `EDGE_HTTP_PORT`/`EDGE_HTTPS_PORT` and `POSTGRES_DB`; sharing any
  of them disturbs the live stack.
- **`deploy.sh` never reverses a migration.** It restores the previous image tag
  on a failed health probe and stops. A schema rollback is a deliberate restore
  into a separate database, then a promotion — not an automatic down migration.
- **`--env-file` does not isolate a container; a service's `env_file:` does.**
  `--env-file` only interpolates `${...}` inside the compose file. The `api`
  service's `env_file:` injects keys straight into the container and is
  overridden only by an explicit `environment:` entry. It used to be hard-coded
  to `../.env.production`, so a staging stack resolved with the **production**
  JWT, refresh, MFA and database secrets. It is now
  `${ORYX_API_ENV_FILE:-../.env.production}`, which keeps production unchanged
  and lets staging point at its own file. Never remove that indirection, and
  never "simplify" it back to a literal path.
- **Prove staging isolation with the checker, not by reading the files.**
  `deploy/scripts/verify-staging-isolation.sh .env.staging` resolves both stacks
  with `docker compose config` (no daemon needed) and fails on a shared project
  name, port, resolved volume name, sensitive value or database. It is verified
  non-vacuous: it fails on the pre-fix compose file. When writing such a check,
  compare *resolved* volume names (compose prefixes the project) and skip *empty*
  values (an unconfigured adapter is empty in both files) — both are easy false
  positives.
- **`env_file:` in flow-sequence form cannot hold a `:-` default.** `env_file:
  [${VAR:-x}]` fails to parse (`did not find expected ',' or ']'`); use the block
  list form.


### Branding and preview gotchas

- **An exported `NEXT_PUBLIC_API_BASE_URL` silently overrides `.env.local`.** A
  shell that has the variable exported — a test harness, for instance — bakes its
  value into the client bundle, so a preview built that way calls
  `http://localhost:3001` from the browser and every login fails CORS. `.env.local`
  is correct with `NEXT_PUBLIC_API_BASE_URL=/api`; build from a clean environment
  and confirm with `grep -r 'http://localhost:3001' apps/*/.next/static/`.
- **`.env.local` is gitignored, so a sandbox recycle deletes it.** The built
  `.next/` survives the recycle but the source file does not, so the next rebuild
  silently falls back to the absolute default and every authenticated customer
  surface starts redirecting to `/login` again. After a recycle, recreate
  `apps/customer/.env.local` (and `apps/admin/.env.local`) with
  `NEXT_PUBLIC_API_BASE_URL=/api` *before* rebuilding.
- **The build guard only catches an unsafe *value*, not an absent one.** The
  `next.config.ts` check throws when `NEXT_PUBLIC_API_BASE_URL` is set to a
  loopback or preview host, but an *unset* variable skips it entirely and
  `src/lib/api.ts` then falls back to `http://localhost:3001/api`. That is the
  recycle case above: a remote browser resolves the inlined `localhost` against
  its own machine, so login dies with "تعذّر الوصول إلى الخادم" / "could not
  reach the server" while the same build passes every Playwright spec on the
  sandbox. `.run/restart-app.sh` now writes `NEXT_PUBLIC_API_BASE_URL=/api` into
  the app's `.env.local` before building, so a cold start is deterministic.
  Confirm a fresh build with
  `grep -r 'http://localhost:3001' apps/*/.next/static/chunks/` — it must be empty.
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
- **Capture the customer app over `localhost`, not `127.0.0.1`.** The exported
  bundle's `NEXT_PUBLIC_API_BASE_URL` points at `http://localhost:3001`, and the
  customer refresh token is an HttpOnly cookie. A browser opened on
  `http://127.0.0.1:12001` treats `localhost:3001` as a different site, so the
  refresh cookie is not sent, every authenticated surface redirects to `/login`,
  and a capture script that asserts an authenticated route fails with "landed on
  /login". Use `http://localhost:12001` and the session survives a reload.
- **The admin light theme is a warm ivory system, not the customer's tokens.**
  The two apps keep separate token blocks, but the approved identity is the same:
  field `#f7f4ed`, raised `#fbf9f4`, body type `#22201d`, muted `#5a544b`, gold
  text `#7d5f10`. Do not reintroduce the old cold ramp (`#f5f6f8` / `#0d2338`);
  the customer site never used it and the mismatch reads as two products.
- **Admin light-theme checks are scripts, not specs.**
  `.run/check-admin-light-palette.mjs` (WCAG pairs) and
  `.run/verify-admin-light.mjs` (browser assertions) fail loudly and must stay
  green. The branding editor is company-scoped, so the verifier signs in a second
  time as a company administrator to assert it; a Super Admin carries no tenant
  scope and legitimately does not render it.


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

### Execution 07 light-theme gotchas

- **A screenshot named for a theme is not proof of that theme.** The audit
  capture runs a locale × theme loop and then captures the tablet and mobile
  dashboards inside the same test; setting the viewport does not reset the
  locale or the theme, so `dashboard-{tablet,mobile}-ar-dark.png` held an English
  light render. Set `ar` and `dark` explicitly and assert `data-dir` and
  `data-theme` before capturing. `.run/verify-exec11-theme.mjs` reads the
  dominant colour of each capture and fails when a `-light` file is not ivory or
  a `-dark` file is not navy.
- **The customer session lives in memory.** A `page.goto` reload between captures
  races the refresh and can bounce an authenticated surface to `/login`, which
  then gets captured under the authenticated surface's name. Capture the
  dashboard immediately after the sign-in redirect, or assert the landing URL.
- **The theme and locale keys are per-app.** The bootstrap reads
  `oryx.customer.theme` / `oryx.customer.locale` in `apps/customer` and
  `oryx.theme` / `oryx.locale` in `apps/admin`; setting any other key is silently
  ignored and the capture renders the default.
- **A tall dark footer can dominate a full-page capture.** Read the dominant
  colour from the top band, not the whole image, or every light page reads as
  dark.
- **Gold is two tokens, not one.** A gold *text* colour on an ivory field must be
  dark enough for 4.5:1; a gold *tint fill* must be light enough for dark ink to
  read on it. Painting `--gold` as text on a gold tint puts the label in the same
  colour family as its own background. The chip foreground is `--gold-on-tint`.
  This is why the light theme has both and the dark theme can reproduce `--gold`.
- **The tint percentages differ per theme on purpose.** The admin dark ramp keeps
  the percentages its rules already used (badge 15%/40%, collapsed nav 18%, nav
  gradient 20%) so the approved dark render stays byte-identical; the light ramp
  matches `LIGHT_THEME`. `scripts/check-token-parity.mjs` records the dark values
  as an explicit exemption. "Fixing" the dark ramp to match the light one changes
  the approved dark theme — don't.
- **Measure the computed style, not the screenshot, when judging a theme.** A
  region-average sampler with a loose selector (`main`, `section`) matches the
  wrong element and reports nonsense such as a dark "card" in a light theme.
  `scripts/probe-light-chrome.mjs` reads `getComputedStyle` for the page
  background and text and asserts they equal `LIGHT_THEME`.
- **The evidence preview server only maps `/evidence/` onto `.run/evidence/`.**
  A capture copied to `.run/evidence/exec07-final/x.png` is reachable at
  `/evidence/exec07-final/x.png` on port 12000. Any other path falls through to
  the Next app and returns that app's HTML shell with a `404`/`200`, so a link to
  a file that was never copied looks plausible and serves the wrong thing. Check
  `content-type` before publishing a link.

### Execution 12 gotchas

- **A test must never clean up by company when it borrows a seeded tenant.**
  `execution10-mobile-integration.e2e-spec.ts` used `DEMO-ALNOOR` as its fixture
  and then deleted products with `where: { companyId }`, which also removed the
  seeded catalog and opening stock. The Execution 02 inventory UI test then failed
  on the *next* run, looking like a code regression. Clean up by the ids you
  created (`where: { id: { in: [...] } }`), never by the tenant you borrowed.
- **The API e2e suites run against `oryx_dev`, the same database as the UI suite.**
  They are not isolated. A destructive `afterAll` corrupts the fixtures the
  Playwright suite reads, and the symptom appears in a later, unrelated test.
- **`.env` ships production-ish throttle limits; the UI suite needs the overrides.**
  `AUTH_THROTTLE_LIMIT=10` in `.env` makes the Playwright suite fail with 30s
  `waitForURL` timeouts after roughly ten logins. `scripts/dev-up.sh` sources
  `.env`, so a stack it started is *not* ready for `test:ui`. Start the API with
  `AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000`.
- **A sandbox restart removes Postgres, pnpm and the Playwright browsers.**
  `bash scripts/dev-up.sh` restores Postgres, the built API and pnpm. It does
  *not* restore the browsers: run
  `pnpm --filter @oryx/admin exec playwright install chromium` afterwards, or every
  UI test fails in ~3ms with `Executable doesn't exist`.
- **A 2–3ms failure is a launch failure, not a test failure.** When every test in a
  suite fails instantly, read one error in isolation (`-g "<name>"`) before
  suspecting the code.

### Execution 13 gotchas

- **A banner has two independent states, and only the pair reaches customers.**
  `isActive` is an operator toggling a slide on; `status` (DRAFT/PUBLISHED) is a
  reviewer approving what it says. The customer homepage serves only `PUBLISHED`
  **and** `isActive`, so `PUT /cms/banners` must keep writing `status` only when it
  is supplied — otherwise toggling activation would silently publish a draft.
- **A catalogue item is never hard-deleted.** There is no `DELETE /inventory/products/:id`;
  invoices, movements and images reference the row. A test that creates one cleans up
  by deactivating it (`PATCH { isActive: false }`) and removing its images, not by
  deleting it.
- **A catalogue item belongs to a tenant.** The platform Super Admin has no tenant
  scope, so creating a product as the Super Admin is a `403`. Product fixtures in the
  UI suite sign in as a tenant administrator (`ENTERPRISE_ADMIN`).
- **The media pipeline rejects anything under 64×64.** A hand-written PNG fixture must
  be at least 64px on each side or the upload fails `400 media.dimensions_invalid`.
  Build one with `zlib.deflateSync` + a CRC32 (see the UI spec's `pngBuffer`), or use
  `sharp` as the API suites do.
- **The inventory page opens on the Valuation tab.** A UI test that wants the product
  table must click `inventory-tab-products` first, and the catalogue is paginated, so
  locate a fixture through `product-search` rather than assuming page 1.
- **Announcements address two id spaces.** A staff `userId` is not a
  `CustomerAccount.id`, and the consumer inbox reads only rows carrying
  `customerAccountId`. `POST /notifications/announcements` takes `userIds` and
  `customerAccountIds` / `allCustomers` separately; a broadcast is capped at
  `MAX_ANNOUNCEMENT_RECIPIENTS` (5,000) so one call cannot queue unbounded rows.

### Planned-ecosystem gotchas (Execution 20)

- **The account id always comes from the token.** Every `/customer/*` route in
  `apps/api/src/ecosystem/customer-ecosystem.controller.ts` reads the account
  from `@CurrentCustomer()`, never from a path or body. A foreign RFQ, return,
  recovery request, fleet, vehicle or photo must be a `404`, not a leak — the
  suite `execution20.e2e-spec.ts` pins each one.
- **A consumer token on a staff route is `401`, not `403`.** `CustomerAuthGuard`
  and the staff principal guard reject the wrong plane before any permission is
  read, so the smoke test expects `401` on `/provider/rfqs` with a consumer
  token and `403` only for a *staff* user without provider membership.
- **Unknown fitment is not incompatibility.** `EcosystemService.checkFitment`
  returns `fitmentKnown: false` when the product has no fitment rows at all;
  `compatible` is then `false` too, but the UI must show the unknown state. Never
  collapse the two.
- **A fitment query needs a real product id.** An unknown `productId` is a `404`;
  use an id from `GET /customer/catalog/products` in a smoke test.
- **The fleet driver response nests the id.** `POST /customer/fleets/:id/drivers`
  returns `{ drivers: [...] }`, so a new driver's id is `drivers[0].id`, not the
  top-level `id`.
- **`OPERATIONAL` still means it works.** `SENSAGE_AI` reports `configured: false`
  and produces no analysis until a credential is stored; the analysis path stores
  every result as a `PENDING` suggestion and the mobile screen must never label
  it a diagnosis. `apps/mobile/test/ecosystem-honesty.test.ts` guards this.
- **The registration endpoint is throttled.** A smoke test that registers a
  fresh consumer per section hits the auth limiter and sees `429` (which empties
  the token and cascades into spurious `401`s). Run the API with
  `AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000`.
- **Build the API before a smoke test.** `node apps/api/dist/main.js` serves
  compiled output; after a source change run `pnpm --filter @oryx/api build`
  first or the server serves stale routes.

### Document / PDF gotchas (Task 1 — preview, print, attachments)

- **A Chromium footer template is its own document and ignores `@font-face`.**
  Declaring a face in `headerTemplate` / `footerTemplate` (even a valid base64
  data URI) makes Chromium render *nothing* in that region. The footer therefore
  uses the host fallback face, so a glyph the host lacks prints as a broken box.
  The contact icons in `officialFooterTemplate` are inline SVG for this reason —
  never put an emoji such as 📞 (U+1F4DE) or 🌐 (U+1F310) there; no installed
  face covers it and it emitted a `\x00`. `CONTACT_ICON_{PHONE,MAIL,GLOBE}` in
  `apps/api/src/documents/templates/chrome.ts` are the replacements.
- **Latin text must use `DOCUMENT_LATIN_STACK`, not the Arabic-first stack.** The
  official template inherited the Arabic body font, so Latin (the TRN, the row
  labels) rendered in a wide Naskh face and the TRN block drifted ~21.6pt. Latin
  runs set `font-family:${DOCUMENT_LATIN_STACK}`; Arabic keeps falling back to
  NotoNaskhArabic.
- **The 500 on preview/print is a missing Chromium, not a template bug.**
  `launchChromium` in `apps/api/src/documents/pdf/pdf-renderer.service.ts` falls
  back to a system browser (`/usr/bin/chromium`) and raises an actionable error
  when none exists, instead of an opaque `Internal Server Error`.
- **A footer icon renders as vector, not text.** A visual diff will show it as a
  drawing; a text-extraction diff will not — check `page.get_drawings()`.
### Print and attachments gotchas

- **The print layout is fixed by the approved PDF, not by the screen.** The
  reference forms are `oryx 22 (1).pdf` (page 1 = invoice, page 2 = quotation).
  `apps/admin/src/lib/print-document.ts` positions every run by absolute point
  coordinates taken from that PDF, and the assets in `print-assets.ts` are its
  own vectors. When a form and a screen disagree, change the screen, never the
  form. To re-check fidelity, render the model with Playwright, then diff text
  anchors against the reference with PyMuPDF — they should land within ~1pt.
- **A positioned parent re-bases an absolute child.** `.notes-text` is
  `position:absolute` inside `.notes`, which is itself positioned, so its `top`
  is measured from the notes box, not the page. Getting this wrong sent the
  warranty line ~500pt below the box and off the sheet — the classic
  "Internal Server Error on preview" symptom was a template that rendered
  off-page, not a crashing endpoint.
- **`URL.revokeObjectURL` must be deferred.** Revoking (or removing the anchor)
  synchronously after `a.click()` cancels the download in Chromium. Defer both.
- **Stacked modals must close only the top one.** The admin `Modal` in
  `ui.tsx` keeps an open-modal stack; each instance listens on `window`, so
  without the stack a single Escape (or backdrop click) closed the preview and
  the attachments modal beneath it. The completion signal in tests is
  `.oryx-modal` count 0, not the trigger.
- **The print route kind is upper-case.** `GET /print/:kind/:id` takes
  `SALES_INVOICE`, `RECEIPT`, `QUOTATION`, `SALES_ORDER`, `CREDIT_NOTE` — a
  lower-case kind is a 404 "Unknown document kind", not a 500.
- **Attachment storage is runtime, never committed.** The API writes to
  `ATTACHMENT_STORAGE_DIR` (default `apps/api/storage/attachments`); `storage/`
  and `apps/api/storage/` are gitignored. `ATTACHMENT_MIME_TYPES` accepts PDF,
  JPEG and PNG only.

### Document parity gotchas (Executions 18/19)

- **Chromium footer/header templates cannot load webfonts.** A
  `displayHeaderFooter` footer is rendered in a separate document that ignores
  every `@font-face`, so any text there falls back to the OS default (DejaVuSans)
  and silently differs from the body. Images *do* render there. If footer text
  must use the ORYX faces, draw the band as an inline SVG/PNG instead of HTML
  text — do not expect the embedded `@font-face` to apply.
- **`pymupdf` page rasterisation is the only honest parity metric.** Render both
  the reference and our output at the same DPI and diff the greyscale rasters.
  A residual ~8-12% is anti-aliasing noise from a different PDF engine and will
  not reach zero even when the same file is drawn twice; judge element presence,
  order and geometry, not the raw percentage.
- **Verify the QR by decoding, not by eye.** Rasterise the produced PDF and
  decode it with `jsQR` (available in `node_modules`). A QR that looks right can
  fail to scan; the only proof is a decoded string matching the verification URL.
- **The inspection cover overflows to a sixth page very easily.** The photo band
  and the info card fight for the printable height; a few points too tall pushes
  the Important Remarks block onto page 2. Check the page count after every
  cover change (`pymupdf` `page_count` must be 5).
- **Report/print money is computed once.** `computeDocumentTotals` in
  `apps/api/src/common/document-totals.ts` is the single source for subtotal,
  discount, VAT and total in integer minor units; the UI, PDF and print path all
  consume it. Never recompute a figure in a template.

### Mobile gotchas

- **An access token expires mid-session, not at start-up.** Cold-start restore is
  not enough: the common expiry happens while the app is open, and before the
  refresh seam existed every action then failed ("could not cancel", "upload
  failed") until the app was restarted. `apps/mobile/src/lib/api.ts` exposes a
  per-plane seam — `setSessionRefresher` / `setSessionExpiredHandler` — that each
  session store registers. On a `401` to an authenticated request the client
  rotates **once** (single-flight, so a burst of 401s is one rotation), replays
  the request, and calls the expired handler when the rotation is refused.
  `uploadFile` recovers the same way so a photograph is not lost. A `403` is
  **never** treated as an expiry: it is a permission refusal. Pinned by
  `apps/mobile/test/session-refresh.test.ts`.
- **Logout revokes the refresh family, not the issued access token.** After
  logout a refresh is `401` (`auth.refresh_reused`), but the already-issued
  short-lived access token stays valid until it expires. Do not assert that
  logout invalidates an access token — assert that the session cannot be
  *extended*.
- **The double-submit token must be adopted from the login/refresh body.** A native
  client has no `document.cookie`, but React Native's cookie jar still replays the
  HttpOnly `oryx_crt` / `oryx_rt` cookie on every request to its scope, so
  `CsrfGuard` demands a matching `x-oryx-csrf` header on every unsafe method. The
  API returns `csrfToken` in the body for `x-oryx-client: mobile`; the app must
  store it (`setCsrfToken` / `setStaffCsrfToken`) and echo it. Omitting it is not a
  harmless no-op: the restore is answered `403 auth.csrf_token_invalid` and the
  customer is silently dropped into offline demo mode. The token is kept **stable**
  across a refresh — only the refresh token rotates — so the app may echo the same
  value again. Pinned by `apps/mobile/test/csrf-double-submit.test.ts` and
  `apps/api/test/execution14-mobile-restore.e2e-spec.ts`.
- **Android blocks cleartext HTTP from targetSdk 28 on.** A release build cannot
  reach `http://localhost:3001` without an explicit exemption, and the failure is
  silent: OkHttp throws `UnknownServiceException`, the app maps it to an offline
  error, and every live rail renders empty. `plugins/with-cleartext-local-api.js`
  declares a `network_security_config.xml` scoped to the loopback hosts and the
  emulator alias only (`localhost`, `127.0.0.1`, `10.0.2.2`, `10.0.3.2`); every
  other destination stays HTTPS-only. `apps/mobile/android` is generated, so the
  policy lives in the plugin and is applied by `expo prebuild`.
- **The home rail reports availability as a boolean, not a count.** A public
  projection must not expose a tenant's inventory depth, so
  `GET /customer/homepage` returns `available: boolean` (`trackStock ? onHand > 0 :
  true`). The card treats `stock <= 0` as sold out, so the client adapter must map
  the flag rather than default the count to zero, or every in-stock product renders
  as out of stock.
- **Every tenant seeds its own copy of the demo catalogue, so an unscoped home
  query repeats itself.** The demo seed gives ORYX-HOLDING, ORYX-AUTO, the demo
  tenants and each E2E fixture its own copy of the same five providers and six
  products. A homepage rail that queried across tenants returned "Front brake pad
  set" and "Al Noor Parts" about ten times each. `getFeaturedProviders` and
  `getPopularProducts` in `customer-homepage.service.ts` now de-duplicate — by SKU
  for products, by display name for providers — and keep the photographed copy so a
  blank twin cannot displace a photographed one. Read a window of
  `RAIL_SCAN_LIMIT` (4× the rail) rows before de-duplicating, not `RAIL_LIMIT`, or
  ten copies of one SKU collapse the rail to a single tile. Pinned by
  `apps/api/test/execution10-mobile-integration.e2e-spec.ts`.
- **A local API can be reading `oryx_test`, not `oryx_dev`.** `DATABASE_URL` in the
  ambient shell wins over `.env`, so a restarted `node dist/main.js` may serve the
  e2e database — which is empty until the suites seed it. A homepage probe then
  returns rows whose ids do not exist in `oryx_dev`, which looks like a projection
  bug. Check `tr '\0' '\n' < /proc/$(pgrep -f "node dist/main.js")/environ | grep
  DATABASE_URL` before trusting a manual probe, or pass the URL explicitly.
- **Every file under `(app)` becomes a tab.** Expo Router registers the whole
  directory, so a screen that is only pushed onto the stack (a detail screen, the
  booking wizard, invoices, notifications) renders as an extra tab whose label is
  the raw route name. Declare it with `options={{ href: null }}`. The route name
  is the flattened file path: a nested index is `bookings/index`, not
  `bookings`, and the wrong name silently renders a stray tab instead of the
  screen you meant. `apps/mobile/test/tabs.test.ts` derives the route list from
  the filesystem and fails when a new screen is added without a declaration.
- **The customer session survives a reload on web.** `session-storage.ts` persists
  the session to `localStorage` (`oryx.marketplace.session`, plus `.cart`,
  `.favourites`, `.locale`, `.theme`) when running in a browser, so an automated
  check can sign in once and then navigate to each screen by URL. This replaces
  the earlier note that the session was in memory only; that is no longer true.
  A reload still makes the browser present the refresh cookie, which the API
  rejects for a body-carried token — an artefact of running a native client in a
  browser, not a product path.
- **The marketplace tab `href`s are flattened route paths.** The tabs live at
  `/mobile/{home,parts,services,sensage,account}`, not `/(tabs)/...`. A capture
  script that drives the tab bar with the group paths finds nothing and silently
  re-shoots whichever screen it was already on, which looks like 15 identical
  screenshots rather than an error.
- **RTL is applied per element, not on `<html>`.** `Screen` and the text
  components carry `direction` / `writingDirection` from the locale, and rows are
  reversed with `flexDirection: row-reverse`. There is no `dir` attribute to read
  on the document element, so assert RTL by counting elements that compute to
  `rtl` (English ≈ 1, Arabic ≈ 455–678 per screen).
- **Android 12+ ignores a photographic `splash.png`.** The platform composes the
  launch screen from a window background and one centred icon, so the splash
  image is drawn only on older releases. The photography a customer sees on a
  current device comes from `components/launch.tsx`, which covers the gap until
  the stored session has been read. Keep its background the same navy as the
  platform splash or the hand-off shows a colour step.
- **The APK is a build output and is gitignored.** `apps/mobile/.gitignore`
  excludes `/android`, so `app-release.apk` never enters the history. The
  `release` build type points at `signingConfigs.debug` (Expo template default),
  so it is debug-signed — fine for a demo hand-out, not for a store submission.

### Execution 10 gotchas

- **A seeded deployment had zero bookable slots.** Availability is generated from
  a `BookingResource` plus its `WorkingHours`, and the seed created only workshop
  bays, so `GET /customer/bookings/availability` returned `[]` and the mobile
  wizard showed an empty day with no error. The seed now creates two `BAY`
  resources per company, open 08:00-20:00 daily. If availability is ever empty
  again, check the resources before the client.
- **A write on a pushed screen is invisible to the tab underneath.** The account
  tab and the address list stay mounted while a detail screen is pushed on top,
  and their `useAsync` deps do not change, so a vehicle or address created on the
  pushed screen does not appear until a manual reload. `useReloadOnFocus`
  (`apps/mobile/src/lib/use-reload-on-focus.ts`) refetches on focus; use it for
  any list a sibling screen can mutate.
- **The live-orders store exposes `refresh`, the async hook exposes `reload`.**
  They are different names for the same idea and mixing them up is a type error
  rather than a silent bug.
- **A demo rail must be gated by the session, not by an empty response.**
  `parts/index.tsx` originally showed the demo product rail whenever the live
  catalogue came back empty, which is the live case on a fresh tenant. Gate demo
  data on the absence of a session (`!isLive` / `!isSignedIn`).
  `apps/mobile/test/demo-gating.test.ts` walks every screen file and fails if one
  reads the demo `repository` without also reading the session; add a screen to
  its `ALLOWED` map only when there is genuinely no session to branch on.
- **`MediaStorageService` sniffs magic bytes and ignores the declared
  content-type.** A real PNG posted as `application/pdf` is accepted, and
  non-image bytes posted as `image/png` are refused. A test that asserts on the
  declared type alone will assert the wrong thing.
- **A 1x1 PNG is refused by the image pipeline.** Smoke tests need a real image;
  `scripts/exec10-smoke.sh` generates an 80x80 RGB PNG for exactly this reason.
- **A booking slot must be labelled in UTC, the zone the engine planned it in.**
  `assertSlotBookable` plans a day from UTC midnight and returns each slot as an
  instant, so `slotLabel()` in `apps/mobile/src/lib/format.ts` formats with
  `getUTCHours()`. A local-time label shows a time the workshop never offered
  whenever the device is off UTC. Four copies of that formatting were collapsed
  into the one helper; use it rather than inlining the padStart pair again.
- **Rescheduling re-checks availability with `excludeSlotId`.** Without that
  exclusion a booking collides with its own row and every move to a slot in the
  same window is refused. A unique violation on the new time must surface as
  `BOOKING_SLOT_UNAVAILABLE` (409), not a generic failure.
- **A failed upload must not keep reading "uploading".** `sensage/new.tsx` gives
  each shot its own `uploadState` (`pending`/`failed`) so a failed send is marked
  and offers a retry. A single screen-level `uploading` flag leaves a shot that
  never landed looking like work in progress.
- **A searchable `Select` filters on label, sublabel and `keywords`.** The match
  lives in `filterOptions` (`apps/mobile/src/lib/options.ts`) so it is unit-tested
  directly. Pass both scripts as keywords — `keywords: \`${make} ${makeAr}\`` — so
  an Arabic term finds an English label without switching the app locale.
- **The e2e suites need `DATABASE_URL` pointed at `oryx_test`.** The API default
  is `oryx_dev`; running `test:e2e` against the dev database mutates seeded data.
  Create, migrate and seed `oryx_test` first, then export the URL for the run.

### Execution 11 gotchas

- **A merchant account resolves its provider from `ProviderUser`, not from a
  permission.** The portal looks up the membership link; an account with the
  right permission but no link gets `403`. The seed links `admin@oryx-auto.local`
  to the ORYX-AUTO company's first provider so the merchant portal works on a
  fresh database — without it every `/provider/...` call answers `403` and looks
  like a routing bug.
- **`ProviderUser` has no `upsert`-able name beyond `@@unique([providerId, userId])`.** Seeding the link uses `findFirst` + `create`/`update` rather than `upsert` so the script stays readable.
- **`GET /subscriptions` scopes to the token's company.** A company administrator
  reads only their own subscription; sending a `companyId` query does nothing on
  the company plane. The mobile `subscriptionApi.current()` deliberately sends no
  id.
- **`GET /plans` needs `company.subscription.read`,** which every company
  administrator holds. The catalogue is the same one the platform edits; the
  mobile screen shows `monthlyPrice` (major units) and the modules each plan
  licenses.
- **A plan screen cannot switch plans.** Assigning a subscription is a platform
  action (`POST /subscriptions/companies/:id/assign`); the mobile screen states
  that rather than offering a button that changes nothing.
- **The offer feed filters in SQL, not on the client.** `GET /customer/catalog/offers`
  returns only `isActive` offers inside their `startsAt`/`endsAt` window, so a
  withdrawn or expired offer never reaches the app. Do not "fix" an empty rail by
  relaxing the query.
- **`percentOffBp` is basis points.** `20000` (200%) is rejected with `400`; the
  bound is enforced in the DTO, not the screen.

### Inspection engine gotchas (Execution Phase 2)

- **The section catalogue lives once.** `packages/shared/src/inspection.ts`
  declares the seven areas, their items, their result sets, the paint conditions
  and the chassis regions. The API validates against it and the admin workspace
  renders from it. Add an area there, not in a second list.
- **A section's item count is asserted by a test.** Interior 12, Exterior 6,
  Engine Compartment 13, Road Test 13. `packages/shared/test/inspection.test.ts`
  fails if the catalogue drifts from the report it reproduces; update the test
  deliberately, not to silence it.
- **Writing to an area the job did not select is rejected.** This is what keeps a
  paint-only job from asking about the engine. Do not relax it to let a screen
  render every section.
- **A marker outside the diagram is rejected, not clamped.** Validation bounds
  the normalised coordinates. A clamped marker would be stored and then drawn in
  the wrong place, which is worse than a rejected write.
- **Submission is gated on completeness server-side.** Every item answered, and
  every diagram/diagnostic section carrying either content or an explicit
  `noFindings`. The disabled button is a courtesy; the API is the gate.
- **`InspectionSectionResult.noFindings` defaults to `false`.** Migration
  `20261104002429` adds it. A diagram or diagnostic section with neither markers
  nor this flag cannot be submitted.
- **Approved inspections are frozen.** Section writes and cancellation return
  `409`. The workspace hides the controls; the service refuses regardless.
- **`POST /:id/review` needs `erp.inspection.report.approve`, not
  `erp.inspection.write`.** An inspector may write the report but not approve it.
- **Job numbers come from the `JOB` document sequence.** Add a key to
  `DOCUMENT_SEQUENCE_KEYS` rather than formatting a number in the service.
- **The media pipeline re-encodes to WebP and strips EXIF.** An upload test must
  assert `image/webp`, not the type it sent; asserting the sent type fails.
- **Customer `nameEn` and `nameAr` are independently optional.** At least one is
  required, enforced in `SalesService.createCustomer` because a class-validator
  rule cannot express "one of these two". A missing name is stored as `''`, so
  reads across sales, accounting and reports need no null branch.

### Printed-document gotchas

- **The approved reference is `oryx 22 (1).pdf` (page 1 = invoice, page 2 =
  quotation).** Every printed financial document must match it: date label
  "Order Date" on the invoice (the quotation keeps "Quotation Date" +
  "Expiration Date"; the invoice has no second date row), the weekday +
  `dd/mm/yyyy` + 12-hour clock, whole quantities as `1` (not `1.0000`), the
  currency **symbol** (`BD`, not the ISO code `BHD`), and the resolved country
  **name** (`Bahrain`, not `BH`). The client renderer
  (`apps/admin/src/lib/print-document.ts`) and the server template
  (`apps/api/src/documents/templates/official-financial.template.ts`) must agree
  — change both, then re-render and diff against the reference.
- **The totals tax label states the charged rate, not the ratio.** The approved
  form prints "Tax 10%" (the line rate), even when a discount makes the
  tax/subtotal ratio 9.65%. `toPrintTotals` in `apps/api/src/print/print-format.ts`
  takes `taxRateBp` from the document's lines for exactly this reason; do not
  fall back to the ratio when a line carries a rate.
- **Contact icons are inline SVG, never emoji.** The phone/globe glyphs
  (`U+1F4DE`/`U+1F310`) are absent from the installed faces and print as
  missing-glyph boxes, so the footer uses inline SVG (`CONTACT_ICON_PHONE`/
  `CONTACT_ICON_GLOBE`) that renders on every host.
- **`Intl.DateTimeFormat`/`Intl.DisplayNames` are the date and country source.**
  Dates print in `Asia/Bahrain` (the reference is Bahrain time) and the country
  code resolves to its display name; do not hard-code a name or a timezone
  offset.

### Execution 18 gotchas

- **The report and the financial forms print to different edges.**
  `REPORT_PDF_MARGINS` lifts only the inspection report's top edge (the brand
  band sits ~5.6mm from the paper). Its side margins stay at the default because
  the cover photograph bleeds to the paper edges by cancelling exactly that
  inset. Do not fold the report onto `OFFICIAL_PDF_MARGINS`; the header drops
  ~20pt.
- **A full-bleed band must not widen the layout box.** A negative `margin`, or a
  wider in-flow box, enlarges Chromium's printable area and shifts every element
  on the sheet sideways. Paint the bleed with an absolutely positioned image that
  overflows an in-flow figure — absolute overflow is clipped by the paper edge
  and does not resize the page.

### Execution 19 gotchas

- **The report footer is the invoice footer.** The approved inspection report
  prints the same contacts row as the tax invoice — hairline rule, bilingual
  page counter left, phone and email centre, website right, registered address
  and CR beneath — so `documents.service.ts` routes both through
  `officialFooterTemplate`. Only the internal statements keep the compact
  `footerTemplate`. Do not reintroduce a report-specific footer; it drifts.
- **Report `REPORT_PDF_MARGINS.bottom` is 11mm, not 20mm.** The official footer
  template paints inside the bottom margin; a 20mm bottom margin pushed the
  contacts row off the page. The footer template lives in the margin, so it
  consumes no content height — keep the margin tight enough to show it.
- **The chassis page distributes its boxes *around* the drawing.** The approved
  sheet centres the chassis artwork and places the eight region cards Front
  above, Rear below, three pairs down the sides — not a side list. The board is
  forced `direction:ltr` because the arrangement is physical; in RTL the left
  cards would otherwise flip to the right.
- **The paint legend prints in the reverse of the catalogue order.** The
  approved key reads sectioned, Change, Filler, Paint left to right, so
  `paintDiagram` reverses `PAINT_CONDITIONS` and the row is `direction:ltr`.
  There is no marker table on the approved sheet — do not add one back.
- **The cover photograph carries the ORYX wordmark as a watermark.** The
  approved cover lays the logo over the photo band at low opacity; the QR sits
  in the lower-right of the same band. Both come from the issuer/verification
  already in the payload — no new fields.
- **Render the report through the product path to verify parity.** The
  `.run/render-report2.mts` harness imports the compiled template, the product
  `QrService` and `officialFooterTemplate`, so a rendered sheet can be decoded
  (jsQR) and measured (PyMuPDF) against the reference. It is scratch, not
  committed.

### Execution 20 gotchas (dashboard, catalog, typography)

- **The module catalog is a database table, not a compile-time constant.** The
  dashboard tiles, the module dashboards' banner copy and the admin catalog
  screen all read `Module` rows now, falling back to `getModule()` only for a
  row created before the `tileImage`/`isActive` columns existed. `seedModules()`
  is create-only so an operator edit survives a reseed. Add a module to
  `packages/shared/src/modules.ts` *and* seed it, or the dashboard will not show
  it.
- **A retired module is hidden, not deleted.** `isActive: false` removes the tile
  from `GET /dashboard` and the catalog screen shows a "Retired" badge, but the
  row, its licence and its route stay. Never delete a catalog row to hide a
  module.
- **The banner mark is fixed-aspect raster artwork.** The lockup is 1404×320, so
  at its 64px desktop height it is ~281px wide and cannot sit beside the identity
  block on a phone. The `@media (max-width: 640px)` rule stacks the hero and caps
  the logo at 240px; without it a 320px viewport overflows (the responsive-matrix
  suite fails).
- **The homepage banner is logo-left, not centred.** The approved design anchors
  the mark on the reading-start edge with the identity block beside it, and the
  field is ivory in the light theme (the navy-ink colourway swaps in). The
  branding spec pins that geometry.
- **Typography is per-company and applied at the document root.** `branding-context.tsx`
  writes the tenant's `typography` section to CSS custom properties
  (`--font-size-*`, `--oryx-heading-weight`, `--oryx-label-tracking`); every
  component derives from those tokens. Changing the section in the settings
  centre calls `refreshTypography()` so the shell updates without a reload.

### Adding a new ERP module

1. Add a `ModuleDefinition` to `packages/shared/src/modules.ts`.
2. Add its permissions to `packages/shared/src/permissions.ts`.
3. `pnpm db:seed` to upsert the module row.
4. Add the module key to the relevant plans.
5. Add the route under `apps/admin/src/app/(app)/`.

Navigation, guards, plan editing and dashboard tiles all read the same catalog,
so nothing else needs changing.

### Document rendering gotchas (Phase 3)

- **The stored `pageCount` and the physical PDF page count must agree.** The
  shared planner (`planInspectionReport`) decides how many pages a report is
  *designed* to have; Chromium decides how many pages it *renders*. When a
  designed page is taller than the 265mm A4 content limit, Chromium spills an
  extra page and the two numbers diverge silently — the test suite asserted only
  `pageCount >= 3` and that the PDF page tree matched the stored value, both of
  which stay true after a spill. The dense-payload test now asserts
  `pageCount === planInspectionReport(areas).length + 1`.
- **The worst case is a fully-populated checklist.** Every item answered, a note
  on a third of the items and a section remark is the densest a report can be.
  Measure that case, not the sparse one, when changing item typography or
  spacing. The Engine Compartment page is the tallest (13 rows).
- **Measure with a real Chromium render, not by reading the CSS.** The
  measurement helpers under `apps/admin/.run-*.mjs` render the dumped HTML and
  report each designed page's height in mm. Set `ORYX_DUMP_HTML=<dir>` to make
  `documents.service.ts` write the composed HTML, then measure, then remove the
  instrumentation — it is debug scaffolding, not a feature.
- **Do not truncate a note to make a page fit.** An official inspection report
  that silently drops a technician's finding is a data-integrity defect, not a
  layout fix. Reduce padding, leading, font size and column widths instead.

## Constraints from the owner

- Keep future app services structurally ready; the consumer app belongs to a
  later execution.
- Do not rebuild unrelated projects, start the mobile app first, or replace the
  approved visual identity.
- Prefer increments with true DB-backed CRUD and tests over blanket placeholder
  modules.
- Never modify or delete pre-existing project code without auditing it first.
- Do not commit production credentials, tokens or secret keys.

### Cold-sandbox recovery gotchas

- **The sandbox is recycled between sessions.** A restart drops PostgreSQL,
  nginx and every Node service while leaving the source, the built `dist/`,
  `.next/`, and the seeded cluster under `.run/pgdata` intact. Recover with
  `bash .run/start-stack.sh`; it reinstalls PostgreSQL 17 if the package is
  gone, starts the cluster, then the API, admin, customer, mobile-web and the
  two preview proxies. Do not re-run migrations or the seed — the demo data
  survives.
- **`pnpm` is installed through corepack and disappears with the image.**
  `command -v pnpm` failing is expected; the start script writes a shim at
  `$HOME/.local/bin/pnpm`. Add `$HOME/.local/bin` to `PATH` before any `pnpm`
  call.
- **Playwright browsers are lost with the image too.** A run that dies with
  `Executable doesn't exist … headless_shell` needs
  `pnpm --filter @oryx/admin exec playwright install chromium` again.
- **The browser suite needs `DATABASE_URL` in the shell.** Its global setup
  calls `scripts/reset-seed-mfa.mjs`, which refuses to run unless
  `DATABASE_URL` points at a development/test database. A bare shell has no
  `.env`, so the suite aborts with "Refusing to reset MFA" before any test
  runs. Source the file first: `set -a && . ./.env && set +a`.
- **PyMuPDF is not in the image.** The PDF validation step
  (`.run/render-pdf-samples.py`) needs `pip install pymupdf` first.
- **`restart-customer.sh` matches `next-server` by working directory.** The
  admin and customer apps share the process name, so an earlier version killed
  every `next-server` and left the admin proxy returning `502 … upstream 3000
  unavailable`. It now reads `/proc/<pid>/cwd` and only stops the customer
  server; the admin server survives. If admin is down for any reason, restart it
  with `bash .run/restart-app.sh admin` (also cwd-matched).
- **The customer app on `:3002` can be left holding a static-export build.**
  If `/login` renders the "design preview" banner (it does not reach the API),
  the `.next` tree is the GitHub-Pages export. Rebuild it with the live config:
  `env -u ORYX_STATIC_EXPORT -u NEXT_PUBLIC_ORYX_STATIC_EXPORT -u ORYX_BASE_PATH NEXT_PUBLIC_API_BASE_URL=/api pnpm --filter @oryx/customer build`,
  then `bash .run/restart-customer.sh`.
- **Never leave the admin app on `:3000` down after touching the customer
  app.** Both preview hosts share the same ingress; a dead upstream turns every
  admin capture into a `502` screenshot.

### Execution 08 remediation gotchas

- **A FormData checkbox posts a string, not a boolean.** `multipart/form-data`
  has no scalar types, so the HR document form's confidential checkbox arrives
  as `"true"` / `"false"` and `@IsBoolean()` rejects it with a 400 before the
  handler runs. `ToBoolean()` in `apps/api/src/common/transformers.ts` coerces
  it before validation and leaves anything else untouched, so a genuinely bad
  value still fails. Any new multipart boolean DTO needs it.
- **The printed QR must be the issued token, not a fresh one.** `PrintService`
  reads `OfficialDocument.verificationToken`; issuing creates the token, so a
  reprint and the issued PDF carry the same code. A record with no issued
  document prints no code rather than one that scans to nothing. Do not render
  a QR from anything other than the stored token.
- **`jsQR` cannot read the PDF directly.** The QR is a compressed image XObject;
  `apps/api/test/pdf-qr.ts` inflates it (`zlib`) and hands the raw pixels to
  `jsQR`. A test that only checks for a QR-looking block is not a verification —
  decode it and open the decoded URL.
- **`<input type="date">` yields a bare `YYYY-MM-DD`.** Leave-request DTOs must
  run `NormaliseIsoDate()` before `@IsISO8601()` or every create/edit/approve
  fails validation. The same applies to any date field posted from the form.
- **The Execution 08 UI spec mutates a seeded employee's leave balance.** A
  leave request has no delete endpoint, so the global setup
  (`scripts/reset-seed-mfa.mjs`) removes the rows tagged `E08UI-` and reconciles
  only the balances they touched. Tag any new mutating fixture the same way or
  the seeded baseline drifts on every run.
- **Run the API with raised throttle limits before the UI suites.** Without
  `AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000`
  the later specs fail intermittently in `signIn` with a `waitForURL **/dashboard`
  timeout — a login 429, not a product defect. It looks like flakiness because
  the failure moves between specs as the login count crosses the ceiling.

### Execution 09 gotchas

- **Execution 09 is a stack, not a branch off production.** The Execution 08
  remediation was never merged into `release/oryx-latest`, so
  `fix/oryx-remaining-requirements` builds directly on `897f428`. A PR against
  the production branch therefore shows the Execution 08 commits too until PR
  #13 merges; the diff self-heals to the Execution 09 commits afterward. Do not
  "fix" that by rebasing onto release — it would drop the Execution 08 fixes the
  branch depends on.
- **The browser suite rewrites the `docs/**` evidence PNGs.** A full
  `playwright test` run re-encodes every capture under `docs/audit/**` and
  `docs/execution-reports/screenshots/**`, so `git status` shows dozens of
  modified images that differ only by PNG recompression. `git checkout --` them
  before committing, or the PR carries meaningless binary churn.
- **`apps/admin/build` clears `.next`.** `next start` keeps serving the old
  build from memory, so restart the admin (and customer) server after a build
  before running the UI suites, or the suite exercises stale chunks.

### Customer storefront SEO gotchas

- **The customer `(account)` route group adds no path segment.** Those pages
  serve at the site root (`/dashboard`, `/bookings`, `/orders`, …), not under
  `/account`. A `robots.ts` or a link that disallows `/account` names a path
  that does not exist and leaves the real account pages crawlable. List each
  route by its real path.
- **A shared JSON-LD layout leaks onto nested routes.** `products/page.tsx` and
  `products/[id]/page.tsx` are siblings under `products/`, so an `ItemList` in
  `products/layout.tsx` is inherited by every product detail page. The listing
  markup lives in the `products/(list)/layout.tsx` route group, which the
  detail route does not enter.
- **Server-side SEO fetches need an absolute API origin.** The browser client
  uses a relative `/api` on purpose, but Node's `fetch` cannot resolve a
  relative URL, so `structured-data.ts` resolves an absolute origin from
  `ORYX_API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL` and degrades to no data rather
  than throwing when the API is down. Sitemap and JSON-LD therefore never fail
  a build.
- **A stale `.next/types/validator.ts` survives a route move.** After moving a
  page into or out of a route group, `tsc --noEmit` fails with
  `Cannot find module '…/products/layout.js'` until `rm -rf apps/customer/.next`
  and a fresh build regenerate the validator.
