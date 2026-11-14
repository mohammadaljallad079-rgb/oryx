# Execution 20 — documented starting point

## 1. Exact working SHA

| Field | Value |
| --- | --- |
| **Commit SHA** | `0744601fab9874968ff79adf57c0071a6676bd57` |
| Short | `0744601` |
| Tree | `39f572cba63466668c4208f5a554bddb0ea920ef` |
| Branch | `feature/execution-20-platform-settings` |
| Origin ref | `origin/fix/execution-19-inspection-parity` |
| Commit date | 2026-11-13 02:17:54 +0000 |
| Subject | `docs(execution19): record the remark-block and column-order parity fixes` |
| Worktree | `/workspace/project/oryx-e20` |

The old Execution 20 work remains untouched at
`feature/dashboard-modules-redesign` @ `0be54aa` in `/workspace/project/oryx`.

## 2. Proof that Execution 20, 21 and 22 are present

This is **not** a mock — the SHAs below are on the working commit.

| Execution | Evidence | Verified |
| --- | --- | --- |
| **20** (ecosystem P3–P7) | `docs/audit/backend/EXECUTION_20_REPORT.md`; migrations `20261103043251_execution_20_ecosystem_p3_p7`, `20261103044240_execution_20_return_stock_source`; `apps/api/src/ecosystem/*`; `apps/admin/src/app/(app)/ecosystem/*`; spec `apps/api/test/execution20.e2e-spec.ts` | ✅ tests pass |
| **21** (customer master) | spec `apps/api/test/execution21-customer-master.e2e-spec.ts`; `apps/admin/e2e/execution21-customer-master.spec.ts`; `Customer.sourceId`/`departmentId`; migration `20261106030000_customer_source_department` | ✅ 48 tests pass |
| **22** (documents/attachments) | specs `apps/admin/e2e/execution22-document-attachments.spec.ts`, `execution22-document-form.spec.ts`; `apps/api/src/attachments/*`; migration `20261108190000_print_and_attachments` | ✅ present |

### Test results on `0744601`

| Suite | Result |
| --- | --- |
| `@oryx/shared` unit | **235 passed** (12 files) |
| `@oryx/api` e2e `execution20` + `execution21` | **48 passed** (2 suites) |

The API builds, the database migrates and seeds cleanly, the admin app builds,
and both services run (API `:3001` health `database: up`, admin `:3000`).

## 3. Protected files (must not be modified, disabled or replaced)

| Area | Protected paths |
| --- | --- |
| **Sales & invoice print** | `apps/api/src/documents/templates/*` (`official-financial.template.ts`, `financial-document.template.ts`, `chrome.ts`, `html.util.ts`), `apps/api/src/print/*`, `apps/admin/src/components/document-actions.tsx`, `document-print.tsx`, `document-register.tsx`, `apps/admin/src/lib/print-document.ts` |
| **Homepage** | `apps/admin/src/app/(app)/dashboard/page.tsx` (hero + module tiles), `apps/customer/src/app/page.tsx` |
| **Vehicle inspection & PDF parity** | `apps/api/src/automotive/inspection.*`, `vehicle.*`, `workshop.*`, `apps/api/src/documents/pdf/*`, `templates/inspection-report.template.ts`, `apps/admin/src/app/(app)/automotive/inspections/*` |
| **Execution 20 (P3–P7)** | `apps/api/src/ecosystem/*`, `apps/admin/src/app/(app)/ecosystem/*`, their migrations |

Rule: if a file in this list must change, stop, inspect the overlap and report
before editing.

## 4. Files expected to change (by phase)

### Phase 1 — Dark/Light theme
- `apps/admin/src/app/globals.css` (token + component blocks)
- `apps/admin/src/components/brand-logo.tsx` (only if a colourway is missing)
- any component carrying a literal theme colour (audited below)

### Phase 2 — Module dashboards
- `apps/api/src/dashboard/dashboard.controller.ts`, `dashboard.service.ts`
- `packages/shared/src/contracts.ts`, `packages/shared/src/modules.ts`
- `apps/admin/src/components/module-dashboard.tsx` (new)
- the module pages that mount it: accounting, sales, purchasing, inventory, hr,
  crm, operations, payments, documents, automotive/maintenance

### Phase 3 — Customers
- `apps/api/src/sales/sales.service.ts`, `sales.dto.ts`, `sales.controller.ts`
- `packages/database/prisma/schema.prisma` + a new additive migration
- `packages/shared/src/contracts.ts`
- `apps/admin/src/app/(app)/sales/page.tsx` (customers tab), `customer-form.tsx` (new)

### Phase 4 — Documents & attachments
- `apps/api/src/attachments/*`, `packages/shared/src/attachments.ts`
- `apps/admin/src/components/documents-panel.tsx`, `document-print.tsx` (panel only)

### Phase 5 — Dropdowns
- `apps/admin/src/components/ui.tsx` (`SearchableSelect` → add create),
  a new reusable `EntityPicker` component

### Phase 6 — Maintenance
- `apps/api/src/automotive/workshop.*`, `automotive.dto.ts`
- `apps/admin/src/app/(app)/automotive/maintenance/page.tsx`

### Phase 7 — Settings
- `apps/api/src/organizations/*`, a new `settings` module
- `packages/database/prisma/schema.prisma` + additive migration
- `apps/admin/src/app/(app)/settings/page.tsx`, new panels

## 5. Baseline evidence

54 "before" screenshots (AR/EN × dark/light + automotive) at
`docs/execution-reports/execution20/before/`.
