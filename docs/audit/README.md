# ORYX — Audit Reports

Audit date: 2026-10-16
Audited revision: `fc2ab20` (merge of PR #5) plus the fixes in `04_FIXED_DEFECTS.md`.
Delivered on branch `audit/execution-05-verification`, commit `f991e79`.
Environment: isolated staging (`oryx_staging`), not production.

## Repository state

| Item | Value |
|---|---|
| PR #5 (`feature/execution-05-platform-completion`) | **MERGED** 2026-10-16T18:10:37Z, merge commit `fc2ab20` |
| `origin/main` tree | `c789eec` — identical to the Execution 05 head `7db9689` |
| This audit | branch `audit/execution-05-verification`, commit `f991e79`, PR #6 |
| Latest GitHub commit on `main` | `fc2ab20` |

PR #5 is merged, so it cannot be updated; a merged pull request takes no new
commits. The audit work therefore lands on a fresh branch and PR #6, based on the
same tree.

## Reports

| Report | Contents |
|---|---|
| `01_SPECIFICATION_PARITY_MATRIX.md` | Every master-reference requirement mapped to code and a verifiable check |
| `02_FUNCTIONAL_AUDIT.md` | Frontend/backend connections, database operations, permissions, navigation, forms, workflows, RTL/LTR, themes, responsiveness |
| `03_VISUAL_COMPARISON.md` | Measured comparison against `docs/assets/ORYX Auto Services Dashboard.png` |
| `04_FIXED_DEFECTS.md` | Defects found, their fixes and their regression guards |
| `05_INTEGRATION_READINESS.md` | The integration catalogue, state model, credential handling and blockers |
| `06_TEST_AND_CI_RESULTS.md` | 460 passing tests and how to reproduce them |
| `07_LIVE_PREVIEW_AND_CREDENTIALS.md` | Working HTTPS preview links and demo credentials |

## Headline result

- **460 automated tests pass**: 93 shared, 218 API integration, 129 browser, 20 mobile.
- **Every declared Phase-1 surface is connected end to end** and DB-backed.
- **Preview links are live and externally verified** — see report 07.
- **One functional defect was found and fixed** (a module catalog route drift),
  with a regression guard that fails the suite if it returns.
- **Full visual parity is not claimed**: the official logo and the original
  approved photography were never supplied. See report 03.

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
