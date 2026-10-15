# ORYX Platform API — Execution 01 & 02

Base URL: `http://localhost:3001/api` · All routes are versioned under `/api/v1`.
Interactive documentation (generated from the NestJS controllers):
`http://localhost:3001/api/docs` · Health probe: `/api/health` (version-neutral).

## Authentication

`Authorization: Bearer <accessToken>` on every route except those marked public.

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/v1/auth/login` | public | Throttled. Returns access + refresh tokens, user, memberships, permissions |
| POST | `/v1/auth/refresh` | public | Rotates the refresh token; replay of a used token revokes all sessions |
| POST | `/v1/auth/accept-invitation` | public | Activates an invited account |
| POST | `/v1/auth/logout` | bearer | Revokes the presented refresh token |
| POST | `/v1/auth/logout-all` | bearer | Revokes every session for the user |
| GET | `/v1/auth/me` | bearer | User, memberships, effective permissions, current context |
| GET | `/v1/auth/context` | bearer | Company/branch selector options for the principal |
| PATCH | `/v1/auth/profile` | bearer | Names and persisted theme/locale preference |
| POST | `/v1/auth/change-password` | bearer | Revokes all sessions on success |
| GET | `/v1/auth/sessions` | bearer | Active refresh-token sessions |
| POST | `/v1/auth/mfa/verify-login` | public | Complete login with a TOTP or recovery code |
| GET | `/v1/auth/mfa/status` | bearer | MFA enrollment status and remaining recovery codes |
| POST | `/v1/auth/mfa/enroll` | bearer | Start TOTP enrollment; returns the QR data URL, provisioning URI and manual key |
| POST | `/v1/auth/mfa/enroll/confirm` | bearer | Confirm enrollment with a code; returns ten recovery codes once |
| POST | `/v1/auth/mfa/recovery-codes/regenerate` | bearer | Issue a new recovery-code set (requires a valid current code) |
| POST | `/v1/auth/mfa/disable` | bearer | Disable MFA (requires a valid current code) |
| POST | `/v1/auth/mfa/reset/:userId` | bearer, platform only | Administrative MFA reset for a locked-out account; revokes its sessions |

### Session transport

The refresh token is delivered in an **HttpOnly** cookie named `oryx_rt`, scoped
to `/api/v1/auth`, so it is never readable by JavaScript and never appears in a
response body. The `Secure` and `SameSite` attributes are derived from
`NODE_ENV`, `COOKIE_SECURE` and `COOKIE_SAMESITE`.

Because the cookie is sent automatically, every state-changing request that
presents it must also echo the readable `oryx_csrf` cookie in the
`x-oryx-csrf` header. A mismatch is rejected with
`auth.csrf_token_invalid`. Non-browser clients may still pass `refreshToken` in
the request body instead of using cookies.

### Context headers

| Header | Purpose |
| --- | --- |
| `x-oryx-company-id` | Selects the company context. A company principal may only select a company it belongs to; a platform principal may select any company |
| `x-oryx-branch-id` | Selects the branch context. Rejected if outside the membership's branch scope |
| `x-oryx-support-session` | Attaches an active support session so a platform principal can act inside a tenant |

## Organizations

| Method | Route | Required permission |
| --- | --- | --- |
| GET | `/v1/companies` | `platform.company.read` **or** `company.read` |
| POST | `/v1/companies` | `platform.company.create` |
| GET | `/v1/companies/:id` | `platform.company.read` **or** `company.read` |
| PATCH | `/v1/companies/:id` | `company.update` |
| PATCH | `/v1/companies/:id/status` | `platform.company.suspend` |
| GET | `/v1/companies/:companyId/branches` | `platform.branch.manage` **or** `company.branch.read` |
| POST | `/v1/companies/:companyId/branches` | `platform.branch.manage` **or** `company.branch.create` |
| PATCH | `/v1/branches/:id` | `platform.branch.manage` **or** `company.branch.update` |
| DELETE | `/v1/branches/:id` | `platform.branch.manage` **or** `company.branch.delete` |

`POST /v1/companies` accepts an optional `planId` (creates a subscription) and an
optional `adminEmail` with bilingual admin names. Branch creation enforces the
plan's `maxBranches` limit.

## Roles, permissions and users

| Method | Route | Required permission |
| --- | --- | --- |
| GET | `/v1/permissions/catalog` | authenticated |
| GET | `/v1/permissions/delegable?companyId=` | `platform.company.read` **or** `company.role.read` |
| GET | `/v1/companies/:companyId/roles` | `platform.company.read` **or** `company.role.read` |
| POST | `/v1/companies/:companyId/roles` | `platform.company.update` **or** `company.role.create` |
| PATCH | `/v1/roles/:id` | `platform.company.update` **or** `company.role.update` |
| DELETE | `/v1/roles/:id` | `platform.company.update` **or** `company.role.delete` |
| GET | `/v1/companies/:companyId/users` | `platform.user.read` **or** `company.user.read` |
| POST | `/v1/companies/:companyId/users/invitations` | `platform.user.manage` **or** `company.user.invite` |
| GET | `/v1/companies/:companyId/users/invitations` | `platform.user.read` **or** `company.user.read` |
| GET | `/v1/companies/:companyId/users/:userId/effective-permissions` | `platform.user.read` **or** `company.user.read` |
| PATCH | `/v1/companies/:companyId/users/:userId/membership` | `platform.user.manage` **or** `company.user.update` |
| POST | `/v1/invitations/:id/revoke` | `platform.user.manage` **or** `company.user.remove` |
| PATCH | `/v1/users/:id/status` | platform only |

Invitation creation returns `inviteToken` exactly once; only its SHA-256 hash is
persisted. Deactivating a membership revokes the user's live sessions.

## Modules, plans and subscriptions

| Method | Route | Required permission |
| --- | --- | --- |
| GET | `/v1/modules` | authenticated (returns per-caller `licensed` flag) |
| GET | `/v1/modules/entitlements?companyId=` | `platform.subscription.manage` **or** `company.subscription.read` |
| PATCH | `/v1/modules/:id` | `platform.module.manage` |
| GET | `/v1/plans` | `platform.plan.manage` **or** `company.subscription.read` |
| POST | `/v1/plans` | `platform.plan.manage` |
| PATCH | `/v1/plans/:id` | `platform.plan.manage` |
| GET | `/v1/subscriptions` | `platform.subscription.manage` **or** `company.subscription.read` |
| POST | `/v1/subscriptions/companies/:companyId/assign` | `platform.subscription.manage` |
| PATCH | `/v1/subscriptions/:id/status` | `platform.subscription.manage` |

## Dashboard

| Method | Route | Required permission |
| --- | --- | --- |
| GET | `/v1/dashboard?companyId=&branchId=` | `erp.dashboard.read` **or** `platform.company.read` |

Every figure is a database aggregate constrained to the authorized scope. The
response includes `isDemoData: true` when all companies in scope are seeded
synthetic records.

## Audit and support

| Method | Route | Required permission |
| --- | --- | --- |
| GET | `/v1/audit-logs` | `platform.audit.read` **or** `company.audit.read` |
| GET | `/v1/support-sessions` | `platform.support.access` |
| POST | `/v1/support-sessions` | `platform.support.access` |
| POST | `/v1/support-sessions/:id/end` | `platform.support.access` |

A support session requires a reason of at least 10 characters and defaults to a
60-minute lifetime (5–240 allowed).

## Website and application CMS

| Method | Route | Auth |
| --- | --- | --- |
| GET | `/v1/cms/public/content?locale=` | public — published pages, active banners, flags, versions, categories |
| GET/PUT | `/v1/cms/pages` | `platform.cms.manage` |
| DELETE | `/v1/cms/pages/:id` | `platform.cms.manage` |
| GET/PUT | `/v1/cms/banners` | `platform.cms.manage` |
| GET/PUT | `/v1/cms/feature-flags` | `platform.api.manage` |
| GET/PUT | `/v1/cms/app-versions` | `platform.api.manage` |
| GET | `/v1/cms/service-categories` | `platform.cms.manage` |
| GET | `/v1/cms/notification-templates` | `platform.cms.manage` |
| GET/POST | `/v1/cms/api-clients` | `platform.api.manage` |
| POST | `/v1/cms/api-clients/:id/revoke` | `platform.api.manage` |

An API client secret is returned once at registration and stored only as a
SHA-256 hash. The public content route never exposes draft pages.

## Errors

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "Cross-tenant access is not permitted.",
  "code": "authz.cross_tenant_denied",
  "details": {}
}
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `auth.invalid_credentials` | 401 | Bad email/password |
| `auth.account_locked` | 403 | Too many failed attempts |
| `auth.account_inactive` | 403 | Suspended/disabled account |
| `auth.token_expired` / `auth.token_invalid` | 401 | Access token problem |
| `auth.refresh_revoked` | 401 | Refresh token reused or expired |
| `auth.csrf_token_invalid` | 403 | CSRF header missing or does not match the cookie |
| `auth.mfa_required` | 403 | Account must enroll a second factor before use |
| `auth.mfa_invalid_code` | 401/403 | TOTP or recovery code rejected |
| `auth.mfa_already_enrolled` | 409 | MFA is already enabled |
| `auth.mfa_not_enrolled` | 400 | No MFA enrollment in progress or enabled |
| `auth.mfa_enrollment_expired` | 400 | The enrollment window elapsed |
| `auth.invitation_invalid` / `auth.invitation_expired` | 401 | Invitation problem |
| `authz.permission_denied` | 403 | Missing a required permission |
| `authz.platform_only` | 403 | Platform-only operation |
| `authz.cross_tenant_denied` | 403 | Cross-tenant access |
| `authz.branch_out_of_scope` | 403 | Branch outside assignment |
| `authz.module_not_licensed` | 403 | Module not in the subscription |
| `authz.delegation_exceeds_scope` | 403 | Privilege escalation attempt |
| `authz.support_session_required` | 403 | Support session missing/expired |
| `plan.limit_exceeded` | 403 | Plan limit reached |
| `plan.not_active` | 403 | Subscription not active |
| `resource.not_found` | 404 | Missing record |
| `resource.conflict` | 409 | Duplicate record |
| `request.validation_failed` | 400 | Input validation |
| `accounting.period_not_open` | 403 | Posting into a closed/locked period |
| `accounting.unbalanced_entry` | 400 | Debits do not equal credits |
| `accounting.account_not_postable` | 400 | Account cannot receive postings |
| `inventory.insufficient_stock` | 403 | Issue exceeds on-hand stock |
| `pos.session_already_open` | 409 | Branch already has an open session |
| `pos.session_closed` | 400 | Operation on a closed cashier session |
| `sales.credit_limit_exceeded` | 403 | Customer credit limit exceeded |
| `erp.over_allocation` | 400 | Allocation exceeds the outstanding balance |
| `erp.document_already_posted` | 400 | Document cannot be posted twice |

## ERP core (Execution 02)

All routes below require the module to be licensed and the caller to hold the
listed permission. `x-oryx-company-id` selects the company context; a company
principal is always pinned to its own company.

### Accounting — `/v1/accounting`

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/accounts` | `erp.accounting.read` / `erp.accounting.coa.manage` |
| POST | `/accounts` | `erp.accounting.coa.manage` |
| PATCH | `/accounts/:id` | `erp.accounting.coa.manage` |
| POST | `/accounts/seed-standard-chart` | `erp.accounting.coa.manage` |
| GET | `/fiscal-years` | `erp.accounting.read` / `erp.accounting.fiscal.manage` |
| POST | `/fiscal-years` | `erp.accounting.fiscal.manage` |
| PATCH | `/fiscal-periods/:id/status` | `erp.accounting.fiscal.manage` |
| GET | `/journals` | `erp.accounting.read` / `erp.accounting.journal.post` |
| POST | `/journals` | `erp.accounting.journal.post` |
| POST | `/journals/:id/reverse` | `erp.accounting.journal.reverse` |
| GET | `/general-ledger` | `erp.accounting.read` / `erp.accounting.statement.read` |
| GET | `/trial-balance` | `erp.accounting.read` / `erp.accounting.statement.read` |
| GET | `/income-statement` | `erp.accounting.read` / `erp.accounting.statement.read` |
| GET | `/balance-sheet` | `erp.accounting.read` / `erp.accounting.statement.read` |
| GET | `/receivables-aging` | `erp.accounting.read` / `erp.accounting.statement.read` |
| GET | `/payables-aging` | `erp.accounting.read` / `erp.accounting.statement.read` |
| GET | `/payments` | `erp.accounting.read` / `erp.accounting.payment.manage` |
| POST | `/payments` | `erp.accounting.payment.manage` |

