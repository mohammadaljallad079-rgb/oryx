# ORYX — Execution 08 Report

**Complete Platform, Production Readiness & Server Deployment Package**

Branch: `feature/execution-07-premium-web` · PR: [#7](https://github.com/mohammadaljallad079-rgb/oryx/pull/7)

This report is written after the crash of the previous sandbox, so it opens with
what was recovered and what was not. It does not claim a recovery that did not
happen.

---

## 1. Recovery

| Question | Answer |
| --- | --- |
| Last commit the owner knew about | `b3c9a71` — *docs(exec07): record green CI run 39161406862 in the Phase D report* |
| Did the crashed session push beyond it? | **Yes.** The remote branch tip is **`488e637`**, 17 commits ahead of `b3c9a71` |
| Was anything pushed and then lost? | **No.** Local `HEAD` and the remote branch tip are the same commit. `git log origin/…..HEAD` is empty |
| Is `b3c9a71` on the remote? | It is an **ancestor of the pushed tip** (17 commits behind it), so its content is present. It is not a branch tip itself |
| Uncommitted work in the tree | Execution 08 Phases 1, 4, 5, 6 and 9 — recovered and committed in this session (below) |
| Stashes | none |
| Stale artifacts found | four dangling commits from interrupted sessions; all are **older** than the pushed tip and were left untouched |

The four dangling commits (`339672c`, `ae003d7`, `7aed52c`, `50946c9`) are
recovery snapshots and `stash`-style commits created by earlier interrupted
sessions. They were compared against the current tip and are **stale**: their
`globals.css` predates the finished light-theme correction (it still carries the
superseded `12.5px`/`13px` override that `5302b88` later removed), and their
captures differ from the signed-off evidence only by PNG recompression. Nothing
unique was lost, so nothing was restored from them — restoring them would have
regressed the light theme.

**The premium website, CMS, real photography, category fixes, authentication and
security improvements are all present on the branch and were not touched.**

## 2. What this session added

The working tree held finished but uncommitted Execution 08 work. It was
verified, one consistency defect was fixed, and it was committed in three
grouped commits.

### 2.1 Bahrain market configuration (Phase 4)

- `packages/shared/src/bahrain.ts` declares the launch market once — country,
  currency, timezone, VAT and twelve administrative service areas in Arabic and
  English. The API, the seed, the bootstrap and the website read the same
  declaration.
- `ServiceArea` is a platform catalogue table, deliberately **without**
  `companyId`: every tenant in the launch market shares the same administrative
  areas, and a tenant narrows coverage through its own branches.
- Platform settings are served by a new `PlatformModule` behind
  `platform.settings.read` / `platform.settings.manage`. Both permissions are
  non-delegable, so a company administrator can never grant them.
- Currency, timezone and country defaults move from Saudi to Bahrain
  (`BHD`, `Asia/Bahrain`, `BH`). The migration alters **column defaults only**;
  existing rows keep their values.
- `IsBahrainPhone` / `NormaliseBahrainPhone` accept a Bahraini mobile number and
  store canonical E.164. The accepted forms and rejection reasons live in
  `bahrain.ts`, so the API and the site cannot disagree.

**Defect fixed this session:** `organizations.service.ts` had been part-migrated
— currency and timezone defaulted to Bahrain while `countryCode` still defaulted
to `'SA'`. A newly provisioned company would have been created with a Bahraini
currency in Saudi Arabia. The country default now reads `DEFAULT_COUNTRY_CODE`.

### 2.2 Shared plan catalogue

`PLANS` moved from the seed into `packages/shared/src/plans.ts`, so the
development seed and the production bootstrap cannot disagree about a plan.
Enterprise resolves its modules from `MODULES`. Module counts are unchanged:
**8 / 16 / 21**.

### 2.3 Production bootstrap (Phase 5)

`packages/database/scripts/production-init.mjs` initialises a production
database with the catalogue and exactly one Super Admin. It writes no tenants,
staff, CMS content or demo data. It requires `--authorize`, refuses a
development database unless `--allow-dev-database` is given, and leaves an
existing password alone unless `--rotate-password` is passed. Wired as
`pnpm production:init`.

### 2.4 Deployment package (Phase 9)

`deploy/` holds three multi-stage Dockerfiles, a production compose file, an
nginx TLS/proxy configuration, backup / restore / deploy / health-check scripts,
and a production env template. `.github/workflows/deploy.yml` deploys a chosen
tag over SSH and is **manual only**.

Design points that matter:

- Only nginx publishes ports; the API, admin and customer containers are on an
  internal network.
- The API is proxied under `/api/` on **every** host, so the browser sees a
  same-origin API. That keeps the HttpOnly refresh cookie first-party and the
  CSRF double-submit check meaningful without widening CORS.
- `deploy.sh` never reverses a migration. It restores the previous images and
  stops, because guessing a down migration is worse than stopping.
- `backup.sh` verifies the dump with `pg_restore --list` before declaring
  success.

### 2.5 Dependency hardening (Phase 6)

`pnpm.overrides` pins `lodash`, `path-to-regexp`, `js-yaml`, `postcss` and
`deepmerge-ts` past their reachable advisories. Each is held by a parent
package's own range, so an override is the fix rather than a direct upgrade.

## 3. Light theme

The owner's last request — *"the Light Theme colors still look inconsistent and
need professional correction"* — was completed before the crash and is on the
branch at `6ea99ba` and `5302b88`. It is **not** re-done here.

The correction is centralised in `apps/customer/src/app/globals.css`: a
`[data-theme='light']` token block sets the ivory field (`#f7f4ed`), white and
warm-neutral surfaces, deep charcoal type and metallic gold accents, and the
components read those tokens. The dark theme block is untouched, and every
light-only override is scoped so the approved dark render cannot move.

Verified against the signed-off Execution 07 evidence by pixel sampling: the
ivory field, the white surface and the navy hero band are **identical** between
the new captures and `docs/audit/exec07/phase-e/after/`.

## 4. Preview evidence

Captured from the live GitHub Pages preview
(`https://mohammadaljallad079-rgb.github.io/oryx/`), not from a local build, so
the images show what a visitor receives.

| Surface | Viewports | Locales | Themes | Captures |
| --- | --- | --- | --- | --- |
| Homepage | mobile 390, tablet 768, desktop 1440 | ar, en | light, dark | 12 |
| Customer dashboard | mobile, tablet, desktop | ar, en | light, dark | 12 |
| Provider directory | mobile, tablet, desktop | ar, en | light, dark | 12 |
| Login | mobile, tablet, desktop | ar, en | light, dark | 12 |

`docs/execution-reports/exec08-preview/` holds the 48 captures;
`comparisons/` holds 24 light-vs-dark sheets (light on the left, dark on the
right). Arabic is captured RTL, English LTR.

**Note on the preview.** It is a static export, so it is read-only by design: it
proves the markup, the tokens, the typography, the photography and the RTL/LTR
layout. It is **not** evidence of API behaviour and is not presented as such.

## 5. Verification

| Check | Result |
| --- | --- |
| `pnpm db:seed` | pass — modules 21, plans 3, service areas 12 |
| `prisma migrate diff` (migrations vs schema) | **no drift** |
| `pnpm --filter @oryx/shared test` | **152 / 152**, 8 suites |
| `pnpm --filter @oryx/api test:e2e` | **302 / 302**, 14 suites |
| `pnpm typecheck` | clean, 6 packages |
| `pnpm lint` | clean (`--max-warnings=0`) |
| `pnpm build` | all six packages build; admin and customer `next build` compile |
| Live preview | homepage, login, providers all HTTP 200 |

### Incident during this session

`prisma migrate diff` was run with `--shadow-database-url` pointing at
`oryx_dev`. Prisma resets its shadow database, so it **destroyed the development
database's data**. This was a development database only; it was restored with
`prisma migrate reset` + `pnpm db:seed` and the API suite then passed 302/302.
No production data was involved and no committed artifact was affected. The
correct form is a dedicated throwaway shadow database, not the one the tests
read.

## 6. Honest limitations

- Nothing here is deployed. The compose stack has not been run on a real host;
  it is packaged and documented, not proven on target hardware.
- The nginx configuration has not been validated with `nginx -t` in this
  session.
- Payment, SMS, WhatsApp, push and email providers remain unconfigured by
  design. `health-check.sh` and the capabilities endpoint report that
  truthfully; no vendor call is claimed.
- The GitHub Pages preview is static and is not treated as API evidence.
- Native mobile release configuration is out of scope for a server deployment
  and is unchanged.
