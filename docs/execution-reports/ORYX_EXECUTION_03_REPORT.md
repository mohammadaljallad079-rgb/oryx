# ORYX — Execution 03 Report: HR, CRM, Operations & Automotive Services

Status: **implemented, tested and ready for owner review**. Nothing is merged
and nothing is deployed.

## 1. Recovered GitHub state

GitHub was the source of truth.

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| PR #1 (`feature/execution-01-super-admin-foundation`) | **merged** into `main` |
| PR #2 (`feature/execution-02-erp-core`) | **merged** into `main` at 2026-10-14T20:14:18Z |
| PR #2 head | `09b85f07632d6229751937b1e23d61f82ef539c7` |
| Current `main` / Execution 02 merge commit | `0173fc96653496b349451246c479a7a8cb69f703` |
| Execution 03 branch before this session | none existed |

Because both prior PRs are merged, Execution 03 was based on the latest `main`
(`0173fc9`). No prior work was overwritten, reset or duplicated, and Executions
01–02 were not restarted.

## 2. Branch and commit

| Item | Value |
| --- | --- |
| Branch | `feature/execution-03-hr-crm-automotive` |
| Base | `main` @ `0173fc96653496b349451246c479a7a8cb69f703` |
| Head at time of writing | see the PR; the branch is not force-pushed |

## 3. Baseline verification (before any change)

- `pnpm --filter @oryx/shared test` — 30 passed.
- `pnpm --filter @oryx/api test:e2e` — 109 passed.
- All Execution 01 and 02 correctness invariants (balanced ledger, atomic and
  idempotent posting, row-locked inventory, tenant isolation) were preserved and
  are still asserted by the existing suites, which continue to pass.

## 4. What Execution 03 delivers

Six modules, all DB-backed, permission-protected, entitlement-gated and covered
by tests. They reuse the Execution 01 authorization/tenancy architecture and the
Execution 02 accounting and inventory engines — there is one ledger and one stock
ledger across the platform.

### A. Human Resources & Payroll (`human_resources`)

- Departments (with a tree), job titles and reporting lines.
- Employee profiles and employment records, with an onboarding checklist created
  automatically and an offboarding checklist on demand.
- Employment contracts; employee documents with a **confidential** flag that is
  only readable by a principal holding `erp.hr.document.confidential`.
- Leave types, balances, requests and approvals. A request checks
  `entitled + accrued − used − pending`, reserves the days as pending, and
  approval moves them to used — so two requests cannot consume the same days.
- Shifts, attendance and overtime.
- **Effective-dated salary structures** with fixed or percentage allowances and
  deductions.
- Payroll periods and runs. A run **snapshots** each employee's structure into
  the payslip, so editing a salary later never changes a historical result.
- Payroll approval posts to the ledger through the Execution 02 engine:
  Dr Salaries expense, Cr Salaries payable (net), Cr Deductions payable,
  Cr Employee advances receivable. Posting is **atomic** (status change, payslips
  and the journal commit together) and **idempotent** (`payroll:<runId>` source
  key), so a retried approval cannot double-post. Run locking closes the period
  and refuses a new run against it.
- Employee advances with settlement (in full or per payroll instalment).
- A workforce dashboard.

### B. CRM & Customer Service (`crm`)

- Lead sources, leads, pipelines and pipeline stages.
- Opportunities with stage moves; a **won** opportunity converts into a real
  sales quotation, created in the shared sales table so both modules see one
  quotation. Conversion happens once.
- Customer contacts and a **duplicate-protected** customer master (matches on tax
  number, email or phone within the company).
- Activities, follow-ups and reminders.
- Support tickets whose SLA response and resolution targets are derived from the
  matching SLA policy at creation, with first-response tracking and a
  satisfaction score.
- Customer segments.
- A CRM dashboard.

### C. Operations & Work Management (`operations`)

- Projects; tasks and subtasks; assignments, priorities and due dates.
- Work orders with an **enforced state machine**
  (`DRAFT → OPEN → ASSIGNED/IN_PROGRESS → ON_HOLD → COMPLETED`, terminal
  `CANCELLED`), checklists, a department work queue and branch scoping.
