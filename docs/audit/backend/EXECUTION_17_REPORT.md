# Execution 17 — dashboard density, screenshot fixes and production acceptance

**Branch:** `feature/execution-07-premium-web` · PR #7 **Draft** (not merged, not
deployed)
**Database:** PostgreSQL 17 — no migration, no schema change, no seed change
**Baseline:** `fddd44e` (Execution 16)
**Currency:** BHD, integer minor units (1000 fils = 1 BHD)

---

## 1. What this execution is

Execution 16 was the production-readiness sweep. Execution 17 finishes the work
that sweep deferred and re-verifies the platform end to end:

1. the deferred **Phase 2 dashboard-density** change (KPI card and table row
   height, no overflow);
2. a **canonical `documentDate` contract fix** on the sales module, found while
   verifying the sales create forms;
3. a **purchase-order totals** verification against the database;
4. **screenshot regeneration** after the density change;
5. a **responsive matrix** regression run;
6. a **production-acceptance pass** over authentication, bookings, merchant
   scope, media upload and tenant isolation.

It is not a re-audit of Execution 16 and does not repeat that work.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `apps/admin/src/app/globals.css` | Table `th`/`td` padding reduced, `.oryx-table-scroll` container added, table `width: max-content; min-width: 100%` |
| `apps/admin/src/components/ui.tsx` | `TableShell` renders the scroll container; optional `label` prop |
| `apps/admin/src/app/(app)/dashboard/overview/page.tsx` | `Kpi` card tightened (icon, gaps, padding, value and label font sizes) |
| `apps/admin/src/app/(app)/sales/page.tsx` | Sends canonical `documentDate`; `dateField` prop removed from `DocumentModal` |
| 27 admin route pages | Bulk `p-5`→`p-4`, `gap-5`→`gap-4` density alignment |
| `apps/api/src/sales/sales.dto.ts` | `SalesDocumentDateDto` with `@ValidateIf` + `resolveDocumentDate()` |
| `apps/api/src/sales/sales.service.ts` | Reads the effective date through `resolveDocumentDate()` |
| `apps/api/test/execution16-sales-contract.e2e-spec.ts` | Asserts canonical `documentDate`; hermetic on stock |
| `docs/audit/**`, `docs/execution-reports/**` | Screenshots regenerated after the density change |
| `docs/audit/backend/EXECUTION_17_REPORT.md` | This report |

---

## 3. Defect found and fixed: the sales date contract

### 3.1 Symptom

Every sales create form failed with
`property issueDate should not exist`, and after a partial fix a legacy client
that sent only `issueDate` received
`documentDate must be a valid ISO 8601 date string`.

### 3.2 Root cause

`SalesDocumentDateDto` folded the historical names onto `documentDate` with a
`@Transform`:

```ts
@Transform(({ obj }) => obj.documentDate ?? obj.issueDate ?? …)
@IsISO8601()
documentDate!: string;
```

class-transformer **only runs a property's transform when that property is
present on the source object**. For a payload of `{ issueDate }` the
`documentDate` transform never executes, `documentDate` stays `undefined`, and
`@IsISO8601()` rejects it. The alias was declared but unreachable. This was
reproduced directly:

```
plainToInstance(D, { issueDate: '2026-03-04T09:00:00.000Z' })
→ { issueDate: '…' }   documentDate = undefined
```

### 3.3 Fix

`documentDate` is now required only when no alias is present, and the effective
value is read by an explicit resolver:

```ts
export class SalesDocumentDateDto {
  @ValidateIf((o) => !o.issueDate && !o.orderDate && !o.invoiceDate)
  @IsISO8601()
  documentDate?: string;

  @IsOptional() @IsISO8601() issueDate?: string;
  @IsOptional() @IsISO8601() orderDate?: string;
  @IsOptional() @IsISO8601() invoiceDate?: string;
}

export function resolveDocumentDate(dto: SalesDocumentDateDto) {
  return dto.documentDate ?? dto.issueDate ?? dto.orderDate ?? dto.invoiceDate;
}
```

`forbidNonWhitelisted` stays on and every name keeps its own `@IsISO8601()`, so a
malformed legacy value is still a 400. Nothing was relaxed to make a form pass.

