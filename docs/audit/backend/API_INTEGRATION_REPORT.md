# Backend API and mobile integration — report

**Commit:** `441699e` (this report is the commit after it)
**Branch:** `feature/execution-07-premium-web` · PR #7 left **Draft**
**Database:** PostgreSQL 17, applied migrations only, no destructive change

---

## 1. What was implemented

### `GET /api/v1/customer/homepage`

The marketplace home in one response: `hero`, `categories`, `providers`,
`products`. Public, because the home is what a visitor sees before signing in and
nothing in it is customer-specific.

`?locale=ar|en` selects the language; `?companyId=` optionally scopes products to
one tenant.

### The approval distinction

`CmsBanner` previously had only `isActive` — an operator toggling a slide on.
That is not editorial approval, so a migration adds `status CmsStatus` and
`publishedAt`, defaulting to **`DRAFT`**. The endpoint requires **both**
`status = PUBLISHED` and `isActive = true`, applied in the query so an unapproved
row is never loaded into memory. A newly created banner is therefore invisible to
customers until someone publishes it deliberately.

### URL validation

A published banner's `imageUrl` and `actionUrl` are validated before they leave
the API. Only a bundled asset path, an in-app route, or an absolute `https:` URL
is returned. `javascript:`, `data:` and protocol-relative values are dropped. A
banner with no usable image is filtered out rather than rendered as an empty card.