### Inventory — `/v1/inventory`

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/warehouses` | `erp.inventory.read` / `erp.inventory.warehouse.manage` |
| PATCH | `/warehouses/:id` | `erp.inventory.warehouse.manage` |
| GET/POST | `/products` | `erp.inventory.read` / `erp.inventory.item.manage` |
| PATCH | `/products/:id` | `erp.inventory.item.manage` |
| GET/POST | `/movements` | `erp.inventory.read` / `erp.inventory.movement.manage` |
| GET/POST | `/transfers` | `erp.inventory.read` / `erp.inventory.transfer.manage` |
| POST | `/transfers/:id/post` | `erp.inventory.transfer.manage` |
| GET/POST | `/adjustments` | `erp.inventory.read` / `erp.inventory.adjustment.manage` |
| POST | `/adjustments/:id/post` | `erp.inventory.adjustment.manage` |
| GET | `/valuation` | `erp.inventory.read` / `erp.inventory.valuation.read` |
| GET | `/reorder-alerts` | `erp.inventory.read` / `erp.inventory.valuation.read` |

### Sales — `/v1/sales`

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/customers` | `erp.sales.read` / `erp.sales.customer.manage` |
| POST | `/customers/:id` | `erp.sales.customer.manage` |
| GET/POST | `/quotations` | `erp.sales.read` / `erp.sales.order.manage` |
| POST | `/quotations/:id/convert` | `erp.sales.order.manage` |
| GET/POST | `/orders` | `erp.sales.read` / `erp.sales.order.manage` |
| GET/POST | `/invoices` | `erp.sales.read` / `erp.sales.invoice.manage` |
| GET | `/invoices/:id` | `erp.sales.read` / `erp.sales.invoice.manage` |
| GET/POST | `/credit-notes` | `erp.sales.read` / `erp.sales.credit_note.manage` |
| GET/POST | `/cashier-sessions` | `erp.sales.pos.operate` / `erp.sales.pos.manage` |
| POST | `/cashier-sessions/:id/close` | `erp.sales.pos.manage` |
| GET/POST | `/pos-sales` | `erp.sales.pos.operate` / `erp.sales.pos.manage` |

