# ORYX — Execution 01 Report

**Execution:** 01 — Enterprise Foundation, Super Admin & Approved UI
**Repository:** `mohammadaljallad079-rgb/oryx`
**Branch:** `feature/execution-01-super-admin-foundation`
**Base branch:** `main`
**Date:** 2026-10-14
**Status:** Implemented and tested. Not deployed.

---

## 1. Executive summary

Execution 01 delivers a running, database-backed foundation for the ORYX
platform: a NestJS/PostgreSQL API, a Next.js admin application, persistent
authentication, the platform/company/branch hierarchy, RBAC with a permission
catalog, a configurable ERP module catalog, configurable SaaS plans with
snapshot entitlements, company provisioning, functional Super Admin screens, a
DB-backed dashboard with the approved navy/gold image-tile design, dark and light
themes, Arabic RTL and English LTR, and a persistent Website & Application
Management section.

Everything reported as **implemented** is backed by real database CRUD and
covered by automated tests. Nothing is claimed as deployed. No payment gateway
and no notification provider are integrated, and this is stated plainly rather
than simulated.

### Repository audit result

Before writing code the repository was audited. It contained **only**
documentation and one asset:

```
AGENTS.md
README.md
docs/ORYX_MASTER_REFERENCE.md
docs/ORYX_VISUAL_REFERENCE.md
docs/assets/ORYX Auto Services Dashboard.png   (1536 × 1024)
docs/assets/README.md
```

There was **no application code, no build tooling and no framework choice**, so
the stack was selected from scratch (Next.js + NestJS + PostgreSQL + Prisma, as
the master reference prefers). Nothing pre-existing was modified or deleted.

### Missing asset

**The official ORYX logo is not present in the repository.**
`docs/ORYX_VISUAL_REFERENCE.md` names
`WhatsApp Image 2026-10-06 at 1.25.18 PM(3).jpeg` as the authoritative brand
asset and expects it at `docs/assets/oryx-logo-original.jpg`. It is absent. Per
the reference's own instruction ("Do not substitute guessed logo artwork"), no
logo was invented: the UI uses a neutral geometric monogram placeholder, clearly
marked in code as such.

---

## 2. Verification summary

| Suite | Command | Result |
| --- | --- | --- |
| Authorization invariants (unit) | `pnpm --filter @oryx/shared test` | **22 passed** |
| API integration (real HTTP + guards + Prisma) | `pnpm --filter @oryx/api test:e2e` | **45 passed** |
| UI acceptance + screenshots (Playwright) | `pnpm --filter @oryx/admin test:ui` | **29 passed** (18 acceptance, 11 screenshot) |
| API typecheck | `pnpm --filter @oryx/api typecheck` | clean |
| Admin typecheck | `pnpm --filter @oryx/admin typecheck` | clean |
| Admin production build | `pnpm --filter @oryx/admin build` | 27 routes built |

### Bugs found and fixed during verification

The test suites caught five genuine defects, all fixed:

1. **Privilege escalation on first invitation.** A newly provisioned company's
   default `company_admin` role references ERP permissions the plan does not
   license; the delegation validator treated `module_not_licensed` as a hard
   rejection, so the first invitation always failed. Fixed: unlicensed-module
   permissions are now *accepted but inert* — `resolveEffectivePermissions`
   strips them at request time, so no privilege is conferred and the role widens
   automatically on a plan upgrade.
2. **Plan edits retroactively changed live tenants.** `EntitlementService`
   read `planModule` rows live instead of the subscription's snapshot, directly
   violating the master reference. Fixed: entitlements now come from
   `Subscription.licensedModules`.
3. **`company_admin` could not delegate branch-scoped roles.** The template only
   included `COMPANY`-scope permissions, omitting `BRANCH`-scope codes such as
   `branch.read`, so the seeded `staff_viewer`/`branch_manager` roles were
   unassignable. Fixed: the template now includes every non-platform delegable
   permission.
