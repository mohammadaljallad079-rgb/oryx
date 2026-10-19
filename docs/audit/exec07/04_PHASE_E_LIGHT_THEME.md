# Execution 07 — Phase E: Light-Theme Correction

Report date: 2026-10-19
Branch: `feature/execution-07-premium-web`
Pull request: [#7](https://github.com/mohammadaljallad079-rgb/oryx/pull/7)
Head at the start of this phase: `b3c9a71`
Status: **Phase E complete; owner review pending**

This report covers the light-theme correction and the session recovery that
preceded it. Every claim names the script that produced it and the artifact it
wrote.

> **Correction (2026-10-19, controlled re-capture).** The before/after sets were
> originally captured against *different database content*: the `before` set ran
> before the Phase D photography was seeded through the CMS, and the `after` set
> after. That confound meant the light-theme diff included content changes, and
> it made the dark-invariance check report seven surfaces as shifted when the
> theme had not moved. Both sets have been re-captured against the **same seeded
> content**, with only the theme source differing, and the photography is now
> seeded. See section 4. The theme change itself is unaffected.

## 1. Session recovery

The previous session ended with a sandbox error, so the first step was to
establish what actually existed on the remote before touching anything.

| Question | Finding | How it was checked |
|---|---|---|
| Remote branch tip at recovery | `59ccd286f5c79610ff6ac3cc96dc003c02c54277` | `git ls-remote --heads origin` |
| Commits beyond the last known SHA (`b3c9a71`) | **four** — `5920895`, `04f722e`, `f0c29da`, `59ccd28` | `git log --oneline b3c9a71..origin/feature/execution-07-premium-web` |
| Local HEAD | `59ccd28` — in step with the remote | `git log --oneline -1` |
| PR #7 | open, draft, head `59ccd28`, base `audit/execution-05-verification` | GitHub REST `pulls/7` |
| PR #6 | open, head `604e36a`, base `main` | GitHub REST `pulls/6` |
| Uncommitted work in the workspace | **present — the Phase E navy-band refactor and the light-default flip** | `git status --porcelain`; `git diff` |
| Dangling stashes from the crashed session | `aa67f19`, `58f063a`, `50946c9`, `ae003d7`, `7aed52c` | `git fsck --lost-found` |
| Content unique to the newest stash (`7aed52c`, "phase-e-src", parented on `59ccd28`) | **none** — its `tokens.ts` and `layout.tsx` are byte-identical to the workspace and its `globals.css` differs only by this session's fix | `git diff 7aed52c:<path> <path>` |

**The crashed session had pushed four commits — and it had left a fifth piece of
work uncommitted.** The four commits above the last known SHA are all on
`origin`:

| Commit | Subject |
|---|---|
| `5920895` | `fix(customer): correct the light theme and the profile delete key` — the first Phase E theme pass, the `common.delete` key and the capture/verification harnesses |
| `04f722e` | `docs(exec07): record the crashed-session stash in the Phase E recovery table` |
| `f0c29da` | `docs(exec07): record the green CI runs for Phase E` |
| `59ccd28` | `fix(exec07): regenerate Phase E evidence against a same-origin build` |

None of those four commits contains the **navy-band token refactor** or the
**light-theme default** — `git show 59ccd28:apps/customer/src/app/globals.css`
has zero `--band:` declarations, while the workspace has them. That work was
sitting uncommitted in the workspace when this session opened, and the crashed
session's own stashes corroborate it: `50946c9` ("phaseE-wip"), `ae003d7`
("phaseE-src") and `7aed52c` ("phase-e-src", parented on `59ccd28` at 17:26) each
hold the band tokens, and `7aed52c` matches the workspace almost exactly.

So, stated precisely:

- **Unpushed work existed and was preserved, not lost.** The workspace filesystem
  outlived the sandbox error, so the uncommitted Phase E refinement — the navy
  `--band` token layer and the light default — was still there. It is committed
  in this session. Nothing had to be reconstructed from a stash.
- **No unpushed commit was lost**, because none of that work had ever been
  committed. The dangling stashes are redundant with the workspace; the newest of
  them (`7aed52c`) is a strict subset of what is committed here.
- The Execution 07 work that *was* pushed — the premium design (Phase C), the
  photography and category fix (Phase D) and the first Phase E theme pass — is
  present and untouched on the branch.

**One thing the crash did cost: the live preview.** The `next start` process died
with the sandbox, and when the branch was next rebuilt the old `next-server`
child kept the port and served chunks the rebuild had replaced, so every page
rendered blank. The preview was restarted through `.run/restart-customer.sh`,
which kills the child, waits for the port to free and starts against the new
build; a fresh capture then matched the committed `after` evidence
**byte-for-byte** (`moved=0.00%`), which is how the committed evidence was
confirmed still valid rather than assumed.

## 2. What the owner reported, and what was actually wrong

The owner said the light theme "still looked inconsistent and needs professional
correction". The light theme had already been reworked, so the inconsistency had
a structural cause rather than one wrong hex. Eight defects were found: six in
the theme (E1–E3 and E7 the real contrast bug, plus E8 reported and left alone),
one in the customer dictionary (E4) and one in the evidence itself (E5). E1–E3
and E4 came from the first pass; E7 was found by an exhaustive contrast sweep in
this session and is the defect the owner's complaint was actually pointing at.

### Defect E0 — the customer site defaulted to the dark theme

The customer app rendered Arabic RTL **dark** by default, with the light theme
reached only through the header toggle or a stored preference. The approved
homepage reference is the light theme, so the default surface a visitor — and
every screenshot — saw first was the wrong one. `apps/customer/src/app/layout.tsx`
and `apps/customer/src/lib/ui-context.tsx` now default to `light`, and the
`themeColor` viewport hint changed from `#00162b` to `#f7f4ed` to match. The dark
theme is unchanged and still applies from the toggle or a stored preference; the
pre-paint bootstrap script already reads the stored value, so a dark-theme
visitor still gets dark on the first frame with no flash.

### Defect E1 — gold was one token doing two incompatible jobs

Gold was both the accent **text** colour (which must be dark on a light surface)
and the metallic **fill** behind dark ink (which must be light). One value cannot
satisfy both, so either accent text failed contrast or the ink on a button
failed it.

**Fix.** The fill ramp is now separate from the accent: `--gold` /
`--gold-hover` are the dark accent pair, and `--gold-fill-from`,
`--gold-fill-to`, `--gold-fill-hover-from`, `--gold-fill-hover-to` are the
metallic ramp. The dark values reproduce the previous `gold-soft → gold` and
`gold → gold-deep` gradients exactly, so the dark theme is unaffected.

### Defect E2 — the ink on a gold fill was not the approved dark ink

While making the fill ramp theme-aware, the ink on a gold fill was pointed at
`--text-inverse`. In the dark theme that value is `#00121f`, whereas the approved
dark controls used `--navy` (`#00162b`). Every dark gold button and the brand
mark therefore shifted by a visible blue step — a 12-unit channel delta.

**Fix.** A dedicated `--on-gold` token was added. Its dark value is the original
navy, so the approved dark theme is pixel-identical; its light value is the warm
charcoal `#241f14`, which reads on the lighter light ramp. The three gold-fill
consumers (`.oryx-brand-mark`, `.oryx-btn-primary`, `.oryx-step__num`) use it.

### Defect E3 — the card caption scrim was dark in both themes

The category-card scrim was a dark gradient in both themes, so the charcoal
light-theme caption landed on a dark scrim. The light theme now has its own
ivory scrim (`--card-scrim`) so the charcoal caption keeps its contrast over the
artwork.

The hero, page-header and panel scrims were then moved onto a shared **navy band**
(`--band`) rather than the page field. In the approved reference the light
homepage keeps a navy hero and a navy footer on an ivory page, and those panels
carry white ink; a scrim built from the ivory `--bg` would have put a pale wash
over the photograph and left white caption ink on a near-white field. Building
them from `--band` keeps the caption contrast and matches the reference. In the
dark theme `--band` equals `--bg` (`#00162b`), so the approved dark render is
unchanged — the token diff in section 4 confirms not one dark value moved.

This is the refinement that made the light theme read as one designed surface
rather than a recoloured dark one. Eleven tokens were added to the light block
(`--band`, `--band-footer`, `--band-text`, `--band-text-muted`,
`--band-text-faint`, `--band-accent`, `--band-border`, `--gold-on-tint`,
`--panel-bg`, `--panel-ink`, `--panel-ink-muted`) and the three scrim tokens
switched from `var(--bg)` to `var(--band)`. The dark block gained the same names
with values that reproduce the previous render exactly. Because the light and
dark blocks now share one vocabulary, a rule no longer needs a theme branch —
which is what the owner asked for when they said to stop scattering overrides.

### Defect E7 — a category-card link that failed contrast, found by the exhaustive sweep

The owner's complaint was that the light theme "still looked inconsistent", and
the fixed-list audit did not find why: every primitive it checked passed. So a
second harness, `.run/sweep-light-contrast.mjs`, was written to walk **every text
node on every customer surface** and measure its rendered contrast against the
actual pixels behind it, rather than trusting a list.

That sweep found a real failure the list had missed:

| Surface | Element | Text | Measured | Required |
|---|---|---|---|---|
| `/` | `.oryx-cat-card__link` | "دليل مزودي الخدمة" | **4.28:1** | 4.5:1 |

The category-card link sat on the ivory card scrim, and the scrim's 10–12% gold
tint lifted the surface to `rgb(231, 229, 223)`; the plain accent gold `#856612`
falls just under the threshold on that tint. This is exactly the "one gold token
doing two jobs" problem of E1, surviving in one rule that the component-level fix
had not reached.

**Fix.** The link now uses `--gold-on-tint` (`#7a5c10`), the token introduced for
gold text on a tinted surface. On that scrim it measures **4.95:1**. In the dark
theme `--gold-on-tint` equals `--gold` (`#d4af37`), so the change is a no-op
there — the dark captures confirm it.

The sweep now reports **0 failures in the light theme**, and the fixed-list audit
agrees (`0 of 23 text pairs below threshold`). The lesson is recorded because it
is the owner's actual point: a fixed list of primitives cannot prove a theme is
consistent, and the exhaustive walk is what found the defect.

### Defect E8 — two dark-theme pairs below threshold, deliberately left alone

The same exhaustive sweep, run in the dark theme, reports two pairs below 4.5:1:

| Surface | Element | Text | Measured |
|---|---|---|---|
| `/` | `.oryx-stat__label` | "مزودو خدمة" | 3.61:1 |
| `/profile` | `.oryx-btn-danger` | "حذف" | 4.27:1 |

Both are **pre-existing in the approved dark theme**, not introduced here: the
stat label uses `--text-faint` (`#6f8598`) and the danger button uses the danger
red, and neither token's dark value changed in this phase (section 4 shows zero
dark values moved). The owner's constraint is that the approved dark theme stays
intact, so correcting them is a separate change with its own approval, not part
of a light-theme correction. They are reported rather than fixed or hidden.

