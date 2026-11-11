# ORYX — Execution 14 Report

**Theme:** Final Integration Audit, Mobile Completion & Android Acceptance
**Branch:** `feature/execution-07-premium-web`
**Baseline commit:** `c950d1347610d43d72c613dcfd3d2a0c3bb7bac7`
**Date:** 2026-11-01

---

## 1. Scope

Execution 14 audited the integration between the Super Admin dashboard, the customer
mobile application, the merchant mobile application, the NestJS API and PostgreSQL,
then closed the defects the audit found. Nothing here is a mock: every surface below
was exercised over real HTTP against the running API and the real database, or by a
test that pins the client contract.

The execution was a **verification-first** pass. Most of the integration the earlier
executions claimed was already real, so the work was to prove it and to fix the gaps
that proof exposed rather than to rebuild working features.

Two genuine defects were found and fixed:

| Defect | Symptom | Root cause |
| --- | --- | --- |
| The mobile app never sent the double-submit header | A signed-in customer or merchant was silently dropped into **offline demo mode** on every cold start, and every unsafe request (cancel a booking, save a vehicle, upload a photo) was answered `403 auth.csrf_token_invalid` | The API returns `csrfToken` in the login/refresh body for `x-oryx-client: mobile`, but the app never stored or echoed it. React Native's cookie jar replays the HttpOnly refresh cookie on every request, so `CsrfGuard` demanded the matching `x-oryx-csrf` header that the app never sent. |
| The home rail reported every product as out of stock | A real, in-stock product rendered with an "Out of stock" badge on the Android build | `GET /customer/homepage` projected no availability, so the client adapter defaulted `stock` to `0`, and the card treats `stock <= 0` as sold out |

Both are fixed, and both now carry a regression test that fails if they come back.

---

## 2. Files changed

### Backend — `apps/api`

| File | Change |
| --- | --- |
| `src/marketplace/customer-homepage.service.ts` | Project `available` (boolean) onto each home product, using the same rule the public catalogue uses (`trackStock ? onHand > 0 : true`). The quantity itself is never exposed. |
| `test/execution10-mobile-integration.e2e-spec.ts` | Assert the home rail's availability matches the catalogue's answer for the same product |

### Mobile — `apps/mobile`

| File | Change |
| --- | --- |
| `src/lib/api.ts` | Customer and staff double-submit token stores (`setCsrfToken`/`getCsrfToken`, `setStaffCsrfToken`/`getStaffCsrfToken`) held in module memory beside the access tokens; the `x-oryx-csrf` header is now sent on every unsafe request and multipart upload, on the correct plane; `csrfToken?` added to `CustomerSession` and `StaffSession` |
| `src/lib/live-session.tsx` | Adopt the customer token on login/refresh, clear it on logout, persist it, and load it during `restore` **before** the refresh POST |
| `src/lib/merchant-session.tsx` | The same adopt/clear/persist/restore wiring for the staff plane, with its own `CSRF_KEY` |
| `src/lib/session-storage.ts` | Removed the now-redundant `readCsrfToken` cookie reader (the token is adopted from the body on both native and web) |
| `src/lib/api-adapters.ts` | Map the home product's `available` boolean to the card's stock flag so an in-stock product is not shown as sold out |
| `src/app/(tabs)/bookings.tsx` | Reload the booking list when the tab regains focus, so a booking created on the wizard appears without a manual pull |
| `src/lib/use-reload-on-focus.ts` | Hold the loader in a ref so an inline callback identity cannot re-subscribe the focus effect in a loop |
| `app.config.ts` | Register the cleartext-local-API config plugin |
| `plugins/with-cleartext-local-api.js` | **New.** Permit cleartext HTTP to the loopback hosts and the emulator host alias only (`localhost`, `127.0.0.1`, `10.0.2.2`, `10.0.3.2`); every other destination stays HTTPS-only |

### Tests

| File | Change |
| --- | --- |
| `apps/api/test/execution14-mobile-restore.e2e-spec.ts` | **New.** 7 tests pinning the mobile session-restore contract on both planes |
| `apps/mobile/test/csrf-double-submit.test.ts` | **New.** 6 tests pinning the double-submit header on both planes, on and off GETs |
| `apps/mobile/test/api-planes.test.ts` | 3 tests pinning the home-product availability mapping |

### Documentation

| File | Change |
| --- | --- |
| `docs/audit/execution-14/android-acceptance/` | **New.** Nine 1080×2400 Android captures (Splash, Homepage, live rails, signed-in account, live booking history, booking detail) |
| `docs/audit/backend/EXECUTION_14_REPORT.md` | This report |

