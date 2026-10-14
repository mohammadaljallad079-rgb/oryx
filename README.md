# ORYX

Unified enterprise ecosystem: **ORYX Holding ERP**, **ORYX Business SaaS ERP**
and the **ORYX Automotive Ecosystem**, governed from one control plane.

**Execution 01 is implemented and tested:** a running NestJS API, a Next.js
Super Admin application, PostgreSQL persistence with migrations, secure
authentication, multi-company/multi-branch tenancy, RBAC with a permission
catalog, a configurable ERP module catalog, configurable SaaS plans with
snapshot entitlements, and a functional DB-backed dashboard in the approved
navy/gold design with dark and light themes and Arabic RTL / English LTR.

**Execution 02 adds the enterprise ERP core, also implemented and tested:**
financial accounting (chart of accounts, fiscal years and periods, balanced
double-entry journals, general ledger, trial balance, AR/AP aging, receipts and
payments, reversals and period locking, financial statements), sales and POS
(customers, catalog, quotations, orders, invoices, customer payments, credit
notes, cashier sessions, POS sales, accounting integration), procurement
(suppliers, requisitions, purchase orders, goods receipts, supplier invoices,
returns, payments), inventory (warehouses, SKUs, a moving-average stock ledger,
transfers, adjustments, reorder alerts, valuation) and permission-aware reports
for all four domains.

## Documentation

| Document | Purpose |
| --- | --- |
| [Execution 02 report](docs/execution-reports/ORYX_EXECUTION_02_REPORT.md) | Enterprise ERP core: modules, migrations, endpoints, tests |
| [Execution 01 report](docs/execution-reports/ORYX_EXECUTION_01_REPORT.md) | What was built, what was verified, what is missing |
| [Local development runbook](docs/LOCAL_DEVELOPMENT.md) | Install, migrate, seed, run, test |
| [Architecture](docs/architecture/ARCHITECTURE.md) | System design as built |
| [Permission matrix](docs/architecture/PERMISSION_MATRIX.md) | Every permission, its scope and delegation rules |
| [Module & plan entitlements](docs/architecture/MODULE_PLAN_ENTITLEMENTS.md) | Module catalog, plan fields, entitlement resolution |
| [API reference](docs/api/API_REFERENCE.md) | Routes, permissions, error codes, rate limits |
| [Master reference](docs/ORYX_MASTER_REFERENCE.md) | Owner-approved scope |
| [Visual reference](docs/ORYX_VISUAL_REFERENCE.md) | Owner-approved design rules |
| [Agent guide](AGENTS.md) | Instructions for coding agents |

## Quick start

```bash
pnpm install
cp .env.example .env          # then set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
pnpm db:generate && pnpm db:migrate && pnpm db:seed

pnpm dev:api                  # http://localhost:3001/api  (docs at /api/docs)
pnpm dev:admin                # http://localhost:3000
```

Seeded development accounts (change before any non-local use):

| Role | Email | Password |
| --- | --- | --- |
| Platform Super Admin | `superadmin@oryx.local` | `ChangeMe!Oryx2026` |
| Company admin | `admin@oryx-auto.local` | `ChangeMe!Oryx2026` |
| Company admin (demo tenant) | `admin@demo-alnoor.local` | `ChangeMe!Oryx2026` |

## Tests

```bash
pnpm --filter @oryx/shared test    # 30 authorization + money invariants
pnpm --filter @oryx/api test:e2e   # 109 API integration tests (79 E01 + 30 ERP)
pnpm --filter @oryx/admin test:ui  # Playwright acceptance + ERP + screenshots
```

## Repository layout

```text
apps/api           NestJS REST API (modular monolith)
apps/admin         Next.js 15 admin application
packages/shared    permissions, modules, design tokens, authorization rules
packages/database  Prisma schema, migrations, seed
docs/              architecture, api, execution reports, assets
```

## Current limitations

- The official ORYX logo is **not in the repository**; the UI uses a neutral
  placeholder and no mark was invented.
- Dashboard tile artwork is generated abstract vector art; the approved
  photography is not available.
- ERP modules owned by later executions (HR, CRM, operations, automotive) are
  routed and permission-protected but **not implemented** — the screens say so
  and show no fabricated data. Accounting, sales/POS, purchasing, inventory and
  reports are implemented and DB-backed (Execution 02).
- Reports are operational summaries, not a full BI engine; there is no
  custom-report builder.
- Inventory uses moving-average valuation only; FIFO/LIFO are not offered.
- No payment gateway and no email/SMS provider are integrated.
- The consumer mobile application is not part of Execution 01 or 02.
- Nothing is deployed.

See the [Execution 02 report](docs/execution-reports/ORYX_EXECUTION_02_REPORT.md)
and the [Execution 01 report](docs/execution-reports/ORYX_EXECUTION_01_REPORT.md)
for the full breakdown.
