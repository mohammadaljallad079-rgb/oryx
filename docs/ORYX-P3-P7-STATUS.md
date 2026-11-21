# ORYX — P3–P7 planned-ecosystem status

This document is the implementation matrix for the five **planned automotive
ecosystem** items. The definitions are quoted from
`docs/ORYX_MASTER_REFERENCE.md`, section *Planned automotive ecosystem (later
implementation)* — they are not invented here.

> **Scope note.** The master reference says of this list: *"Plan APIs and admin
> boundaries now; do not claim these user apps are built in Phase 1."* Execution
> 20 therefore completes the **server-side capabilities and admin boundaries**
> that a later app release consumes. It does not claim App Store or Play Store
> readiness.

## Original definitions

| # | Definition (verbatim) |
| --- | --- |
| P3 | Auto Map: discovery of garages, inspection centers, spare parts and mobile services. |
| P4 | Multi-vendor spare parts marketplace, fitment verification, ordering, returns and RFQ. |
| P5 | Recovery / SOS / driver dispatch and tracking. |
| P6 | Consumer Super App, vendor/workshop/inspection/recovery/fleet portals and driver app. |
| P7 | AI insights as explainable, reviewed assistance — not unverified diagnosis. |

## Status summary after Execution 20

| # | Before | After | Remaining |
| --- | --- | --- | --- |
| P3 | PARTIAL — categories and providers exist; no map rendering | **Capability complete** — provider coordinates, radius discovery, distance sort, admin editing, client surfaces | Third-party basemap tiles need a MAPS credential |
| P4 | PARTIAL — catalog and RFQ models; no consumer checkout | **Capability complete** — consumer checkout existed since Exec 11; RFQ (request → quote → accept) and consumer returns added | Live vendor payment gateway (external) |
| P5 | PARTIAL — provider category only | **Capability complete** — recovery request, provider assignment, dispatch status trail, tracking events | Real-time driver GPS stream (device + external) |
| P6 | PARTIAL — provider portal and mobile app exist; fleet/driver apps do not | **Server-side complete** — fleet accounts, fleet vehicles, driver assignment and a fleet-scoped portal API | A separate installed driver app binary |
| P7 | PARTIAL — human-approval workflow exists; no model wired | **Capability complete** — AI provider adapter, sealed credentials, validation, timeout/retry, usage limits, cost guard, test provider | A production AI vendor credential (external) |

---

## P3 — Auto Map discovery

### Requirements
Discover garages, inspection centres, spare-parts sellers and mobile services by
location.

### Existing before Execution 20
- `MarketplaceProvider` with `categoryKey`, `status`, `ProviderServiceListing`.
- `GET /marketplace/providers` directory with category filtering.
- `CustomerAddress` already carries `latitude` / `longitude` (Decimal 10,7).
- `SERVICE_CATEGORIES` shared catalogue with a `recovery` category.

### Missing
- No coordinates on `MarketplaceProvider`.
- No distance or radius query.
- No admin control to set a provider's location.
- No client surface that orders by proximity.

### Dependencies
`MarketplaceProvider`, `CustomerAddress`, the shared provider directory DTOs.

### Implemented (Execution 20)
- `MarketplaceProvider.latitude` / `longitude` (nullable Decimal 10,7).
- `GET /marketplace/providers?lat=&lng=&radiusKm=` returns `distanceKm`,
  ordered nearest-first when coordinates are supplied.
- Admin: coordinate fields on the provider editor.
- Distance is computed with a plain haversine in SQL-adjacent code; no map
  vendor is required to answer "what is near me".

### Required tests
- A provider with coordinates is returned with the correct `distanceKm`.
- A radius filter excludes a provider outside it.
- A provider without coordinates never appears in a proximity query.
- An invalid latitude/longitude is a 400.

---

## P4 — Multi-vendor spare-parts marketplace

### Requirements
Fitment verification, ordering, returns and RFQ.

### Existing before Execution 20
- Product catalogue, stores, categories, vehicle catalogue, offers.
- `ProviderOffer`, `PartCompatibility` (fitment), `PartReference`.
- Consumer cart and **consumer checkout** — `CustomerOrder`, idempotent
  `placeOrder`, stock through `InventoryService.recordMovement` (Execution 11).
- Provider portal order status management.

### Missing
- **RFQ**: the master reference names it; `PurchaseRequisition` is internal and
  consumer-facing RFQ did not exist.
- **Returns**: consumer-facing return of a placed order did not exist.
- Fitment lookup was by part reference, not exposed for a consumer to check
  "does this fit my car".

### Dependencies
`CustomerOrder`, `Product`, `PartCompatibility`, `Vehicle`,
`InventoryService`, the provider portal.

### Implemented (Execution 20)
- RFQ: `CustomerRfq` + `CustomerRfqQuote`; a consumer raises a request, approved
  providers quote, the consumer accepts one quote (which is exclusive).
- Consumer returns: `CustomerOrderReturn` + lines; a return is only possible
  inside a window, only for a delivered/completed order, and a return moves
  stock back through the same ledger the order used.
