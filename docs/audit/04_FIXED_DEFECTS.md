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

## Recovered, not yet fixed — needs an owner decision

None. Every defect found in this audit is fixed and guarded.