### Defect E4 — an untranslated key on the profile surface

While auditing `/profile` in the light theme, the address "Delete" control
rendered the raw key `common.delete` instead of a word. The customer dictionary
documents the rule that "the UI never falls back to a raw key", and this key was
used by the profile page but defined in neither locale.

**Fix.** `common.delete` was added to both the Arabic (`حذف`) and English
(`Delete`) dictionaries. A parity check confirms the two locales now hold the
same 268 keys and that every key the source references exists in both.

### Defect E5 — the authenticated captures showed the login page

This one is an evidence defect, not a theme defect, and it is the reason the
report was amended after the first draft.

**Symptom.** A pixel comparison of the `after` set found `/dashboard`,
`/profile` and `/login` almost identical — mean absolute difference **0.212**
between the login page and the dashboard, and **0.00** between profile and
dashboard — while the homepage and providers differed by about 16. Three
surfaces cannot be pixel-identical unless they are the same page.

**Cause.** The preview bundle was built with the root `.env`'s absolute
`NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api`. The page is served
same-origin through the preview proxy on port 12001, which routes `/api` to the
API, so the browser saw the API as a *different site*. The customer refresh token
is an HttpOnly `SameSite=Lax` cookie scoped to `/api/v1/customer`, and the
capture script does a full `page.goto` per surface, so the in-memory access token
was dropped and the cross-site refresh cookie was not sent. Every guarded route
therefore redirected to `/login`. This is the recurring operational trap already
recorded as defect 14 in `docs/audit/04_FIXED_DEFECTS.md`: a status-code-only
check passes while the product is broken.

