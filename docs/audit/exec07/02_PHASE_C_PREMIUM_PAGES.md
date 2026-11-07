# Execution 07 — Phase C: Premium design across every customer page

Report date: 2026-10-18
Branch: `feature/execution-07-premium-web` (PR #7)
Base head at the start of this session: `eabe345`
Status: **Phase C complete; owner review pending**

This phase closes blocker 3 of the Execution 07 report, which recorded that the
visual system had been applied only to the homepage, services, dashboard,
navigation and footer, leaving the remaining customer pages on the
pre-Execution-07 presentation. Every customer page is now built on the same
premium primitives, with no business logic changed.

## 1. What changed

### 1.1 New shared primitives

`apps/customer/src/components/premium.tsx` (new file, untracked before this
session) exports the page furniture the whole customer app now shares:

| Export | Purpose |
|---|---|
| `PageHeader` | Eyebrow, title, subtitle, optional art, optional back link and actions |
| `StatePanel` | The four states — loading, empty, error, success — in one component |
| `LoadingPanel` | Skeleton rows for a first load, instead of a bare spinner |
| `TableWrap` | Horizontal-scroll wrapper so a wide table never overflows the page |
| `Toolbar` | Filter and action row above a list |
| `AuthShell` | Centred frame shared by sign-in, registration and password recovery |
| `StatCard` | KPI tile |

`AuthShell` was added in this session so the four unauthenticated screens read
as one deliberate entry point rather than four unrelated forms.

### 1.2 Pages recreated or upgraded

| Page | Route | Change |
|---|---|---|
| Invoices | `/invoices` | Recreated on `PageHeader` + summary grid + `StatePanel` |
| Bookings | `/bookings` | Recreated; `booking.bookingType` column preserved |
| Notifications | `/notifications` | Upgraded; local `formatWhen` replaced with shared `formatDate` |
| Support | `/support` | Upgraded to `PageHeader` + `StatePanel` |
| Profile | `/profile` | Upgraded to `PageHeader` + `StatePanel` |
| Provider detail | `/providers/[id]` | Upgraded; opening hours and rating blocks |
| Provider directory | `/providers` | Upgraded: header, `Toolbar` filter, provider cards with monogram, `StatePanel` empty state |
| Provider application | `/providers/apply` | Upgraded: `AuthShell`-style header, selectable category tiles, success `StatePanel` |
| Sign in | `/login` | Upgraded to `AuthShell` |
| Register | `/register` | Upgraded to `AuthShell` |
| Forgot password | `/forgot-password` | Upgraded to `AuthShell` + success `StatePanel` |
| Reset password | `/reset-password` | Upgraded to `AuthShell` + invalid-link and success `StatePanel` |

### 1.3 Internationalisation

New keys were added to **both** the `ar` and `en` dictionaries in
`apps/customer/src/i18n/dictionaries.ts`:

- `providers.noneHint`, `providers.unavailable`
- `apply.receivedTitle`
- `auth.loginSubtitle`, `auth.registerSubtitle`, `auth.forgotSubtitle`,
  `auth.resetSentTitle`, `auth.resetTitle`, `auth.resetSubtitle`,
  `auth.resetInvalid`, `auth.resetInvalidHint`, `auth.resetDoneTitle`,
  `auth.resetDone`
- (from the earlier part of this session) `garage.*`, `invoices.*`,
  `bookings.*`, `support.*`, `notifications.*`, `profile.*`, `addresses.*`,
  `providers.*`, `common.saving`, `common.refresh`

No key is present in one dictionary and missing from the other.

### 1.4 Styles

`apps/customer/src/app/globals.css` gained the Phase C blocks: the auth shell
(`.oryx-auth*`), the selectable choice tiles (`.oryx-choice*`) and
`.oryx-container--narrow`. Existing classes for the earlier-upgraded pages
(`.oryx-page-head`, `.oryx-state`, `.oryx-table-wrap`, `.oryx-toolbar`,
`.oryx-invoice-summary`, `.oryx-notice`, `.oryx-provider-*`, `.oryx-hours`)
were already present and are reused rather than duplicated.

## 2. Verification

### 2.1 Build, typecheck and lint

| Check | Command | Result |
|---|---|---|
| Build | `pnpm --filter @oryx/customer build` | clean, 16 routes emitted |
| Typecheck | `pnpm --filter @oryx/customer typecheck` | clean |
| Lint | `pnpm --filter @oryx/customer lint` | clean (`--max-warnings=0`) |

### 2.2 Live render verification

`.run/verify-phase-c.mjs` signs in as the demo customer over the public HTTPS
preview and asserts that each page renders its premium structure, then checks
AR/RTL and the light theme on a public route.

```
13 routes checked; 0 failed

rtl:   { "dir": "rtl", "lang": "ar", "title": "دليل مزودي الخدمة" }
theme: { "theme": "light", "bg": "rgb(245, 246, 248)" }
```

Every route returned HTTP 200 with zero horizontal overflow. Authenticated
routes rendered real database content or a designed `StatePanel`, never a blank
panel.

### 2.3 Screenshot matrix

`.run/capture-phase-c.mjs after` captured every route at three widths and both
locales:

```
78 captures; 0 with a status>=400 or overflow
```

Artifacts: `docs/audit/exec07/phase-c/after/` (39 PNGs) plus `manifest.json`.
A browsable index is served at
`https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/evidence/exec07-phase-c/index.html`.

### 2.4 Full test suite

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | 96 / 96 passed |
| API integration | `pnpm --filter @oryx/api test:e2e` | 278 / 278 passed, 13 suites |
| Browser (Playwright) | `pnpm --filter @oryx/admin test:ui` | 184 passed, 1 skipped |
| Mobile unit | `pnpm --filter @oryx/mobile test` | 20 / 20 passed |

**578 automated tests, all green.**

### 2.5 External preview sweep

`.run/sweep-preview.mjs` — every preview URL checked from outside the sandbox
over public HTTPS:

```
checked: 39
success: 39
failed:  0
```

The single console error is the expected anonymous bootstrap `401` on
`/api/v1/auth/refresh`, which the client treats as "no session".

### 2.6 CI

Run [`39153101776`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39153101776)
on head `1b9343f` — **success**, all three jobs green:

| Job | Result |
|---|---|
| Typecheck and build | success |
| Unit and API integration tests | success |
| Browser acceptance tests | success |

## 3. Environment findings (not product defects)

Two failures in this session came from how the suite was invoked, not from the
application. Both are recorded so the next run does not repeat them.

1. **Playwright's global setup needs the environment.** `pnpm --filter
   @oryx/admin test:ui` run bare exits at `global-setup.ts` with *"Refusing to
   reset MFA: DATABASE_URL does not look like a development or test
   database"*, because the MFA guard never sees `.env`. Source it first:
   `set -a && . ./.env && set +a`.

2. **The admin suite must run through the proxy, not the app port.** The admin
   bundle is built with `NEXT_PUBLIC_API_BASE_URL=/api`, a same-origin relative
   path. Playwright's default `baseURL` is `http://localhost:3000`, which is the
   Next.js server alone and has no `/api` route, so every login 404s and the
   suite times out. Point it at the proxy:
   `ORYX_ADMIN_URL=http://localhost:12000`. The `/api` route on 3000 is not a
   product path; the deployed topology is the proxy on 12000.

Neither is a regression: the same configuration produced the green run recorded
in the Execution 07 report.

## 4. Live preview links

Staging only. Separate staging database (`oryx_staging`) with synthetic demo
records. No production data and no real credentials are exposed.

### Staff control plane — https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev

| # | Surface | Path |
|---|---|---|
| 1 | Super Admin dashboard | `/dashboard` |
| 2 | Company ERP dashboard | `/dashboard` (select ORYX Auto Services) |
| 3 | Accounting | `/accounting` |
| 4 | Sales / POS | `/sales` |
| 5 | Inventory | `/inventory` |
| 6 | Procurement | `/purchasing` |
| 7 | HR / payroll | `/hr` |
| 8 | CRM | `/crm` |
| 9 | Automotive operations | `/operations` |
| 10 | Inspections | `/automotive/inspections` |
| 11 | Workshop | `/automotive/maintenance` |
| 12 | Spare parts | `/automotive/spare-parts` |
| 13 | Provider portal | `/providers` |
| 14 | Bookings | `/bookings` |
| 15 | Payments | `/payments` |
| 16 | External Integrations Center | `/integrations` |
| 17 | Reports | `/reports` |
| 18 | Customer platform admin | `/customer` |

### Customer website — https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev

| # | Surface | Path |
|---|---|---|
| 19 | Customer website (home) | `/` |
| 20 | Service categories | `/services` |
| 21 | Provider directory | `/providers` |
| 22 | Provider application | `/providers/apply` |
| 23 | Customer dashboard | `/dashboard` |
| 24 | My garage | `/garage` |
| 25 | Bookings | `/bookings` |
| 26 | Invoices & payments | `/invoices` |
| 27 | Support | `/support` |
| 28 | Notifications | `/notifications` |
| 29 | Profile & addresses | `/profile` |

### Mobile web export — https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev

| # | Surface | Path |
|---|---|---|
| 30 | Mobile login | `/mobile/login` |
| 31 | Mobile home | `/mobile/` |
| 32 | Mobile garage | `/mobile/garage` |
| 33 | Mobile bookings | `/mobile/bookings` |
| 34 | Mobile services | `/mobile/services` |
| 35 | Mobile account | `/mobile/account` |

### Design evidence

| Artifact | URL |
|---|---|
| Phase C screenshot index | `/evidence/exec07-phase-c/index.html` |

### Demo credentials

These are the seeded demo accounts, documented in the repository and already
published in the Execution 06 audit. They are not production credentials.

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@oryx.local` | `ChangeMe!Oryx2026` |
| Enterprise tenant admin (licenses automotive) | `admin@oryx-auto.local` | `ChangeMe!Oryx2026` |
| Professional tenant admin | `admin@demo-alnoor.local` | `ChangeMe!Oryx2026` |
| Customer | `customer@oryx-demo.local` | `OryxDemo!2026` |

Automotive surfaces (inspections, workshop, spare parts) are licensed to the
Enterprise plan, so use `admin@oryx-auto.local` for those.

## 5. Visual comparison against the approved reference

The only approved design reference in the repository is
`docs/assets/ORYX Auto Services Dashboard.png`, a dark-theme **admin** dashboard.
The Phase C work is on the **customer** website, for which no approved mockup
exists.

- For the admin dashboard, the navy/gold palette, KPI rhythm and card structure
  match the reference's approach.
- For the customer website, the pages use the same navy/gold tokens and the same
  card/typography system, but there is no approved customer reference to compare
  against.

**Full visual parity is not claimed.** It cannot be assessed for the customer
site until an approved customer-site reference exists. The official logo is
present (`docs/assets/logo.png.jpeg`) and is the source for both colourways.

## 6. Remaining blockers

1. **No approved customer-site design reference.** Unchanged from the Execution
   07 report. Parity for the customer website cannot be assessed.
2. **No native iOS/Android build preview.** The Expo app is verified through its
   web export (`/mobile/*`). A device or EAS build is unavailable in this
   environment.
3. **The staging environment is ephemeral.** The sandbox that serves the preview
   links above can be recycled; `.run/start-stack.sh` brings the stack back from
   a cold sandbox without re-seeding.

## 7. Reproduction

```bash
# Build, typecheck, lint
pnpm --filter @oryx/customer build
pnpm --filter @oryx/customer typecheck
pnpm --filter @oryx/customer lint

# Live render assertions (needs the staging stack running)
node .run/verify-phase-c.mjs

# Screenshot matrix + browsable index
node .run/capture-phase-c.mjs after
node .run/build-evidence-index.mjs

# Full suites
pnpm --filter @oryx/shared test
pnpm --filter @oryx/api test:e2e

# Browser suite — source the env and use the proxy origin
set -a && . ./.env && set +a
export AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000
export ORYX_ADMIN_URL=http://localhost:12000
pnpm --filter @oryx/admin test:ui

# External preview sweep
node .run/sweep-preview.mjs
```
