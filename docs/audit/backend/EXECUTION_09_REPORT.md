# Execution 09 — live mobile integration

**Baseline:** `fe98046` · **Branch:** `feature/execution-07-premium-web` · PR #7 **Draft**
**Database:** PostgreSQL 17, migrations applied, no destructive change

---

## 1. Implemented functionality

### Homepage reads the marketplace API

`GET /api/v1/customer/homepage?locale=ar|en` returns `hero`, `categories`,
`providers` and `products` in one response. The mobile homepage consumes it.

`lib/api-adapters.ts` maps the API's response onto the shape the approved cards
already render, so **the card design is untouched**. Two rules:

- **A missing value stays missing.** The API returns no rating, review count,
  brand, stock or discount for a listing, so those are neutral rather than
  invented. The card shows no rating badge at a zero count and no strike-through
  at a null comparison price, so absence reads as absence.
- **A missing image falls back to a bundled asset**, chosen from the record's id,
  so a product keeps the same placeholder across renders.

The rails are never blended. A rail shows marketplace records or demo records,
and the footer says which — **"Live data"** or **"Demo data"**.

### The approved Hero is preserved

`heroFallbackRequired` is true whenever the CMS has nothing published, and the app
then renders its bundled approved scene. A CMS record can only replace it once it
is **both** `status = PUBLISHED` and `isActive = true`. The fallback is the
default, not the exception.

### Typed API client

`lib/api.ts` — 12-second timeout, eight typed error kinds, memory-only access
token, offline detection from the platform signal, and retry **only** on
idempotent GETs. A POST is never retried automatically: retrying an add could
double a quantity if the first attempt reached the server and only the response
was lost.

The client sends `x-oryx-client: mobile`. The API returns the refresh token in the
body only for that client kind, because a native app has no cookie jar.

### Server-backed cart

`lib/live-cart.tsx` — a cart read from and written to the API, **separate from the
demo cart**. The separation is the point: a demo cart cannot be mistaken for a
server cart, and a failed call cannot silently fall back to a local line the
server has never seen. `mode` reports which store is in use.

Every total comes from the server. A write re-reads the cart rather than patching
local state from the request it hoped succeeded. `busy` blocks a second write in
flight, so a double tap cannot become two increments. A monotonic sequence stops
a stale response overwriting a newer one.

---

