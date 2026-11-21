# Execution 20 — P3–P7 ecosystem completion, mobile readiness and production preparation

**Baseline:** `515ea76` · **Branch:** `feature/execution-07-premium-web` · PR #7 **Draft**
**Database:** PostgreSQL 16, additive migrations only, no destructive change

---

## 1. Scope

Execution 20 completes the five **planned automotive-ecosystem** items (P3–P7)
that the master reference lists as "plan now, build later", plus the remaining
mobile-readiness and production-preparation work. It does **not** re-implement
anything from Executions 16–19: the customer checkout, provider portal, booking
engine, payments, notifications, integrations centre and every ERP module were
already delivered and are reused as-is.

The work is deliberately additive. No backend framework is introduced, no second
ledger, no second media store, no second provider API.

1. **P3** — Auto Map proximity discovery.
2. **P4** — spare-parts RFQ, fitment verification and consumer returns.
3. **P5** — recovery / SOS dispatch and tracking.
4. **P6** — fleet accounts, fleet vehicles and drivers.
5. **P7** — SENSAGE AI as explainable, reviewed assistance.
6. Mobile readiness: live RFQ, returns, recovery, fleet and SENSAGE screens.
7. Customer-website RFQ and returns surfaces.
8. Tests, real HTTP evidence and this report.

The per-item implementation matrix lives in `docs/ORYX-P3-P7-STATUS.md`.

---

## 2. Files changed

### Backend (`apps/api`)

| File | Change |
| --- | --- |
| `src/ecosystem/ecosystem.module.ts` | **New** — registers the ecosystem surface |
| `src/ecosystem/customer-ecosystem.controller.ts` | **New** — consumer plane (RFQ, returns, recovery, fleets, fitment, SENSAGE) |
| `src/ecosystem/ecosystem.controller.ts` | **New** — provider plane and staff/admin plane |
| `src/ecosystem/ecosystem.service.ts` | **New** — RFQ, returns, recovery, fleet, fitment logic |
| `src/ecosystem/sensage-ai.service.ts` | **New** — validation, timeout/retry, usage limits, suggestion store |
| `src/ecosystem/ai-adapters.ts` | **New** — test / OpenAI-compatible / unconfigured adapters |
| `src/ecosystem/ecosystem.dto.ts` | **New** — validated request DTOs |
| `src/app.module.ts` | Registers `EcosystemModule` |
| `src/common/errors.ts` | Ecosystem error codes |
| `src/common/document-sequence.service.ts` | RFQ / return / recovery reference sequences |
| `src/marketplace/marketplace-public.controller.ts` | `lat` / `lng` / `radiusKm` proximity query |
| `src/marketplace/marketplace.service.ts` | Distance sort and radius filter |
| `src/marketplace/marketplace.dto.ts` | Proximity DTO |
| `src/integrations/integrations.service.ts` | `SENSAGE_AI` provider wiring |

### Database and shared

| File | Change |
| --- | --- |
| `packages/database/prisma/schema.prisma` | RFQ, quote, return, recovery, fleet, driver, AI suggestion, provider coordinates |
| `packages/database/prisma/migrations/20261103043251_execution_20_ecosystem_p3_p7/` | **New** migration |
| `packages/database/prisma/migrations/20261103044240_execution_20_return_stock_source/` | **New** migration (return stock source) |
| `packages/shared/src/geo.ts` | **New** — haversine distance and radius helpers |
| `packages/shared/src/contracts.ts` | Ecosystem DTO contracts |
| `packages/shared/src/integrations.ts` | `SENSAGE_AI` catalogue entry |
| `packages/shared/src/index.ts` | Exports `geo.ts` |

### Mobile (`apps/mobile`)