### Purchasing — `/v1/purchasing`

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/suppliers` | `erp.purchasing.read` / `erp.purchasing.supplier.manage` |
| POST | `/suppliers/:id` | `erp.purchasing.supplier.manage` |
| GET/POST | `/requisitions` | `erp.purchasing.read` / `erp.purchasing.requisition.manage` |
| POST | `/requisitions/:id/approve` | `erp.purchasing.requisition.manage` |
| POST | `/requisitions/:id/convert` | `erp.purchasing.order.manage` |
| GET/POST | `/orders` | `erp.purchasing.read` / `erp.purchasing.order.manage` |
| POST | `/orders/:id/approve` | `erp.purchasing.order.manage` |
| GET/POST | `/receipts` | `erp.purchasing.read` / `erp.purchasing.receipt.manage` |
| GET/POST | `/supplier-invoices` | `erp.purchasing.read` / `erp.purchasing.invoice.manage` |
| GET/POST | `/returns` | `erp.purchasing.read` / `erp.purchasing.return.manage` |

### Reports — `/v1/reports`

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/accounting` | `erp.reports.read` / `erp.reports.accounting.read` |
| GET | `/sales` | `erp.reports.read` / `erp.reports.sales.read` |
| GET | `/purchasing` | `erp.reports.read` / `erp.reports.purchasing.read` |
| GET | `/inventory` | `erp.reports.read` / `erp.reports.inventory.read` |

