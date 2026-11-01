# ORYX — Execution 15 Report

**Theme:** Mobile Data Integration, Provider & Product Photography, Vehicle Catalogue and Home-Rail Correctness
**Branch:** `feature/execution-07-premium-web`
**Baseline commit:** `4782daf`
**Date:** 2026-11-01

---

## 1. Scope

Execution 15 continued the mobile-integration work on the existing customer app
rather than rebuilding it. The app already authenticated customers, restored
sessions, booked resources, listed the catalogue and rendered the merchant
portal; this pass closed the gaps that a real device session exposed:

| Gap | Symptom on the device | Root cause |
| --- | --- | --- |
| Providers and products had no photograph | A parts shop and a car wash rendered the same bundled art, so the card did not describe the row | No provider storefront column existed, and the seed never linked an uploaded asset to a provider or to most products |
| The vehicle form accepted anything | A customer could save "Toyota Camry" and the garage grouped nonsense makes | The make/model fields were free text and nothing validated the pair server-side |
| The home rail repeated every card | "Front brake pad set" and "Al Noor Parts" each appeared about ten times | Every tenant seeds its own copy of the demo catalogue and the homepage query spanned all tenants |

All three are fixed, and each now carries a test that fails if it comes back.

---

## 2. Files changed

### Backend — `apps/api`

| File | Change |
| --- | --- |
| `src/marketplace/customer-homepage.service.ts` | De-duplicate both rails (`RAIL_LIMIT` 12 shown from a `RAIL_SCAN_LIMIT` 48-row window) by SKU (products) and display name (providers), keeping the photographed copy when a blank twin exists |
| `src/marketplace/marketplace.service.ts` | Project `imageUrl` on the provider directory and detail payloads; `setProviderImage` sets or clears a storefront photograph from the media library and audits it; `updateProviderProfile` accepts and validates `imageAssetId` |
| `src/marketplace/marketplace.dto.ts` | `SetProviderImageDto`; `imageAssetId` on `UpdateProviderProfileDto` |
| `src/marketplace/marketplace-public.controller.ts` | `POST /marketplace/admin/providers/:id/image` guarded by `erp.marketplace.provider.manage` |
| `src/marketplace/customer-catalog.service.ts` | `vehicleCatalog()` serving `VEHICLE_MAKES` from `@oryx/shared` |
| `src/marketplace/customer-catalog.controller.ts` | Public `GET /customer/catalog/vehicle-catalog` |
| `src/customer/customer-profile.service.ts` | Canonicalise make/model on vehicle create and refuse a model the make does not offer; an unknown make is preserved, not rewritten |

### Shared — `packages/shared`

| File | Change |
| --- | --- |
| `src/vehicle-catalog.ts` | **New.** The Bahrain make/model reference catalogue, `canonicalMake`/`canonicalModel`, `isKnownModel`, `vehicleMake`, `currentModelYear`, `SERVICE_CATEGORIES` |
| `src/index.ts` | Export the vehicle catalogue |

### Database — `packages/database`

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `MarketplaceProvider.imageAssetId` + `imageAsset` relation; `CmsMediaAsset.providerImages` back-relation |
| `prisma/migrations/20261101222746_execution_15_provider_image/` | **New.** Adds the column and the `ON DELETE SET NULL` foreign key |

### Mobile — `apps/mobile`

| File | Change |
| --- | --- |
| `src/lib/api-adapters.ts` | `categoryPhoto`, `fallbackPhoto`, `productPhoto` pick category-aware bundled art; `imageUrl` plumbed through `toDemoProduct`/`toDemoProvider`/`toDemoStore` |
| `src/lib/api.ts` | `imageUrl` on the homepage provider and public-provider payloads; `catalogApi.vehicleCatalog()` |
| `src/components/ui.tsx` | `Select` — a themed, RTL-aware picker for the dependent make/model pair |
| `src/components/cards.tsx` | `ProviderCard` renders the uploaded photograph when one exists |
| `src/app/(tabs)/vehicles/new.tsx` | Rewritten around the live catalogue: make picker, dependent model picker, year bounds |
| `src/app/services/[id].tsx` | Provider hero uses the category photo and the real storefront photograph |
| `src/demo/catalogue.ts` | `DemoProvider.imageUrl?` |

### Tests

| File | Change |
| --- | --- |
| `apps/mobile/test/photo-fallbacks.test.ts` | **New.** 6 tests over the category-aware photo helpers |
| `apps/api/test/execution10-mobile-integration.e2e-spec.ts` | 2 tests: the product rail returns each SKU once and keeps the photographed copy; the provider rail returns each name once |

### Scripts

| File | Change |
| --- | --- |
| `scripts/seed-exec15-photography.mjs` | **New.** Idempotent seeding of provider and product photographs through the real HTTP API and media library |

---

## 3. Implemented screens

The Execution 10–14 mobile screens remain live and are unchanged in structure:
Home, Categories, Search, Bookings (list, wizard, detail), Parts (list, detail,
store), Services (list, detail), Vehicles (list, new, detail), Orders, Cart,
Checkout, Favourites, Wallet, Promotions, Recovery, SENSAGE (list, new, detail),
Notifications, Support, Addresses, Account Security, Login, Register, Forgot
Password, Onboarding, and the Merchant area (dashboard, services, products,
orders, promotions, plan, profile).