| File | Change |
| --- | --- |
| `src/lib/live-recovery.tsx` | **New** — server-backed recovery store |
| `src/components/fitment.tsx` | **New** — fitment card (unknown ≠ incompatible) |
| `src/app/rfqs/index.tsx`, `src/app/rfqs/[id].tsx` | **New** — RFQ list and detail |
| `src/app/returns/index.tsx`, `[id].tsx`, `new.tsx` | **New** — returns list, detail, raise |
| `src/app/fleets/index.tsx` | **New** — fleet list |
| `src/app/sensage/ai.tsx` | **New** — reviewed AI analysis path |
| `src/app/recovery/index.tsx`, `[id].tsx` | Live recovery list and tracking |
| `src/app/sensage/index.tsx` | Live analysis entry |
| `src/app/parts/[id].tsx` | Fitment card and related products |
| `src/lib/api.ts` | RFQ, returns, recovery, fleet, fitment, SENSAGE clients |
| `src/lib/i18n.ts` | Arabic and English keys for the new screens |
| `src/app/_layout.tsx` | Provider tree and stack entries |

### Customer website (`apps/customer`)

| File | Change |
| --- | --- |
| `src/app/rfqs/page.tsx` | **New** — RFQ list, raise and accept a quote |
| `src/app/returns/page.tsx` | **New** — returns list and permitted cancellation |
| `src/lib/api.ts` | `customerApi` RFQ and returns methods |
| `src/i18n/dictionaries.ts` | `rfq.*`, `returns.*`, `nav.rfqs`, `nav.returns` |
| `src/components/site-chrome.tsx` | Navigation entries |

### Admin (`apps/admin`)

| File | Change |
| --- | --- |
| `src/app/(app)/ecosystem/returns/page.tsx` | **New** — return queue |
| `src/app/(app)/ecosystem/recovery/page.tsx` | **New** — recovery dispatch queue |
| `src/app/(app)/ecosystem/sensage/page.tsx` | **New** — AI review queue |
| `src/lib/navigation.ts`, `src/lib/api.ts`, `src/i18n/dictionaries.ts` | Navigation, clients and copy |

### Tests and evidence

| File | Change |
| --- | --- |
| `apps/api/test/execution20.e2e-spec.ts` | **New** — 50 P3–P7 integration tests |
| `apps/mobile/test/ecosystem-honesty.test.ts` | **New** — 10 honesty guards |
| `apps/mobile/test/live-endpoints.test.ts` | Ecosystem route and plane assertions |
| `scripts/exec20-smoke.sh` | **New** — 31-check real HTTP smoke test |
| `docs/ORYX-P3-P7-STATUS.md` | **New** — implementation matrix |

---

## 3. Backend endpoints

All new consumer routes live under `/api/v1/customer` and resolve the account
from the verified token — never from a path or a body parameter.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/marketplace/providers?lat=&lng=&radiusKm=` | Auto Map proximity discovery (P3) |
| `POST` | `/customer/rfqs` | Raise a spare-part RFQ (P4) |
| `GET` | `/customer/rfqs` | List own RFQs |
| `GET` | `/customer/rfqs/:id` | Read one own RFQ |
| `POST` | `/customer/rfqs/:id/cancel` | Cancel an open RFQ |
| `POST` | `/customer/rfqs/:id/quotes/:quoteId/accept` | Accept exactly one quote |
| `POST` | `/customer/orders/:orderId/returns` | Raise a return against an own order |
| `GET` | `/customer/returns` | List own returns |
| `GET` | `/customer/returns/:id` | Read one own return |
| `POST` | `/customer/returns/:id/cancel` | Cancel a permitted return |
| `GET` | `/customer/fitment?vehicleId=&productId=` | Fitment for an own vehicle |
| `POST` | `/customer/recovery` | Raise a recovery / SOS request (P5) |
| `GET` | `/customer/recovery` | List own recovery requests |
| `GET` | `/customer/recovery/:id` | Track one own request |
| `POST` | `/customer/recovery/:id/cancel` | Cancel a permitted request |
| `POST` | `/customer/fleets` | Create a fleet (P6) |
| `GET` | `/customer/fleets` | List own fleets |
| `GET` | `/customer/fleets/:id` | Read one own fleet |
| `POST` | `/customer/fleets/:id/vehicles` | Add an own vehicle |
| `POST` | `/customer/fleets/:id/vehicles/:vehicleId/remove` | Remove a vehicle |
| `POST` | `/customer/fleets/:id/drivers` | Add a driver |
| `POST` | `/customer/fleets/:id/drivers/:driverId/active` | Toggle a driver |
| `GET` | `/customer/sensage/status` | Provider status (P7) |
| `POST` | `/customer/sensage/analyze` | Request an analysis (stored `PENDING`) |
| `GET` | `/customer/sensage/suggestions` | List own suggestions |
| `GET` | `/customer/sensage/suggestions/:id` | Read one own suggestion |

Provider plane: `GET /provider/rfqs`, `POST /provider/rfqs/:id/quotes`,
`GET /provider/quotes`, `POST /provider/quotes/:id/withdraw`,
`GET /provider/recovery`, `POST /provider/recovery/:id/advance`.

Staff/admin plane: `GET /ecosystem/returns`,
`POST /ecosystem/returns/:id/decide|receive|refund`, `GET /ecosystem/recovery`,
`POST /ecosystem/recovery/:id/assign`, `GET /ecosystem/sensage/suggestions`,
`POST /ecosystem/sensage/suggestions/:id/review`.

---

## 4. Real HTTP test results

Run against a live compiled API (`node apps/api/dist/main.js`) on the migrated
and seeded `oryx_test` database. Every assertion below is a real HTTP status or a
field read from a real response. Throttle limits were raised
(`AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000`).

```
Execution 20 smoke — http://127.0.0.1:3001/api/v1

