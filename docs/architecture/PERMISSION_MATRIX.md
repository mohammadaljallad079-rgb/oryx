# ORYX — Permission Matrix

Status: implemented. The catalog is defined in
`packages/shared/src/permissions.ts` and is the single source of truth for both
the API guards and the admin UI. Every code is enforced server-side.

## Legend

| Column | Meaning |
| --- | --- |
| **Scope** | `PLATFORM` = platform governance only; `COMPANY` = company-scoped; `BRANCH` = branch-scoped |
| **Delegable** | May a company administrator grant this to staff? |
| **Module** | ERP module that gates the permission; empty = always available |
| **SA** | Super Admin (platform principal) |
| **CA** | Company Administrator (`company_admin` role) |
| **BM** | Branch Manager (`branch_manager` role) |
| **ST** | Staff read-only (`staff_viewer` role) |

`✔` = granted · `—` = not granted · `⊘` = granted but inert until the plan
licenses the module.

## Platform governance

| Permission | Scope | Delegable | SA | CA | BM | ST |
| --- | --- | :-: | :-: | :-: | :-: | :-: |
| `platform.company.create` | PLATFORM | no | ✔ | — | — | — |
| `platform.company.read` | PLATFORM | no | ✔ | — | — | — |
| `platform.company.update` | PLATFORM | no | ✔ | — | — | — |
| `platform.company.suspend` | PLATFORM | no | ✔ | — | — | — |
| `platform.branch.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.user.read` | PLATFORM | no | ✔ | — | — | — |
| `platform.user.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.role.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.module.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.plan.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.subscription.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.audit.read` | PLATFORM | no | ✔ | — | — | — |
| `platform.cms.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.api.manage` | PLATFORM | no | ✔ | — | — | — |
| `platform.support.access` | PLATFORM | no | ✔ | — | — | — |

## Company administration

| Permission | Scope | Delegable | Module | SA | CA | BM | ST |
| --- | --- | :-: | --- | :-: | :-: | :-: | :-: |
| `company.read` | COMPANY | yes | — | ✔ | ✔ | ✔ | ✔ |
| `company.update` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.settings.update` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.branch.read` | COMPANY | yes | — | ✔ | ✔ | ✔ | ✔ |
| `company.branch.create` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.branch.update` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.branch.delete` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.user.read` | COMPANY | yes | — | ✔ | ✔ | ✔ | — |
| `company.user.invite` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.user.update` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.user.remove` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.role.read` | COMPANY | yes | — | ✔ | ✔ | ✔ | — |
| `company.role.create` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.role.update` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.role.delete` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.permission.delegate` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.subscription.read` | COMPANY | yes | — | ✔ | ✔ | ✔ | — |
| `company.subscription.request` | COMPANY | yes | — | ✔ | ✔ | — | — |
| `company.audit.read` | COMPANY | yes | — | ✔ | ✔ | — | — |

## Branch scope

| Permission | Scope | Delegable | SA | CA | BM | ST |
| --- | --- | :-: | :-: | :-: | :-: | :-: |
| `branch.read` | BRANCH | yes | ✔ | ✔ | ✔ | ✔ |
| `branch.user.read` | BRANCH | yes | ✔ | ✔ | ✔ | — |
| `branch.report.read` | BRANCH | yes | ✔ | ✔ | ✔ | — |

## ERP module permissions

`✔` in the CA/BM columns means the role template carries the code; the
permission is only **effective** when the company's active subscription
licenses the module in the Module column.

| Permission | Module | Delegable | CA | BM | ST |
| --- | --- | :-: | :-: | :-: | :-: |
| `erp.dashboard.read` | `dashboard` | yes | ✔ | ✔ | ✔ |
| `erp.company.manage` | `company_management` | yes | ✔ | — | — |
| `erp.branch.manage` | `branch_management` | yes | ✔ | ✔ | — |
| `erp.accounting.read` | `financial_accounting` | yes | ✔ | — | — |
| `erp.accounting.write` | `financial_accounting` | yes | ✔ | — | — |
| `erp.sales.read` | `sales_pos` | yes | ✔ | — | — |
| `erp.sales.write` | `sales_pos` | yes | ✔ | — | — |
| `erp.purchasing.read` | `purchasing_procurement` | yes | ✔ | — | — |
| `erp.purchasing.write` | `purchasing_procurement` | yes | ✔ | — | — |
| `erp.inventory.read` | `warehouses_inventory` | yes | ✔ | — | — |
| `erp.inventory.write` | `warehouses_inventory` | yes | ✔ | — | — |
| `erp.hr.read` | `human_resources` | yes | ✔ | — | — |
| `erp.hr.write` | `human_resources` | yes | ✔ | — | — |
| `erp.crm.read` | `crm` | yes | ✔ | — | — |
| `erp.crm.write` | `crm` | yes | ✔ | — | — |
| `erp.operations.read` | `operations` | yes | ✔ | — | — |
| `erp.operations.write` | `operations` | yes | ✔ | — | — |
| `erp.reports.read` | `reports_analytics` | yes | ✔ | ✔ | — |
| `erp.inspection.read` | `automotive_inspections` | yes | ✔ | — | — |
| `erp.inspection.write` | `automotive_inspections` | yes | ✔ | — | — |
| `erp.maintenance.read` | `automotive_maintenance` | yes | ✔ | — | — |
| `erp.maintenance.write` | `automotive_maintenance` | yes | ✔ | — | — |
| `erp.spare_parts.read` | `spare_parts` | yes | ✔ | — | — |
| `erp.spare_parts.write` | `spare_parts` | yes | ✔ | — | — |

## Enforcement rules

1. **Platform permissions never leave the platform.** A platform permission in
   a tenant role is rejected with `authz.delegation_exceeds_scope`, and
   `resolveEffectivePermissions` drops any platform code granted to a company
   principal.
2. **A company administrator cannot grant what it does not hold.** The
   delegation validator returns `exceeds_actor_permissions`.
3. **A company administrator cannot grant a non-delegable permission.** The
   validator returns `not_delegable`.
4. **Unlicensed-module permissions are inert, not rejected.** They are stored on
   the role (so a plan upgrade activates them) but stripped from the effective
   set at request time.
5. **`company.read` is delegable** because staff must be able to read their own
   company profile; it conveys no write capability.
6. **Branch scope is enforced in queries.** A membership with an explicit branch
   list cannot act on other branches; the API returns
   `authz.branch_out_of_scope`.
7. **The Super Admin is not plan-limited.** A platform principal evaluating a
   module guard without company context bypasses entitlement gating, because
   platform governance is not a licensed feature. Once a company context or
   support session is attached, gating applies.

## Verified by tests

| Rule | Test |
| --- | --- |
| 1 | `packages/shared/test/authorization.test.ts` — "rejects granting a platform permission from a tenant role"; `apps/api/test/authorization.e2e-spec.ts` — "rejects a platform permission in a tenant role" |
| 2 | shared — "rejects granting a permission the actor does not hold"; API — "blocks a company admin from delegating a permission it does not hold" |
| 3 | shared — "a company admin cannot delegate beyond its own permission set" |
| 4 | shared — "accepts an unlicensed-module permission but it stays inert" |
| 6 | shared — "enforces an explicit branch assignment"; API — "rejects an out-of-scope branch context header" |
| 7 | API — "hides a module from the catalog when the plan does not license it" |
