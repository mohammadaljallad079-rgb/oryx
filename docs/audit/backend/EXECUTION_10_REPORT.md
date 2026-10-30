# Execution 10 — mobile integration: authentication, bookings, merchant, media

**Baseline:** `5c9c1f9` · **Branch:** `feature/execution-07-premium-web` · PR #7 **Draft**
**Database:** PostgreSQL 17, one new additive migration, no destructive change

---

## 1. Scope

Execution 10 connects the ORYX customer mobile application to the backend that
already exists. No new backend framework, no second ledger, no second media
store, no second provider API. The work falls into seven tracks:

1. Real customer authentication, session restoration and refresh.
2. Live customer bookings, including a confirm step that was missing.
3. Merchant/provider screens against the real portal.
4. Product image upload and management.
5. SENSAGE inspection image upload.
6. Preserving the approved visual identity.
7. Tests and evidence.

---

## 2. Customer authentication

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
sign-in cannot clobber a customer session. A staff credential never reaches a
customer session and vice versa.

---

## 3. Live customer bookings

The gap: `POST /customer/bookings` creates a slot in `HELD`, and a hold that is
never confirmed expires and releases the slot. There was **no customer-facing
confirm endpoint** — only staff routes — so a booking made from the app could
never reach `CONFIRMED`. This was the defect fixed in this execution.

### Backend additions

`apps/api/src/customer/booking.service.ts`:

- `confirmCustomerBooking(accountId, slotId)` — transitions `HELD` → `CONFIRMED`,
  scoped to the signed-in account, and refuses a hold past its expiry with
  `BOOKING_HOLD_EXPIRED`.
- `getCustomerBooking(accountId, id)` — reads one booking, scoped to the account,
  with its resource. A foreign id is a **404**, not a leak.

`apps/api/src/customer/booking.controller.ts`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/bookings/:id` | read one of your own bookings |
| `POST` | `/customer/bookings/:id/confirm` | confirm your own held booking |

Ownership is enforced by `accountId` from the verified token, never from the URL.

### Mobile additions

- `lib/api.ts` — `BookingSummary` extended; `bookingsApi.get(id)` and
  `bookingsApi.confirm(id)` added.
- `lib/live-bookings.tsx` — `confirmBooking` on the live state, wired into the
  context value and its dependencies.
- `app/bookings/new.tsx` — the wizard confirms the held booking after create, so
  a booking made in the app becomes `CONFIRMED` instead of expiring.
- `app/bookings/[id].tsx` — detail screen reads the single booking and offers a
  Confirm action while the status is `HELD`.
- `lib/i18n.ts` — `bookingConfirmed`, `bookingConfirmPending`.

**Available slots are never fabricated.** The wizard renders exactly what
`GET /customer/bookings/availability` returns for the chosen date and duration.
Cancellation is offered only for a status the server would accept
(`HELD`, `CONFIRMED`, `RESCHEDULED`).

---

## 4. Merchant functionality

The provider portal (`apps/api/src/marketplace/provider-portal.controller.ts`)
already existed and is a **staff** plane: the API resolves the provider from the
signed-in account's membership through `ProviderUser`, never from the URL, and
the routes are gated by `erp.provider_portal.manage` (Enterprise plan only). No
duplicate provider API was built.

- `lib/merchant-session.tsx` — merchant sign-in through staff `/auth/login`, then
  the provider membership is resolved. A staff account with no provider link is
  refused with a clear message rather than let into a portal that would reject
  every call. The staff token is a separate slot; the merchant refresh token has
  its own keychain key.
- `app/merchant-login.tsx` — merchant sign-in screen.
- `app/merchant/services.tsx` — live: service requests and listings from
  `/provider/requests` and `/provider/listings`, with accept / decline / start /
  complete and listing activate/deactivate.
- `app/merchant/products.tsx` — live: the company's real stock items
  (`/inventory/products`, staff plane) with real photographs attached through the
  media library.
- `app/merchant/profile.tsx` — live: provider profile read and update.
- `app/merchant/dashboard.tsx` — **now live-aware.** A signed-in merchant reads
  the earnings summary (`/provider/earnings`) and the queue (`/provider/requests`)
  and sees the real figures; the demo tiles, chart and lists render only when
  signed out, and only then carry the "Demo data" banner.

**Tenant isolation is server-side.** The client sends no provider id, so a
merchant cannot read or act on another provider's work even if it tried.

---

## 5. Product image management

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

Bytes go through the shared `MediaStorageService.store`, which:

- **sniffs the real magic-byte type** — a declared content-type is never trusted;
- rejects anything that is not JPEG / PNG / WebP / AVIF;
- enforces the configured size ceiling;
- **re-encodes every byte**, dropping EXIF and any trailing payload;
- derives the storage key from a UUID plus a content hash, so the client never
  chooses a path.

The resulting `CmsMediaAsset` is referenced by the `ProductImage` row, so the
catalogue and the website share one media library.

The mobile catalogue reads the uploaded image back through
`/customer/homepage`, which surfaces the product's primary image as `imageUrl`.

---

## 6. SENSAGE image upload

`apps/api/src/customer/customer-inspection.*` + migration
`20261030220000_execution_10_customer_inspection_photos`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/inspection-photos` | the caller's own upload history |
| `POST` | `/customer/inspection-photos` | upload a photograph |
| `DELETE` | `/customer/inspection-photos/:id` | remove one you own |

