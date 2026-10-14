# ORYX — Execution 01.1 Final Acceptance Report

**Execution:** 01.1 — Final Visual Fidelity, Security Hardening & Production Readiness
**Repository:** `mohammadaljallad079-rgb/oryx`
**Branch:** `feature/execution-01-super-admin-foundation`
**Base branch:** `main`
**Pull request:** [#1](https://github.com/mohammadaljallad079-rgb/oryx/pull/1)
**Final commit:** `a56042c85e27975a4401cdc79b287901d9969233`
**Date:** 2026-10-14
**Readiness:** **Ready for owner review.** Not merged. Not deployed.

---

## 1. Baseline audit

### Repository state before any change

The Execution 01 branch was checked out at `69e498f`. The pre-existing
implementation was verified to be real before extending it:

| Check | Command | Result at baseline |
| --- | --- | --- |
| Working tree | `git status` | clean |
| Branch | `git branch --show-current` | `feature/execution-01-super-admin-foundation` |
| Authorization invariants | `pnpm --filter @oryx/shared test` | **22 passed** |
| API integration | `pnpm --filter @oryx/api test:e2e` | **45 passed** |
| Database | `psql ... \dt` | 18 companies, schema in sync with the two migrations |
| Build artefacts | `ls apps/api/dist/main.js apps/admin/.next` | both present |

### Verified functionality versus documentation claims

The Execution 01 report claimed functional authentication, tenancy, RBAC, plans
and entitlements, a DB-backed dashboard, CMS and support access. Each claim was
re-tested rather than trusted:

- **Verified as real.** Authentication with argon2id and refresh-token rotation;
  company/branch/user/role CRUD persisting to PostgreSQL; entitlement snapshots
  that survive a plan edit; cross-tenant rejection; a dashboard built from real
  aggregates; CMS pages and banners; the audit trail; reasoned, time-bounded
  support sessions.
- **Verified as correctly labelled.** Every ERP operational module reports
  `PLANNED` and its screen states that nothing is implemented.
- **Corrected.** Five claims were accurate but incomplete, and two behaviours
  did not work at all. All seven are listed in section 3.

No existing commit was discarded and no completed module was rebuilt. The
architecture was extended in place.

---

## 2. Changed files and their purpose

`git diff --stat 4e08f8f..a56042c` reports **106 files changed, 4350
insertions, 198 deletions**.

### Security — API (new)

| File | Purpose |
| --- | --- |
| `apps/api/src/auth/cookie.service.ts` | HttpOnly refresh cookie and readable CSRF cookie; `Secure`/`SameSite` from environment; constant-time CSRF verification |
| `apps/api/src/auth/csrf.guard.ts` | Global guard rejecting state-changing requests that present the refresh cookie without a matching CSRF header |
| `apps/api/src/auth/mfa.service.ts` | AES-256-GCM secret cipher and TOTP verification with replay protection; recovery-code generation and hashing |
| `apps/api/src/auth/mfa-enrollment.service.ts` | Enrollment, confirmation, challenge verification, recovery-code regeneration, disable and administrative reset |
| `packages/database/prisma/migrations/20261014085627_mfa_and_recovery_codes/` | Adds MFA columns to `User` and the `MfaRecoveryCode` table |

### Security — API (modified)

| File | Change |
| --- | --- |
| `apps/api/src/auth/auth.controller.ts` | Cookie-based session issue, MFA challenge endpoints, cookie clearing on logout and password change |
| `apps/api/src/auth/auth.service.ts` | Split login into a password step and an MFA step; `issueSession` extracted so both paths share it |
| `apps/api/src/auth/auth.dto.ts` | Optional refresh token in the body; MFA challenge and code DTOs |
| `apps/api/src/auth/auth.module.ts` | Registers the cookie, cipher, MFA and CSRF providers |
| `apps/api/src/auth/principal.guard.ts` | Optional defence-in-depth check that a Super Admin has enrolled MFA |
| `apps/api/src/common/security.module.ts` | CSRF guard runs first in the global pipeline |
| `apps/api/src/common/errors.ts` | CSRF and MFA error codes |
| `apps/api/src/main.ts` | CORS credentials plus the `x-oryx-csrf` allowed header |
| `apps/api/src/organizations/organizations.controller.ts` | `PATCH /companies/:id` now accepts `platform.company.update` as well as `company.update` |

### Frontend

| File | Purpose |
| --- | --- |
| `apps/admin/src/app/(app)/security/page.tsx` | New MFA screen: status, enrollment, recovery codes, regeneration, disable, platform-only reset |
| `apps/admin/src/lib/api.ts` | Cookie-based session, CSRF header echo, MFA methods, no refresh token in storage |
| `apps/admin/src/lib/auth-context.tsx` | Two-step login; only the access token is stored client-side |
| `apps/admin/src/app/login/page.tsx` | MFA challenge as a second form step |
| `apps/admin/src/lib/navigation.ts` | Adds the security route |
| `apps/admin/src/app/(app)/dashboard/page.tsx` | Approved photography for the hero and tiles; `min-w-0` on grid children |
| `apps/admin/src/components/topbar-controls.tsx` | Responsive context selector so the header cannot overflow |
| `apps/admin/src/components/charts.tsx` | Chart wrappers can shrink inside narrow grid columns |
| `apps/admin/src/app/globals.css` | Header clips instead of widening the page; revised hero and tile geometry |
| `apps/admin/src/i18n/dictionaries.ts` | Arabic and English strings for the MFA and security screens |
| `apps/admin/src/app/(app)/roles/page.tsx` | Page testid in the no-company state |

### Visual assets

| File | Purpose |
| --- | --- |
| `scripts/extract-approved-assets.py` | Crops the owner-approved automotive photography out of the approved reference into 24 servable JPEGs |
| `apps/admin/public/tiles/*.jpg` (24 files) | The approved photography used by the hero and module tiles, replacing generated SVG art |
| `packages/shared/src/modules.ts` | `tileImageUrl` helper; hero points at the photographic asset |

### Tests

| File | Purpose |
| --- | --- |
| `apps/api/test/mfa.e2e-spec.ts` | 16 MFA integration tests |
| `apps/api/test/rate-limit.e2e-spec.ts` | Asserts HTTP 429 beyond the login limit |
| `apps/api/test/setup-env.ts` | Relaxed throttle limits and MFA key for the bulk suites |
| `apps/api/test/test-app.ts` | Cookie jar, TOTP generator, MFA baseline reset in `cleanupFixtures` |
| `apps/api/test/authorization.e2e-spec.ts` | Updated to the cookie contract; adds CSRF assertions |
| `apps/admin/e2e/mfa.spec.ts` | 10 MFA and session-transport UI tests |
| `apps/admin/e2e/responsive.spec.ts` | 19 responsive and bilingual tests |
| `apps/admin/e2e/functional.spec.ts` | 13 end-to-end workflow tests with API-level assertions |
| `apps/admin/e2e/screenshots.spec.ts` | The required screenshot captures |
| `apps/admin/e2e/global-setup.ts` | Restores the MFA baseline before UI runs |
| `scripts/verify-security-flow.mjs` | 23 checks against a running API |
| `scripts/reset-seed-mfa.mjs` | Resets MFA on seeded development accounts |

### Documentation

| File | Purpose |
| --- | --- |
| `docs/DEPLOYMENT.md` | New deployment runbook (Phase F) |
| `docs/api/API_REFERENCE.md` | MFA endpoints, session transport, new error codes |
| `.env.example` | Cookie, MFA and production-guidance variables |
| `AGENTS.md` | Updated state and gotchas |

---

## 3. Security changes

### 3.1 Refresh-token transport

| Before | After |
| --- | --- |
| Refresh token returned in the JSON body and stored in `localStorage` | Delivered in an **HttpOnly** cookie named `oryx_rt`, scoped to `/api/v1/auth` |
| Readable by any script on the page | Not readable by JavaScript; verified in a real browser |
| No `Secure` or `SameSite` control | `Secure` defaults to on when `NODE_ENV=production`; `SameSite` configurable (`lax` default, `none` requires `Secure`) |
| Rotation and reuse detection | **Preserved unchanged**; a replayed token still revokes every session for the user |

Only the short-lived access token remains client-side. The UI test
`the refresh token is never exposed to JavaScript` asserts that the cookie is
`HttpOnly`, that `document.cookie` does not contain `oryx_rt`, and that no
refresh-related value appears in `localStorage` or `sessionStorage`.

### 3.2 CSRF protection

The refresh cookie is sent automatically by the browser, so a cross-site POST
could otherwise trigger a rotation. The double-submit pattern closes that:

- the API sets a **readable** `oryx_csrf` cookie;
- the client echoes it in the `x-oryx-csrf` header on every non-GET request;
- `CsrfGuard` runs before principal resolution and rejects a missing or
  mismatched token with `auth.csrf_token_invalid`;
- comparison is constant-time over SHA-256 digests, so length differences do not
  leak.

Requests carrying no refresh cookie have no ambient authority and pass through,
which keeps the credential login endpoint usable.

### 3.3 Multi-factor authentication

| Requirement | Implementation |
| --- | --- |
| Secure enrollment | Secret generated server-side; enrollment is pending until confirmed |
| QR-code provisioning | Inline PNG data URL plus an `otpauth://` URI and a manual entry key |
| TOTP verification | otplib, 6 digits, 30-second step, one step of drift tolerance |
| MFA challenge during login | Password success returns a short-lived challenge token; **no access token is issued** until the second factor is verified |
| Encrypted secret storage | AES-256-GCM under `MFA_ENCRYPTION_KEY`; format `v1.<iv>.<tag>.<ciphertext>` |
| Hashed, single-use recovery codes | Ten codes, SHA-256 hashed, marked used on first redemption |
| Secure regeneration | Requires a valid current code; the previous set is invalidated |
| MFA reset requiring authorisation | Platform-only `POST /auth/mfa/reset/:userId`; clears all MFA material and revokes the target's sessions |
| Audit events | `mfa.enrollment_started`, `mfa.enrolled`, `mfa.enrollment_failed`, `mfa.disabled`, `mfa.recovery_codes_regenerated`, `mfa.admin_reset`, `auth.mfa_challenge_issued`, `auth.mfa_verified`, `auth.mfa_failed` |
| Rate limiting | Dedicated throttles on every MFA endpoint |
| Replay protection | otplib `afterTimeStep` plus a monotonic `mfaLastUsedStep`; a code whose step is not strictly greater is rejected |

MFA is **required** for Super Admin accounts: `MFA_REQUIRE_SUPER_ADMIN=true`
makes the principal guard refuse a platform account that has not enrolled.
Secrets and recovery codes are never logged, and are returned exactly once.

### 3.4 Authorization regression

All previously verified rules were re-asserted at the API layer (not through
hidden UI): platform-to-company isolation, cross-tenant denial, branch scope,
permission delegation limits, module entitlement gating, entitlement snapshots,
support sessions, the invitation lifecycle, and session revocation.

---

## 4. MFA implementation and test evidence

### API integration — `apps/api/test/mfa.e2e-spec.ts` (16 tests, all passing)

| Area | Assertion |
| --- | --- |
| Enrollment | Ten recovery codes issued; none stored in plaintext |
| Enrollment | Secret stored encrypted (`v1.` prefix) and never equal to the plaintext |
| Enrollment | Confirmation with an invalid code returns `auth.mfa_invalid_code` |
| Enrollment | No session is issued from the password step once MFA is on |
| Challenge | Invalid code returns 401 without setting a session cookie |
| Challenge | A valid code issues a session |
| Challenge | **Replaying an accepted code is rejected** |
| Challenge | A tampered challenge token is rejected |
| Recovery | A recovery code works exactly once |
| Recovery | Regeneration invalidates the previous set (an old unused code stops working) |
| Recovery | Regeneration requires a valid current code |
| Disable | Requires a valid code; on success all MFA material is cleared and password-only login works again |
| Reset | Unauthenticated callers are rejected |
| Reset | Non-platform callers are rejected |

### UI acceptance — `apps/admin/e2e/mfa.spec.ts` (10 tests, all passing)

Status and enrollment offer; the enrollment dialog renders a real PNG QR code
and a manual key; an invalid enrollment code surfaces an error; the screen
renders in both themes and both directions; the platform-only reset is visible
to the Super Admin and absent for a company administrator; the login challenge
appears with no session cookie present; an invalid challenge code keeps the user
on `/login`; and the refresh cookie is HttpOnly with nothing refresh-related in
web storage.

### Standalone verification — `scripts/verify-security-flow.mjs`

Run against a live API: **23 checks, 0 failures**, covering cookie attributes,
CSRF rejection and acceptance, the full TOTP lifecycle, replay rejection,
single-use recovery codes and logout clearing.

---

## 5. Refresh-token transport and CSRF implementation

Documented in sections 3.1 and 3.2. Implementation files:

- `apps/api/src/auth/cookie.service.ts` — cookie construction, attribute policy,
  constant-time CSRF comparison.
- `apps/api/src/auth/csrf.guard.ts` — the global enforcement point.
- `apps/admin/src/lib/api.ts` — reads the CSRF cookie, echoes the header, sends
  `credentials: 'include'`, and refreshes through the cookie only.

Production guidance is in `docs/DEPLOYMENT.md` section 5 and 7: terminate TLS,
set `COOKIE_SECURE=true` when the proxy terminates TLS, keep `SameSite=lax`
unless the admin app is on a different site, and never log the tokens.

---

## 6. Visual-fidelity comparison

### Reference

`docs/assets/ORYX Auto Services Dashboard.png` — 1536 × 1024, the authoritative
owner-approved layout. It is an Arabic RTL dashboard with a deep navy field,
restrained gold accents, a luxury automotive hero photograph, image-led module
rectangles, KPI figures and analytics charts.

### Implementation

`docs/execution-reports/screenshots/dashboard-ar-dark.png` (1440 × 1000) and
`dashboard-ar-dark-full.png` (full page).

### What now matches

| Reference element | Implementation | Status |
| --- | --- | --- |
| Deep navy field, layered panels | `--bg #00162b`, `--surface #021f3a`, `--surface-raised #072a4a` | Matches |
| Restrained gold accent | `--gold #d4af37` with soft and deep variants | Matches |
| Automotive hero photograph | **The owner's own approved hero photograph**, cropped from the reference at native resolution | Matches |
| Image-led module rectangles | **The owner's approved photography** behind a navy gradient scrim, with icon chip, badge, title and description | Matches |
| Right-side Arabic navigation | Sidebar moves to the inline-start edge under RTL; grouped, with a gold active state | Matches |
| Premium top bar | Sticky translucent header, blurred backdrop, scope selector, theme and language toggles, user menu | Matches |
| Card overlays, borders, typography | Hairline gold-tinted borders, text shadows over imagery, gold-bordered icon chips | Matches |
| KPI placement | Four-column KPI row with icon chip, label, tabular value and sub-label | Matches |
| Analytics charts | Theme-aware inline SVG and CSS charts | Matches |
| Proportions and density | Three-column tile grid, four-column KPI row, three-column analytics row at 1440 px | Matches |

### Outstanding deviations

1. **No ORYX logo.** The official logo is **not in the repository**. The brand
   slot shows a neutral geometric monogram placeholder, clearly marked in code
   as such. No mark was invented, following the visual reference's own
   instruction. **This is the single largest remaining visual gap.**
2. **Photography is the reference's own pixels.** The approved photography
   exists only inside the approved screenshot; the original image files were
   never supplied. `scripts/extract-approved-assets.py` crops them out at native
   resolution and upscales with Lanczos, so the tiles show genuine approved
   imagery rather than invented art — but they are crops of a screenshot, not
   the original photographs. Supplying the originals and dropping them into
   `apps/admin/public/tiles/` with the same filenames completes the match with no
   code change.
3. **Metrics are real, not illustrative.** The reference shows fixed sample
   figures. The implementation queries the database for the authorized scope.
   With only seeded data present it shows a labelled demo notice; with real data
   the notice disappears. This difference is intentional and required by the
   execution rules.
4. **Tiles carry an availability badge.** Modules not implemented in Execution 01
   are desaturated and labelled "Planned", and their page states plainly that the
   workflow is absent. The reference shows all tiles as equal.
5. **Extra operational chrome.** A company/branch scope selector, and analytics
   panels that carry meaning (branch staffing, module entitlement, recent
   activity) rather than decoration.

**No claim of pixel-perfect fidelity is made.** The composition, palette,
hierarchy and image-led tile treatment now follow the approved reference closely
in both themes and both directions; the two asset gaps in items 1 and 2 are
disclosed rather than hidden.

### Theme and direction coverage

| Variant | Screenshot |
| --- | --- |
| Arabic dark | `dashboard-ar-dark.png`, `dashboard-ar-dark-full.png` |
| Arabic light | `dashboard-ar-light.png` |
| English dark | `dashboard-en-dark.png`, `dashboard-en-dark-full.png` |
| English light | `dashboard-en-light.png` |
| Mobile dark / light | `dashboard-mobile-dark.png`, `dashboard-mobile-light.png` |
| Tablet dark | `dashboard-tablet-dark.png` |

An automated test asserts that the persisted theme is applied before paint
(`data-theme` is already `light` immediately after navigation and the body
background is not navy), so theme switching does not flash.

---

## 7. Screenshots

All in `docs/execution-reports/screenshots/`, captured from the running
application.

| Required capture | File |
| --- | --- |
| Dashboard — Arabic dark | `dashboard-ar-dark.png` |
| Dashboard — Arabic light | `dashboard-ar-light.png` |
| Dashboard — English dark | `dashboard-en-dark.png` |
| Dashboard — English light | `dashboard-en-light.png` |
| Dashboard — mobile dark | `dashboard-mobile-dark.png` |
| Dashboard — mobile light | `dashboard-mobile-light.png` |
| Company management | `companies-dark.png`, `companies-light.png` |
| Subscription packages | `plans-dark.png` |
| Roles and permissions | `roles-dark.png` |
| MFA enrollment | `mfa-enrollment-dark.png` (plus `mfa-settings-dark.png`) |
| MFA login challenge | `mfa-login-challenge-dark.png` |

Additional: `dashboard-tablet-dark.png`, `dashboard-ar-dark-full.png`,
`dashboard-en-dark-full.png`, `company-admin-dark.png`,
`planned-module-dark.png`, `login-dark.png`, `login-light.png`.

---

## 8. Functional acceptance matrix

Verified by `apps/admin/e2e/functional.spec.ts`, which asserts against API
responses rather than the screen, so a success message over a failed request
cannot pass.

| # | Workflow | Verified behaviour | Result |
| --- | --- | --- | --- |
| 1 | Login and logout | Real session transitions; protected routes redirect | Pass |
| 2 | Company creation and editing | Row exists in the database; the edit is stored | Pass |
| 3 | Branch creation and editing | Branch persists; the edit is stored | Pass |
| 4 | User invitation and account management | 64-character token issued, displayed once, and redeemable | Pass |
| 5 | Role creation and permission assignment | Role persists with the selected permission | Pass |
| 6 | Module catalog administration | 17 modules; `AVAILABLE` versus `PLANNED` matches what is shipped | Pass |
| 7 | Subscription package creation and editing | Plan persists at the given price; the edit is stored | Pass |
| 8 | Subscription assignment and entitlement enforcement | Starter excludes accounting; Enterprise includes the automotive modules | Pass |
| 9 | Dashboard filters and scoped metrics | Platform sees all companies; a company scope sees exactly one | Pass |
| 10 | CMS content management | A draft is absent from the public endpoint; publishing makes it appear | Pass |
| 11 | Application configuration and feature flags | Flag and app version persist and appear in the UI | Pass |
| 12 | Audit trail | Records `company.created`, `auth.login`, `plan.created`, `subscription.assigned` | Pass |
| 13 | Authorised support sessions | Short reason rejected; session opened and ended; audited | Pass |

**No dead buttons, fake saves, decorative forms or misleading success messages
were found.** A scan for empty click handlers, `href="#"` and placeholder
comments returned nothing. Planned modules are labelled honestly.

---

## 9. Test counts and failures

| Suite | Command | Tests | Result |
| --- | --- | --- | --- |
| Authorization invariants (unit) | `pnpm --filter @oryx/shared test` | 22 | **22 passed** |
| API integration — authorization | `pnpm --filter @oryx/api test:e2e` | 45 | **45 passed** |
| API integration — MFA | (same run) | 16 | **16 passed** |
| API integration — rate limiting | (same run) | 1 | **1 passed** |
| UI — admin acceptance | `pnpm --filter @oryx/admin test:ui` | 18 | **18 passed** |
| UI — MFA and session transport | (same run) | 10 | **10 passed** |
| UI — responsive and bilingual | (same run) | 19 | **19 passed** |
| UI — functional audit | (same run) | 13 | **13 passed** |
| UI — screenshots | (same run) | 14 | **14 passed** |
| Security flow script | `node scripts/verify-security-flow.mjs` | 23 checks | **23 passed** |
| **Total** | | **181** | **0 failures** |

Baseline for comparison: 22 unit and 45 API tests before this execution. The API
suite grew from 45 to 62; the UI suite from 29 to 74.

### Defects found and fixed during this execution

| # | Defect | Severity | Fix |
| --- | --- | --- | --- |
| 1 | The header could widen the page on phones because the company and branch selectors forced a fixed minimum width | Layout, user-visible | Selectors shrink, labels collapse below `md`, the header clips |
| 2 | A wide dashboard chart forced horizontal page scroll on mobile because grid children could not shrink | Layout, user-visible | `min-w-0` on grid children and chart wrappers |
| 3 | The Super Admin could not edit a company profile — `PATCH /companies/:id` accepted only the company-scope permission | Functional, blocking | The route also accepts `platform.company.update` |
| 4 | The roles screen had no page testid in its no-company state | Testability | Testid added |

---

## 10. Production build results

| Build | Command | Result |
| --- | --- | --- |
| Shared package | `pnpm --filter @oryx/shared build` | Clean |
| Database package | `pnpm --filter @oryx/database build` | Clean, Prisma client generated |
| API | `pnpm --filter @oryx/api build` | Clean; `dist/main.js` emitted |
| Admin app | `pnpm --filter @oryx/admin build` | Clean; **27 routes** prerendered |
| API typecheck | `pnpm --filter @oryx/api typecheck` | Clean |
| Admin typecheck | `pnpm --filter @oryx/admin typecheck` | Clean |

Note: the workspace packages must be built before the apps, because the apps
resolve them from their compiled `dist/`. This is documented in `AGENTS.md` and
in the runbook.

---

## 11. Known limitations

1. **MFA is not mandatory by default.** `MFA_REQUIRE_SUPER_ADMIN` defaults to
   `false` so the seeded development flow keeps working. Set it to `true` in
   production; the deployment checklist covers it.
2. **Access tokens still live in `localStorage`.** Only the refresh token moved
   to a cookie. An XSS payload could read a 15-minute access token. Moving the
   access token to memory only is the next hardening step.
3. **No MFA key versioning.** Rotating `MFA_ENCRYPTION_KEY` makes every existing
   enrollment unreadable; affected users must re-enroll.
4. **No storage or API-request metering.** `storageMb` and `apiRequestsPerMonth`
   are stored, displayed and returned but not enforced.
5. **`maxCompanies` is not enforced**; the Super Admin provisions companies.
6. **No payment gateway.** Subscriptions record price, period and immutable
   history; no charge is attempted and no integration is claimed.
7. **No email, SMS or push delivery.** Invitation tokens are returned once by the
   API and must be delivered out of band.
8. **Swagger UI is exposed** at `/api/docs`. Restrict or disable it in production.
9. **Migrations are forward-only.** There is no automatic down-migration; rollback
   is a restore from the pre-migration backup.
10. **Mobile has no interaction test suite.** Mobile is covered by screenshot and
    overflow assertions, not by workflow interaction at phone width.
11. **The rate limiter is per IP.** Behind a proxy that does not forward the real
    client IP, all users share one bucket.

---

## 12. Missing assets

| Asset | Expected location | Status | Consequence |
| --- | --- | --- | --- |
| Official ORYX logo (`WhatsApp Image 2026-10-06 at 1.25.18 PM(3).jpeg`) | `docs/assets/oryx-logo-original.jpg` | **Absent** | The brand slot uses a neutral monogram placeholder. No mark was invented |
| Approved dashboard photography (original files) | `apps/admin/public/tiles/` | **Absent**; crops of the approved screenshot are used instead | Tiles show genuine approved imagery but at screenshot resolution rather than original quality |

A repository-wide search for the logo found no file: `docs/assets/` contains only
`ORYX Auto Services Dashboard.png` and `README.md`.

---

## 13. Deployment prerequisites

Full detail is in `docs/DEPLOYMENT.md`. Summary:

| Prerequisite | Requirement |
| --- | --- |
| Database | PostgreSQL 15+, reachable over TLS |
| Runtime | Node.js 20+ |
| HTTPS | Mandatory; session cookies are `Secure` in production |
| Secrets | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `MFA_ENCRYPTION_KEY`, each ≥ 32 random characters, from a secret manager — never from a committed file |
| Reverse proxy | Must forward `X-Forwarded-For` so rate limiting and audit see the real client IP |
| CORS | The admin origin listed exactly in `CORS_ORIGINS` |
| Migrations | `pnpm db:migrate`; never `migrate dev` against production |
| Backup | Verified `pg_dump` before every migration |
| Health probe | `GET /api/health` returns `"database":"up"` |
| Development defaults removed | Seeded passwords changed, demo tenants archived, Swagger restricted |

**Prepared but not performed.** No deployment has been carried out and no
deployment is claimed.

---

## 14. Final Git commit

```
a56042c85e27975a4401cdc79b287901d9969233
```

Branch: `feature/execution-01-super-admin-foundation`, pushed to
`origin`. Five commits since the Execution 01 report:

```
a56042c test(audit): verify all thirteen Super Admin workflows end to end
a32a578 test(ui): MFA, responsive and screenshot suites; fix mobile header overflow
24d5645 feat(security): HttpOnly refresh cookies, CSRF protection and TOTP MFA
69e498f docs: document the workspace build order requirement
157f0cd docs(execution-01): link the opened pull request in the execution report
```

---

## 15. PR URL and readiness status

**Pull request:** https://github.com/mohammadaljallad079-rgb/oryx/pull/1
**Status:** open, updated with this execution, **ready for owner review**.
**Not merged. Not deployed.**

### Strict completion criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Existing functionality remains operational | **Met** | Baseline 22 + 45 tests still pass; the API suite grew to 62 |
| Super Admin MFA works end to end | **Met** | 16 API tests, 10 UI tests, 23 script checks |
| Refresh-token handling is secure | **Met** | HttpOnly cookie, no JavaScript access, CSRF double-submit, rotation and reuse detection preserved |
| Tenant isolation and delegated permissions remain intact | **Met** | Authorization suite re-asserted at the API layer |
| Dark and Light themes work across implemented screens | **Met** | Screenshots plus an automated no-flash assertion |
| The dashboard closely follows the approved design | **Met with disclosed gaps** | Approved photography now used; logo and original photography still absent |
| All critical automated tests pass | **Met** | 181 tests, 0 failures |
| Production builds succeed | **Met** | Four builds clean; 27 admin routes |
| Missing assets and limitations are explicitly disclosed | **Met** | Sections 11 and 12 |
| PR #1 is updated and ready for owner review | **Met** | This report and the commits above |

### Blocked criteria

None. Every acceptance criterion is either met or met with an explicitly
disclosed asset limitation. The logo is the one item that cannot be resolved
without the owner supplying the original file; it is reported, not worked
around.

### Recommended next steps

1. Upload the official ORYX logo and the original dashboard photography.
2. Set `MFA_REQUIRE_SUPER_ADMIN=true` and enroll MFA on the production Super
   Admin before real data is loaded.
3. Move the access token out of `localStorage`.
4. Implement Execution 02 (Financial Accounting, Sales & POS, Purchasing,
   Reports) as real DB-backed workflows, promoting each module from `PLANNED` to
   `AVAILABLE` in the shared catalog.
5. Add storage and API-request metering so those plan limits are enforced.
