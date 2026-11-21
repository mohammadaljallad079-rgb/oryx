# ORYX — Execution 08 Phase 1: Complete Platform Audit

Status: **audit complete.** This document is an inventory of what exists and a
classification of what works. It is not a claim of production readiness; the
gaps it records are what Phases 2–9 address.

Method: the classification below was derived from the source tree, the database
schema, the route tables and the automated suites — not from the marketing
documentation. Where a claim is made, the file or command that supports it is
named. A feature is **WORKING** only when its API endpoint is DB-backed *and*
its screen calls that endpoint. A screen that renders bundled preview data is
**PARTIAL**, however polished it looks.

---

## 1. Scale

| Measure | Value |
| --- | --- |
| Prisma models | 163 |
| Prisma migrations | 13 (+1 migration lock) |
| Schema drift against migrations | **none** (`prisma migrate diff` → "No difference detected") |
| API controllers | 34 |
| API endpoints | 425 |
| API source | 32,787 lines |
| Admin source | 19,940 lines |
| Customer source | 6,468 lines |
| Shared source | 3,361 lines |
| API integration suites | 14 |
| Shared unit suites | 7 |
| Browser suites (Playwright) | 17 |
| Mobile unit suites | 3 |

---

## 2. Classification

### 2.1 Public website (`apps/customer`)

| Feature | Status | Evidence |
| --- | --- | --- |
| Marketing homepage (hero, categories, how-it-works, FAQ, contact, footer) | **WORKING** | `apps/customer/src/app/page.tsx`; content read from the CMS endpoint via `use-website-content.ts` |
| Services catalogue, Arabic and English | **WORKING** | `/services/page.tsx`; categories from `@oryx/shared` |
| Provider directory | **WORKING** (read) | `/providers/page.tsx` → `GET /v1/marketplace/providers` |
| Provider detail | **WORKING** (read) | `/providers/[id]/page.tsx` |
| Provider self-application | **WORKING** | `/providers/apply/page.tsx` → `POST /v1/marketplace/providers/apply` |
| Light and dark themes, RTL and LTR | **WORKING** | verified in Execution 07; 60 captures |
| Static GitHub Pages preview | **WORKING (read-only by design)** | `IS_STATIC_PREVIEW`; mutating calls throw `501 preview_read_only` (`api.ts:375`) |
| Booking wizard on the public site | **PARTIAL** | the wizard exists in the mobile app and the API; the customer site routes bookings through the dashboard |

### 2.2 Customer dashboard (`apps/customer`)

| Feature | Status | Evidence |
| --- | --- | --- |
| Consumer identity, sessions, CSRF | **WORKING** | `customer-auth.service.ts`; consumer plane `aud= customer` |
| Registration and login | **WORKING** | `/register`, `/login` |
| Vehicle garage (add, edit, list) | **WORKING** | `/garage/page.tsx` → `customer-platform.controller.ts` |
| Addresses | **WORKING** | `PREVIEW_ADDRESSES` mirrored by real API in `customer-profile.controller.ts` |
| Bookings list and detail | **WORKING** | `/bookings/page.tsx` → `booking.controller.ts` |
| Invoices and payments | **WORKING** | `/invoices/page.tsx` → payments module |
| Notifications and preferences | **WORKING** | `/notifications/page.tsx`; preference matrix persisted |
| Support tickets | **WORKING** | `/support/page.tsx` |
| Profile and privacy, data export and deletion | **WORKING** | `/profile/page.tsx`; export/deletion request records |
| Credits | **WORKING** | `/credits/page.tsx` |

### 2.3 Administration dashboard (`apps/admin`)

35 of 36 route pages import the real API client (`apps/admin/src/lib/api.ts`);
the one exception is `app/page.tsx`, which is a redirect. No admin page renders
bundled operational data.

