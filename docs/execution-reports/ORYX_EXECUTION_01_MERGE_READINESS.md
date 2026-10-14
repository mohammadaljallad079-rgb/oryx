# ORYX — Execution 01 Merge Readiness Report

**Execution:** 01.2 — Final CI, Authentication Security & Visual Acceptance
**Repository:** `mohammadaljallad079-rgb/oryx`
**Branch:** `feature/execution-01-super-admin-foundation`
**Base branch:** `main`
**Pull request:** [#1](https://github.com/mohammadaljallad079-rgb/oryx/pull/1)
**Date:** 2026-10-14

---

## 1. Exact commit SHA

```
8b12fb81e4cdeddca76da276b78a4a78543c3302
```

This is the commit that CI ran against and that this report describes. The only
change after it is a CI-only Node version bump (section 3), which touches no
application code.

Commit history of this execution:

```
8b12fb8 test: remove step-boundary fragility from the MFA suites
b9f153e fix(auth): make the refresh claim atomic so revoked tokens are always refused
9aaf487 fix(auth): close the rotation race window; stabilise three flaky assertions
ed7fb34 test: make the rotation concurrency tests deterministic
995bea2 ci: add GitHub Actions pipeline
42c6992 feat(auth): in-memory access tokens and correct refresh rotation
3c8de0a chore: refresh screenshots from the final verified build   <- verified previous HEAD
```

---

## 2. GitHub Actions workflow URL

| Item | Value |
| --- | --- |
| Workflow file | `.github/workflows/ci.yml` |
| Successful run | https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/38568436720 |
| Run ID | `38568436720` |
| Trigger | `pull_request` targeting `main` |
| Commit | `8b12fb8` |

---

## 3. CI execution status and results

### Result: **PASS** — all three jobs green on the actual PR commit

| Job | Duration | Result |
| --- | --- | --- |
| Typecheck and build | 1m14s | pass |
| Unit and API integration tests | 1m06s | pass |
| Browser acceptance tests | 3m21s | pass |

A second run of the same commit also passed (`38568430516`), confirming the
result is reproducible rather than a lucky scheduling outcome.

### What the workflow does

**Triggers.** Pull requests targeting `main`, pushes to `main` and the feature
branch, and manual dispatch. Concurrency cancels superseded runs. Permissions are
read-only (`contents: read`).

**`quality`** — installs with `--frozen-lockfile` on Node 22 + pnpm 9.15.9,
generates the Prisma client, builds the workspace packages (the apps resolve them
from `dist`, so this must happen first), then runs both typechecks and both
production builds.

**`test-api`** — provisions a `postgres:17` service with a `pg_isready` health
check, applies migrations with `prisma migrate deploy`, seeds the baseline
catalog, asserts the schema is in sync, then runs the authorization unit suite
and the full API integration suite (authorization, session lifecycle, MFA/CSRF,
rate limiting). Uploads the test report.

**`test-ui`** — the same database setup, builds the API and admin app, installs
Playwright Chromium, starts both servers with **explicit readiness polling** (the
health endpoint must report `"database":"up"`, then the login page must return
200) before any browser test runs. On failure it prints both server logs; it
always uploads the Playwright report, failure traces and the captured
screenshots.

### Credentials

No repository secret is required. Every credential is a throwaway value defined
inside the workflow (`oryx_test` database, CI-only JWT and MFA keys, a CI-only
seed password). Nothing is printed to the log, so the pipeline is safe for fork
pull requests.

### Failures found and fixed during this execution

CI earned its place immediately: it failed three times before passing, and every
failure was a genuine defect rather than a CI misconfiguration.

| # | Failure | Root cause | Resolution |
| --- | --- | --- | --- |
| 1 | `session.e2e-spec` — concurrent rotation audit | The test relied on two HTTP requests actually interleaving, which is timing dependent | Forced the losing state deterministically (rotate, then present the revoked token while its successor is live) |
| 2 | `auth-lifecycle.spec` — two tabs refreshing | The test reloaded both tabs and asserted before they finished restoring | Wait for each tab to finish restoring |
| 3 | `admin.spec` / `responsive.spec` — option and chart counts | Assertions read asynchronously loaded content immediately | Both now poll |
| 4 | **`auth-lifecycle.spec` — two tabs refreshing (real product defect)** | The losing caller could read a token after the winner set `revokedAt` but before it wrote `replacedBy`, so it saw a revoked token with no successor and was refused | See section 5.2 |
| 5 | `mfa.e2e-spec` — session for a valid code | The test advanced the TOTP clock by +31s, which can cross two 30-second steps and fall outside the server's ±1 tolerance | Clears the replay counter and uses the current step |
| 6 | `screenshots.spec` — MFA login challenge | Same +31s step-boundary fragility | Uses exactly +30s, one step ahead at any offset |

### Post-run change

One CI-only change was made after the passing run: `NODE_VERSION` moved from
`'20'` to `'22'` to clear the runner's Node 20 deprecation annotation and match
what the runners actually execute. It touches no application code.

---

## 4. Complete test counts

All figures verified locally on the same commit. The API and browser suites were
re-run repeatedly to confirm they are not flaky.

| Suite | Command | Tests | Result |
| --- | --- | --- | --- |
| Authorization invariants (unit) | `pnpm --filter @oryx/shared test` | 22 | **22 passed** |
| API integration — authorization | `pnpm --filter @oryx/api test:e2e` | 45 | **45 passed** |
| API integration — session lifecycle | (same run) | 17 | **17 passed** |
| API integration — MFA and CSRF | (same run) | 16 | **16 passed** |
| API integration — rate limiting | (same run) | 1 | **1 passed** |
| UI — admin acceptance | `pnpm --filter @oryx/admin test:ui` | 18 | **18 passed** |
| UI — authentication lifecycle | (same run) | 14 | **14 passed** |
| UI — MFA and session transport | (same run) | 10 | **10 passed** |
| UI — responsive and bilingual | (same run) | 19 | **19 passed** |
| UI — functional audit | (same run) | 13 | **13 passed** |
| UI — screenshots | (same run) | 16 | **16 passed** |
| Security flow script | `node scripts/verify-security-flow.mjs` | 23 checks | **23 passed** |
| **Total** | | **213** | **0 failures** |

Stability evidence (local, same commit):

| Suite | Runs | Result each time |
| --- | --- | --- |
| Session lifecycle (includes the forced race) | 5 | 17/17 |
| Full API | 4 | 79/79 |
| Screenshots | 1 | 16/16 |
| Full UI | 2 | 90/90 |

Growth across the execution: unit 22 (unchanged), API 45 to 79, UI 29 to 90.

---

## 5. Authentication security changes

### 5.1 No token in JavaScript-accessible persistent storage

| Before | After |
| --- | --- |
| Access token written to `localStorage` under `oryx.accessToken` | Held in a module-scoped variable for the lifetime of the tab |
| Readable by any script on the page | Not reachable from page script; a raw `fetch` from page context returns 401 |
| Survived tab close | Discarded on tab close; restored from the HttpOnly refresh cookie |

Only non-secret UI preferences (the selected company and branch ids) remain
persisted. The refresh token stays in the HttpOnly `oryx_rt` cookie, scoped to
`/api/v1/auth`.

Two production defects were also found while auditing this:

- The API-management screen built a raw request with a token read from
  `localStorage`, bypassing the API client and therefore the CSRF header. It now
  goes through the client.
- The `apiToken` test helper logged in on every call; it now rotates the existing
  session, so it neither consumes the login rate limit nor disturbs MFA state.

### 5.2 Refresh rotation and the concurrency defect

This is the most significant change in the execution. It took two attempts, and
the first attempt introduced a security regression that the test suite caught
immediately — worth recording in full.

**Original behaviour.** Rotation was single-use with immediate family-wide
revocation. Two tabs refreshing at once destroyed the session: one rotated, the
other was treated as a replay and revoked the family.

**First attempt (insufficient).** A losing caller inside a grace window received
a sibling token. This fixed the two-tab case but left a window: `revokedAt` and
`replacedBy` were written in two statements, so a caller could observe a revoked
token with no successor. Worse, when the grace path was broadened to cover that
window, tokens revoked by **logout** were misclassified as concurrent rotations
and **accepted** — a genuine authentication bypass. Three tests caught it.

**Final behaviour (atomic).** The successor row is created first, and the claim
then sets `revokedAt` and `replacedBy` together in one guarded `updateMany`:

```
create successor
claimed = updateMany({ id, revokedAt: null }, { revokedAt: now, replacedBy: successor.id })
if claimed.count === 0:            // another caller won the race
    discard our unused successor
    if the token has a live successor  -> concurrent rotation: issue a sibling
    otherwise                          -> revoked by logout / family: refuse
```

Because the write is atomic, the winner's successor is always visible to the
loser, so a single read classifies the request correctly.

| Case | Behaviour |
| --- | --- |
| Single rotation | New token; old one revoked and linked |
| Two requests race the same token | Both receive usable sessions; the loser gets a sibling in the same family; nothing is revoked |
| Replay inside the grace window of a **rotated** token | Sibling issued, audited as `auth.refresh_concurrent_rotation` |
| Replay outside the grace window | Family revoked, audited as `auth.refresh_reuse_detected`, 401 |
| Token revoked by logout or logout-all | **Refused** — no successor, so never treated as a race |
| Malformed or unsigned token | 401 `auth.token_invalid` before any database lookup |

**Token families.** `RefreshToken.familyId` groups every rotation of one login.
Revoking a compromised chain no longer signs the user out of unrelated devices.
The migration adds the column nullable, backfills each existing row as its own
family root, then makes it required — verified safe on a populated table (940
rows locally).

**Rate limits.** The refresh and invitation-acceptance ceilings were hard-coded
at 20/minute, which a browser with several tabs can legitimately exceed. Both are
now configurable (`REFRESH_THROTTLE_LIMIT`, `INVITATION_THROTTLE_LIMIT`), and a
dedicated suite still asserts HTTP 429 beyond the login limit.

### 5.3 Cookie attributes

| Attribute | Value | Verified by |
| --- | --- | --- |
| `HttpOnly` | true on `oryx_rt` | API test and browser test |
| `Secure` | derived from `NODE_ENV`, overridable via `COOKIE_SECURE` | Configuration; documented in the runbook |
| `SameSite` | `lax` default; `none` only honoured with `Secure` | Configuration |
| `Path` | `/api/v1/auth` | API test |
| `oryx_csrf` | readable; not a credential on its own | API test |

### 5.4 Client behaviour

- **Reload** — the in-memory token is gone, so `restoreSession()` performs one
  cookie refresh. Verified for a plain reload and a deep-link reload.
- **Single-flight refresh** — every 401 shares one rotation promise, so several
  widgets loading at once produce at most one rotation. Verified by counting
  refresh requests during a dashboard reload.
- **Multiple tabs** — signing out in one tab signs the others out; two tabs
  reloading simultaneously both stay usable.
- **Session loss** — a failed refresh clears state and redirects to sign-in
  rather than showing a broken screen.
- **No refresh loop** — refresh counts are asserted stable after a failed login
  and after an unauthenticated visit to a protected route.
- **No token in a URL** — asserted.

---

## 6. MFA regression results

| Property | Result |
| --- | --- |
| Enrollment issues ten recovery codes | pass |
| Codes stored only as SHA-256 hashes | pass |
| TOTP secret stored encrypted (`v1.` AES-256-GCM prefix), never plaintext | pass |
| Invalid code rejected with `auth.mfa_invalid_code` | pass |
| No session issued from the password step once MFA is on | pass |
| Challenge rejects an invalid code without setting a cookie | pass |
| Valid code issues a session | pass |
| Replay of an accepted code rejected | pass |
| Tampered challenge token rejected | pass |
| Recovery code works exactly once | pass |
| Regeneration invalidates the previous set | pass |
| Regeneration requires a valid current code | pass |
| Disable requires a valid code and clears all MFA material | pass |
| Administrative reset is platform-only and revokes sessions | pass |
| Browser: QR code rendered as a PNG data URL with a manual key | pass |
| Browser: login challenge appears and stays on `/login` without a session cookie | pass |
| Browser: platform-only reset visible to Super Admin, absent for a company admin | pass |

16 API tests and 10 browser tests cover these; all pass, and the API suite was
re-run four times to confirm the timing fixes hold.

---

## 7. CSRF regression results

| Property | Result |
| --- | --- |
| Refresh without the CSRF header → 403 `auth.csrf_token_invalid` | pass |
| Refresh with a mismatched CSRF header → 403 | pass |
| State-changing request without the header → 403 | pass |
| State-changing request with the header → 200 | pass |
| GET without the CSRF header → allowed (CSRF guards writes only) | pass |
| `oryx_csrf` cookie readable; `oryx_rt` HttpOnly | pass |
| Browser: no refresh token in `document.cookie`, `localStorage` or `sessionStorage` | pass |

---

## 8. Browser screenshots

All in `docs/execution-reports/screenshots/`, captured in a real browser against
the running application.

| Requirement | File |
| --- | --- |
| Arabic desktop — Dark | `dashboard-ar-dark.png` (+ `dashboard-ar-dark-full.png`) |
| Arabic desktop — Light | `dashboard-ar-light.png` |
| English desktop — Dark | `dashboard-en-dark.png` (+ `dashboard-en-dark-full.png`) |
| English desktop — Light | `dashboard-en-light.png` |
| Arabic mobile — Dark | `dashboard-mobile-ar-dark.png` |
| Arabic mobile — Light | `dashboard-mobile-ar-light.png` |
| English mobile — Dark | `dashboard-mobile-en-dark.png` |
| English mobile — Light | `dashboard-mobile-en-light.png` |
| Super Admin login | `login-dark.png`, `login-light.png` |
| Company management | `companies-dark.png`, `companies-light.png` |
| Subscription plans | `plans-dark.png` |
| Permissions | `roles-dark.png` |
| Reference viewport (1536×1024, Arabic dark) | `dashboard-reference-viewport-ar-dark.png` |
| Additional | `dashboard-tablet-dark.png`, `mfa-enrollment-dark.png`, `mfa-login-challenge-dark.png`, `mfa-settings-dark.png`, `planned-module-dark.png`, `company-admin-dark.png` |

The mobile captures use Arabic because the approved reference is an Arabic RTL
dashboard; English mobile variants are included for completeness.

---

## 9. Side-by-side design comparison

Generated by `scripts/build-design-comparison.py`, in
`docs/execution-reports/comparison/`:

| File | Contents |
| --- | --- |
| `side-by-side.png` | Approved reference beside the implementation, equal height, labelled |
| `side-by-side-detail.png` | Top 45% of each — header, hero and first tile row |
| `overlay.png` | The implementation at 50% over the reference |

Both source images are **1536 × 1024**, so the comparison is like for like.

### Measured against the approved reference

| Aspect | Reference | Implementation | Assessment |
| --- | --- | --- | --- |
| Navy field | `#021529` (top-left `2,21,41`) | `#001020` (`0,16,32`) | Same family; implementation slightly darker |
| Gold accent | `#d4af37` | `#d4af37` | Matches |
| Sidebar position (RTL, inline-start = right) | panel begins ≈ x1290 | panel begins ≈ x1290 | Matches |
| Header height | ≈ 66 px | 68 px | Matches within tolerance |
| Hero band mean luminance | 56.3 | 25.6 | **Implementation markedly darker** |
| Tile rows mean luminance | 38.5 – 49.0 | 30.1 – 32.4 | **Implementation flatter and darker** |
| Whole-image mean luminance | 48.1 | 28.7 | **Implementation darker overall** |

### What matches

- Composition: header, hero banner, KPI band, then the image-led module tile grid.
- The navy/gold identity, including the exact gold `#d4af37`.
- The RTL sidebar on the right, its grouping and the gold active state.
- The premium top bar with the scope selector, theme and language controls.
- The hero banner using the owner's own approved automotive photograph.
- Image-led module rectangles with a navy gradient scrim and legible captions.
- Typography hierarchy, hairline gold-tinted borders, and KPI card structure.

### Remaining deviations

1. **The implementation is measurably darker and flatter** (mean luminance 28.7
   vs 48.1). The reference lifts its panels and photography; the implementation
   keeps a deeper navy throughout. This is the most significant visual difference
   and the clearest improvement opportunity.
2. **The official logo is absent** (section 10). The brand slot shows a neutral
   monogram placeholder.
3. **Photography is cropped from the approved screenshot**, not the original
   image files, which were never supplied. `scripts/extract-approved-assets.py`
   crops them at native resolution; supplying originals completes the match with
   no code change.
4. **Metrics are real, not illustrative.** The reference shows fixed sample
   figures; the implementation queries the database for the authorized scope and
   shows a labelled demo notice when only seeded records exist. Required by the
   execution rules.
5. **Tiles carry an availability badge.** Modules not implemented in Execution 01
   are desaturated and labelled "Planned".
6. **Extra operational chrome** — a company/branch scope selector, and analytics
   panels that carry meaning rather than decoration.

No claim of pixel-perfect fidelity is made. The structural match is strong; the
tonal difference in item 1 is real and documented.

---

## 10. Missing assets

| Asset | Expected path | Status | Consequence |
| --- | --- | --- | --- |
| Official ORYX logo (`WhatsApp Image 2026-10-06 at 1.25.18 PM(3).jpeg`) | `docs/assets/oryx-logo-original.jpg` | **ABSENT** | The brand slot uses a neutral monogram placeholder. No mark was invented, following the visual reference's own instruction |
| Original dashboard photography | `apps/admin/public/tiles/` | **ABSENT**; crops of the approved screenshot are used | Tiles show genuine approved imagery but at screenshot resolution |

`docs/assets/` contains only `ORYX Auto Services Dashboard.png` and `README.md`.
A repository-wide search found no logo file. **This is a blocker for exact brand
fidelity, not for functionality.**

---

## 11. Remaining limitations

1. **The implementation is darker than the approved reference** (section 9,
   deviation 1). A visual-design pass is the highest-value follow-up.
2. **`MFA_REQUIRE_SUPER_ADMIN` defaults to `false`.** Set it to `true` in
   production; the deployment checklist covers it.
3. **No MFA key versioning.** Rotating `MFA_ENCRYPTION_KEY` makes existing
   enrollments unreadable; affected users must re-enroll.
4. **No storage or API-request metering.** `storageMb` and `apiRequestsPerMonth`
   are stored and displayed but not enforced. `maxCompanies` is likewise not
   enforced; the Super Admin provisions companies.
5. **No payment gateway.** Subscriptions record price, period and immutable
   history; no charge is attempted and no integration is claimed.
6. **No email, SMS or push delivery.** Invitation tokens are returned once by the
   API and must be delivered out of band.
7. **Swagger UI is exposed** at `/api/docs`. Restrict or disable in production.
8. **Migrations are forward-only.** Rollback is a restore from the pre-migration
   backup.
9. **Mobile has no interaction suite.** Mobile is covered by screenshots and
   overflow assertions, not workflow interaction at phone width.
10. **The rate limiter is per IP.** Behind a proxy that does not forward the real
    client IP, all users share one bucket.
11. **ERP operational modules are unimplemented.** Accounting, sales, purchasing,
    inventory, HR, CRM, operations and the automotive modules are routed and
    permission-protected but explicitly labelled "Planned". They show no
    fabricated data.
12. **The consumer mobile application is out of scope** for Execution 01.

---

## 12. Production deployment prerequisites

Full detail in `docs/DEPLOYMENT.md`. Summary:

| Prerequisite | Requirement |
| --- | --- |
| Database | PostgreSQL 15+ (CI and local verification use 17), reachable over TLS |
| Runtime | Node.js 20+ (CI uses 22) |
| HTTPS | Mandatory; session cookies are `Secure` in production |
| Secrets | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY` — each at least 32 random characters, from a secret manager, never committed |
| CORS | The admin origin listed exactly in `CORS_ORIGINS` |
| Reverse proxy | Must forward `X-Forwarded-For` so rate limiting and audit see the real client IP; must not rewrite `/api/v1/auth` |
| Migrations | `pnpm db:migrate` (`prisma migrate deploy`). Never `migrate dev` against production |
| Backup | A verified `pg_dump` immediately before every migration |
| Health probe | `GET /api/health` must return `"database":"up"` |
| Development defaults removed | Change the seeded Super Admin password, archive the demo tenants (`SEED_DEMO_DATA`), restrict Swagger |
| Post-deploy validation | The checklist in `docs/DEPLOYMENT.md` section 9, including the cookie, CSRF, MFA and tenant-isolation checks |

**Prepared but not performed. Nothing is deployed.**

---

## 13. Merge-readiness recommendation

### Recommendation: **READY FOR OWNER REVIEW — do not merge without owner approval**

Every mandatory criterion is met, with two items met subject to disclosed asset
and design limitations.

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| GitHub Actions CI passes on the actual PR commit | **Met** | Run `38568436720`, commit `8b12fb8`, all three jobs green; a second run of the same commit also passed |
| No authentication tokens in persistent JavaScript-accessible storage | **Met** | Access token in memory only; refresh token in an HttpOnly cookie; browser tests assert absence from storage, cookies and URLs |
| MFA, CSRF, token rotation and session revocation remain secure and tested | **Met** | 16 MFA + 17 session + CSRF tests; the atomic claim guarantees revoked tokens are refused |
| Tenant isolation and permissions pass regression tests | **Met** | Authorization suite re-asserted at the API layer, including cross-tenant, branch-scope and delegation limits |
| The approved dashboard compared against real browser screenshots | **Met** | Three comparison images at matched 1536×1024, with measured differences |
| Dark and Light themes work across implemented pages | **Met** | Screenshots plus automated theme/direction assertions and a no-flash check |
| All critical tests and builds pass | **Met** | 213 tests, 0 failures; four clean builds; 27 admin routes |
| Missing logo and other asset limitations documented | **Met** | Section 10 |
| PR #1 ready for owner review, not merged | **Met** | PR updated; still open and unmerged |

### Blockers

**None for merge.** The two non-blocking gaps are the missing official logo and
the tonal difference from the approved reference. Neither affects functionality,
security or tenancy.

### Recommended before production, in priority order

1. Upload the official ORYX logo and the original dashboard photography.
2. A visual pass to lift panel and hero luminance toward the reference (28.7
   toward nearer 48.1).
3. Set `MFA_REQUIRE_SUPER_ADMIN=true` and enroll MFA on the production Super
   Admin before loading real data.
4. Begin Execution 02 (Financial Accounting, Sales & POS, Purchasing, Reports) as
   real DB-backed workflows, promoting each module from `PLANNED` to `AVAILABLE`.
5. Add storage and API-request metering so those plan limits are enforced.

### What this execution deliberately did not do

- Did not merge PR #1.
- Did not deploy.
- Did not start Execution 02.
- Did not remove or weaken any failing test to obtain a green result. Every CI
  failure was traced to a real cause and fixed at the source; one of them was an
  authentication bypass in the rotation logic that the suite caught before it
  could ship.