## 2. Endpoints used

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/homepage` | the marketplace home (public) |
| `POST` | `/customer/auth/register` | create an account |
| `POST` | `/customer/auth/login` | sign in |
| `POST` | `/customer/auth/refresh` | rotate the session |
| `GET` | `/customer/auth/me` | restore the account |
| `POST` | `/customer/auth/logout` | sign out |
| `GET` | `/customer/cart` | the cart |
| `POST` | `/customer/cart/items` | add |
| `PATCH` | `/customer/cart/items/:productId` | set quantity |
| `DELETE` | `/customer/cart/items/:productId` | remove |
| `DELETE` | `/customer/cart` | clear |
| `GET` | `/customer/favorites` | list |
| `POST` | `/customer/favorites` | save |
| `DELETE` | `/customer/favorites/:productId` | remove |
| `GET` | `/customer/bookings/availability` | bookable slots |
| `POST` | `/customer/bookings` | create |
| `GET` | `/customer/bookings` | history |
| `POST` | `/customer/bookings/:id/cancel` | cancel |

**No backend feature was rebuilt.** Every endpoint above already existed, except
the homepage, cart and favourites added in the previous session.

---

## 3. Mobile screens connected

| Screen | State |
| --- | --- |
| Homepage — hero, categories, providers, products | **connected**, with per-rail fallback |
| Cart — data layer | **connected** (`LiveCartProvider`) |
| Cart — screen | **connected** — renders the server cart, with a retry on failure |
| Favorites — data layer | **connected** (`LiveFavoritesProvider`) |
| Favorites — screen | **connected** — renders the server list and its empty state |
| Sign-in / register | client methods exist; the screen still uses the demo session |
| Bookings | client methods exist; screens not connected |

---

## 4. Real HTTP test evidence

New suite: `apps/api/test/execution09-customer-integration.e2e-spec.ts` — **28
tests, all passing**, against the running API and the seeded PostgreSQL database.
Every call goes through the real HTTP surface, guards, pipes and Prisma layer.

### Homepage

| Test | Result |
| --- | --- |
| English response, seeded catalogue | 200, categories > 0 |
| Arabic response returns Arabic names | 200, names differ from English |
| Active but **DRAFT** banner | **excluded** |
| Active **and** published banner | **included** |
| Banner with a `javascript:` image | **excluded** |
| Public — a guest can read it | 200 |

### Cart

| Test | Result |
| --- | --- |
| Unauthenticated read / write | **401** / **401** |
| Repeated add merges into one line | one line, quantity 3 |
| Total computed server-side | 4500 (3 × 1500) |
| Client-supplied `unitPriceMinor` | **400** |
| `PATCH` quantity, and `0` removes | 200, `removed: true` |
| Unknown product | **404** |
| **Cross-customer isolation** | B's cart empty; B's PATCH 404; B's DELETE no-op; A untouched |
| **Concurrent adds** | one line, **no 5xx** |

### Favourites

| Test | Result |
| --- | --- |
| Unauthenticated read | **401** |
| Add twice | **idempotent**, one row |
| Another customer's list | empty |
| Remove | 200, zero rows after |

### Bookings and sessions

| Test | Result |
| --- | --- |
| Unauthenticated booking list | **401** |
| Cancel a booking that is not yours | **403/404** |
| Malformed availability date | 4xx, never 500 |
| Session rotation with a body token | 200, new access token |
| Refresh with no token | **401** |
| Invalid access token | **401** |
| **Customer token on a staff route** | **401/403** |
| Account restored from a valid token | 200, correct email |

### Full suite

```
Test Suites: 19 passed, 19 total
Tests:       362 passed, 362 total
```

**334 existing + 28 new.** No regression.

---

## 5. Three more defects, found by driving the screens

The report above was written before the cart and favourites screens were
connected. Driving them against the running API surfaced three defects that
reading the code would not have shown:

**1. `react` and `react-dom` were on different versions** — 19.1.0 against
19.3.0 — and the web bundle crashed with React error #527. The previous session
changed the manifests, but the lockfile still resolved `react-dom@19.3.0` in 44
places, because `react-native-web`'s peer on `react-dom` resolved to the newest
match. Declaring `react-dom` in the mobile workspace pins that peer. This is the
same class of bug that crashed APK 1.0.5, so a regression test now asserts both
versions match and that react is the version react-native bundles.

**2. `x-oryx-client` was missing from the CORS allowed headers.** Every
native-client request carries it, so the browser's preflight refused every call.
A web-hosted build of the app could not reach the API at all.

**3. A stale root `react-dom`** — the lockfile had never been regenerated after
the React fix.

Verified by driving the real screens against the running API:

| Screen | Rendered |
| --- | --- |
| Cart | `Cart 1 Items · Front brake pad set · BRAKE-PAD-F · 28.000 BHD · − 2 + · 56.000 BHD · Remove · Subtotal 56.000 BHD · Total 56.000 BHD · Live data` |
| Favourites | `Favourites 0 · Nothing here yet. · Live data` |
| Console errors | **none** |

The total is the server's own figure — 2 × 28.000 — never a local multiplication.

---

## 6. Two bugs the tests found

**1. A concurrent first-add returned 500.** Two requests both read "no cart" and
both inserted; the unique key on `customerAccountId` let one win and the loser's
transaction was aborted. That is a legitimate race, so the whole transaction is
now retried and a fresh transaction sees the winner's cart.

**2. The first fix was wrong, and the test caught that too.** Catching inside the
transaction and re-reading cannot work — a failed query aborts a Prisma
interactive transaction. The retry has to wrap the entire transaction.
`isUniqueViolation` walks the cause chain, because a violation raised inside a
transaction can arrive wrapped.

The concurrency test originally asserted only the row count and **passed while the
API was returning 500s**. It now asserts no 5xx as well. That is the more valuable
lesson: a test that checks the happy-path symptom can hide the fault it was
written to catch.

---

## 7. Remaining demo-only functions

| Function | State |
| --- | --- |
| Sign-in / register screens | demo session — the client methods exist and are tested |
| Bookings screens | demo records |
| Offers, stores rails | demo records |
| Merchant dashboard | demo records |
| SENSAGE analysis | seeded, labelled as demo |

**Nothing presents demo data as live.** The homepage footer states the mode, the
API client never substitutes demo records for a failed call, and the demo cart is
a different store from the live one.

---

## 8. Known limitations

- **No Android visual verification.** `screencap` returns black frames on the
  emulator available here — the app's surfaces exist and its activity is visible,
  but the swiftshader compositor does not paint without KVM. Layout is verified
  structurally, not visually. **The Splash and the visual design are not marked
  approved.**
- **Product image upload is not built.** The `ProductImage` model and the CMS
  media pipeline exist; no upload endpoint does.
- **SENSAGE upload is not built**, and no AI provider is configured, so analysis
  stays labelled as demo.
- **Merchant integration is not connected.** The endpoints exist; the mobile
  merchant screens still read demo records.
- **The homepage rails were verified by API response, not by rendering them on a
  device.** The adapter is unit-testable but has no test of its own.
- **No APK was built.** Per the brief, the customer flows must form a coherent
  testable build first.

---

## 9. Final commit

`4fc8718` — plus the report commit that follows it.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
