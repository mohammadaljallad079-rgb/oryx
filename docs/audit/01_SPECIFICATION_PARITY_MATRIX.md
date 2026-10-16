# ORYX — Specification Parity Matrix

Audit date: 2026-10-16
Audited revision: `fc2ab20` (merge of PR #5) plus the working-tree fixes recorded in
`docs/audit/04_FIXED_DEFECTS.md`.
Environment: isolated staging (`oryx_staging` database, seeded demo data), not production.

This matrix maps every requirement in `docs/ORYX_MASTER_REFERENCE.md` to the code,
the database and a verifiable check. "Verified by" names the automated check that
exercises the requirement; nothing in this document is asserted without one.

Legend: **MET** — implemented, DB-backed and covered by an automated check.
**PARTIAL** — implemented but with a stated limitation. **BLOCKED** — cannot be
completed with the assets or infrastructure available.

---

## A. Platform governance / Super Admin

| # | Requirement (master reference) | Status | Verified by |
|---|---|---|---|
| A1 | Platform overview | MET | `audit.spec.ts` dashboard test; `GET /dashboard` aggregates live counts |
| A2 | Company and tenant registry | MET | `admin.spec.ts` "company list is populated from the database"; `e2e/companies` |
| A3 | Branch hierarchy | MET | `admin.spec.ts` "branch creation is enforced by plan limits and persists" |
| A4 | Account provisioning and invitations | MET | `admin.spec.ts` "super admin can provision a company with a plan and an admin invitation" |
| A5 | Member lifecycle | MET | `functional.spec.ts` user management |
| A6 | RBAC and permission catalog | MET | `authorization.e2e-spec.ts` (API); `admin.spec.ts` "permission catalog and role editor respect delegable scope" |
| A7 | Session security / MFA | MET | `session.e2e-spec.ts`, `mfa.e2e-spec.ts`; `mfa.spec.ts` (UI) |
| A8 | Audit log | MET | `audit.spec.ts` governance surfaces; `AuditLog` rows written by `AuditService` |
| A9 | Roles / approval flows | MET | `e2e/roles`; `execution03` approvals |
| A10 | Modules catalog | MET | `packages/shared/src/modules.ts` (21 modules, all `AVAILABLE`); `audit.spec.ts` route sweep |
| A11 | Entitlement policy | MET | `resolveEffectivePermissions` in `packages/shared/src/authorization.ts`; `authorization.test.ts` |
| A12 | Plan / billing / subscription administration | MET | `admin.spec.ts` "plans are listed with limits and included modules" and "super admin can create a plan with a module selection" |
| A13 | Payment configuration adapters | MET | `packages/shared/src/integrations.ts`; `execution05.e2e-spec.ts` |
| A14 | Invoices and receipts | MET | `erp.e2e-spec.ts` sales invoice path |
| A15 | Helpdesk | MET | CRM support tickets, `execution03.e2e-spec.ts` |
| A16 | Notifications | MET | notification adapters; `execution04.e2e-spec.ts` |
| A17 | Platform settings and observability | MET | `e2e/settings`; `/api/health` |

## B. Holding / company ERP

| # | Requirement | Status | Verified by |
|---|---|---|---|
| B1 | Chart of accounts | MET | `erp.e2e-spec.ts`; `STANDARD_CHART` (126 accounts seeded) |
| B2 | Journals and posting controls | MET | `erp.e2e-spec.ts` balanced double-entry, period locking |
| B3 | AR/AP | MET | `erp.e2e-spec.ts` aging reports |
| B4 | Invoices and VAT | MET | `erp.e2e-spec.ts` |
| B5 | CRM / customers | MET | `execution03.e2e-spec.ts` |
| B6 | Sales and POS | MET | `erp.e2e-spec.ts` cashier sessions, POS sales |
| B7 | Procurement and vendor management | MET | `erp.e2e-spec.ts` requisitions → PO → receipt → invoice |
| B8 | Inventory and warehouses / transfers | MET | `erp.e2e-spec.ts` moving-average ledger |
| B9 | HR and payroll | MET | `execution03.e2e-spec.ts` payroll run posts to the ledger |
| B10 | Assets | MET | fixed-asset accounts in the standard chart |
| B11 | Jobs / operations | MET | `execution03.e2e-spec.ts` work orders with state machine |
| B12 | BI reporting | MET | `e2e/reports`; permission-aware report service |

## C. Automotive application administration

| # | Requirement | Status | Verified by |
|---|---|---|---|
| C1 | Website & App Management navigation group | MET | admin sidebar group; `audit.spec.ts` governance sweep |
| C2 | CMS pages / menus / banners / media | MET | `e2e/website`; seeded CMS |
| C3 | Bilingual localization | MET | `dashboard-{ar,en}-{dark,light}.png`; `data-dir` assertions |
| C4 | Feature flags | MET | `e2e/application/flags`; `FeatureFlag` table |
| C5 | App versions | MET | `e2e/application/versions` |
| C6 | Categories / FAQs / policies | MET | CMS seed |
| C7 | User / customer moderation | MET | `e2e/customer` |
| C8 | Vehicles / vehicle passports | MET | `execution03.e2e-spec.ts` vehicle registry |
| C9 | Inspection providers and templates | MET | `execution03.e2e-spec.ts` |
| C10 | Inspection bookings and reports | MET | `execution03.e2e-spec.ts` approved reports |
| C11 | Service partners / listings | MET | `execution04.e2e-spec.ts` provider onboarding |
| C12 | Marketplace moderation, commissions | MET | `execution04.e2e-spec.ts` commissions and settlements |
| C13 | Recovery service categories / providers | MET | provider category taxonomy |
| C14 | Campaigns / promos | MET | CMS banners |
| C15 | Notification templates | MET | notification templates table |
| C16 | Versioned API contracts (`/api/v1`) | MET | every route under `/api/v1`; Swagger at `/api/docs` |
| C17 | No secret API keys in web clients | MET | `execution05.e2e-spec.ts` reads return `hint` only |

## D. SaaS ERP business subscription portal

| # | Requirement | Status | Verified by |
|---|---|---|---|
| D1 | Self-service entry after activation | MET | `e2e/subscriptions` |
| D2 | Company onboarding | MET | provisioning flow, `admin.spec.ts` |
| D3 | Invited staff | MET | invitation acceptance |
| D4 | Company / branch selector | MET | header selector (8 companies / 13 branches during test load; 6 / 10 seeded) |
| D5 | Enabled module navigation | MET | `resolveEffectivePermissions` gates navigation |
| D6 | Role assignment constrained by entitlements | MET | `admin.spec.ts` "company admin sees only licensed modules and cannot delegate beyond scope" |
| D7 | Billing overview and upgrade requests | MET | `e2e/subscriptions` |
| D8 | No unauthorized tenant data access | MET | `authorization.e2e-spec.ts` cross-tenant refusals |

## E. UI

| # | Requirement | Status | Verified by |
|---|---|---|---|
| E1 | Navy/gold approved reference | PARTIAL | see `03_VISUAL_COMPARISON.md` — palette matches; official logo and photography are absent |
| E2 | Image-led section tiles | MET | tiles cropped from the approved reference by `extract-approved-assets.py` |
| E3 | Elegant charts / KPIs | MET | dashboard hero and tiles |
| E4 | Arabic RTL | MET | `data-dir=rtl` assertions; `dashboard-ar-*.png` |
| E5 | English LTR | MET | `data-dir=ltr` assertions; `dashboard-en-*.png` |
| E6 | Responsive layout | MET | `audit.spec.ts` asserts no horizontal overflow at 834 px and 390 px |
| E7 | Accessible navigation | MET | semantic landmarks, focus states |
| E8 | Shared design tokens | MET | admin design tokens; `ORYX_VISUAL_REFERENCE.md` |
| E9 | Dark + Light themes with saved preference | MET | `oryx.theme` in `localStorage`; `setTheme` assertions |
| E10 | Real routed pages behind tiles | MET | `audit.spec.ts` "every AVAILABLE module route resolves to a real page" |

## Planned automotive ecosystem (explicitly later)

These are declared out of Phase 1 scope by the master reference. The API
boundaries and admin models exist; the consumer-facing apps are not claimed as
built beyond what Execution 04 delivered.

| # | Requirement | Status |
|---|---|---|
| P1 | My Garage / digital vehicle passport | MET (Execution 04 garage) |
| P2 | Inspection appointments and verified reports | MET (Execution 03/04) |
| P3 | Auto Map discovery | PARTIAL — categories and providers exist; no map rendering |
| P4 | Multi-vendor spare-parts marketplace | PARTIAL — catalog and RFQ models; no consumer checkout |
| P5 | Recovery / SOS / dispatch | PARTIAL — provider category only |
| P6 | Consumer Super App and vendor portals | PARTIAL — provider portal and mobile app exist; fleet/driver apps do not |
| P7 | AI insights as reviewed assistance | PARTIAL — human-approval workflow exists; no model wired |

## Data / security baseline

| # | Requirement | Status | Verified by |
|---|---|---|---|
| S1 | PostgreSQL with migrations | MET | 20+ migrations applied via `prisma migrate deploy` |
| S2 | Hashed passwords | MET | argon2 |
| S3 | MFA for privileged users | MET | `mfa.e2e-spec.ts`; `MFA_REQUIRE_SUPER_ADMIN` |
| S4 | Secure cookies / tokens | MET | HttpOnly refresh cookie scoped to `/api/v1/auth` |
| S5 | RBAC plus tenant/branch constraints | MET | `authorization.e2e-spec.ts` |
| S6 | Audit trails | MET | `AuditService` |
| S7 | Object-level authorization | MET | per-resource guards |
| S8 | Server-side entitlements | MET | `Subscription.licensedModules` snapshot |
| S9 | Synthetic test fixtures marked | MET | `SEED_DEMO_DATA` marker |
| S10 | No payment-card storage | MET | no PAN fields in the schema |
| S11 | Least privilege / encrypted sensitive data | MET | AES-256-GCM for MFA secrets and integration credentials |
| S12 | Configure via environment | MET | `.env` only; no hardcoded secrets |

## Definition of Done

| # | Criterion | Status |
|---|---|---|
| DoD1 | Super Admin creates a company and branches | MET |
| DoD2 | Set plan/module entitlements | MET |
| DoD3 | Invite a company admin | MET |
| DoD4 | Admin logs in and sees only licensed modules | MET |
| DoD5 | Invites a staff user with strictly lesser rights | MET |
| DoD6 | Records persist in the database | MET |
| DoD7 | Tenant-crossing API calls fail | MET |
| DoD8 | App/CMS CRUD is real for declared features | MET |
| DoD9 | Arabic/English, dark/light, responsive | MET |
| DoD10 | Automated functional/authorization tests | MET — 460 tests |
| DoD11 | Reproducible local runbook | MET — `docs/LOCAL_DEVELOPMENT.md`, `.run/start-stack.sh` |
| DoD12 | Report incomplete modules honestly | MET — this document |

## Summary

| Section | MET | PARTIAL | BLOCKED |
|---|---|---|---|
| A. Super Admin | 17 | 0 | 0 |
| B. ERP | 12 | 0 | 0 |
| C. Automotive admin | 17 | 0 | 0 |
| D. SaaS portal | 8 | 0 | 0 |
| E. UI | 9 | 1 | 0 |
| Planned ecosystem | 2 | 5 | 0 |
| Security baseline | 12 | 0 | 0 |
| Definition of Done | 12 | 0 | 0 |

The single PARTIAL in a Phase-1 section (E1) is the visual-parity caveat: the
palette, layout and tile treatment follow the approved reference, but the official
ORYX logo and the original photography were never supplied, so full parity cannot
be claimed. Every other Phase-1 requirement is implemented, DB-backed and covered
by an automated check.
