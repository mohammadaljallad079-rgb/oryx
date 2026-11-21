# ORYX — Execution 12 Report

**Theme:** Complete Super Admin Dashboard & Centralized Application Management
**Branch:** `feature/execution-07-premium-web`
**Baseline commit:** `36afef64086a28dbe…`
**Date:** 2026-10-31

---

## 1. Scope

Execution 12 adds a **centralized control panel** to the Super Admin dashboard so a
platform principal can operate the whole ORYX ecosystem from one place, against the
real NestJS API and the real PostgreSQL database. Nothing in this execution is a
mock: every figure is an aggregate over live tables and every mutation persists.

Three surfaces were added, plus the supporting backend, contracts, permissions and
seed data:

| Surface | Route | Purpose |
| --- | --- | --- |
| Ecosystem Overview | `/ecosystem` | Platform-wide KPIs across every tenant |
| Coupons & Offers | `/coupons` | Create, edit, withdraw and test discount coupons |
| Notification Centre | `/notifications` | Delivery log, channel/status breakdown, templates |

A new platform permission set (`platform.ecosystem.read`, `platform.coupon.read`,
`platform.coupon.manage`, `platform.notification.read`, `platform.notification.manage`)
gates the surfaces. A company administrator holds none of them, so the control panel
is invisible **and** the API refuses the calls — the UI only hides what the API would
already reject.

---

## 2. Files changed

### Backend — `apps/api`

| File | Change |
| --- | --- |
| `src/coupons/coupons.module.ts` | New module, registered in `app.module.ts` |
| `src/coupons/coupons.service.ts` | Discount computation, CRUD, validation, redemption |
| `src/coupons/coupons.controller.ts` | `/coupons` REST surface |
| `src/coupons/coupons.dto.ts` | Validated request bodies |
| `src/platform/ecosystem.service.ts` | Platform-wide aggregate builder |
| `src/platform/platform-settings.controller.ts` | `GET /platform/ecosystem` |
| `src/platform/platform.module.ts` | Registers and exports `EcosystemService` |
| `src/notifications/staff-notification.controller.ts` | `/notifications/*` staff surface |
| `src/notifications/notification.service.ts` | `listDeliveries`, `deliveryBreakdown`, `listTemplates`, `setTemplateActive` |
| `src/notifications/notifications.module.ts` | Registers the staff controller |
| `src/rbac/rbac.controller.ts` | `GET /permissions/role-templates` |
| `src/app.module.ts` | Wires `CouponsModule` |

### Shared — `packages/shared`

| File | Change |
| --- | --- |
| `src/contracts.ts` | `EcosystemOverviewResponse`, `EcosystemMetric`, `EcosystemBreakdown`, `CouponDto`, `CouponValidationResponse` |
| `src/permissions.ts` | Five new `platform.*` permissions |

### Database — `packages/database`

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `Coupon` model + `CouponDiscountType` enum |
| `prisma/migrations/20261031120000_execution_12_coupons/` | Creates the table |
| `prisma/seed.ts` | `seedCoupons` — three idempotent launch coupons |

### Admin — `apps/admin`

| File | Change |
| --- | --- |
| `src/app/(app)/ecosystem/page.tsx` | New Ecosystem Overview page |
| `src/app/(app)/coupons/page.tsx` | New Coupons page |
| `src/app/(app)/notifications/page.tsx` | New Notification Centre page |
| `src/lib/api.ts` | `ecosystem`, `coupons`, `coupon`, `createCoupon`, `updateCoupon`, `deleteCoupon`, `validateCoupon`, `notificationSummary`, `notificationDeliveries`, `notificationTemplates` |
| `src/lib/navigation.ts` | `CONTROL_PANEL_NAV` group |
| `src/i18n/dictionaries.ts` | English + Arabic keys for the whole control panel |
| `src/components/icons.tsx` | `globe`, `tag`, `bell` icons |
| `e2e/execution12-control-panel.spec.ts` | Eight Playwright acceptance tests |

---

## 3. Backend endpoints

All routes are versioned under `/api/v1` (the UI calls `/api/platform/ecosystem`
because the admin client prefixes the version).

