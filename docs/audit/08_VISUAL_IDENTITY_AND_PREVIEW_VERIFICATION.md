# ORYX — Visual Identity Alignment and Live Preview Verification

Audit date: 2026-10-16
Session: recovery of the interrupted audit conversation, then final visual
identity alignment and external preview verification.

## Why this report exists

The previous conversation crashed mid-task. On recovery the repository state was
re-checked against GitHub before any work continued, and the two owner
requirements that were still open were finished:

1. the **working HTTPS preview links** the owner needs in order to review the
   real platform, and
2. the **visual identity alignment** that was in progress when the session died.

## Repository state at recovery

| Item | Value |
|---|---|
| PR #5 (`feature/execution-05-platform-completion`) | **MERGED** 2026-10-16T18:10:37Z — merge commit `fc2ab20` |
| `main` head at recovery | `699560c` ("Add files via upload" — the official logo) |
| Execution 05 head | `7db9689` |
| Recovery branch | `audit/execution-05-verification` |
| Open PR | **#6** |

The task brief described PR #5 as open and unmerged. That is **not** the case:
PR #5 is merged, so it takes no further commits. The audit work therefore lands
on `audit/execution-05-verification` and PR #6, which is based on the same tree.
This is stated rather than silently worked around, because the brief's
instruction to "push to the existing Execution 05 branch and update PR #5" cannot
be executed against a merged pull request.

No reset, force-push or history rewrite was performed. Every commit from
Executions 01–05 is intact.

## Live preview — externally verified

Both hosts terminate TLS at the platform ingress and proxy `/api` to the API, so
the browser sees a single same-origin API and the HttpOnly refresh cookie and
CSRF double-submit both work.

| Host | Serves |
|---|---|
| `https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev` | Super Admin control plane and every ERP module |
| `https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev` | Customer website, customer dashboard, mobile web preview |

The route sweep in `.run/verify-preview.mjs` requests each URL over the public
HTTPS ingress — the same path a reviewer's browser takes, not localhost — and
reports the status and response size.

| Sweep | Result |
|---|---|
| Admin / ERP / control-plane routes on host 1 | **31 / 31 returned 200** |
| Customer and mobile routes on host 2 | **15 / 15 returned 200** |
| API health on host 1 (`/api/health`) | **1 / 1 returned 200** |
| **Total** | **47 / 47 returned a success status** |

### Demo credentials

All demo data is synthetic, seeded by `packages/database/prisma/seed.ts`. The
passwords are development values from `.env.example`, not production secrets.

| Role | Email | Password |
|---|---|---|
| Super Admin (platform) | `superadmin@oryx.local` | `ChangeMe!Oryx2026` |
| Enterprise company admin | `admin@oryx-auto.local` | `ChangeMe!Oryx2026` |
| Demo SaaS tenant admin | `admin@demo-alnoor.local` | `ChangeMe!Oryx2026` |
| Customer / consumer | `customer@oryx-demo.local` | `OryxDemo!2026` |

Both a staff login and a consumer login were executed against the **public**
hosts and returned `200` with a session, so the credentials above are verified,
not assumed.

## Screenshots of the live preview

`docs/audit/branding/public/` holds captures taken through the public HTTPS
ingress in a real headless Chromium. They are grouped by the fourteen preview
surfaces the owner asked to inspect.

| # | Preview surface | Screenshot | Role |
|---|---|---|---|
| 1 | Super Admin dashboard | `01-super-admin-dashboard.png` | Super Admin |
| 2 | Company ERP dashboard | `02-company-erp-dashboard.png` | Enterprise admin |
| 3 | Accounting | `03-accounting.png` | Enterprise admin |
| 4 | Sales / POS | `04-sales-pos.png` | Enterprise admin |
| 5 | Inventory | `05-inventory.png` | Enterprise admin |
| 6 | Procurement | `06-procurement.png` | Enterprise admin |
| 7 | HR / payroll | `07-hr-payroll.png` | Enterprise admin |
| 8 | CRM | `08-crm.png` | Enterprise admin |
| 9 | Automotive operations | `09-automotive-operations.png` | Enterprise admin |
| 10 | Workshop / maintenance | `10-workshop-maintenance.png` | Enterprise admin |
| 11 | Provider portal | `11-provider-portal.png` | Enterprise admin |
| 12 | Customer website + dashboard | `12a-…`, `12b-…` | Customer |
| 13 | External Integrations Center | `13-integrations-center.png` | Super Admin |
| 14 | Mobile app (Expo web export) | `14a…14e` | Customer |

The five mobile captures are taken at a 430 × 932 phone viewport, because the
Expo web export is a phone layout; a desktop viewport wastes most of the frame.
They are produced by signing in once and then navigating with the app's own tab
bar, because the customer session lives in memory and a per-screen URL reload
drops the token — the behaviour already recorded in the mobile gotchas in
`AGENTS.md`.

## Visual identity alignment

### Official assets now present

The owner uploaded the official artwork, so the "missing asset" blocker recorded
in earlier reports is resolved for the logo:

| Asset | Location | Notes |
|---|---|---|
| Official logo | `docs/assets/logo.png.jpeg` | 2000 × 2000 source frame, uploaded in `699560c` |
| Dashboard reference | `docs/assets/ORYX Auto Services Dashboard.png` | 1536 × 1024 dark-theme design reference |

### What was wrong

The admin sidebar, the admin login page and the customer site header each
rendered a **hand-drawn geometric monogram placeholder** — a diamond and circle
drawn in SVG — because the official logo was not in the repository. The
placeholder was honest about its status, but it is not the approved identity.

