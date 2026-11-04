# Execution 10 — mobile integration: authentication, bookings, merchant, media

**Baseline:** `5c9c1f9` · **Branch:** `feature/execution-07-premium-web` · PR #7 **Draft**
**Database:** PostgreSQL 17, additive migrations only, no destructive change

---

## 1. Scope

Execution 10 connects the ORYX customer mobile application to the backend that
already exists. No new backend framework, no second ledger, no second media
store, no second provider API.

1. Real customer authentication, session restoration and refresh.
2. Live customer bookings, including a confirm step that was missing.
3. Merchant/provider screens against the real portal.
4. Product image upload and management.
5. SENSAGE inspection image upload.
6. Preserving the approved visual identity.
7. Tests and evidence.

This revision records the work completed after the first report draft: the
vehicle-garage write path, the booking-engine seed gap, the demo-gating audit and
its regression test, and the focus-reload fix.

---

## 2. Files changed in this revision

| File | Change |
| --- | --- |
| `packages/database/prisma/seed.ts` | Seed bookable `BookingResource` rows and their `WorkingHours` |
| `apps/mobile/src/app/vehicles/new.tsx` | Add-vehicle form persists through `POST /customer/vehicles` |
| `apps/mobile/src/app/parts/index.tsx` | Demo rail gated to the offline demo, never a live session |
| `apps/mobile/src/app/(tabs)/account.tsx` | Reload the garage and the order list on focus |
| `apps/mobile/src/app/addresses.tsx` | Reload on focus |
| `apps/mobile/src/lib/use-reload-on-focus.ts` | **New** — refetch a list when a screen regains focus |
| `apps/mobile/test/demo-gating.test.ts` | **New** — every demo-reading screen must read the session |
| `apps/mobile/test/live-endpoints.test.ts` | Vehicle-create and merchant-recovery route assertions |
| `scripts/exec10-smoke.sh` | **New** — 31-check real HTTP smoke test |

---

## 3. Customer authentication

The consumer identity plane was already implemented on the server
(`apps/api/src/customer/customer-auth.*`). Execution 10 connects the app to it.

`apps/mobile/src/lib/live-session.tsx` — the live customer session:

- **`status`** is `restoring` → `guest` | `live`. A guest is a first-class state,
  not an error; the whole catalogue is browsable without an account.