### 3.4 Live verification (real HTTP, port 3001)

| Request | Result |
| --- | --- |
| quotation, `issueDate` only | **201** |
| invoice, `invoiceDate` only | **201** |
| invoice, canonical `documentDate` | **201** |
| invoice, all four names at once | **201** |
| invoice, no date at all | **400** |
| invoice, malformed date | **400** |

`test/execution16-sales-contract.e2e-spec.ts` — **6/6 passing**.

---

## 4. Purchase-order totals

Verified against `QUANTITY_SCALE = 4` (quantities are 10⁴-scaled):

- PO-00002, 3 lines: header subtotal **6580**, tax **538**, total **7118**;
- the sum of the line `lineTotalMinor` values equals the header subtotal;
- header total equals subtotal + tax.

Confirmed by reading the row directly through `PrismaClient` as well as through
the API, so the check is not dependent on the API's own arithmetic.

---

## 5. Dashboard density (deferred Phase 2 work)

Measured with Playwright before and after, at each breakpoint
(`.run/exec17/measure-*.json`):

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| KPI card height @ 390/1024/1440 | 112 px | 92 px | **−17.9 %** |
| KPI card height @ 320 | 149 px | 110 px | −26.2 % |
| Table row height @ 1024/1440 | 51 px | 43 px | **−15.7 %** |
| Table row height @ 320/390 | 65 px | 43 px | −33.8 % |
| `th` padding | 11/11/14 px | 7/7/12 px | reduced |
| `td` padding | 12/12/14 px | 8/8/12 px | reduced |
| Table `overflow-x` scroller | absent (`clipped`) | present | **added** |
| Horizontal page overflow | none | none | unchanged |

The row-height reduction meets the 15–20 % target. No horizontal page overflow
was introduced at 320, 390, 768, 1024 or 1440 px, in either locale or theme.

---

## 6. Screenshot fixes and evidence

- The admin browser suite regenerates its committed screenshots, so the density
  change updated them. **142 PNG files were validated** as well-formed with
  sane dimensions — none is truncated or blank.
- Final before/after evidence for the density work is in
  `docs/execution-reports/exec17/`: dashboard (en/ar), sales (en/ar) and
  purchasing at 1440 px.
- The responsive matrix captures its own screenshots for the owner as part of
  the suite.

### 6.1 Owner-supplied screenshots

The brief refers to annotated screenshots from the owner. **No such images are
present in this environment** — the workspace contains only this repository, and
no inbox, attachment or upload directory exists. Rather than guess at a defect
from a description, this is recorded as **blocked pending the actual images**.
The density work above was instead driven by measured geometry, which is
reproducible and does not depend on the missing artifacts.

---

## 7. Verification results

All figures below are from this session.

| Suite | Result |
| --- | --- |
| API integration (e2e) | **27 suites, 507 tests — all passing** |
| Sales contract spec | 6/6 passing |
| Execution 03 (HR, CRM, operations, automotive) | 23/23 passing |
| Admin browser (Playwright) | **197 passed, 1 skipped, 0 failed** |
| Responsive matrix | passing, including the table-scroll assertion |
| Shared unit tests | 180 passing |
| Mobile unit tests | 117 passing |
| Mobile ERP unit tests | 31 passing |
| Typecheck (`pnpm -r typecheck`) | exit 0 |
| Lint (`pnpm -r lint`) | exit 0 |
| Admin production build | succeeds |
| Customer production build | succeeds |

### 7.1 A note on two apparent failures

Two runs initially showed 30-second login timeouts. Both were **environmental,
not code regressions**:

1. The API had been restarted without the documented relaxed throttles
   (`AUTH_THROTTLE_LIMIT`/`THROTTLE_LIMIT`/`REFRESH_THROTTLE_LIMIT`), so the
   suite saw 429s. Restarting with the documented values cleared it.
2. Two Playwright suites were running concurrently, so they contended and
   timed out. A single clean run passed 197/1 skipped/0 failed.

A third apparent failure — a 403 on a multi-line invoice — was caused by my own
manual verification draining the seeded product's stock. The suite was made
**hermetic** (`issueStock: false` on the date/totals assertions, which do not
test stock movement) so it can no longer be perturbed by other activity.

