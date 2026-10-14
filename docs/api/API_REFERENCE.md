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

## Rate limits

| Scope | Default | Variable |
| --- | --- | --- |
| Global | 120 requests / minute / IP | `THROTTLE_LIMIT`, `THROTTLE_TTL` |
| `/auth/login` | 10 requests / minute / IP | `AUTH_THROTTLE_LIMIT` |
| `/auth/refresh`, `/auth/accept-invitation` | 20 requests / minute / IP | fixed |

Exceeding a limit returns HTTP 429.