**Fix, in two parts.**

1. The customer app was rebuilt with `NEXT_PUBLIC_API_BASE_URL=/api` (relative,
   same-origin) and `next start` was restarted. A full-reload probe then reached
   `/dashboard` (h1 "Welcome — Demo Customer") and `/profile` (h1 "Profile")
   authenticated.
2. `.run/capture-exec07-phase-e.mjs` now asserts the landing path for any surface
   marked `requiresAuth` and throws if it lands on `/login`. A negative test
   confirmed the guard rejects an unauthenticated `/profile` capture
   (`landed=/login guardRejected=true`), so this failure can no longer be
   committed silently.

**Re-capture.** Both sets were regenerated against the same-origin build: the
`after` set at this head, and the `before` set with `globals.css` reverted to
`b3c9a71` (the `common.delete` dictionary fix retained, since it is text). The
login-to-dashboard mean pixel difference is now **42–63** across the six
viewport/locale pairs in the `after` set and **15–29** in the `before` set, so the
two authenticated surfaces are genuinely distinct in both sets. The capture
manifest records the landing path per authenticated capture, and every one of
them landed on its own route (`/dashboard` on `/dashboard`, `/profile` on
`/profile`) in both sets — the check that defect E5 was about. The dark theme stayed byte-identical across the re-capture (section 4).

