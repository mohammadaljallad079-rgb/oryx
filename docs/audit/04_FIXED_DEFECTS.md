# ORYX — Fixed Defects

Audit date: 2026-10-16

Each entry states the defect, how it was found, the fix and the regression guard
that now prevents it.

## 1. Module catalog route drift — `/subscription` vs `/subscriptions`

**Severity:** functional, user-visible.

**Found by:** the live module audit walkthrough (`audit.spec.ts`), which loads
every `AVAILABLE` module's catalog `route` and fails on a 404 or an error
boundary.

**Defect:** the `subscription_management` catalog entry declared
`route: '/subscription'`, but the admin app only has a page at `/subscriptions`.
The dashboard tile and the sidebar link both sent the user to a Next.js 404.

**Fix:** `packages/shared/src/modules.ts` — the catalog route now reads
`/subscriptions`, matching the page that exists.

```diff
-  M('subscription_management', …, '/subscription', 'AVAILABLE', …),
+  M('subscription_management', …, '/subscriptions', 'AVAILABLE', …),
```

**Regression guard:** `apps/admin/e2e/audit.spec.ts`, test "every AVAILABLE
module route resolves to a real page". It iterates the catalog and asserts a 200
with no error boundary for each route, so a future drift fails the suite instead
of shipping a dead link. Verified passing after the fix (21/21 modules).

## 2. Mobile web session storage threw in a browser

**Severity:** functional, blocked the owner's mobile preview.

**Found by:** driving the Expo web export in a browser; login failed because
`expo-secure-store` has no web backend.

**Defect:** `apps/mobile/src/lib/api.ts` called `SecureStore.setItemAsync`
directly. `expo-secure-store`'s web entry point is an empty object, so the call
threw and the refresh token was never stored.

**Fix:** introduced `apps/mobile/src/lib/session-storage.ts`, which uses the
platform keychain on Android and iOS and `localStorage` in a browser. A native
build never reaches the browser branch. `api.ts` now goes through that module.
The CSRF cookie the API sets alongside the customer session is echoed on unsafe
requests so `CsrfGuard` accepts them in the shared-origin web preview.

**Regression guard:** `apps/mobile/test/session-storage.test.ts` pins both
branches — a web round-trip through `localStorage` and a device build that uses
the keychain and does not touch `localStorage`.

## 3. Mobile web export was not served under its base path

**Severity:** functional, blocked the owner's mobile preview.

**Found by:** requesting `/mobile/` through the reverse proxy returned a page
whose assets 404'd.

**Defect:** the Expo web export was built with `experiments.baseUrl = '/mobile'`,
so its asset URLs carry that prefix, but the static server and the proxy had no
matching arrangement.

**Fix:** `apps/mobile/app.config.ts` reads `EXPO_BASE_PATH` into
`experiments.baseUrl` (empty keeps root hosting for native builds), and the
reverse proxy routes `/mobile/` to the static server without stripping the
prefix, matching the export. `.run/serve-mobile-web.mjs` serves the export.

**Regression guard:** `apps/mobile/test/tabs.test.ts` derives the route list from
the filesystem, and the browser check logs in and navigates to `/mobile/garage`.

## 5. The approved design reference was used as dashboard artwork

**Severity:** high — it violates the owner's explicit design rule that the
approved reference image must never be used as dashboard artwork.

**Found by:** auditing every module tile reference against the tile files on
disk, then driving the live dashboard in a real browser
(`.run/verify-tile.mjs`) and reading the computed background of each surface.

**Defect:** `scripts/extract-approved-assets.py` treated
`docs/assets/ORYX Auto Services Dashboard.png` — the owner's approved *design
reference screenshot* — as an image source and cropped photographic regions out
of it into `apps/admin/public/tiles/*.jpg`. The dashboard hero had already been
moved to a purpose-drawn vector banner, but **every module tile** still rendered
a crop of the reference. The dashboard tile pointed at the crop directly:

```diff
-  M('dashboard', …, 'hero-automotive', '/dashboard/overview', …),
+  M('dashboard', …, 'tile-dashboard', '/dashboard/overview', …),
```

`tileImageUrl()` resolved a tile name to `/tiles/<name>.jpg`, so the grid served
22 upscaled crops of the reference as product artwork.

**Fix — the reference is no longer artwork at all:**

