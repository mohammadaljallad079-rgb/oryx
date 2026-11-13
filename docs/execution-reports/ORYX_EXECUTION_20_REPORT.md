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
| API integration | `pnpm --filter @oryx/api test:e2e` | **242 passed** (9 suites; includes the new `execution20.e2e-spec.ts`, 24 tests) |
| Browser (admin) | `pnpm --filter @oryx/admin test:ui` | **129 passed** (includes the new `execution20.spec.ts`, 8 tests) |
| Mobile | `pnpm --filter @oryx/mobile test` | **17 passed** |

Total: **490 automated tests**.

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

Branch `feature/dashboard-modules-redesign`, base `main` @ `75bb08a`. The change
is 75 tracked files modified plus 30 new paths (settings, documents, dashboards,
customer pages, the two new e2e specs, the migration and the Execution 20
screenshots). No commit has been made; nothing is pushed.

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
