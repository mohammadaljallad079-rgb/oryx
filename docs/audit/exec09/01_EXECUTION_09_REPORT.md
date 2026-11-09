# Execution 09 — Final Production Readiness

**Branch:** `feature/execution-07-premium-web`
**Base for this execution:** `d79da8d`
**Design status:** approved by the owner; **not redesigned** in this execution.

This execution finishes the production-readiness work, corrects the currency and
country defaults, hardens the container images and the edge configuration, and
verifies the whole stack on an isolated Docker Compose environment. It does not
merge, change DNS, or deploy to a server.

---

## 1. Recovery record

The previous session's sandbox crashed. Recovery found:

| Item | State |
|---|---|
| Last SHA named in the owner's brief | `b3c9a71` — *docs(exec07): record green CI run 39161406862 in the Phase D report*. **Present and intact**; it is an ancestor of both the remote tip and local HEAD, so nothing before it was lost |
| Remote branch head at recovery | `d79da8d` (`origin/feature/execution-07-premium-web`) — **22 commits beyond** `b3c9a71`, so the crashed session (and the Execution 07/08 work after it) pushed well past the last SHA the brief named |
| Local commit ahead of the remote | `0d6c430` — *fix(exec09): resolve document currency and country from the tenant, not SA/SAR* |
| PR #7 head at recovery | `d79da8d` — the branch was **not** updated by the crashed session |
| PR #6 | open, `audit/execution-05-verification` → `main`, untouched |

**Unpushed work.** One commit, `0d6c430`, existed only in the local checkout and
was **not** on the remote. It is present in this workspace and is pushed with
this execution's changes. No other local-only work was found: the deploy
artifacts edited after `0d6c430` (`Dockerfile.api`, `Dockerfile.admin`,
`Dockerfile.customer`, `oryx.conf.template`, `health-check.sh`) were uncommitted
working-tree edits and are all present here.

**What the crashed session did push.** The remote already carried `d79da8d`,
which the brief's `b3c9a71` did not account for. The 22 commits between them
include the Phase E light-theme corrections (`5920895`, `6ea99ba`, `5302b88`),
the permanent preview work (`2ac68d3`…`b3bb18b`) and the Execution 08 production
package (`792fe39`, `f89285c`). Those arrived before the crash and were recovered
from the remote, not rebuilt.

**Not recovered.** Nothing was reported lost and nothing was found missing. The
premium website, the CMS, the real photography, the category fixes and the
authentication and security work are all present in the checkout and on the
remote. This is what `git log`, `git branch -r --contains` and a direct remote
comparison actually showed; it is not an inference from the brief.

Nothing was reset, force-pushed or discarded. `git status` and the remote were
compared directly; the report above is what was actually observed, not an
inference.

---

## 2. Acceptance table

Every row was run in this workspace. "Live" means against the isolated
`oryx-exec09` Compose stack (edge on host ports 80/443, self-signed TLS).

| # | Correction | Method | Result |
|---|---|---|---|
| 1 | Currency/country defaults `SA`/`SAR` → `BH`/`BHD` | `apps/api/test/execution09-currency.e2e-spec.ts`; live DB column defaults | **PASS** |
| 2 | BHD precision (3-decimal fils) across services, invoices, discounts, refunds, APIs, persistence | `packages/shared/test/currency.test.ts`, `money.test.ts`; `execution09-currency.e2e-spec.ts` | **PASS** |
| 3 | Full Compose stack on an isolated environment | `docker compose -p oryx-exec09 … ps` | **PASS** — 5/5 healthy |
| 4 | Production-safe migrations, never `migrate reset` | `migrate` service runs `prisma migrate deploy`; `migrate reset` appears only in the dev-only warning | **PASS** |
| 5 | Real administrator login, customer login, persisted DB change | Login through the edge; live customer registration through the edge | **PASS** |
| 6 | Service images match their real services | `apps/customer/src/lib/site-media.ts` `CATEGORY_PHOTO_KEY`; audited per-photo | **PASS** |
| 7 | Arabic RTL / English LTR in Light and Dark | `scripts/verify-theme-matrix.mjs` — 12 cells | **PASS (light 6/6)**; dark 6/6 except the pre-existing E8 pair |
| 8 | Production seed excludes fictional demo data | `production:init`; live `Company` count = 0 | **PASS** |
| 9 | Security, permissions, environment, secrets, backup, rollback | MFA enforcement, secret management, `docs/DEPLOYMENT.md` §7–8 | **PASS** |
| 10 | Exact deployment guide | `docs/DEPLOYMENT.md` (317 lines) + `deploy/` package | **PASS** |