4. **The Super Admin could not create branches.** The route required
   `company.branch.create`, which a platform principal does not hold. Fixed:
   `platform.branch.manage` is accepted as an alternative.
5. **Plan creation from the UI could never succeed.** The form omitted the
   bilingual descriptions the API required, so every submit returned HTTP 400.
   Fixed: descriptions are optional metadata with an empty default, and the form
   now exposes the fields.

Two further UI defects were found and fixed: platform-only screens rendered
active buttons for principals who could not use them (now an explicit denial
state), and branch creation errors leaked the raw English API message instead of
the localized one.

---

## 3. What is implemented and tested

### 3.1 Authentication and sessions

- Argon2id password hashing.
- Short-lived access tokens (15 min default) plus rotating refresh tokens (30 days).
- Refresh-token **reuse detection**: replaying a rotated token revokes every
  session for that user.
- Account lockout after 8 failed attempts for 15 minutes.
- Invitation flow: SHA-256-hashed single-use tokens with a 7-day expiry,
  accepted through a public endpoint that activates the account and membership.
- Persisted per-user theme and locale preference.
- Audit rows for login, logout, logout-all, password change and invitation
  acceptance.
- Login and refresh endpoints are rate limited independently of the global limit.

**Tests:** 6 authentication integration tests + 3 UI tests.

### 3.2 Organization hierarchy and tenant isolation

- Company CRUD with `INTERNAL` / `SAAS_TENANT` discrimination, status lifecycle
  (`ACTIVE`, `SUSPENDED`, `PROVISIONING`, `ARCHIVED`), parent/subsidiary links
  with server-side cycle rejection, and industry/currency/country metadata.
- Branch CRUD with per-company unique codes and soft deletion.
- Company provisioning optionally creates a subscription and invites the first
  administrator in one call.
- **Isolation is enforced in the API, not only the UI:** a company principal
  cannot read another tenant, list its users, read its audit log, or attach its
  branches. A platform principal carries no tenant scope until a support session
  is opened.

**Tests:** 4 company, 3 branch, 5 cross-tenant integration tests + 4 UI tests.

### 3.3 RBAC and delegated administration

- 62-entry permission catalog with scope (`PLATFORM` / `COMPANY` / `BRANCH`),
  delegability, bilingual labels and module linkage.
- Three seeded company roles (`company_admin`, `branch_manager`,
  `staff_viewer`) plus a platform `platform_super_admin` role.
- Custom role creation and editing, with the permission picker offering only
  permissions the actor holds *and* the plan licenses.
- System roles are protected from modification.
- Effective-permission view per user, showing granted vs effective vs
  entitlement-suppressed permissions.
- Membership role/branch-scope changes revoke live sessions when access is
  removed.

**Tests:** 5 role/delegation integration tests, 5 authorization unit tests,
2 UI tests.

### 3.4 Module catalog, plans and subscriptions

- 17-module ERP catalog with delivery phase and availability status, shared by
  API authorization and UI navigation.
- Admin-defined plans: pricing, currency, trial days, limits, included modules,
  public/active flags.
- Subscription assignment with an immutable event history; plan changes and
  status changes each write an event.
- **Entitlement snapshot** semantics: plan edits never alter live tenants.
- Suspending a subscription revokes entitlements immediately.
- Plan limits enforced server-side: `maxBranches` and `maxUsers` return
  `plan.limit_exceeded`.

**Tests:** 4 entitlement, 4 plan, 3 limit integration tests + 3 UI tests.

### 3.5 Dashboard

- Every figure is a database aggregate constrained to the authorized
  company/branch scope: companies, active companies, branches, users, active
  subscriptions, monthly recurring revenue, licensed modules, seat utilisation,
  open support sessions.
- Branch staffing chart and module-entitlement donut are drawn from real rows.
- Recent activity is read from the audit trail.
- `isDemoData` is `true` only when every company in scope is a seeded synthetic
  record; the UI then shows a labelled demo notice.