== P3 — Auto Map proximity discovery ==
  PASS providers by proximity (200)
  PASS out-of-range latitude refused (400)
  PASS half a coordinate refused (400)

== P4 — spare-parts RFQ ==
  PASS raise RFQ (201)
  PASS list own RFQs (200)
  PASS RFQs without a token refused (401)
  PASS consumer token refused on the provider RFQ queue (401)
  PASS cancel own RFQ (200)

== P4 — consumer returns ==
  PASS list own returns (200)
  PASS return on a foreign order refused (404)

== P4 — fitment ==
  PASS create a garage vehicle (201)
  PASS read the public catalogue (200)
  PASS fitment query for a real product (200)
  PASS unknown fitment reported honestly, not as incompatible (False)
  PASS fitment for an unknown product refused (404)
  PASS fitment for a foreign vehicle refused (404)

== P5 — recovery dispatch and tracking ==
  PASS recovery without a pickup location refused (400)
  PASS raise a recovery request (201)
  PASS track own recovery (200)
  PASS tracking timeline has an event (1)
  PASS list own recoveries (200)

== P6 — fleets and drivers ==
  PASS create a fleet (201)
  PASS list own fleets (200)
  PASS add a driver (201)
  PASS toggle a driver (200)
  PASS foreign fleet read refused (404)

== P7 — SENSAGE AI ==
  PASS SENSAGE status (200)
  PASS no model configured without a credential (False)
  PASS list own suggestions (200)
  PASS analyse an unknown photo refused (404)

Execution 20 smoke — 31 passed, 0 failed
```

Reproduce with:

```bash
DATABASE_URL='postgresql://oryx:oryx_dev_password@127.0.0.1:5432/oryx_test?schema=public' \
AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000 \
node apps/api/dist/main.js &
API_BASE=http://127.0.0.1:3001/api/v1 bash scripts/exec20-smoke.sh
```

---

## 5. Automated test results

The dedicated `oryx_test` database was created, migrated
(`pnpm db:migrate`) and seeded (`pnpm db:seed`) before the suites ran. It is not
empty or uninitialised.

```
API e2e:      28 suites, 548 tests   all passing
  └ execution20.e2e-spec.ts: 50 tests covering P3–P7 and tenant isolation
Shared:        9 files,  182 tests   all passing
Mobile:        9 files,  139 tests   all passing
  └ ecosystem-honesty.test.ts: 10 tests (SENSAGE, fitment, recovery)
Mobile ERP:    2 files,   31 tests   all passing
Typecheck:    all 7 workspace packages clean
Lint:         shared, database, api, admin, customer, mobile, mobile-erp clean
Build:        shared, database, api, customer all clean
React:        19.1.0 / react-dom 19.1.0 aligned across admin, customer,
              mobile and mobile-erp