| Method | Route | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/platform/ecosystem` | `platform.ecosystem.read` | Platform-wide KPI payload |
| GET | `/coupons` | `platform.coupon.read` \| `manage` | `?includeInactive=&companyId=` |
| GET | `/coupons/:id` | `platform.coupon.read` \| `manage` | Single coupon |
| POST | `/coupons` | `platform.coupon.manage` | Create (code ≥ 3 chars, unique) |
| PATCH | `/coupons/:id` | `platform.coupon.manage` | Edit |
| DELETE | `/coupons/:id` | `platform.coupon.manage` | Withdraw |
| POST | `/coupons/validate` | authenticated | Validate against a subtotal |
| GET | `/notifications/summary` | `platform.notification.read` \| `manage` | Channel + status breakdown |
| GET | `/notifications/deliveries` | `platform.notification.read` \| `manage` | Paginated delivery log |
| GET | `/notifications/templates` | `platform.notification.read` \| `manage` | Template catalogue |
| POST | `/notifications/announcements` | `platform.notification.manage` | In-app staff announcement |
| POST | `/notifications/templates/:id/toggle` | `platform.notification.manage` | Enable/disable a template |
| GET | `/permissions/role-templates` | company role / platform role | Named templates, delegation-filtered |

### Design rules held

- **Money is integer minor units.** Coupon discounts use `basisPointsOfMinor`; the
  discount is computed in exactly one place (`computeDiscount`) so checkout and the
  validation endpoint can never disagree.
- **Percentages are basis points** (1500 = 15%), matching the rest of the schema.
- **A company administrator can never author a coupon.** `POST/PATCH/DELETE` require
  `platform.coupon.manage`, which is a `PLATFORM` permission that is not delegable.
- **The role-template endpoint filters by what the caller may delegate**, so a
  company template can never be used to escalate to a platform permission.
- **A validation failure is a 200 with a reason**, not an error — an unknown or
  inactive code is a normal outcome the checkout screen must render.

---

## 4. Real HTTP test results

### API integration suite

```
pnpm --filter @oryx/api test:e2e
Test Suites: 23 passed, 23 total
Tests:       448 passed, 448 total
Time:        56.064 s
```

The suite includes `test/execution12-platform-control.e2e-spec.ts` (23 tests):

- ecosystem aggregates to a Super Admin; refused to a company administrator and to an anonymous caller;
- coupon create → read → update → list; duplicate code rejected; percentage outside 0–100% rejected; authoring refused for a company administrator;
- coupon validation applies the discount and caps it at the subtotal; unknown code returns a reason; inactive / below-minimum codes are refused;
- notification delivery log, channel/status summary and templates; delivery log refused for a company administrator;
- role templates return a permission preview and never leak a platform permission.

The database was migrated and seeded immediately before the run. Two rows the ERP
UI suite depends on (the demo tenant's products and opening stock) were absent from a
stale local database; re-running `pnpm db:seed` restored them, and the previously
failing Execution 02 valuation test then passed on its own and in the full suite.
That was a stale-fixture artefact, **not a code regression**.

### A real fixture defect, found and fixed

Chasing the stale state surfaced a genuine bug rather than only a stale database.
`apps/api/test/execution10-mobile-integration.e2e-spec.ts` borrows the **seeded**
`DEMO-ALNOOR` tenant as its fixture, then cleaned up with a company-scoped
`prisma.product.deleteMany({ where: { companyId } })`. That also removed the seeded
catalog and its opening stock, so the Execution 02 inventory UI test failed on the
*next* run — a destructive test that corrupted shared seed data.

The cleanup now deletes only the two products the spec created
(`where: { id: { in: [productId, otherProductId] } }`). Verified end to end:

```
pnpm db:seed && pnpm --filter @oryx/api test:e2e
Test Suites: 23 passed, 23 total
Tests:       448 passed, 448 total
AFTER FULL E2E: demo products 4  levels 4
```

The seeded catalog now survives a full API run, and the suite is idempotent — it can
be run repeatedly without a reseed and without breaking the UI suite.

### UI acceptance suite

```
pnpm --filter @oryx/admin test:ui
  1 skipped
  192 passed (7.8m)