## HR, CRM, operations and automotive (Execution 03)

All routes require the module to be licensed and the caller to hold the listed
permission, and are company-scoped server-side.

### HR — `/v1/hr` (module `human_resources`)

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/departments` | `erp.hr.read` / `erp.hr.department.manage` |
| GET/POST | `/job-titles` | `erp.hr.read` / `erp.hr.department.manage` |
| GET | `/employees`, `/employees/:id` | `erp.hr.read` / `erp.hr.employee.manage` |
| POST/PATCH | `/employees`, `/employees/:id` | `erp.hr.employee.manage` |
| POST | `/employees/:id/contracts` | `erp.hr.employee.manage` |
| GET/POST | `/employees/:id/documents` | `erp.hr.document.read` (+ `erp.hr.document.confidential` for confidential) |
| POST | `/employees/:id/lifecycle` | `erp.hr.lifecycle.manage` |
| PATCH | `/lifecycle-items/:id` | `erp.hr.lifecycle.manage` |
| GET/POST | `/leave-types` | `erp.hr.read` / `erp.hr.leave.manage` |
| POST | `/leave-balances/adjust` | `erp.hr.leave.manage` |
| GET | `/leave-requests` | `erp.hr.read` / `erp.hr.leave.approve` / `erp.hr.leave.request` |
| POST | `/leave-requests` | `erp.hr.leave.request` |
| POST | `/leave-requests/:id/decide` | `erp.hr.leave.approve` |
| GET/POST | `/shifts` | `erp.hr.read` / `erp.hr.attendance.manage` |
| GET/POST | `/attendance` | `erp.hr.read` / `erp.hr.attendance.manage` |
| POST | `/salary-structures` | `erp.hr.salary.manage` |
| GET/POST | `/payroll-periods` | `erp.hr.read` / `erp.hr.payroll.run` |
| GET | `/payroll-runs`, `/payroll-runs/:id`, `/payroll-runs/:id/payslips` | `erp.hr.read` / `erp.hr.payroll.run` / `erp.hr.payroll.approve` |
| POST | `/payroll-runs` | `erp.hr.payroll.run` |
| POST | `/payroll-runs/:id/approve`, `/payroll-runs/:id/lock` | `erp.hr.payroll.approve` |
| GET/POST | `/advances` | `erp.hr.read` / `erp.hr.advance.manage` |
| POST | `/advances/:id/settle` | `erp.hr.advance.manage` |
| GET | `/dashboard` | `erp.hr.read` / `erp.hr.report.read` |

### CRM — `/v1/crm` (module `crm`)

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/lead-sources` | `erp.crm.read` / `erp.crm.lead.manage` |
| GET/POST | `/leads` | `erp.crm.read` / `erp.crm.lead.manage` |
| PATCH | `/leads/:id` | `erp.crm.lead.manage` |
| GET/POST | `/pipelines` | `erp.crm.read` / `erp.crm.opportunity.manage` |
| POST | `/pipelines/:id/stages` | `erp.crm.opportunity.manage` |
| GET/POST | `/opportunities` | `erp.crm.read` / `erp.crm.opportunity.manage` |
| POST | `/opportunities/:id/stage` | `erp.crm.opportunity.manage` |
| POST | `/opportunities/:id/convert` | `erp.crm.opportunity.convert` |
| POST | `/customers` | `erp.crm.contact.manage` |
| GET/POST | `/customers/:id/contacts` | `erp.crm.read` / `erp.crm.contact.manage` |
| GET/POST | `/activities` | `erp.crm.read` / `erp.crm.activity.manage` |
| POST | `/activities/:id/complete` | `erp.crm.activity.manage` |
| GET/POST | `/sla-policies` | `erp.crm.read` / `erp.crm.sla.manage` |
| GET | `/tickets`, `/tickets/:id` | `erp.crm.read` / `erp.crm.ticket.manage` |
| POST | `/tickets`, `/tickets/:id/messages` | `erp.crm.ticket.manage` |
| PATCH | `/tickets/:id` | `erp.crm.ticket.manage` |
| GET/POST | `/segments` | `erp.crm.read` / `erp.crm.segment.manage` |
| POST | `/segments/:id/members` | `erp.crm.segment.manage` |
| GET | `/dashboard` | `erp.crm.read` / `erp.crm.report.read` |

