# Execution 19 — defect closure, audit filtering and production-readiness sweep

**Base commit:** `f5b9c29` · **Branch:** `feature/execution-07-premium-web` · PR #7 **Draft**
**Database:** PostgreSQL 17, additive changes only, no destructive migration

---

## 1. Scope

Execution 19 closes real defects found while sweeping the platform against the
owner's requirements and finishes the audit-trail filtering work. Nothing here
re-implements a completed execution: the Execution 10 mobile integration, the
Execution 11–18 surfaces and the Execution 05 integrations centre are untouched.

The work is four items:

1. A purchasing defect: a goods receipt could exceed what a purchase order owed.
2. A parts-reservation gap: no cancel path, and no way to see reserved quantity.
3. Part-number lookup: the reference list had no search.
4. Audit-trail filtering: the API, the admin page and the i18n only supported
   an exact `action` match.

Each item is backed by a real HTTP check and by a regression test in the
automated suite.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `apps/api/src/purchasing/purchasing.service.ts` | Cap an explicit receipt line at the order's outstanding quantity |
| `apps/api/src/common/errors.ts` | New error code `purchasing.over_receipt` |
| `apps/api/src/automotive/workshop.service.ts` | `cancelReservation`, `reservedStock`, and a free-text filter on `listPartReferences` |
| `apps/api/src/automotive/automotive.dto.ts` | `ReservedStockQueryDto`; `productId` on `ListQueryDto` |
| `apps/api/src/automotive/workshop.controller.ts` | `POST reservations/:id/cancel`, `GET reservations/reserved-stock` |
| `apps/api/src/common/audit.service.ts` | `list()` gains `targetType`, `search`, `from`, `to` |
| `apps/api/src/audit/audit.controller.ts` | `AuditQueryDto` gains the same filters, `IsISO8601` on the dates |
| `apps/admin/src/lib/api.ts` | `listAuditLogs` signature extended |
| `apps/admin/src/app/(app)/audit/page.tsx` | Filter controls for action, target type, actor, free text and a date range, plus a clear action |
| `apps/admin/src/i18n/dictionaries.ts` | EN + AR labels for the new filters |
| `apps/api/test/erp.e2e-spec.ts` | Over-receipt regression |
| `apps/api/test/execution03.e2e-spec.ts` | Reservation cancel / reserved-stock regression |
| `apps/api/test/execution16-sales-contract.e2e-spec.ts` | Hermetic fixture (dedicated customer, cleanup) |
| `apps/api/test/authorization.e2e-spec.ts` | Audit-filter API regression |
| `apps/admin/e2e/functional-audit-exec06.spec.ts` | Audit-filter browser regression |

---

## 3. The purchasing defect

`createGoodsReceipt` accepted explicit `lines` and copied their quantities
straight onto a `POSTED` receipt. Nothing compared a line against what the
purchase order still owed.

The consequence was not cosmetic. Receiving the same order line a second time
with explicit quantities created a second receipt, moved stock through
`InventoryService.recordMovement` a second time and accrued the payable a second
time — for one ordered quantity. The automatic path (no `lines`) already capped
itself at `quantity - quantityReceived`, so the two paths disagreed.

The fix caps an explicit line at the outstanding quantity and refuses the
request with a specific code:

```ts
const outstanding = orderLine.quantity - orderLine.quantityReceived;
if (l.quantity > outstanding) {
  throw badRequest(ERROR_CODES.OVER_RECEIPT, ...);
}
```

`OVER_RECEIPT` (`purchasing.over_receipt`) is a distinct code so a caller can
tell an over-receipt from a generic validation failure. The regression test
asserts the 400, the code, that the automatic path also refuses an
already-received order, and that the stock level is byte-for-byte unchanged.

---

## 4. Parts reservations

Two gaps, one cause: a reservation promised stock without touching the ledger,
and nothing surfaced or released that promise.

**Cancel.** `POST /automotive/reservations/:id/cancel` cancels a reservation
that has not been issued. A reservation with any `issuedQuantity > 0` is
refused — that stock has left the ledger through `issueReservation`, so it must
be reversed through the inventory module, never silently dropped. Cancelling
twice is refused. Each cancellation is audited as
`automotive.parts_reservation_cancelled`.

**Reserved stock.** `GET /automotive/reservations/reserved-stock` reports
outstanding quantity (`quantity - issuedQuantity`) per product and warehouse for
reservations in `RESERVED` or `PARTIALLY_ISSUED`. Because a reservation does not
touch `StockLevel.quantity`, on-hand and reserved are different numbers and the
workshop needs both.

Both routes carry `@RequireModule('spare_parts')`; the read route accepts any of
`erp.parts.reserve`, `erp.parts.issue`, `erp.spare_parts.read` or
`erp.inventory.read`.

`ReservedStockQueryDto` exists because the global pipe runs with
`forbidNonWhitelisted`: an undeclared `warehouseId` would be rejected, so the
filter needs an explicit optional field rather than reuse of the base list DTO.

