# ORYX — Execution 06 Report: Unified Attachments, Record Previews and the Employee Electronic File

Status: **implemented, tested, pushed to a feature branch and open for review**.
Nothing is merged. Nothing is deployed to production.

## 1. Branch and commit

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| Branch | `feature/execution-06-attachments-employee-file` |
| Base | `main` |
| Pull request | [#61](https://github.com/mohammadaljallad079-rgb/oryx/pull/61) (draft, open) |
| Feature commit | `c7fbb96` — unified attachments, record previews and the employee electronic file |
| Latest commit | `075692c` — payroll full-ledger print fix |

No existing work was overwritten, reset or force-pushed. Executions 01–05 are
untouched.

## 2. What was asked and what was delivered

### 2.1 Attachments inside every form

Before this execution a file could only be attached to a record that already
existed, from a separate step. The requirement was explicit: the attachment must
be part of the create and edit form, not a follow-up action.

Delivered:

- An `AttachmentField` component embedded in the form itself. Files are staged
  in the browser, can be added, removed and replaced before saving, and are
  committed together with the record on submit.
- Multiple files per record.
- Editing a record lists its existing attachments and lets them be removed or
  replaced without touching the record's other fields.
- Existing attachments survive an edit; the form never rewrites the attachment
  set from scratch.

### 2.2 One catalogue, 61 attachable record types

`packages/shared/src/attachments.ts` declares every attachable record exactly
once. The API validates an upload against it, so an entity type that is not
declared cannot be attached to. The admin UI derives its label, its read
permission and its write permission from the same declaration.

| Group | Attachable records |
| --- | --- |
| Platform | company, branch, user, role, CMS page, CMS banner |
| Accounting | journal entry, account, fiscal year, payment |
| Sales | invoice, order, quotation, credit note, POS sale, cashier session, customer |
| Procurement and inventory | product, supplier, requisition, purchase order, goods receipt, supplier invoice, purchase return, warehouse, stock transfer, stock adjustment |
| HR and payroll | employee, employee document, employment contract, leave request, attendance record, payroll run, payslip, penalty, bonus, advance |
| CRM | lead, opportunity, support ticket |
| Operations | project, task, work order, approval request |
| Automotive | vehicle, inspection booking, inspection report, maintenance booking, job card, repair estimate, part reference, inspection service |
| Marketplace and payments | booking, booking resource, provider, provider listing, service request, provider settlement, payment intent, refund, customer account |

Each declaration carries a module key (licence gate), a read permission, a write
permission and, where applicable, an extra permission required to read a row
flagged confidential.

### 2.3 One preview panel for every record

Every list row that owns a record now has a **Preview** button opening the same
unified panel: the record's fields, its attachments, in-place viewing for images
and PDFs, download for formats the browser cannot render, and print/export
gated by the permission the API already enforces.

Covered by browser tests: work order, payment receipt, role, website page,
maintenance booking, subscription, support session, and the employee file.

### 2.4 The employee electronic file

Pressing **Preview** on an employee opens a tabbed file. Every tab reads live
database rows — there is no seeded or hard-coded content.

| Tab | Content |
| --- | --- |
| Personal card | Photograph, Arabic and English name, auto-generated employee number, personal ID, nationality, birth date, phone, email, address, department, job title, branch, hire date, contract type, employment status, basic salary and allowances (permission-gated), bank details, personal documents, contracts, certificates and attachments. Printable and editable per permission. |
| Payroll ledger | Basic salary, allowances, deductions, overtime, bonuses, net payable, monthly runs with payment dates, and per-run status. |
| Leave | Leave type, start and end dates, day count, request status, remaining balance, approvals, supporting attachments. A leave request can be created, previewed and printed from the tab. |
| Penalties | Action type, reason, date, deciding officer, notes, attachments, full history, per-row preview and print. |
| Bonuses | Value, type, reason and approval date. A financial bonus that is due links to the payroll run, so it cannot be paid twice. |
| Reports | Attendance and worked hours, lateness and absence, payroll and financials, leave and balances, penalties, bonuses, and a full report for a chosen period. Each supports preview, print, PDF and Excel. |
| Documents | The employee's document set and its attachments. |

The employee number is generated by the API and rendered read-only in the form;
a browser test asserts it cannot be typed over.

### 2.5 Payroll printing: month, period and full tenure

Three distinct outputs, each driven by real payroll rows:

1. **A single month** — one payslip for a chosen run.
2. **A chosen period** — the ledger filtered to a start and end date.
3. **The full ledger since hire** — every payslip the employee has ever had.

Totals for basic, allowances, deductions and net are computed from the same rows
that are printed, for whichever scope was chosen.

### 2.6 A real defect found and fixed

Both print buttons in the payroll tab passed the same already-filtered row set:

```diff
 const printLedger = (onlyWindow: boolean) => {
-  const rows = onlyWindow ? items : items;
+  const source = onlyWindow ? ledger.data : fullLedger.data;
+  if (!source) return;
```

So "print the full ledger since hire" printed whatever window the user happened
to have applied. The unfiltered ledger is now loaded next to the windowed one.
It is fetched ahead of the click rather than inside it, because the print call
must stay synchronous inside the click handler or the browser blocks the popup.

A browser test narrows the window past a real payroll run and asserts that the
period print omits that run while the full print includes it. Confirmed against
the running stack: with a June window applied and a January run in the ledger,
the windowed table showed 0 rows, the period print did not mention `PR-00001`,
and the full print did.

## 3. Security and tenant isolation

- Authorisation is enforced server-side. The UI only hides what the API would
  already reject.
- Every attachment read and write is checked against the catalogue's read and
  write permission, and against the module licence.
- A confidential attachment requires its extra permission on top of the read
  permission.
- Attachment reads return metadata only; the file body is served through an
  authorised route, so a leaked list response does not leak documents.
- Every tenant-owned row carries `companyId`, and every query is scoped to it.
  The employee file is scoped to the caller's company: a user in another company
  cannot read an employee's personal or financial records by guessing an id.
- Personal and financial employee data is gated behind HR permissions, so an
  account without them sees neither the card's salary block nor the payroll tab.

## 4. Data safety

The migration is **additive**:

- 2 new tables.
- 0 drops.
- `Employee` gains 4 nullable or defaulted columns.
- `EntityAttachment` gains 3 defaulted columns.

No existing row is rewritten and no existing column changes type. Applying it to
a populated database cannot lose data.

## 5. Verification

Run against the local stack on the branch head.

| Suite | Command | Result |
| --- | --- | --- |
| Shared unit | `pnpm --filter @oryx/shared test` | 93 passed (5 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | 241 passed (9 suites) |
| Browser acceptance | `pnpm --filter @oryx/admin test:ui` | 138 passed, 1 skipped by design |
| Typecheck | api, admin, customer, mobile | clean |
| Lint | admin, customer, mobile | exit 0 |
| Build | `@oryx/api`, `@oryx/admin` | pass |

The one skipped browser test skips itself when the database has no support
session history to preview; it is not a disabled assertion.

Browser tests specific to this execution:

| # | Asserts |
| --- | --- |
| 1 | Every employee row offers a preview action |
| 2 | The personal card shows profile fields and the salary block |
| 3 | Every file tab opens and reads real records |
| 4 | A disciplinary action is recorded and printed from its tab |
| 5 | A bonus is granted, approved and appears in the bonus tab |
| 6 | The employee number is generated and cannot be typed |
| 7 | A file is attached inside the create form and saved with the record |
| 8 | An attachment opens in the preview and downloads without leaving the page |
| 8b | The employee photograph uploads from the card and renders as the primary image |
| 9 | A work order preview shows details, checklist and attachments |
| 10 | The file renders in Arabic RTL and English LTR without a server error |
| 11 | A receipt is recorded inside the payments form and previews with its voucher number |
| 12 | A maintenance booking is created with an attachment and previewed from its tab |
| 12 | A website page previews its content and attachments from the list |
| 13 | A role previews its permission set and attachments |
| 14 | A subscription previews its entitlement snapshot |
| 15 | A support session previews its scope and reason |
| 16 | The payroll tab prints the chosen window and the full ledger separately |

### 5.1 Fixture hygiene

The browser suite creates employees, work orders, bookings, payments, payroll
periods and payroll runs in the demo tenant. `scripts/purge-ui-fixtures.mjs`
removes them before and after a run. Payroll runs are deleted before their
periods because the period reference is `Restrict` and the API exposes no delete
route for either; payslips cascade from the run.

The suite is therefore repeatable and leaves the seeded tenant in its original
state — trial balance included.

## 6. Deployment

`docs/DEPLOYMENT.md` §11 covers this release:

- **Upload root.** Set `UPLOAD_DIR` to durable storage (`/var/lib/oryx/uploads`).
  The default under `apps/api/var` is wiped by a redeploy, which would silently
  orphan every stored document.
- **Backup as one unit.** The database dump and the uploads archive must be
  taken together and restored together. Either alone is a broken restore.
- **Migration.** Additive, applied with `prisma migrate deploy`. No manual step.
- **Health check.** `/api/health` after rollout.
- **Rollback.** Redeploying the previous build works, because it ignores the new
  tables. Rolling back the schema instead discards every attachment created
  after the deploy.

Known limits, stated plainly:

- Storage is a local directory, so the API runs as a single instance. Horizontal
  scaling needs object storage first.
- There is no antivirus scan on uploaded files.

## 7. What is deliberately not covered

Platform-configuration screens — audit trail, plans, integrations, API
management, application flags and versions — hold no tenant-scoped records, so
they have no attachment field and no record preview. Adding one would be
decoration, not function.

## 8. Open items for the owner

1. Review PR [#61](https://github.com/mohammadaljallad079-rgb/oryx/pull/61).
2. Confirm CI is green on the branch head.
3. Decide the merge, and only then the deployment window.

No merge and no production deployment happens without that decision.