---

## 3. Backend endpoints

No endpoint was added. Execution 14 reused the existing contracts; the only API
change is one new field on an existing response.

| Endpoint | Used by | Note |
| --- | --- | --- |
| `POST /customer/auth/register` | Customer sign-up | Returns `csrfToken` for `x-oryx-client: mobile` |
| `POST /customer/auth/login` | Customer sign-in | Same |
| `POST /customer/auth/refresh` | Session restore | Reads the `oryx_crt` cookie **or** the body token; requires the `x-oryx-csrf` header when the cookie is present |
| `POST /customer/auth/logout` | Sign-out | |
| `GET /customer/homepage` | Home rails | Now carries `products[].available` |
| `GET /customer/bookings/availability` | Booking wizard | Real slots only |
| `POST /customer/bookings`, `GET /customer/bookings`, `GET /customer/bookings/:id`, `POST /customer/bookings/:id/cancel` | Booking lifecycle | Ownership enforced server-side |
| `GET /provider/*`, `POST /provider/listings`, `PATCH /provider/listings/:id` | Merchant portal | Resolved from membership, not from a client-supplied id |
| `POST /provider/requests/:id/accept`, `…/decline`, `…/complete` | Merchant request workflow | |
| `POST /customer/inspection-photos`, `GET /customer/inspection-photos`, `DELETE /customer/inspection-photos/:id` | SENSAGE capture | Upload, history, removal |
| `POST /inventory/products/:id/images`, `GET …`, `PATCH …`, `DELETE …` | Merchant product images | Staff plane; MIME/size/path validated by the media pipeline |

### Design rules held

- **The double-submit header is sent only on unsafe methods.** A GET carries no
  double submit, and echoing the token on reads would only widen its exposure.
- **The two planes never share a token.** A customer token is not a merchant token and
  vice versa; the client keeps them in separate stores and the tests assert it.
- **Availability is a boolean, never a quantity.** A public projection must not expose
  a tenant's inventory depth.
- **The CSRF token is stable across a refresh.** Only the refresh token rotates, so the
  app may echo the same value again without re-reading a cookie it cannot read.

---

## 4. Real HTTP test results

### API integration suite

```
pnpm --filter @oryx/api test:e2e
Test Suites: 25 passed, 25 total
Tests:       476 passed, 476 total
```

The run was made against the migrated and seeded `oryx_dev` database. It includes the
new `execution14-mobile-restore.e2e-spec.ts` (7 tests), which pins the contract that
made the fix sufficient:

1. login issues the refresh cookie **and** the body double-submit token together;
2. the restore succeeds when the body token is echoed as the header (`oryx_crt` cookie
   + matching `x-oryx-csrf`) — HTTP 200 with a rotated refresh token;
3. the restore is **refused** when the cookie is presented without the header — HTTP
   403 `auth.csrf_token_invalid`, the exact failure that dropped the customer into
   demo mode;
4. the rotated session restores again with the freshly issued pair;
5–7. the same three properties for the merchant (staff) plane.

The staff-plane half is corroborated by the existing
`mobile-native-session.e2e-spec.ts` and `reauth-stale-cookie.e2e-spec.ts` suites, which
continue to pass.

### Direct HTTP checks against the running API

```
POST /customer/auth/register (x-oryx-client: mobile) → 201, csrfToken + refreshToken present, oryx_crt cookie set
POST /customer/auth/refresh  (cookie + x-oryx-csrf)  → 200
POST /customer/auth/refresh  (cookie, no header)     → 403 auth.csrf_token_invalid
```

The booking lifecycle — creation, availability, confirmation, history, detail and
cancellation with server-enforced ownership — is covered end to end by the
`execution10-mobile-integration.e2e-spec.ts` "live customer booking lifecycle" block
rather than by a manual call.

### Mobile and cross-cutting results

| Check | Result |
| --- | --- |
| `@oryx/mobile` tests | 7 files, **102 passed** |
| `@oryx/shared` tests | 9 files, **180 passed** |
| API typecheck (`tsc --noEmit`) | pass |
| Mobile typecheck (`tsc --noEmit`) | pass |
| Mobile lint (`eslint . --max-warnings=0`) | pass |
| React version regression | `react` and `react-dom` resolve to **19.1.0** across admin, customer and mobile (hoisted) |
| Android release build | `BUILD SUCCESSFUL` — `app-release.apk`, 76,704,929 bytes, SHA-256 `9c0b5cf2ff48a7ea54afd05a8b3ae7333433223619ea5724a8769f120d5ff2aa` |