### Operations — `/v1/operations` (module `operations`)

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/projects` | `erp.operations.read` / `erp.operations.project.manage` |
| PATCH | `/projects/:id` | `erp.operations.project.manage` |
| GET/POST | `/tasks` | `erp.operations.read` / `erp.operations.task.manage` |
| PATCH | `/tasks/:id` | `erp.operations.task.manage` |
| GET | `/work-orders`, `/work-orders/:id` | `erp.operations.read` / `erp.operations.work_order.manage` |
| POST | `/work-orders`, `/work-orders/:id/assign` | `erp.operations.work_order.manage` |
| PATCH | `/work-orders/:id`, `/checklist-items/:id` | `erp.operations.work_order.manage` |
| GET/POST | `/approvals` | `erp.operations.read` / `erp.operations.approval.manage` |
| POST | `/approvals/:id/decide` | `erp.operations.approval.manage` |
| GET | `/:entityType/:entityId/comments`, `/:entityType/:entityId/attachments` | `erp.operations.read` |
| POST | `/comments`, `/attachments` | `erp.operations.work_order.manage` / `erp.operations.task.manage` |
| GET/POST | `/calendar` | `erp.operations.read` / `erp.operations.work_order.manage` |
| GET | `/notifications` | authenticated |
| POST | `/notifications/read`, `/notifications` | authenticated / `erp.operations.work_order.manage` |
| GET | `/dashboard` | `erp.operations.read` / `erp.operations.report.read` |

### Automotive — `/v1/automotive` (`automotive_inspections`, `automotive_maintenance`, `spare_parts`)

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/vehicles`, `/vehicles/:id` | `erp.vehicle.read` / `erp.vehicle.manage` |
| POST | `/vehicles/:id/mileage`, `/vehicles/:id/documents` | `erp.vehicle.manage` |
| GET | `/vehicles/:id/documents` | `erp.vehicle.read` |
| GET/POST | `/inspection-services` | `erp.inspection.read` / `erp.inspection.service.manage` |
| POST | `/inspection-checklist-items` | `erp.inspection.service.manage` |
| GET/POST | `/inspection-bookings` | `erp.inspection.read` / `erp.inspection.booking.manage` |
| PATCH | `/inspection-bookings/:id`, `POST .../findings`, `POST .../report/submit` | `erp.inspection.booking.manage` |
| GET | `/inspection-bookings/:id/report` | `erp.inspection.read` |
| POST | `/inspection-bookings/:id/report/decide` | `erp.inspection.report.approve` |
| POST | `/inspection-bookings/:id/invoice` | `erp.inspection.invoice` |
| GET/POST | `/bays`, `/maintenance-bookings` | `erp.maintenance.read` / `erp.maintenance.booking.manage` |
| GET/POST | `/job-cards`, `/job-cards/:id/labour`, PATCH `/job-cards/:id` | `erp.maintenance.read` / `erp.maintenance.jobcard.manage` |
| POST | `/job-cards/:id/estimates`, `/estimates/:id/approve`, `/estimates/:id/reject` | `erp.maintenance.estimate.manage` |
| POST | `/job-cards/:id/invoice` | `erp.maintenance.invoice` |
| GET/POST | `/warranties` | `erp.maintenance.read` / `erp.maintenance.warranty.manage` |
| GET/POST | `/reservations` | `erp.spare_parts.read` / `erp.parts.reserve` |
| POST | `/reservations/:id/issue` | `erp.parts.issue` |
| GET/POST | `/part-references`, `/compatibility` | `erp.spare_parts.read` / `erp.parts.reference.manage` / `erp.parts.compatibility.manage` |
| GET | `/compatible-parts` | `erp.spare_parts.read` |
| GET/POST | `/providers`, POST `/providers/:id/decide` | `erp.marketplace.provider.manage` |
| GET/POST | `/providers/:id/listings` | `erp.marketplace.listing.manage` |
| GET/POST | `/service-requests`, POST `/service-requests/:id/assign`, PATCH `/service-requests/:id` | `erp.marketplace.request.manage` |
| GET/POST | `/settlements` | `erp.marketplace.commission.manage` |
| GET | `/dashboard` | `erp.vehicle.read` / `erp.inspection.read` |

