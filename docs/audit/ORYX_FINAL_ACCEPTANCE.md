# ORYX Auto Services — Final Acceptance

Acceptance date: 2026-11-05.
Branch: `feature/execution-07-premium-web` (PR #7, **open and Draft**).
Local HEAD at acceptance: `fc26eb02` (`fix(ci): assert the APK bundle carries
its API host, not that it is offline`) on top of `e0b02557`
(`fix(documents): keep an Arabic face in the numeric and Latin font stacks`)
and `de85190f` (`fix(documents): draw inspection marks as vectors, not font
glyphs`).
Environment: an isolated preview stack — a separate PostgreSQL database
(`oryx_test`) with seeded synthetic demo records. No production database and no
production secret is involved.

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
| Vehicle inspection PDF generation | PASS | `docs/audit/pdf-samples/vehicle-inspection-full.pdf` (6 pp), `vehicle-inspection-partial.pdf` (3 pp) |
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
| Concurrency-safe first allocation | PASS | `document-numbering.e2e-spec.ts` (in the 47-test document run) |
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
| Sales/POS: sessions, invoices, quotations, tax, discounts, rounding, payments, returns, refunds, attachments | PASS | ERP e2e; `execution16-sales-contract` |
| Purchases: suppliers, POs, purchase invoices/returns, statements, payments | PASS | purchasing e2e |
| Accounting: auto chart numbering, hierarchy, journals, statements, receipts, vouchers, attachments, correct reporting | PASS | `erp.spec.ts`; `AccountingPostingService` |
| HR: employees, attendance, hours, salary, payroll, permissions | PASS | HR e2e; payroll snapshot + idempotent posting |
| Shared UI: searchable dropdowns, authorized inline create/edit/activate/deactivate/reactivate/delete, confirmations, audit | PASS | shared `ui.tsx` components; audit trail |

### 1.8 Mobile and external integrations (brief §8)

| Requirement | Status | Evidence |
|---|---|---|
| Android Splash / Homepage visual acceptance on a device | **BLOCKED** | No `/dev/kvm`, no emulator, no physical device in this environment. Verified only via the real Expo web export at an Android viewport (section 4). |
| Live payment gateway | **BLOCKED (external)** | Adapter architecture complete; `CASH`/`CARD_TERMINAL` always configured; `BENEFITPAY`/`CARD_ONLINE` report `AWAITING_CREDENTIALS` |
| Map basemap | **BLOCKED (external)** | Coordinates, radius discovery and distance sort are real; tile rendering needs a MAPS credential |
| Driver GPS tracking | **BLOCKED (external)** | Dispatch and the tracking trail are real; a live feed needs a device and a provider |
| Production AI provider | **BLOCKED (external)** | Adapter, sealed credentials, timeout/retry and a test provider exist; the live model needs a vendor credential |

No live integration result is claimed without the credential that would produce
it.

### 1.9 PDF design references (brief §7)

| Requirement | Status | Evidence |
|---|---|---|
| Reference A (`oryx 22.pdf`) pixel comparison | **BLOCKED** | The reference file is **not present** in the repository or the environment (section 4). The invoice/quotation reproduce the described structure (logo band, navy/silver, bilingual titles, product table, tax/discount, totals, watermark, signatures, footer, page numbers). |
| Reference B (original five-page inspection PDF) | **PASS (structure)** | `vehicle-inspection-full.pdf` reproduces the identification page plus one page per selected area with the original bilingual titles; a partial selection prints only the selected areas. Pixel comparison against the original is **BLOCKED** for the same missing reference. |
| Real PDFs generated and rendered | PASS | `docs/audit/pdf-samples/*.pdf` + rendered PNGs in `pdf-samples/preview/` |
| No technician finding truncated | PASS | dense-checklist regression test |

## 2. Test results (re-run this session on the current tree)

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **217 passed / 217** (11 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **652 passed / 652** (34 suites) |
| API unit | `pnpm --filter @oryx/api test` | **20 passed / 20** (5 files) |
| Documents subset | `… test:e2e -- execution10-merchant-documents execution-phase3-documents document-numbering` | **47 passed / 47** (3 suites) |
| Vehicle documents | `… test:e2e -- vehicle-documents` | **7 passed / 7** |
| Mobile | `pnpm --filter @oryx/mobile test` | **206 passed / 206** (10 files) |
| Mobile ERP | `pnpm --filter @oryx/mobile-erp test` | **31 passed / 31** (2 files) |
| Admin browser | `pnpm --filter @oryx/admin test:ui` | **218 passed, 1 skipped** (8.4 min) |
| Workspace lint | `pnpm -r lint` | PASS (exit 0) |
| Workspace typecheck | `pnpm -r typecheck` | PASS (exit 0) |
| Builds | api / admin / customer | PASS (exit 0) |
| Migrations | `prisma migrate status` | **up to date** (29 migrations applied to `oryx_test`) |

### 2.1 CI workflows (run `fc26eb02`, all jobs green)

| Workflow | Job | Result |
|---|---|---|
| CI | Typecheck and build | success |
| CI | Unit and API integration tests | success |
| CI | Browser acceptance tests | success |
| Mobile APK | Build the debug-signed release APK | success |
| Design preview | Build / Verify / Publish to GitHub Pages | success |

Before this session the `CI` "Unit and API integration tests" job failed on the
tax-invoice `/Type3` assertion, and the `Mobile APK` workflow failed on every
push. Both are fixed and both workflows are now green on the pushed tip.

### 2.2 Defects fixed this session

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
| 11 | Partial Vehicle Inspection | `vehicle-inspection-partial.pdf` (3 pp) | PASS |
| 12 | QR Verification | `/verify/<token>` + `GET /documents/verify/<token>` | PASS |

PDF samples: `docs/audit/pdf-samples/{sales-invoice,quotation,sales-order,
vehicle-inspection-full,vehicle-inspection-partial}.pdf`, with rendered page
PNGs in `docs/audit/pdf-samples/preview/`.

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

Three defects were fixed on top of the recovered tree. The commits are
`de85190f`, `e0b02557` and `fc26eb02`.

| File | Change |
|---|---|
| `apps/api/src/documents/templates/inspection-report.template.ts` | Inspection marks drawn as vectors, not font-glyph codepoints (commit `de85190f`) |
| `apps/api/src/documents/templates/inspection-report.template.spec.ts` | New spec: no template may depend on a mark glyph the embedded fonts lack |
| `apps/api/src/documents/pdf/pdf-renderer.service.ts` | `.num` / `.ltr` use `DOCUMENT_LATIN_STACK` so the Arabic currency symbol stays in the embedded faces (commit `e0b02557`) |
| `apps/api/src/documents/pdf/pdf-renderer.service.spec.ts` | New spec: both stacks must name an Arabic face |
| `.github/workflows/mobile-apk.yml` | Bundle assertion now requires the configured API host instead of an offline bundle; `api_base_url` dispatch input (commit `fc26eb02`) |
| `docs/audit/ORYX_FINAL_ACCEPTANCE.md` | This report |

Earlier working-tree changes, now committed, are listed in the prior revision of
this section and are unchanged by this session.

## 6. Database migrations

29 migrations are applied and the schema is up to date on `oryx_test`. The newest
is `20261105185112_company_finance_defaults`. No migration was added in this
session; the vehicle-documents feature uses the existing `VehicleDocument` table
and the media library.

## 7. Deployment readiness

| Check | Status |
|---|---|
| Lint / typecheck / builds | PASS |
| Migrations apply cleanly | PASS |
| No secret in the diff | PASS (reviewed; no token, key or credential added) |
| Production untouched | PASS (no deploy, no restart, no production migration) |
| PR #7 open and Draft | PASS |

The three fixes are committed and pushed to the existing branch
(`feature/execution-07-premium-web`). The working tree is clean, the remote tip
is `fc26eb02`, PR #7 is open and Draft, and every CI workflow is green on that
tip. The code is **not** deployed and PR #7 is **not** marked ready for review.

## 8. Honest summary

- The platform is far more complete than the handover brief described; the brief
  reflected Execution 05, the tree is at Execution 20.
- Every automated suite is green on the current tree, and every CI workflow —
  including the previously-red API integration job and the Mobile APK build — is
  green on the pushed tip.
- This session found and fixed three real defects: the inspection report's
  font-dependent marks, the tax invoice's Type3 host-font fallback (the Arabic
  BHD symbol in a Latin-only stack), and the stale Mobile APK bundle assertion
  that failed every mobile push. Each has a regression guard or a green CI job
  as proof, and none weakens a test.
- The merchant document surface, the inspection engine, the official-document
  engine and QR verification are implemented, DB-backed and tested.
- The pixel-exact PDF comparisons and the Android device acceptance are blocked
  by missing inputs, not by missing code. They are reported as BLOCKED, not PASS.
- No requirement is claimed complete without the command or artefact that proves
  it.