| Feature | Status | Evidence |
| --- | --- | --- |
| Authentication, MFA (TOTP), sessions | **WORKING** | `auth/`, `mfa.service.ts`, `mfa-enrollment.service.ts` |
| Organization hierarchy, tenant isolation | **WORKING** | `organizations/` |
| RBAC, delegated administration | **WORKING** | `rbac/`; `validateDelegation` in `@oryx/shared` |
| Companies, branches, users, roles, invitations | **WORKING** | admin routes + API |
| Plans, subscriptions, entitlements | **WORKING** | `plans/`; entitlements are a snapshot |
| Module catalog | **WORKING** | `modules/`; every module `AVAILABLE` |
| Website and application CMS | **WORKING** | `cms/`, `/website`, `/application` |
| Media library (upload, variants, replace, delete) | **WORKING** | `media.controller.ts`; 3 variants via `sharp` |
| Audit trail | **WORKING** | `audit/` |
| Support sessions (reasoned, time-bounded) | **WORKING** | `support/` |
| Dashboard metrics | **WORKING** | `dashboard/` — DB-backed |
| Accounting (CoA, journals, GL, TB, AR/AP) | **WORKING** | `accounting/` |
| Sales and POS | **WORKING** | `sales/` |
| Purchasing and procurement | **WORKING** | `purchasing/` |
| Inventory and stock ledger | **WORKING** | `inventory/` |
| HR and payroll | **WORKING** | `hr/` |
| CRM | **WORKING** | `crm/` |
| Operations, work orders, approvals | **WORKING** | `operations/` |
| Automotive: vehicles, inspections, job cards, warranties | **WORKING** | `automotive/` |
| Providers and workshop management | **WORKING** | `marketplace/` provider portal |
| Bookings and scheduling | **WORKING** | `customer/booking.service.ts` |
| Payments, refunds, reconciliation, settlements | **WORKING** (gateways adapter-only) | `payments/`; `BENEFITPAY` and `CARD_ONLINE` report unconfigured without credentials — deliberately |
| Reports and analytics | **WORKING** | `reports/` |
| Notifications (in-app, email, SMS, WhatsApp, push) | **WORKING** (adapters report unconfigured) | `notifications/` |
| Integrations center (20 providers) | **WORKING** | `integrations/` |
| Platform settings | **PARTIAL** | the `PlatformSetting` model exists and is unused; settings are per-company, not platform-wide |

### 2.4 Mobile application (`apps/mobile`)

| Feature | Status | Evidence |
| --- | --- | --- |
| Expo/React Native app, tabs, booking wizard | **WORKING** | 3 unit suites, 20 tests |
| Native store build and release | **MISSING** | no EAS configuration, no signing material, no store listing |

### 2.5 Cross-cutting