- Empty states are shown rather than invented numbers.

**Tests:** 4 dashboard integration tests + 2 UI tests.

### 3.6 Website & Application Management

Persistent, admin-editable: CMS pages (bilingual, draft/published/archived),
home-screen and web banners, feature flags, application version records, service
categories, notification templates, and API client registration (secret returned
once, stored as a SHA-256 hash). A public endpoint serves published content to
the future website and app shells.

**Tests:** 2 UI tests plus public-content integration tests.

### 3.7 Audit and support access

- Append-only audit trail across every security-relevant mutation.
- Super Admin support sessions are explicit, reason-gated (≥10 characters),
  time-bounded (5–240 minutes, default 60) and audited on open and end. An
  expired or non-owned session is rejected.

**Tests:** 2 support integration tests.

### 3.8 UI, themes and localization

- 27 routes built; the authenticated shell provides company and branch context
  selection, theme and language toggles, and a user menu.
- Dark theme reproduces the approved navy (`#00162b`) and gold (`#d4af37`)
  identity; light theme keeps the same layout with navy typography and
  restrained gold.
- Theme and locale persist per user (localStorage plus the user profile).
- Arabic RTL is the default; English LTR is natural, not mirrored.
- Planned modules render an explicit "not implemented in Execution 01" state
  with no fabricated data.
- Responsive: the sidebar collapses to an overlay drawer below 860 px.

**Tests:** 2 theme/locale UI tests, 2 responsive/mobile screenshot captures.

---

## 4. Implemented but not fully tested

| Area | Coverage | Gap |
| --- | --- | --- |
| `storageMb` and `apiRequestsPerMonth` limits | Stored, returned, displayed | No storage meter or request metering job, so no enforcement test |
| `maxCompanies` limit | Stored and displayed | Not enforced; the Super Admin provisions companies |
| CMS `PUT` upsert paths | Pages and banners exercised through the UI | Feature-flag and app-version writes are covered by UI tests only, not by an API-level assertion |
| API client secret lifecycle | Creation returns the secret; revocation path implemented | No test asserting that a revoked client is refused at the gateway (no gateway exists yet) |
| Password change flow | Implemented with session revocation | No integration test |
| Logout / logout-all | Implemented and audited | Covered indirectly; no dedicated integration test |
| Mobile viewports | Screenshot-verified at 390 × 844 | No interaction tests at mobile width |
| Tablet viewports | Responsive CSS present | Not screenshot-verified |

---

## 5. Scaffolded or planned

Routed, permission-protected, and **explicitly labelled as not implemented** in
the UI. No fabricated data is shown on these screens.

| Module | Route | Planned phase |
| --- | --- | --- |
| Financial Accounting | `/accounting` | execution-02 |
| Sales & POS | `/sales` | execution-02 |
| Purchasing & Procurement | `/purchasing` | execution-02 |
| Reports & Analytics | `/reports` | execution-02 |
| Warehouses & Inventory | `/inventory` | execution-03 |
| Human Resources | `/hr` | execution-03 |
| CRM | `/crm` | execution-03 |
| Operations | `/operations` | execution-03 |
| Automotive Inspections | `/automotive/inspections` | execution-04 |
| Automotive Maintenance | `/automotive/maintenance` | execution-04 |
| Spare Parts | `/automotive/spare-parts` | execution-04 |

Also scaffolded but not implemented: the consumer mobile application, marketplace
moderation queues, inspection/maintenance configuration engines, partner
administration, payments, and email/SMS/push delivery.

---

## 6. Blocked by missing assets or external credentials

