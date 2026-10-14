# ORYX — Execution 02 Report: Enterprise ERP Core

Status: **implemented, tested and ready for owner review**. Nothing is merged
and nothing is deployed.

## 1. Recovered GitHub state

GitHub was the source of truth for this session; the previous conversation was
unavailable.

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| PR #1 (`feature/execution-01-super-admin-foundation`) | **merged** into `main` at 2026-10-14T13:28:02Z |
| PR #1 head commit (last verified Execution 01 commit) | `efed3488c803a4bb834860be97f4e03edf2c1a7e` |
| PR #1 merge commit / current `main` | `77c19252ac1768c89099835b5d68215d7fa14d24` |
| Other branches | only `feature/execution-01-super-admin-foundation` (merged) |
| Other pull requests | none |
| Execution 02 branch before this session | none existed |

Because PR #1 **is** merged, Execution 02 was based on the latest `main`
(`77c1925`) and the new branch was created from it. No existing work was
overwritten, reset or duplicated, and Execution 01 was not restarted.

## 2. Branch and commit

| Item | Value |
| --- | --- |
| Branch | `feature/execution-02-erp-core` |
| Base | `main` @ `77c19252ac1768c89099835b5d68215d7fa14d24` |
| Head at time of writing | see the PR; the branch is not force-pushed |

## 3. What Execution 02 delivers

Five operational modules, all DB-backed, permission-protected, entitlement-gated
and covered by tests. They reuse the Execution 01 authorization, tenancy and
subscription architecture — no separate or disconnected system was introduced.

### A. Accounting (`financial_accounting`)

- Chart of accounts with a seeded standard chart (14 system accounts) and
  system roles (AR/AP control, cash, bank, revenue, VAT output/input, inventory,
  COGS, discount, over/short, adjustment, purchase price variance).
- Fiscal years with monthly periods; periods are `OPEN`, `CLOSED` or `LOCKED`.
- Balanced double-entry journals. Every posted entry is **balanced** (asserted
  before insert), **atomic** (header, lines and account balances in one
  transaction), **auditable** (source document, never edited after posting) and
  **idempotent** (a unique key on `(companyId, sourceType, sourceId)` makes a
  retried posting a no-op).
- General ledger with running balances, trial balance, income statement and
  balance sheet.
- Reversals post a mirror entry; the original is marked `REVERSED` and both
  remain in the ledger so the two net to zero.
- Period locking refuses a posting into a closed or locked period
  (`accounting.period_not_open`).
- AR/AP aging, receipts and payments with allocations against invoices, over-
  allocation protection, and customer credit-limit enforcement.

### B. Sales and POS (`sales_pos`)

- Customers, quotations, orders, invoices, credit notes and customer payments.
- The full chain works end to end: quotation → convert → order → invoice →
  receipt → credit note.
- Invoice posting draws down stock at moving-average cost and posts revenue,
  discount, VAT and COGS in one transaction.
- Cashier sessions with an opening float, expected-cash derivation from cash POS
  sales, and a close step that posts any over/short difference.
- POS sales create a settled invoice, issue stock and settle the receivable.

### C. Procurement (`purchasing_procurement`)

- Suppliers, purchase requisitions (approve → convert), purchase orders,
  goods receipts, supplier invoices, purchase returns and supplier payments.
- Goods receipt increases stock at the ordered cost and accrues the payable; the
  supplier invoice only accrues the unaccrued net plus VAT, so a payable is never
  double-counted.
- Purchase returns issue stock, reverse the payable and post any difference
  between the invoiced cost and the inventory valuation to a price-variance
  account so the entry balances.

### D. Inventory (`warehouses_inventory`)

- Warehouses, SKUs/products, stock receipts and issues, transfers, adjustments,
  an append-only stock movement ledger, reorder alerts and valuation.
- **Moving-average valuation.** Inbound movements blend their cost into the
  average; outbound movements are valued at the current average.
- **Concurrency safety.** The level row is locked with `SELECT … FOR UPDATE`
  before it is read, so concurrent issues of the same SKU cannot drive stock
  negative. This is verified by a test that fires ten parallel issues.

### E. Reports (`reports_analytics`)

- Accounting, sales, purchasing and inventory summaries with company and branch
  filters, date ranges and a balance indicator.
- Permission-aware: each report route requires the relevant read permission and
  is scoped to the caller's company server-side.

## 4. Database migrations

One additive migration: `20261014175813_execution_02_erp_core`.

- 40 new tenant-scoped tables and 22 new enums.
- Every operational table carries `companyId`; branch-scoped rows carry
  `branchId`.
- Money is stored as integer minor units; quantities are scaled by 10^4;
  percentages are basis units (basis points).
- No Execution 01 table was altered destructively; only new relations were added
  to `Company` and `Branch`.

Tables (grouped): document numbering; chart of accounts, fiscal years/periods,
journals, journal lines, account balances, payments, payment allocations;
warehouses, products, stock levels, stock movements, transfers, adjustments;
customers, quotations, sales orders, sales invoices, credit notes, cashier
sessions, POS sales; suppliers, requisitions, purchase orders, goods receipts,
supplier invoices, purchase returns — with their line tables.

## 5. API endpoints

72 new routes under `/api/v1`, grouped by module:

| Module | Base | Examples |
| --- | --- | --- |
| Accounting | `/accounting` | `GET/POST accounts`, `POST accounts/seed-standard-chart`, `GET/POST fiscal-years`, `PATCH fiscal-periods/:id/status`, `GET/POST journals`, `POST journals/:id/reverse`, `GET general-ledger`, `GET trial-balance`, `GET income-statement`, `GET balance-sheet`, `GET receivables-aging`, `GET payables-aging`, `GET/POST payments` |
| Inventory | `/inventory` | `GET/POST warehouses`, `GET/POST products`, `GET/POST movements`, `GET/POST transfers`, `POST transfers/:id/post`, `GET/POST adjustments`, `POST adjustments/:id/post`, `GET valuation`, `GET reorder-alerts` |
| Sales | `/sales` | `GET/POST customers`, `GET/POST quotations`, `POST quotations/:id/convert`, `GET/POST orders`, `GET/POST invoices`, `GET/POST credit-notes`, `GET/POST cashier-sessions`, `POST cashier-sessions/:id/close`, `GET/POST pos-sales` |
| Purchasing | `/purchasing` | `GET/POST suppliers`, `GET/POST requisitions`, `POST requisitions/:id/approve`, `POST requisitions/:id/convert`, `GET/POST orders`, `POST orders/:id/approve`, `GET/POST receipts`, `GET/POST supplier-invoices`, `GET/POST returns` |
| Reports | `/reports` | `GET accounting`, `GET sales`, `GET purchasing`, `GET inventory` |

All routes carry `@RequireModule` (plan licensing) plus the relevant permission
codes, and are tenant-scoped by the existing guards.

## 6. Functional workflows verified

Each is asserted by the integration suite against the real HTTP surface and the
seeded database:

1. Seed the standard chart; create a fiscal year; list accounts.
2. Post a balanced journal; reject an unbalanced one.
3. Reverse a posted journal; confirm the ledger nets to zero.
4. Lock a period; confirm posting into it is refused with
   `accounting.period_not_open`; reopen it.
5. Produce a balanced trial balance, income statement and balance sheet.
6. Receive stock; value it at the received cost.
7. Refuse to issue more stock than is on hand.
8. Fire ten concurrent issues; confirm the balance never goes negative.
9. Transfer stock between warehouses; post and confirm the destination level.
10. Post a stock adjustment and reflect it in valuation.
11. Raise a quotation; convert it to an order.
12. Issue a sales invoice; confirm stock drops and VAT is posted.
13. Record a customer receipt; confirm the invoice is `PAID`.
14. Reject an over-allocation against a settled invoice.
15. Issue a credit note; confirm revenue reverses and goods restock.
16. Enforce a customer credit limit.
17. Open a cashier session; record a POS sale; reject a second open session;
    close and record the cash variance.
18. Run a requisition through approval and conversion; receive goods.
19. Record and pay a supplier invoice.
20. Return goods to a supplier; confirm stock and the payable reverse.
21. Read all four reports; filter sales by branch.

## 7. Test results

| Suite | Command | Result |
| --- | --- | --- |
| Shared unit tests | `pnpm --filter @oryx/shared test` | **30 passed** (22 authorization + 8 money) |
| API integration (e2e) | `pnpm --filter @oryx/api test:e2e` | **109 passed** (79 Execution 01 + 30 ERP) |
| Browser acceptance (Playwright) | `pnpm --filter @oryx/admin test:ui` | **99 passed** (incl. 8 new ERP UI tests) |

Total: **238 automated tests passing.**

The ERP API suite (`apps/api/test/erp.e2e-spec.ts`) covers financial
correctness (balance, reversal, VAT, COGS), concurrent inventory operations,
permissions and cross-tenant access. The ERP UI suite
(`apps/admin/e2e/erp.spec.ts`) drives the real screens and asserts against the
API, not only the DOM.

## 8. GitHub Actions CI

The existing CI workflow runs the shared unit tests, the API integration suite
and the full Playwright suite against a PostgreSQL 17 service. Execution 02 adds
no new workflow: the ERP suites are picked up automatically, and the Execution 02
branch was added to the `push` trigger. CI status will be shown on the PR.

## 9. Screenshots

Captured by the Playwright screenshot suite into
`docs/execution-reports/screenshots/`:

- `erp-accounting-dark.png`
- `erp-inventory-dark.png`
- `erp-sales-dark.png`
- `erp-purchasing-dark.png`
- `erp-reports-dark.png`

The approved navy/gold design, right-side Arabic navigation, image-led module
cards, responsive layout and both themes are preserved. The official logo is
still absent from the repository; the neutral monogram placeholder remains and
no brand mark was invented.

## 10. Known limitations

- Reports are operational summaries, not a full BI engine; there is no
  custom-report builder and no pivot export.
- Inventory valuation is moving-average only; FIFO and LIFO are not offered.
- Journal approval workflows and budget control are not implemented; posting is
  direct once the caller holds the posting permission.
- Multi-currency is recorded on documents but the ledger does not revalue
  foreign-currency balances.
- The consumer mobile application and the remaining ERP modules (HR, CRM,
  operations, automotive) belong to later executions.
- No payment gateway, email or SMS provider is integrated.
- Nothing is deployed.

## 11. Pull request

Opened against `main` from `feature/execution-02-erp-core`. It is **not** to be
merged or deployed without owner approval.