| Change | File |
|---|---|
| `tileImageUrl()` resolves `.svg`, not `.jpg` | `packages/shared/src/modules.ts` |
| Original vector motifs for all 23 tiles (was already the source of truth, but its raster output was being overwritten) | `scripts/generate-tile-art.py` |
| `preserveAspectRatio="xMidYMid slice"` so vector tiles fill the media box like the raster crops did | `scripts/generate-tile-art.py` |
| Reference-crop pipeline retired to a no-op tombstone that writes nothing and exits non-zero | `scripts/extract-approved-assets.py` |
| All 24 crop JPEGs (`tile-*.jpg`, `hero-automotive.jpg`, `automotive-hero.jpg`) deleted | `apps/admin/public/tiles/` |

**Verified live**, through the public HTTPS ingress:

| Probe | Result |
|---|---|
| `.oryx-hero__media` background | `…/tiles/banner-automotive.svg` |
| `tile-dashboard` background | `…/tiles/tile-dashboard.svg` (640 × 420) |
| Module tiles swept on the dashboard | **21** |
| Tiles still served as raster crops | **none** |
| Tiles that failed to decode | **none** |
| Elements referencing `hero-automotive` | **none** |

**Regression guard:** `apps/admin/e2e/branding.spec.ts`, test "the approved
design reference is never used as dashboard artwork" — it now sweeps **every**
module tile, asserts each URL ends in `.svg`, and asserts each one decodes. The
guard fails if a raster crop is reintroduced, which is what a future run of the
old crop script would have done.

**Closed:** the previous revision of this report disclosed that the other
`tile-*.jpg` crops remained. They no longer exist. No file under
`apps/admin/public/tiles/` is derived from the owner's reference.

## 6. Branding regression test matched two lockups

**Severity:** low — a test defect, not a product defect.

**Found by:** the full browser suite, after the hero gained its own `BrandLogo`.

**Defect:** `locator('.oryx-brand-logo')` resolved to two elements — the sidebar
lockup and the hero lockup — so Playwright failed with a strict-mode violation.

**Fix:** scope the locators to `.oryx-sidebar` in
`apps/admin/e2e/branding.spec.ts`, which is what the test always meant to assert.

## 7. The browser suite could not authenticate against the direct app port

**Severity:** medium — it made every authenticated test fail identically and
masked real defects.

**Found by:** the suite reporting 117 failures, all
`TimeoutError: page.waitForURL: … waiting for navigation to "**/dashboard"`, with
`404 POST /api/v1/auth/login` in the browser console.

**Defect:** `apps/admin/.env.local` sets `NEXT_PUBLIC_API_BASE_URL=/api`, so the
client bundle calls the API same-origin. That resolves only when the app is
served through the reverse proxy, which routes `/api/` to the API. The Playwright
default `baseURL` is the bare app port `http://localhost:3000`, where `/api/*` is
unrouted, so login 404'd.

**Fix:** run the suite through the proxy —
`ORYX_ADMIN_URL=http://localhost:12000 pnpm --filter @oryx/admin test:ui`.
No source change was needed; the committed configuration was already correct.

**Regression guard:** documented as a gotcha in `AGENTS.md`, because one repeated
timeout hid every real failure behind it.

## Closed — the reference is no longer artwork

Defect 5's follow-up is complete. The remaining `tile-*.jpg` photographic crops
derived from the approved design reference have been deleted, and every tile is
now original vector art generated in-repo and served as SVG. The owner no longer
needs to supply the original photography for the reference to stop being reused;
supplying it would only raise fidelity, not correctness.

What is still open for the owner is **fidelity, not reuse**: the official brand
mark and the original automotive photography are still required for full visual
parity. That is disclosed in `03_VISUAL_COMPARISON.md`.


---

## Recovery session (2026-10-17) — additional defects

The previous conversation crashed and the sandbox image was recycled. Recovering
the preview surfaced four more defects, each fixed and verified.

## 8. The sidebar had no sign-out control

**Severity:** high — a signed-in user could not end their session from the UI.

**Found by:** the owner asking where the sign-out button was, then a sweep of the
rendered shell, which contained no logout element at all.

**Defect:** `apps/admin/src/components/sidebar.tsx` rendered only navigation
groups. `useAuth()` exposed `logout()` but nothing called it, so the only way out
was to clear cookies out of band.