**Scope.** The theme change, the palette and the dark-theme constraint are
unchanged by this defect. Only the evidence artifacts were wrong, and they have
been replaced.

## 3. The light palette

Centralised in `packages/shared/src/tokens.ts` (`LIGHT_THEME`) and mirrored into
`:root[data-theme='light']` in `apps/customer/src/app/globals.css`. The two are
pinned to each other by `packages/shared/test/tokens.test.ts`, so they cannot
drift.

| Role | Token | Value |
|---|---|---|
| Page | `--bg` | `#f7f4ed` (ivory) |
| Deep page | `--bg-deep` | `#efeae0` |
| Card | `--surface` | `#ffffff` |
| Raised surface | `--surface-raised` | `#fbf9f4` |
| Hover surface | `--surface-hover` | `#f4f0e8` |
| Body text | `--text` | `#22201d` (charcoal) |
| Muted text | `--text-muted` | `#5a544b` |
| Faint text | `--text-faint` | `#6b6459` |
| Accent text / hairline | `--gold` | `#856612` |
| Accent text on a tinted chip | `--gold-on-tint` | `#7a5c10` |
| Metallic fill | `--gold-fill-from` → `--gold-fill-to` | `#e0c168` → `#c9a227` |
| Ink on fill | `--on-gold` | `#241f14` |
| Navy band (hero / page headers / footer) | `--band` | `#0a1b2f` |
| Navy footer | `--band-footer` | `#0a1b2f` |
| Ink on band | `--band-text` | `#ffffff` |
| Muted ink on band | `--band-text-muted` | `#cdd8e6` |
| Faint ink on band | `--band-text-faint` | `#9fb3c8` |
| Accent on band | `--band-accent` | `#e8c766` |
| Hairline on band | `--band-border` | `rgba(232, 199, 102, 0.24)` |