- Fitment endpoint: given a vehicle and a product, report compatibility from
  `PartCompatibility`.

### Required tests
- An RFQ can be raised, quoted and accepted; a second acceptance is refused.
- A return inside the window succeeds and restores stock.
- A return outside the window, or on another account's order, is refused.
- A fitment query reports compatible and incompatible correctly.

---

## P5 — Recovery / SOS / dispatch and tracking

### Requirements
A breakdown request, dispatch to a recovery provider, and tracking.

### Existing before Execution 20
- `recovery` service category and recovery providers.
- `ServiceRequest` with `providerId`, `assignedAt`, `completedAt` and a status
  enum, used generically by the marketplace.
- The mobile app has recovery screens reading the provider directory.

### Missing
- A recovery request carried no pickup location, vehicle or urgency.
- No explicit dispatch status trail.
- No tracking events a client can poll.

### Dependencies
`ServiceRequest`, `MarketplaceProvider`, `Vehicle`, `CustomerAddress`.

### Implemented (Execution 20)
- `RecoveryRequest` carrying pickup coordinates, vehicle, contact, urgency and a
  state machine (`REQUESTED → ASSIGNED → EN_ROUTE → ON_SITE → COMPLETED`, plus
  `CANCELLED`).
- `RecoveryTrackingEvent` append-only trail; every transition writes one.
- Customer endpoints to raise, read and cancel; provider endpoints to accept,
  advance and complete.

### Required tests
- A request cannot skip a state in the machine.
- Every transition appends exactly one tracking event.
- A provider not assigned to the request cannot advance it.
- A customer cannot read another account's recovery request.

---

## P6 — Consumer Super App and portals

### Requirements
Consumer Super App, vendor/workshop/inspection/recovery/**fleet** portals and a
**driver app**.

### Existing before Execution 20
- Consumer mobile app (`apps/mobile`), customer website (`apps/customer`).
- Provider portal (`provider-portal.controller.ts`) covering profile, listings,
  offers, availability, requests, earnings, settlements, reviews, disputes and
  orders.

### Missing
- **Fleet**: no fleet account, no fleet vehicle grouping, no fleet portal view.
- **Driver**: no driver record or assignment.

### Dependencies
`CustomerAccount`, `Vehicle`, `ServiceRequest`, the provider portal.

### Implemented (Execution 20)
- `FleetAccount` (owned by a `CustomerAccount`) and `FleetVehicle`.
- `Driver` records assigned to a fleet, with licence and contact fields.
- Fleet portal API: fleet profile, vehicles, drivers, and the requests raised
  against fleet vehicles.
- Assignment of a driver to a service request.

### Required tests
- A fleet is scoped to its owning account; a foreign read is refused.
- A driver cannot be assigned across fleets.
- Fleet vehicle listing returns only that fleet's vehicles.

### Not delivered
- A **separately installed driver application binary**. The driver capability is
  delivered as an authenticated API and a fleet-portal screen; shipping a second
  store binary is a release activity, not a capability gap.

---

## P7 — AI insights as reviewed assistance

### Requirements
Explainable, **reviewed** assistance — explicitly *not* unverified diagnosis.

### Existing before Execution 20
- SENSAGE photo upload with real, hardened storage (Execution 10).
- `RepairEstimate` / `RepairEstimateLine` with a human approval state machine.
- A mobile SENSAGE report that is a clearly-labelled **demo**.
- The integrations centre with AES-256-GCM sealed credentials.

### Missing
- No AI provider adapter; no credential, timeout, retry or usage limit.
- Nothing a real model could be wired into.

### Dependencies
`CustomerInspectionPhoto`, `MediaStorageService`, the integrations centre,
`SecretCipher`.

### Implemented (Execution 20)
- `AiProviderAdapter` interface with three implementations: a **deterministic
  test provider** (used by the automated suite), an **OpenAI-compatible HTTP
  adapter**, and an **unconfigured** adapter that reports itself unconfigured
  rather than returning a fabricated result.
- A `SENSAGE_AI` provider in the shared integrations catalogue, so its API key
  is stored sealed and never read back.
- Input validation (photo count, size, prompt length), output validation (the
  model's JSON is parsed and schema-checked, not trusted), a bounded timeout and
  bounded retries, per-company daily usage limits and a cost ceiling.
- Every result is stored as a **suggestion** with `reviewStatus: PENDING`; it is
  never presented as a diagnosis. The mobile demo report stays labelled demo.

### Required tests
- The test provider returns a validated suggestion; malformed model output is
  rejected rather than stored.
- A timeout is retried then fails cleanly.
- The daily usage limit refuses the request that exceeds it.
- With no credentials the provider reports `AWAITING_CREDENTIALS` and no
  analysis is produced.
- A stored suggestion is `PENDING` and is not exposed to a customer as a
  verified finding.

### External requirement
A production AI vendor key. The adapter and its tests do not need it; enabling
the live model does.

---

## Cross-cutting tests added in Execution 20

Every item above adds an API integration test, and the tenant-isolation suite is
extended so a fleet, an RFQ, a return, a recovery request and an AI suggestion
are each refused across a company or account boundary.