| Item | Blocker | Effect |
| --- | --- | --- |
| Official ORYX logo | The original image file is not in the repository | A neutral geometric monogram placeholder is used; no mark was invented |
| Approved dashboard photography | Only the flat screenshot exists; the underlying imagery is not available | Tile and hero artwork is generated abstract vector art (`scripts/generate-tile-art.py`). Replacing it needs only new files in `apps/admin/public/tiles/` |
| Payment gateway | No provider credentials | Subscriptions record price, period and immutable history; no charge is attempted and no integration is claimed |
| Email/SMS/push delivery | No provider credentials | Invitation tokens are returned by the API exactly once and must be delivered out of band |
| MFA | Not implemented in this execution | Privileged accounts rely on password + lockout only |
| Deployment | No target environment provided | Nothing is deployed; no deployment is claimed |

---

## 7. Visual comparison against the approved reference

**Reference:** `docs/assets/ORYX Auto Services Dashboard.png` (1536 × 1024),
the authoritative owner-approved layout.

**Implementation:** `docs/execution-reports/screenshots/desktop-dark-dashboard-full.png`
(1440 × 1000 viewport, full page).

### What matches

| Reference element | Implementation |
| --- | --- |
| Deep navy field with layered panels | `--bg: #00162b`, `--surface: #021f3a`, `--surface-raised: #072a4a` |
| Restrained gold accent | `--gold: #d4af37`, with soft/deep variants for gradients |
| Premium top navigation bar | Sticky translucent header with blurred backdrop, scope selector, theme/language toggles, user menu |
| Right-side navigation in Arabic | Sidebar switches to the inline-start (right) edge under RTL, grouped and gold-highlighted on the active route |
| Automotive hero section | Full-width image-led hero with a navy gradient scrim, headline, supporting copy and a primary CTA |
| Large image-led rectangular module cards | `.oryx-tile` grid with SVG artwork behind a navy gradient, icon chip, availability badge, title and description |
| Card overlays, typography, icons, borders | Hairline gold-tinted borders, text shadows over imagery, gold-bordered icon chips |
| KPI cards | Eight KPI cards with icon chip, label, tabular value and sub-label |
| Analytics charts | Branch staffing bar chart, module-entitlement donut, entitlement trend line — all theme-aware inline SVG |
| Overall proportions and density | 3-column tile grid, 4-column KPI row, 3-column analytics row at 1440 px |

### Deliberate differences

1. **Photography replaced by generated vector art.** The reference uses
   photographic tiles; the repository contains no licensed imagery, so
   `scripts/generate-tile-art.py` produces abstract automotive/enterprise vector
   artwork. The visual role — image-led rectangles with a navy scrim and legible
   captions — is preserved. Dropping real photography into
   `apps/admin/public/tiles/` with the same filenames completes the match without
   a code change.
2. **No ORYX logo.** A neutral geometric monogram occupies the brand slot. This
   follows the visual reference's explicit instruction not to invent the mark.
3. **Illustrative metrics are replaced by real data.** The reference shows
   fixed sample figures. The implementation queries the database for the
   authorized scope; with only seeded data present it displays a labelled demo
   notice, and with real data the notice disappears. This is required by the
   execution rules and is the most important intentional difference.
4. **Module tiles carry an availability badge.** Tiles for modules that are not
   implemented in Execution 01 are desaturated and labelled "Planned", and the
   destination page states plainly that the workflow is absent. The reference
   shows all tiles as equal.
5. **Extra operational chrome.** The reference is a single static view; the
   implementation adds a company/branch scope selector, because the dashboard
   must respect permitted scope.
6. **Additional dashboard panels.** Branch staffing, module entitlement and
   recent activity replace decorative panels so that every element carries
   meaning.

### Themes and directions

| Variant | File |
| --- | --- |
| Desktop dark (English LTR) | `desktop-dark-dashboard.png`, `desktop-dark-dashboard-full.png` |
| Desktop light (English LTR) | `desktop-light-dashboard.png`, `desktop-light-dashboard-full.png` |
| Desktop dark (Arabic RTL) | `desktop-dark-ar-dashboard.png` |
| Mobile dark | `mobile-dark-dashboard.png` |
| Mobile light | `mobile-light-dashboard.png` |

