# Execution 11 — Complete mobile features on the real backend

**Branch:** `feature/execution-07-premium-web`
**Baseline:** `d7bb25834139e8881a7d00251c6c637039001721`
**Feature commit:** `7c7531f` — *feat(execution-11): live merchant promotions, plans and customer offers*
**PR:** #7 — stays **open** and **Draft**. Nothing merged, nothing deployed.

Execution 11 closes the remaining gap between the mobile app and the real
NestJS + PostgreSQL backend. Every screen that previously fell back to the
offline demo repository for a feature the API already exposed now reads and
writes the real service. Live and demo remain strictly separated: a live
session renders server data with no demo banner, a demo session renders the
local copy under the banner.

---

## 1. What this execution added

| Area | Before | After |
| --- | --- | --- |
| Merchant promotions | The portal had no promotions route; the screen stated the limitation | `ProviderOffer` model, provider create/update/list routes, a public customer feed, a rewritten merchant screen |
| Merchant plans | The screen showed the demo catalogue as if it were the tenant's | `GET /plans` + `GET /subscriptions`, the real catalogue and the tenant's own subscription |
| Customer promotions | No screen | `apps/mobile/src/app/promotions.tsx` + a homepage offers rail, both on the live feed |
| Customer profile | Read-only | Edit the signed-in customer's own name and phone via `POST /customer/auth/profile` |
| Demo gating | Three screens read the demo repository unguarded | Bookings, cart, SENSAGE and garage read demo data only outside a live session |

---

## 2. Files changed

### Backend

| File | Change |
| --- | --- |
| `packages/database/prisma/schema.prisma` | `ProviderOffer` model and its relation on `MarketplaceProvider` |
| `packages/database/prisma/migrations/20261031000000_execution_11_provider_offers/migration.sql` | Create the table, its indexes and the cascade FK |
| `packages/database/prisma/seed.ts` | Seed 20 real offers; link `admin@oryx-auto.local` to the ORYX-AUTO company's first provider |
| `apps/api/src/marketplace/marketplace.dto.ts` | Offer create/update DTOs with the basis-point bound |
| `apps/api/src/marketplace/marketplace.service.ts` | Provider offer CRUD and the active-window customer feed |
| `apps/api/src/marketplace/provider-portal.controller.ts` | `GET/POST /provider/offers`, `PATCH /provider/offers/:id` |
| `apps/api/src/marketplace/customer-catalog.controller.ts` | `GET /customer/catalog/offers` |
| `apps/api/test/test-app.ts` | `providerOffer.deleteMany` in `cleanupFixtures` before the listing delete |
| `apps/api/test/execution11-provider-offers.e2e-spec.ts` | New suite, 11 tests |

### Mobile

| File | Change |
| --- | --- |
| `apps/mobile/src/lib/api.ts` | `CatalogOffer`, `subscriptionApi`, `providerApi.offers/createOffer/updateOffer`, customer profile write |
| `apps/mobile/src/lib/api-adapters.ts` | `catalogOfferToDemo` |
| `apps/mobile/src/lib/format.ts` | `formatDate` returns `''` for an empty or invalid bound (open-ended offers) |
| `apps/mobile/src/lib/i18n.ts` | Offer and profile keys, EN + AR |
| `apps/mobile/src/lib/live-session.tsx` | `saveProfile`, the customer's phone on the session account |
| `apps/mobile/src/app/promotions.tsx` | New customer promotions screen |
| `apps/mobile/src/app/merchant/promotions.tsx` | Rewritten onto the real provider API |
| `apps/mobile/src/app/merchant/plan.tsx` | Rewritten onto the real plans/subscription API |
| `apps/mobile/src/app/(tabs)/home.tsx` | Live offers rail |
| `apps/mobile/src/app/(tabs)/account.tsx` | Live profile editing |
| `apps/mobile/src/app/(tabs)/bookings.tsx`, `cart.tsx`, `sensage/[id].tsx`, `sensage/new.tsx` | Demo reads gated by the session |
| `apps/mobile/src/app/_layout.tsx` | `promotions` route registered |
| `apps/mobile/test/live-endpoints.test.ts` | New plane/route pins |
| `apps/mobile/test/tabs.test.ts` | Route declaration list updated |

---

## 3. Backend endpoints used

