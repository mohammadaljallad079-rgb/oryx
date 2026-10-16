# ORYX — Live Preview Links and Demo Credentials

Audit date: 2026-10-16
Status: **LIVE and externally verified** from outside the sandbox.

This is an **isolated staging environment**: a separate PostgreSQL database
(`oryx_staging`) with seeded synthetic demo records. No production data and no
production secret is present.

## Hosts

| Host | Serves |
|---|---|
| `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev` | Super Admin control plane and every ERP module |
| `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev` | Customer website, customer dashboard and the mobile web preview |

Both hosts terminate TLS at the platform ingress and forward to the staging stack
(admin 3000, customer 3002, mobile-web 8081, API 3001) through nginx on ports
12000/12001. Each host proxies `/api` to the API, so the browser sees a single
same-origin API and the HttpOnly refresh cookie and CSRF double-submit both work.

## Preview links

Verified from outside the sandbox with `curl` on 2026-10-16:

| Sweep | Result |
|---|---|
| Admin / ERP / control-plane routes on host 1 | **31 / 31 returned 200**, 0 failed |
| Customer and mobile routes on host 2 | **15 / 15 returned 200**, 0 failed |
| API health on host 1 (`/api/health`) | **1 / 1 returned 200** |
| **Total** | **47 / 47 returned a success status** |

The API health check returns `{"status":"ok","database":"up"}`, and
`GET /customer/capabilities` without a token returns 401 — correct, it is an
authenticated route.

Every URL below returned **HTTP 200**.

### Host 1 — Super Admin and ERP

| # | Surface | URL |
|---|---|---|
| 1 | Super Admin login | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/login` |
| 2 | Super Admin dashboard | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/dashboard` |
| 3 | Companies and tenants | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/companies` |
| 4 | Module catalog | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/modules` |
| 5 | Plans | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/plans` |
| 6 | Subscriptions | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/subscriptions` |
| 7 | Roles and permissions | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/roles` |
| 8 | Audit log | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/audit` |
| 9 | Security / MFA | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/security` |
| 10 | Website management | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/website` |
| 11 | Application management | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/application` |
| 12 | Feature flags | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/application/flags` |
| 13 | App versions | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/application/versions` |
| 14 | API management | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/api-management` |
| 15 | External Integrations Center | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/integrations` |

### Host 1 — ERP modules (require an enterprise tenant selection)

Sign in as the enterprise admin, then open:

| # | Surface | URL |
|---|---|---|
| 16 | Financial accounting | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/accounting` |
| 17 | Sales / POS | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/sales` |
| 18 | Inventory / warehouses | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/inventory` |
| 19 | Procurement / purchasing | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/purchasing` |
| 20 | HR / payroll | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/hr` |
| 21 | CRM | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/crm` |
| 22 | Operations | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/operations` |
| 23 | Automotive inspections | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/automotive/inspections` |
| 24 | Workshop / maintenance | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/automotive/maintenance` |
| 25 | Spare parts | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/automotive/spare-parts` |
| 26 | Reports and analytics | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/reports` |
| 27 | Provider portal | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/providers` |
| 28 | Bookings | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/bookings` |
| 29 | Payments | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/payments` |
| 30 | Customer platform admin | `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/customer` |

### Host 2 — Customer website, dashboard and mobile

| # | Surface | URL |
|---|---|---|
| 31 | Customer website | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/` |
| 32 | Services | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/services` |
| 33 | Provider directory | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/providers` |
| 34 | Customer login | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/login` |
| 35 | Customer dashboard | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/dashboard` |
| 36 | Customer garage | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/garage` |
| 37 | Customer bookings | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/bookings` |
| 38 | Customer invoices | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/invoices` |
| 39 | Customer support | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/support` |
| 40 | Provider application | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/providers/apply` |
| 41 | Mobile web preview (login) | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/login` |
| 42 | Mobile web home | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/` |
| 43 | Mobile garage | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/garage` |
| 44 | Mobile bookings | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/bookings` |
| 45 | Mobile services | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/services` |
| 46 | Mobile account | `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/account` |

> The mobile preview is the **Expo web export** of the React Native app, served
> under `/mobile/`. It is the closest available preview of the Android/iOS app
> without a device or an emulator. Native builds are unchanged; the web export
> adds a `localStorage` session fallback and echoes the CSRF cookie so the preview
> is usable in a browser.
>
> **Capture note.** The customer session in the web export lives in memory, so a
> per-screen URL reload drops the access token and renders the login screen. The
> mobile screenshots in `docs/audit/branding/public/14*.png` are therefore taken
> by signing in once and then navigating with the app's own tab bar
> (`.run/capture-mobile.mjs`), which is the only way to see an authenticated
> screen. The five captures cover home, services, garage, bookings and account.

## Demo credentials

All demo data is synthetic and seeded by `packages/database/prisma/seed.ts`.
Passwords are development values from `.env.example`, not production secrets.

| Role | Email | Password | Sees |
|---|---|---|---|
| Super Admin (platform) | `superadmin@oryx.local` | `ChangeMe!Oryx2026` | Every platform governance surface and all ERP modules |
| Enterprise company admin | `admin@oryx-auto.local` | `ChangeMe!Oryx2026` | ORYX Auto Services (Enterprise plan) — accounting, sales, inventory, purchasing, HR, CRM, operations, automotive, inspections, workshop, spare parts |
| Demo SaaS tenant admin | `admin@demo-alnoor.local` | `ChangeMe!Oryx2026` | Al Noor Trading (Professional plan) — no automotive modules |
| Customer / consumer | `customer@oryx-demo.local` | `OryxDemo!2026` | Customer website, dashboard, garage, bookings, invoices, mobile web |

Notes:

- The admin UI defaults to **Arabic RTL**. Use the `EN` control in the header to
  switch to English; the preference is saved.
- MFA is **not** required for the seeded accounts on staging. If an account was
  left enrolled by a test run, `scripts/reset-seed-mfa.mjs` restores the baseline.
- The customer account is **not** created by the seed. It was registered through
  `POST /api/v1/customer/auth/register`. A database reset removes it; re-register
  it with a password of at least 10 characters.

## Environment facts

| Item | Value |
|---|---|
| Database | `oryx_staging` (PostgreSQL 17, local) |
| Seeded companies | 6 (2 marked `SEED_DEMO_DATA`, 4 internal) |
| Seeded branches | 10 |
| Seeded accounts | 126 |
| Payment credentials | **None.** All external gateways are `ADAPTER_ONLY` |
| Secrets in the preview | **None.** No production credential is present or committed |

## What is required for a production deployment

This is a staging preview, not a production deployment. A production deployment
would additionally need:

1. A managed PostgreSQL instance and a real domain with TLS.
2. The original approved dashboard photography. The official logo is now present
   (`docs/assets/logo.png.jpeg`, uploaded in `699560c`) and is used by both front
   ends, but the photographic tiles remain generated vector art (see
   `03_VISUAL_COMPARISON.md` and `08_VISUAL_IDENTITY_AND_PREVIEW_VERIFICATION.md`).
3. Production secrets supplied through the environment: `JWT_*` keys,
   `MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, and `MFA_REQUIRE_SUPER_ADMIN=true`.
4. Real gateway credentials if any external integration is to be enabled.
5. A deployment target. No production infrastructure or credentials were provided
   for this audit, so none was used; the preview runs on the sandbox's own
   ingress hosts.
