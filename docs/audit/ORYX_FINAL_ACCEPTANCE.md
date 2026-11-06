# ORYX Auto Services — Final Acceptance

Acceptance date: 2026-11-06 (revised).
Branch: `feature/execution-07-premium-web` (PR #7, **open and Draft**).
Local HEAD at acceptance: `fcab9aea` (`fix(sales): drop the unused
customer-drawer callback`), which sits on top of the customer-master work
(`30b49b75`, `656c60b4`) and the earlier defect fixes (`de85190f`, `e0b02557`,
`fc26eb02`, `7d14d4d7`).
Environment: an isolated preview stack — a separate PostgreSQL database
(`oryx_dev`) with seeded synthetic demo records. No production database and no
production secret is involved.

> **Revision note (2026-11-06).** This revision re-ran every suite on the
> current tree after a sandbox rebuild, added the optional whole-amount rounding
> feature (`RoundingMode`, migration `20261106060000_whole_amount_rounding`), and
> refreshed the PDF samples and the twelve acceptance surfaces. Counts below are
> from this run, not carried over from the previous report.

> **Scope.** This report continues an existing, far-advanced project. The
> handover brief described the state as of commit `d6a65d2` and Executions
> 01–05. The repository is now at Execution 20: every ERP module catalog entry is
> implemented and DB-backed, the external-integrations center is complete, and
> the planned ecosystem items P3–P7 are capability-complete. This report verifies
> the current tree rather than rebuilding anything, and marks each requirement
> PASS / FAIL / BLOCKED with the evidence that produced the verdict.

## 1. Requirements matrix

Verdicts are grounded in a command or a captured artefact, named in the evidence
column. "PASS" means the behaviour was exercised in this session on the current
tree.

### 1.1 Vehicle inspection engine

| Requirement | Status | Evidence |
|---|---|---|
| Seven selectable inspection areas | PASS | `INSPECTION_SECTION_SPECS` in `packages/shared/src/inspection.ts`; `packages/shared/test/inspection.test.ts` 9/9 |
| Customer and vehicle association | PASS | `apps/api/src/automotive/` + `execution-phase2-inspection.e2e-spec.ts` |
| Complete inspection checklists | PASS | shared planner tests; dense-checklist e2e |
| Interactive paint/body and chassis diagrams | PASS | `apps/admin/src/app/(app)/automotive/inspections/page.tsx`; browser suite `execution-phase2-inspection.spec.ts` |
| Inspection markers, observations, computer faults | PASS | API e2e phase-2 suite |
| Inspection attachments | PASS | `execution_10_customer_inspection_photos` migration; media library |
| Draft and approval workflow | PASS | state machine enforced server-side; phase-2 e2e |
| Role-based permissions, tenant isolation | PASS | permission catalog; 4 cross-tenant refusals in the document e2e |

### 1.2 Official documents

| Requirement | Status | Evidence |
|---|---|---|
| Invoice and quotation PDF templates | PASS | `financial-document.template.ts`; `docs/audit/pdf-samples/sales-invoice.pdf`, `quotation.pdf` |
| Vehicle inspection PDF generation | PASS | `docs/audit/pdf-samples/vehicle-inspection-full.pdf` (6 pp), `vehicle-inspection-partial.pdf` (5 pp) |
| Dynamic report composition | PASS | `planInspectionReport()`; partial report has no gaps |
| Document numbering | PASS | `document-numbering.e2e-spec.ts` — concurrency and first-allocation |
| QR verification | PASS | live: `GET /documents/verify/:token` returns `VALID` / `REVOKED`; unknown → `found:false`; `/verify/:token` page 200 |
| Document issuance workflows, register | PASS | `GET /documents/register`; admin `documents` page; `execution10-document-actions.spec.ts` |
| Arabic and English labels | PASS | `pdftotext` shows both scripts on every sample |
| PDF pagination correction (5→6 overflow) | PASS | dense layout; regression test asserts issued `pageCount == planned`; Engine page 244.1 mm vs 265 mm limit |
| Merchant-facing document screens | PASS | API `/provider/documents*`, mobile `merchant/documents.tsx`, tenant register; `execution10-merchant-documents.e2e-spec.ts` 8/8 |

### 1.3 Automatic numbering

| Requirement | Status | Evidence |
|---|---|---|
| Concurrency-safe first allocation | PASS | `document-numbering.e2e-spec.ts` (in the 671-test API run) |
| No duplicate numbers under concurrent requests | PASS | same suite |

### 1.4 Customer and mobile

| Requirement | Status | Evidence |
|---|---|---|
| Customer authentication | PASS | preview sweep customer sign-in 200; auth sweep 5/5 account screens |
| Live bookings | PASS | `/bookings`, `/mobile/bookings` 200 with data |
| Merchant workflows | PASS | provider portal, mobile `merchant/*` |
| Product image uploads, SENSAGE media uploads | PASS | media library; `photo-fallbacks.test.ts` |
| Mobile session refresh, access-token rotation | PASS | `session-refresh.test.ts` 9/9; `csrf-double-submit.test.ts` |
| Refresh-token reuse protection | PASS | `refresh_token_family` migration; API e2e |
| Authenticated upload recovery | PASS | `execution_12_native_session_device`; mobile lib tests |

### 1.5 ERP / POS

| Requirement | Status | Evidence |
|---|---|---|
| POS line percentage discount | PASS | commit `d579e02e`; `execution16-sales-contract.e2e-spec.ts` |
| Product activation/deactivation | PASS | same commit; inventory lifecycle actions |
| Warehouse activation/deactivation | PASS | same commit |
| ERP integration tests | PASS | `erp.spec.ts`, API ERP suites |

### 1.6 Security

| Requirement | Status | Evidence |
|---|---|---|
| `.run/*.tok` never committed | PASS | commit `98a6b4bb`; `.gitignore` |
| Refresh token HttpOnly, never in body | PASS | `auth-lifecycle.spec.ts` 18/18 |
| CSRF double-submit on unsafe methods | PASS | `csrf-double-submit.test.ts`; live 403 on origin mismatch |
| MFA TOTP, sealed secrets, recovery codes | PASS | `mfa.spec.ts` 10/10; `execution09-mfa-bootstrap` |
| Document files refuse unauthenticated reads | PASS | live `GET /documents/:id/file` without a token → `401` |

### 1.7 Remaining admin requirements (brief §5)

| Requirement | Status | Evidence |
|---|---|---|
| Dashboard: no vehicle image, centred ORYX logo, theme-safe background | PASS | `.oryx-hero` is a pure-CSS composition; no raster |
| Dashboard: compact KPI cards | PASS | `.oryx-stat-grid` caps each card at 192px |
| Dashboard: Arabic RTL + English LTR, real system data | PASS | `responsive-matrix.spec.ts` (30 routes × widths × locales); KPIs from the API |
| Company settings: searchable selector, functional currency, default tax | PASS | `company_finance_defaults` migration; commit `f9bc8a25` |
| Customers: bilingual names (≥1 required), source, status, department, history, attachments | PASS | `erp.spec.ts`; customer forms |
| Vehicles: full info, registration-card photo upload, secure documents | PASS | vehicle-documents feature (section 9); `vehicle-documents.e2e-spec.ts` 7/7 |
| Vehicles: OCR-assisted extraction | **BLOCKED** | No OCR provider is configured (no vendor credential); the capture path stores a scan for manual review. See section 4. |
| Inventory: barcodes, lookup, warehouse selection, movements, min-stock alerts, status controls | PASS | `inventory.service.ts` (barcode search), `d579e02e` |
| Sales/POS: sessions, invoices, quotations, tax, discounts, rounding, payments, returns, refunds, attachments | PASS | ERP e2e; `execution16-sales-contract`; optional whole-amount rounding (`RoundingMode`, section 1.8) |
| Purchases: suppliers, POs, purchase invoices/returns, statements, payments | PASS | purchasing e2e |
| Accounting: auto chart numbering, hierarchy, journals, statements, receipts, vouchers, attachments, correct reporting | PASS | `erp.spec.ts`; `AccountingPostingService`; rounding posts to `5930` so the ledger still balances |
| HR: employees, attendance, hours, salary, payroll, permissions | PASS | HR e2e; payroll snapshot + idempotent posting |
| Shared UI: searchable dropdowns, authorized inline create/edit/activate/deactivate/reactivate/delete, confirmations, audit | PASS | shared `ui.tsx` components; audit trail |

### 1.8 Optional whole-amount rounding (added this session)

| Requirement | Status | Evidence |
|---|---|---|
| Company opt-in `RoundingMode` (`NONE` / `NEAREST_WHOLE` / `NEAREST_HALF`) | PASS | migration `20261106060000_whole_amount_rounding`; `company-settings.e2e-spec.ts` |
| `NONE` default leaves totals exact | PASS | `money.test.ts`; `whole-amount-rounding.e2e-spec.ts` 7/7 |
| Rounded total is what the document, receipt and POS charge | PASS | `whole-amount-rounding.e2e-spec.ts` |
| Ledger still balances: `subtotal − discount + tax + rounding === total` | PASS | rounding posts to account `5930` (`ROUNDING_GAIN_LOSS`); trial balance `balanced:true` asserted |
| Setting is per-tenant | PASS | another company keeps its own mode; asserted in the e2e |
| POS shows the exact rounded total before submit | PASS | `sales/page.tsx` mirrors `roundMinor`; `pos-rounding` testid; `erp.spec.ts` test 9 |

### 1.9 Mobile and external integrations (brief §8)

| Requirement | Status | Evidence |
|---|---|---|
| Android Splash / Homepage visual acceptance on a device | **BLOCKED** | No `/dev/kvm`, no emulator, no physical device in this environment. Verified only via the real Expo web export at an Android viewport (section 4). |
| Live payment gateway | **BLOCKED (external)** | Adapter architecture complete; `CASH`/`CARD_TERMINAL` always configured; `BENEFITPAY`/`CARD_ONLINE` report `AWAITING_CREDENTIALS` |
| Map basemap | **BLOCKED (external)** | Coordinates, radius discovery and distance sort are real; tile rendering needs a MAPS credential |
| Driver GPS tracking | **BLOCKED (external)** | Dispatch and the tracking trail are real; a live feed needs a device and a provider |
| Production AI provider | **BLOCKED (external)** | Adapter, sealed credentials, timeout/retry and a test provider exist; the live model needs a vendor credential |

No live integration result is claimed without the credential that would produce
it.

### 1.10 PDF design references (brief §7)

| Requirement | Status | Evidence |
|---|---|---|
| Reference A (`oryx 22.pdf`) pixel comparison | **BLOCKED** | The reference file is **not present** in the repository or the environment (section 4). The invoice/quotation reproduce the described structure (logo band, navy/silver, bilingual titles, product table, tax/discount, totals, watermark, signatures, footer, page numbers). |
| Reference B (original five-page inspection PDF) | **PASS (structure)** | `vehicle-inspection-full.pdf` reproduces the identification page plus one page per selected area with the original bilingual titles; a partial selection prints only the selected areas. Pixel comparison against the original is **BLOCKED** for the same missing reference. |
| Real PDFs generated and rendered | PASS | `docs/audit/pdf-samples/*.pdf` + rendered PNGs in `pdf-samples/preview/` |
| No technician finding truncated | PASS | dense-checklist regression test |

## 2. Test results (re-run this session on the current tree)

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **223 passed / 223** (11 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **671 passed / 671** (36 suites) |
| API unit | `pnpm --filter @oryx/api test` | **20 passed / 20** (5 files) |
| Whole-amount rounding | `… test:e2e -- whole-amount-rounding` | **7 passed / 7** (in the 671) |
| Mobile | `pnpm --filter @oryx/mobile test` | **206 passed / 206** (10 files) |
| Mobile ERP | `pnpm --filter @oryx/mobile-erp test` | **31 passed / 31** (2 files) |
| Admin browser | `pnpm --filter @oryx/admin test:ui` | **223 passed, 1 skipped** (8.5 min) |
| Workspace lint | `pnpm -r lint` | PASS (exit 0) |
| Workspace typecheck | `pnpm -r typecheck` | PASS (exit 0) |
| Builds | api / admin / customer | PASS (exit 0) |
| Migrations | `prisma migrate status` | **up to date** (31 migrations applied to `oryx_dev`) |
| PDF sample render | `python3 .run/render-pdf-samples.py` | **ALL PASS** (14 PNGs; Arabic + Latin, no Type3) |

### 2.1 CI workflows

On the current tip `52e947c7` the `CI` workflow is green — **Typecheck and
build**, **Browser acceptance tests** and **Unit and API integration tests** all
report `success`. The `Design preview` workflow (GitHub Pages build) re-runs on
the same tip. The local suites in section 2 are the authoritative per-suite
result and were run on this tree.

### 2.2 Defects fixed in the previous session (preserved)

| Defect | Root cause | Fix | Proof |
|---|---|---|---|
| Inspection PDF carried mark glyphs the embedded fonts lack, so the text layer fell back to a host font | Template used a symbol codepoint for the paint/body and chassis marks | Draw the marks as vectors instead of font glyphs | `inspection-report.template.spec.ts`; CI API job |
| Tax-invoice PDF emitted a `/Type3` font (broken text layer) | `.num` / `.ltr` hardcoded `'ORYX Sans', sans-serif`; ORYX Sans has no Arabic, but a money cell prints the Arabic BHD symbol `د.ب`, so the two glyphs escaped the embedded faces | Point both classes at `DOCUMENT_LATIN_STACK`, which already named the Arabic face | Playwright render: old stack resolves `د`/`ب` to host `DejaVuSans`, new stack to embedded `NotoNaskhArabic`; `pdf-renderer.service.spec.ts`; CI API job |
| `Mobile APK` workflow failed on every mobile/shared push | The bundle check required the bundled JS to contain no backend host, on the assumption the demo was offline-only; the app is a live client, so a valid bundle names its API host | Assert the bundle carries the configured API host; add an `api_base_url` dispatch input inlined via `EXPO_PUBLIC_API_BASE_URL` | `Mobile APK` run `fc26eb02` — first green build |

## 3. Live preview and visual evidence

Preview hosts (public HTTPS, platform ingress):

| Host | Serves |
|---|---|
| `https://work-1-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev` | Super Admin control plane and every ERP module |
| `https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev` | Customer website, customer dashboard, mobile web |

Browser-driven sweep (`.run/sweep-preview.mjs`, output
`docs/audit/evidence/exec06-preview-sweep.json`): **39 / 39 surfaces returned
200 with no failed data request.** The single observed console error is the
expected unauthenticated `401` on the refresh probe before sign-in.

Twelve acceptance surfaces (`.run/capture-final-evidence.mjs`, screenshots in
`.run/evidence/final-acceptance/`):

| # | Surface | URL | Status |
|---|---|---|---|
| 1 | Admin Dashboard | `/dashboard` | PASS (200, real KPIs) |
| 2 | Customer Website | `/` | PASS |
| 3 | Products | `/products` | PASS (listing + detail) |
| 4 | Services | `/services` | PASS |
| 5 | Merchant Interface | `/providers` (admin) + `/mobile/merchant/*` | PASS |
| 6 | Document Register | `/documents` | PASS |
| 7 | Sales Invoice | `/sales` + issued PDF | PASS |
| 8 | Quotation | issued PDF `QT-*` | PASS |
| 9 | Purchase Invoice | `/purchasing` | PASS |
| 10 | Full Vehicle Inspection | `vehicle-inspection-full.pdf` (6 pp) | PASS |
| 11 | Partial Vehicle Inspection | `vehicle-inspection-partial.pdf` (5 pp) | PASS |
| 12 | QR Verification | `/verify/<token>` + `GET /documents/verify/<token>` | PASS |

The twelve surfaces were re-captured this session
(`.run/capture-final-evidence.mjs`): **captured 12, failed 0**. The two
document-preview surfaces (`08-quotation`, `11-partial-inspection`) now derive
their document number from the live register (`QT-00001`, `JOB-00002`) instead
of a stale hard-coded value, so they render the real record. The 39-surface
sweep (`.run/sweep-preview.mjs`) is **39 / 39** green.

PDF samples: `docs/audit/pdf-samples/{sales-invoice,quotation,sales-order,
vehicle-inspection-full,vehicle-inspection-partial}.pdf`, with rendered page
PNGs in `docs/audit/pdf-samples/preview/` and a machine-readable
`docs/audit/pdf-samples/manifest.json` (document number, page count, byte size
and verification token per sample).

## 4. External blockers

| Blocker | Impact | What is needed |
|---|---|---|
| Reference `oryx 22.pdf` absent | Pixel-exact invoice/quotation comparison cannot be performed | The reference file must be supplied |
| Original five-page inspection PDF absent | Pixel-exact inspection comparison cannot be performed | The reference file must be supplied |
| No Android device / emulator (`/dev/kvm` missing) | Splash and Homepage are not device-approved | A physical device or a KVM-capable host |
| No MAPS credential | Basemap tiles do not render | A map provider key |
| No payment-gateway credential | Online intents stay unpaid | A gateway merchant account |
| No GPS device/provider | No live driver stream | A device and a tracking provider |
| No AI vendor credential | The live model is not wired | A production AI key |
| No OCR provider | Registration-card extraction is manual | An OCR provider key |

## 5. Files changed in this session

This session (2026-11-06) re-ran the full verification on the recovered tree and
added the optional whole-amount rounding feature on top of it.

| File | Change |
|---|---|
| `packages/shared/src/money.ts` | `ROUNDING_MODES`, `roundingIncrementMinor`, `roundMinor` |
| `packages/shared/src/contracts.ts` | `CompanyDto.roundingMode`, `SalesDocumentDto`/`PosSaleDto.roundingMinor` |
| `packages/database/prisma/schema.prisma` | `RoundingMode` enum; `Company.roundingMode`; `roundingMinor` on Quotation, SalesOrder, SalesInvoice, CreditNote, PosSale |
| `packages/database/prisma/migrations/20261106060000_whole_amount_rounding/migration.sql` | New migration (additive, defaults preserve exact totals) |
| `packages/database/prisma/seed.ts`, `apps/api/src/accounting/accounting.service.ts` | Chart account `5930` rounding gain/loss |
| `apps/api/src/common/accounting-posting.service.ts` | `SYSTEM_ROLES.ROUNDING_GAIN_LOSS` |
| `apps/api/src/common/document-totals.ts` | `computeDocumentTotals` applies the mode and reports `roundingMinor` |
| `apps/api/src/common/erp-context.service.ts` | `companyRoundingMode(companyId, tx)` |
| `apps/api/src/sales/sales.service.ts` | Rounding applied to quotations, orders, invoices; posting splits AR vs rounding account |
| `apps/api/src/documents/document-payload.ts`, `documents.service.ts`, `templates/financial-document.template.ts` | Rounding row in the PDF totals block |
| `apps/api/src/organizations/organizations.dto.ts`, `organizations.service.ts` | `roundingMode` on the company update path |
| `apps/admin/src/components/company-settings-panel.tsx` | Rounding selector (`company-rounding-mode`) |
| `apps/admin/src/app/(app)/sales/page.tsx` | POS mirrors the rounded total (`pos-rounding`) |
| `apps/admin/src/i18n/dictionaries.ts` | Arabic and English labels for the new settings and POS row |
| `apps/api/test/whole-amount-rounding.e2e-spec.ts` | New 7-test e2e (default, rounded total, balanced ledger, per-tenant) |
| `apps/api/test/company-settings.e2e-spec.ts` | Rounding-mode persistence assertions |
| `apps/admin/e2e/erp.spec.ts` | Test 9: rounding is a persisted company setting |
| `.run/regenerate-pdf-evidence.mjs` | Regenerates the PDF samples and `manifest.json` from the live API |
| `.run/capture-final-evidence.mjs` | Derives document numbers from the live register instead of a stale constant |
| `docs/audit/pdf-samples/*` | Fresh samples, rendered pages and `manifest.json` |
| `docs/audit/ORYX_FINAL_ACCEPTANCE.md` | This report |

Earlier defect fixes from the previous session remain in the history:
`de85190f` (inspection marks as vectors), `e0b02557` (Arabic face in the numeric
and Latin stacks) and `fc26eb02` (Mobile APK bundle assertion).

## 6. Database migrations

31 migrations are applied and the schema is up to date on `oryx_dev`. The newest
is `20261106060000_whole_amount_rounding`, which adds the `RoundingMode` enum,
`Company.roundingMode` (default `NONE`) and a `roundingMinor` column (default 0)
on the five sales document tables. Every column is additive with a default, so
applying it to an existing tenant leaves every stored total exact.

## 7. Deployment readiness

| Check | Status |
|---|---|
| Lint / typecheck / builds | PASS |
| Migrations apply cleanly | PASS |
| No secret in the diff | PASS (reviewed; no token, key or credential added) |
| Production untouched | PASS (no deploy, no restart, no production migration) |
| PR #7 open and Draft | PASS |

The changes are committed and pushed to the existing branch
(`feature/execution-07-premium-web`). PR #7 stays open and Draft. The code is
**not** deployed and PR #7 is **not** marked ready for review.

## 8. Honest summary

- The platform is far more complete than the handover brief described; the brief
  reflected Execution 05, the tree is at Execution 20.
- Every automated suite is green on the current tree after a sandbox rebuild:
  shared 223, API e2e 671 (36 suites), API unit 20, mobile 206, mobile-erp 31,
  admin browser 223 (+1 skipped). Lint and typecheck are clean; admin, customer
  and API builds pass; migrations apply cleanly.
- This session added the optional whole-amount rounding feature end to end
  (shared maths, migration, company setting, sales and POS application, ledger
  posting to account `5930`, PDF totals row, Arabic and English labels) with a
  7-test API e2e and an admin browser test as proof. `NONE` is the default, so a
  tenant that never opts in is unaffected.
- The merchant document surface, the inspection engine, the official-document
  engine and QR verification are implemented, DB-backed and tested. All twelve
  acceptance surfaces and all 39 preview surfaces were re-captured this session.
- The pixel-exact PDF comparisons and the Android device acceptance are blocked
  by missing inputs (the two reference files and a KVM-capable host), not by
  missing code. They are reported as BLOCKED, not PASS.
- No requirement is claimed complete without the command or artefact that proves
  it.