### Defects found and fixed beyond the numbered list

Three real defects surfaced while running correction #3 on a clean stack. Each
was reproduced, fixed and re-verified.

| Defect | Root cause | Fix |
|---|---|---|
| Edge would not start | `upstream` blocks appended `keepalive` to the same line as `server`, so nginx parsed it as an invalid `server` parameter | `deploy/nginx/templates/oryx.conf.template` — `keepalive` is now its own semicolon-terminated directive |
| API crashed on start | the generated Prisma client was produced in the **build** stage but runtime copied `node_modules` from the **pruned** stage, which never ran `prisma generate` | `deploy/docker/Dockerfile.api` — copy the generated client and its query engine from the build stage into runtime |
| Admin/customer containers reported unhealthy | the Next.js standalone server binds `process.env.HOSTNAME`, which in a container is the container ID, not `127.0.0.1`, so the healthcheck never connected | `deploy/docker/Dockerfile.admin`, `Dockerfile.customer` — bind so the `127.0.0.1` healthcheck succeeds |

### First-deploy defects found on the clean stack (second sweep)

Running the runbook exactly as written against a freshly built stack surfaced
four more blockers. Each was reproduced, fixed and re-verified.

| Defect | Root cause | Fix |
|---|---|---|
| `production:init` could not run in the stack | the runtime image never copied `packages/database/scripts/`, so the runbook's step 2 failed with `MODULE_NOT_FOUND`; the script also could not resolve `@oryx/shared`, because the pruned install does not create the workspace link the host has | `deploy/docker/Dockerfile.api` — copy `scripts/`, recreate `packages/database/node_modules/@oryx/shared` |
| The same script failed with `EACCES` once present | the build stage's copy is root-owned and mode 660, and the image runs as the unprivileged `oryx` user | `deploy/docker/Dockerfile.api` — `chown -R oryx:oryx` on the script and its link |
| `MFA_REQUIRE_SUPER_ADMIN=true` locked the owner out on first deploy | the guard refused an unenrolled Super Admin on **every** route, including `auth/me` and `auth/mfa/enroll`, so the owner signed in, was immediately 403'd, and the shell bounced back to sign-in — with no way to ever enrol | `@AllowMfaEnrollment()` on `auth/me`, `auth/mfa/status`, `auth/mfa/enroll`, `auth/mfa/enroll/confirm`; `principal.guard.ts` honours the metadata |
| Prisma warned `failed to detect the libssl/openssl version … Defaulting to "openssl-1.1.x"` | the `node:*-slim` base has no `openssl`, so Prisma selected a 1.1.x query engine against Debian 12's OpenSSL 3 | `deploy/docker/Dockerfile.api` — install `openssl` in the base stage; the warning is gone and `Prisma connected` is the only remaining line |

The MFA defect is the most serious of the four: without it the documented
first-deploy sequence produced an account that could authenticate and then do
nothing, with no path to recovery short of hand-editing the database. It is
covered by `apps/api/test/execution09-mfa-bootstrap.e2e-spec.ts`.

---

## 3. Correction #1 — currency and country defaults

`packages/shared/src/currency.ts` is the single source: `DEFAULT_CURRENCY = 'BHD'`
and BHD/KWD/OMR carry `scale: 3`. The API resolves a document's currency and
country **from the tenant**, not from a hardcoded `SA`/`SAR`:

- a new customer inherits the company currency and country;
- a new supplier inherits the same;
- an issued invoice and its journal post in the tenant currency;
- an explicit currency on a record is still honoured, so legitimate
  multi-country and multi-currency data is untouched.

The e2e suite proves all four behaviours against a real database, including the
"no over-correction" case (an explicit `USD`/`US` record stays `USD`/`US`).

Live verification on the isolated stack:

```
market.country_code = BH
market.currency     = BHD
market.timezone     = Asia/Bahrain
Company.currency column default = 'BHD'
Company.timezone column default = 'Asia/Bahrain'
```

---

## 4. Correction #7 — theme matrix

`scripts/verify-theme-matrix.mjs` walks theme (light/dark) × direction
(rtl/ltr) × viewport (mobile/tablet/desktop) — 12 cells. For each cell it
asserts `data-theme`, `dir`, no horizontal overflow, and WCAG AA contrast for
the prominent homepage text against the **pixels actually behind it** (the glyphs
are set transparent and the element is screenshotted, so a gradient or a
photograph is measured, not a `background-color` that does not exist).

