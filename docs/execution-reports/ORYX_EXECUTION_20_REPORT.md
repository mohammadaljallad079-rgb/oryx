# ORYX — Execution 20 Report: Per-Company Settings, Unified Documents, Customer Types and Module Dashboards

Status: **implemented, tested and ready for owner review**. Nothing is merged
and nothing is deployed.

## 1. Scope and branch

Execution 20 redevelops the ORYX interfaces, sections, forms and settings. It is
an increment on the existing repository, not a new project: every Execution 01–05
behaviour, table and permission is preserved, and no existing module was removed,
disabled or replaced with placeholder data.

| Item | Value |
| --- | --- |
| Branch | `feature/dashboard-modules-redesign` |
| Base | `main` @ `75bb08a` |
| Pull request | not opened; awaiting owner approval (no push, no merge, no deploy) |

The four deliverables the owner named, plus the implied module dashboards:

1. Per-company, namespaced settings that drive issued documents.
2. A unified document/attachment system across every record type.
3. Customer types (individual vs company) with secondary branches.
4. A DB-backed dashboard for every module, in the accounting style.

## 2. What was built

### 2.1 Per-company settings (multi-tenant, isolated on the server)

Settings are stored per company and per namespace:

- `CompanySetting(companyId, namespace, value JSONB)` with a compound unique on
  `(companyId, namespace)`.
- `CompanySettingRevision` records the **previous** value of a namespace inside
  the same transaction as the write, so every change is traceable and a reset is
  just another revision.
- Nine namespaces, declared once in `packages/shared/src/settings.ts`:
  `GENERAL`, `INVOICING`, `ACCOUNTING`, `TAX`, `HR`, `INVENTORY`, `SALES`,
  `MAINTENANCE`, `DOCUMENTS`. The Prisma `SettingNamespace` enum mirrors the list.

Every read merges the stored object over `defaultSettingsFor(namespace)`, so a
company that has never saved a namespace still reads a complete, usable set.
Every write passes through `sanitizeSettings`, which drops unknown keys and
rejects out-of-range values before anything is stored.

**Isolation is enforced in the query, not the UI.** Each settings route resolves
the company through `ErpContextService.resolveCompanyScope` first. A company
principal that names another `companyId` is scoped to its own company; a platform
principal must be inside an explicit, reasoned support session. There is no
settings path that reads a raw `companyId`.

**Settings drive the documents a tenant issues.** The sales invoice path reads
`TAX` (VAT on/off and rate) and `INVOICING` (number prefix) for the current
company only, and the workshop job-card path reads `MAINTENANCE` for its prefix.
The seed gives a second tenant a different VAT rate (5%) and a different invoice
prefix, and the e2e suite asserts both companies issue their own numbers and
rates from the same code path.

### 2.2 Unified document management

One table (`EntityAttachment`) backs documents for every supported record type:
customer, company, supplier, employee, vehicle, job card, inspection, purchase
order, supplier invoice, journal entry, work order and project. The allowed types
are PDF, DOC/DOCX, XLS/XLSX, JPG and PNG.

- **Upload** as `multipart/form-data`, **register by reference**, **list**,
  **download**, **replace** and **delete**.
- Binaries are written **outside the web root** under `DOCUMENT_STORAGE_DIR`. The
  `storageRef` is an opaque `<companyId>/<uuid><ext>` path that is re-joined
  under the storage root and re-checked on every read, so a caller cannot name an
  arbitrary file. Nothing is served statically.
- A document's owning company is resolved and the owner record is confirmed to
  exist inside that company **before** a row is written, and re-resolved before a
  download. A document belonging to another tenant is never listed, fetched or
  deleted even when its id is known.
- Reads return metadata only (name, size, type, category, uploader, timestamp);
  only the authenticated `download` route streams the bytes.
- `ReplaceDocumentDto` is partial: a missing field keeps the existing value, so a
  metadata-only edit never drops the stored file's record.

The admin UI exposes this as a reusable `DocumentsPanel` with upload, preview,
download, replace and permission-gated delete, showing file name, size, type and
upload date.

### 2.3 Customer types and secondary branches

`Customer` gained a `CustomerType` (`INDIVIDUAL` | `COMPANY`):