Every colour a rule uses is one of these tokens; the dark block defines the same
names with the values that reproduce the approved dark render, so a rule reads
one token and gets the right colour in both themes. That is the "centralised
tokens rather than scattered overrides" the owner asked for.

## 4. Why the dark theme is unchanged

The hard constraint is that the approved dark theme must not change. It is
verified three ways, and the three agree.

1. **Token diff — zero values changed.** Comparing the dark `:root` block at the
   phase start (`b3c9a71`) with the current one, **not one of the 24 original
   tokens changed value**; the block grew from 24 to 49 tokens and every
   addition is a new name. `packages/shared/test/tokens.test.ts` pins the values
   the rules depend on, including `DARK_THEME.onGold === '#00162b'`, `band ===
   '#00162b'` and `bandFooter === '#000f1e'`.

   | Check | Result |
   |---|---|
   | Dark tokens before → after | 24 → 49 |
   | Tokens whose **value** changed | **0** |
   | Tokens added | 25 (new names) |
   | Tokens removed | 0 |

2. **Pixel diff — controlled comparison.** `.run/verify-dark-identical.mjs`
   compares the 31 dark captures before and after. Both sets were captured
   against the **same seeded content**, with only the theme source differing, so
   the theme is the only variable.

   | Metric | Result |
   |---|---|
   | Captures compared | 31 |
   | Byte-identical | **23 / 31** |
   | Max-channel-delta histogram | `delta 0: 23, delta 1: 5, delta 2: 1, delta 13: 1, delta 24: 1` |
   | Captures with a **real colour shift** (> 0.05% of pixels above delta 12) | **0** |
   | Captures with only isolated high-delta pixels | 2 |

   The eight captures at delta 1–2 are the largest of the low-delta group. Every
   differing pixel sits in the **header band at y 18–49** — the translucent,
   blurred header that resamples slightly differently between two separately
   built bundles — and the largest of them is **37 pixels out of 329,160
   (0.011%)**. The two captures that carry a high-delta pixel are
   `01-homepage-tablet-en-dark.png` (one pixel, delta 13) and
   `01-homepage-desktop-en-dark.png` (five pixels, deltas 13–24). Every one of
   those pixels is on a gold edge at the extreme left or right of the viewport
   (`x=1`, `x=14–15`, `x=1424–1425`) — antialiasing on the metallic brand mark
   and a gold hairline, not a palette move.

   The byte-identical count moves between runs (20–23 of 31) because each
   capture run rebuilds the app and the header's `backdrop-filter` resamples
   differently against the new bundle; the **real-colour-shift count stays at
   zero in every run**, and that is the metric that matters. An earlier
   same-build comparison reported 30/31 because re-rendering both sides from one
   bundle makes antialiasing bit-identical. The histogram, not the
   byte-identical count, is the honest summary.

3. **Deterministic rendering.** Capturing the same dark surface twice from one
   build produced **0 differing pixels** on `/providers` (mobile, Arabic),
   `/profile` (tablet, English) and `/dashboard` (desktop, Arabic). Rendering is
   deterministic on this host, so the before/after deltas are attributable to the
   build boundary, not to capture noise. The capture harness sets the same
   viewport, device scale and locale on both sides, and waits for `networkidle`
   plus a settle delay before each shot.

## 5. Evidence

The owner asked for authenticated light-theme captures of five customer
surfaces, run as before/after, plus a light-vs-dark comparison.

| Surface | Route |
|---|---|
| Homepage | `/` |
| Customer dashboard | `/dashboard` |
| Provider directory | `/providers` |
| Login | `/login` |
| Profile | `/profile` |

Each surface is captured in Arabic/RTL and English/LTR at desktop (1440),
tablet (834) and mobile (390) — 60 captures per set.