### What changed

| Change | File |
|---|---|
| Logo knock-out and colourways derived from the official asset | `apps/admin/public/brand/oryx-logo-on-{dark,light}.png` (1404 × 320, alpha) |
| Same assets for the customer app | `apps/customer/public/brand/` |
| Reusable theme-swapped lockup component | `apps/admin/src/components/brand-logo.tsx`, `apps/customer/src/components/brand-logo.tsx` |
| Placeholder replaced in the sidebar | `apps/admin/src/components/sidebar.tsx` |
| Placeholder replaced on the login page | `apps/admin/src/app/login/page.tsx` |
| Placeholder replaced in the customer header | `apps/customer/src/components/site-chrome.tsx` |
| Lockup styles | `apps/admin/src/app/globals.css`, `apps/customer/src/app/globals.css` |

The lockup is one raster image per colourway, stacked and swapped by
`data-theme`; the inactive one is hidden rather than unmounted so it is already
decoded when the theme changes.

### Verified rendering

`.run/probe-brand.mjs` reads the rendered element in a real browser. It reports
the natural size, the on-screen box, and the dominant ink colours, so an
inverted or unloaded image is visible in the output.

| App | Theme | Visible source | Natural | Box | Dominant ink |
|---|---|---|---|---|---|
| Admin | dark | `oryx-logo-on-dark.png` | 1404 × 320 | 167 × 38 | near-black background with navy ink |
| Admin | light | `oryx-logo-on-light.png` | 1404 × 320 | 167 × 38 | near-white background with navy ink |
| Customer | dark | `oryx-logo-on-dark.png` | 1404 × 320 | 132 × 30 | near-black background with navy ink |
| Customer | light | `oryx-logo-on-light.png` | 1404 × 320 | 132 × 30 | near-white background with navy ink |

Both apps therefore show the official lockup, and the colourway follows the
theme. The regression guard is `apps/admin/e2e/branding.spec.ts`.

### Defect fixed: RTL sidebar direction

The sidebar swapped sides **twice** under Arabic RTL, landing back on the left.
The cause was a redundant direction override in `apps/admin/src/app/globals.css`
on top of the `dir` attribute the UI provider already sets on `<html>`. Removing
the override restores a single swap. Verified: the sidebar sits at `x = 1268` in
Arabic RTL and `x = 0` in English LTR, and the `branding.spec.ts` direction test
guards it.

## Defect found and fixed during preview verification

### Preview logins failed from the public host (CORS)

**Symptom.** Signing in through the public HTTPS URL failed with
`Access to fetch at 'http://localhost:3001/api/v1/auth/login' … has been blocked
by CORS policy`. The login form stayed on `/login` and reported invalid
credentials.

**Cause.** The admin client bundle had `http://localhost:3001/api` baked into it
as the API base. The build had inherited an exported
`NEXT_PUBLIC_API_BASE_URL` from the shell environment used to run the test
harness. An exported process variable takes precedence over `.env.local` in
Next.js, so the value that reached the bundle was the localhost one even though
`.env.local` correctly said `/api`.

**Fix.** Rebuilt both front ends from a clean environment. `.env.local` already
contained the correct relative value (`NEXT_PUBLIC_API_BASE_URL=/api`), which
resolves same-origin through the reverse proxy, so no source change was needed —
the committed configuration was always right.

**Verification.** `grep -r 'http://localhost:3001' apps/*/.next/static/` returns
nothing after the rebuild, and both logins now succeed over the public host.

This is recorded because it is a **deployment hazard**, not just a local
accident: any build pipeline that exports `NEXT_PUBLIC_API_BASE_URL` will
silently override `.env.local` and ship a preview that cannot authenticate.

## Test results

| Suite | Result |
|---|---|
| `@oryx/shared` unit | **93 passed** (5 files) |
| `@oryx/mobile` unit | **20 passed** (3 files) |
| `@oryx/admin` browser, `branding.spec.ts` | **4 passed** |
| `@oryx/admin` browser, full suite | see `06_TEST_AND_CI_RESULTS.md` |

## Remaining blockers

| Blocker | Status |
|---|---|
| Official **light-theme** design reference | **Missing.** Only the dark-theme dashboard reference exists. The light theme is implemented to mirror the dark layout, but it is not verified against an approved light reference. |
| Full visual parity | **Not claimed.** The reference contains photographic tiles; the repository ships generated vector tile art because the approved photography is not in the repository. Palette and structure agree; pixel parity is not asserted. |
| Preview hosting | The preview runs on the sandbox ingress. There is no owner-controlled staging host or CI deployment target; the links live only as long as this sandbox does. |
| Production secrets | None are present, by design. Every external gateway is `ADAPTER_ONLY` and reports itself unconfigured. |

## How to reproduce

```bash
pnpm install
cp .env.example .env
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm --filter @oryx/shared build && pnpm --filter @oryx/database build
pnpm dev:api      # :3001
pnpm dev:admin    # :3000
pnpm dev:customer # :3002

node .run/verify-preview.mjs   # external route sweep
node .run/capture-public.mjs   # public-ingress screenshots (admin + customer)
node .run/capture-mobile.mjs   # mobile screenshots, via the app's own tab bar
node .run/probe-brand.mjs      # rendered brand lockup
node .run/gen-brand.cjs        # regenerate both apps' logo assets from the source
```

`pnpm -r lint` runs `eslint . --max-warnings=0`; `pnpm --filter @oryx/admin lint`,
`--filter @oryx/customer lint` and `--filter @oryx/mobile lint` all pass.
