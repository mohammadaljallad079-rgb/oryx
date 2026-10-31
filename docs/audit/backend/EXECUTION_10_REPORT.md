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
| **Android visual acceptance** | **Not verified.** `screencap` returns black frames on the emulator available here; the swiftshader compositor does not paint without KVM. Layout is verified structurally and by the Android export, **not** visually. The Splash and the design are **not** marked approved. |
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

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
