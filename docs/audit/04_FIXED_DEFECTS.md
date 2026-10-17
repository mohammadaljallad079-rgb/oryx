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

