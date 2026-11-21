# Execution 16 — production-readiness sweep: the malformed-input contract

**Branch:** `feature/execution-07-premium-web` · PR #7 **Draft** (not merged, not
deployed)
**Database:** PostgreSQL 17 — no migration, no schema change, no seed change
**Baseline:** `5c9c1f9` (Execution 10) plus `1e29313` (BHD currency scale)

---

## 1. What this execution is

Execution 10 closed the mobile integration work. Execution 16 is the
production-readiness sweep that the owner asked for across the whole platform:
the Super Admin dashboard, the company and branch dashboards, every operational
module, the website and customer interfaces, the customer apps, the API and
external integrations, security, permissions, tests and production readiness.

This revision reports the concrete defects that sweep found and fixed, and the
verification that followed. It is not a re-audit of Execution 10; it does not
repeat that work.

---

## 2. Defects found and fixed

### 2.1 A malformed request returned 500 instead of 400 (34 routes)

A fuzz sweep of **every** GET path in the OpenAPI document (362 paths) with junk
query values found 36 responses in the 5xx class. Two distinct causes:

1. **An unvalidated enum-ish filter reached Prisma.** Every list route passes
   `?status=` straight into a Prisma `where` clause
   (`status: query.status as never`). A value that is not a member of the enum
   makes Prisma throw:

   ```
   Invalid value for argument `status`. Expected CompanyStatus.
   ```

   `PrismaClientValidationError` was unhandled, so Nest rendered a generic
   `500 Internal server error`. Affected: `/companies`, `/subscriptions`,
   `/accounting/journals`, `/sales/{quotations,orders,invoices}`,
   `/purchasing/{requisitions,orders,supplier-invoices}`, `/hr/*`, `/crm/*`,
   `/operations/*`, `/automotive/*`, `/bookings`, `/marketplace/admin/applications`,
   `/provider/*`, `/payments/intents`.

2. **A non-UUID identifier reached a UUID column.** `?companyId=not-a-uuid`
   produced a Prisma P2023 ("inconsistent column data"), again a 500.

**Fix.** A new global `PrismaExceptionFilter`
(`apps/api/src/common/prisma-exception.filter.ts`) is registered in `createApp`
in `apps/api/src/main.ts`:

| Exception | Status | Code |
| --- | --- | --- |
| `PrismaClientValidationError` | 400 | `request.validation_failed` |
| `PrismaClientKnownRequestError` P2025 | 404 | `resource.not_found` |
| `PrismaClientKnownRequestError` P2002 | 409 | `resource.conflict` |
| `PrismaClientKnownRequestError` P2003 / P2023 | 400 | `request.validation_failed` |
| anything else | 500 | `server.internal_error`, detail logged and **not** returned |

A malformed request is the caller's mistake; a genuine bug must still be a 500,
and its message must never leak through the response body.

### 2.2 A scoping mistake returned 500 (`/permissions/delegable`, `/permissions/role-templates`)

`resolveCompanyId` in `apps/api/src/rbac/rbac.controller.ts` threw a plain
`Error` for a cross-tenant company id, a missing company scope, or a platform
request without a company. Nest reports a plain `Error` as a 500. It now throws
`forbidden()` / `badRequest()` from `common/errors.ts` with the standard error
codes, so the status is honest and the response carries a machine-readable code.

### 2.3 Result

The same sweep, re-run after both fixes:

```
fuzz requests: 3168 | 5xx: 0
```

---

## 3. Authorization coverage audit

The global guard pipeline is unchanged and verified:

```
CsrfGuard → PrincipalGuard → PermissionsGuard → ModuleEntitlementGuard
  + TenantBoundaryInterceptor
```

plus `ThrottlerGuard` registered in `app.module.ts`.

**Anonymous GET sweep** of every non-parameterised path: 147 routes returned
`401`, and exactly the intended public surface returned `200`:

| Public route | Why it is public |
| --- | --- |
| `/api/health` | version-neutral liveness probe |
| `/api/v1/cms/public/content` | published website content |
| `/api/v1/cms/public/website` | published website hero and sections |
| `/api/v1/customer/homepage` | public marketing homepage |
| `/api/v1/customer/catalog/{products,stores,categories,vehicle-catalog,offers}` | public catalogue |
| `/api/v1/marketplace/providers` | public provider directory |

**Anonymous mutating sweep** of all 136 non-parameterised POST/PATCH/PUT/DELETE
routes: every one refused with 401/403/404/400, except
`POST /customer/auth/logout`, which correctly returns 204 for an already-anonymous
caller.

**Consumer-plane separation** is intact: every customer route is behind
`CustomerAuthGuard` (10 controllers), and the Execution 10 smoke test confirms a
consumer token is refused on the staff plane and vice versa.