## Customer platform, marketplace, bookings and payments (Execution 04)

Consumer routes authenticate with a **consumer** access token (`audience:
customer`). A staff token is refused on a consumer route and a consumer token is
refused on a staff route. Consumer ownership is enforced server-side: a customer
can only read its own vehicles, addresses, bookings, invoices and payments.

### Customer identity — `/v1/customer/auth`

| Method | Route | Notes |
| --- | --- | --- |
| POST | `/register`, `/login` | Public. Returns an access token; the refresh token is an HttpOnly cookie. |
| POST | `/mfa/verify-login` | Completes a login when the account has TOTP enabled. |
| POST | `/refresh`, `/logout`, `/logout-all` | Session lifecycle. |
| POST | `/forgot-password`, `/reset-password` | Single-use, hashed, expiring reset token. |
| GET | `/me`, `/sessions` | Current consumer and its sessions. |
| POST | `/change-password` | Requires the current password. |
| POST | `/mfa/enroll`, `/mfa/confirm`, `/mfa/disable` | Optional consumer TOTP. |
| POST | `/profile` | Updates the consumer profile. |

### Customer profile — `/v1/customer`

| Method | Route | Notes |
| --- | --- | --- |
| GET/POST | `/addresses` | List and create. |
| PATCH/DELETE | `/addresses/:id` | Owner-only. |
| GET/PATCH | `/privacy` | Privacy controls. |
| POST | `/privacy/data-export`, `/privacy/deletion` | Records a pending request; does not export inline. |
| GET/PATCH | `/notification-preferences` | Per-channel preferences. |
| GET/POST | `/vehicles` | Garage. VIN is unique; owner-only. |
| GET/PATCH/DELETE | `/vehicles/:id` | Owner-only. |
| GET | `/vehicles/:id/history` | Service history across inspections, job cards and invoices. |

