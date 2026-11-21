# ORYX — Live Preview Links and Demo Credentials

Audit date: 2026-10-16. Re-verified 2026-10-17 after a sandbox recycle, again
2026-10-17 (evening) after the crash-recovery session, again 2026-10-18 for the
Execution 06 follow-up, with a browser-driven sweep over the public HTTPS
ingress.

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
(admin 3000, customer 3002, mobile-web 8081, API 3001) through the two preview
proxies on ports 12000/12001. Each host proxies `/api` to the API, so the browser
sees a single same-origin API and the HttpOnly refresh cookie and CSRF
double-submit both work. (nginx was used for this originally; it is no longer
part of the stack — the proxies serve the ingress ports directly.)

## Preview links

Verified from outside the sandbox with a real browser over public HTTPS, most
recently on 2026-10-18 after the Execution 06 follow-up. The sweep script is
`.run/sweep-preview.mjs`; its machine-readable output is
`docs/audit/evidence/exec06-preview-sweep.json` (the 2026-10-17 runs are kept
alongside it as `preview-sweep-2026-10-17*.json`).

The sweep does more than check a status code. It signs in, then visits each
surface and records every response `>= 400`, any Next.js error boundary and the
console errors, so a page that returns `200` while its data calls fail is
reported as failing.

| Sweep | Result |
|---|---|
| Anonymous surfaces (login, health, website, mobile) | **9 / 9 returned 200** |
| Super Admin sign-in and Enterprise tenant selection | **2 / 2 succeeded** |
| Admin / ERP / control-plane routes on host 1 | **18 / 18 returned 200, 0 failed requests** |
| Customer and mobile authenticated routes on host 2 | **10 / 10 returned 200, 0 failed requests** |
| **Total** | **39 / 39 succeeded, 0 failed, 0 failed requests** |

The API health check returns
`{"status":"ok","service":"oryx-api","version":"0.1.0","database":"up"}`.

### Super Admin full access — re-verified after the seed fix

The 2026-10-17 (third) recovery session found the Super Admin resolving only the
18 PLATFORM-scope permissions because a non-idempotent seed had duplicated the
platform role (defect 16 in `04_FIXED_DEFECTS.md`). After the fix the same
browser-independent probes over public HTTPS report:

| Probe | Before | After |
|---|---|---|
| `superadmin@oryx.local` `/auth/context` with a company selected | `18` | **153** |
| `GET /api/v1/accounting/accounts` (Enterprise tenant) | `403` | **200**, 21 rows |
| `GET /api/v1/sales/customers` | `403` | **200** |
| `GET /api/v1/inventory/products` | `403` | **200** |
| `GET /api/v1/hr/employees` | `403` | **200** |
| `GET /api/v1/crm/leads` | `403` | **200** |
| `GET /api/v1/modules` | `403` | **200**, 21 modules |

Scripts: `.run/live-login-https.mjs` and `.run/verify-super-admin-erp.mjs`. The
fresh sweep after the fix is
`docs/audit/evidence/preview-sweep-2026-10-17-super-admin-fix.json` (39/39, 0
failed requests).

**A platform administrator must select a company before the ERP modules serve
data.** With no tenant selected, `GET /api/v1/accounting/accounts` and its peers
correctly return `403`; the modules render their empty state. This is the
enforced tenant boundary, not a defect — the header company selector (or an
explicit support session) is what supplies the context, and the sweep selects the
Enterprise tenant before it visits the ERP surfaces.

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
| Companies | 42 at the last check — the seed creates 6; the rest are E2E fixtures that the browser suite provisions |
| Branches | 25 |
| Users | 14 |
| Payment credentials | **None.** All external gateways are `ADAPTER_ONLY` |
| Secrets in the preview | **None.** No production credential is present or committed |

The company count is deliberately not pinned to the seeded value: the browser
suite provisions tenants and does not roll them all back, so the staging database
carries test fixtures alongside the demo records. That is expected for a staging
preview and is why `04_FIXED_DEFECTS.md` lists the company list as paginated.

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
