# ORYX Auto Services — Final Acceptance

Acceptance date: 2026-11-06 (revised).
Branch: `feature/execution-07-premium-web` (PR #7, **open and Draft**).
Local HEAD at acceptance: `2bc5c37b` (`docs(acceptance): record the green CI run
on 52e947c7`), which sits on top of the optional whole-amount rounding work
(`c55ab6d0`), the customer-master work (`30b49b75`, `656c60b4`) and the earlier
defect fixes (`fcab9aea`, `de85190f`, `e0b02557`, `fc26eb02`).
Environment: an isolated preview stack — a separate PostgreSQL database
(`oryx_dev`) with seeded synthetic demo records. No production database and no
production secret is involved.

> **Revision note (2026-11-06, second revision).** This revision re-ran every
> suite on the current tree after a sandbox rebuild, fixed a real purchasing
> defect (a purchase return whose invoiced cost differs from the stock carrying
> value posted an unbalanced journal — section 1.11), expanded the PDF evidence
> generator to all fourteen issuable document types, and added an
> official-documents gallery to the published GitHub Pages preview. Counts below
> are from this run, not carried over from the previous report.

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

### 1.11 Purchasing defect fixed this session

| Requirement | Status | Evidence |
|---|---|---|
| A purchase return whose invoiced unit cost differs from the moving-average carrying cost posts a balanced journal | PASS | defect reproduced live (`400 Journal does not balance: debits 62810 vs credits 3190`), fixed in `purchasing.service.ts`, then `201`; regression test `erp.e2e-spec.ts › balances a purchase return whose invoiced cost differs from the stock carrying value` (37/37 suite) |

The defect: the return's journal debits the payable at the invoiced value and
credits stock at moving-average cost plus input VAT. When the two costs differ,
the price-variance plug was posted on the same side as the difference instead of
the opposite side, leaving the entry short by `2 × variance` and the posting
refused. The plug now lands on the side that balances the entry, and the trial
balance is asserted `balanced:true` in the new test.

### 1.12 Official documents in the published preview

| Requirement | Status | Evidence |
|---|---|---|
| Every issuable document type has a real sample PDF | PASS | 14 PDFs in `docs/audit/pdf-samples/` (invoice, quotation, order, sales return, purchase order, purchase invoice, purchase return, receipt, voucher, customer statement, supplier statement, journal entry, full and partial inspection) |
| Rendered pages are published as evidence | PASS | `documents/` section on the GitHub Pages preview; `preview:verify` `documents-desktop-en-light`/`-dark` 200, 24 images, 0 broken; `preview:check` 458 pages crawled, 14 PDFs checked, 0 bad responses, 0 dark issues |
| QR block encodes a real verification URL | PASS | `DOCUMENT_VERIFY_BASE_URL=https://oryxbhr.com`; live `GET /documents/verify/:token` → `found:true`, `VALID`; unknown token → `found:false` |

## 2. Test results (re-run this session on the current tree)

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **223 passed / 223** (11 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **673 passed / 673** (36 suites) |
| API unit | `pnpm --filter @oryx/api test` | **20 passed / 20** (5 files) |
| Whole-amount rounding | `… test:e2e -- whole-amount-rounding` | **7 passed / 7** (in the 673) |
| Purchase-return variance | `… test:e2e -- erp` | **37 passed / 37** (incl. the new variance test) |
| Mobile | `pnpm --filter @oryx/mobile test` | **206 passed / 206** (10 files) |
| Mobile ERP | `pnpm --filter @oryx/mobile-erp test` | **31 passed / 31** (2 files) |
| Admin browser | `pnpm --filter @oryx/admin test:ui` | **223 passed, 1 skipped** (8.6 min) |
| Workspace lint | `pnpm -r lint` | PASS (exit 0) |
| Workspace typecheck | `pnpm -r typecheck` | PASS (exit 0) |
| Builds | api / admin / customer | PASS (exit 0) |
| Migrations | `prisma migrate status` | **up to date** (31 migrations applied to `oryx_dev`) |
| PDF sample render | `python3 .run/render-pdf-samples.py` | **ALL PASS** (14 PDFs, 23 PNGs; Arabic + Latin, no Type3) |
| Preview render check | `pnpm preview:verify` | **65 page/theme combinations, issues: none** |
| Preview link crawl | `pnpm preview:check` | **458 pages, 14 PDFs, 0 bad responses, 0 dark-mode issues** |

All of the above were re-run on the current tree after the sandbox was recycled
and the cluster rebuilt from an empty `pgdata`, migrated and seeded. Every
number reproduced. The 39-surface preview sweep (`.run/sweep-preview.mjs`) and
the 12-surface acceptance capture (`.run/capture-final-evidence.mjs`) were also
re-run; both are green (see section 3).

### 2.1 CI workflows

On the current tip `f9643922` all three workflows are green: `CI` (Typecheck and
build, Browser acceptance tests, Unit and API integration tests), `Design
preview` (GitHub Pages build and publish) and `Mobile APK`. The local suites in
section 2 are the authoritative per-suite result and were re-run on this tree
after the cluster was rebuilt from an empty `pgdata`.

### 2.2 Defects fixed in the previous session (preserved)

| Defect | Root cause | Fix | Proof |
|---|---|---|---|
| Inspection PDF carried mark glyphs the embedded fonts lack, so the text layer fell back to a host font | Template used a symbol codepoint for the paint/body and chassis marks | Draw the marks as vectors instead of font glyphs | `inspection-report.template.spec.ts`; CI API job |
| Tax-invoice PDF emitted a `/Type3` font (broken text layer) | `.num` / `.ltr` hardcoded `'ORYX Sans', sans-serif`; ORYX Sans has no Arabic, but a money cell prints the Arabic BHD symbol `د.ب`, so the two glyphs escaped the embedded faces | Point both classes at `DOCUMENT_LATIN_STACK`, which already named the Arabic face | Playwright render: old stack resolves `د`/`ب` to host `DejaVuSans`, new stack to embedded `NotoNaskhArabic`; `pdf-renderer.service.spec.ts`; CI API job |
| `Mobile APK` workflow failed on every mobile/shared push | The bundle check required the bundled JS to contain no backend host, on the assumption the demo was offline-only; the app is a live client, so a valid bundle names its API host | Assert the bundle carries the configured API host; add an `api_base_url` dispatch input inlined via `EXPO_PUBLIC_API_BASE_URL` | `Mobile APK` run `fc26eb02` — first green build |
| A purchase return whose invoiced cost differs from the stock carrying value posted an unbalanced journal and was refused | The price-variance plug was posted on the same side as the difference instead of the opposite side, so the entry was short by `2 × variance` | Post the plug on the balancing side | reproduced live (`400 Journal does not balance: debits 62810 vs credits 3190`) then `201`; regression test in `erp.e2e-spec.ts`; trial balance `balanced:true` |

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

PDF samples: `docs/audit/pdf-samples/*.pdf` — **fourteen** document types, each with
rendered page PNGs in `docs/audit/pdf-samples/preview/` and a machine-readable
`docs/audit/pdf-samples/manifest.json` (document number, page count, byte size
and verification token per sample):

| # | Sample | Type | Pages |
|---|---|---|---|
| 1 | `sales-invoice.pdf` | `SALES_INVOICE` | 1 |
| 2 | `quotation.pdf` | `QUOTATION` | 1 |
| 3 | `sales-order.pdf` | `SALES_ORDER` | 1 |
| 4 | `sales-return.pdf` | `SALES_RETURN` (credit note) | 1 |
| 5 | `purchase-order.pdf` | `PURCHASE_ORDER` | 1 |
| 6 | `purchase-invoice.pdf` | `PURCHASE_INVOICE` | 1 |
| 7 | `purchase-return.pdf` | `PURCHASE_RETURN` | 1 |
| 8 | `payment-receipt.pdf` | `PAYMENT_RECEIPT` | 1 |
| 9 | `payment-voucher.pdf` | `PAYMENT_VOUCHER` | 1 |
| 10 | `customer-statement.pdf` | `CUSTOMER_STATEMENT` | 1 |
| 11 | `supplier-statement.pdf` | `SUPPLIER_STATEMENT` | 1 |
| 12 | `journal-entry.pdf` | `JOURNAL_ENTRY` | 1 |
| 13 | `vehicle-inspection-full.pdf` | `VEHICLE_INSPECTION_REPORT` | 6 |
| 14 | `vehicle-inspection-partial.pdf` | `VEHICLE_INSPECTION_REPORT` | 5 |

Every sample carries both Arabic and Latin text, an embedded Arabic face and no
`/Type3` font. The QR block encodes `https://oryxbhr.com/verify/<token>`.

### 3.1 The published GitHub Pages preview

The `Design preview` workflow publishes a static site to GitHub Pages on every
push to this branch:

`https://mohammadaljallad079-rgb.github.io/oryx/`

It is built only from files committed to the branch, so it can never show
something the repository does not contain. Alongside the exported customer
website at the root, this session added an **Official documents** section
(`/documents/`) that lists all fourteen document types with every rendered page,
a per-document download link and the QR verification target, and updated the
overview page with a documents KPI and card. The workflow's own `verify` job runs
`preview:verify` and `preview:check` against the built site before publishing, so
a regression that breaks a page or an asset fails the deploy.

Because GitHub Pages serves static files only, the preview cannot run the API, so
the QR verification link is shown as the address the printed code encodes rather
than resolved on that host; the live verification endpoint is exercised
separately (section 3, item 12).

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

The final revision of this session (commit `c55279ba`) is a verification
revision: it regenerated the document samples from a pristine, freshly-seeded
database (`docs/audit/pdf-samples/*`, rendered pages and `manifest.json`), the
preview sweep evidence (`docs/audit/evidence/exec06-preview-sweep.json`), the
re-captured screenshots (`docs/audit/screenshots/*`,
`docs/execution-reports/screenshots/*`, `docs/audit/responsive/*`) and this
report. No application or database code changed in that revision.

The preceding revision fixed a real purchasing defect, expanded the PDF evidence
to all fourteen document types and added the official-documents gallery to the
published preview.

| File | Change |
|---|---|
| `apps/api/src/purchasing/purchasing.service.ts` | Post the purchase-return price-variance plug on the balancing side |
| `apps/api/test/erp.e2e-spec.ts` | New regression test: a return whose invoiced cost differs from the carrying value balances and the trial balance stays balanced |
| `.run/regenerate-pdf-evidence.mjs` | Generate all fourteen issuable document types from the live API and rewrite `manifest.json` |
| `apps/api/src/documents/documents.service.ts`, `apps/api/test/execution-phase3-documents.e2e-spec.ts` | Document-issue path and the purchase-order document test |
| `packages/shared/src/documents.ts` | Document type catalogue used by the evidence generator |
| `scripts/preview/build-preview.mjs` | New `buildDocuments()` section; `documents` nav entry, reserved-route guard, overview KPI and card |
| `scripts/preview/verify-preview.mjs` | Verify the new `/documents/` page in both themes |
| `scripts/preview/check-links.mjs` | Crawl from `/overview/` and `/documents/`; verify PDF assets by request instead of navigating to them |
| `scripts/preview/site.css` | Styles for the document cards and the page gallery |
| `docs/audit/pdf-samples/*` | Fresh fourteen-type samples, rendered pages and `manifest.json` |
| `docs/audit/ORYX_FINAL_ACCEPTANCE.md` | This report |

Earlier this session: the optional whole-amount rounding feature
(`packages/shared/src/money.ts`, `packages/database/prisma/schema.prisma`,
migration `20261106060000_whole_amount_rounding`, `apps/api/src/sales/sales.service.ts`,
`apps/api/src/common/document-totals.ts`, `apps/admin/src/components/company-settings-panel.tsx`,
`apps/api/test/whole-amount-rounding.e2e-spec.ts`, `apps/admin/e2e/erp.spec.ts`).

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
- This session began by recovering a recycled sandbox: the Postgres cluster
  (`pgdata`) was gone and no service was running. The cluster was rebuilt from an
  empty data directory, migrated (31 migrations) and seeded, the workspace
  packages were rebuilt, and the API, admin, customer and mobile-web services
  were brought back up. No production system was touched.
- Two build-only regressions were found and corrected during recovery: the admin
  and customer bundles had been built with the root `.env`'s absolute
  `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api`, which breaks the
  same-origin preview proxy. Both were rebuilt with the relative `/api` base (the
  documented value) before the acceptance capture, and with the absolute localhost
  base before the browser suite, matching each harness's requirement.
- Every automated suite is green on the current tree after that rebuild:
  shared 223, API e2e 673 (36 suites), API unit 20, mobile 206, mobile-erp 31,
  admin browser 223 (+1 skipped). Lint and typecheck are clean; admin, customer
  and API builds pass; migrations apply cleanly.
- The PDF evidence was regenerated from a pristine, freshly-seeded database, so
  the document numbers are unambiguous (`JOB-00001`, `QT-00001`, `SI-00001`, …)
  and every QR block encodes `https://oryxbhr.com/verify/<token>`. Live
  verification returns `found:true`, `status:VALID` for `QT-00001`.
- This session fixed a real defect in the previous revision: a purchase return
  whose invoiced unit cost differs from the moving-average carrying cost posted an
  unbalanced journal and was refused (reproduced live as `400 Journal does not
  balance: debits 62810 vs credits 3190`). The variance plug now lands on the
  balancing side, a regression test covers it, and the trial balance is asserted
  balanced.
- The merchant document surface, the inspection engine, the official-document
  engine and QR verification are implemented, DB-backed and tested. All twelve
  acceptance surfaces and all 39 preview surfaces were re-captured this session.
- The published GitHub Pages preview
  (`https://mohammadaljallad079-rgb.github.io/oryx/`) serves the latest committed
  state; its `Official documents` gallery, rendered pages and PDF downloads were
  confirmed to return `200` over the public host.
- The pixel-exact PDF comparisons and the Android device acceptance are blocked
  by missing inputs (the two reference files and a KVM-capable host), not by
  missing code. They are reported as BLOCKED, not PASS.
- No requirement is claimed complete without the command or artefact that proves
  it.
