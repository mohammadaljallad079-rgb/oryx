# ORYX — Test and CI Results

Audit date: 2026-10-16. Re-verified 2026-10-17 after a sandbox recycle, and again
2026-10-17 (evening) after the crash-recovery session that fixed the Super Admin
login and completed the external preview sweep.
Environment: staging stack (API 3001, admin 3000, customer 3002, mobile-web 8081,
preview proxies 12000/12001, PostgreSQL 17 `oryx_staging`), seeded demo data.
nginx is no longer part of the stack — the two preview proxies serve the ingress
ports directly.

## Summary

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **96 passed** (5 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **229 passed** (9 suites) |
| Admin browser | `pnpm --filter @oryx/admin test:ui` | **140 passed, 1 skipped, 0 failed** |
| Mobile unit | `pnpm --filter @oryx/mobile test` | **20 passed** (3 files) |
| **Total** | | **485 passed, 0 failed** |

### Recovery session, 2026-10-17 (evening) — after the crash

The previous conversation crashed mid-audit. On recovery the workspace and the
staging database were intact; the changes below were re-run to confirm them.

| Suite | Result |
|---|---|
| `@oryx/shared` unit | `Test Files 5 passed` / `Tests 96 passed` |
| `@oryx/api` integration | `Test Suites: 9 passed, 9 total` / `Tests: 229 passed`, `EXIT=0` |
| `@oryx/admin` browser (full suite) | `140 passed`, `1 skipped`, `0 failed`, `EXIT=0` (4.9m) |
| `@oryx/mobile` unit | `Test Files 3 passed` / `Tests 20 passed` |
| `@oryx/admin` typecheck | `tsc --noEmit` clean |
| `@oryx/admin` lint | `eslint . --max-warnings=0` clean |
| `@oryx/api` build | clean |
| Public preview sweep | **39 / 39** routes returned a success status, **0** failed requests |

The API count rose from 220 to 229 with the new `super-admin-access.e2e-spec.ts`
(9 tests); the browser count rose from 130 to 140 with
`apps/admin/e2e/super-admin-access.spec.ts` (6 tests) plus the tenant-context
assertions folded into the existing specs.

The public preview sweep is `docs/audit/evidence/preview-sweep-2026-10-17.json`
and its log. It drives a real browser over the public HTTPS ingress, signs in as
the Super Admin, selects the Enterprise tenant through the header control, then
visits each ERP surface and records every response `>= 400`. It then repeats the
exercise for the customer surfaces in a fresh browser context.

### Recovery session, 2026-10-17 (morning)

The sandbox image was recycled between sessions, which removed PostgreSQL, pnpm,
the proxy and the Playwright browser cache while leaving the seeded cluster
intact. After the self-healing recovery (defect 11 in report 04) the suites were
re-run against the rebuilt stack:

| Suite | Result |
|---|---|
| `@oryx/shared` unit | `Test Files 5 passed` / `Tests 93 passed` |
| `@oryx/api` integration | `Test Suites: 8 passed, 8 total` / `Tests: 220 passed` |
| `@oryx/admin` browser — `branding.spec.ts` | `5 passed` |
| `@oryx/admin` browser — `auth-lifecycle.spec.ts` | `18 passed` |
| `@oryx/admin` typecheck | `tsc --noEmit` clean |
| `@oryx/admin` lint | `eslint . --max-warnings=0` clean |
| Public preview sweep | `47 / 47` routes returned `200` |

Live sign-out verification over public HTTPS (`.run/verify-logout.mjs`): the
refresh cookie `oryx_rt` is present before sign-out, the logout call returns
`200`, all cookies are cleared afterwards, and a protected route then redirects
to `/login`.

Locale, theme and viewport matrix (`.run/variants.mjs`), 12 combinations:

| Locale | Theme | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| Arabic | dark | ok, `dir=rtl` | ok, `dir=rtl` | ok, `dir=rtl` |
| Arabic | light | ok, `dir=rtl` | ok, `dir=rtl` | ok, `dir=rtl` |
| English | dark | ok, `dir=ltr` | ok, `dir=ltr` | ok, `dir=ltr` |
| English | light | ok, `dir=ltr` | ok, `dir=ltr` | ok, `dir=ltr` |

No horizontal overflow was measured in any combination, and the sign-out control
was present in all 12. Module captures: `21 / 21` authenticated admin modules
rendered with the sign-out control visible.

The browser suite must run through the reverse proxy, because the admin bundle
calls the API same-origin (`NEXT_PUBLIC_API_BASE_URL=/api` in
`apps/admin/.env.local`). Against the bare app port every authenticated test
fails identically at login with a `404`:

```bash
ORYX_ADMIN_URL=http://localhost:12000 \
AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000 \
pnpm --filter @oryx/admin test:ui
```

Per-spec counts for the browser suite, from the run log:

| Spec | Tests |
|---|---|
| `screenshots.spec.ts` | 19 |
| `responsive.spec.ts` | 19 |
| `admin.spec.ts` | 18 |
| `super-admin-access.spec.ts` | 6 |
| `auth-lifecycle.spec.ts` | 14 |
| `functional.spec.ts` | 13 |
| `mfa.spec.ts` | 10 |
| `execution03.spec.ts` | 9 |
| `erp.spec.ts` | 8 |
| `execution05.spec.ts` | 6 |
| `execution04.spec.ts` | 5 |
| `branding.spec.ts` | 5 |
| `audit.spec.ts` | 4 |
| **Total** | **140 passed** (plus `capture.spec.ts`, skipped) |

`capture.spec.ts` is a manual capture tool, not a regression test; it now skips
unless `CAPTURE_PHASE` is set, so it no longer runs — and no longer rewrites the
audit images — during `test:ui`.

### CI is green on head `a327f9e`

Run [`39052159810`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39052159810)
on `audit/execution-05-verification` completed with conclusion **success** — all
three jobs, including step 16 (browser acceptance), the step that had been
failing on the previous head `06ed1c0`:

| Job | Result |
|---|---|
| Typecheck and build | success (23/23 steps) |
| Unit and API integration tests | success (19/19 steps) |
| Browser acceptance tests | success (step 16 green) |

The failure on `06ed1c0` was the concurrent-refresh session loss (defect 12 in
report 04). It is fixed, and the multi-tab test was re-run 5 times consecutively
locally, passing 5/5, where the failure had previously been reproducible.

### The mixed-content trap when pointing the suite at the public host

Running the suite with `ORYX_ADMIN_URL=https://work-1-…all-hands.dev` passes most
specs but fails exactly the 12 that call `page.evaluate(() => fetch('http://localhost:3001/…'))`
directly — a plain-HTTP fetch from an HTTPS page, which the browser blocks as
mixed content and Playwright reports as `TypeError: Failed to fetch`. The 12 are
`admin.spec.ts` (2), `auth-lifecycle.spec.ts` (2), `erp.spec.ts` (5),
`functional.spec.ts` (1), `mfa.spec.ts` (2). Use the local proxy URL
(`http://localhost:12000`) as the report above does; the public HTTPS host is for
the owner's browser, not for the Node-driven harness.

The same 10–12 specs also fail if the proxy is addressed as
`http://127.0.0.1:12000` rather than `http://localhost:12000`: the API's
`CORS_ORIGINS` defaults to `http://localhost:3000`, so a page served from the
`127.0.0.1` origin is refused with `TypeError: Failed to fetch`. The host name is
part of the origin; use `localhost` consistently.

### Tile-art regression sweep

`branding.spec.ts` sweeps the live dashboard grid. On head `a1ca8aa`:

| Probe | Result |
|---|---|
| Module tiles found | 21 |
| Tiles served as raster crops | **none** |
| Tiles that failed to decode | **none** |
| Elements referencing `hero-automotive` | **none** |

## Shared unit — 96 tests

Covers the authorization invariants, money arithmetic, currency handling,
scheduling and the integration catalogue. These need no database, so they run in
any environment.

## API integration — 229 tests

Nine suites against the seeded database:

| Suite | Covers |
|---|---|
| `session.e2e-spec.ts` | refresh-cookie lifecycle, CSRF double-submit (19 tests, incl. the CSRF-stability regression) |
| `mfa.e2e-spec.ts` | TOTP enrollment, challenge, replay protection, recovery codes |
| `authorization.e2e-spec.ts` | RBAC, tenant isolation, delegation limits |
| `rate-limit.e2e-spec.ts` | throttling |
| `erp.e2e-spec.ts` | accounting, sales/POS, procurement, inventory |
| `execution03.e2e-spec.ts` | HR/payroll, CRM, operations, automotive |
| `execution04.e2e-spec.ts` | customer platform, marketplace, booking, payments, notifications |
| `execution05.e2e-spec.ts` | integrations centre, credentials, capabilities |
| `super-admin-access.e2e-spec.ts` | Super Admin login normalisation, the full permission catalogue, tenant ERP access, password rotation with session revocation (9 tests) |

```
Test Suites: 9 passed, 9 total
Tests:       229 passed, 229 total
```

Run with raised throttles for a full sweep:

```bash
AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000 \
  pnpm --filter @oryx/api test:e2e
```

## Admin browser — 140 tests

The Playwright suite must run through the reverse proxy, because the preview
builds use a relative API base (`NEXT_PUBLIC_API_BASE_URL=/api`) so that the
public HTTPS host is same-origin and the HttpOnly refresh cookie and CSRF
double-submit both work without CORS. The suite supports URL overrides:

```bash
ORYX_ADMIN_URL=http://localhost:12000 ORYX_API=http://localhost:12000/api/v1 \
  pnpm --filter @oryx/admin test:ui
```

> Running it against `http://localhost:3000` directly fails, because nothing
> proxies `/api` on that port. That is an environment fact, not a product defect;
> CI builds with an absolute API base and runs against 3000/3001 directly.

| Spec | Count |
|---|---|
| `admin.spec.ts` | core Super Admin acceptance |
| `auth-lifecycle.spec.ts` | session lifecycle |
| `mfa.spec.ts` | MFA UI |
| `erp.spec.ts` | ERP modules |
| `execution03.spec.ts` | HR, CRM, operations, automotive |
| `execution04.spec.ts` | customer, providers, payments |
| `execution05.spec.ts` | integrations centre |
| `functional.spec.ts` | cross-cutting workflows |
| `responsive.spec.ts` | breakpoints |
| `screenshots.spec.ts` | required screenshots |
| `audit.spec.ts` | live module route sweep and visual capture |
| `super-admin-access.spec.ts` | Super Admin login, permission resolution, password change |

```
140 passed, 1 skipped (4.9m)
```

Plus the four `audit.spec.ts` tests:

```
✓ every AVAILABLE module route resolves to a real page (19.4s)
✓ the platform governance surfaces render for the Super Admin (12.1s)
✓ an enterprise company principal reaches the licensed ERP modules (4.2s)
✓ the dashboard is bilingual, themed and responsive (8.6s)
4 passed (45.3s)
```

## Mobile unit — 20 tests

| File | Covers |
|---|---|
| `tabs.test.ts` | every routed screen declares `href: null` unless it is a tab |
| `session-storage.test.ts` | keychain on a device, `localStorage` in a browser |
| `lib.test.ts` | client helpers |

## CI

`.github/workflows/ci.yml` builds the workspace packages first, then the apps,
then runs lint, typecheck, the shared and API tests and the browser suite. It
builds with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api` and runs the
browser suite with `ORYX_ADMIN_URL=http://localhost:3000` and
`ORYX_API=http://localhost:3001/api/v1`.

CI status for the audited commit is visible on the pull request that carries
these changes. On head `c460358` all three jobs are green:

| Job | Result |
|---|---|
| `Typecheck and build` | **success** |
| `Unit and API integration tests` | **success** |
| `Browser acceptance tests` | **success** |

The local results above were produced on the staging stack after the fixes in
`04_FIXED_DEFECTS.md`.

## Notes

- A database reset (`pnpm db:reset`) wipes the demo consumer account, because the
  seed does not create one. Re-register it before a customer-login check:
  `POST /api/v1/customer/auth/register` with a password of at least 10
  characters.
- The browser suite mutates state (it provisions companies and edits plans).
  Reset the database after a full run before treating the staging data as a clean
  demo.
- `cleanupFixtures` resets MFA for the seeded accounts; the Playwright global
  setup calls `scripts/reset-seed-mfa.mjs` for the same reason.