### Environment problems resolved during this execution

The sandbox restarted mid-execution and removed the PostgreSQL binaries, the JDK and
the Android SDK, and killed the API and the database. All were restored before any
test ran, so no result below is from an empty or uninitialised database:

- `postgresql-17` and `postgresql-client-17` reinstalled; the existing `.run/pgdata`
  cluster (intact) was restarted on `:5432`;
- `openjdk-21-jdk-headless` reinstalled;
- Android SDK: `cmdline-tools`, `platforms;android-36`, `build-tools;36.0.0` and
  `ndk;27.1.12297006` installed to `/opt/android-sdk` (the versions RN 0.81.5 and
  Expo 54 resolve from `libs.versions.toml`);
- the API rebuilt from the unchanged backend source and started on `:3001`; the seeded
  `oryx_dev` database answered `/api/health` with `"database":"up"`.

---

## 5. Security verification

| Property | How it was verified | Result |
| --- | --- | --- |
| The refresh token is never returned to a browser client | `mobile-native-session.e2e-spec.ts` | pass — body token only for `x-oryx-client: mobile` |
| An unsafe cookie-bearing request without the CSRF header is refused | `execution14-mobile-restore.e2e-spec.ts` (both planes), `reauth-stale-cookie.e2e-spec.ts` | pass — 403 `auth.csrf_token_invalid` |
| The two identity planes do not leak into each other | `csrf-double-submit.test.ts`, `api-planes.test.ts`, `execution10-mobile-integration.e2e-spec.ts` | pass — a consumer token is refused on a provider route and vice versa |
| A customer cannot read or act on another account's data | `execution10-mobile-integration.e2e-spec.ts` (bookings, vehicles, photos), `execution14…` | pass |
| A staff account not linked to a provider cannot read the portal | `execution10-mobile-integration.e2e-spec.ts` | pass — scope comes from membership, not permission |
| Credential values never leave the API | unchanged from Execution 05; no read path was added | pass |
| Cleartext HTTP is scoped to loopback only | `plugins/with-cleartext-local-api.js` | every non-loopback destination stays HTTPS-only |
| No secret is committed | `git status` reviewed before commit | pass — no `.env`, token or key staged |

The CSRF fix **strengthens** the security posture rather than weakening it: the guard
is unchanged and still refuses a cookie-bearing unsafe request without a matching
header. The app now satisfies the guard correctly instead of failing it.

---

## 6. Design preservation

The approved visual identity is untouched by this execution:

- The dark navy and gold ORYX palette is unchanged.
- The approved black-SUV Hero is unchanged; no slider image was introduced.
- The Homepage was not redesigned. The only Homepage change is a data field
  (`available`) that the existing card already knew how to render.
- The photographic Splash still holds for at least two seconds after its image loads;
  no startup screen was added.
- The Android captures in `docs/audit/execution-14/android-acceptance/` were taken on
  the previous build and show the Homepage rails rendering real API data.

---

## 7. Remaining incomplete work

This report claims only what it verified. The following remain open and are **not**
claimed as done here:

- **On-device re-verification of the session-restore fix.** The sandbox restart removed
  `/dev/kvm` and the connected device, so the rebuilt APK could not be exercised on a
  device in this session. The fix is proven at the HTTP layer — the server contract it
  must satisfy is pinned by `execution14-mobile-restore.e2e-spec.ts` and the client
  behaviour by `csrf-double-submit.test.ts` — but a device check is not claimed. The
  rebuilt APK is available at
  `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
  (SHA-256 `9c0b5cf2ff48a7ea54afd05a8b3ae7333433223619ea5724a8769f120d5ff2aa`).
- **A fresh Android visual acceptance capture of the fixed build.** The committed
  captures are from the previous build; re-capturing Splash and Homepage on the fixed
  build requires a device and was not performed. A DOM or UI-hierarchy assertion is not
  a substitute for an on-device check, and none is claimed.
- **SENSAGE live analysis.** The upload path, history and failure handling are real and
  tested; the SENSAGE *analysis* remains a clearly-labelled demo and is not presented as
  real AI output.
- **A new published APK.** No APK was published; the instruction was to hold the release
  until the integrated functionality is coherent.

---

## 8. Final commit

Implementation commit `386a48f` on `feature/execution-07-premium-web` — the commit that
accompanies this report. PR #7 remains **open and draft** (verified after the push:
`state=open`, `draft=true`, `head=386a48f`); nothing was merged or deployed, and no APK
was published.

Baseline before this execution: `c950d1347610d43d72c613dcfd3d2a0c3bb7bac7`.