- **Individual:** personal fields (`nationalId`, `phone`) and contact details.
- **Company:** commercial fields (`crNumber`, `crExpiresAt`, `taxNumber`,
  `website`, `contactPersonName`, `contactPersonPhone`, `contactPersonEmail`)
  plus secondary branches in `CustomerBranch` (name, contact, phone, email,
  address, city, country, head-office flag).

The admin customer form renders a distinct field set per type with tabs, and the
server rejects a company-only field or a branch on an individual. Branches are
replaced wholesale on update. The existing relations to invoices, sales and
purchases are unchanged.

### 2.4 Module dashboards

`ModuleDashboardService` computes a `ModuleDashboardResponse` for each module from
that module's own tables: a banner (name in both languages, description, ORYX
monogram), live KPIs, module-specific statistics, permission-filtered shortcuts,
recent activity and a monthly series. Each module reports its own figures — the
accounting dashboard is not the inventory dashboard. A module the company is not
licensed for is refused, and a shortcut the caller cannot act on is dropped.

The shared `ModuleBanner` component heads every module page: accounting, sales,
purchasing, inventory, HR, CRM, operations, maintenance, bookings, payments,
providers and reports.

### 2.5 Unified searchable dropdowns

`SearchableSelect` is the shared picker: a search box inside the menu, live
results while typing, and a `+` button that opens the **original** create form as
a modal over the current form. Saving performs a real API create, the list
refreshes, and the new item is selected automatically. The maintenance job card
uses it for the customer (with the full individual customer form) and the vehicle
(with the full vehicle form). No popup writes to component state only.

### 2.6 Document print

Issued sales documents print the approved ORYX form. A single route resolves a
`PrintDocumentDto` from the document's **own persisted rows**, and the shared
template in `packages/shared/src/print.ts` renders it in the browser, so the
printed page (and "Save as PDF") matches the reference form and carries the
issuing company's own letterhead. Five kinds are supported: `SALES_INVOICE`,
`QUOTATION`, `SALES_ORDER`, `CREDIT_NOTE` and `RECEIPT`.

- The letterhead (name, TRN, CR, address, contact) comes from the company's own
  `GENERAL` settings, falling back to the provisioning row, so each tenant's
  document carries its own details.
- The issue date is formatted in the **issuing company's** time zone, with the
  weekday and a 12-hour clock the approved form shows.
- The printed invoice carries a "Payment" line naming the settlement method and
  the salesperson; the printed receipt carries a "المستلم / Received By" line.
  Those values are stored on the document itself (`SalesInvoice.paymentMethod`,
  `paymentReference`, `salespersonName`; `Quotation`/`SalesOrder.salespersonName`;
  `Payment.receivedByName`) rather than read from the record that later settles
  it, so a reprint shows what was actually issued.
- `DocumentPrintActions` (admin) offers preview and print from the sales invoice,
  sales credit-note and accounting receipt rows; the popup is opened same-origin
  so the print dialog works, and a blocked popup surfaces a message.

## 3. Database changes

New migration
`packages/database/prisma/migrations/20261113020000_execution_20_settings_documents_customers/migration.sql`:

| Change | Detail |
| --- | --- |
| `CREATE TYPE "SettingNamespace"` | Nine-value enum, mirrors `SETTING_NAMESPACES` |
| `CREATE TYPE "CustomerType"` | `INDIVIDUAL`, `COMPANY` |
| `ALTER TABLE "Customer"` | adds `type` (default `INDIVIDUAL`), `crNumber`, `crExpiresAt`, `website`, `contactPersonName`, `contactPersonPhone`, `contactPersonEmail`, `nationalId`, `state`, `postalCode` |
| `ALTER TABLE "EntityAttachment"` | adds `category`, `title`, `updatedAt` |
| `CREATE TABLE "CustomerBranch"` | secondary company branches, company-scoped |
| `CREATE TABLE "CompanySetting"` | one row per `(companyId, namespace)`, `value` JSONB |
| `CREATE TABLE "CompanySettingRevision"` | append-only settings history |

All new tables carry `companyId` and are indexed on it. `prisma migrate status`
reports the database schema is up to date (13 migrations).

A second, additive migration for the print model —
`packages/database/prisma/migrations/20261115021810_execution_20_sales_documents_print/migration.sql`:

| Change | Detail |
| --- | --- |
| `ALTER TABLE "SalesInvoice"` | adds `paymentMethod` (default `CASH`), `salespersonName`, `paymentReference` |
| `ALTER TABLE "Quotation"` | adds `salespersonName` |
| `ALTER TABLE "SalesOrder"` | adds `salespersonName` |
| `ALTER TABLE "Payment"` | adds `receivedByName` |

