# Execution 12 — ORYX ERP Mobile: project inspection and execution map

Branch: `feature/execution-07-premium-web`
Baseline commit: `828685f`
Inspection date: 2026-10-23

Everything below was read from the repository and verified against the running
database and API. Nothing here is assumed from the brief.

---

## 1. What already exists

### 1.1 Mobile applications

There is **one** mobile app, and it is the **customer** app:

| Item | Value |
| --- | --- |
| Path | `apps/mobile` |
| Framework | Expo SDK 54 / React Native 0.81.5 / React 19.3.0 |
| Router | `expo-router` 6 (file-based, `src/app`) |
| Slug / bundle id | `oryx-customer` / `com.oryx.customer` |
| API plane | **customer only** — `lib/api.ts` calls `${API_BASE}/v1/customer/*` |
| Tests | 20 vitest tests (`tabs`, `session-storage`, `lib`) |
| Native readiness | `expo export --platform android/ios` is part of CI |

Screens: `(auth)/login|register|forgot-password`, `(app)/index|services|garage|
garage/[id]|bookings/index|bookings/new|providers/[id]|invoices|notifications|
account`.

**Conclusion: the customer app is not the ERP app and must not be converted.**
Its identity, bundle id, route tree and API plane are all consumer-facing, and
the owner has approved it. The ERP app is a **new, separate app**.

### 1.2 Reusable foundations (do not rewrite)

| Module | Why it is reusable |
| --- | --- |
| `src/lib/session-storage.ts` | SecureStore on device, localStorage on web, plus the CSRF reader |
| `src/lib/theme.ts` | Approved ORYX tokens (navy/gold), dark **and** light |
| `src/lib/i18n.ts` | Arabic/English dictionary + RTL direction handling |
| `src/lib/use-async.ts` | Loading / empty / error state hook |
| `src/lib/format.ts` | Money and date formatting |
| `src/lib/api.ts` | Request core: bearer auth, 401 → single-flight refresh, 503 outage, ApiError |
| `test/tabs.test.ts` | Guards "every `(app)` file becomes a tab" — copy this guard |
| `packages/shared` | `MODULES`, `permissions`, `money`, `currency`, `bahrain`, `branding` |

The API request core in `lib/api.ts` is close to directly reusable; only the
plane prefix and the refresh path change.

### 1.3 Backend

- NestJS, every route under `/api/v1`. Health is the exception (`/api/health`).
- **36 controllers / 20 staff modules**: accounting, audit, auth, automotive,
  branding, cms, crm, customer, dashboard, health, hr, integrations, inventory,
  marketplace, modules, notifications, operations, organizations, payments,
  plans, platform, purchasing, rbac, reports, sales, support.
- Global guard pipeline: `CsrfGuard` → `PrincipalGuard` → permission guard.
- `PrincipalGuard` resolves identity and effective permissions **once**, from:
  - `Authorization: Bearer <access token>`
  - `x-oryx-company-id` — selects the active company
  - `x-oryx-branch-id` — selects the active branch
  - `x-oryx-support-session` — platform support session

  These header names are exported as `COMPANY_HEADER` / `BRANCH_HEADER` /
  `SUPPORT_HEADER` in `apps/api/src/auth/principal.guard.ts`. The mobile client
  must send the same headers the admin app sends.

### 1.4 Database

- PostgreSQL 17, Prisma. 166 tables, PascalCase model names.
- Tenant-owned tables carry `companyId`.
- **The local dev database survived the crash and already contains the demo
  tenant** (see §4).

### 1.5 Module catalogue — the single source of navigation truth

`packages/shared/src/modules.ts` defines 21 modules, each with `key`, `nameEn`,
`nameAr`, `group`, `route`, `status`, `readPermission`, `writePermission`:

| key | route | read permission |
| --- | --- | --- |
| `dashboard` | `/dashboard/overview` | `erp.dashboard.read` |
| `company_management` | `/companies` | `erp.company.manage` |
| `branch_management` | `/branches` | `erp.branch.manage` |
| `financial_accounting` | `/accounting` | `erp.accounting.read` |
| `sales_pos` | `/sales` | `erp.sales.read` |
| `purchasing_procurement` | `/purchasing` | `erp.purchasing.read` |
| `warehouses_inventory` | `/inventory` | `erp.inventory.read` |
| `human_resources` | `/hr` | `erp.hr.read` |
| `crm` | `/crm` | `erp.crm.read` |
| `operations` | `/operations` | `erp.operations.read` |
| `automotive_inspections` | `/automotive/inspections` | `erp.inspection.read` |
| `automotive_maintenance` | `/automotive/maintenance` | `erp.maintenance.read` |
| `spare_parts` | `/automotive/spare-parts` | `erp.spare_parts.read` |
| `reports_analytics` | `/reports` | `erp.reports.read` |
| `users_permissions` | `/users` | `company.user.read` |
| `subscription_management` | `/subscriptions` | `company.subscription.read` |
| `settings` | `/settings` | `company.settings.update` |
| `customer_portal`, `booking_engine`, `provider_portal`, `payments` | … | `erp.*` |

