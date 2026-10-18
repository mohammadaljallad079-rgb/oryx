# ORYX — Frontend / Backend Functional Audit

Audit date: 2026-10-16. Re-verified 2026-10-17 (crash recovery) and
2026-10-18 (Execution 06 follow-up, module-by-module live probe).
Audited revision: `fc2ab20` plus the working-tree fixes in `04_FIXED_DEFECTS.md`.

Every surface below was exercised against the running staging stack: a real
NestJS API, a real Next.js admin app, a real Next.js customer app, the Expo web
export of the mobile app and a real PostgreSQL database. Nothing was mocked.

## Stack under audit

| Surface | Port | Public host | Check |
|---|---|---|---|
| API (NestJS) | 3001 | `/api/*` via nginx | `/api/health` |
| Admin (Next.js) | 3000 | work-1 | `/login` |
| Customer (Next.js) | 3002 | work-2 | `/` |
| Mobile web (Expo export) | 8081 | work-2 `/mobile/` | `/mobile/login` |
| Reverse proxy (nginx) | 12000 / 12001 | ingress target | — |
| PostgreSQL 17 | 5432 | local only | `oryx_staging` |

## Connection inventory

| Layer | Count | Notes |
|---|---|---|
| API controllers | 32 | all under `/api/v1`, health at `/api/health` |
| Admin routed pages | 35 | every `MODULES` route resolves |
| Customer routed pages | 16 | website + dashboard |
| Mobile screens | 17 | Expo Router; each declared with `href: null` unless a tab |
| Module catalog entries | 21 | all `AVAILABLE` |
| Permission catalog entries | 153 | |
| API e2e specs | 13 | 277 tests |
| Browser specs | 16 | 189 tests |
| Mobile unit specs | 3 | 20 tests |
| Shared unit specs | 5 | 96 tests |

## Per-module verification

### Super Admin (Execution 01)

- Login, logout, session rotation, MFA enrollment and challenge all exercised in
  `auth-lifecycle.spec.ts` and `mfa.spec.ts`.
- Company provisioning creates a company, a subscription and an admin invitation
  in one flow (`admin.spec.ts`). Verified against the database: the seeded state
  returns to 6 companies after a reset, and the UI count matched the DB count
  exactly (6 companies, 10 branches).
- Plan editing is snapshot-based: editing a plan does not change an existing
  tenant's `Subscription.licensedModules` (`authorization.test.ts`).
- Delegation limits are enforced server-side: a company admin cannot grant a
  permission it does not hold, a non-delegable permission, or one the plan does
  not license (`admin.spec.ts`).

### ERP core (Execution 02)

- The accounting posting service asserts balance, resolves the open period and
  allocates the entry number in one transaction. A reversed entry stays in the
  ledger as a new POSTED entry, so the trial balance still balances
  (`erp.e2e-spec.ts`).
- Inventory moves through `InventoryService.recordMovement`, which locks the
  level row with `SELECT … FOR UPDATE`. `StockLevel.averageCostMinor` is scaled
  by 100 and read back with `wholeAverageCost`.
- Idempotency is a unique key: `JournalEntry(companyId, sourceType, sourceId)`
  makes a retried posting a no-op.

### HR / payroll, CRM, operations, automotive (Execution 03)

- A payroll run copies each employee's active salary structure into the payslip,
  so editing a salary later never changes a historical run
  (`execution03.e2e-spec.ts`).
- Payroll posting is idempotent through `sourceId: payroll:<runId>`.
- Work orders and job cards enforce an explicit transition graph server-side; a
  job card cannot be completed without an approved estimate.
- Workshop and inspection parts move the shared stock ledger and invoices go
  through `SalesService.issueInvoice` — no second ledger.

### Customer platform, marketplace, booking, payments, notifications (Execution 04)

- The consumer identity plane is separate: a consumer token carries
  `audience: customer`, a staff token is refused on a consumer route and a
  consumer token is refused on a staff route.
- Booking concurrency is enforced by a unique constraint plus a transactional row
  lock; a cancelled booking releases its slot.
- Payments never claim money moved: `CASH` and `CARD_TERMINAL` are always
  configured; `BANK_TRANSFER` awaits operator confirmation; `BENEFITPAY` and
  `CARD_ONLINE` report themselves unconfigured without credentials.
- Webhooks are idempotent and signature-verified.

### External Integrations Center (Execution 05)

- The catalogue lives once in `packages/shared/src/integrations.ts` and feeds the
  API, the admin page and the customer capabilities endpoint. 20 providers.