```

### Mobile honesty guards (`ecosystem-honesty.test.ts`)

These are source-level guards on the two places a screen could misrepresent the
platform without breaking a type:

- **SENSAGE never presents a suggestion as a result.** The badge is driven by the
  server `verified` / `reviewStatus`, the analysis is offered only when
  `status.configured` is true, and an unconfigured provider states plainly that
  it produces nothing.
- **Fitment distinguishes unknown from incompatible.** The card reads
  `fitmentKnown` from the server rather than inferring it, and shows a distinct
  state for each of unknown / compatible / incompatible.
- **Recovery reads the server timeline** and offers cancellation only when the
  server reports the job cancellable; it polls rather than inventing a status.
- **Live recovery requires a real pickup point** (saved coordinates), not a
  free-text location.

---

## 6. Implemented screens

### Mobile

- **RFQ** — list and detail; raise a request, read provider quotes, accept one.
- **Returns** — list, detail and a raise form against an own order.
- **Recovery** — list and a detail screen with the append-only tracking
  timeline; live polling while the job is open.
- **Fleets** — fleet list with vehicles and drivers.
- **SENSAGE AI** — analysis entry and a reviewed-suggestion screen.
- **Fitment** — a card on the product detail that distinguishes unknown from
  incompatible and is not shown to a guest, who has no server-side garage.

### Customer website

- `/rfqs` — raise a request, read quotes, accept one; the accept control is
  offered only while the request is open.
- `/returns` — list own returns and cancel only those the server reports
  cancellable.

### Admin

- `/ecosystem/returns`, `/ecosystem/recovery`, `/ecosystem/sensage` — staff
  queues behind their permission keys.

---

## 7. Security verification

- **Account scope comes from the token.** Every consumer route resolves the
  account from the verified `audience: customer` token; no route accepts an
  account id from a path or a body. A foreign RFQ, return, recovery request,
  fleet, vehicle or photo is refused with `404` rather than leaked.
- **The consumer plane is refused on a staff route** and vice versa. A consumer
  token on `/provider/rfqs` is rejected by the principal guard with `401` before
  any permission is considered (verified live).
- **Fitment requires ownership of the vehicle.** A vehicle that is not in the
  caller's garage is refused with `404`.
- **A return can only be raised against an own, delivered order**, inside the
  window, and for no more than was ordered.
- **Exactly one quote can be accepted**; a second acceptance is refused with
  `409`, and a duplicate quote from the same provider is refused.
- **Recovery requires a real pickup location**; the tracking trail is
  append-only and a provider can only advance a request assigned to it, through
  the enforced state machine.
- **AI output is never trusted.** Model JSON is parsed and schema-checked before
  it is stored; every result is a `PENDING` suggestion, never a diagnosis. With
  no credential the provider reports `AWAITING_CREDENTIALS` and produces nothing.
- **The SENSAGE credential is sealed** (AES-256-GCM through the integrations
  centre) and never read back; the analysis path validates photo count, size and
  prompt length before any provider call.
- **No credential, token or secret value appears in any response or log.**

---

## 8. Remaining incomplete work

| Item | State |
| --- | --- |
| Third-party basemap tiles (P3) | **External.** Coordinates, radius discovery and distance sort are real; rendering a map needs a MAPS credential. |
| Live vendor payment gateway (P4) | **External.** The gateway adapter architecture exists; enabling a vendor needs its credential. |
| Real-time driver GPS stream (P5) | **External.** Dispatch and the tracking trail are real; a live GPS feed needs a device and a provider. |
| Separate installed driver app binary (P6) | **Not built.** The driver capability is delivered as an authenticated API and a fleet-portal screen; shipping a second store binary is a release activity. |
| Production AI vendor credential (P7) | **External.** The adapter and its tests do not need it; enabling the live model does. |
| Android device visual acceptance of Splash and Homepage | **Not done.** No `/dev/kvm`; the app renders through its Expo web export in Chromium. Not claimed as device acceptance. |
| Official ORYX logo and approved photography | **Blocked** — the assets were never supplied; the UI uses a neutral placeholder. |
| APK | **Not built**, per the brief. |

---

## 9. Delivery

- Committed to `feature/execution-07-premium-web` as `a9f2ad1` and pushed.
- **PR #7 stays open and Draft.** Not merged, not deployed.
- No production deployment and no APK were produced.

---

*Written by an AI agent (OpenHands) on behalf of the repository owner.*
