# Execution 06 → current ORYX production: integration audit

Source: `feature/execution-06-attachments-employee-file` (OpenHands, originally based on `main`).
Target: `release/oryx-latest` (deployed commit `d3cca856` at the time of the audit).

## Verified divergence

GitHub compare reports the source feature branch **3 commits ahead and 1029 behind** the production branch, with a common merge base `75bb08a`. Therefore the source tree must **not** replace the current release directory or its existing implementation.

Current production already has:
- `apps/api/src/attachments/attachments.service.ts` with the existing attachment API/storage behavior;
- `AttachmentsModule` wired into both the main API and HR module;
- a production Prisma schema significantly newer than the source branch (7032 vs 4659 lines).

Source adds:
- an employee electronic file, a unified record preview UI, and form-based attachment UX;
- new `EmployeePenalty` and `EmployeeBonus` models and migrations;
- additional fields on `Employee` and `EntityAttachment`.

Current production schema **does not** have `EmployeePenalty` or `EmployeeBonus`. It has an existing non-null `EntityAttachment.companyId` and other attachment fields. The proposed source migration relaxes this constraint for platform-level records. Integrating it requires an explicit schema reconciliation and new migration *relative to production*, not copying the old schema.

## Required integration work before any production deployment

1. Merge new functionality into **existing** current attachment authorization, tenant-isolation, storage and HR services; do not overwrite current implementations.
2. Adapt the employee file API/DTOs and preview/form UI to current routes, types, and permissions.
3. Create and review migration(s) against the **current 72-migration** production schema. Check existing HR/payroll relations and migration-name ordering.
4. Run current-release typecheck/build, API integration and browser acceptance against a disposable database.
5. Verify upload directory durability and real per-tenant access controls, especially platform-wide attachments.
6. Do not run migrations on the live database or switch PM2 services before tests and rollback constraints have been resolved.

## Operator preference

Operator explicitly declined taking a new backup. This branch is a **non-deploying, code-only integration workspace**. No production data or processes are modified by this audit, and no promise of lossless rollback can be made without a recovery point.

## Related existing work

- OpenHands feature: https://github.com/mohammadaljallad079-rgb/oryx/pull/61
- Demo validation PR: https://github.com/mohammadaljallad079-rgb/demo/pull/1
- Separate POS/forms/PDF work: https://github.com/mohammadaljallad079-rgb/oryx/pull/66

**Status:** integration started; functional code port, migration reconciliation, CI and production deployment are still pending.