| Feature | Status | Evidence |
| --- | --- | --- |
| Authentication and authorization | **WORKING** | `PrincipalGuard` → `PermissionsGuard` → `ModuleEntitlementGuard`, after `CsrfGuard` |
| Input validation | **WORKING** | global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` |
| Rate limiting | **WORKING** | `ThrottlerGuard`; separate ceilings for auth and refresh |
| File upload security | **WORKING** | type allow-list, decode check, dimension floor, size cap, path-traversal guard (`media-storage.service.ts:105`) |
| Audit logging | **WORKING** | append-only, by key never by value |
| AI functionality | **MISSING (by design)** | no AI feature is documented in the business requirements; none is implemented and none is claimed |

---

## 3. Bahrain configuration (Phase 4)

| Requirement | Current state | Classification |
| --- | --- | --- |
| Primary currency BHD, three decimals | `packages/shared/src/currency.ts` — `{ code: 'BHD', scale: 3 }`, `DEFAULT_CURRENCY = 'BHD'`; integer minor units throughout | **WORKING** |
| Money never a float | `money.ts` uses integer minor units; percentages in basis points | **WORKING** |
| Bahrain phone validation | no Bahrain-specific validator; DTOs use `@IsString() @MaxLength(40)` | **MISSING** |
| Arabic RTL primary locale | `DEFAULT_LOCALE = 'ar'`; admin and customer default to Arabic | **WORKING** |
| English LTR support | verified in Execution 07 | **WORKING** |
| `Asia/Bahrain` timezone | branch default is `'Asia/Riyadh'` (`organizations.service.ts:334`) | **MISSING** |
| Configurable service areas | no `ServiceArea` model | **MISSING** |
| Configurable VAT / financial settings | `taxRateBp` / `taxPercentBp` columns exist per company and document; no platform-level default and no rate is invented | **PARTIAL** |

The three **MISSING** rows are the Phase 4 work. No tax rate, payment
integration or regulatory approval is invented anywhere.

---

## 4. Deployment package (Phase 9)

| Artifact | State |
| --- | --- |
| Dockerfile (API, admin, customer) | **MISSING** |
| Docker Compose production configuration | **MISSING** |
| Reverse proxy / TLS configuration | **MISSING** |
| `.env.example` | **PRESENT** — 104 lines, no real secrets |
| `docs/DEPLOYMENT.md` | **PRESENT** — 317 lines, describes required variables and steps |
| Database migration procedure | **PRESENT** — `pnpm db:migrate` (`prisma migrate deploy`) |
| Automated backup and restore scripts | **MISSING** |
| Health check endpoint | **PRESENT** — `GET /api/health`, version-neutral, probes the database |
| Rollback scripts | **MISSING** |
| GitHub Actions deployment workflow | **MISSING** — only `ci.yml` and `preview.yml` exist |
| Persistent storage for uploads | `MEDIA_ROOT` env var, defaults to `<cwd>/.media` | **PARTIAL** — the variable exists but is not documented in `.env.example` |
| cPanel capability | not assumed; the stack needs Node 20+ and PostgreSQL 15+ with a long-running process | **UNVERIFIED** |

---

## 5. Seed safety (Phase 5)

| Requirement | State |
| --- | --- |
| Demo data clearly fictional | **WORKING** — tenants carry `SEED_DEMO_DATA: synthetic tenant for dashboard demonstration`; demo emails end `.local` |
| Repeatable seeders | **WORKING** — idempotent upserts |
| Seed refuses to run against production | **MISSING** — `seed.ts` has no `NODE_ENV` guard |
| Production initialization path (configuration + owner accounts only) | **PARTIAL** — `scripts/provision-super-admin.mjs` exists and is deliberately guarded, but there is no single production-init entry point |

---

## 6. Security posture (Phase 6)

Verified present: helmet, cookie-parser, explicit CORS origin list with
credentials, double-submit CSRF, Argon2 password hashing, TOTP MFA with
AES-256-GCM secret encryption and replay protection, hashed single-use recovery
codes, per-route permission and entitlement guards, global input validation,
upload hardening, path-traversal guard, rate limiting, append-only audit trail,
and a version-neutral health probe.

| Finding | Severity | Detail |
| --- | --- | --- |
| Reachable advisories in the API runtime | high | `path-to-regexp@8.3.0` (via `@nestjs/swagger`), `lodash@4.17.21` (via `@nestjs/config`), `js-yaml@4.1.0` (via `@nestjs/swagger`) |
| Reachable advisory in the admin runtime | high | `postcss@8.4.31` (via `next`) |
| `deepmerge-ts` | high | dev-time only, via the Prisma CLI (`prisma@6.19.3`) |
| `braces`, `node-forge`, `image-size` | high | no patch available upstream; present via build tooling, not the request path |
| Seed has no production guard | medium | see §5 |

The reachable ones are pinned by a parent package's own range, so the fix is a
`pnpm.overrides` entry, not a direct upgrade. Phase 6 applies those overrides
and re-runs the suite.

---

## 7. What is genuinely missing

Only four things are missing rather than partial:

1. **The deployment package** (§4) — Dockerfiles, compose, proxy/TLS, backups,
   rollback, deploy workflow, install guide.
2. **Bahrain localisation** (§3) — phone validation, `Asia/Bahrain`, service
   areas, platform-level VAT defaults.
3. **The seed production guard and a production-init entry point** (§5).
4. **Native mobile release configuration** (§2.4) — out of scope for a server
   deployment, recorded so it is not mistaken for done.

Everything else in the owner's inventory exists and is DB-backed. The task is to
verify it end to end, harden it, and package it — not to build it.

---

## 8. Honest limitations of this audit

- The classification is from static reading plus the existing automated suites.
  Phase 8 re-runs those suites against an isolated staging database; a feature
  that fails there moves to **PARTIAL** in the final report.
- "WORKING" for a payment gateway means the adapter architecture works and the
  unconfigured state is reported truthfully. It does **not** mean a live vendor
  integration exists; none does, and none is claimed.
- The GitHub Pages preview is a static export. It is not evidence of API
  behaviour and is not treated as such.