**Fix:** a footer button outside the nav groups, pinned to the bottom of the rail
with `margin-top: auto` and a sticky position so it stays reachable when the nav
list scrolls. It is present in both the expanded and the collapsed rail, and it
carries `data-testid="sidebar-logout"`. `onLogout()` awaits the API call that
revokes the refresh token and clears the HttpOnly cookie **before** navigating to
`/login`, so the user never lands on a protected page holding a live session.

**Verified live** over public HTTPS by `.run/verify-logout.mjs`: `oryx_rt`
present before, `logout API status: 200`, cookies empty afterwards, a protected
route then refused, and the control visible in **21 / 21** module captures.

**Regression guard:** `auth-lifecycle.spec.ts` › *the sidebar sign-out revokes
the session and blocks protected pages*.

## 9. Every sign-in failure was reported as bad credentials

**Severity:** medium — it actively misled a throttled or locked user.

**Found by:** reading the login handler while adding the logout test.

**Defect:** `apps/admin/src/app/login/page.tsx` caught every error and set
`auth.invalid`, so a `429` from the auth throttle and a `403` from an account
lock both read as "Invalid email or password." A user with a correct password
would keep retrying and stay locked out.

**Fix:** `signInErrorMessage()` maps the failure to an actionable message —
`429` to throttling, `auth.account_locked` / `auth.account_inactive` by code,
`5xx` to unavailable, and only `401` to invalid credentials. Four new dictionary
keys were added in **both** Arabic and English.

**Regression guard:** three tests in `auth-lifecycle.spec.ts` — a mocked 429, a
mocked 403 lock, and a genuine 401 — assert the message text differs per cause.

## 10. A configured `/v1` suffix produced a 404 that looked like a routing bug

**Severity:** low — a configuration foot-gun, not a product fault.

**Defect:** `API_BASE` in `apps/admin/src/lib/api.ts` was used verbatim while
callers append `/v1/...`. A `NEXT_PUBLIC_API_BASE_URL` that already ended in
`/v1` produced `/api/v1/v1/auth/login`.

**Fix:** trailing slashes and a terminal `/v1` are trimmed from the base, so the
documented origin-plus-`/api` form and the mistaken form both work.

## 11. The preview stack did not survive a sandbox recycle

**Severity:** high for the deliverable — the owner's preview links went dark.

**Found by:** every port returning `000` after the crash, with
`PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432`.

**Defect:** three separate failures. The `postgresql-17` package was removed from
the image while the seeded cluster under `.run/pgdata` survived; the reinstall
widened that directory to `2770`, which PostgreSQL refuses to start from; and the
nginx reverse proxy plus `pnpm` were both gone. `start-stack.sh` also probed
readiness with `ss`, which is absent from the image, so it reported every healthy
service as `FAILED`.

**Fix:** `start-stack.sh` is now self-healing — it reinstalls PostgreSQL, restores
`pgdata` to `0700`, restores a `pnpm` shim through corepack, and starts one
`preview-proxy.mjs` per public host (12000 → admin, 12001 → customer) with a
`/mobile` route. Readiness uses a bash `/dev/tcp` probe instead of `ss`. nginx is
no longer required: the proxies serve the two ingress ports directly. The seeded
database was preserved throughout, so no re-seed was needed.

**Verified:** cold recovery to `47 / 47` public routes returning `200`.

## 12. A concurrent refresh in a second tab silently signed the user out

**Severity:** high — a real session-loss bug in the shipped auth flow.

**Found by:** CI run `39050023690` (head `06ed1c0`), where the browser suite
failed 1 of 134 with `two tabs refreshing at once both stay usable`. The
Playwright trace showed the second tab's `POST /api/v1/auth/refresh` returning
`403` and the page falling back to `/login`.

**Defect:** the server-side rotation was already race-safe — the guarded
`updateMany` claim, the grace window and `issueSibling` all behaved correctly,
and a direct 12-iteration concurrent-refresh probe passed 12/12. The fault was
the CSRF double-submit token. `CookieService.setSession` minted a **new**
`oryx_csrf` on every response, including refresh. When two tabs refreshed at
once, both requests carried the same pre-rotation header, but the first response
rotated the cookie; the second request then presented a header that no longer
matched the rotated cookie, so `CsrfGuard` rejected it with
`auth.csrf_token_invalid` and that tab lost its session.