- Approval workflows, internal comments, document attachments.
- An operational calendar and **database-persisted internal notifications** (no
  external delivery is claimed; no provider is connected).
- An operations dashboard.

### D. Vehicle Management (`automotive_inspections`)

- Vehicle registry with **VIN validation** (11–17 characters, uppercase letters
  and digits, and none of I, O or Q) and per-company uniqueness.
- Customer-owned vehicles, make/model/year, registration and plate, and a
  mileage history that never decreases.
- Vehicle documents and full service history.

### E. Vehicle Inspection (`automotive_inspections`)

- Inspection service catalog with checklists.
- Bookings with inspector assignment and odometer capture.
- Findings with defect classification (INFO/MINOR/MAJOR/CRITICAL).
- A **PDF-ready report payload** (vehicle, service, findings, defects, critical
  count, attachments) and an approval workflow.
- Invoicing of an approved inspection through the shared sales path.

### F. Maintenance & Workshop (`automotive_maintenance`)

- Workshop bays, maintenance bookings and job cards.
- A job-card state machine; **completion requires an approved estimate**, so work
  is never billed unapproved.
- Labour operations, repair estimates with customer approval.
- Parts reservation and issuance, warranty tracking.
- Workshop invoicing through the shared sales path, so revenue, VAT and the
  receivable post to the one ledger.

### G. Spare Parts (`spare_parts`)

- Part numbers (OEM / aftermarket / cross-reference) and vehicle compatibility
  mapping, with a findByVehicle lookup.
- Reservation of stock for a job card and issuance through the **shared stock
  ledger** (`InventoryService.recordMovement`) — there is no second inventory
  ledger and no second accounting system.
- Stock availability and low-stock suggestions come from the existing inventory
  module.

### H. Automotive Marketplace Foundation

- Service providers with an approval workflow (only an **approved** provider can
  be assigned), provider company profiles, service listings and service
  categories.
- Service requests with provider assignment and status tracking.
- Commission configuration (basis points per provider) and commission recording.
- Provider settlement foundations for a period (aggregates pending commissions;
  no payment is executed).
- Versioned APIs under `/api/v1` that the future application can consume. The
  consumer mobile application is **not** built in Execution 03.

## 5. Database migrations

Three additive migrations:

| Migration | Contents |
| --- | --- |
| `20261014202428_execution_03_hr_crm_automotive` | HR, payroll, CRM, operations, automotive, parts and marketplace tables and enums |
| `20261014203945_execution_03_journal_sources` | `WORKSHOP_INVOICE` and `INSPECTION_INVOICE` journal source types |
| `20261014205408_execution_03_work_order_project` | `WorkOrder.projectId` and its relation |

Every tenant-owned table carries `companyId`; branch-scoped rows carry
`branchId`. Money is integer minor units; hours and leave days are hundredths of
a unit; percentages are basis points. No Execution 01 or 02 table was altered
destructively; only new relations were added to `Company`, `Branch`, `Customer`
and `Product`.

## 6. API endpoints

144 new routes under `/api/v1` (`/hr`, `/crm`, `/operations`, `/automotive`). The
full per-route permission table is in `docs/api/API_REFERENCE.md`. Every route
uses the existing `@RequireModule` + permission guards and is company-scoped
server-side.

## 7. Functional cross-module workflows verified

Each is asserted by the integration suite against the real HTTP surface and the
seeded database:

1. **HR:** employee → leave (balance enforced) → payroll run → approval posts a
   balanced journal → lock closes the period.
2. **CRM:** lead → opportunity → stage "won" → convert → a real sales quotation.
3. **Operations:** create work order with a checklist → start → complete, with an
   illegal transition refused.
4. **Inspection:** vehicle → booking → findings → report → approve → invoice.
5. **Maintenance:** vehicle → job card → estimate → customer approval → parts
   reserve and issue (stock ledger moves once) → complete → invoice.
6. **Parts:** reserve → issue consumes the shared stock ledger; concurrent
   issuance is guarded so stock never goes negative.

## 8. Test results