- Credential reads return a `hint` only; an empty value deletes the row; changing
  a credential clears the verification.
- `deriveState` is the single place that decides a provider's state, and
  `AWAITING_CREDENTIALS` is checked before a stored `verificationStatus`. Only
  `OPERATIONAL` is advertised through `GET /customer/capabilities`.
- Live check: 8 providers render, 2 `OPERATIONAL` (cash, card terminal — the
  internal, no-credential providers), 6 `AWAITING_CREDENTIALS`.

## Frontend/backend connection audit

| Check | Method | Result |
|---|---|---|
| Every catalog route resolves | `audit.spec.ts` route sweep | 21/21 modules return 200 with no error boundary |
| Platform governance surfaces | `audit.spec.ts` | 11/11 return 200 |
| Enterprise ERP modules render their interface | `audit.spec.ts` | 10/10 render the module test-id |
| Admin public routes | `curl` through nginx | 17/17 return 200 |
| Customer and mobile public routes | `curl` through nginx | 16/16 return 200 |
| API health | `GET /api/health` | 200 |
| Login through the public host | browser | reaches `/dashboard` with live data |
| Customer login through the public host | browser | reaches `/dashboard` with live data |
| Mobile login | browser | reaches `/mobile/` then `/mobile/garage` |
| Module surfaces, live API probe | `.run/probe-modules.mjs` | **96/96 return 200** with real rows |
| Public preview routes, external | `.run/sweep-preview.mjs` | **39/39 success, 0 failed requests** |

### Module-by-module live probe (2026-10-18)

`.run/probe-modules.mjs` signs in as the platform principal and as the Enterprise
tenant admin, then issues a real authenticated `GET` against every module's list
endpoint and records the status plus a summary of the returned shape. It is the
only check that proves each controller reads the database rather than merely
routing. Result: **96 of 96 surfaces returned 200**, each with a non-empty row
set, e.g. `Super Admin — companies items(5) total=60`, `audit trail
items(5) total=3717`, `modules items(21)`, `plans array(20)`, `subscriptions
array(51)`. Evidence: `docs/audit/evidence/exec06-module-probe.json`.

Two false positives were removed from the probe during this pass: it had guessed
`GET /hr/salary-structures` (salary structures are created with `POST`, so a
`GET` correctly 404s) and `GET /crm/customers` (customers live under
`/sales/customers`; CRM exposes `customers/:id/contacts`). The probe now calls
the real routes.

## Database operation audit

- All 20+ migrations applied cleanly with `prisma migrate deploy`.
- The seed is idempotent: `pnpm db:reset` produced 6 companies (2 marked
  `SEED_DEMO_DATA`), 6 subscriptions, 2 company admins, 126 accounts, 6 fiscal
  years, 6 warehouses, 24 products, 12 customers, 12 suppliers, and the
  Execution 03 baseline.
- Every tenant-owned table carries `companyId`; cross-tenant reads are refused
  (`authorization.e2e-spec.ts`).

## Permission and navigation audit

- Navigation is derived from the same catalog as the guards, so a hidden control
  and a rejected request agree. The UI only hides what the API would reject.
- A company administrator sees only licensed modules
  (`admin.spec.ts` "company admin sees only licensed modules").
- A platform principal carries no tenant scope until it opens a reasoned,
  time-bounded support session (`admin.spec.ts` "company admin cannot reach
  platform-only governance screens").

## Form and workflow audit

- Provisioning, branch creation with plan limits, plan creation with a module
  selection, role editing with delegable scope, MFA enrollment and challenge,
  and the integrations credential dialog were all driven through the browser in
  the Playwright suites.
- Modals stay in the DOM; the suites wait for `.oryx-modal` to reach count 0 as
  the completion signal, which is why the modal-driven tests are reliable.

## Localization, theme and responsiveness audit

| Check | Result |
|---|---|
| Arabic RTL (`data-dir=rtl`) | pass, `dashboard-ar-*.png` |
| English LTR (`data-dir=ltr`) | pass, `dashboard-en-*.png` |
| Dark theme | pass |
| Light theme | pass |
| Tablet 834×1112, no horizontal overflow | pass (overflow ≤ 2 px) |
| Mobile 390×844, no horizontal overflow | pass (overflow ≤ 2 px) |

## Conclusion

Every declared Phase-1 surface is connected end to end: the UI calls the API, the
API reads and writes PostgreSQL, permissions are enforced server-side, and the
same catalog drives navigation, guards and dashboard tiles. The one defect found
during this audit is recorded in `04_FIXED_DEFECTS.md`.