- **Ownership:** `accountId` comes from the verified token and scopes every read
  and write. A `vehicleId` in the body is a *claim* — it is checked against the
  account's own garage before the photo is linked, so a customer cannot attach a
  photograph to another account's car.
- **Storage:** the same `MediaStorageService` — magic-byte sniffing, size ceiling,
  EXIF-stripping re-encode, UUID + content-hash key.
- **What is not stored:** there is no analysis result on the row. The app's
  SENSAGE report is a demo, and writing a demo score into a table named as if it
  were a diagnosis would make a placeholder look like a product finding. Only the
  photograph and its metadata are persisted.

The mobile screen `app/sensage/new.tsx` uploads each captured photo immediately
inside a live session, shows upload progress, reports a failure without losing
the local shot, and lists the history. **Demo analysis is never presented as a
real AI result** — the report is labelled as demo.

---

## 7. The approved design is preserved

- The Homepage was not redesigned. The dark navy and gold identity, the approved
  black-SUV hero and the card layouts are untouched.
- No random slider images were introduced.
- The photographic Splash keeps a **2000 ms minimum** (`SPLASH_MIN_MS` in
  `lib/splash-timing.ts`), timed from the photograph's `onLoad`, so it cannot be
  skipped before it paints.
- No onboarding or startup screen was added.

---

## 8. Real HTTP test evidence

### New suite: `apps/api/test/execution10-mobile-integration.e2e-spec.ts`

**35 tests, all passing**, against the running API and the seeded PostgreSQL
database. Every call goes through the real HTTP surface, guards, pipes and Prisma
layer.

### Customer booking lifecycle

| Test | Result |
| --- | --- |
| Booking endpoints without a customer token | **401** |
| Availability offers real slots inside opening hours | 200, all slots inside 08:00–20:00 |
| Create then confirm a booking | 201 `HELD` → 200 `CONFIRMED` |
| Confirmed booking appears in the customer history | 200, status `CONFIRMED` |
| Detail returns the booking with its resource, **owner only** | 200 for the owner; **404** for another customer |
| Another customer confirming this booking | **404** |
| A second booking of the same confirmed slot | **409** |
| Cancel releases the slot | 200 `CANCELLED`, and the time is bookable again |

### Media and uploads