| Artifact | Path |
|---|---|
| Before (`b3c9a71` theme + the i18n fix, no Phase E styling) | `docs/audit/exec07/phase-e/before/` |
| After (Phase E applied) | `docs/audit/exec07/phase-e/after/` |
| Light-vs-dark comparison sheets | `docs/audit/exec07/phase-e/comparisons-after/` |
| Machine-readable capture manifest | `docs/audit/exec07/phase-e/{before,after}/manifest.json` |
| Machine-readable dark verdict | `docs/audit/exec07/phase-e/after/dark-invariance.json` |
| Live computed-style audit | `docs/audit/exec07/phase-e/light-theme-audit.json` |
| Reviewable evidence index | `.run/evidence/exec07-phase-e/index.html` |
| Capture script | `.run/capture-exec07-phase-e.mjs` |
| Dark-integrity verifier | `.run/verify-dark-identical.mjs` |
| Comparison-sheet builder | `.run/make-light-dark-pairs.mjs` |
| Evidence-index builder | `.run/build-phase-e-index.mjs` |
| Preview restart helper | `.run/restart-customer.sh` |

The manifest records, per capture, the HTTP status, horizontal overflow, the
resolved body background and text colour, the accent token and the WCAG contrast
ratio of the body text on that background. All 60 captures returned a status
below 400 with zero horizontal overflow at every viewport.

The two authenticated surfaces (`/dashboard`, `/profile`) are captured only after
the script asserts the landing path, so a lost session fails the run instead of
silently shooting the login page (defect E5). The regenerated `after` manifest
records the authenticated dashboard at `rgb(247, 244, 237)` (ivory) with accent
`#856612`, and the `before` manifest records `rgb(245, 246, 248)` with accent
`#b8912a` — the expected light-theme difference.

## 6. Contrast results

| Check | Command | Result |
|---|---|---|
| Palette pairs (static) | `.run/check-light-palette.mjs` | **31 / 31 pass** |
| Live computed styles | `.run/audit-light-theme.mjs` | **23 / 23 text pairs at or above WCAG; 0 below** |
| Exhaustive rendered sweep (light) | `.run/sweep-light-contrast.mjs` | **0 text pairs below threshold** (found and fixed defect E7) |
| Exhaustive rendered sweep (dark) | `.run/sweep-light-contrast.mjs dark` | **2 pre-existing pairs** (defect E8, left alone) |
| Theme-token contract | `packages/shared/test/tokens.test.ts` | **29 tests pass** |

The live audit composites the background layer stack up to the first opaque
layer, and parses `color(srgb …)` as well as `rgb()`, so translucent headers and
gradient buttons are measured rather than skipped. It records 49 resolved
elements; 23 carry their own text or icon, and those are the pairs WCAG applies
to. The other 26 are layout containers (the hero shell, card frames, page
fields), whose resolved colour is recorded for the record but whose ratio
describes a panel rather than a glyph — the hero container alone would otherwise
report 1.12:1 for a navy panel that renders no text of its own. **Of the 23
text-bearing pairs, 0 fall below their threshold.** The lowest measured pair is
the footer at 4.88:1; body text is 14.79:1 and card text 16.25:1.

## 6.5 Live preview

The staging previews are served from the sandbox ingress. The customer app is on
port 12001 (host `work-2`); the admin app is on port 12000 (host `work-1`).

| Surface | URL |
|---|---|
| Customer homepage, light theme | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/` |
| Customer dashboard | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/dashboard` |
| Provider directory | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/providers` |
| Customer login | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/login` |
| Customer profile | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/profile` |

The theme toggle is the sun/moon control in the header; the locale toggle is the
`ع` / `EN` control beside it. Both were exercised by hand while auditing the
five surfaces.

Every capture in both sets is also browsable as one page, served from the preview
host so a reviewer can compare before and after side by side without cloning the
branch:

| Index | URL |
|---|---|
| Phase E evidence (before / after / light-vs-dark, all viewports and locales) | `https://work-2-wqqgzexpmdagonjk.prod-runtime.all-hands.dev/evidence/exec07-phase-e/index.html` |

