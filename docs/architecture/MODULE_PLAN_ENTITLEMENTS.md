# ORYX — Module and Plan Entitlement Specification

Status: implemented.

## 1. Module catalog

Modules are the licensable units of the ERP. The catalog lives in
`packages/shared/src/modules.ts`, is mirrored into the `Module` table by the
seed, and drives three things at once:

1. backend authorization (`@RequireModule` and permission gating),
2. admin navigation (`ALL_NAV_GROUPS`),
3. the dashboard module tiles.

| Module key | Group | Delivery phase | Status | Read permission |
| --- | --- | --- | --- | --- |
| `dashboard` | core | execution-01 | AVAILABLE | `erp.dashboard.read` |
| `company_management` | core | execution-01 | AVAILABLE | `erp.company.manage` |
| `branch_management` | core | execution-01 | AVAILABLE | `erp.branch.manage` |
| `users_permissions` | administration | execution-01 | AVAILABLE | `company.user.read` |
| `subscription_management` | administration | execution-01 | AVAILABLE | `company.subscription.read` |
| `settings` | administration | execution-01 | AVAILABLE | `company.settings.update` |
| `financial_accounting` | finance | execution-02 | PLANNED | `erp.accounting.read` |
| `sales_pos` | commerce | execution-02 | PLANNED | `erp.sales.read` |
| `purchasing_procurement` | commerce | execution-02 | PLANNED | `erp.purchasing.read` |
| `reports_analytics` | analytics | execution-02 | PLANNED | `erp.reports.read` |
| `warehouses_inventory` | operations | execution-03 | PLANNED | `erp.inventory.read` |
| `human_resources` | operations | execution-03 | PLANNED | `erp.hr.read` |
| `crm` | commerce | execution-03 | PLANNED | `erp.crm.read` |
| `operations` | operations | execution-03 | PLANNED | `erp.operations.read` |
| `automotive_inspections` | automotive | execution-04 | PLANNED | `erp.inspection.read` |
| `automotive_maintenance` | automotive | execution-04 | PLANNED | `erp.maintenance.read` |
| `spare_parts` | automotive | execution-04 | PLANNED | `erp.spare_parts.read` |

**AVAILABLE** means the workflow is genuinely implemented, database-backed and
covered by tests. **PLANNED** means the route exists and is permission-protected,
but the screen states that the workflow is not implemented and shows no
fabricated data.

## 2. Plans

A plan is created and edited entirely by the Super Admin — nothing is
hard-coded. Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | Unique, lowercase; immutable after creation |
| `nameEn` / `nameAr` | string | Bilingual display name |
| `descriptionEn` / `descriptionAr` | string | Optional; defaults to empty |
| `monthlyPrice` / `annualPrice` | decimal(12,2) | Same currency |
| `currency` | string(3) | Defaults to `SAR` |
| `trialDays` | int | `> 0` creates new subscriptions in `TRIAL` |
| `isActive` | boolean | Inactive plans cannot be assigned |
| `isPublic` | boolean | Whether the plan appears in the public catalog |
| `maxCompanies` | int | `-1` = unlimited |
| `maxBranches` | int | `-1` = unlimited |
| `maxUsers` | int | `-1` = unlimited |
| `storageMb` | int | Recorded; not yet enforced by a storage meter |
| `apiRequestsPerMonth` | int | Recorded; not yet enforced by a metering job |
| `modules` | string[] | Module keys included in the plan |

### Seeded plans

| Plan | Monthly | Annual | Branches | Users | Modules |
| --- | --- | --- | --- | --- | --- |
| `starter` | 499 | 4 990 | 2 | 10 | 8 (core + crm + reports) |
| `professional` | 1 499 | 14 990 | 10 | 75 | 14 |
| `enterprise` | 3 499 | 34 990 | unlimited | unlimited | 17 (full catalog) |

## 3. Subscription lifecycle

```text
                 assign plan
   (none) ─────────────────────▶ TRIAL ──▶ ACTIVE
                                  │          │
                                  │          ├──▶ PAST_DUE ──▶ SUSPENDED
                                  │          ├──▶ SUSPENDED
                                  └──────────┴──▶ EXPIRED / CANCELLED
```

Statuses `ACTIVE` and `TRIAL` license modules. Every other status licenses
**nothing** — entitlements are revoked the moment a subscription leaves the
active set. This is asserted by the integration test "revokes entitlements
immediately when a subscription is suspended".

Every create, plan change and status change writes an immutable
`SubscriptionEvent` row, giving a billing history that cannot be rewritten.

## 4. Entitlement resolution

```text
companyId
  └── latest Subscription
        ├── status ∈ {ACTIVE, TRIAL}? ── no ──▶ licensedModules = []
        └── yes ──▶ licensedModules = Subscription.licensedModules  (snapshot)
                    limits          = Plan.max* / storageMb / apiRequestsPerMonth
```

The snapshot is written whenever a subscription is created or changed and is
**never** recomputed from the plan. Editing a plan therefore cannot retroactively
alter a live tenant's entitlements — asserted by the integration test "does not
retroactively change an existing subscription when a plan is edited".

## 5. Where entitlements are enforced

| Layer | Mechanism | Effect |
| --- | --- | --- |
| Principal resolution | `resolveEffectivePermissions` | Strips permissions for unlicensed modules from the effective set |
| Route guard | `@RequireModule(key)` / `ModuleEntitlementGuard` | Rejects the request with `authz.module_not_licensed` |
| Navigation | `hasModule(key)` in `AuthProvider` | Unlicensed modules are not rendered |
| Delegation | `validateDelegation` | Records unlicensed-module permissions without granting effective power |
| Plan limits | `checkLimit` in `OrganizationService` / `RbacService` | Rejects creation with `plan.limit_exceeded` |

## 6. Limit enforcement matrix

| Limit | Enforced at | Error code |
| --- | --- | --- |
| `maxBranches` | `POST /companies/:companyId/branches` | `plan.limit_exceeded` |
| `maxUsers` | `POST /companies/:companyId/users/invitations` | `plan.limit_exceeded` |
| `maxCompanies` | Not enforced in Execution 01 (the Super Admin provisions companies) | — |
| `storageMb` | Not enforced (no storage meter yet) | — |
| `apiRequestsPerMonth` | Not enforced (no metering job yet) | — |

## 7. Adding a module in a later execution

1. Add the `ModuleDefinition` to `packages/shared/src/modules.ts` with its
   `readPermission` / `writePermission` and set `status: 'AVAILABLE'` once the
   workflow exists.
2. Add the matching `PermissionDefinition` entries to
   `packages/shared/src/permissions.ts`.
3. Re-run `pnpm db:seed` to upsert the `Module` row.
4. Add the module key to the relevant plan definitions if it should be sellable.
5. Add the route under `apps/admin/src/app/(app)/`.

No other change is required: navigation, guards, plan editing and the dashboard
tiles all read from the same catalog.