### Cart and favourites

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/customer/cart` | the cart with a server-computed total |
| `POST` | `/customer/cart/items` | add a product, or increase its quantity |
| `PATCH` | `/customer/cart/items/:productId` | set a line quantity; `0` removes |
| `DELETE` | `/customer/cart/items/:productId` | remove a line |
| `DELETE` | `/customer/cart` | empty the cart |
| `GET` | `/customer/favorites` | the caller's favourites |
| `POST` | `/customer/favorites` | save a product |
| `DELETE` | `/customer/favorites/:productId` | remove a favourite |

Every route is behind `CustomerAuthGuard`; every method takes the caller's account
id from the verified token and never from the request.

### Mobile

`apps/mobile/src/lib/api.ts` — a typed client with a 12-second timeout, typed
error kinds, memory-only access token, offline detection, and retry **only** on
idempotent GETs. The homepage reads it, falling back to the bundled approved Hero
whenever the CMS has nothing published.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `packages/database/prisma/schema.prisma` | `Cart`, `CartItem`, `Favorite`, `ProductImage`; `CmsBanner.status` + `publishedAt`; back-relations |
| `.../migrations/20261030012456_consumer_cart_favorites_product_images/` | new, additive |
| `.../migrations/20261030013311_cms_banner_editorial_status/` | new, fail-closed |
| `apps/api/src/marketplace/customer-homepage.service.ts` | new |
| `apps/api/src/marketplace/customer-homepage.controller.ts` | new |
| `apps/api/src/marketplace/customer-cart.service.ts` | new |
| `apps/api/src/marketplace/customer-cart.controller.ts` | new |
| `apps/api/src/marketplace/customer-cart.dto.ts` | new |
| `apps/api/src/marketplace/marketplace.module.ts` | wires the four |
| `apps/mobile/src/lib/api.ts` | new |
| `apps/mobile/src/app/(tabs)/home.tsx` | reads the API, falls back to the approved scene |
| `apps/mobile/src/app/index.tsx`, `components/launch.tsx`, `lib/splash-timing.ts` | splash timing fix (earlier commit) |
| `docs/audit/backend/BASELINE.md` | the audit |

**No ERP module was modified.** No framework was introduced.

---

## 3. Migration status

```
$ npx prisma migrate deploy
All migrations have been successfully applied.
$ npx prisma validate
The schema at prisma/schema.prisma is valid 🚀
```

The `CmsBanner` migration is **fail-closed**: existing rows become `DRAFT`, so
nothing already in the database is published by the change itself.

---

## 4. Real HTTP test results

Against a running API on PostgreSQL 17, with real requests — not compilation.

### Homepage

| Test | Expected | Result |
| --- | --- | --- |
| `?locale=en` | 200, published+active only | **200**, hero `[b-pub]` |
| `?locale=ar` | 200, Arabic only | **200**, hero `[b-ar]`, categories `[قطع الغيار]`, products `[فحمات, فلتر زيت]` |
| Banner `isActive=true`, `status=DRAFT` | excluded | **excluded** |
| Banner `isActive=false`, `status=PUBLISHED` | excluded | **excluded** |
| Banner with `javascript:alert(1)` image | dropped | **dropped**, banner filtered out |
| Category `isActive=false` | excluded | **excluded** |
| Provider `status=PENDING` | excluded | **excluded** |

### Cart

| Test | Expected | Result |
| --- | --- | --- |
| `GET /customer/cart` (new account) | empty | `{"items":[],"totalMinor":0,"itemCount":0}` |
| `POST` add ×2 then ×1 | merged, quantity 3 | **one line, quantity 3** |
| Server-computed total | 3 × 1500 | `totalMinor: 4500` |
| `PATCH` quantity 5 | 200 | **200** |
| `PATCH` quantity 0 | removes | `{"removed":true}` |
| `DELETE` line | removes | `{"removed":true}` |
| Client-supplied `unitPriceMinor` | rejected | **400** `property unitPriceMinor should not exist` |
| Unknown product id | 400/404 | **400** |
| Quantity 0 on add | 400 | **400** `quantity must not be less than 1` |

### Favourites

| Test | Result |
| --- | --- |
| Add twice | **idempotent** — one row |
| List | 1 row, `SKU-2` |
| Remove | `{"removed":true}`, list empty after |

### Security

| Test | Expected | Result |
| --- | --- | --- |
| `GET /customer/cart` unauthenticated | 401 | **401** |
| `POST /customer/cart/items` unauthenticated | 401 | **401** |
| Invalid bearer token | 401 | **401** |
| Refresh cookie without `x-oryx-csrf` | 401 | **401** |
| **Cross-customer: B reads A's cart** | B's own only | **B empty** |
| **Cross-customer: B PATCHes A's line** | refused | **404** "the cart is empty" |
| **Cross-customer: B DELETEs A's line** | no effect | **`{"removed":false}`**, A still has 4 |
| A's cart after B's attempts | unchanged | **4 items, 6000 minor** |
| **Cross-customer: B lists favourites** | none of A's | **0 rows** |

### A bug found by testing, not by reading

The first `POST /customer/cart/items` returned **500**
(`P2003` on `Cart_companyId_fkey`). The cart's tenant was being taken from a
fallback id that is not a company. The tenant now comes from the product being
added — correct, and un-spoofable because the product row is the authority.

---

## 5. Mobile integration status

| Item | State |
| --- | --- |
| Typed client | done — `lib/api.ts` |
| Environment-based URL | done — `EXPO_PUBLIC_API_BASE_URL` |
| Timeout | done — 12s, per-request override |
| Error normalisation | done — eight typed kinds |
| Retry only when safe | done — GET only |
| Offline detection | done — platform signal, not an inferred failure |
| Homepage reads the API | done, with the approved Hero as fallback |
| Cart and favourites screens | **not wired** — the client methods exist, no screen calls them |
| Customer sign-in against the API | **not wired** — the demo session is still local |

---

## 6. Remaining mock data

The mobile app still reads `src/lib/repository.ts` for the category tiles,
providers, products, offers and stores rails. Only the hero reads the API. This is
deliberate: replacing six rails at once would risk the approved layout, and the
brief asked for an incremental replacement starting with categories.

**Nothing in the app presents demo data as live.** The demo notice is rendered on
the homepage, and the API client never substitutes demo records for a failed call.

---

## 7. Remaining incomplete work

- **Product image upload and management.** The `ProductImage` model exists and the
  homepage returns the first image; there is no upload endpoint. The CMS media
  pipeline (`media-storage.service.ts`) exists and would be the place to build it.
- **Cart and favourites UI.** Client methods exist; no screen calls them.
- **Live customer authentication in the app.** The API has a complete consumer
  identity plane with MFA; the app still uses its local demo session.
- **SENSAGE image upload backend.** Not built. The mobile camera and gallery
  capture work (APK 1.0.6); the upload endpoint does not exist, and no AI provider
  is configured, so results remain explicitly labelled as demo.
- **Provider portal endpoints** for the merchant role are not part of this change.

---

## 8. Limitations of this verification

- **No Android visual verification.** `screencap` returns black frames on the
  emulator used here — the app's surfaces exist and its activity is visible, but
  the swiftshader compositor does not paint without KVM. Layout is verified
  structurally through the view hierarchy, not visually.
- **The API was tested on one seeded dataset**, not against production-shaped
  volume. Pagination and index behaviour under load are unverified.
- **No test asserts the cart under genuine concurrency.** The unique constraints
  are in place and were tested sequentially; a parallel-request test was not run.
- **The seeded test rows were inserted by SQL**, not through the admin API, so the
  write paths those endpoints use were not exercised.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
