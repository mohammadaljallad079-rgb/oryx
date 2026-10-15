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

**Execution 03 adds HR, CRM, operations and automotive services, also
implemented and tested:** HR and payroll (employees with onboarding and
offboarding, departments and job titles, contracts, documents with confidential
access control, leave with balance enforcement, attendance and shifts with
overtime, effective-dated salary structures, payroll runs that snapshot each
structure and post to the ledger atomically and idempotently, run locking,
payslips and employee advances), CRM (leads, pipelines and opportunities that
convert into a sales quotation, contacts, activities, SLA-tracked support
tickets, segments), operations (projects, tasks, work orders with an enforced
state machine and checklists, approvals, comments, attachments, calendar and
persisted internal notifications) and the automotive ecosystem (a vehicle
registry with VIN validation, inspections with findings and approved reports,
a workshop with job cards, estimates and parts that move the shared stock
ledger, warranties, and marketplace provider foundations).

## Documentation

| Document | Purpose |
| --- | --- |
| [Execution 03 report](docs/execution-reports/ORYX_EXECUTION_03_REPORT.md) | HR, CRM, operations, automotive: modules, migrations, endpoints, tests |
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
pnpm --filter @oryx/api test:e2e   # 132 API integration tests (79 E01 + 30 E02 + 23 E03)
pnpm --filter @oryx/admin test:ui  # 108 Playwright acceptance + screenshots
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
- Every ERP module catalog entry is now implemented and DB-backed (Executions 01,
  02 and 03). No module remains a placeholder.
- Payroll calculates from configured salary structures and posts to the ledger;
  it does **not** implement any jurisdiction's labour law, social insurance or
  wage-protection rules. Those must be configured and verified before any
  compliance claim.
- Vehicle inspection is an internal ORYX workflow; it is **not** a government
  certification or an officially accredited inspection.
- Reports are operational summaries, not a full BI engine; there is no
  custom-report builder.
- Inventory uses moving-average valuation only; FIFO/LIFO are not offered.
- Notifications are persisted internally; no email/SMS/push provider is
  connected, so no external delivery is claimed.
- The automotive marketplace provides administrative and backend foundations
  only. The consumer mobile application is not part of Executions 01–03.
- Nothing is deployed.

See the [Execution 03 report](docs/execution-reports/ORYX_EXECUTION_03_REPORT.md),
the [Execution 02 report](docs/execution-reports/ORYX_EXECUTION_02_REPORT.md)
and the [Execution 01 report](docs/execution-reports/ORYX_EXECUTION_01_REPORT.md)
for the full breakdown.