## 7. Test results

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **132 passed** (7 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **302 passed** (14 suites) |
| Mobile unit | `pnpm --filter @oryx/mobile test` | **20 passed** (3 files) |
| Customer typecheck | `tsc --noEmit` | **clean** |
| Customer lint | `eslint . --max-warnings=0` | **clean** |
| Admin typecheck / lint / build | `pnpm --filter @oryx/admin …` | **clean; 39 pages built** |
| Customer build | `pnpm --filter @oryx/customer build` | **18 routes built** |
| Dark integrity | `.run/verify-dark-identical.mjs` | **23 / 31 byte-identical; 0 real shifts; histogram `0:23, 1:5, 2:1, 13:1, 24:1`** |
| Light palette | `.run/check-light-palette.mjs` | **31 / 31 pass** |
| Live contrast | `.run/audit-light-theme.mjs` | **0 of 23 text pairs below 4.5:1** |
| Exhaustive light sweep | `.run/sweep-light-contrast.mjs` | **0 text pairs below threshold** |
| i18n parity | `.run/check-customer-i18n.mjs` | **both locales in step, no undefined key** |

CI run [`39185941517`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39185941517)
on head `04f722e`: all three jobs (`Typecheck and build`, `Unit and API
integration tests`, `Browser acceptance tests`) **success**. An earlier run,
[`39184822627`](https://github.com/mohammadaljallad079-rgb/oryx/actions/runs/39184822627)
on `5920895`, was also green.

## 8. Honest limitations

- The theme change is CSS and design-token only. The one exception is the
  `common.delete` dictionary key (defect E4), which is text, not styling. No API,
  database or authorization behaviour was touched, so the API integration suite
  is a regression check rather than a test of this work.
- The dark comparison is byte-identical on 23 of 31 captures and **0** show a
  real colour shift. The eight at delta 1–2 and the six isolated pixels at delta
  13–24 are antialiasing on the blurred header band and on gold edges at the
  viewport margins, all reported rather than hidden. The byte-identical count
  depends on whether both sides are rendered from one bundle; this figure is the
  stricter two-build comparison, so it is the one stated.
- Two dark-theme text pairs sit below 4.5:1 (defect E8). They are pre-existing in
  the approved dark theme and were not changed, because the owner's constraint is
  that the dark theme stays intact. A light-theme correction is not the place to
  alter them; they need their own review.
- The first evidence run was invalid: the preview bundle's absolute API base made
  the browser treat the API as a different site, so the cross-site refresh cookie
  was never sent and `/dashboard` and `/profile` were captured as the login page
  (defect E5). Both sets were regenerated against a same-origin build, and the
  capture script now fails rather than committing that evidence again. The
  preview build must export `NEXT_PUBLIC_API_BASE_URL=/api`, which is the same
  trap recorded as defect 14 in `docs/audit/04_FIXED_DEFECTS.md`.
- This is a staging preview on the sandbox ingress, not a production deployment.
  Nothing was merged and nothing was deployed.
- The comparison sheets are JPEG (derived, for review). The before/after capture
  sets stay lossless PNG because the pixel comparison depends on them.
- The customer app has no unit-test runner, so the i18n parity guard is a `.run/`
  script, not a CI test. Wiring it into CI is left to the owner.
- The preview must be restarted after every rebuild, with the old `next-server`
  child killed first. `next start` spawns a child that outlives its parent and
  keeps the port, so a rebuild replaces the chunk hashes while the old process
  keeps serving the previous manifest: every page then renders blank with a
  `ChunkLoadError`. `.run/restart-customer.sh` does this correctly. This is the
  same class of trap as the stale-`dist` note in `AGENTS.md`.
- The capture harnesses default to the sandbox preview host, which changes when a
  sandbox is recreated. Each reads `ORYX_CUSTOMER_BASE` so a re-run can be
  pointed at the current origin without editing the script.
