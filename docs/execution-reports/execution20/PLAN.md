# ORYX — Execution 20 implementation plan (approved base)

**Branch:** `feature/execution-20-platform-settings`
**Base:** `0744601` (`fix/execution-19-inspection-parity`)
**Worktree:** `/workspace/project/oryx-e20`
**Reference assets:** `docs/assets/ORYX Auto Services Dashboard.png`,
`docs/assets/ORYX Arabic Auto Services Homepage.png`, `docs/assets/logo.png.jpeg`
(navy `#00162b` + gold `#d4af37`; light `#f7f4ed`).

## What the approved base already gives us (extend, never replace)

| Area | Already present | Execution 20 adds |
| --- | --- | --- |
| Design system | `globals.css` tokens, `oryx-hero`, `oryx-tile`, dark+light, RTL | module dashboards that use it; fix navy-in-light tile bottoms |
| Module catalog | `MODULES` (21 modules) in `packages/shared/src/modules.ts` | unchanged; drives the new dashboards |
| Homepage | hero + image module tiles (`/dashboard`) | keep; add per-module dashboards |
| Attachments | `attachments` API (PDF/JPG/PNG), `AttachmentsPanel` | widen entity types + MIME set (DOC/XLS), preview |
| Documents | `documents` API (PDF/QR/templates), `documents-panel` | link to the new document centre |
| Company settings | `PATCH /companies/:id`, `company-settings-panel`, `branding-panel`, `tax-rates-panel` | namespaced per-company settings centre |
| Customers | `sales/customers` CRUD + inline lead-source create | split into individual vs company forms |
| Combobox | `SearchableSelect` + `InlineCreateButton` | generalised reusable searchable+create |

## Phases (each: real API + DB + validation + tests + before/after)

0. **Baseline** — build, seed, run, capture `before/` screenshots. **DONE.**
1. **Module dashboards** — one DB-backed `GET /dashboard/module/:key` returning
   banner + real KPIs + quick actions + function cards + recent activity, tailored
   per module (no repeated figures). New `ModuleDashboard` component renders the
   approved banner (logo, AR/EN name, description, stats, shortcuts) and is placed
   on accounting, sales, purchasing, inventory, hr, crm, operations, payments,
   documents, maintenance. Reuses existing per-module endpoints where they exist.
2. **Theme** — make module tiles/banners/stats respond to dark/light (no fixed
   navy bottom in light), unify tables/forms/buttons.
3. **Maintenance** — dedicated dashboard + full job-order form (customer→vehicle
   with popups, mileage, inspection, services, parts, labour, VAT/discount/total,
   technician, expected delivery, notes, photos, signature) and the 7-state
   machine, wired to customers/vehicles/stock/accounting/invoices.
4. **Customers** — separate individual and company forms with tabs (company:
   CR/VAT/website/responsible person/branches/documents), relations preserved.
5. **Documents** — unified attachment manager across employees, customers,
   companies, suppliers, maintenance, purchasing, accounting, contracts; upload /
   preview / download / replace / delete / categorise; per-record isolation.
6. **Dropdowns** — reusable searchable select with `+ add new` opening the **full
   original form** in a modal that saves through the real API and auto-selects.
7. **Settings** — namespaced per-company settings centre (general, invoicing,
   accounting, tax, HR, purchasing, sales, maintenance, documents) stored per
   company and applied to issued documents; switching company loads its settings.

## Guardrails

- Do not touch sales/invoice print, homepage, inspection/PDF, or the upstream
  Execution 20 (P3–P7) work; inspect overlaps before editing.
- No merge, no production deploy without explicit approval.
