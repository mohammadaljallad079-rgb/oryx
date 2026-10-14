# ORYX Platform API — Execution 01

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

## Rate limits

| Scope | Default | Variable |
| --- | --- | --- |
| Global | 120 requests / minute / IP | `THROTTLE_LIMIT`, `THROTTLE_TTL` |
| `/auth/login` | 10 requests / minute / IP | `AUTH_THROTTLE_LIMIT` |
| `/auth/refresh`, `/auth/accept-invitation` | 20 requests / minute / IP | fixed |

Exceeding a limit returns HTTP 429.