The navigation, guards, plan editing and dashboard tiles already read this
catalogue. **The ERP app must derive its menu from it too**, filtered by the
company's licensed modules and the user's effective permissions.

### 1.6 Authentication and sessions

Verified live against the running API:

| | staff plane | customer plane |
| --- | --- | --- |
| Login route | `POST /api/v1/auth/login` | `POST /api/v1/customer/auth/login` |
| Access token | in body | in body |
| Refresh token | **HttpOnly cookie only** | cookie, **and body when `x-oryx-client: mobile`** |
| CSRF | `x-oryx-csrf` echoed on unsafe methods | same |
| Context | `GET /auth/me`, `GET /auth/context` | customer equivalents |
| MFA | TOTP (`mfa/verify-login`, `mfa/enroll`, recovery codes) | disabled |

`GET /auth/me` returns `user`, `memberships`, `permissions`, `mfa`, and a
`context` block (`companyId`, `branchId`, `licensedModules`).
`GET /auth/context` returns the selectable `companies` and `branches`.

**The gap:** a native client has no cookie jar, so today the staff plane cannot
persist a session — the refresh token never reaches the app. The customer plane
solved this with `x-oryx-client: mobile` (commit `fecabed`).

---

## 2. What is ready and what must be built

| Area | State |
| --- | --- |
| Backend, DB, RBAC, entitlements, module catalogue | **Ready, no change needed** |
| Customer mobile app | **Ready — leave alone** |
| Staff-plane native session (refresh token in body for mobile) | **Must be added** — ports an already-approved customer-plane contract |
| ERP mobile app (`apps/mobile-erp`) | **Must be built** |
| ERP mobile screens for 20 modules | **Must be built** |
| Demo tenant + demo data | **Already exists in the DB**; needs a credential reset path |
| Mobile integration tests + browser preview | **Must be built** |
| CI coverage for the new app | **Must be added** (CI currently covers `@oryx/mobile` only) |

---

## 3. Execution plan

### Phase 1 — Staff-plane native session (small, unblocks everything)

1. Restore the preserved change to `apps/api/src/auth/auth.controller.ts`
   (`docs/audit/exec07/phase-e-continuation/reverted-staff-mobile-auth/`):
   `POST /auth/login`, `/auth/mfa/verify-login` and `/auth/refresh` return the
   refresh token in the body **only** when `x-oryx-client: mobile` is present.
2. Restore `apps/api/test/mobile-native-session.e2e-spec.ts` (7 cases, including
   the guard that a browser request still never sees the token).
3. Update the documented security baseline in `AGENTS.md` to record the narrow
   exception and why it is safe (opt-in header, same contract as the consumer
   plane, cookie path unchanged).

This is a genuine security-baseline change. It is now **in scope** because the
owner has asked for a real mobile ERP client, which cannot exist without it.
It stays opt-in and header-gated, so the browser path is unchanged.

### Phase 2 — The ERP mobile app (`apps/mobile-erp`)

A **new** workspace app. Slug `oryx-erp`, bundle id `com.oryx.erp`, so it
cannot be confused with the customer app. React pinned to **19.3.0** (the
workspace-wide value the repository requires).

Structure mirrors the customer app, with the staff plane wired in:

```
src/lib/api.ts            staff request core: bearer + x-oryx-company-id /
                          x-oryx-branch-id, single-flight refresh, CSRF on web
src/lib/session.ts        SecureStore refresh token; access token in memory
src/lib/context.tsx       company/branch selection + licensed modules + permissions
src/lib/nav.ts            menu derived from MODULES ∩ licensed ∩ permissions
src/lib/theme.ts          ORYX tokens (reuse)
src/lib/i18n.ts           ar/en dictionary, RTL
src/app/(auth)/login      email + password + TOTP step
src/app/(app)/…           dashboard, and a screen per module
src/components/…          list, detail, form, filter, pager, states
```

