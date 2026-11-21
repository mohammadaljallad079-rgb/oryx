# Execution 18 — labour-pricing scale defect, payroll exactness and branch administration

**Branch:** `feature/execution-07-premium-web` · PR #7 **Draft** (not merged, not
deployed)
**Database:** PostgreSQL 17 — no migration, no schema change, no seed change
**Baseline:** `92782a0` (Execution 17)
**Currency:** BHD, integer minor units (1000 fils = 1 BHD, `currencyScale = 3`)

---

## 1. What this execution is

Execution 17 closed the dashboard-density work and the sales-date contract fix.
Execution 18 continues from that commit and does three things:

1. probes the parts-reservation flow and the inspection scheduling path for
   *new* defects (both clean — recorded here so the negative result is durable);
2. fixes a real **labour-pricing scale defect** in the workshop module that
   under-priced labour by a factor of 100 when a job card was invoiced, and a
   matching **payroll overtime** defect in the same class;
3. fixes a **consistency defect** in the inventory insufficient-stock error and
   completes **branch administration** (edit and reactivate) in the admin UI.

It is not a re-audit of Execution 17 and does not repeat that work. Nothing
under `apps/customer` or `apps/mobile` was modified.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `packages/shared/src/money.ts` | Added `HOURS_SCALE`, `toHours`, `fromHours`, `hoursAmountMinor`, `hoursToQuantity` — labour durations are hundredths, a different scale from `QUANTITY_SCALE` |
| `packages/shared/test/money.test.ts` | Unit tests for the new helpers, including the `lineAmountMinor` wrong-scale contrast |
| `apps/api/src/automotive/workshop.service.ts` | Labour operations priced with `hoursAmountMinor`; invoice lines rescale hours with `hoursToQuantity` |
| `apps/api/src/hr/payroll-calculator.ts` | Overtime and unpaid-leave priced with `hoursAmountMinor` |
| `apps/api/src/inventory/inventory.service.ts` | `details.requested` reports the requested magnitude, matching the message |
| `apps/api/test/erp.e2e-spec.ts` | Asserts `details.requested` and the whole-unit message |
| `apps/api/test/execution03.e2e-spec.ts` | New labour-pricing regression test; payroll overtime assertion made exact |
| `apps/api/src/organizations/organizations.service.ts` | `toBranchDto` returns `addressLine` and `phone` |
| `packages/shared/src/contracts.ts` | `BranchDto` gains `addressLine` and `phone` |
| `apps/admin/src/app/(app)/branches/page.tsx` | Edit modal; reactivate action; phone column |
| `apps/admin/src/i18n/dictionaries.ts` | EN/AR strings for the new branch controls |
| `apps/admin/e2e/functional.spec.ts` | Browser test for branch edit and reactivate |
| `docs/audit/backend/EXECUTION_18_REPORT.md` | This report |

---

## 3. Defect A — labour was priced at a hundredth of its value

### 3.1 Symptom

A job card with 2.5 hours of labour at 25.000 BHD/hour produced an estimate and
an invoice of **0.625 BHD** instead of **62.500 BHD** — a factor of 100 too low.

### 3.2 Root cause

Three different scales meet in the workshop module:

- **money** — minor units, BHD scale 3 (1000 fils = 1 BHD);
- **quantity** — `QUANTITY_SCALE = 4`, so `2.5` units is stored as `25000`;
- **labour hours** — hundredths, so `2.5` hours is stored as `250`.

`lineAmountMinor(quantity, unitPriceMinor)` divides by `10^QUANTITY_SCALE`. When
a labour line passed `hours` (hundredths) where a `QUANTITY_SCALE` quantity was
expected, it divided by `10^4` instead of `10^2`, under-pricing by 100×. The same
mistake sat in the payroll calculator, where overtime is also hundredths of an
hour.

### 3.3 Fix

The labour scale is now explicit and named, so the two scales cannot be confused
again:

```ts
export const HOURS_SCALE = 2;
const HOURS_FACTOR = 10n ** BigInt(HOURS_SCALE);

export function toHours(value: string | number): number;   // "2.5" -> 250
export function fromHours(value: number): string;          // 250   -> "2.50"
export function hoursAmountMinor(hours: number, rateMinor: number): number;
export function hoursToQuantity(hours: number): number;    // 250 -> 25000
```

`workshop.service.ts` prices labour operations with `hoursAmountMinor` and
rescales `op.hours` onto quantity units with `hoursToQuantity` before building
the invoice line. `payroll-calculator.ts` uses `hoursAmountMinor` for overtime
and unpaid leave.

### 3.4 Live verification (real HTTP, port 3001)

Job card `JC-00005`/`JC-00006`, 2.5 h at 25.000 BHD/h:

| Step | Result |
| --- | --- |
| `POST /automotive/job-cards/:id/labour` (hours 250, rateMinor 25000) | **201**, `amountMinor = 62500` |
| `POST /automotive/job-cards/:id/estimates` (LABOUR quantity 25000, unitPriceMinor 25000) | **201**, subtotal **62500**, total **62500** |
| `POST /automotive/job-cards/:id/invoice` after approval | **201**, invoice total **62500** (62.500 BHD) |

