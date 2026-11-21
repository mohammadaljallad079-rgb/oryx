# Backend baseline — what already exists

**Audited before any code was written.** The brief asked for a backend audit
first and warned against choosing a framework arbitrarily. The audit's headline
finding is that **the backend already exists and is substantial** — it is not
absent, and no new framework is needed or justified.

Audit date: this session. Method: reading the repository, not the reports.

---

## 1. Framework and runtime

| Item | Value | Evidence |
| --- | --- | --- |
| Framework | **NestJS 11.2.7** | `apps/api/package.json` |
| Runtime | Node ≥ 20 (CI uses 22) | `package.json` `engines` |
| Language | TypeScript | `apps/api/tsconfig.json` |
| ORM | **Prisma 6.19.3** | `packages/database/package.json` |
| Database | **PostgreSQL** (17 in CI) | `.github/workflows/ci.yml` |
| Password hashing | **argon2 0.44.0** | `packages/database/package.json` |
| Monorepo | pnpm workspaces, `node-linker=hoisted` | `pnpm-workspace.yaml` |

**No new framework is introduced.** Laravel, Express and a second NestJS app
would each duplicate what is here, break the shared `@oryx/shared` contract, and
invalidate 18 existing test suites.

## 2. Database

**165 Prisma models**, 7 applied migrations under
`packages/database/prisma/migrations/`, the latest being
`20261023120000_execution_12_native_session_device`.

Every entity the brief lists already exists, under its domain name:

| Brief asks for | Actual model |
| --- | --- |
| Users | `User`, `Customer`, `CustomerAccount` |
| Customer profiles | `Customer`, `CustomerAddress`, `CustomerPrivacySetting` |
| Merchant/provider profiles | `MarketplaceProvider`, `ProviderUser`, `Company` |
| Roles and permissions | `Role`, `RolePermission`, `Membership`, `MembershipBranch` |
| Service categories | `ServiceCategory` |
| Services | `ProviderServiceListing`, `InspectionService`, `ServiceArea` |
| Products | `Product` |
| Inventory availability | `StockLevel`, `StockMovement`, `Warehouse` |
| Bookings | `BookingEvent`, `BookingResource`, `BookingSlot`, `InspectionBooking`, `MaintenanceBooking` |
| Booking statuses | `BookingEvent.status` + the work-order state machine |
| Vehicles | `Vehicle`, `VehicleDocument`, `VehicleMileageRecord` |
| Addresses | `CustomerAddress` |
| Notifications | `Notification`, `NotificationDelivery`, `NotificationTemplate` |
| Reviews | `ProviderReview` |
| Favorites | — see gaps |

### Genuine gaps

These are the only entities the brief names that have **no** model:

| Missing | Note |
| --- | --- |
| `Cart` / `CartItem` | The mobile demo keeps a cart in `localStorage`; there is no server cart. |
| `Favorite` | Same: the demo keeps favourites client-side. |
| `ProductImage` | `Product` has no image relation. `CmsMediaAsset` exists and could carry one. |
| Hero slide approval | `CmsBanner` already provides it — see §5. |

## 3. API surface

**435 route handlers** across 25 feature modules in `apps/api/src/`:
`accounting`, `audit`, `auth`, `automotive`, `branding`, `cms`, `common`,
`crm`, `customer`, `dashboard`, `health`, `hr`, `integrations`, `inventory`,
`marketplace`, `notifications`, `operations`, `organizations`, `payments`,
`plans`, `platform`, `purchasing`, `rbac`, `reports`, `sales`, `support`.

Marketplace and customer endpoints already exist:
`marketplace-public.controller.ts` (providers, applications, reviews,
settlements), `customer-marketplace.controller.ts`, `provider-portal.controller.ts`,
`customer-auth.controller.ts`, `booking.controller.ts`,
`customer-platform.controller.ts`, `customer-profile.controller.ts`.

## 4. Authentication and authorization

Real, and already hardened — this is not a stub:

- `auth/` — controller, service, DTOs, cookie service, **CSRF guard**, MFA
  service with AES-256-GCM secret encryption, hashed single-use recovery codes,
  replay protection, principal guard, permissions guard.
- `customer/customer-auth.service.ts` + `customer-auth.guard.ts` — a **separate
  consumer identity plane**. A consumer token carries `audience: customer`; it is
  refused on a staff route and a staff token is refused on a consumer route.
- Refresh token in an HttpOnly cookie scoped to `/api/v1/auth`, never in a body.
- Every non-GET request presenting the refresh cookie must echo `oryx_csrf` in
  `x-oryx-csrf`; `CsrfGuard` runs first in the guard pipeline.
- `rbac/` — permission catalog, `validateDelegation`, `resolveEffectivePermissions`
  in `packages/shared/src/authorization.ts`.

## 5. Homepage content — the approval mechanism already exists

The brief's critical requirement is that arbitrary Hero images must not be
published automatically, and asks for an approval/status field. **`CmsBanner`
already provides exactly this:**

```prisma
model CmsBanner {
  placement    String     // e.g. the homepage hero slot
  locale       Locale
  title        String
  subtitle     String?
  imageUrl     String?
  actionUrl    String?
  sortOrder    Int        @default(0)
  isActive     Boolean    @default(true)   // <- the approval gate
  mediaAssetId String?
  mediaAsset   CmsMediaAsset?
  @@index([placement, locale])
}
```

So the mechanism is present; what is missing is a customer-facing endpoint that
returns **only** `isActive` slides for a placement, and the mobile wiring. That is
the work, not a new model.

## 6. Mobile ↔ API integration today

The mobile app is **offline-only**. `apps/mobile/src/lib/repository.ts` reads
seeded records from `src/demo/`. There is no HTTP client in the bundle: the
release check asserts `fetch(` and `axios` appear zero times. Offline Demo Mode is
the whole app, not a fallback mode.

## 7. Tests

**18 API e2e suites** in `apps/api/test/`, plus 180 `@oryx/shared` unit tests and
47 mobile tests. CI runs typecheck, build, unit, API integration and a Playwright
browser suite.

## 8. Deployment

`deploy/` carries `docker/`, `docker-compose.production.yml`, `env/`, `nginx/`
and `scripts/`. A manual `workflow_dispatch` deploy workflow exists and is not
triggered by a merge.

## 9. What the audit changes about the plan

The brief's Phase C asks to "create migrations for the required domain entities"
and "implement or complete real APIs" for a list of resources. Measured against
the repository, most of that is already built:

- **Migrations**: 165 models exist. Only `Cart`, `CartItem`, `Favorite` and a
  product-image relation are genuinely absent.
- **Auth**: complete, including MFA, CSRF, two identity planes and RBAC.
- **Marketplace APIs**: providers, reviews, applications, bookings and the
  customer platform exist.

The honest plan is therefore **additive**: add the missing cart, favourite and
product-image models, add the homepage endpoint that filters on `isActive`, and
connect the mobile app to the existing API. Rebuilding what is here would be
destructive and is explicitly what the brief warns against.

## 10. Limitations of this audit

- The audit is a **reading** of the repository. No API request was issued against
  a running instance in this session, because no database is provisioned here.
- The route count (435) comes from a grep of decorators; it counts handlers, not
  distinct paths.
- Whether every listed route behaves as its name suggests is **not** verified.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