`pnpm --filter @oryx/api test` reports "No tests found": the API has **zero unit
specs** and `jest.config.js` ignores `test/`. This is pre-existing — confirmed
against the base commit — and is not a regression.

---

## 8. Production acceptance

### 8.1 Authentication and session security

| Check | Result |
| --- | --- |
| Customer registration | 201, access token issued |
| Customer login | 200 |
| Refresh token in body — **web** plane | **absent** (cookie only) |
| Refresh token in body — **mobile** plane | present, by documented design for native keychain storage |
| Token refresh | 200, refresh token **rotated** |
| Replay of a rotated refresh token | **401** `auth.refresh_revoked` |
| Refresh after logout | **401** |
| Tampered access token | **401** `auth.token_expired` |
| Staff token on a customer route | **401** — planes are separate |
| Customer token on a staff route | refused |

### 8.2 Tenant and ownership isolation

| Check | Result |
| --- | --- |
| Company A token + Company B header | **403** `authz.cross_tenant_denied` |
| Customer B reads Customer A's inspection photo | sees 0 rows |
| Customer B deletes Customer A's photo | **404** (no existence leak) |
| Customer B reads Customer A's booking | **404** |
| Customer B cancels Customer A's booking | **404** |
| Booking with a vehicle not in the caller's garage | **403** |

### 8.3 Bookings

| Check | Result |
| --- | --- |
| Availability | real slots from the working-hours engine (23 slots returned for a probe day) |
| Create | 201, status `HELD`, reference `BK-I-…` |
| Confirm | 200, status `CONFIRMED` |
| Detail | correct status, time and type |
| History | paginated, scoped to the caller |
| Double-book the same resource and slot | **409** `booking.slot_unavailable` |
| Cancel own booking | 200, status `CANCELLED`, reason recorded |

### 8.4 Merchant scope

`resolveProviderForUser` derives the provider from the caller's **active
membership**, never from a client-supplied id. No provider-portal route accepts a
claimed provider id, and a staff user with no membership resolves to their own
provider. Provider portal routes are permission-gated
(`erp.provider_portal.read`/`.manage`).

### 8.5 Media upload

| Check | Result |
| --- | --- |
| Inspection photo upload (PNG) | 201, re-encoded to **WebP**, dimensions recorded |
| Product image upload | 201, linked to the product |
| Text file declared `image/png` | **400** `media.type_not_allowed` — the declared type is not trusted |
| No file | **400** `media.file_required` |
| 13 MB file | **413** |
| Unauthenticated upload | **401** |

Uploads go through the shared `MediaStorageService`: magic-byte sniffing, size
ceiling, EXIF/GPS-stripping re-encode, and a UUID+content-hash storage key. A
client never chooses a path. Probe uploads were deleted afterwards.

### 8.6 Guest browsing

Public catalogue routes (`customer/catalog/products|stores|categories`,
`marketplace/providers`) return **200 with no auth header**, so a guest can
browse. Every account-scoped route returns **401** without a token.

### 8.7 Approved design preservation

No file under `apps/customer` or `apps/mobile` was modified in this execution.
The navy/gold identity, the approved hero and the 2000 ms splash minimum are
untouched.

---

## 9. Remaining incomplete work

Nothing above is claimed that is not verified in this session.

| Item | State |
| --- | --- |
| Owner-supplied annotated screenshots | **Blocked.** Not present in this environment; no defect was guessed from a description. |
| Android device visual acceptance of Splash and Homepage | **Not done.** No `/dev/kvm` here; the app renders through its real Expo web export in Chromium at an Android viewport. This is **not** device acceptance and is not claimed as such. |
| SENSAGE AI analysis | No provider configured; analysis stays labelled demo. Only the photograph and its metadata are stored — no demo score is written to a table that would make it look like a diagnosis. |
| APK | **Not built**, per the brief: no APK until the integrated functionality is coherent for a testing release. |
| `apps/api` unit tests | None exist by design; all API tests are e2e. |

---

## 10. Final commit

See the branch head after this commit. PR #7 remains **Draft**; nothing was
merged, deployed or released.
