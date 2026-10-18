# Execution 07 — Premium Enterprise Web Experience

Report date: 2026-10-18
Branch: `feature/execution-07-premium-web`
Base: `604e36a` (verified Execution 06 head)
Status: **Phase A–D complete for the customer web experience; owner review pending**

This report covers the Execution 07 work plus the defect found and fixed while
re-verifying the live preview. It is evidence-based: every claim below names the
script that produced it and the artifact it wrote.

## 1. Defect found and fixed in this session

### D1 — Customer refresh returned `404` where the staff plane returns `401`

**Symptom.** Every anonymous page load on the customer site logged
`404 POST /api/v1/customer/auth/refresh`. Because `refreshSession()` classifies
`401`/`403` as "no session" and everything else as "transient outage", the `404`
was read as an outage: `restoreCustomerSession()` retried three times with
backoff. A first-time visitor's homepage therefore issued **three** failed
requests before rendering.

**Root cause.** `CustomerAuthController.refresh` threw
`notFound(ERROR_CODES.AUTH_TOKEN_INVALID, 'No refresh token was presented.')`
when no refresh cookie was present, while the equivalent staff handler in
`AuthController.refresh` throws `unauthorized(...)`. The route exists in both
cases; the caller simply has no session. `404` was also semantically wrong — a
missing credential is not a missing resource.

**Fix.** `apps/api/src/customer/customer-auth.controller.ts` now throws
`unauthorized(...)` for the same condition, matching the staff plane.

**Evidence.**

| Check | Before | After |
|---|---|---|
| `POST /api/v1/customer/auth/refresh` with no cookie | `404` | `401` (`auth.token_invalid`) |
| Refresh requests on one anonymous homepage load | 3 | 1 |
| Console errors in the 39-surface preview sweep | 2 | 1 (the expected bootstrap `401`) |

**Regression test.** `apps/api/test/execution04.e2e-spec.ts` →
`answers a cookieless refresh with 401, never 404`, in section *A. customer
identity*. Verified in isolation:

```
✓ answers a cookieless refresh with 401, never 404 (6 ms)
Tests: 64 skipped, 1 passed, 65 total
```

## 2. Responsive hardening

The header's intrinsic content exceeded its container at four widths. Two
contributing causes were removed and one specificity bug fixed.

| Defect | Cause | Fix |
|---|---|---|
| Overflow at 390 / 768 / 1280 | Brand lockup + tagline + nav + four controls did not fit | Tagline hidden below 1400px; header buttons compacted below 560px |
| Menu toggle visible on desktop | `.oryx-btn { display: inline-flex }` was declared after `.oryx-menu-toggle { display: none }` | Higher-specificity `.oryx-header .oryx-menu-toggle` |
| Login/register overlapped the toggle at 390px | Both auth links competed for the same row | Register CTA hidden in the header on small screens; it remains in the mobile panel |

**Evidence.** `.run/check-exec07-responsive.mjs` — 12 viewports × assertions
(mobile-390, tablet-768, laptop-1280, desktop-1440, wide-1920, dashboard-mobile,
dashboard-wide; Arabic/dark and English/light):

```
ALL PASS
```

`.run/check-exec07-mobile-nav.mjs` exercises the new mobile panel as a user
would — open, follow a link, confirm it closes — in both locales:

```
ALL PASS   (20 assertions: direction, panel visibility, 6 destinations,
            2 auth shortcuts, navigation, auto-close, no overflow)
```

## 3. Visual upgrade delivered

| Surface | Before | After |
|---|---|---|
| Public homepage | 128-line prototype, text hero + category grid only | Full page: hero, stats, value proposition, 5 distinct service cards, how-it-works, partners, trust, FAQ, contact, multi-column footer |
| `/services` | Rendered raw i18n keys (`automotive_maintenance`) | Category art + descriptions in Arabic and English |
| Customer dashboard | Four bare count cards | Welcome banner, quick actions, status summary |
| Navigation | No mobile access to primary nav | Accessible panel, closes on navigation |

The homepage length increased from 1024px to 3605px at a 1440px viewport — a
3.5× increase in content, captured like-for-like:

| Artifact | Viewport | Size |
|---|---|---|
| `docs/audit/exec07/before/04-public-homepage.png` | 1440×1024 | viewport |
| `docs/audit/exec07/after/04-public-homepage.png` | 1440×1024 | viewport (comparable) |
| `docs/audit/exec07/after/04b-public-homepage-full.png` | 1440×3605 | full page |

