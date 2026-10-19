# ORYX — Audit Reports

Audit date: 2026-10-16, updated 2026-10-17 after the crash-recovery session and
2026-10-18 after the Execution 06 follow-up (iPad auth, dual Super Admin, unique
dashboard art, responsive sweep, defensive input validation).
Audited revision: `fc2ab20` (merge of PR #5), plus `699560c` (the owner's logo
upload), plus the visual identity and preview fixes in
`08_VISUAL_IDENTITY_AND_PREVIEW_VERIFICATION.md`.
Delivered on branch `audit/execution-05-verification`.
Environment: isolated staging (`oryx_staging`), not production.

## Repository state

| Item | Value |
|---|---|
| PR #5 (`feature/execution-05-platform-completion`) | **MERGED** 2026-10-16T18:10:37Z, merge commit `fc2ab20` |
| `origin/main` tree | `c789eec` — identical to the Execution 05 head `7db9689` |
| Latest `main` commit | `699560c` — the owner's official logo upload |
| This audit | branch `audit/execution-05-verification`, PR #6 (draft). Head `bc77426`; Execution 06 code at `b1e2f7b`, audit/docs and input-validation at `a2e4f82`. |

PR #5 is merged, so it cannot be updated; a merged pull request takes no new
commits. The audit work therefore lands on a fresh branch and PR #6, based on the
same tree. Report 08 records this explicitly, because the task brief asked for
changes to be pushed to the Execution 05 branch.

## Reports

| Report | Contents |
|---|---|
| `01_SPECIFICATION_PARITY_MATRIX.md` | Every master-reference requirement mapped to code and a verifiable check |
| `02_FUNCTIONAL_AUDIT.md` | Frontend/backend connections, database operations, permissions, navigation, forms, workflows, RTL/LTR, themes, responsiveness |
| `03_VISUAL_COMPARISON.md` | Measured comparison against `docs/assets/ORYX Auto Services Dashboard.png` |
| `04_FIXED_DEFECTS.md` | Defects found, their fixes and their regression guards |
| `05_INTEGRATION_READINESS.md` | The integration catalogue, state model, credential handling and blockers |
| `06_TEST_AND_CI_RESULTS.md` | 577 passing tests and how to reproduce them |
| `07_LIVE_PREVIEW_AND_CREDENTIALS.md` | Working HTTPS preview links and demo credentials |
| `08_VISUAL_IDENTITY_AND_PREVIEW_VERIFICATION.md` | Recovery state, visual identity alignment, externally re-verified preview and the CORS build hazard |
| `exec07/01_EXECUTION_07_REPORT.md` | Execution 07 premium web experience, responsive hardening, defect 18 and the corrected screenshot comparison |
| `exec07/04_PHASE_E_LIGHT_THEME.md` | Phase E light-theme correction, the four defects fixed, the dark-integrity proof and the five-surface before/after evidence |

## Headline result

- **578 automated tests pass**: 96 shared, 278 API integration, 184 browser
  (1 skipped), 20 mobile. Plus a live API probe (96/96 module surfaces 200) and
  an external preview sweep (39/39 routes, 0 failed requests). The API figure
  rose from 277 to 278 with the Execution 07 cookieless-refresh regression test
  (defect 18).
- **Every declared Phase-1 surface is connected end to end** and DB-backed.
- **Preview links are live and externally verified** — 39 / 39 routes returned a
  success status over public HTTPS — see reports 07 and 08.
- **The official logo is now in the repository** (owner upload `699560c`) and the
  monogram placeholder has been replaced in the admin sidebar, the admin login
  page and the customer header. The colourway follows the theme.
- **Defects found and fixed** (all with regression guards): a module catalog
  route drift, an RTL sidebar direction defect, a preview-build CORS hazard, the
  Super Admin permission drift after a re-seed, the iPad sign-in lockout (CSRF
  guard rejecting a re-login that carried a stale refresh cookie) and two
  defensive-input defects (a malformed report date and a bookings-calendar range
  that returned 500 instead of 400). See report 04.
- **The approved design reference is no longer used as dashboard artwork at
  all.** Every module tile previously rendered a crop of
  `docs/assets/ORYX Auto Services Dashboard.png`. All 24 crop JPEGs are deleted,
  the crop script is a retired tombstone, and every tile is original vector art
  served as SVG. Verified live: 21 tiles swept, none raster, none broken. See
  defect 5 in report 04.
- **Full visual parity is not claimed**: the official logo is present, but the
  approved dashboard photography is still missing and there is no approved
  light-theme reference. See report 03.

## Reproducing the evidence

```bash
pnpm db:reset                      # clean seeded staging database
pnpm db:seed                       # if reset did not seed
AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000 \
  pnpm --filter @oryx/api test:e2e
ORYX_ADMIN_URL=http://localhost:12000 ORYX_API=http://localhost:12000/api/v1 \
  pnpm --filter @oryx/admin test:ui
python3 scripts/audit-compare.py   # regenerate the visual comparison
```