**Reproduced deterministically** with `node` against the public host: login,
refresh once (cookie rotated, `rotated=true`), then replay the pre-rotation
header against the new cookie — `403`. A 12-iteration concurrent probe that
happened to pair identical headers passed, which is why the defect looked
intermittent.

**Fix:** the CSRF token is not a credential and gains nothing from per-request
rotation, so it is now preserved for the life of the session and minted fresh
only at login. `setSession` and `setCustomerSession` accept an `existingCsrf`
argument, and the refresh handlers pass the caller's current token through. The
identical defect existed on the customer plane
(`CustomerAuthController.complete`) and is fixed the same way.

**Verified:** after the fix the repro reports `rotated=false` and the stale
header returns `200`; the 12-iteration concurrent probe is still 12/12; the
multi-tab browser test passes 5/5 consecutively (previously the failure was
reproducible). Two regression tests were added to `session.e2e-spec.ts` — one
asserting the token survives rotation and a pre-rotation header still verifies,
one asserting a genuinely wrong token is still rejected with
`auth.csrf_token_invalid`, so the guard is demonstrably not weakened. The API
suite grew from 218 to 220 tests, all passing.

**Security note:** no check was relaxed. `CsrfGuard` still requires the header
to match the cookie on every unsafe method that presents the refresh cookie; only
the *value's lifetime* changed, from per-response to per-session.

## 13. Super Admin sign-in rejected a padded or mixed-case email

**Found:** 2026-10-17, during the crash-recovery session, from the owner's report
that `info@oryxbhr.com` could not sign in permanently.

**Defect:** `LoginDto.email` carried `@IsEmail()` with no normalisation, so a
value pasted from a mobile keyboard or an email client with a trailing space
failed validation with a `400 "email must be an email"` before the service ever
lowered the case or trimmed it. To the user that reads as a broken account rather
than a stray character.

**Fix:** a `TrimString()` transform decorator was added to
`apps/api/src/common/transformers.ts` and applied to `LoginDto.email` (and the
customer, marketplace and RBAC DTOs that take an email). The email is trimmed
before validation, and the service already lower-cases before lookup.

**Verified:** `apps/api/test/super-admin-access.e2e-spec.ts` signs in with a
leading and trailing space and with mixed case, both against the seeded Super
Admin. Regression test in the API suite (9 tests in that spec).

**Note on the owner's account:** `info@oryxbhr.com` is not a seeded account in
this repository — the seeded platform principal is `superadmin@oryx.local`
(`SEED_SUPER_ADMIN_EMAIL`). The owner's address can be seeded by setting
`SEED_SUPER_ADMIN_EMAIL=info@oryxbhr.com` before `pnpm db:seed`, which is how the
production principal should be provisioned. No production credential is stored in
the repository.

## 14. Sourcing the root `.env` overrode the admin's relative API base

**Found:** 2026-10-17, during the crash-recovery session, when the external
preview sweep reported CORS blocks on
`http://localhost:3001/api/v1/auth/login` from the public HTTPS origin.

**Defect:** `apps/admin/.env.local` correctly sets
`NEXT_PUBLIC_API_BASE_URL=/api` so the preview bundle calls the API same-origin.
But the root `.env` sets the same variable to an absolute
`http://localhost:3001/api`, and Next gives an exported shell variable precedence
over `.env.local`. A build that sources the root `.env` first — which the other
workspace builds need for `DATABASE_URL` — therefore baked the absolute localhost
URL into the served bundle. The reviewer's browser then called its own
`localhost:3001`, so every authenticated page rendered its shell with no data and
the console filled with CORS errors. A status-code-only check would have missed
this, because the pages still returned `200`.

**Fix:** the preview build exports `NEXT_PUBLIC_API_BASE_URL=/api` explicitly for
the admin build, so the relative value wins regardless of the ambient shell
environment.

**Verified:** the external sweep now records **0 failed requests** across all 39
routes, and the failing-request list (which previously named the localhost CORS
block) is empty. The check is in `docs/audit/evidence/preview-sweep-2026-10-17.json`.

**Note for the next operator:** any command that builds the admin app must not
leave the root `.env`'s absolute `NEXT_PUBLIC_API_BASE_URL` exported, or the
served preview loses its same-origin API.