| Test | Result |
| --- | --- |
| Upload an image, store an asset, return a served URL | 200 |
| Serve the stored bytes through the media file route | 200 |
| List images primary-first | primary first |
| Promote a later image to primary | previous primary demoted |
| Refuse an upload with no file | 4xx |
| Refuse a non-image disguised as an image | 4xx |
| Refuse an unauthenticated upload | **401** |
| Refuse attaching an image to another tenant's product | **404** |
| Remove an image and promote the next primary | 200, next promoted |
| Store a customer SENSAGE photo, return a served URL | 200 |
| List only the caller's own photos | own only |
| Refuse a photo on another account's vehicle | 4xx |
| Refuse a staff token on the consumer route | **401/403** |
| Remove a photo the caller owns; refuse another account's | 200 / refused |

### Merchant provider portal

| Test | Result |
| --- | --- |
| Read the provider profile resolved from membership | 200 |
| Create a listing with the payload the client sends | 201 |
| Refuse the legacy `descriptionEn`/`durationMinutes` payload | 4xx |
| List only this provider's listings | own only |
| Update and deactivate a listing | 200 |
| Portal read surfaces (earnings, requests) | 200, shapes the screen reads |
| **Refuse a staff account that holds the permission but is not linked to a provider** | **403** |
| **Refuse a consumer token on the provider portal** | **401/403** |

### Live smoke test against a running server

A scripted HTTP run (`register → availability → create → confirm → detail →
foreign detail → cancel`) against `node dist/main.js` on the seeded test database:

```
register 201 true
availability 200 19
create 201 HELD
confirm 200 CONFIRMED
detail 200
foreign detail (expect 404) 404
cancel 200
```

### Full suites

```
API e2e:    Test Suites: 20 passed, 20 total   Tests: 399 passed, 399 total
Shared:     Test Files:  9 passed,  9 total    Tests: 180 passed, 180 total
Mobile:     Test Files:  4 passed,  4 total    Tests:  73 passed,  73 total
```

Mobile tests include `test/api-planes.test.ts` (18), which pins the confirm and
detail calls and the consumer-plane token, plus `test/tabs.test.ts` (9), which
derives the route list from the filesystem and fails when a new screen is added
without a declaration.

**334 → 399 API tests.** No regression. Typecheck and lint pass for the API and
the mobile app.

---

## 9. Security verification

| Property | Verified by |
| --- | --- |
| Consumer token refused on staff routes, staff token refused on consumer routes | e2e, both directions |
| Customer booking read / confirm / cancel scoped by token `accountId` | foreign id → 404 |
| Merchant portal resolves the provider from membership, not the URL | not-linked account → 403 |
| Provider portal licensed to the Enterprise plan only | plan-gated route tests |
| Product images scoped to the principal's company | cross-tenant id → 404 |
| SENSAGE photos scoped to the caller; vehicle claim checked against the garage | cross-account → refused |
| Upload validates true MIME by magic bytes, not the declared type | non-image → refused |
| Upload enforces a size ceiling | oversize → refused |
| Upload re-encodes to strip EXIF / GPS and any trailing payload | `MediaStorageService.store` |
| Storage key is server-derived (UUID + content hash) | client never chooses a path |
| The refresh token is the only long-lived secret; it lives in the keychain | `session-storage.ts` |
| The access token is memory-only and never persisted | `live-session.tsx` |

---

## 10. Remaining incomplete work

| Item | State |
| --- | --- |
| **Android visual acceptance** | **Not verified.** `screencap` returns black frames on the emulator available here; the swiftshader compositor does not paint without KVM. Layout is verified structurally. **The Splash and the visual design are not marked approved.** |
| SENSAGE AI analysis | No provider is configured, so analysis stays labelled as demo. |
| Merchant offers / promotions screen | Still demo records; the portal exposes no promotions route to connect. |
| Merchant orders screen | Still demo records; the portal's unit is a service request, which `services.tsx` covers live. |
| APK | **Not built.** Per the brief, the flows must form a coherent testable build first. |

Nothing above is presented as complete. Nothing presents demo data as live: a
live session renders live figures without a demo banner, and a demo session
renders the banner on every screen.

---

## 11. Final commit

`PENDING` — recorded on the branch after this report.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