Before the fix the invoice line was 625 fils (0.625 BHD). The regression test
`prices labour hours at hundredths scale when invoicing a job card` in
`execution03.e2e-spec.ts` locks the corrected value.

---

## 4. Defect B — payroll overtime in the same scale class

`payroll-calculator.ts` derived overtime with `lineAmountMinor(overtimeHours,
hourlyRate)`, dividing hundredths of an hour by `10^4`. With a 5000.00 BHD basic
and 2.00 h of overtime at 20.83 BHD/h the line read **0.42** instead of **41.66**.

It now uses `hoursAmountMinor`, and the Execution 03 payroll test asserts the
exact figure:

```
basic 5000.00 + 25% housing 1250.00 + overtime 41.66  ⇒  OVERTIME line = 4166 fils
```

---

## 5. Defect C — inconsistent inventory error detail

`inventory.service.ts` refused an over-issue with a message in whole units
(`requested 99900`) but a `details.requested` that carried the raw signed
movement (`-999000000`). The message and the detail disagreed in both sign and
scale. `details.requested` is now `-input.quantity`, the magnitude that was
asked for, matching the message:

```
message: Insufficient stock for BRAKE-PAD-F: on hand 0, requested 99900.
details: {"onHand":0,"requested":999000000}
```

`details` stays in raw `10^4`-scaled units to match `onHand`; only the sign
changed. Asserted in `erp.e2e-spec.ts`.

---

## 6. Branch administration completed

The branches screen could create and deactivate a branch but not edit one, and a
deactivated branch could never be brought back. `BranchDto` also omitted
`addressLine` and `phone`, so the API held data the UI could not show or set.

- `toBranchDto` now returns `addressLine` and `phone`; `BranchDto` declares them.
- An **Edit** modal updates name (EN/AR), city, address and phone.
- A deactivated row offers **Reactivate** instead of a permanently disabled
  Deactivate button.
- The table shows the branch phone.
- `canEdit`/`canDelete` follow `company.branch.update`/`.delete` or
  `platform.branch.manage`; the API still enforces the same rule server-side.

Verified live: `PATCH /branches/:id` persists phone and address (**200**),
`isActive:false` then `isActive:true` both **200**. A new browser test
(`3b. branch edit and reactivate run through the UI`) drives the modal and the
reactivate control and asserts the persisted API state.

---

## 7. Probes that found no defect (recorded so they are not re-run blindly)

| Probe | Result |
| --- | --- |
| Parts reservation over-issue | **400** "Issue quantity exceeds the reserved quantity" |
| Reservation negative issue | **400** `lines.0.quantity must not be less than 1` |
| Full issue with no stock | **403** `INSUFFICIENT_STOCK` |
| Booking engine, same resource + slot | **409** `booking.slot_unavailable` (DB partial unique index) |
| Two bookings, no resource named | land on **different** bays — correct, not a double-booking |

The inspection-booking path (`createInspectionBooking`) bypasses the shared
scheduling engine by design: it schedules against a service and time, not a bay
or inspector resource. It is **not** a regression and was not changed.

---

## 8. Verification results

All figures below are from this session.

| Suite | Result |
| --- | --- |
| API integration (e2e) | **27 suites, 508 tests — all passing** |
| Execution 03 (HR, CRM, operations, automotive) | passing, including the new labour test |
| ERP (accounting, sales, purchasing, inventory) | **30 passing** |
| Admin browser (Playwright) | **198 passed, 1 skipped, 0 failed** |
| Functional audit spec | 14/14 passing (incl. the new 3b) |
| Shared unit tests | **182 passing** |
| Mobile unit tests | **117 passing** |
| Typecheck (`pnpm -r typecheck`) | exit 0 |
| Lint (admin flat config) | exit 0 |
| API production build | succeeds |
| Admin production build | succeeds |

React regression guard: `apps/mobile/test/lib.test.ts` asserts `react` and
`react-dom` are both pinned to **19.1.0** (the version react-native 0.81.5
bundles) — passing.

### 8.1 Environment notes

- The Playwright browser build had to be reinstalled
  (`pnpm --filter @oryx/admin exec playwright install chromium`) after the
  dependency change; this is the documented gotcha, not a code fault.
- Playwright needs `DATABASE_URL` in the environment for its MFA global setup;
  the suite was run with the repo `.env` sourced.
- The 33 screenshots the capture specs rewrote differ only by incidental
  rendering noise (no page under test changed geometry), so they were reverted
  to keep this commit focused.

---

## 9. Remaining incomplete work

| Item | State |
| --- | --- |
| Android device visual acceptance of Splash and Homepage | **Not done.** No `/dev/kvm`; the app renders through its Expo web export in Chromium. Not claimed as device acceptance. |
| SENSAGE AI analysis | No provider configured; analysis stays labelled demo. |
| APK | **Not built**, per the brief. |
| Owner-supplied annotated screenshots | **Blocked** — not present in this environment. |

---

## 10. Delivery

- Pushed to `feature/execution-07-premium-web`:
  - `38cbc88` — the Execution 18 fix, tests and this report;
  - `63c0e77` — records the final commit hash here;
  - `95445bf` — the labour-hours rule added to `AGENTS.md`.
- **PR #7 stays open and Draft** (`state: open`, `draft: true`, `merged: false`).
  Not merged, not deployed.
- No APK was built.