## 15. A stored light theme flashed dark and could be silently reverted

**Found by:** CI. The browser-acceptance job failed on
`execution04.spec.ts:70` ("every Execution 04 screen renders in both languages
and both themes") with `Expected: "dark"` but `unexpected value "light"`, on a
commit that changed only audit markdown. The same code had passed on the
previous head, which is the signature of a race rather than a deterministic
failure.

**Cause:** two effects in `UiProvider` (`apps/admin/src/lib/ui-context.tsx`,
and the same shape in `apps/customer`).

1. The root layout hard-codes `data-theme="dark"` server-side, and the stored
   preference was applied only inside a `useEffect` after hydration. A
   light-theme user therefore saw a dark first paint on every navigation — a
   real visual defect, not just a test artefact.
2. The theme effect ran on mount and wrote `localStorage['oryx.theme'] = theme`
   unconditionally. On the hydration pass `theme` is still the server default
   (`dark`), so the mount wrote `dark` back over whatever the user had stored.
   When a test (or a user) changed the stored value between the mount write and
   the next read, the two writes raced and the stored preference lost
   intermittently.

**Fix:** both front ends now

- render a tiny blocking `<script>` at the top of `<body>` that reads the stored
  theme and locale and sets `data-theme`/`data-dir`/`lang` on `<html>` before
  the first paint, so there is no flash and the attribute is already correct
  when React hydrates; and
- guard the persistence effects with a `mounted` ref declared last, so the
  hydration pass never writes the server defaults back over the stored values.

**Verified:** `.run/theme-verify.mjs` drives a real browser against the public
preview and asserts, for both `light` and `dark`, that the attribute at first
paint, the attribute after hydration and the stored value all agree. Three
consecutive runs report `light_ok: true, dark_ok: true`. Before the fix the
first-paint probe reported `null` (the attribute was not set until after
hydration) and the stored value reverted to `light` when `dark` was requested.


## 16. Super Admin lost every tenant permission after a re-seed

**Severity:** critical, user-visible. A platform Super Admin could sign in and
see the platform screens, but every company-scoped ERP endpoint answered `403`
once a company was selected. The owner reported exactly this: "Super Admin full
access" did not work.

**Found by:** the API integration suite. `super-admin-access.e2e-spec.ts`
("resolves the whole permission catalog once a company is selected") and
`permissions-verification.e2e-spec.ts` both failed after the sandbox was
recycled, while the same commit had passed before the crash. That signature —
same code, different database state — pointed at data drift rather than a code
change.

**Cause:** two defects stacked on one another.

1. `seedPlatformRoles()` in `packages/database/prisma/seed.ts` resolved the
   platform role with
   `upsert({ where: { companyId_code: { companyId: '', code: 'platform_super_admin' } } })`.
   A platform role has `companyId = NULL`, and Postgres treats `NULL` as
   distinct in a unique index, so `(NULL, 'platform_super_admin')` never matched
   the sentinel key `('', 'platform_super_admin')`. The create path therefore
   ran and inserted a **second** `platform_super_admin` row on every re-seed.
   This is the same nullable-unique-key trap already documented for
   `IntegrationProvider`, but `Role` had no partial index to prevent it.
2. The consumers — `PrincipalGuard.buildPrincipal`,
   `AuthService.effectivePermissionCodes` and `RbacService` — all resolve the
   role with `findFirst({ where: { isPlatform: true, code: 'platform_super_admin' } })`,
   which has no `orderBy`. It returned the first row Postgres offered, which
   after the drift was the stale row created before commit `a14d7b2` widened
   `PLATFORM_SUPER_ADMIN_PERMISSIONS` from the 18 PLATFORM-scope codes to the
   full 153-code catalog. The principal therefore received 18 permissions, and
   `resolveEffectivePermissions` correctly refused to widen them: only the
   PLATFORM-scope subset survived, and every `erp.*` permission was absent.

**Fix:** `seedPlatformRoles()` now resolves the row with
`findFirst({ where: { companyId: null, code: 'platform_super_admin' } })` and
updates it in place, creating it only when it is genuinely absent. This is the
only idempotent form for a nullable unique key, and it matches the pattern
already used for the platform integration provider.

The stale duplicate row was removed from the staging database. The repaired role
holds all 153 permission codes.

**Verified:** `node .run/live-login-https.mjs` against the public HTTPS preview
now reports `Super Admin … perms=18 scoped=200 scopedPerms=153`, where the same
probe previously reported `scopedPerms=18`. `.run/verify-super-admin-erp.mjs`
then reaches real tenant data over public HTTPS: accounting accounts `200`
(21 rows), sales customers `200`, inventory products `200`, HR employees `200`,
CRM leads `200` and the module catalog `200` (21 modules). Re-running
`pnpm db:seed` a second time leaves exactly one platform role row with 153
permissions, so the drift cannot recur.

**Regression guard:** `apps/api/test/super-admin-access.e2e-spec.ts`, test "has
exactly one platform super admin role carrying the whole catalog". It asserts a
single `(companyId: null, code: 'platform_super_admin')` row holding more than
100 permissions including `erp.accounting.read`, so a duplicated or truncated
platform role fails the suite instead of silently degrading the Super Admin.


## Execution 06 follow-up (2026-10-18) — two defensive-input defects

Both were found by the module-by-module live probe (`.run/probe-bad-dates.mjs`,
`.run/probe-booking-cal.mjs`), which sends deliberately malformed query strings
to every date-filtered endpoint. Neither is a data-integrity bug; both turned a
client mistake into an unhandled 500 and a stack trace in the API log.

## 17. A malformed report date returned 500 instead of 400

**Found:** 2026-10-18, live probe against the staging API.

**Defect:** the four report endpoints — `GET /reports/accounting`,
`/reports/sales`, `/reports/purchasing` and `/reports/inventory` — declared their
`from` and `to` filters with `@IsString()`. Any string passed validation, so
`?from=not-a-date` reached the service, which handed it to `new Date(...)` and
then to Prisma; the resulting `Invalid Date` threw inside the query and the
global filter returned a 500. The accounting statement endpoints
(`general-ledger`, `trial-balance`, `income-statement`, `balance-sheet`) already
used `@IsISO8601()` and correctly returned 400, so the two families disagreed
about the same input.

**Fix:** `apps/api/src/reports/reports.dto.ts` now declares `from` and `to` with
`@IsISO8601()`, matching the accounting DTOs. The class-validator message names
the field, so the client gets `from must be a valid ISO 8601 date string`.

**Verified:** `.run/probe-bad-dates.mjs` now reports `400` for all six families
with the field-level message; a valid ISO range still returns `200`.

**Regression guard:** `apps/api/test/input-validation.e2e-spec.ts`, the
"a malformed date filter is a 400, not a 500" group — eight tests covering all
four reports plus the four accounting statements.

## 18. The bookings calendar required a range but did not say so

**Found:** 2026-10-18, same probe run.

**Defect:** `GET /bookings/calendar` read `from`, `to` and `resourceId` straight
from `@Query()` with no DTO. With no range, or with a malformed one, the
controller passed `undefined`/`Invalid Date` into the availability query, which
threw and returned a 500. A caller had no way to know the range was mandatory,
and the failure mode was a server error rather than a validation message.

**Fix:** `apps/api/src/customer/booking.dto.ts` gains `CalendarQueryDto`
(`@IsDateString()` on `from` and `to`, `@IsOptional() @IsString()` on
`resourceId`), and `booking.controller.ts` takes `@Query() query:
CalendarQueryDto`. A missing or malformed range is now a 400 naming the field.

**Verified:** `.run/probe-booking-cal.mjs` reports `400` with no params,
`400` for `from=bad`, and `200 []` for a valid October range.

**Regression guard:** `apps/api/test/input-validation.e2e-spec.ts`, the
"bookings calendar requires a real date range" group — three tests.

## Note — the preview bundle must be built with a relative API base

This is not a new defect; it is the recurring operational trap documented as
defect 14, and the crash-recovery session hit it again. `start-stack.sh` sources
the root `.env`, which sets `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api`.
Next gives an exported shell variable precedence over `apps/admin/.env.local`, so
a rebuild after sourcing the root `.env` bakes the absolute localhost URL into
the served bundle. The public HTTPS pages then return `200` while every
authenticated fetch is CORS-blocked — a status-code-only check passes while the
product is broken.

Any rebuild of `apps/admin` or `apps/customer` for the preview must export
`NEXT_PUBLIC_API_BASE_URL=/api` for the build, and the running `next start`
processes must be restarted afterwards (`pgrep -f "next start"` does not match
them; they appear as `next-server`, so kill by port or by PID).

**Verified:** after the rebuild the external sweep records **39/39 routes, 0
failed requests**, and `grep -rho "localhost:3001" apps/admin/.next/static/chunks`
returns nothing.

## Defect 18 — customer refresh answered `404` where the staff plane answers `401`

**Found:** 2026-10-18, by attributing every `>= 400` response to the page that
produced it (`.run/diag-http-errors.mjs`) during the Execution 07 re-verification.
The 39-surface sweep reported `2` console errors; a status-code-only check had
hidden both.

**Defect:** `CustomerAuthController.refresh` threw
`notFound(ERROR_CODES.AUTH_TOKEN_INVALID, 'No refresh token was presented.')`
when the request carried no refresh cookie. The equivalent staff handler,
`AuthController.refresh`, throws `unauthorized(...)` for the same condition.
Two problems followed:

1. `404` is semantically wrong — the route exists; the caller has no session.
2. The customer client treats `401`/`403` as *expired* and anything else as a
   *transient outage*, so `restoreCustomerSession()` retried the call three
   times with backoff. A first-time visitor's page load produced three failed
   requests before rendering.

**Fix:** `apps/api/src/customer/customer-auth.controller.ts` throws
`unauthorized(...)` instead, matching the staff plane. The import changed from
`notFound` to `unauthorized`.

**Verified:** `.run/diag-http-errors.mjs` now reports `401` on every anonymous
customer surface; `.run/check-refresh-count.mjs` reports **1** refresh request
per anonymous homepage load (was 3); the external sweep's console-error count
fell from 2 to 1, the remaining one being the expected bootstrap `401`.

**Regression guard:** `apps/api/test/execution04.e2e-spec.ts`, section *A.
customer identity* — `answers a cookieless refresh with 401, never 404`.

## Defect 19 — three category vocabularies made every category filter return nothing

**Found:** 2026-10-18, during the Execution 07 Phase D verification. The
homepage category cards rendered the bundled vector fallback instead of the CMS
photograph (`categoryCardsFromCms: 0`), and a direct probe showed
`GET /marketplace/providers?categoryKey=automotive_maintenance` returning `0`.

**Defect:** three layers each used a different key for the same concept.

| Layer | Keys it used |
|---|---|
| Customer website and mobile `SERVICE_CATEGORIES` | `automotive_maintenance`, `automotive_inspection`, `automotive_tyres`, `automotive_bodywork`, `automotive_recovery` |
| Seeded `ServiceCategory` rows (the CMS imagery target) | `vehicle_inspection`, `maintenance`, `spare_parts`, `recovery`, `car_wash` |
| Seeded `MarketplaceProvider.categoryKey` | `WORKSHOP` |

The provider directory filters on `categoryKey`, so each category chip sent a key
no provider carried and the directory returned an empty list. The homepage looked
up `content.categories` by the website key, found no row, and fell back to vector
art. Neither failure raised an error; both rendered a plausible but empty result,
which is why the earlier status-code-only sweeps missed it.

**Fix:** the catalogue now lives once, in
`packages/shared/src/service-categories.ts`. The seed writes the `ServiceCategory`
rows and the provider `categoryKey` values from it and creates one approved
provider per category; the customer website and the mobile app re-export it. The
keys are the persisted `ServiceCategory.key` values, so the CMS rows, the
photography and the provider directory agree by construction.

**Verified:** every canonical key now returns providers
(`vehicle_inspection` / `maintenance` / `spare_parts` / `recovery` / `car_wash`
→ `27` each; the retired `automotive_maintenance` and `WORKSHOP` → `0`).
`.run/verify-category-filter.mjs` drives the live UI and records 27 rendered
provider cards for each of the five categories in
`docs/audit/exec07/phase-d/category-filter-verification.json`.
`.run/capture-exec07-phase-d.mjs` now reports `categoryCardsFromCms: 5` in all
four locale/theme captures (was `0`).

**Regression guard:** `packages/shared/test/service-categories.test.ts` (7 tests,
including explicit rejection of the retired keys) and three tests in
`apps/api/test/execution07.e2e-spec.ts`: the CMS category keys and the provider
directory agree, a retired key matches nothing, and every catalogue category is a
seeded `ServiceCategory` row.