**Note on the earlier comparison.** The first "after" capture used
`fullPage: true` while the "before" set used the viewport. That is not a fair
comparison and has been corrected: the primary `04-public-homepage` shots are
now both viewport-sized, and the full-length capture is a separate artifact.

**Brand assets.** The owner's official logo (`docs/assets/logo.png.jpeg`,
2000×2000) is now present and is the source for both colourways shipped to the
apps. The approved dashboard reference `docs/assets/ORYX Auto Services
Dashboard.png` is present. Full visual parity with that reference is **not**
claimed — the reference is a dark-theme admin dashboard and the customer site
has no corresponding approved reference.

## 4. Functional verification

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | 96 / 96 passed |
| API integration | `pnpm --filter @oryx/api test:e2e` | **278 / 278 passed, 13 suites** |
| Browser (Playwright) | `pnpm --filter @oryx/admin test:ui` | 184 passed, 1 skipped |
| Mobile unit | `pnpm --filter @oryx/mobile test` | 20 / 20 passed |
| Customer lint | `pnpm --filter @oryx/customer lint` | clean (`--max-warnings=0`) |
| Admin lint | `pnpm --filter @oryx/admin lint` | clean (`--max-warnings=0`) |
| Homepage + services assertions | `.run/check-exec07-home.mjs` | **ALL PASS** (ar + en) |
| Responsive matrix | `.run/check-exec07-responsive.mjs` | **ALL PASS** (12 viewports) |
| Mobile navigation | `.run/check-exec07-mobile-nav.mjs` | **ALL PASS** (ar + en) |
| External preview sweep | `.run/sweep-preview.mjs` | **39 / 39 surfaces 200** |
| Documented demo credentials | `.run/check-demo-credentials.mjs` | **4 / 4 sign in** on live HTTPS |

**578 automated tests total** (96 shared, 278 API, 184 browser, 20 mobile). The
API figure rose from the 277 recorded in the Execution 06 audit to 278 with the
defect-18 regression test. The browser and mobile figures are carried from that
audit; this session's live checks are the last five rows, which were all run
here.

### CI

Run [`39145489000`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39145489000)
on head `bbb9f68` — **success**, all three jobs green:

| Job | Result |
|---|---|
| Typecheck and build | success |
| Unit and API integration tests | success |
| Browser acceptance tests | success |

The workflow previously listed only the Execution 01–05 branches, so the
Execution 07 branch reported no checks at all. `ci.yml` now includes
`feature/execution-07-premium-web`, mirroring how the earlier executions were
added.

## 5. Remaining blockers

1. **No approved customer-site design reference.** The only approved reference
   is the dark-theme admin dashboard. Parity with it can be assessed; parity for
   the customer website cannot, because no approved mockup exists.
2. **No native iOS/Android build preview.** The Expo app is verified through its
   web export (`/mobile/*`). A device or EAS build is not available in this
   environment.
3. **Phase C breadth.** The visual system is applied to the homepage, services,
   dashboard, navigation and footer. The remaining customer pages (garage,
   bookings, invoices, support, providers) still use the pre-Execution-07
   presentation and have not been restyled.

   *Closed by Phase C* — see
   [`02_PHASE_C_PREMIUM_PAGES.md`](./02_PHASE_C_PREMIUM_PAGES.md). Every
   customer page now shares the `premium.tsx` primitives. Verified by 78
   screenshot captures with zero overflow and a 13-route live render check.

## 7. Phase D — real photography, dynamic CMS and defect 19

Phase D wired real licensed photography through the dynamic CMS into the customer
homepage, and in doing so found **defect 19**: three layers used three different
category vocabularies, so every category filter returned an empty directory and
the CMS photography never reached a category card. The catalogue now lives once
in `packages/shared/src/service-categories.ts`. Full detail, evidence and the
regression tests are in
[`03_PHASE_D_PHOTOGRAPHY_AND_CATEGORY_FIX.md`](./03_PHASE_D_PHOTOGRAPHY_AND_CATEGORY_FIX.md).

## 8. Reproduction

```bash
# Assertions (no auth needed)
node .run/check-exec07-home.mjs
node .run/check-exec07-responsive.mjs
node .run/check-exec07-mobile-nav.mjs

# External HTTPS sweep (needs the staging stack running)
node .run/sweep-preview.mjs
node .run/diag-http-errors.mjs
node .run/check-refresh-count.mjs

# Screenshots
node .run/capture-exec07-after.mjs
```