### Staff console — `/v1/customer-platform` (module `customer_portal`)

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/summary` | `erp.customer_portal.read` |
| GET | `/accounts`, `/accounts/:id` | `erp.customer_portal.read` |
| POST | `/accounts/:id/link`, `/accounts/:id/status` | `erp.customer_portal.manage` |

### Booking engine — `/v1/bookings` (module `booking_engine`)

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/availability` | `erp.booking.read` |
| GET | `/`, `/calendar` | `erp.booking.read` |
| POST | `/` | `erp.booking.manage` |
| GET | `/:id` | `erp.booking.read` |
| POST | `/:id/confirm`, `/reschedule`, `/cancel`, `/start`, `/complete`, `/no-show` | `erp.booking.manage` |
| GET | `/resources/list` | `erp.booking.read` |
| POST | `/resources`, `/resources/:id/hours`, `/resources/:id/exceptions` | `erp.booking.manage` |

Concurrency: a unique constraint plus a transactional row lock make a second
booking for the same resource and time fail; a cancelled slot is released.

### Consumer bookings and payments

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/v1/customer/bookings/availability` | Consumer slot lookup. |
| POST | `/v1/customer/bookings` | Creates a booking owned by the consumer. |
| GET | `/v1/customer/bookings` | The consumer's own bookings. |
| POST | `/v1/customer/bookings/:id/cancel` | Owner-only. |
| GET | `/v1/customer/payments` | The consumer's own payment history. |

### Payments — `/v1/payments` (module `payments`)

| Method | Route | Permission |
| --- | --- | --- |
| GET | `/providers` | `erp.payments.read` — readiness of each adapter. |
| GET/POST | `/intents` | `erp.payments.read` / `erp.payments.manage` — paginated list; creation is idempotent. |
| GET | `/intents/:id` | `erp.payments.read` |
| POST | `/refunds` | `erp.payments.manage` |
| POST | `/refunds/:id/approve` | `erp.payments.approve` |
| GET | `/reconciliation` | `erp.payments.read` |
| POST | `/webhooks/:provider` | Public; signature verified, idempotent. |

Adapters: `CASH` and `CARD_TERMINAL` are always configured (the receipt is the
confirmation); `BANK_TRANSFER` is manual; `BENEFITPAY` and `CARD_ONLINE` are
`REDIRECT` adapters that report themselves **unconfigured** until their
credentials exist, and an unconfigured online gateway leaves the intent unpaid.

### Marketplace — `/v1/automotive`

| Method | Route | Permission |
| --- | --- | --- |
| GET/POST | `/provider-applications` | public apply / `erp.provider_portal.read` |
| POST | `/providers/:id/decide` | `erp.marketplace.provider.manage` — approve with commission |
| GET/POST | `/provider-listings` | `erp.provider_portal.read` / `erp.provider_portal.manage` |
| GET/POST | `/provider-availability` | `erp.provider_portal.read` / `erp.provider_portal.manage` |
| GET/POST | `/service-requests` | `erp.provider_portal.read` / `erp.provider_portal.manage` |
| POST | `/service-requests/:id/accept`, `/reject`, `/assign`, `/complete` | `erp.provider_portal.manage` |
| GET/POST | `/reviews` | `erp.provider_portal.read` / consumer |
| POST | `/reviews/:id/moderate` | `erp.provider_portal.manage` |
| GET/POST | `/complaints` | `erp.provider_portal.read` / consumer |
| GET/POST | `/settlements` | `erp.provider_portal.read` / `erp.provider_portal.manage` |

Provider isolation comes from membership, not permission alone: a peer
administrator who is not linked to a provider cannot read or act on that
provider's work.

### Notifications

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/v1/notifications` | In-app notifications for the principal. |
| POST | `/v1/notifications/:id/read` | Marks one read. |
| GET/PATCH | `/v1/customer/notification-preferences` | Per-channel consumer preferences. |

Email, SMS, WhatsApp and push adapters report themselves **configured** only when
their provider credentials are present; otherwise they transmit nothing and
record the reason.

## Rate limits

| Scope | Default | Variable |
| --- | --- | --- |
| Global | 120 requests / minute / IP | `THROTTLE_LIMIT`, `THROTTLE_TTL` |
| `/auth/login` | 10 requests / minute / IP | `AUTH_THROTTLE_LIMIT` |
| `/auth/refresh`, `/auth/accept-invitation` | 20 requests / minute / IP | fixed |

Exceeding a limit returns HTTP 429.