Execution 15 rewrote **Vehicles → New** around the live catalogue and switched
the **Service provider detail** hero and the **provider cards** to the real
storefront photograph.

---

## 4. Backend endpoints

No new framework and no duplicate provider API. The endpoints touched or added:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/customer/catalog/vehicle-catalog` | Public | Makes, models and year bounds for the pickers |
| `POST` | `/marketplace/admin/providers/:id/image` | `erp.marketplace.provider.manage` | Set or clear a storefront photograph |
| `POST` | `/marketplace/providers/:id/profile` | Provider membership | Update profile, including `imageAssetId` |
| `GET` | `/customer/homepage` | Public | De-duplicated provider and product rails with `imageUrl` |
| `GET` | `/marketplace/providers` and `/marketplace/providers/:id` | Public | Provider payloads now carry `imageUrl` |

---

## 5. Real HTTP test results

All results are from the seeded PostgreSQL database, real HTTP and the real
filesystem. Nothing below is a mock.

### API integration — `pnpm --filter @oryx/api test:e2e`

```
Test Suites: 25 passed, 25 total
Tests:       478 passed, 478 total
```

Execution 10 suite (product images, SENSAGE uploads, live bookings, merchant
portal and the new rail tests):

```
Test Suites: 1 passed, 1 total
Tests:       38 passed, 38 total
  uploaded images surface in the customer homepage
    ✓ returns the uploaded product image as the product imageUrl
    ✓ reports availability for a home product, matching the catalogue
    ✓ returns each product once, keeping the photographed copy
    ✓ returns each provider once
```

Live homepage probe against the seeded database, before and after. The "before"
figures are the raw row counts (`Product` active with a price, and
`MarketplaceProvider` approved); the "after" figures are what the endpoint
actually returns:

```
before (rows)   products 42 (6 distinct SKUs, each ×7)
                providers 50 (5 distinct names, each ×10)
after  (rail)   products 6   providers 5
                en with image 6/6 products, 5/5 providers
                ar with image 6/6 products, 5/5 providers
                duplicate SKUs: none   duplicate names: none
```

### Shared — `pnpm --filter @oryx/shared test`

```
Test Files  9 passed (9)
Tests       180 passed (180)
```

### Mobile — `vitest run` in `apps/mobile`

```
Test Files  8 passed (8)
Tests       108 passed (108)
  api-planes 21 · lib 43 · live-endpoints 17 · tabs 9
  csrf-double-submit 6 · photo-fallbacks 6 · session-storage 3 · demo-gating 3
```

The React version regression tests pass: `apps/admin`, `apps/customer` and
`apps/mobile` all declare `react@19.1.0`, `apps/admin` and `apps/customer` pair
it with `react-dom@19.1.0`, `apps/mobile` pins `react-native@0.81.5`, and the
hoisted `node_modules/react` resolves to `19.1.0`.

### Typecheck and lint

```
@oryx/mobile typecheck   tsc --noEmit            clean
@oryx/mobile lint        eslint . --max-warnings=0   clean
@oryx/api typecheck      tsc -p tsconfig.json --noEmit   clean
@oryx/api build          nest build              clean
```

---

## 6. Security verification

- **Authorization is server-side.** The provider-image endpoint requires
  `erp.marketplace.provider.manage`; the vehicle catalogue is public and returns
  no tenant data. The client only hides controls.
- **Tenant isolation.** A product photograph is uploaded through the
  tenant-scoped inventory route, and the Execution 10 suite asserts a foreign
  tenant's product is refused. Provider membership, not a permission alone,
  gates the merchant profile update.
- **A stored asset must exist.** Both the profile update and `setProviderImage`
  look the `CmsMediaAsset` up before storing its id, so a stale or forged id
  cannot leave a broken image in the customer directory.
- **No credential or value leakage.** The provider payload exposes a served
  `imageUrl`, never a storage key or a credential. Photograph changes are audited
  by provider code, not by value.
- **Session plane separation is untouched.** Consumer tokens still carry
  `audience: customer`; the Execution 14 mobile-restore suite pins the
  double-submit and cookie behaviour and still passes.

---

## 7. Remaining incomplete work

Reported honestly:

- **Android visual acceptance of Splash and Homepage is not claimed.** A visual
  pass needs a device or emulator screenshot; neither the DOM nor the UI
  hierarchy is evidence that the black SUV hero and the two-second photographic
  splash render correctly. This remains open.
- **Product photography is not universal.** The seed links the catalogue on
  ORYX-AUTO; tenants created after the run still fall back to bundled category
  art until an administrator uploads an asset. That is the intended fallback, not
  a defect, but it means not every product card carries a photograph.
- **The rails de-duplicate by display name and SKU.** Two genuinely different
  tenants that happen to share a provider name or a SKU collapse to one tile.
  With the current seed that is correct; a future multi-tenant public directory
  will need a deliberate scoping rule rather than de-duplication.
- **Merchant mobile parity.** The merchant screens read the real portal API, but
  a full merchant workflow pass (onboarding → listing → request → completion)
  has not been re-run on a device in this execution.

---

## 8. Final commit hash

`be4eb4d` — `feat(execution-15): provider photography, vehicle catalogue and home-rail dedupe`

Pushed to `feature/execution-07-premium-web`. PR #7 stays open and in draft.