```

Zero failures across the whole admin suite (193 tests: 192 passed, 1 skipped — the
`capture.spec.ts` screenshot task, skipped by design). The Execution 12 spec
`e2e/execution12-control-panel.spec.ts` accounts for 8 of those:

1. the control-panel navigation is visible to the Super Admin (after `setLocale('en')`);
2. the ecosystem overview renders real platform metrics;
3. the coupon list shows the seeded launch coupons (`WELCOME15`, `SAVE5`);
4. the coupon tester applies the server-side discount (BHD 100.000 → BHD 15.000);
5. a coupon created through the UI persists and is deleted again in a `finally` block;
6. the notification centre lists deliveries and templates;
7. the notification centre renders right-to-left in Arabic;
8. a company administrator is refused the control panel.

The mutation test cleans up through the API in a `finally` block, and the seeded
coupons are never mutated, so the suite leaves no residue for a later run. The seeded
catalog (4 demo products, 4 stock levels, 3 coupons) was verified intact after the
full UI run.

### Environment failures resolved during this execution

Three environment problems produced failures that were **not** code defects. Each is
recorded in `AGENTS.md` so the next session does not rediscover it:

- The sandbox restart removed the Playwright browsers; every UI test failed in ~3ms
  with `Executable doesn't exist`. Fixed with
  `pnpm --filter @oryx/admin exec playwright install chromium`.
- `.env` sets `AUTH_THROTTLE_LIMIT=10`, and `scripts/dev-up.sh` sources it, so the
  API it started throttled logins after ten attempts and the suite failed with 30s
  `waitForURL` timeouts. Restarting the API with
  `AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000`
  resolved every one of them; the two roles tests then passed in 5s.
- The stale/destructive fixture state described above.

---

## 5. Mobile and cross-cutting results

| Check | Result |
| --- | --- |
| `pnpm --filter @oryx/mobile test` | 6 files, **93 passed** |
| `pnpm --filter @oryx/shared test` | 9 files, **180 passed** |
| API typecheck | pass |
| Admin typecheck | pass |
| Customer typecheck | pass |
| Mobile typecheck | pass |
| Admin lint (`--max-warnings=0`) | pass |
| Customer lint | pass |
| Mobile lint | pass |
| React version regression | `react` and `react-dom` resolve to **19.1.0** in admin, customer and mobile |
| Admin production build | pass — `/ecosystem`, `/coupons`, `/notifications` prerendered |

---

## 6. Security verification

- **Server-side authorization.** Every new route carries `@PlatformOnly()` and an
  explicit `@RequireAnyPermission` / `@RequirePermissions` guard. Hiding a nav item is
  a convenience, never the control.
- **No tenant leakage to a company administrator.** The e2e spec asserts that a
  company administrator receives `403` for the ecosystem, coupon authoring and the
  delivery log.
- **Delegation is respected.** `role-templates` filters each template's permission
  list through `delegablePermissions`, and a test asserts no platform permission ever
  appears inside a company template.
- **No secret is echoed.** The control panel reads no credentials; the ecosystem
  payload carries counts and minor-unit totals only.
- **Validation at the edge.** Coupon bodies are `class-validator` DTOs; the service
  additionally rejects a short code, a duplicate code, a percentage outside 0–100%
  and a negative fixed amount.
- **Audit.** Platform settings writes already flow through `AuditService`; coupons
  carry `createdById` so authorship is attributable.

---

## 7. Design preservation

- The Homepage was **not** redesigned.
- The dark navy and gold ORYX visual identity is unchanged; the new pages reuse the
  existing `Card`, `SectionHeader`, `Badge`, `Button`, `Field`, `Modal`, `EmptyState`,
  `ErrorBanner`, `Skeleton` and `TableShell` components.
- No new slider images, no onboarding screens and no startup changes were introduced.
- The new pages render in both languages and both themes; a test asserts RTL in Arabic.

---

## 8. Remaining incomplete work

Execution 12 is a **dashboard and control-panel** execution. The following items
from the wider roadmap remain open and are **not** claimed as done here:

- Customer-side redemption of a coupon at live checkout (the API endpoint exists and
  is tested; wiring it into the customer checkout screen is outstanding).
- Sending a real email/SMS/WhatsApp announcement through a configured provider. The
  announcement endpoint records an in-app delivery; external transport still reports
  itself unconfigured without credentials, by design.
- Android visual acceptance of the mobile Splash and Homepage. This report makes no
  claim about it — a DOM or UI-hierarchy assertion is not a substitute for an
  on-device check.
- Product image upload from the admin UI, and SENSAGE inspection image upload. These
  belong to a later execution and were not part of Execution 12's scope.

---

## 9. Final commit

Implementation commit `dfc1c7f` on `feature/execution-07-premium-web` — the commit
that accompanies this report. PR #7 remains **open and draft**; nothing was merged or
deployed, and no new APK was published.

Baseline before this execution: `36afef64086a28dbe…`.
