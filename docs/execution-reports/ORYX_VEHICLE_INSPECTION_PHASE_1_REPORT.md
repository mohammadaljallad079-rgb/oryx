# ORYX — Vehicle Inspection Development, Phase 1 Report (Intake + Registration-Card OCR)

Status: **implemented, tested and ready for owner review**. Nothing is merged and
nothing is deployed. No existing behaviour was removed and no other module was
changed.

## 1. Scope delivered

Phase 1 of three: the vehicle-inspection **creation (intake) screen** plus a
**registration-card OCR read endpoint** that pre-fills it.

| Deliverable | Where |
| --- | --- |
| Intake screen (manual + camera/photo scan) | `apps/admin/src/app/(app)/automotive/inspections/new/page.tsx` |
| Entry point from the inspections list | `apps/admin/src/app/(app)/automotive/inspections/page.tsx` (bookings tab) |
| Card reader endpoint | `POST /api/v1/automotive/vehicle-card/read` — `apps/api/src/automotive/vehicle-card.controller.ts` |
| OCR service (lazy worker, serialised) | `apps/api/src/automotive/vehicle-card-ocr.service.ts` |
| Pure card parser (Arabic + English) | `apps/api/src/automotive/vehicle-card-parser.ts` |
| Intake create / read / update API | `apps/api/src/automotive/vehicle.controller.ts`, `vehicle.service.ts` |

The vehicle can be **existing** (selected from the customer's vehicles) or
**new** (entered by hand or read from a photo of the Bahraini registration card,
«ملكية السيارة»). The inspection is saved as a **DRAFT** or **SCHEDULED**
against a chosen customer, with the report sections (PAINT / CHASSIS /
COMPREHENSIVE), scheduled time, odometer and notes.

The card reader **only suggests**: every field stays editable, the fields it
could not read confidently are flagged for a human to check, and the raw OCR
text is available for review. Nothing is written by the read endpoint.

## 2. Data model changes

Migration `20261108211833_inspection_intake_phase1` and
`20261108212116_inspection_booking_customer_fk` (both applied; `prisma migrate
status` = up to date):

- `InspectionBookingStatus` gains `DRAFT` (an unfinished, editable inspection).
- `InspectionBooking.serviceId` becomes **nullable** with `ON DELETE SET NULL`,
  so an inspection driven by report sections does not need a priced catalog
  service. Invoicing an inspection without a service is refused with a clear
  message rather than crashing.
- `InspectionBooking.inspectionTypes TEXT[]` persists the selected sections.
- `InspectionBooking` gains an explicit `customer` relation and an index on
  `(companyId, customerId)`.
- `Vehicle.vin` becomes **nullable**: a card whose chassis line is unreadable
  still yields a valid vehicle, and Postgres keeps every NULL distinct so the
  company-unique VIN constraint only constrains vehicles that actually carry a
  VIN. When a VIN *is* supplied it is still validated (11–17 chars, no I/O/Q)
  and checked for duplicates.

Every change is additive or a relaxation; no column, row or document was
deleted.

## 3. Security and tenant boundaries (unchanged baseline, extended)

- The card reader requires the `automotive_inspections` module and the
  `erp.vehicle.manage` permission; intake creation and update require
  `erp.inspection.booking.manage`; reads accept `erp.inspection.read` or
  `erp.inspection.booking.manage`. Enforcement is server-side.
- The vehicle and customer must both belong to the caller's company, and the
  vehicle must belong to the chosen customer; a cross-tenant pair is rejected
  (covered by an e2e test that expects 403/404).
- An **approved** inspection is immutable; a `COMPLETED` status cannot be set
  through the intake update path — an inspection is completed by approving its
  report.
- Uploads are capped at 12 MB and restricted to JPEG/PNG/WebP; anything else is
  a 400, not a 500.
- The OCR worker pool is created lazily and terminated on module destroy, so the
  API does not pay for the engine at boot and does not leak workers between test
  runs. Trained data is cached under the gitignored runtime `storage/` dir and is
  never committed.

## 4. Tests (all executed against the real stack)

| Suite | Result |
| --- | --- |
| API integration `test/inspection-intake.e2e-spec.ts` | **13 passed** |
| API unit `src/automotive/vehicle-card-parser.spec.ts` | **5 passed** |
| Admin UI `e2e/inspection-intake.spec.ts` (incl. real OCR scan + DB assertion) | **4 passed** |
| Shared unit `@oryx/shared test` | **93 passed** |
| Full API integration `@oryx/api test:e2e` | **241 passed / 10 suites** |
| Full browser `@oryx/admin test:ui` | **127 passed**, 1 flake (first-login timeout; passes in isolation) |
| `typecheck` — admin, api, customer, mobile | clean |
| `lint` (`eslint --max-warnings=0`) — admin | clean |

The UI suite drives the **real** OCR engine against a real registration-card
photo (`apps/api/test/fixtures/vehicle-registration-card.png`), asserts the form
fills with `649525 / Mercedes / E300 / 2020 / Gray / JTHDA1D20P5125981`, saves
the inspection, and then reads the database to confirm the vehicle, its mileage
(51000) and the booking's `inspectionTypes` (`PAINT` + `CHASSIS`). The suite
removes everything it created through Prisma.

### Known flake (not a regression)

The very first Playwright test in a full run can time out at
`waitForURL('**/dashboard')` while the freshly started admin server warms up;
it passed 1.6 s in isolation and all 127 other tests passed. This predates this
change.

## 5. Visual evidence

Real renders captured by `e2e/screenshots.spec.ts` →
`docs/execution-reports/screenshots/`:

- `inspection-intake-en-dark.png` (1440×1162)
- `inspection-intake-ar-dark.png` (1440×1141, RTL)
- `inspection-intake-en-light.png` (1440×1162)
- `inspection-intake-mobile-en-light.png` (420×1747)

All four are non-blank, correctly sized, and show the customer selector, the
scan panel, the editable vehicle fields, the inspection-section checkboxes and
the save controls in both languages, both themes and on mobile.

## 6. How to verify locally

```bash
pnpm --filter @oryx/shared build && pnpm --filter @oryx/database build
pnpm --filter @oryx/api test:e2e          # 241 passed
pnpm --filter @oryx/admin test:ui         # sign-in flake aside, 127 passed
```

With the API (`:3001`) and admin (`:3000`) running, sign in as the Enterprise
tenant (`admin@oryx-auto.local`), open **Automotive → Inspections → Bookings →
New inspection**, photograph a registration card, confirm the fields and save.

## 7. Explicitly not in scope

Phases 2 and 3 (findings capture, the approved PDF/QR report and its approval
workflow beyond what Execution 03 already shipped) were **not** touched. No other
module, screen or function was changed, and no local modification was reverted.
