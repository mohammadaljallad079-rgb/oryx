# OpenHands / Coding Agent Guide — ORYX

Read **docs/ORYX_MASTER_REFERENCE.md**, **docs/architecture/ARCHITECTURE.md** and
**docs/architecture/PERMISSION_MATRIX.md** before writing code.

## Current state (Execution 01 complete)

Execution 01 delivered the working Super Admin foundation. It is **not** a mock:
a NestJS API, a Next.js admin app and a PostgreSQL database run locally and are
covered by automated tests.

- **Implemented and tested:** authentication and sessions, organization
  hierarchy (platform → company → branch), tenant isolation, RBAC with a
  permission catalog, delegated administration, ERP module catalog, SaaS plans
  and snapshot entitlements, company/branch/user/role/invitation management,
  DB-backed dashboard, website/application CMS, audit trail, support sessions,
  dark/light themes, Arabic RTL and English LTR.
- **Scaffolded only:** every ERP operational module (accounting, sales,
  purchasing, inventory, HR, CRM, operations, automotive). Routes exist and are
  permission-protected, but the screens state plainly that the workflow is
  unimplemented and show no fabricated data.
- **Missing assets:** the official ORYX logo and the approved dashboard
  photography are not in the repository. The UI uses a neutral monogram
  placeholder and generated vector tile art. Do not invent brand marks.

## Non-negotiable rules

- One system with **platform / group / company / branch** hierarchy and explicit
  tenant boundaries. Never conflate ORYX internal companies with paying tenants.
- Authorization is enforced **server-side**. The UI only hides what the API
  would reject. Never rely on hidden controls for security.
- A company administrator can never grant a permission it does not hold, that is
  not delegable, or that the plan does not license. See `validateDelegation` and
  `resolveEffectivePermissions` in `packages/shared/src/authorization.ts` — these
  are the only places those rules live.
- Entitlements come from `Subscription.licensedModules` (a snapshot), never from
  a live plan lookup. Editing a plan must not retroactively change a tenant.
- Packages are admin-created and editable, never hard-coded.
- A platform principal carries **no tenant scope** until it opens an explicit,
  reasoned, time-bounded support session.
- Every tenant-owned table carries `companyId`.
- Report incomplete work honestly. Never claim a module works, or that something
  is deployed, without verification.

## Working in this repository

```bash
pnpm install
cp .env.example .env
pnpm db:generate && pnpm db:migrate && pnpm db:seed

pnpm dev:api                        # :3001  (docs at /api/docs)
pnpm dev:admin                      # :3000

pnpm --filter @oryx/shared test     # authorization invariants (no DB needed)
pnpm --filter @oryx/api test:e2e    # API integration (needs the seeded DB)
pnpm --filter @oryx/admin test:ui   # Playwright (needs both services running)
```

### Gotchas learned the hard way

- **API build:** `pnpm --filter @oryx/api build` clears a stale
  `tsconfig.build.tsbuildinfo` first. Without that, `nest build` can silently
  emit nothing and `dist/main.js` goes missing.
- **Route prefix:** every route is under `/api/v1`. Health is the exception and
  lives at `/api/health` (version-neutral).
- **Throttling:** the Playwright suite performs many logins; run the API with
  `AUTH_THROTTLE_LIMIT=500 THROTTLE_LIMIT=5000` when running UI tests, or the
  suite will see 429s and time out.
- **Admin default locale is Arabic.** Tests that assert English text must set
  the locale explicitly (`setLocale(page, 'en')`).
- **Company list is paginated.** After provisioning in a test, search for the
  new company rather than assuming it appears on page 1.
- **Both dev servers** must be running before `test:ui`. Restart `next start`
  after a rebuild — the old server keeps serving stale chunks and logins hang.
- **Locale switching** must happen after a page has loaded; `localStorage` is
  unavailable on `about:blank`.

### Adding a new ERP module

1. Add a `ModuleDefinition` to `packages/shared/src/modules.ts`.
2. Add its permissions to `packages/shared/src/permissions.ts`.
3. `pnpm db:seed` to upsert the module row.
4. Add the module key to the relevant plans.
5. Add the route under `apps/admin/src/app/(app)/`.

Navigation, guards, plan editing and dashboard tiles all read the same catalog,
so nothing else needs changing.

## Constraints from the owner

- Keep future app services structurally ready; the consumer app belongs to a
  later execution.
- Do not rebuild unrelated projects, start the mobile app first, or replace the
  approved visual identity.
- Prefer increments with true DB-backed CRUD and tests over blanket placeholder
  modules.
- Never modify or delete pre-existing project code without auditing it first.
- Do not commit production credentials, tokens or secret keys.