### 3.1 `@Public()` review

All 21 `@Public()` usages were reviewed. The four in `auth.controller.ts` are
login, refresh, MFA challenge and logout; one in `coupons.controller.ts` is a
public coupon-validation helper; the CMS and catalogue routes are the public
content surface above; one in `payment.controller.ts` is the provider webhook,
which is authenticated by HMAC signature over the raw body, not by a session.

### 3.2 Media path traversal

`MediaStorageService.resolvePath` rejects any key that is not
`^[A-Za-z0-9/_\-.]+$` or that contains `..`, then resolves under the media root.
The public `GET /cms/media/:id/file` route serves only variant keys stored on the
asset row, never a caller-supplied path.

---

## 4. The 7 unmatched customer-app API calls

The prior session listed 7 customer-app API paths with no obvious backend match.
All 7 are false positives, confirmed against the live OpenAPI document and live
HTTP:

| Path | Verdict |
| --- | --- |
| `/v1/customer/auth/refresh` | real — `POST /api/v1/customer/auth/refresh`, 401 without a cookie |
| `/v1/marketplace/applications` | real — `POST /api/v1/marketplace/applications`, 404 without params |
| `profile.deletionRequested`, `support.disputes`, `support.noneHint`, `support.requestsCount` | i18n dictionary keys, not API paths |
| `/v1` | the `API_BASE` prefix constant, not a route |

---

## 5. Production-readiness verification

All of the following were run in this session against the real database and the
real servers.

| Check | Result |
| --- | --- |
| Workspace typecheck (`pnpm -r typecheck`) | **PASS** (8 projects) |
| Workspace lint (`pnpm -r lint`) | **PASS** (API lint not configured, by design) |
| API integration (`pnpm --filter @oryx/api test:e2e`) | **PASS — 27 suites, 504 tests** |
| New malformed-input suite | **PASS — 15 tests** |
| Mobile unit tests (`@oryx/mobile`) | **PASS — 8 files, 117 tests** |
| Mobile ERP tests (`@oryx/mobile-erp`) | **PASS — 2 files, 31 tests** |
| React version regression | **PASS** (`lib.test.ts` pins react and react-dom to one version) |
| Admin build (`next build`) | **PASS** |
| Customer build (`next build`) | **PASS** |
| Browser suite (Playwright, admin) | **PASS — 197 tests, 1 skipped, 0 failed** |
| Execution 10 smoke (`scripts/exec10-smoke.sh`) | **PASS — 31/31** |
| GET fuzz sweep (3168 requests) | **0 × 5xx** |
| Anonymous GET sweep (157 routes) | only the intended public surface is 200 |

---

## 6. Files changed

| File | Change |
| --- | --- |
| `apps/api/src/common/prisma-exception.filter.ts` | **New** — map Prisma errors to honest HTTP statuses |
| `apps/api/src/main.ts` | Register the filter globally in `createApp` |
| `apps/api/src/rbac/rbac.controller.ts` | `resolveCompanyId` throws `forbidden()`/`badRequest()` instead of a plain `Error` |
| `apps/api/test/execution16-malformed-input.e2e-spec.ts` | **New** — 15 regression cases across both bug classes |
| `AGENTS.md` | Document the malformed-input contract and the plain-`Error` trap |

No schema change, no migration, no seed change, no new dependency. No second
ledger, no second media store, no second provider API.

---

## 7. Security verification

- A malformed request never returns an internal message: the 500 branch logs the
  detail server-side and returns only `Internal server error`.
- Error responses carry a machine-readable `code` so the UI can localise without
  parsing English text.
- The public surface is unchanged and minimal; every staff and customer route
  still requires a token, and the consumer plane remains separate from the staff
  plane.
- Cross-tenant scope resolution now fails closed with `authz.cross_tenant_denied`
  rather than a 500 that a caller could use to probe.
- Media path traversal remains blocked by `resolvePath`.

---

## 8. Remaining incomplete work

Nothing in this execution is presented as complete that is not verified above.

| Item | State |
| --- | --- |
| Android device visual acceptance | **Not done.** This container has no `/dev/kvm`; the app renders through its real Expo web export in Chromium at an Android viewport. This is not device acceptance and is not claimed as such. |
| SENSAGE AI analysis | No provider configured, so analysis stays labelled demo. |
| APK | **Not built.** Per the brief, no APK is published until the integrated functionality is coherent for a testing release. |
| Execution 11–15 reports | Present and unchanged in this revision; not re-verified line by line here. |

---

## 9. Final commit

See the branch head after this commit. PR #7 remains **Draft**; nothing was
merged or deployed.