The light theme keeps the identical layout, swapping to a warm off-white field
with navy headings and restrained gold. Arabic RTL mirrors the shell, the hero
scrim gradient and the active-route highlight.

---

## 8. Screenshots delivered

All in `docs/execution-reports/screenshots/`, captured from the running
application at 1440 px (desktop) and 390 × 844 (mobile).

| File | Shows |
| --- | --- |
| `desktop-dark-dashboard.png` | Dashboard, dark, English, viewport |
| `desktop-dark-dashboard-full.png` | Dashboard, dark, English, full page |
| `desktop-light-dashboard.png` / `-full.png` | Dashboard, light, English |
| `desktop-dark-ar-dashboard.png` | Dashboard, dark, Arabic RTL |
| `mobile-dark-dashboard.png` | Dashboard, dark, mobile |
| `mobile-light-dashboard.png` | Dashboard, light, mobile |
| `desktop-dark-companies.png` | Company & tenant management |
| `desktop-light-companies.png` | Company management, light theme |
| `desktop-dark-plans.png` | Subscription packages |
| `desktop-dark-roles.png` | Roles & permissions |
| `desktop-dark-company-admin.png` | Restricted company-administrator view |
| `desktop-dark-planned-module.png` | Explicit not-implemented module state |
| `desktop-dark-login.png` / `desktop-light-login.png` | Sign-in screen, both themes |

---

## 9. Deliverables checklist

| # | Deliverable | Status |
| --- | --- | --- |
| 1 | Source committed to a dedicated feature branch | Done |
| 2 | Branch pushed to GitHub | Done — `feature/execution-01-super-admin-foundation` |
| 3 | Pull request against `main` | Opened — https://github.com/mohammadaljallad079-rgb/oryx/pull/1 |
| 4 | Database migrations and seed scripts | Done — 2 migrations, idempotent seed |
| 5 | `.env.example` without secrets | Done |
| 6 | Local development runbook | `docs/LOCAL_DEVELOPMENT.md` |
| 7 | Architecture document | `docs/architecture/ARCHITECTURE.md` |
| 8 | Permission matrix | `docs/architecture/PERMISSION_MATRIX.md` |
| 9 | Module/plan entitlement specification | `docs/architecture/MODULE_PLAN_ENTITLEMENTS.md` |
| 10 | Screenshots and visual comparison report | Section 7 + `screenshots/` |
| 11 | Automated test results | Section 2 |
| 12 | This execution report | `docs/execution-reports/ORYX_EXECUTION_01_REPORT.md` |

Additional: `docs/api/API_REFERENCE.md`, Swagger UI at `/api/docs`,
`scripts/smoke.sh`, `scripts/generate-tile-art.py`.

---

## 10. Reproducing this report

```bash
# Prerequisites: Node ≥ 20, pnpm 9.15.9, PostgreSQL 17
pnpm install
cp .env.example .env                     # then set the two JWT secrets
pnpm db:generate && pnpm db:migrate && pnpm db:seed

pnpm --filter @oryx/shared test           # 22 passed
pnpm --filter @oryx/api test:e2e          # 45 passed

# UI suites need both services running:
AUTH_THROTTLE_LIMIT=500 pnpm dev:api &
pnpm dev:admin &
pnpm --filter @oryx/admin test:ui         # 29 passed
```

---

## 11. Recommended next steps

1. Upload the official ORYX logo and the approved dashboard photography, then
   drop the imagery into `apps/admin/public/tiles/`.
2. Implement Execution 02 (Financial Accounting, Sales & POS, Purchasing,
   Reports) as real DB-backed workflows, promoting each module from `PLANNED` to
   `AVAILABLE` in the shared catalog.
3. Add MFA for privileged accounts and move refresh tokens to httpOnly cookies.
4. Add a storage meter and an API request metering job so `storageMb` and
   `apiRequestsPerMonth` are enforced, then extend the limit tests to cover them.
5. Integrate a payment provider and an email/SMS provider behind explicit,
   auditable adapters.