**Screens** (per the brief, each shown only when licensed *and* permitted):
dashboard, company/branch selector, customers, suppliers, products, sales &
invoices, purchasing, inventory & warehouses, accounting & reports, HR, CRM,
operations (tasks/approvals), notifications, settings/account.

**Implementation strategy to avoid 20 bespoke copies:**

- One **generic, config-driven resource screen** (search, filter, paging,
  loading/empty/error, pull-to-refresh) driven by a per-module descriptor that
  names the endpoint, the columns, the permission and the write action.
- **Bespoke screens** only where the workflow is genuinely more than a list:
  dashboard, sales invoice creation, stock transfer, branch selector, login/MFA.

This keeps the app real and DB-backed without duplicating a list screen 20 times.

### Phase 3 — Demo data and credentials

- The tenant **already exists**: `DEMO-ERP-MOBILE` / "ORYX Demo Company"
  (see §4). The preserved `seed-mobile-demo.mjs` created it through the real API.
- Re-run the seed with `--password-file` after rotating the demo admin password,
  so the random password generated during the crashed session is replaced by one
  we control and can document.
- **Constraint honoured:** the script is idempotent, confined to
  `DEMO-ERP-MOBILE`, and never touches the other six companies. No DB reset, no
  global seed.

### Phase 4 — The eight integration scenarios

Run against the real API and database, asserting both directions:

| # | Scenario | Assertion |
| --- | --- | --- |
| 1 | Admin creates a customer | appears in the app's customer list |
| 2 | Admin creates a product | appears in the app's product list |
| 3 | App issues a sales invoice | appears in the admin invoice list, journal balanced |
| 4 | App edits a customer | admin sees the new value |
| 5 | Stock transfer between branches | both branch balances change, ledger agrees |
| 6 | Under-permitted user | API refuses the call (403), not just the UI |
| 7 | Cross-tenant read | a second company's rows are never returned |
| 8 | Dashboard figures | app and admin report identical numbers |

Evidence: API responses plus DB row counts, captured as files.

### Phase 5 — Quality, tests, delivery

- Mobile unit tests (nav derivation, session storage, formatting, tab guard).
- API e2e for the native-session change.
- Browser preview of the Expo web export for the owner, with light/dark and
  RTL/LTR captures.
- Add the new app to CI (typecheck, lint, test, android+ios export).
- Report: current state, delivered, missing, changed files, API wiring, test
  results, demo accounts (no passwords in logs), how to run, how to seed and
  safely remove, and what remains before a store release.
- Push to `feature/execution-07-premium-web`. No merge, no deploy.

---

## 4. Recovery findings

The crashed session had already done more than the last known SHA suggested:

- It **pushed** `2e3e93e` (premium site, CMS, photography, category fixes).
- It **ran the demo seed**, so the database already holds the demo tenant:

| Entity | Count |
| --- | --- |
| Branches | 3 |
| Customers | 20 |
| Suppliers | 10 |
| Products | 20 |
| Warehouses | 2 |
| Employees | 10 |
| Sales invoices | 8 |
| Journal entries | 17 |
| Stock levels | 17 |
| Projects | 1 |

- Demo admin `erp.demo@oryx.local` exists with role `company_admin`.
  **Its generated password was never written to a file, so it is unknown.**
  Phase 3 rotates it.
- Three files were uncommitted and are preserved under
  `docs/audit/exec07/phase-e-continuation/reverted-staff-mobile-auth/`:
  the staff-plane session change, its e2e test, and the seed script.

**No pushed work was lost, and nothing was rewritten.** `b3c9a71` is an ancestor
of the current head.

---

## 5. Environment constraints in this sandbox

The sandbox restart removed tooling the crashed session had installed. Both are
restored and working:

| Item | Status |
| --- | --- |
| pnpm | restored via the corepack shim (`corepack enable` cannot write `/usr/local/bin`) |
| PostgreSQL 17 | reinstalled; the existing `.run/pgdata` cluster started with `-k .run/pgsock` |
| API | builds with the documented `tsbuildinfo` workaround; runs on `:3001` |
| Android SDK / Xcode | **absent** — no local native build. CI bundles android+ios, and `expo export` proves the JS bundles build |

`/mnt/oryx-data/oryx-staging` is **not mounted in this sandbox**, so the
development work runs against the local database and the local API. Staging
(`api.oryxbhr.com`, `admin.oryxbhr.com`, `oryxbhr.com`) is reachable and
healthy but is a production-like environment; nothing will be written there
without explicit confirmation.