| Method | Route | Plane | Notes |
| --- | --- | --- | --- |
| `GET` | `/provider/offers?includeInactive=` | staff | The provider's own offers |
| `POST` | `/provider/offers` | staff | `percentOffBp` ≤ 10000 |
| `PATCH` | `/provider/offers/:id` | staff | Withdraw / relist |
| `GET` | `/customer/catalog/offers?categoryKey=&limit=` | public | Active offers inside their window |
| `GET` | `/plans?includeInactive=false` | staff | Plan catalogue |
| `GET` | `/subscriptions` | staff | The token's company subscription |
| `POST` | `/customer/auth/profile` | consumer | The token's own account |
| `POST` | `/customer/auth/change-password` | consumer | Verifies the current password |
| `POST` | `/customer/auth/forgot-password` / `reset-password` | public | Non-enumerating |

---

## 4. Real HTTP verification

Run against the local API (`http://127.0.0.1:3001/api/v1`) with the seeded
database and the rebuilt `dist/main.js`.

**Merchant offers, as `admin@oryx-auto.local` (linked provider):**

```
token length: 412
--- provider list (count) ---       1 offers owned by this provider
--- create ---                      created id: cmvwitvok0007486diwblspd6
--- public feed after create ---    True 20 offers
--- withdraw ---                    isActive: False
--- public feed after withdraw ---  False 20 offers
--- relist ---                      isActive: True
--- invalid discount 200% ---       400
```

**Merchant portal and tenant isolation:**

```
--- GET /provider/profile ---       200  provider: City Auto Care | code: ORYX-AUTO-P1 | status: APPROVED
--- GET /provider/orders ---        200
--- GET /provider/settlements ---   200
--- DEMO-ALNOOR admin -> portal --- 403   (no ProviderUser link)
--- bogus token -> portal ---       401
```

**Plans and subscription:**

```
--- GET /plans ---                  200  3 plans: starter 499 BHD / professional 1499 BHD / enterprise 3499 BHD
--- GET /subscriptions ---          200  (tenant's own; none for the internal ORYX-AUTO company)
--- unauthenticated /plans ---      401
```

---

## 5. Test results

| Suite | Command | Result |
| --- | --- | --- |
| API e2e | `npx jest --config jest-e2e.config.js --runInBand` | **22 suites, 433 tests** — all passing |
| API e2e (new) | `execution11-provider-offers.e2e-spec.ts` | **11 tests** — passing |
| Shared | `pnpm --filter @oryx/shared test` | **9 files, 180 tests** — passing |
| Mobile | `pnpm --filter @oryx/mobile test` | **6 files, 93 tests** — passing |
| Mobile typecheck | `pnpm --filter @oryx/mobile typecheck` | clean |
| Mobile lint | `pnpm --filter @oryx/mobile lint` | clean |
| Android export | `expo export --platform android` | completes |

The new e2e suite covers: a provider creating, listing, withdrawing and
relisting an offer; the public feed hiding a withdrawn offer and showing a
relisted one; the discount bound rejecting 200%; and a foreign provider never
reading another provider's offers.

`apps/mobile/test/live-endpoints.test.ts` pins the plane and the exact route for
every new call: the offers feed carries no token, the merchant offer routes
carry the staff token, and the subscription reads never send a `companyId`.

---

## 6. Security verification

| Property | Verified by |
| --- | --- |
| Merchant portal resolves the provider from `ProviderUser`, not the URL | unlinked admin → 403 (HTTP) |
| A consumer or bogus token is refused on `/provider/*` | 401 (HTTP) |
| The customer offer feed is public and read-only | no token sent; `GET` only |
| A withdrawn or expired offer never reaches the app | feed filter in SQL; e2e |
| The subscription read is scoped to the token's company | no `companyId` on the wire; HTTP |
| Customer profile write is scoped to the token's account | `POST /customer/auth/profile`, no account id |
| The discount is bounded server-side | 200% → 400 |
| Live mode never renders a demo record | `demo-gating.test.ts` walks every screen |
| The staff token never rides a consumer route (and back) | `live-endpoints.test.ts` plane pins |

---

## 7. Remaining incomplete work

| Item | State |
| --- | --- |
| **Android visual acceptance** | **Not verified.** `screencap` returns black frames on the emulator available here; the swiftshader compositor does not paint without KVM. Layout is verified structurally and by the Android export, **not** visually. Splash and Homepage are **not** marked approved. |
| Plan switching from the mobile app | Deliberately not offered: assigning a subscription is a platform action. The screen states this. |
| SENSAGE AI analysis | No provider configured; analysis stays labelled as demo. |
| APK | **Not built.** The brief requires a coherent testable build first. |

Nothing above is presented as complete. No screen presents demo data as live.

---

## 8. Delivery

Committed to `feature/execution-07-premium-web`:

```
7c7531f feat(execution-11): live merchant promotions, plans and customer offers
```

30 files changed, 1905 insertions, 130 deletions. PR #7 stays **Draft**; nothing
is merged or deployed.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
