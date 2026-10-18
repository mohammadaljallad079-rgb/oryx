# ORYX — Execution 06 Report: iPad Authentication, Dual Super Admin, Responsive QA & Dashboard Asset Acceptance

Status: **implemented, tested and ready for owner review**. Nothing is merged and
nothing is deployed to production.

Branch: `audit/execution-05-verification` · PR [#6](https://github.com/mohammadaljallad079-rgb/oryx/pull/6) (draft, open, base `main`).

## 1. Scope

Execution 06 was requested as a follow-up on top of the completed Executions
01–05. It was **not** a restart: no completed execution was rebuilt, no existing
work was overwritten, reset or force-pushed, and nothing outside the four task
areas plus the audit and preview work was touched.

| Task | Requirement | Status |
|---|---|---|
| 1 | Recover iPad authentication (a device that held a stale refresh cookie could no longer sign in) | **Done** |
| 2 | Two independent Super Admin accounts | **Done** |
| 3 | Every dashboard card owns unique, original artwork | **Done** |
| 4 | Responsive QA sweep across widths, orientations and touch targets | **Done** |
| 5 | Continue the platform audit and keep the live preview working | **Done** |
| 6 | Finalise the report and acceptance evidence | **This document** |

## 2. Task 1 — iPad authentication lockout

**Defect.** `CsrfGuard` rejected *any* unsafe request that carried the `oryx_rt`
refresh cookie without a matching `oryx_csrf` cookie — including
`POST /auth/login`. The refresh cookie is HttpOnly, so a client cannot read it to
build the header. An iPad (or any device) that held a stale `oryx_rt` therefore
could never sign in again: every attempt failed with 403 before the credentials
were even checked.

**Fix.** Session-establishing endpoints — login, MFA completion and invitation
acceptance — are now marked `@CsrfExempt()` in
`apps/api/src/auth/auth.decorators.ts` and rely on an explicit **Origin
allowlist** instead. Routes that authenticate *by* cookie (refresh, logout,
logout-all) keep the double-submit check, because for those the cookie *is* the
credential. The three clients (`apps/admin`, `apps/customer`, `apps/mobile`) now
distinguish an `expired` refresh from an `unavailable` one, so a transient API
outage no longer tears down a valid session.

**Regression guard.** `apps/api/test/reauth-stale-cookie.e2e-spec.ts` (12 tests)
covers: login with a stale refresh cookie and no CSRF header, login from a
disallowed Origin, refresh still requiring the double-submit, and the
expired-vs-unavailable distinction.

## 3. Task 2 — Two independent Super Admin accounts

`scripts/provision-super-admin.mjs` provisions a second platform Super Admin. It
is deliberately hard to misuse:

- It refuses to run without `--authorize`.
- It refuses without `--actor`, which must name an existing **active** Super
  Admin, so a second principal is only ever created by an existing one.
- It writes an audit record naming the actor and the new account.
- It prints the generated password once and can write it to a `0600` file.

The role is resolved by the `platform_super_admin` code, so both accounts share
the platform permission set while keeping separate credentials, sessions and
audit records.

**Regression guard.** `apps/api/test/dual-super-admin.e2e-spec.ts` (8 tests)
asserts both principals authenticate, both resolve the full platform permission
catalogue, their sessions are independent, and one cannot be used to bypass the
other's audit trail.

## 4. Task 3 — Unique dashboard artwork

Eight dashboard cards presented another module's artwork: Users & Permissions and
Human Resources shared `tile-users`; Booking & Scheduling and Automotive
Inspections shared `tile-inspection`; Provider Portal and Spare Parts shared
`tile-parts`; Payments and Financial Accounting shared `tile-accounting`. Each
now has original SVG art. All 21 cards map to 21 distinct SVGs and no raster crop
remains.

**Regression guard.** `apps/admin/e2e/branding.spec.ts` asserts every card owns a
unique asset, and `scripts/audit-dashboard-assets.mjs` writes
`docs/audit/evidence/dashboard-card-inventory.json` recording the card → asset
mapping.

## 5. Task 4 — Responsive QA sweep

New `apps/admin/e2e/responsive-matrix.spec.ts` (33 tests) sweeps 11 widths in
both directions, every routed surface at 320 px and 390 px, the ERP surface at
390 / 768 / 1440 px, touch targets and iPad portrait (820×1180) and landscape
(1180×820).

It found **two real 320 px overflows**, both now fixed in CSS with the desktop
layout unchanged:

1. The KPI label and value could not wrap inside a two-up card.
2. The MFA card's action button kept its row wider than the viewport.

## 6. Audit continuation — two defensive-input defects

The module-by-module live probe (`.run/probe-modules.mjs`) and the bad-input
probe (`.run/probe-bad-dates.mjs`, `.run/probe-booking-cal.mjs`) found two
endpoints that turned a client mistake into an unhandled 500:

| # | Endpoint | Before | After |
|---|---|---|---|
| 17 | `GET /reports/{accounting,sales,purchasing,inventory}` | `500` on `?from=not-a-date` | `400` with a field-level message |
| 18 | `GET /bookings/calendar` | `500` with no range or a malformed one | `400`; a valid range returns `200` |

Both are recorded with their fixes and guards in
`docs/audit/04_FIXED_DEFECTS.md`. The fix is a DTO change only — `@IsISO8601()`
on the report filters (matching the accounting DTOs that already behaved) and a
new `CalendarQueryDto` for the calendar — so no business logic changed.

**Regression guard.** `apps/api/test/input-validation.e2e-spec.ts` (11 tests)
pins the 400-not-500 contract on all eight date-filtered read paths and the three
calendar cases.

## 7. Test and CI results

All suites were run on the staging stack after the fixes. Full detail and
reproduction commands are in `docs/audit/06_TEST_AND_CI_RESULTS.md`.

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **96 passed** (5 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **277 passed** (13 suites) |
| Admin browser | `ORYX_ADMIN_URL=http://localhost:12000 pnpm --filter @oryx/admin exec playwright test` | **184 passed, 1 skipped, 0 failed** |
| Mobile unit | `pnpm --filter @oryx/mobile test` | **20 passed** (3 files) |
| Public preview sweep | `.run/sweep-preview.mjs` | **39/39 routes, 0 failed requests** |
| Module API probe | `.run/probe-modules.mjs` | **96/96 surfaces returned 200** |
| **Total (test runners)** | | **577 passed, 0 failed** |

> Note on the browser suite origin. The preview builds use a relative API base
> (`NEXT_PUBLIC_API_BASE_URL=/api`) so the public HTTPS host is same-origin and
> the HttpOnly refresh cookie and CSRF double-submit work without CORS. Nothing
> proxies `/api` on the bare Next port 3000, so the suite must run against the
> preview proxy origin (`http://localhost:12000`). Running it against
> `http://localhost:3000` directly times out in `signIn` — an environment fact,
> not a product defect. CI builds with an absolute API base and runs against
> 3000/3001 directly.

## 8. Live preview

The staging stack is live and externally verified from outside the sandbox. Full
link list and credentials are in `docs/audit/07_LIVE_PREVIEW_AND_CREDENTIALS.md`.

| Host | Serves |
|---|---|
| `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev` | Super Admin control plane and every ERP module |
| `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev` | Customer website, customer dashboard and the mobile web preview |

Verified with `curl` from outside the sandbox: `/login`, `/dashboard`, the
customer root and `/mobile/` each return `200`, and `/api/health` returns
`{"status":"ok","service":"oryx-api","version":"0.1.0","database":"up"}`.

Demo credentials (synthetic staging data only; passwords are development values
from `.env.example`, not production secrets):

| Role | Email | Password |
|---|---|---|
| Super Admin (platform) | `superadmin@oryx.local` | `ChangeMe!Oryx2026` |
| Enterprise company admin | `admin@oryx-auto.local` | `ChangeMe!Oryx2026` |
| Demo SaaS tenant admin | `admin@demo-alnoor.local` | `ChangeMe!Oryx2026` |
| Customer / consumer | `customer@oryx-demo.local` | `OryxDemo!2026` |

## 9. Visual identity

The official logo (`docs/assets/logo.png.jpeg`, the owner's upload `699560c`) is
used by both front ends and follows the theme. Every dashboard tile is original
vector art; the approved design reference
(`docs/assets/ORYX Auto Services Dashboard.png`) is no longer used as dashboard
artwork. **Full visual parity is not claimed**: the approved dashboard
photography is still missing from the repository and there is no approved
light-theme reference. See `docs/audit/03_VISUAL_COMPARISON.md` and
`docs/audit/08_VISUAL_IDENTITY_AND_PREVIEW_VERIFICATION.md`.

## 10. Remaining blockers

1. **Approved dashboard photography is missing.** The tiles use generated vector
   art. This is the main reason full visual parity is not claimed.
2. **No approved light-theme reference.** The dark theme can be compared to the
   reference; the light theme cannot.
3. **No production deployment target or credentials were provided.** The preview
   runs on the sandbox's own ingress hosts against an isolated staging database.
   A production deployment additionally needs a managed PostgreSQL instance, a
   real domain with TLS, and production secrets (`JWT_*`, `MFA_ENCRYPTION_KEY`,
   `INTEGRATION_ENCRYPTION_KEY`, `MFA_REQUIRE_SUPER_ADMIN=true`).
4. **No external gateway credentials.** All external integrations correctly
   report `AWAITING_CREDENTIALS` / `ADAPTER_ONLY`.

## 11. Commit state

| Item | Value |
|---|---|
| Branch | `audit/execution-05-verification` |
| PR | [#6](https://github.com/mohammadaljallad079-rgb/oryx/pull/6) (draft, open, base `main`) |
| Pushed head | `bc77426` (pushed this session; `5636f4e..bc77426`) |
| `b1e2f7b` | iPad auth, dual Super Admin, unique art, responsive sweep |
| `a2e4f82` | date-filter validation hardening, audit docs and evidence, Execution 06 report |
| `715b1d2`, `1032edf`, `bc77426` | doc pointers and refreshed screenshots |

`bc77426` is the head of PR #6. CI
([run 39123892149](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39123892149))
is green on it — all three jobs:

| Job | Result |
|---|---|
| `Typecheck and build` | **success** |
| `Unit and API integration tests` | **success** |
| `Browser acceptance tests` | **success** |