`prisma migrate diff` reports "No difference detected" against the schema.

## 4. API changes

New and modified endpoints (all under `/api/v1`, all permission-guarded):

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/settings` | `erp.settings.read` (or `erp.settings.update`, `company.settings.update`) |
| GET | `/settings/namespaces` | `erp.settings.read` |
| GET | `/settings/history` | `erp.settings.read` |
| GET | `/settings/:namespace` | `erp.settings.read` |
| PATCH | `/settings/:namespace` | `erp.settings.update` |
| POST | `/settings/:namespace/reset` | `erp.settings.update` |
| GET | `/documents/entity-types` | `erp.document.read` / `erp.document.upload` |
| GET | `/documents` | `erp.document.read` / `erp.document.upload` |
| POST | `/documents` | `erp.document.upload` |
| POST | `/documents/upload` | `erp.document.upload` |
| POST | `/documents/:id/replace` | `erp.document.upload` |
| GET | `/documents/:id/download` | `erp.document.read` / `erp.document.upload` |
| DELETE | `/documents/:id` | `erp.document.delete` |
| GET | `/dashboard/modules/:moduleKey` | `erp.dashboard.read` / `platform.company.read` |
| GET | `/sales/customers/:id` | `erp.sales.read` / `erp.sales.customer.manage` |
| GET | `/print/:kind/:id` | `erp.sales.read` / `erp.sales.invoice.manage` / `erp.sales.order.manage` / `erp.sales.credit_note.manage` / `erp.sales.payment.manage` / `erp.accounting.read` / `erp.accounting.payment.manage` |

The print route deliberately requires no module: it only returns data the caller
could already read through the owning module's own endpoints, and a tenant whose
plan has lapsed must still be able to reprint a document it already issued.
`kind` is one of `SALES_INVOICE`, `QUOTATION`, `SALES_ORDER`, `CREDIT_NOTE`,
`RECEIPT`.

New permissions (`packages/shared/src/permissions.ts`): `erp.settings.read`,
`erp.settings.update`, `erp.document.read`, `erp.document.upload`,
`erp.document.delete`, `erp.customer.company.manage`. They are `COMPANY`-scope
and delegable, so the seeded company-administrator role picks them up.

**Fixed a latent permission bug:** the settings controller referenced a
non-existent `company.settings.read` permission, so the guard rejected every
settings request with a 403 "Unknown permission requirement". It now uses catalog
permissions only.

## 5. Admin UI changes

- `ModuleBanner` — the shared banner, KPIs, statistics, activity and chart that
  heads each module page.
- `SearchableSelect` — search, live results and in-place `+` create.
- `CustomerFormModal` — type-aware customer form with tabs.
- `VehicleFormModal` — vehicle create form used by the maintenance picker.
- `DocumentsPanel` — the reusable upload/preview/download/replace/delete panel.
- `DocumentPrintActions` — the print toolbar (preview + print) placed on the
  sales invoice, sales credit-note and accounting receipt rows.
- `settings/page.tsx` — the settings control center: one independent panel per
  namespace, with save, reset and change history.
- `customers/page.tsx` — the split list and the individual/company forms.
- Theme and i18n work in `globals.css`, `dictionaries.ts`, `navigation.ts`,
  `ui.tsx` and `api.ts`: cards, banners and statistics follow the active theme;
  section images stay fixed and legible; no fixed navy panel survives in light
  theme; tables, forms, lists and buttons share one palette; full Arabic RTL and
  English LTR coverage for every new screen.

## 6. Tests

| Suite | Command | Result |
| --- | --- | --- |
| Shared unit | `pnpm --filter @oryx/shared test` | **102 passed** (6 files; includes the new `settings.test.ts`) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **248 passed** (10 suites; includes the new `execution20.e2e-spec.ts`, 24 tests, and `print.e2e-spec.ts`, 6 tests) |
| Browser (admin) | `pnpm --filter @oryx/admin test:ui` | **136 passed** (includes the new `execution20.spec.ts`, 8 tests, and `print.spec.ts`, 2 tests) |
| Mobile | `pnpm --filter @oryx/mobile test` | **17 passed** |

Total: **503 automated tests**.

The Execution 20 API suite covers, against the real HTTP surface, guards and
Prisma layer: settings read/merge, cross-company isolation, unknown-key drop,
out-of-range rejection, revision history, reset, a company principal blocked from
another tenant's settings; document upload against an owning record, list,
download, unsupported-type refusal, replace, cross-tenant invisibility and
delete; individual vs company customer creation, list filtering by type and
branch replacement; two companies issuing invoices with their own prefix and VAT
rate; and module dashboards reporting module-specific figures, refusing an
unlicensed module and dropping an unusable shortcut.

The Execution 20 browser suite covers: every module page heading with its own
banner and KPIs; the settings control center listing every namespace and
persisting a change; settings change history; the customers split and the two
forms; the document panel on a record; light and dark themes; Arabic RTL; and the
maintenance job card picking a customer from the searchable list.

The print suites cover, through the real HTTP surface and a real browser: an
invoice, a credit note, a quotation and a receipt resolving to complete print
models (title in both languages, seller TRN/CR, party, totals at the currency's
own scale); a receipt carrying the stored "Received By" name; a cross-tenant
print refused; an unknown id returning 404 rather than 500; and the sales invoice
and credit-note rows opening a popup preview with the approved form and no server
error.

Build and static checks: `@oryx/shared` typecheck, `@oryx/admin` typecheck and
lint (`eslint . --max-warnings=0`) and the admin build all pass; `nest build` for
the API passes.

## 7. Screenshots

`docs/execution-reports/screenshots/` — captured by
`apps/admin/e2e/screenshots.spec.ts`:

- `e20-{accounting,inventory,purchasing,sales}-{dark,light}.png` — module
  dashboards in both themes.
- `e20-settings-general-dark.png`, `e20-settings-{invoicing,tax,hr,maintenance}-dark.png`
  — the settings control center.
- `e20-customers-list-dark.png`, `e20-customer-company-form-dark.png`,
  `e20-customer-documents-dark.png` — the split list, the company form and the
  document panel.

## 8. Completed vs remaining

**Completed and verified**

- Per-company, namespaced settings with server-side isolation and history.
- Settings that drive issued invoices and job cards per company.
- Unified documents across every supported record, with preview/download/replace.
- Customer types with company-only fields and secondary branches.
- A DB-backed dashboard for every module.
- Unified searchable dropdowns with in-place create through the real form.
- Theme, typography and RTL/LTR coverage for the new screens.

**Remaining / deliberately out of scope**

- No push, merge or deploy: the branch is local and awaits owner approval.
- The official ORYX logo and approved photography are still absent; the UI keeps
  the neutral monogram and generated tile art.
- Document storage is local-disk; an object-store adapter is a later increment.
- The admin customer list keeps the existing pagination behaviour.

## 9. Handoff

Branch `feature/dashboard-modules-redesign`, base `main` @ `75bb08a`. Across
Execution 20 the change is 75 tracked files modified plus 30 new paths (settings,
documents, dashboards, customer pages, the print model and template, the print
e2e and browser specs, the migrations and the Execution 20 screenshots). No
commit has been made; nothing is pushed.

To verify locally:

```bash
pnpm install
pnpm --filter @oryx/shared build && pnpm --filter @oryx/database build
pnpm db:migrate && pnpm db:seed
pnpm --filter @oryx/shared test
pnpm --filter @oryx/api test:e2e
# with both dev servers running:
pnpm --filter @oryx/admin test:ui
```

## 10. Independent verification addendum

This addendum records a second, independent verification pass over the branch
(not a re-run of the numbers above). Every figure was reproduced on a fresh,
isolated database.

**Method**

- Fresh database `oryx_e20_verify`, all 13 migrations applied cleanly from
  scratch, then `pnpm db:seed`. The shared dev database was left untouched.
- Real suites executed against that database, not trusted from the report:
  shared 102/102, API e2e 242/242 (9 suites), browser 134/134 (was 129 + the new
  theme suite), mobile 17/17. Total 495.
- `pnpm --filter @oryx/admin typecheck`, `@oryx/admin lint`, `@oryx/customer lint`
  and `@oryx/api typecheck` all exit 0; the admin production build succeeds.

**Confirmed as implemented**

- Per-company settings: `SETTING_NAMESPACES` has all nine namespaces
  (GENERAL, INVOICING, ACCOUNTING, TAX, HR, INVENTORY, SALES, MAINTENANCE,
  DOCUMENTS). The API scopes every read/write through
  `resolveCompanyScope`; `execution20.e2e-spec.ts` proves one company cannot
  read another's settings.
- Settings drive issued documents: `SalesService.createInvoice` reads the
  caller's own `TAX` and `INVOICING` rows for the VAT default and invoice
  prefix. The API suite issues an invoice as company A (prefix `ZZ`, VAT 5%) and
  as company B (prefix `YY`) and asserts the two differ.
- Unified documents: one `EntityAttachment` store, 13 entity types (customer,
  company, supplier, employee, vehicle, job card, inspection, purchase order,
  supplier invoice, journal entry, contract, work order, project) and the exact
  accepted types from the brief (PDF, DOC/DOCX, XLS/XLSX, JPG, PNG). Every read,
  write, replace and delete is company-scoped and path traversal is refused;
  cross-tenant access is refused by test.
- Customer types: `INDIVIDUAL`/`COMPANY` with company-only fields and
  secondary branches; the form renders a different field set per type.
- Module dashboards: 21 module keys resolve to distinct, DB-backed figures; the
  banner, KPIs, shortcuts and activity render on 12 admin pages, and an
  unlicensed module is refused.

**Two defects found and fixed (commit `3391eea`)**

1. The module-tile bottom band did not follow the theme. The tile's navy scrim
   still ended in `rgba(0,22,43,0.9)` in the light theme, so the bottom of every
   tile stayed a fixed navy plate with white ink — the brief forbids exactly
   this. Fixed with a themed `--tile-band` on a separate `.oryx-tile::after`
   layer: `none` in dark (dark render byte-identical), an ivory fade with dark
   ink in light. Measured live: dark band luminance 26.9 before and after
   (unchanged); light 37.6 → 218.9. New `execution20-theme.spec.ts` pins the
   contract and scans six module pages for any dark surface that survives the
   light theme.
2. The maintenance job-card customer picker selected the id of a customer
   created in place but never added it to its option list, so the control kept
   showing the placeholder. The record was saved (verified in the database), but
   the picker looked empty. It now appends the created customer before selecting
   it, matching the vehicle picker. `execution20.spec.ts` test 9 drives this end
   to end and asserts the picker shows the new customer.

**Database drift fixed (commit `800166d`)**

`prisma migrate diff` reported exactly one difference between the migration
history and the schema: `EntityAttachment.updatedAt` carried a database
`DEFAULT CURRENT_TIMESTAMP` that the schema does not declare (it is
`@updatedAt`). A new additive migration drops the default; the diff is now
"No difference detected" and the change is safe for already-migrated databases.

**Unified pickers extended across the module forms (commit `a18d500`)**

The searchable picker with in-place create now covers every entity dropdown in
the admin forms, not just the maintenance job card. A new shared
`apps/admin/src/components/entity-forms.tsx` holds the original create forms as
reusable modals (supplier, warehouse, product, account, department, employee,
project); each calls the real create endpoint, so a new record is written to the
database and selected in place — no component-state-only popup.

- Purchasing: requisition, purchase order and supplier-invoice supplier and
  warehouse fields.
- Inventory: stock-movement warehouse and product fields.
- Accounting: journal-line account field.
- CRM: opportunity customer field.
- Operations: work-order project field.
- Sales: the sales document modal's customer and warehouse fields.
- Maintenance: customer and vehicle fields (already converted) now share the
  common label set.

`usePickerLabels` gives every picker the same search placeholder, add action and
empty state in both languages. `erp.spec.ts` was updated to drive the journal
account field as a picker; all other suites are unchanged and green.

**Verified results (fresh database, commit `a18d500`)**

| Suite | Result |
| --- | --- |
| `@oryx/shared test` | 102 passed |
| `@oryx/api test:e2e` | 242 passed |
| `@oryx/admin test:ui` (Playwright) | 134 passed |
| `@oryx/admin` typecheck (`tsc --noEmit`) | clean |
| `@oryx/admin` lint (`eslint . --max-warnings=0`) | clean |

**Known limits (unchanged, not defects)**

- Document storage is local disk; an object-store adapter is a later increment.
- A handful of remaining native selects are enum/status filters or fields with
  no standalone create form (booking type, resource kind, leave type, payment
  provider, priority, locale, plan/role pickers on the platform pages); they are
  intentionally not pickers because there is no "add new" record to create.
