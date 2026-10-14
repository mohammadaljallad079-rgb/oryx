# ORYX — Architecture (Execution 01)

Status: implemented and verified. This document describes the system as built,
not as planned.

## 1. Purpose and scope

ORYX is one platform with three business domains:

| Domain | Who it serves | Execution 01 status |
| --- | --- | --- |
| **ORYX Holding ERP** | ORYX's own group companies and their branches | Foundation implemented (organizations, branches, users, roles, entitlements, dashboard) |
| **ORYX Business SaaS ERP** | External companies that subscribe to a plan | Foundation implemented (plans, subscriptions, tenant isolation, delegated administration) |
| **ORYX Automotive Ecosystem** | Consumers and automotive partners | Admin scaffolding only; no consumer application |

Execution 01 delivers the control plane. It does **not** deliver the consumer
mobile application, and it does not claim any ERP operational module
(accounting, sales, inventory, HR, …) is finished. Those modules are routed,
permission-protected and labelled `PLANNED`.

## 2. Repository layout

```text
apps/
  api/                    NestJS REST API (modular monolith)
    src/
      auth/               authentication, principal resolution, guards
      common/             prisma, audit, entitlements, errors, role templates
      organizations/      companies and branches
      rbac/               roles, permissions, users, invitations
      modules/            ERP module catalog
      plans/              plans and subscriptions
      dashboard/          DB-backed metrics
      cms/                website & application CMS, API clients
      support/            super-admin support sessions
      audit/              audit log reads
      health/             liveness probe
    test/                 API integration (e2e) suites
  admin/                  Next.js 15 App Router admin application
    src/app/(app)/        authenticated route tree
    src/components/       design-system components
    src/lib/              API client, auth context, UI context, navigation
    src/i18n/             Arabic/English dictionary
    e2e/                  Playwright acceptance + screenshot suites
packages/
  shared/                 permissions, modules, design tokens, authorization rules, contracts
  database/               Prisma schema, migrations, seed
  ui/                     reserved for extracted UI primitives (currently unused)
docs/
  architecture/           this document and the permission/entitlement specs
  execution-reports/      report and screenshots
infrastructure/           reserved for deployment manifests
scripts/                  helper scripts (tile art generation, smoke test)
```

## 3. Technology choices

| Concern | Choice | Rationale |
| --- | --- | --- |
| Admin frontend | Next.js 15 (App Router) + React 19 | Route-level code splitting, server rendering for the shell, mature ecosystem |
| API | NestJS 11 | Explicit module boundaries, dependency injection, first-class guards and OpenAPI |
| Database | PostgreSQL 17 | Required for row-level multi-tenancy, JSON columns and strong constraints |
| Data access | Prisma 6 | Typed queries and versioned SQL migrations |
| Styling | Hand-written CSS custom properties (+ Tailwind 4 import) | The approved design needs exact navy/gold control; CSS variables make theme and RTL switching a single attribute change |
| Charts | Inline SVG components | No chart runtime dependency; charts inherit theme variables automatically |
| Auth | JWT access token + rotating refresh token, argon2id hashes | Short-lived access tokens, revocable sessions, no server-side session store needed |

No microservices. The modular monolith keeps transactions simple and is
sufficient for the tenant volumes this platform targets.

## 4. Tenancy and hierarchy

```text
Platform (Super Admin)
  └── Company (type: INTERNAL | SAAS_TENANT)
        └── Branch
              └── Membership (user + role + branch scope)
```

- A **company** is either an internal ORYX group company or an external SaaS
  tenant. The two are never conflated: `Company.type` is the discriminator, and
  the admin UI labels them differently.
- Companies form a parent/child hierarchy (`Company.parentCompanyId`). Cycle
  creation is rejected server-side.
- A **membership** binds a user to one company with exactly one role and an
  optional set of branches. An empty branch set means company-wide access.
- **Every tenant-owned table carries `companyId`** so isolation is expressible
  in a query, not only in the UI.

## 5. Request pipeline

The API resolves authorization in three ordered global guards, so no controller
can accidentally skip a check:

```text
1. ThrottlerGuard          rate limiting
2. PrincipalGuard          identity + selected context + effective permissions
3. PermissionsGuard        @RequirePermissions / @RequireAnyPermission / @PlatformOnly
4. ModuleEntitlementGuard  @RequireModule (plan licensing)
   TenantBoundaryInterceptor  defence-in-depth company check on :companyId routes
```

`PrincipalGuard` is the only place that decides "who is this and what may they
do". It:

1. verifies the access token;
2. loads the user and rejects suspended/disabled accounts;
3. resolves company context from `x-oryx-company-id` (rejecting a company the
   principal is not a member of) and branch context from `x-oryx-branch-id`;
4. for a platform principal, optionally attaches a support session from
   `x-oryx-support-session`;
5. computes the **effective permission set** through
   `resolveEffectivePermissions`, which strips any permission whose ERP module
   the active subscription does not license.

Because the effective set is computed once, guards, services and the admin
navigation cannot disagree about what a principal may do.

## 6. Entitlements

A subscription stores a **snapshot** of the licensed module keys
(`Subscription.licensedModules`) taken when it was created or changed.

- `EntitlementService.forCompany` reads that snapshot, never a live plan
  lookup. Editing a plan therefore cannot retroactively change an existing
  tenant's entitlements.
- A subscription in any status other than `ACTIVE` or `TRIAL` licenses nothing:
  suspending a subscription revokes entitlements immediately.
- Plan limits (`maxCompanies`, `maxBranches`, `maxUsers`, `storageMb`,
  `apiRequestsPerMonth`) are enforced in the service layer at creation time.
  `-1` means unlimited.

See `docs/architecture/MODULE_PLAN_ENTITLEMENTS.md` for the full specification.

## 7. Delegated administration

A company administrator is bound by three independent limits:

1. **Delegability** — platform permissions are never delegable.
2. **Possession** — the administrator may only grant permissions it holds
   itself (`validateDelegation` returns `exceeds_actor_permissions` otherwise).
3. **Entitlement** — permissions for unlicensed modules are accepted into a
   role but are inert: `resolveEffectivePermissions` suppresses them at request
   time, and they activate automatically if the plan is upgraded.

This design means the default `company_admin` role can carry the full
permission catalog and still cannot escalate: the effective set is always the
intersection of *granted*, *delegable* and *licensed*.

## 8. Audit and support access

- `AuditService.record` writes an append-only row for every security-relevant
  mutation: logins, company/branch/role/user changes, invitations, subscription
  changes, support sessions, CMS edits.
- A platform administrator carries **no tenant scope by default**. Reaching
  tenant data requires opening a support session with a mandatory reason
  (≥10 characters) and a bounded lifetime. Sessions are audited on open and on
  end, and the guard rejects an expired or non-owned session.

## 9. Error model

All errors carry a machine-readable `code` so the client can localise without
parsing English text:

```json
{ "statusCode": 403, "error": "FORBIDDEN", "message": "…", "code": "authz.cross_tenant_denied" }
```

Codes used by the admin UI: `auth.*`, `authz.permission_denied`,
`authz.cross_tenant_denied`, `authz.branch_out_of_scope`,
`authz.module_not_licensed`, `authz.delegation_exceeds_scope`,
`authz.platform_only`, `authz.support_session_required`, `plan.limit_exceeded`,
`plan.not_active`, `resource.not_found`, `resource.conflict`.

## 10. Frontend architecture

- `UiProvider` owns theme (`data-theme`) and locale/direction (`data-dir`,
  `dir`). Both persist to `localStorage` and, for signed-in users, to the user
  profile so the choice follows the account.
- `AuthProvider` owns the session, the selected company/branch context and the
  effective permission set. It exposes `can`, `canAny` and `hasModule`.
- `ALL_NAV_GROUPS` is derived from the same module catalog the API uses, so a
  module that is not licensed never appears in navigation.
- `PermissionGate` renders an explicit denial state on platform-only screens
  instead of a half-functional page with dead controls.
- Planned modules render `PlannedModulePage`, which states plainly that the
  workflow is not implemented and shows no fabricated data.

## 11. Known limitations

1. The official ORYX logo asset is **not present** in the repository. The brand
   mark in the UI is a neutral geometric placeholder; no third-party mark was
   invented.
2. Tile artwork is generated abstract vector art (`scripts/generate-tile-art.py`),
   not the photography used in the owner's mock. Replacing it with licensed
   imagery requires only dropping files into `apps/admin/public/tiles/`.
3. ERP operational modules are routed but unimplemented.
4. No payment gateway is integrated. Subscriptions record price, period and an
   immutable event history; no charge is attempted.
5. No email/SMS/push provider is connected. Invitation tokens are returned by
   the API exactly once and must be delivered out of band.
6. MFA is specified in the master reference but not implemented in Execution 01.
7. Refresh tokens are stored in `localStorage`; an httpOnly-cookie flow is the
   recommended hardening step before production.