- **The access token is memory-only.** It is never written to storage.
- **The refresh token is the one long-lived secret** and lives in the device
  keychain through `session-storage.ts` (`expo-secure-store`,
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
- **Restore** presents the stored refresh token to `POST /customer/auth/refresh`
  and swaps it for a fresh access token. A rejected refresh clears the stored
  secret and the app becomes a guest — an expired session degrades cleanly rather
  than half-existing. A *network* failure is treated differently: the token is
  kept and the run is guest, so a flaky connection does not sign the user out.
- **`signIn` / `register` / `signOut`** wrap the real endpoints. Sign-out revokes
  the presented refresh token on the server before clearing local state.

Screens: `login.tsx` and `register.tsx` drive `signIn` / `register`.

**Plane separation is enforced on the server and mirrored on the client.** A
consumer access token carries `audience: customer`; a staff token carries the
staff audience. Each is refused on the other plane. The client keeps the two
tokens in separate slots (`setAccessToken` / `setStaffAccessToken`) so a merchant
sign-in cannot clobber a customer session.

---

## 4. Live customer bookings

The gap: `POST /customer/bookings` creates a slot in `HELD`, and a hold that is
never confirmed expires and releases the slot. There was **no customer-facing
confirm endpoint** — only staff routes — so a booking made from the app could
never reach `CONFIRMED`.

### Backend additions

`apps/api/src/customer/booking.service.ts`:

- `confirmCustomerBooking(accountId, slotId)` — transitions `HELD` → `CONFIRMED`,
  scoped to the signed-in account, and refuses a hold past its expiry with
  `BOOKING_HOLD_EXPIRED`.
- `getCustomerBooking(accountId, id)` — reads one booking, scoped to the account,
  with its resource. A foreign id is a **404**, not a leak.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/bookings/:id` | read one of your own bookings |
| `POST` | `/customer/bookings/:id/confirm` | confirm your own held booking |

Ownership is enforced by `accountId` from the verified token, never from the URL.

### The seed gap found and fixed

Availability is generated from a `BookingResource` and its `WorkingHours`. The
seed created **workshop bays** but no bookable resource, so a freshly seeded
deployment offered **zero slots** — the mobile wizard showed an empty day and no
error. The seed now creates two `BAY` resources per company, open 08:00–20:00
every day, and the count is printed in the seed summary (`14 booking resources`).
This is the difference between a live booking engine that appears broken and one
that works.

### Mobile additions

- `lib/api.ts` — `BookingSummary` extended; `bookingsApi.get(id)` and
  `bookingsApi.confirm(id)` added.
- `lib/live-bookings.tsx` — `confirmBooking` wired into the live state.
- `app/bookings/new.tsx` — the wizard confirms the held booking after create, so
  a booking made in the app becomes `CONFIRMED` instead of expiring.
- `app/bookings/[id].tsx` — reads the single booking and offers Confirm while the
  status is `HELD`.

**Available slots are never fabricated.** The wizard renders exactly what
`GET /customer/bookings/availability` returns. Cancellation is offered only for a
status the server would accept (`HELD`, `CONFIRMED`, `RESCHEDULED`).

---

## 5. Merchant functionality

The provider portal (`apps/api/src/marketplace/provider-portal.controller.ts`) is
a **staff** plane: the API resolves the provider from the signed-in account's
membership through `ProviderUser`, never from the URL, and the routes are gated
by `erp.provider_portal.manage` (Enterprise plan only). No duplicate provider API
was built.

- `lib/merchant-session.tsx` — merchant sign-in through staff `/auth/login`, then
  the provider membership is resolved. A staff account with no provider link is
  refused rather than let into a portal that would reject every call.
- `app/merchant/services.tsx` — live service requests and listings from
  `/provider/requests` and `/provider/listings`, with accept / decline / start /
  complete and listing activate/deactivate. The recovery tab was moved off the
  local demo records onto the same real request queue, filtered by category, so a
  live merchant accepts a real job rather than a local one.
- `app/merchant/products.tsx` — live: the company's real stock items with real
  photographs through the media library.
- `app/merchant/orders.tsx` — live: consumer orders for the provider's own
  company (`/provider/orders`), with a status-machine advance.
- `app/merchant/profile.tsx` — live: provider profile read and update.
- `app/merchant/dashboard.tsx` — live: earnings summary and the request queue.

**Tenant isolation is server-side.** The client sends no provider id, so a
merchant cannot read or act on another provider's work.

---

## 6. Product image management

`apps/api/src/inventory/product-image.service.ts` + routes on
`inventory.controller.ts`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/inventory/products/:productId/images` | list, primary first |
| `POST` | `/inventory/products/:productId/images` | upload and attach |
| `PATCH` | `/inventory/products/:productId/images/:imageId` | promote primary / edit alt text |
| `DELETE` | `/inventory/products/:productId/images/:imageId` | remove, promote the next primary |

Every method resolves the product through the principal's own company
(`ErpContextService.resolveCompanyScope`), so a product id from another tenant is
a 404, not a silent cross-tenant write.

Bytes go through the shared `MediaStorageService.store`, which sniffs the real
magic-byte type (a declared content-type is never trusted), rejects anything that
is not JPEG / PNG / WebP / AVIF, enforces the size ceiling, re-encodes every byte
to drop EXIF and any trailing payload, and derives the storage key from a UUID
plus a content hash so the client never chooses a path.

---

## 7. SENSAGE image upload

`apps/api/src/customer/customer-inspection.*` + migration
`20261030220000_execution_10_customer_inspection_photos`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/inspection-photos` | the caller's own upload history |
| `POST` | `/customer/inspection-photos` | upload a photograph |
| `DELETE` | `/customer/inspection-photos/:id` | remove one you own |

- **Ownership:** `accountId` comes from the verified token and scopes every read
  and write. A `vehicleId` in the body is a *claim* — it is checked against the
  account's own garage before the photo is linked.
- **What is not stored:** there is no analysis result on the row. The app's
  SENSAGE report is a demo, and writing a demo score into a table named as if it
  were a diagnosis would make a placeholder look like a product finding.

The mobile screen `app/sensage/new.tsx` uploads each captured photo immediately
inside a live session, shows progress, reports a failure without losing the local
shot, and lists the history. **Demo analysis is never presented as a real AI
result** — the report is labelled as demo.

---

## 8. The vehicle garage now writes

`app/vehicles/new.tsx` previously validated the form and returned to the garage
without saving. Inside a live session it now posts to `POST /customer/vehicles`
with the exact payload the DTO accepts (`vin`, `make`, `model`, `modelYear`, and
optional `plateNumber`, `color`, `mileage`), then navigates back. The offline
demo keeps its local, clearly-labelled action.

Because the account tab is already mounted underneath, the new car would not
appear without a refetch. `lib/use-reload-on-focus.ts` re-runs the garage and
order loaders when the tab regains focus, so a write made on a pushed screen is
visible on return. The same hook was applied to the address list.

---

## 9. The approved design is preserved

- The Homepage was not redesigned. The dark navy and gold identity, the approved
  black-SUV hero and the card layouts are untouched.
- No random slider images were introduced.
- The photographic Splash keeps a **2000 ms minimum** (`SPLASH_MIN_MS`), timed
  from the photograph's `onLoad`.
- No onboarding or startup screen was added.

---

## 10. Real HTTP test evidence

### `scripts/exec10-smoke.sh` — 31 checks, 31 passing

Run against `node dist/main.js` on the seeded PostgreSQL database.

```
== customer authentication ==
  PASS register (201)          PASS login (200)
  PASS me (200)                PASS login with wrong password refused (401)
  PASS me without token refused (401)  PASS refresh with a bad token refused (401)
  PASS logout (204)
== vehicle garage ==
  PASS create vehicle (201)    PASS list garage (200)
  PASS new vehicle in the garage (True)  PASS vehicle history (200)
  PASS foreign vehicle refused (404)
== bookings ==
  PASS availability (200)      PASS availability returned a slot
  PASS create booking (201)    PASS confirm booking (200)
  PASS booking detail (200)    PASS foreign booking refused (404)
  PASS cancel booking (200)
== consumer order plane ==
  PASS order history / cart / favorites / homepage / catalogue (200)
== media upload ==
  PASS upload a real image (201)   PASS serve the stored bytes (200)
  PASS upload history (200)
  PASS non-image refused despite a lying content-type (400)
  PASS unauthenticated upload refused (401)
== provider portal isolation ==
  PASS provider portal without a token refused (401)
  PASS consumer token on the provider portal refused (401)
```

The double-booking constraint was verified separately with a pinned resource:
the first hold returns **201**, the second hold of the same resource and instant
returns **409 `booking.slot_unavailable`**.

### `apps/api/test/execution10-mobile-integration.e2e-spec.ts`

35 tests covering the booking lifecycle, media upload, the customer inspection
photos and the provider portal, including the merchant that holds the permission
but is not linked to a provider (**403**) and a consumer token on the provider
portal (**401/403**).

### Full suites

```
API e2e:    21 suites, 422 tests   all passing
Shared:      9 files,  180 tests   all passing
Mobile:      6 files,   86 tests   all passing
```

Mobile includes `demo-gating.test.ts`, which walks every screen file and fails if
one reads the demo repository without also reading the session, and
`live-endpoints.test.ts`, which pins the consumer plane and the exact route for
the vehicle-create and merchant-recovery calls.

Typecheck, lint and build pass for the API and the mobile app. The Android export
(`expo export --platform android`) completes.

---

## 11. Security verification

| Property | Verified by |
| --- | --- |
| Consumer token refused on staff routes, staff token refused on consumer routes | e2e, both directions |
| Customer booking read / confirm / cancel scoped by token `accountId` | foreign id → 404 |
| Merchant portal resolves the provider from membership, not the URL | not-linked account → 403 |
| Provider portal licensed to the Enterprise plan only | plan-gated route tests |
| Product images scoped to the principal's company | cross-tenant id → 404 |
| SENSAGE photos scoped to the caller; vehicle claim checked against the garage | cross-account → refused |
| Upload validates true MIME by magic bytes, not the declared type | lying content-type → 400 |
| Upload enforces a size ceiling | oversize → refused |
| Upload re-encodes to strip EXIF / GPS and any trailing payload | `MediaStorageService.store` |
| Storage key is server-derived (UUID + content hash) | client never chooses a path |
| The refresh token is the only long-lived secret; it lives in the keychain | `session-storage.ts` |
| The access token is memory-only and never persisted | `live-session.tsx` |
| A live session never renders a demo record | `demo-gating.test.ts` |

---

## 12. Remaining incomplete work

| Item | State |
| --- | --- |
| **Device visual acceptance** | **Verified in a browser at an Android viewport, not on a device.** This container has no `/dev/kvm`, so no emulator can run; the app was instead rendered by its real Expo web export — the same component tree, theme, API client and live backend — in Chromium at 411×914 @2.6×. Sixteen screens were captured and machine-checked for image decode, RTL and overflow (section 15). The Splash and the design are **not** marked approved on a physical device. |
| SENSAGE AI analysis | No provider is configured, so analysis stays labelled as demo. |
| Merchant promotions screen | The portal exposes no promotions route; the screen states the limitation rather than showing demo offers. |
| Merchant subscription plan screen | Managed by a company administrator on the staff plane; the live screen says so. |
| APK | **Not built.** Per the brief, the flows must form a coherent testable build first. |

Nothing above is presented as complete. Nothing presents demo data as live: a
live session renders live figures without a demo banner, and a demo session
renders the banner on every screen.

---

## 13. Final commit

The Execution 10 feature commits precede this report; the report commit follows
them on `feature/execution-07-premium-web`. PR #7 stays **Draft**; nothing is
merged or deployed.

---

## 14. Continuation session — reschedule, searchable selectors, upload retry

This section records the work completed in a later session on the same branch,
which closed the last gaps Execution 10 left open. It is additive; nothing above
was reverted.

### Customer reschedule (was missing end to end)

A customer could create, confirm and cancel a booking but could not move one.

- **`apps/api/src/customer/booking.service.ts`** — `rescheduleCustomerBooking`.
  It loads the slot scoped to `customerAccountId` (a foreign id is a 404, not a
  leak), refuses a `CANCELLED`/`COMPLETED`/`NO_SHOW` booking with `BOOKING_STATE`,
  re-runs `assertSlotBookable` with `excludeSlotId` so the booking does not
  collide with itself, moves the row to `RESCHEDULED`, clears the hold, appends a
  `RESCHEDULED` event and audits `booking.rescheduled_by_customer`. A unique
  violation on the new time surfaces as `BOOKING_SLOT_UNAVAILABLE` (409).
- **`apps/api/src/customer/booking.controller.ts`** — `POST /customer/bookings/:id/reschedule`
  (and the `/api/bookings/:id/reschedule` alias), reading the account from the
  verified token.
- **`apps/mobile/src/lib/api.ts`** — `bookingsApi.reschedule(id, startsAt, durationMinutes)`.
- **`apps/mobile/src/lib/live-bookings.tsx`** — `reschedule` in the live state.
- **`apps/mobile/src/app/bookings/[id].tsx`** — a reschedule sheet that loads real
  availability for the chosen day and posts the selected engine slot. A 409 is
  shown as `slotUnavailable`, never as a generic failure.

### Searchable selectors and a shared slot label

- **`apps/mobile/src/lib/options.ts`** (new) — `filterOptions`, the pure matcher
  behind a searchable select. It matches case-insensitively on the label, the
  sublabel and the option's `keywords`, so an Arabic term finds an English label
  without switching the app locale. It is unit-tested directly.
- **`apps/mobile/src/components/ui.tsx`** — `Select` gained `searchable`,
  `searchPlaceholder` and `emptyMessage`; the sheet filters as you type and says
  "no results" rather than showing an empty list.
- **`apps/mobile/src/app/vehicles/new.tsx`** and
  **`apps/mobile/src/app/bookings/new.tsx`** — the make, model and year pickers
  and the provider picker are searchable; the wizard also offers a change-provider
  step and a provider directory search.
- **`apps/mobile/src/lib/format.ts`** — `slotLabel(startsAt)`, the UTC `HH:MM`
  label. Four copies of this formatting were collapsed into one, so the wizard,
  the detail screen and the booking card cannot drift apart. It is unit-tested.

### SENSAGE upload failure and retry

- **`apps/mobile/src/app/sensage/new.tsx`** — a shot carries its own
  `uploadState` (`pending` / `failed`). A failed upload no longer reads
  "uploading" forever; it is marked failed and offers a retry that re-sends the
  same photograph. `uploadFailedShort` was added in both locales.

### Evidence in this session

```
API e2e:    25 suites, 481 tests   all passing   (real test DB, migrated + seeded)
Shared:      9 files,  180 tests   all passing
Mobile:      8 files,  117 tests   all passing
Typecheck:   all packages clean
Lint:        all packages clean
Build:       shared, database and api clean; android export completes
```

The reschedule path was also exercised over real HTTP by
`scripts/probe-customer-journey.mjs`, which registers a consumer, books, confirms,
reschedules to a real engine slot and cancels — and shows a second account sees
none of the first account's bookings.

### Still open

- **Android visual acceptance of the Splash and the Homepage is not claimed.** It
  needs a device or emulator screenshot; neither the DOM nor the UI hierarchy is
  evidence.
- **Product photography is not universal.** The seed links the ORYX-AUTO
  catalogue; a tenant created afterwards falls back to bundled category art until
  an administrator uploads an asset.
- **Merchant mobile parity on a device** has not been re-run.

---

## 15. Continuation session — visual acceptance, uploads and a full re-verification

The environment was reset between sessions, so every result below was produced
again from scratch: PostgreSQL 17 installed and seeded, the API built and run,
the mobile web export rebuilt against the live API, and Chromium driven at an
Android phone viewport.

### 15.1 Why a browser and not an emulator

`/dev/kvm` is absent and the CPU exposes neither `vmx` nor `svm`, so the
x86_64 system image cannot boot and an arm64 image cannot run on an x86_64 host
(`Avd's CPU Architecture 'arm64' is not supported by QEMU2`). The next-best
evidence is the real application: `expo export --platform web` compiles the same
React Native component tree, the same theme and the same API client, and
`scripts/capture-exec10-visual.mjs` renders it at 411×914 @2.6× — the Pixel-class
viewport in CSS pixels. This is a browser rendering of the app, **not** a device
capture, and the report says so.

### 15.2 Sixteen screens, machine-checked

`node scripts/capture-exec10-visual.mjs` — result: **16 screens captured, 0
problems**. The script fails on a horizontal overflow, a missing bottom tab bar,
Arabic text that did not resolve to RTL, or an image that decoded to nothing.

| Screen | File | Check |
| --- | --- | --- |
| Splash (AR) | `01-splash.png` | photographic scene painted |
| Homepage (AR) | `02-homepage-ar.png` | 54 images, all decoded; RTL; tabs |
| Homepage (EN) | `02-homepage-en.png` | 54 images, all decoded; tabs |
| Parts catalogue (AR) | `03-catalog.png` | 50 images, all decoded; RTL |
| Services (EN) | `04-services.png` | rendered |
| Customer sign-in | `05-login.png` | live form present |
| After live sign-in | `06-after-login.png` | refresh token stored |
| Booking wizard | `07-booking-new.png` | real slots |
| Booking history | `08-bookings.png` | the seeded booking is listed, live mode |
| Booking detail | `08b-booking-detail.png` | owner's booking |
| Merchant sign-in | `09-merchant-login.png` | staff plane |
| Merchant dashboard | `10-merchant-dashboard.png` | provider name from the session |
| Merchant services | `11-merchant-services.png` | provider's own listings |
| Merchant products | `12-merchant-products.png` | 606-colour render, real data |
| Merchant orders | `13-merchant-orders.png` | provider's own requests |
| Merchant profile | `14-merchant-profile.png` | membership-resolved profile |

Two defects were found and fixed while doing this, both in the harness rather
than the product:

1. **The web export was built against the wrong API base.** `api.ts` reads
   `EXPO_PUBLIC_API_BASE_URL`; the export had been given `EXPO_PUBLIC_API_URL`,
   so the app fell back to `http://localhost:3001/api` and every request was
   blocked as a cross-origin call from `127.0.0.1:8091`. Rebuilding with the
   correct variable made the live sign-in succeed.
2. **The preview origin was not in the CORS allowlist.** The API allowed
   `http://localhost:3000,http://localhost:3002` only, so the preflight for the
   preview host returned no `Access-Control-Allow-Origin`. Running the API with
   the preview origin appended made the preflight a `204`.

Neither is a product defect — a native build calls the API directly and never
issues a preflight — but both would have made the acceptance run look like a
failure.

### 15.3 The locale toggle is not a defect

An earlier session saw an Arabic capture that differed from the English one only
in the status-bar band, which looked like a broken RTL switch. Driving the real
toggle shows the opposite:

```
before:      chip "ع"  arabicTexts 1   rtlTexts 1   stored "en"
after tap 1: chip "EN" arabicTexts 94  rtlTexts 89  stored "ar"
after tap 2: chip "ع"  arabicTexts 1   rtlTexts 1   stored "en"
```

One tap switches to Arabic and 89 of 94 Arabic text nodes compute to
`direction: rtl`; the second tap returns to English. The earlier capture was a
double-tap artefact in the harness, not an app fault.

### 15.4 Real HTTP re-verification

Run against the live API and the migrated, seeded database.

```
Customer journey (scripts + curl)
  register                                  201
  login                                     200  accessToken + refresh + csrf
  me                                        200
  availability (9 days out)                 200  23 real slots
  create booking                            201
  confirm                                   200  CONFIRMED
  history                                   200  1 row
  cancel                                    200  CANCELLED
  bookings without a token                  401

SENSAGE upload (/customer/inspection-photos)
  128×128 PNG, valid                        201  stored as image/webp 128×128 4360 B
  text file declared text/plain             400  media.type_not_allowed
  tiny 1×1 PNG                              400  media.dimensions_invalid
  no bearer token                           401
  history lists it, delete removes it       200 → 0

Ownership isolation
  account B lists account A's photos         0 rows
  account B deletes account A's photo        404
  account A still has its own photo          1 row

Product media (/cms/media, staff plane)
  200×200 PNG as super admin                201  stored as image/webp 200×200
```

### 15.5 Suites, typecheck, lint, build

```
API e2e:     25 suites, 482 tests   all passing   (real test DB, migrated + seeded)
Shared:       9 files,  180 tests   all passing
Mobile:       8 files,  117 tests   all passing
Typecheck:   all packages clean
Lint:        all packages clean
Build:       shared, database, api, admin and customer all clean
React:       19.1.0 / react-dom 19.1.0, aligned across admin, customer,
             mobile and mobile-erp (the hoisted-copy regression stays fixed)
```

### 15.6 Photography audit

`docs/audit/execution-07-media-licenses.json` is the registry. Checked against
the tree:

- 12 entries: 10 shipping photographs and 2 explicitly withdrawn (a branded
  Bentley showroom and a Jaguar showroom, both removed for showing marques ORYX
  does not sell).
- Licences: CC0 ×2, CC BY 4.0 ×2, CC BY-SA 4.0 ×5, CC BY-SA 3.0 ×3. All are
  real, licensed photographs from Wikimedia Commons with a recorded source page,
  licence URL and artist.
- All 13 `PhotoKey` union values resolve to a real bundled image.
- `assets.ts` requires 26 files, all 26 exist, and no file on disk is
  unreferenced — there are no placeholder or orphan images.

### 15.7 Still open

- **Device visual acceptance is not claimed.** The evidence is a browser render
  of the real app; a screenshot from a physical Android device is still needed
  before the Splash and the Homepage are marked approved.
- **Product photography is not universal.** The seed links the ORYX-AUTO
  catalogue; a tenant created afterwards falls back to bundled category art
  until an administrator uploads an asset.
- **Merchant parity on a device** has not been re-run.

---

## 16. Continuation session — raw enum labels in the Arabic RTL UI

### 16.1 The defect

`StatusBadge` printed its `status` prop verbatim. Every caller passed the raw
database enum, so an Arabic-first screen showed `HELD`, `NO_SHOW`, `IN_PROGRESS`
and `INSPECTION` in English. The same class of defect existed in the mobile app:
a screen rendered `{booking.status}` straight into a `<Badge>`.

This is a presentation defect, not a data defect. The API contract is correct and
was not changed.

### 16.2 The customer fix

- `apps/customer/src/i18n/dictionaries.ts` — added a `status.*` block for both
  locales (52 statuses) and the booking-type labels. Both dictionaries now hold
  **486 keys** and stay in step.
- `apps/customer/src/components/ui.tsx` — `StatusBadge` resolves its label
  through the dictionary via `useUi()`, and falls back to the raw status only
  when no key exists. Exported `bookingTypeLabel`.
- `apps/customer/src/app/(account)/bookings/page.tsx` and
  `.../dashboard/page.tsx` — render `bookingTypeLabel(booking.bookingType)`
  instead of the enum.
- `apps/customer/src/app/(account)/rfqs/page.tsx` — the category field asked for
  `services.category`, which did not exist, so it rendered the literal key. Added
  `rfq.category` to both locales and pointed the page at it. This was a second,
  independent leak of the same kind.

### 16.3 The mobile fix

`apps/mobile/src/lib/i18n.ts` gained a `statusLabel(locale, status)` helper and a
status dictionary. Twelve screens were repointed: `cards.tsx`,
`app/rfqs/[id].tsx`, `app/rfqs/index.tsx`, `app/wallet.tsx`,
`app/merchant/dashboard.tsx`, `app/merchant/services.tsx`,
`app/merchant/profile.tsx`, `app/returns/[id].tsx`, `app/returns/index.tsx`,
`app/bookings/[id].tsx`, `app/recovery/[id].tsx` and `app/orders/[id].tsx`.

An unknown status degrades to a readable word (`BRAND_NEW_STATE` →
`brand new state`), never to an empty string or a raw enum.

### 16.4 Regression tests

- `apps/customer/test/i18n-status.test.ts` — **49 tests**. Asserts that both
  locales hold the same key set, that every `t()` key in the source tree exists,
  and that each status resolves to a different word per locale.
- `apps/mobile/test/lib.test.ts` — **51 new tests** (139 → 194). Asserts every
  status localises in both locales, that the two locales differ, that an unknown
  status degrades, and — by reading the source tree — that no live screen still
  renders one of the raw shapes the defect took (`text={order.status}`,
  `text={booking.status}`, and so on).
- `apps/customer/package.json` gained `vitest` and a `test` script; the customer
  app previously had no unit-test runner.

### 16.5 Evidence re-verified in this session

```
Customer guard:  node .run/check-customer-i18n.mjs
                 ar keys=486 en keys=486 used=376 — OK, both locales in step
Customer:         1 file,   49 tests   all passing
Mobile:           9 files, 194 tests   all passing
Shared:           9 files, 182 tests   all passing
API e2e:         28 suites, 548 tests  all passing  (real DB, seeded)
Admin Playwright: 199 passed, 1 skipped (200 tests, real API + real admin)
Typecheck:       customer, mobile — clean
Lint:            customer, mobile — clean
Build:           customer — clean
React:           19.1.0 / react-dom 19.1.0 unchanged across all four apps
```

Browser check on `http://localhost:3002/bookings`, signed in as the Visual QA
customer: Arabic renders `فحص` and `قيد الحجز`; switching to English renders
`Inspection` and `Held`. `/dashboard` renders `Inspection` / `Held` and no raw
enum. `/orders` renders its empty state with no leakage.

### 16.6 Environment notes (not code regressions)

The sandbox recycled mid-session and removed three runtime dependencies while
leaving the workspace intact. All three were restored, and the results above are
from after restoration:

- PostgreSQL 17 server package was reinstalled and the seeded cluster under
  `.run/pgdata` was restarted; the seed survived (127 companies, 32 users, 25
  customer accounts).
- The API was restarted with the documented relaxed throttles
  (`AUTH_THROTTLE_LIMIT` / `THROTTLE_LIMIT` / `REFRESH_THROTTLE_LIMIT`), because
  the Playwright suite rotates sessions heavily and the default ceilings return
  429.
- Playwright's chromium headless shell was reinstalled
  (`playwright install chromium`); its absence produced 200 tests failing in
  3 ms with `Executable doesn't exist`, which is a missing browser, not a code
  failure.

`pnpm --filter @oryx/api test` reports "No tests found": `apps/api/jest.config.js`
ignores `/test/`, and every API test is an `.e2e-spec.ts`. That is the
pre-existing configuration from Execution 01, not a regression.

### 16.7 Final commit

`a161a49` — *fix(i18n): localise raw enum status labels across customer and
mobile* — is the commit that carries the code and tests in this section. The
commit that records this report follows it and changes documentation only.

### 16.8 Still open

- **Device visual acceptance is still not claimed.** A browser render is not a
  physical Android device; the Splash and Homepage remain unapproved on device.
- **No APK was published**, per the instruction not to ship one until the
  integrated functionality is ready for a coherent testing release.

## 17. Continuation session — KPI density, admin→public data flow and a broken-image defect

This session resumed the governing instruction *"Website, Admin Dashboard &
Visual Verification"*. It implemented directly in the existing code, produced
before/after evidence, proved the admin→public data flow with real database
rows, and ran the full technical verification.

### 17.1 Admin KPI density

The platform dashboard and the ERP module headers rendered oversized KPI cards
and module tiles: nine 193px tiles in a single row at 1920px, one full-width
tile at 375px, and 85px-tall statistic cards.

`apps/admin/src/app/globals.css`:

| Rule | Before | After |
| --- | --- | --- |
| `.oryx-stat-card` | `min-height: 58px`, `padding: 10px 12px`, `border-radius: 12px` | `min-height: 46px`, `padding: 6px 9px`, `border-radius: 10px` |
| `.oryx-stat-card__icon` | `28×28px` | `22×22px` |
| `.oryx-stat-card__label` | `10.5px`, `0.06em` | `9.5px`, `0.05em` |
| `.oryx-stat-card__value` | `17px` | `15px` |
| `.oryx-stat-grid` | `repeat(auto-fit, minmax(168px, 1fr))` | `repeat(4, minmax(0, 1fr))` |
| `.oryx-stat-grid--wide` | `repeat(auto-fit, minmax(210px, 1fr))` | `repeat(4, minmax(0, 1fr))` |
| `@media (max-width: 1024px)` | — | three columns |
| `@media (max-width: 640px)` | — | two columns |
| `.oryx-tile` | `min-height: 178px`, `border-radius: 16px` | `min-height: 142px`, `border-radius: 14px` |
| `.oryx-tile__body` | `min-height: 178px`, `padding: 17px` | `min-height: 142px`, `padding: 13px` |
| `.oryx-tile__icon` | `38×38px` | `32×32px` |

`apps/admin/src/app/(app)/dashboard/page.tsx`: the module tile grid became
`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 [&>*]:min-w-0`, and the
loading skeleton dropped from 186px to 142px so it matches the tile it stands in
for.

Measured in the running application (Chromium, `getComputedStyle` and
`getBoundingClientRect`):

| Context | Viewport | Columns | Card width | Card height |
| --- | --- | --- | --- | --- |
| Overview KPIs | 1920 | 4 | 398px | 72px |
| Overview KPIs | 1440 | 4 | 278px | 72px |
| Overview KPIs | 1280 | 4 | 238px | 72px |
| Overview KPIs | 1024 | 3 | 247px | 72px |
| Overview KPIs | 768 | 3 | 240px | 72px |
| Overview KPIs | 430 | 2 | 195px | 72px |
| Overview KPIs | 390 | 2 | 175px | 72px |
| Overview KPIs | 375 | 2 | 168px | 72px |
| CRM / HR / Reports / Operations KPIs | 1440 | 4 | 270px | 54px |

The count is now capped at four and reduced to three, then two, as the viewport
narrows; the tile itself is never compressed below the width that fits an Arabic
metric label. The tall cards (72px) are the overview tiles that carry a
secondary line; the ERP module cards (54px) carry one metric.

A page that renders no KPI grid is not a defect: `/crm`, `/hr`, `/reports` and
`/accounting` require a tenant company, and a platform principal has **no tenant
scope** by design (see `docs/architecture/PERMISSION_MATRIX.md`). Signed in as
`admin@oryx-auto.local` (Enterprise company administrator) every one of those
pages renders its grid, which is what the table above records.

### 17.2 The broken-image defect — the API serves origin-relative media

The defect audit found 404s on the customer catalogue:

```
/products  404 http://localhost:3002/api/v1/cms/media/<id>/file?variant=card
/categories 404 http://localhost:3002/api/v1/cms/media/<id>/file?variant=card
```

The API returns media as `/api/v1/cms/media/<id>/file` — a path relative to the
**API** origin. The product, category, favourite and product-detail screens put
that string straight into `<img src>` / `background-image`. Because the customer
site is served from its own origin (port 3002), the browser asked the *website*
for an API route and got a 404. The page still rendered, so the regression was
invisible to a structural check: the photograph simply disappeared.

Confirmed directly:

```
$ curl -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/cms/media/<id>/file?variant=card
200   # image/webp, 77,612 bytes

$ curl -o /dev/null -w '%{http_code}' http://localhost:3002/api/v1/cms/media/<id>/file?variant=card
404   # text/html — the Next.js 404 page
```

The same defect existed in the admin product-image modal
(`apps/admin/src/app/(app)/inventory/page.tsx`), which also rendered the raw
relative path.

**The fix.** One resolver per app, so the rule lives in exactly one place:

- `apps/customer/src/lib/api.ts` — added `resolveImage(path)`. An absolute URL is
  returned unchanged; a path beginning `/api/` is prefixed with the API origin;
  anything else is a bundled site asset and keeps the base-path prefix that
  `assetUrl` applies.
- `apps/admin/src/lib/api.ts` — added `api.resolveImage(path)` with the same rule.

Applied at every render site:

| File | Site |
| --- | --- |
| `apps/customer/src/app/products/page.tsx` | product card image |
| `apps/customer/src/app/products/[id]/page.tsx` | gallery and related items |
| `apps/customer/src/app/categories/page.tsx` | category tile art |
| `apps/customer/src/app/(account)/favorites/page.tsx` | favourite card image |
| `apps/customer/src/app/page.tsx` | homepage hero banner path |
| `apps/admin/src/app/(app)/inventory/page.tsx` | product-image modal thumbnail |

Verified after the fix, in the browser:

```
/products   img srcs: [… "http://localhost:3001/api/v1/cms/media/<id>/file?variant=card" …]
/categories backgrounds: ["url(\"http://localhost:3001/api/v1/cms/media/<id>/file?variant=card\")" …]
```

and the defect audit reports `broken=0` on every page:

| Page | Images | Broken | Horizontal overflow |
| --- | --- | --- | --- |
| `/` | 4 | 0 | 0 |
| `/categories` | 4 | 0 | 0 |
| `/products` | 8 | 0 | 0 |
| `/services` | 4 | 0 | 0 |
| `/providers` | 4 | 0 | 0 |
| `/about` | 4 | 0 | 0 |
| `/contact` | 4 | 0 | 0 |
| `/products` (390px) | 8 | 0 | 0 |

Admin product-image modal, after the fix:

```
product images: [{"src":"http://localhost:3001/api/v1/cms/media/<id>/file?variant=card","ok":true}]
```

The remaining 401 on `/customer/auth/refresh` is the guest session probe: a
visitor with no refresh cookie is correctly refused, and the protected account
pages redirect to `/login`. It is not an error.

A regression test guards the rule —
`apps/customer/test/media-url.test.ts` (4 tests) asserts that an API media path
goes to the API origin, that a bundled asset stays relative, that an absolute URL
passes through, and that an absent image returns `null`.

### 17.3 Admin → public data flow, with real database rows

The customer website reads the same database the admin edits. Evidence:

- `GET /api/v1/customer/catalog/categories` returns real `Category` rows with
  real `mediaAssetId` values; the resolver turns each into a live
  `cms/media/...` URL that returns `200 image/webp`.
- `GET /api/v1/customer/catalog/providers` returns real `MarketplaceProvider`
  rows (for example `Al Noor Parts`, `ORYX-HOLDING-P3`).
- A suspend mutation without a company context returns **403**, which is the
  correct authorization result, not a defect: a platform principal cannot mutate
  tenant data outside a support session.
- A QA customer was created through the real endpoint
  (`POST /api/v1/customer/auth/register`), which returned a real access token and
  set the refresh cookie. The account then signed in and reached `/dashboard`
  with the ten expected account routes.

### 17.4 Technical verification

| Check | Command | Result |
| --- | --- | --- |
| API integration | `pnpm --filter @oryx/api test:e2e` | **28 suites, 548 tests passed** |
| Customer unit | `pnpm --filter @oryx/customer test` | **53 tests passed** (49 + 4 new) |
| Mobile unit | `pnpm --filter @oryx/mobile test` | **194 tests passed** |
| Shared unit | `pnpm --filter @oryx/shared test` | **182 tests passed** |
| Admin browser | `pnpm --filter @oryx/admin test:ui` | **199 passed, 1 skipped** |
| Admin typecheck | `pnpm --filter @oryx/admin typecheck` | pass |
| Admin lint | `pnpm --filter @oryx/admin lint` | pass |
| Customer typecheck | `pnpm --filter @oryx/customer typecheck` | pass |
| Customer lint | `pnpm --filter @oryx/customer lint` | pass |
| Mobile typecheck | `pnpm --filter @oryx/mobile typecheck` | pass |
| Mobile lint | `pnpm --filter @oryx/mobile lint` | pass |
| API build | `pnpm --filter @oryx/api build` | pass |
| Admin build | `pnpm --filter @oryx/admin build` | pass |
| Customer build | `pnpm --filter @oryx/customer build` | pass |

The API suite ran against the seeded PostgreSQL database
(`oryx_dev` at `127.0.0.1:5432`) with the documented relaxed throttles. A test
database that is unseeded reports connection and fixture errors, which are not
code regressions; none were seen here.

### 17.5 React version regression

`react` and `react-dom` are `19.1.0` in `apps/admin`, `apps/customer` and
`apps/mobile`, and the hoisted root resolves to `19.1.0`. All three builds
prerender without the `Cannot read properties of null (reading 'useRef')`
failure the hoisting rule warns about.

### 17.6 Security verification

- **No new surface.** The change is presentation-only: a URL is rewritten before
  it reaches an `<img>`. No endpoint, DTO or query was added.
- **Media access rules unchanged.** `GET /cms/media/:id/file` still applies its
  own access rules; the resolver only changes which origin the browser asks, not
  what the API will serve. An unauthenticated request still returns what the
  endpoint decides.
- **No credential is exposed.** The resolver returns a URL; it never reads a
  token, and the customer session cookie stays scoped to `/api/v1/customer` on
  the API origin.
- **Guest isolation holds.** Protected customer pages redirect to `/login` when
  the refresh probe returns 401; no tenant data is served to a guest.
- **No secret was committed.** The QA account password lives in an ignored
  scratch file (`.run/qa-customer-creds.txt`); `qa/` scratch captures are now
  ignored, and only curated evidence under `docs/audit/` is tracked.

### 17.7 Evidence

Committed under `docs/audit/exec10/screenshots/`:

| File | What it shows |
| --- | --- |
| `17-customer-products-images-after.png` | catalogue with uploaded photographs, 0 broken |
| `18-customer-categories-images-after.png` | category tiles with CMS art, 0 broken |
| `19-admin-inventory-images-after.png` | admin product-image modal, thumbnail decoded |
| `20-admin-crm-kpi-after.png` | compact KPI band, 4 columns |
| `21-admin-overview-kpi-after.png` | compact module tiles and KPI band |

Before/after pairs for the KPI density change remain in the local QA capture set
and are described by the measurements in §17.1.

### 17.8 Final commit

`994b9a1` — *fix(web): resolve API media on its own origin and compact the admin
KPIs* — carries the code, the regression test and the evidence in this section.
The commit that records this report changes documentation only.

### 17.9 Still open

- **Android visual acceptance of Splash and Homepage is still not claimed.** A
  browser render is not a physical device; the report does not present one as
  the other.
- **No APK was published**, per the instruction not to ship one until the
  integrated functionality is ready for a coherent testing release.
- **PR #7 remains open and Draft.** Nothing was merged or deployed.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*

---

## 18. Continuation session — the interactive vehicle inspection engine (Execution Phase 2)

This section records the work done in this session. It does not repeat the
Execution 09 or earlier Execution 10 work; it adds the structured vehicle
inspection engine, its admin workspace and its test evidence.

### 18.1 What was added

The previous "automotive inspections" feature was a booking plus a free-text
findings blob and a single approved/unapproved report flag. It could record that
an inspection happened and that someone approved it, but it could not record
*what was inspected*: there was no per-item result, no body-panel diagram, no
chassis map, no fault-code list, and no way to prove a section had been assessed
rather than skipped.

Execution Phase 2 replaces that with a structured engine:

- **Seven selectable inspection areas** — Paint & Body, Chassis & Undercarriage,
  Interior, Exterior, Engine Compartment, Road Test, Computer Unit — declared
  once in `packages/shared/src/inspection.ts`.
- **A per-item checklist** for the four list-driven sections, with the result set
  the section allows (`PASS_FAIL` or `PASS_FAIL_NA`). The catalogue carries the
  report's own item counts: Interior 12, Exterior 6, Engine Compartment 13, Road
  Test 13.
- **Two interactive diagrams.** A side-elevation body diagram with four paint
  conditions (paint / filler / change / sectioned) stored as normalised
  coordinates, and a top-view chassis diagram with eight assessed regions.
- **A computer-unit diagnostic list** — module, fault code, description,
  observation, severity — added and removed one record at a time.
- **An explicit "nothing to report"** flag for the diagram and diagnostic
  sections, so an inspector can assert a clean result deliberately rather than by
  leaving a section blank.
- **Photographic attachments** through the existing `MediaStorageService`.
- **A submit / review / approve workflow** with server-enforced state
  transitions and a server-enforced completeness gate.

### 18.2 Files changed

**New — shared contract**

| File | Purpose |
| --- | --- |
| `packages/shared/src/inspection.ts` | The section catalogue, item specs, result sets, paint conditions, chassis regions and the state helpers. The single source of truth for the API and the interface. |
| `packages/shared/test/inspection.test.ts` | 9 tests asserting the catalogue's item counts, the section keys, the result sets and the state helpers. |

**New — API**

| File | Purpose |
| --- | --- |
| `apps/api/src/automotive/inspection.dto.ts` | Validated request bodies for every write. |
| `apps/api/src/automotive/inspection.service.ts` | The engine: creation, section writes, diagrams, diagnostics, attachments, progress, submit, review, cancel. |
| `apps/api/src/automotive/inspection.controller.ts` | 16 routes under `/api/v1/automotive/inspections`. |

**New — admin interface**

| File | Purpose |
| --- | --- |
| `apps/admin/src/app/(app)/automotive/inspections/[id]/page.tsx` | The workspace: identity card, progress rail, section editors, attachments panel and workflow panel. |
| `apps/admin/src/components/inspection/diagrams.tsx` | The body diagram and the chassis diagram. |

**New — database**

| File | Purpose |
| --- | --- |
| `packages/database/prisma/migrations/20261104002318_execution_phase2_inspection_engine/` | The inspection tables. |
| `packages/database/prisma/migrations/20261104002429_inspection_section_no_findings/` | Adds `InspectionSectionResult.noFindings`. |

**New — tests**

| File | Purpose |
| --- | --- |
| `apps/api/test/execution-phase2-inspection.e2e-spec.ts` | 36 API integration tests over real HTTP. |
| `apps/admin/e2e/execution-phase2-inspection.spec.ts` | 8 browser tests driving the real interface against the real API. |

**Modified**

| File | Change |
| --- | --- |
| `packages/database/prisma/schema.prisma` | Nine inspection tables and their enums. |
| `packages/shared/src/contracts.ts` | The inspection DTOs, including `InspectionSectionDto.noFindings` and `InspectionSessionDto.odometer`. |
| `packages/shared/src/index.ts` | Re-exports the inspection catalogue. |
| `apps/api/src/automotive/automotive.module.ts` | Registers the controller and service. |
| `apps/api/src/common/document-sequence.service.ts` | Adds the `JOB` sequence for the inspection job number. |
| `apps/api/src/sales/sales.dto.ts`, `apps/api/src/sales/sales.service.ts` | Customer names become independently optional (see §18.6). |
| `apps/admin/src/app/(app)/automotive/inspections/page.tsx` | A fourth tab, "Inspection jobs", and the job-creation modal. |
| `apps/admin/src/lib/api.ts` | 15 inspection client methods. |
| `apps/admin/src/i18n/dictionaries.ts` | The inspection keys, English and Arabic. |
| `apps/admin/src/app/globals.css` | The inspection workspace styles. |

### 18.3 Backend endpoints

All under `/api/v1/automotive/inspections`, all requiring the
`automotive_inspections` module and a tenant-scoped principal.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/` | `erp.inspection.read` | List jobs, paginated and searchable. |
| POST | `/` | `erp.inspection.write` | Create a job for a customer's vehicle and a set of areas. |
| GET | `/:id` | `erp.inspection.read` | The full workspace payload. |
| PATCH | `/:id` | `erp.inspection.write` | Update the header fields. |
| GET | `/:id/progress` | `erp.inspection.read` | Completion state per section and overall. |
| PUT | `/:id/sections/:area` | `erp.inspection.write` | Replace a checklist section's results. |
| PUT | `/:id/paint-markers` | `erp.inspection.write` | Replace the body-diagram marker set. |
| PUT | `/:id/chassis-regions` | `erp.inspection.write` | Replace the chassis region assessments. |
| POST | `/:id/diagnostics` | `erp.inspection.write` | Add a computer-unit fault record. |
| DELETE | `/:id/diagnostics/:entryId` | `erp.inspection.write` | Remove one. |
| POST | `/:id/attachments` | `erp.inspection.write` | Upload a photograph through the media pipeline. |
| DELETE | `/:id/attachments/:attachmentId` | `erp.inspection.write` | Remove one. |
| POST | `/:id/submit` | `erp.inspection.write` | Submit for review. |
| POST | `/:id/review` | `erp.inspection.report.approve` | Approve or return for correction. |
| POST | `/:id/cancel` | `erp.inspection.write` | Cancel a draft. |

### 18.4 Server-enforced rules

These are the invariants the tests exist to protect. Each is enforced in the
service, not in the interface.

1. **Only the selected areas exist.** Creating a job with no area, or with an
   unknown area, is rejected. Writing to an area that was not selected is
   rejected. This is what keeps a paint-only job from asking about the engine.
2. **A section only accepts its own items and its own result set.** An item key
   from another section is rejected; `N/A` is rejected on a `PASS_FAIL` section.
3. **The vehicle must belong to the customer.** Creating a job against another
   customer's vehicle is rejected.
4. **Submission requires completeness.** Every item in every selected area must
   carry a result. A diagram section must carry at least one marker or an explicit
   "nothing to report". A diagnostic section must carry at least one fault or an
   explicit "nothing to report".
5. **An approved inspection is frozen.** Section writes and cancellation return
   `409` once approved.
6. **Approval needs its own permission.** An inspector with
   `erp.inspection.write` but not `erp.inspection.report.approve` is refused with
   `403`.
7. **Tenant isolation.** Another tenant's inspection reads as `404`, and a write
   against it is refused.
8. **Coordinates are bounded.** A marker outside the diagram is rejected by
   validation rather than silently clamped, so a bad client cannot store a marker
   that the report cannot draw.

### 18.5 Real HTTP test results

**API integration** — `apps/api/test/execution-phase2-inspection.e2e-spec.ts`,
36 tests, all passing, against a seeded PostgreSQL database over real HTTP with
the real guards, the real Prisma client and the real media pipeline:

| Group | Tests | Result |
| --- | --- | --- |
| creation and tenancy | 6 | 6 passed |
| selected sections only | 4 | 4 passed |
| progress and submission gating | 6 | 6 passed |
| body diagram markers | 4 | 4 passed |
| chassis regions | 2 | 2 passed |
| computer-unit diagnostics | 2 | 2 passed |
| attachments | 4 | 4 passed |
| approval workflow | 6 | 6 passed |
| customer name optionality | 2 | 2 passed |

The attachment tests upload a real 96×96 PNG through a multipart request and
assert the stored asset: the media service sniffs the type, decodes it with
`sharp`, re-encodes it to WebP to strip EXIF, and the test asserts the normalised
`image/webp` type and the `/api/v1/cms/media/…/file` route rather than the
upload's own content type.

**Full API regression** — 29 suites, **584 tests, all passing**. The suite count
grew from 28 to 29 and the test count from 548 to 584 with this work.

**Browser** — `apps/admin/e2e/execution-phase2-inspection.spec.ts`, 8 tests, all
passing, driving the real interface against the real API:

| Test | What it proves |
| --- | --- |
| creates a job from the list page and opens its workspace | The job is created through the interface, gets a `JOB-` number, and only the selected sections appear on the rail. |
| records a checklist section and reports its progress | Answering every item flips the rail to complete and enables submit. |
| refuses to submit a section that is only partly answered | A partially answered section keeps submit disabled. |
| places a body-panel marker on the paint diagram and saves it | A marker is placed by pointer, saved, and unlocks submit. |
| assesses the chassis regions on the safety diagram | Region assessment unlocks submit. |
| records a computer-unit fault and can remove it again | A fault is added and removed through the interface. |
| approves a submitted inspection and then freezes it | Approval succeeds and the checklist becomes read-only. |
| renders the workspace in Arabic with RTL direction | The Arabic labels come from the shared catalogue and the layout is RTL. |

**Full browser regression** — 208 tests, **207 passed, 1 skipped**. The suite
grew from 200 to 208 with this work.

**Shared package** — 10 files, **191 tests, all passing**, including the 9 new
inspection-catalogue tests.

### 18.6 A customer may be known by one name only

While building the job-creation interface, the customer-name requirement was
found to be a real obstacle: `CreateCustomerDto` required both `nameEn` and
`nameAr` with a minimum length of two, so an administrator who knows a customer
only in Arabic had to invent an English name to save them at all.

Both names are now independently optional, with at least one required — enforced
in the service, because a class-validator rule cannot express "one of these two".
A missing name is stored as an empty string rather than `null`, so the many
existing reads of `nameEn`/`nameAr` across sales, accounting and reports do not
have to handle a null, and the interface falls back to whichever name exists. The
audit summary falls back the same way.

### 18.7 Security verification

- **Authorization is server-side.** Every route carries `@RequireModule` and
  `@RequirePermissions`; the interface hiding a control is not the control. The
  test "refuses a reader without the write permission" and the test "refuses
  approval from an inspector without the approval permission" prove the
  distinction between write and approve.
- **Tenant isolation is enforced on read and write.** The service resolves the
  company scope from the principal and filters every query by it; another
  tenant's job returns `404` rather than leaking its existence.
- **Uploads are validated, not trusted.** The file type is sniffed from the
  bytes, the image is decoded to prove it is not truncated, a minimum dimension is
  enforced, the storage key is derived from a UUID rather than a client-supplied
  path, and EXIF is stripped by re-encoding.
- **No credential or token appears in the inspection payloads.** Attachments
  return a media route and a caption, never a storage path.
- **The lockout on a seeded account was an environment artefact**, not a defect:
  earlier failed sign-ins with a shell-quoted password variable locked the account
  for the configured cool-down. It was cleared, the run repeated, and the suite
  passed. This is recorded so a future reader does not mistake it for an
  authentication regression.

### 18.8 Verification summary

| Gate | Command | Result |
| --- | --- | --- |
| API integration | `jest --config jest-e2e.config.js --runInBand` | 29 suites, 584 passed |
| New API suite | `jest … test/execution-phase2-inspection.e2e-spec.ts` | 36 passed |
| Browser | `playwright test --project=desktop-dark` | 207 passed, 1 skipped |
| New browser suite | `playwright test e2e/execution-phase2-inspection.spec.ts` | 8 passed |
| Shared | `vitest run` | 191 passed |
| Mobile | `vitest run` | 194 passed |
| Typecheck | `tsc --noEmit` in api, admin, customer, mobile | 4 × exit 0 |
| Lint | `eslint . --max-warnings=0` in admin, customer, mobile | 3 × exit 0 |
| Build | `next build` in admin | exit 0, `/automotive/inspections/[id]` present |
| React pin | mobile `lib.test.ts` | react and react-dom both `19.1.0` |

### 18.9 Final commit

`32b03ca` — *feat(automotive): add the structured vehicle inspection engine* —
carries the engine, the workspace, the migrations and both new suites. The
commit that records this section changes documentation only.

### 18.10 Still open

- **Android visual acceptance of Splash and Homepage is still not claimed.** The
  browser suite drives a desktop Chromium render; a browser render is not a
  physical device and this report does not present one as the other.
- **The Execution 10 mobile work is unchanged by this section.** The customer
  authentication, booking, merchant and media work described in §1–§17 remains as
  reported there; this section adds the inspection engine only.
- **No APK was published**, per the standing instruction.
- **PR #7 remains open and Draft.** Nothing was merged and nothing was deployed.

---

## 19. Continuation session — official documents, PDF printing and QR verification (Execution Phase 3)

This section records the work done in this session. It does not repeat the
inspection engine of §18; it adds the document that an approved record produces,
the register that lists it, the printed PDF and the public verification page.

### 19.1 What was added

An approved inspection had no output. An administrator could see that a job was
approved, but could not hand the customer a document, and there was nothing a
customer could scan to check that a paper report was genuine. Financial records
had the same gap: a stored invoice could be viewed on screen but not printed as
an official page.

Execution Phase 3 closes that gap:

1. **A document is issued from a source record.** The register refuses a
   free-form document. An inspection report can only be issued for an
   `APPROVED` session, and a financial document only from a stored invoice,
   order or quotation — so a PDF can never carry figures that no row backs.
2. **The PDF is really rendered.** A headless Chromium pass draws a
   self-contained HTML template with the Noto Naskh Arabic and Noto Sans faces
   embedded, so an Arabic report is not tofu. The bytes are re-encoded and
   stored through the existing media pipeline.
3. **The stored copy is served through an authorised route only**, inline with
   `private, no-store`. A revoked document must not keep showing as valid from a
   cache.
4. **Every document carries a verification token.** `GET /documents/verify/:token`
   is public and returns a projection with no amount and no contact detail; the
   customer site renders it at `/verify`. A scan reports valid, withdrawn,
   superseded or unknown — and a withdrawn document is reported *as withdrawn*,
   never as absent, so a scan never accuses a genuine document of being fake.
5. **Withdrawal is audited and terminal.** A reason is required, a withdrawn
   document stays in the register, and the public page changes outcome
   immediately.

### 19.2 Files changed

**New — shared contract**

| File | Purpose |
| --- | --- |
| `packages/shared/src/documents.ts` | The document catalogue, the report composition planner, the stored and public status vocabularies and the helpers that keep them apart. |
| `packages/shared/test/documents.test.ts` | 24 tests: catalogue shape, pagination over the section catalogue, the two status vocabularies, VIN masking and the absence of financial fields in the public projection. |

**New — API**

| File | Purpose |
| --- | --- |
| `apps/api/src/documents/documents.module.ts` | Registers the controller, the service, storage, fonts, renderer and QR. |
| `apps/api/src/documents/documents.controller.ts` | 8 routes under `/api/v1/documents`. |
| `apps/api/src/documents/documents.service.ts` | Issuing, listing, reading, downloading and withdrawing; the tenant and source checks. |
| `apps/api/src/documents/document-payload.ts` | Builds the render payload from stored rows — the only place a figure reaches a PDF. |
| `apps/api/src/documents/documents.dto.ts` | Validated request bodies. |
| `apps/api/src/documents/document-storage.service.ts` | Stores and reads the rendered bytes under `DOCUMENT_STORAGE_ROOT`. |
| `apps/api/src/documents/pdf/pdf-renderer.service.ts` | The headless-Chromium pass and the page count. |
| `apps/api/src/documents/pdf/document-fonts.service.ts` | Embeds the four Noto faces. |
| `apps/api/src/documents/pdf/qr.service.ts` | Renders the verification QR. |
| `apps/api/src/documents/templates/*.ts` | The chrome, the inspection-report template and the financial-document template. |
| `apps/api/assets/fonts/*.ttf` | The embedded Arabic and Latin faces. |

**New — admin interface**

| File | Purpose |
| --- | --- |
| `apps/admin/src/components/documents-panel.tsx` | The register: list, open, copy the verification link, withdraw with a reason. |
| `apps/admin/src/app/(app)/documents/page.tsx` | The document register, reached from the sidebar. |

**New — customer site**

| File | Purpose |
| --- | --- |
| `apps/customer/src/app/verify/[[...token]]/page.tsx` | The public verification page. Works with no session. |

**New — database**

| File | Purpose |
| --- | --- |
| `packages/database/prisma/migrations/20261104162028_execution_phase3_official_documents/` | `OfficialDocument`, `OfficialDocumentEvent` and the `OfficialDocumentStatus` enum. |

**New — tests**

| File | Purpose |
| --- | --- |
| `apps/api/test/execution-phase3-documents.e2e-spec.ts` | 22 API integration tests over real HTTP. |
| `apps/admin/e2e/execution-phase3-documents.spec.ts` | 6 browser tests driving the real interface against the real API. |

**Modified**

| File | Change |
| --- | --- |
| `packages/database/prisma/schema.prisma` | The document tables and the status enum. |
| `packages/shared/src/index.ts` | Re-exports the document specification. |
| `apps/api/src/app.module.ts` | Registers `DocumentsModule`. |
| `apps/api/test/test-app.ts` | `cleanupFixtures` deletes document rows before their company. |
| `apps/admin/src/lib/api.ts` | The document client methods and the `OfficialDocumentDto` type, which now uses the shared `OfficialDocumentStatus` rather than an inline union. |
| `apps/admin/src/lib/navigation.ts` | The register route. |
| `apps/admin/src/app/(app)/automotive/inspections/[id]/page.tsx` | The register and the issue action on an approved job; a locked notice otherwise. |
| `apps/admin/src/i18n/dictionaries.ts` | The document keys, English and Arabic. |
| `apps/customer/src/lib/api.ts` | `verifyDocument`, the public call. |
| `apps/customer/src/i18n/dictionaries.ts` | The verification page keys, English and Arabic. |
| `apps/customer/test/i18n-status.test.ts` | A guard that the four verification outcomes read distinctly in both locales. |
| `.gitignore` | Generated PDFs and uploaded media are runtime data, not source. |

### 19.3 Backend endpoints

All under `/api/v1/documents`.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/verify/:token` | **public** | The verification projection. No amount, no contact detail. |
| `GET` | `/catalogue` | `erp.dashboard.read` | The issuable document types and their bilingual titles. |
| `POST` | `/issue` | any of `erp.sales.read`, `erp.purchasing.read`, `erp.accounting.read`, `erp.inspection.read` | Issue a financial document from a source record. |
| `POST` | `/inspections/:sessionId/issue` | `erp.inspection.read` + module `automotive_inspections` | Issue the report for an `APPROVED` inspection. |
| `GET` | `?sourceType=&sourceId=` | any of the four read permissions | The register for one source record. |
| `GET` | `/:id` | any of the four | One document with its append-only event trail. |
| `GET` | `/:id/file` | any of the four | The stored PDF, inline, `private, no-store`. |
| `POST` | `/:id/revoke` | any of the four | Withdraw a document; a reason is required. |

### 19.4 Server-enforced rules

Each of these is covered by an integration test, not only by the interface.

- A report cannot be issued for a session that is not `APPROVED`.
- A financial document can only be issued from a stored source record; a
  nonexistent id is a 400, not an empty document.
- Another tenant's document reads as 404, and another tenant's register for the
  same source id is empty. Tenant isolation is the `companyId` on the row.
- The public verification projection carries no amount and no contact detail —
  asserted as an exact key set, so a field added later fails the test.
- A withdrawn document verifies as `REVOKED`, not as "not found".
- `GET /:id/file` sets `Cache-Control: private, no-store`.
- The register and the public page use different status vocabularies, and the
  types and the tests keep them apart.

### 19.5 Real HTTP test results

A live driver (`22/22`) exercised the running API over real HTTP against the
seeded database: login, issue, list, read, download, verify anonymously, verify
as withdrawn, and the cross-tenant refusals. The Playwright suite then drove the
same paths through the browser.

| Check | Result |
| --- | --- |
| API integration — `test/execution-phase3-documents.e2e-spec.ts` | 22 passed |
| API integration — whole suite | 30 suites, 606 passed |
| Browser — `e2e/execution-phase3-documents.spec.ts` | 6 passed |
| Browser — whole suite | 213 passed, 1 skipped |
| Shared — `vitest run` | 215 passed |
| Customer — `vitest run` | 54 passed |
| Mobile — `vitest run` | 194 passed |
| Typecheck — api, admin, customer, mobile | 4 × exit 0 |
| Lint — admin, customer, mobile | 3 × exit 0 |
| Build — `nest build` / `next build` | exit 0 |

### 19.6 Security verification

- **The public route is the only unauthenticated one.** `verify/:token` is
  marked `@Public()`; every other route requires a permission and a company
  scope.
- **The token is the only credential.** It is a random value, not a sequence,
  and it exposes a projection rather than the document.
- **No sealed value leaves the API.** The file route streams bytes through the
  authorised path; nothing returns a storage path.
- **Tenant isolation is tested** with a second company's principal.
- **No credential is committed.** The test passwords are the same throwaway
  strings the other suites use.
- **Generated PDFs and media are not source.** Both are in `.gitignore`.

### 19.7 A defect found and fixed in this session

The register labelled an `ISSUED` document **"Valid"**. "Valid" is the *public*
verification vocabulary; the stored lifecycle state is `ISSUED`. The two words
had been conflated, and the Arabic labels for `REVOKED` and `CANCELLED` were the
same string (`ملغى`), so an Arabic-speaking administrator could not tell a
withdrawn document from a cancelled one.

The fix keeps the vocabularies apart in one place:

- `OFFICIAL_DOCUMENT_STATUSES` and `DOCUMENT_VERIFICATION_STATUSES` are separate
  exports, and `verificationStatusFor` maps one to the other by type.
- `documentStatusLabelKey` returns a dictionary key only for a stored status, so
  an unrecognised value renders the neutral "unknown" label rather than a raw
  enum.
- The register now reads **Issued** / **صادر** and **Withdrawn** / **مسحوب**,
  and the cancelled label stays **Cancelled** / **ملغى**.
- Two guards lock it: a shared test that the two vocabularies do not overlap and
  a customer test that the four verification outcomes read distinctly in both
  locales. A browser test drives the Arabic register and asserts the withdrawn
  label.

### 19.8 Still open

- **Android visual acceptance of Splash and Homepage is still not claimed.** The
  browser suite drives a desktop Chromium render; a browser render is not a
  physical device, and this report does not present one as the other.
- **The merchant-facing document surfaces are not built.** An administrator can
  issue and withdraw; a provider portal screen for its own documents is not in
  this phase.
- **The wider catalogue is not issuable.** Statements, returns and journal
  entries have a catalogue entry and a template but no issue path yet, and the
  interface offers a button only for the types the API can render from a stored
  record.
- **No APK was published**, per the standing instruction.
- **PR #7 remains open and Draft.** Nothing was merged and nothing was deployed.
