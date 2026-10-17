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

**Defect:** `scripts/extract-approved-assets.py` treats
`docs/assets/ORYX Auto Services Dashboard.png` — the owner's approved *design
reference screenshot* — as an image source and crops photographic regions out of
it into `apps/admin/public/tiles/*.jpg`. The dashboard hero had already been
moved to a purpose-drawn vector banner, but the **module catalog** still pointed
the dashboard tile at the crop:

```diff
-  M('dashboard', …, 'hero-automotive', '/dashboard/overview', …),
+  M('dashboard', …, 'tile-dashboard', '/dashboard/overview', …),
```

`tileImageUrl()` resolves a tile name to `/tiles/<name>.jpg`, so the dashboard
tile rendered `hero-automotive.jpg`, a crop of the reference.

**Fix:**

| Change | File |
|---|---|
| Original vector motif for the dashboard tile (gold telemetry gauge over a KPI strip) | `scripts/generate-tile-art.py` → `dashboard()` |
| Generated artwork | `apps/admin/public/tiles/tile-dashboard.svg`, `tile-dashboard.jpg` (900 × 560) |
| Dashboard module points at the generated art | `packages/shared/src/modules.ts` |

**Verified live**, through the public HTTPS ingress:

| Probe | Result |
|---|---|
| `.oryx-hero__media` background | `…/tiles/banner-automotive.svg` |
| `tile-dashboard` background | `…/tiles/tile-dashboard.jpg` |
| Elements referencing `hero-automotive` | **none** |
| `tile-dashboard.jpg` decoded size | **900 × 560** |

**Regression guard:** `apps/admin/e2e/branding.spec.ts`, test "the approved
design reference is never used as dashboard artwork".

**Still open, disclosed:** the other `tile-*.jpg` crops remain derived from the
approved reference, because the original photography was never supplied and
those modules need image-led tiles. Report 03 and the README continue to state
that full visual parity is **not** claimed.

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

## Recovered, not yet fixed — needs an owner decision

The remaining `tile-*.jpg` photographic crops derived from the approved design
reference (see defect 5). Replacing them needs either the original photography
files or a decision to commission new artwork; it is not something to invent.