---

## 5. Part-number search

`listPartReferences` returned every reference for the company. A workshop looks a
part up by part number, brand, or the linked product's SKU or name, so the new
`search` filter spans all four with a case-insensitive `contains`. An optional
`productId` narrows to one product.

---

## 6. Audit-trail filtering

The API accepted only an exact `action` match. `AuditService.list()` now also
accepts:

- `targetType` — exact match;
- `actorUserId` — exact match on the principal;
- `search` — case-insensitive across `summary`, `action` and `targetId`;
- `from` / `to` — an inclusive `createdAt` window.

`AuditQueryDto` validates both dates with `IsISO8601`, so a malformed date is a
400 from validation rather than a 500 from `new Date('nonsense')` reaching
Prisma.

The admin audit page gained controls for every filter the API supports,
including the actor filter, and a clear button that resets all of them and
returns to page 1. Labels are added in both English and Arabic; the layout is a
responsive grid so the six controls do not overflow at handset width.

---

## 7. Verification results

All figures below are from this session. The API was restarted with the relaxed
throttle limits the browser suites require, and the admin app was rebuilt and
restarted before the browser run.

| Suite | Result |
| --- | --- |
| API integration (e2e) | **27 suites, 510 tests — all passing** |
| Authorization suite (with the new audit-filter test) | **46 passing** |
| Admin browser (Playwright) | **199 passed, 1 skipped, 0 failed** |
| Audit-filter browser spec (`functional-audit-exec06`) | **11/11 passing** |
| Shared unit tests | **182 passing** |
| Mobile unit tests | **117 passing** |
| Mobile ERP unit tests | **31 passing** |
| Typecheck (`pnpm -r typecheck`) | exit 0 |
| Lint (`pnpm -r lint`) | exit 0 |
| API production build | succeeds (`dist/main.js` emitted) |
| Admin production build | succeeds |

### 7.1 Real HTTP checks

Run against the live API (`/api/v1`), not a mock:

| Check | Result |
| --- | --- |
| Super Admin login | 200 |
| `GET /audit-logs?pageSize=5` | 200, 12 485 rows |
| `?targetType=COMPANY` | 200, every row is `COMPANY` |
| `?search=support` | 200, matching rows only |
| `?from=2020…&to=2030…` | 200, 12 485 rows |
| `?from=1999…&to=1999…` | 200, **0 rows** |
| `?from=not-a-date` | **400** |
| `?actorUserId=<real id>` | 200, every row is that actor |
| `GET /automotive/reservations/reserved-stock` as Enterprise | 200, 1 item |
| Same route as a tenant-less Super Admin | **403** (module not licensed) |
| Same route with a foreign `companyId` | **403** (scope refused) |

The 403s are the correct behaviour, not a fault: a platform principal carries no
tenant scope, and `spare_parts` is licensed to Enterprise only.

### 7.2 Environment notes

- The Playwright browser build had to be reinstalled
  (`pnpm --filter @oryx/admin exec playwright install chromium`); this is the
  documented gotcha after a dependency change.
- A mid-suite `pnpm build` rewrites `.next` under the running `next start` and
  makes unrelated specs fail. The first browser run in this session failed that
  way; after restarting the server the same suite passed 199/199. The failure was
  self-inflicted and is recorded here rather than hidden.
- The 200 tests that rewrite screenshots were reverted afterwards: the images
  differ only by incidental rendering noise and no page under test changed
  geometry.

---

## 8. Security verification

- The new read route enforces both the module guard and a permission set; a
  principal without either is refused (verified live: 403).
- `resolveCompanyScope` still resolves the tenant from the principal, so a
  foreign `companyId` is refused rather than trusted.
- Cancelling an issued reservation is refused, so a stock movement cannot be
  dropped from the ledger through this path.
- The audit filters are read-only additions to an already permission-gated
  endpoint (`platform.audit.read` / `company.audit.read`); no new write path.
- No credential, token or secret value is added to any response. The audit
  trail continues to be written by key, never by value.

---

## 9. Remaining incomplete work

Unchanged from Execution 18; nothing in this execution alters these.

| Item | State |
| --- | --- |
| Android device visual acceptance of Splash and Homepage | **Not done.** No `/dev/kvm`; the app renders through its Expo web export in Chromium. Not claimed as device acceptance. |
| SENSAGE AI analysis | No provider configured; analysis stays labelled demo. |
| Auto Map rendering (P3), consumer spare-parts checkout (P4), SOS dispatch (P5), fleet/driver apps (P6), a wired AI model (P7) | **Partial**, as recorded in `docs/audit/01_SPECIFICATION_PARITY_MATRIX.md`. |
| Official ORYX logo and approved photography | **Blocked** — the assets were never supplied; the UI uses a neutral placeholder. |
| APK | **Not built**, per the brief. |

---

## 10. Delivery

- Committed to `feature/execution-07-premium-web` and pushed.
- **PR #7 stays open and Draft.** Not merged, not deployed.
- No APK was built.