| Suite | Command | Result |
| --- | --- | --- |
| Shared unit tests | `pnpm --filter @oryx/shared test` | **30 passed** |
| API integration (e2e) | `pnpm --filter @oryx/api test:e2e` | **132 passed** (79 E01 + 30 E02 + 23 E03) |
| Browser acceptance (Playwright) | `pnpm --filter @oryx/admin test:ui` | **108 passed** (incl. 9 new E03 UI tests) |

Total: **270 automated tests passing.**

The mandatory Execution 03 tests are all present and passing:

- payroll calculation and accounting posting, payroll idempotency, payroll period
  locking;
- leave balance enforcement; employee data isolation;
- CRM pipeline conversion; duplicate customer prevention;
- support-ticket permissions;
- work-order state transitions;
- inspection approval and report integrity;
- vehicle data isolation and VIN validation;
- parts reservation and stock consumption; concurrent inventory consumption;
- workshop invoice posting;
- marketplace provider approval;
- tenant isolation, branch permissions, subscription entitlement restrictions;
- Arabic/English interfaces, dark/light themes and mobile responsiveness.

No existing test was removed or weakened; the E01/E02 suites still pass unchanged.

## 9. GitHub Actions CI

The existing CI workflow runs the shared unit tests, the API integration suite
and the full Playwright suite against a PostgreSQL 17 service. Execution 03 adds
no new workflow: the new suites are picked up automatically, and the Execution 03
branch was added to the `push` trigger. CI status will be shown on the PR; all
three jobs must pass on the final commit.

## 10. Screenshots

Captured by the Playwright screenshot suite into
`docs/execution-reports/screenshots/`:

- `e03-hr-dark.png`
- `e03-crm-dark.png`
- `e03-operations-dark.png`
- `e03-inspections-dark.png`
- `e03-maintenance-dark.png`
- `e03-spare-parts-dark.png`

The approved navy/gold design, right-side Arabic navigation, image-led module
cards, responsive layout and both themes are preserved and extended to the new
screens. The official logo is still absent from the repository; the neutral
monogram placeholder remains and no brand mark was invented.

## 11. Migration and rollback notes

- **Apply:** `pnpm db:migrate` (runs `prisma migrate deploy`). The migrations are
  additive and safe to apply to a database that already has Executions 01–02.
- **Seed:** `pnpm db:seed` is idempotent and adds departments, job titles,
  employees with salary structures, leave types, shifts, lead sources, a default
  pipeline, inspection services with checklists, bays and an approved provider for
  every active company.
- **Rollback:** dropping Execution 03 objects restores the Execution 02 schema.
  The three migrations can be reverted by dropping the tables and enums they
  create; no Execution 01 or 02 column or row is modified, so a rollback cannot
  lose prior data.

## 12. Known limitations and deferred integrations

- **No jurisdiction compliance.** Payroll calculates from configured salary
  structures and posts to the ledger. It does **not** implement Bahrain labour
  law, social insurance, WPS or any other jurisdiction's rules. Those must be
  configured and verified before any compliance claim.
- **Inspection is not accreditation.** The inspection workflow is an internal ORYX
  process. It is **not** government certification or an officially accredited
  inspection.
- **Notifications are internal only.** They are persisted in the database; no
  email, SMS or push provider is connected, so no external delivery is claimed.
- **Marketplace is a foundation.** Provider onboarding, listings, requests,
  commissions and settlements are implemented administratively; the consumer
  mobile application and payment execution are deferred.
- **No payment gateway.** Nothing charges a card or moves money.
- **Valuation is moving-average only.** FIFO/LIFO remain out of scope.
- **Deferred to a later execution:** the consumer mobile application and the
  automotive consumer-facing experiences (My Garage, Auto Map, SOS dispatch,
  marketplace checkout).

## 13. Pull request

| Item | Value |
| --- | --- |
| PR | https://github.com/mohammadaljallad079-rgb/oryx/pull/3 |
| Base | `main` |
| Head | `feature/execution-03-hr-crm-automotive` |
| CI | GitHub Actions run on the branch (`ci.yml`) |

It is **not** to be merged or deployed without owner approval. Execution 04 must
not start without explicit owner approval.