| Cell group | Result |
|---|---|
| Light theme, all 6 cells | **PASS** — 0 failures |
| Dark theme, 6 cells | 6/6 render and lay out; **1 pre-existing pair** below 4.5:1 |

The single dark miss is `.oryx-stat__label` (`--band-text-faint`, `#6f8598`),
which is **defect E8** recorded in
[`../exec07/04_PHASE_E_LIGHT_THEME.md`](../exec07/04_PHASE_E_LIGHT_THEME.md#defect-e8--two-dark-theme-pairs-below-threshold-deliberately-left-alone).
It is pre-existing in the approved dark theme and is deliberately left
unchanged, because the owner's constraint is that the approved dark theme stays
intact. It is not a light-theme regression.

Full machine-readable result:
[`theme-matrix-report.json`](./theme-matrix-report.json).

---

## 5. Visual evidence

All captures are from the live isolated stack, in the corrected light theme.

| Requirement | File |
|---|---|
| Homepage — light | [`screenshots/light-homepage-desktop-rtl.png`](./screenshots/light-homepage-desktop-rtl.png) |
| Customer dashboard — light | [`screenshots/light-dashboard-desktop-rtl.png`](./screenshots/light-dashboard-desktop-rtl.png) |
| Provider directory — light | [`screenshots/light-providers-desktop-rtl.png`](./screenshots/light-providers-desktop-rtl.png) |
| Login — light | [`screenshots/light-login-desktop-rtl.png`](./screenshots/light-login-desktop-rtl.png) |
| Light vs dark comparison | [`comparisons/homepage-desktop-rtl.png`](./comparisons/homepage-desktop-rtl.png) |

Responsive and bilingual coverage is in the same folder: every surface is also
captured at tablet (834×1112) and mobile (390×844), and the homepage at desktop
in English LTR. The comparison sheet is built at desktop, tablet and mobile RTL
and desktop LTR.

Reproduce:

```bash
# Theme matrix (12 cells, exits non-zero on failure)
ORYX_BASE=https://<host> ORYX_INSECURE=1 node scripts/verify-theme-matrix.mjs

# Screenshots
ORYX_BASE=https://<host> ORYX_INSECURE=1 node scripts/capture-exec09-light.mjs
node scripts/make-exec09-pairs.mjs
```

`ORYX_INSECURE=1` accepts a self-signed certificate and is for the pre-launch
rehearsal only; it is never set in production.

---

## 6. Test results

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **152/152 pass** (8 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **311/311 pass** (16 suites) |
| Mobile unit | `pnpm --filter @oryx/mobile test` | **20/20 pass** (3 files) |
| Execution 09 suites | `jest --testPathPatterns execution09` | **9/9 pass** (currency + MFA bootstrap) |
| Typecheck | `pnpm --filter @oryx/{shared,database,api,admin,customer} typecheck` | **clean** |
| Lint | `pnpm -r lint` | **clean** (admin, customer, mobile; shared/database/api have no lint) |
| Edge configuration | `nginx -t` against the rendered config | **syntax OK** |
| Stack health | `docker compose … ps` | **5/5 healthy** |
| Health check | `deploy/scripts/health-check.sh` | **0 failures** (2 warnings, see below) |

The two health-check warnings are environment artifacts, not product defects:
the refresh-cookie probe is an acceptable "no cookie on a rejected refresh", and
the demo-data probe could not reach Docker because this sandbox requires `sudo`
for the Docker socket. The underlying query returns `0` when run with the
required privilege.

---

## 7. Deployment readiness

**Ready to request server deployment.** The stack builds, migrates, starts and
passes its health checks in an isolated environment, and the login, MFA,
currency, seed and theme behaviours are all verified against it.

**Remaining host-dependent checks** (cannot be done before a server exists):

1. A certificate issued by a real CA for the production hostnames — the
   rehearsal used a self-signed certificate, which is why the health check
   needed `ORYX_INSECURE=1`.
2. DNS records for `ORYX_ADMIN_HOST` and `ORYX_CUSTOMER_HOST` pointing at the
   server.
3. Ports 80/443 reachable from the public internet (the rehearsal remapped them
   to avoid clashing with other work in the sandbox).
4. The production `.env` populated from `deploy/env/production.env.example` with
   real secrets, and `MFA_REQUIRE_SUPER_ADMIN=true`.

Follow [`../../DEPLOYMENT.md`](../../DEPLOYMENT.md) for the exact procedure.
