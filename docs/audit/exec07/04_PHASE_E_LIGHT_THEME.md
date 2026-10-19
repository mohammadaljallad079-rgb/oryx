# Execution 07 — Phase E: Light-Theme Correction

Report date: 2026-10-18
Branch: `feature/execution-07-premium-web`
Pull request: [#7](https://github.com/mohammadaljallad079-rgb/oryx/pull/7)
Head at the start of this phase: `b3c9a71`
Status: **Phase E complete; owner review pending**

This report covers the light-theme correction and the session recovery that
preceded it. Every claim names the script that produced it and the artifact it
wrote.

## 1. Session recovery

The previous session ended with a sandbox error, so the first step was to
establish what actually existed on the remote before touching anything.

| Question | Finding | How it was checked |
|---|---|---|
| Remote branch tip | `b3c9a71eaeaea0eb4ae5aa1ab141a1511a10de37` | `git ls-remote --heads origin` |
| Commits beyond the last known SHA | **none** | `git ls-remote` shows the tip is exactly `b3c9a71` |
| Local HEAD | `b3c9a71` — in step with the remote | `git log --oneline -1` |
| PR #7 | open, draft, head `b3c9a71`, base `audit/execution-05-verification` | GitHub REST `pulls/7` |
| PR #6 | open, head `604e36a`, base `main` | GitHub REST `pulls/6` |
| Unpushed work recoverable from the sandbox | **none** | see below |

**No lost unpushed commit was recovered, and none is claimed.** The crashed
sandbox left no reachable commit that is absent from `origin`. The Phase E
working-tree edits that did survive are the light-theme changes in
`apps/customer/src/app/globals.css` and `packages/shared/src/tokens.ts`; the
`after` captures from the crashed session were rebuilt here rather than trusted,
because a rebuild was needed to make them reproducible (section 4).

The Execution 07 work that was already pushed — the premium design (Phase C),
the photography and category fix (Phase D) — is present and untouched on the
branch.

## 2. What the owner reported, and what was actually wrong

The owner said the light theme "still looked inconsistent and needs professional
correction". The light theme had already been reworked, so the inconsistency had
a structural cause rather than one wrong hex. Four defects were found: three in
the theme and one in the customer dictionary on a surface this phase captures.

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
ivory scrim (`--card-scrim`), and the hero/panel/head scrims follow the page
background so the photograph still shows on the right.

### Defect E4 — an untranslated key on the profile surface

While auditing `/profile` in the light theme, the address "Delete" control
rendered the raw key `common.delete` instead of a word. The customer dictionary
documents the rule that "the UI never falls back to a raw key", and this key was
used by the profile page but defined in neither locale.

**Fix.** `common.delete` was added to both the Arabic (`حذف`) and English
(`Delete`) dictionaries. A parity check confirms the two locales now hold the
same 268 keys and that every key the source references exists in both.

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
| Metallic fill | `--gold-fill-from` → `--gold-fill-to` | `#e0c168` → `#c9a227` |
| Ink on fill | `--on-gold` | `#241f14` |

## 4. Why the dark theme is byte-identical

The hard constraint is that the approved dark theme must not change. That is
verified three ways.

1. **Token diff.** The dark `:root` block keeps the original values for every
   colour it had; the added tokens are new names, and `--on-gold` carries the
   original navy. `packages/shared/test/tokens.test.ts` asserts
   `DARK_THEME.onGold === '#00162b'`.
2. **Pixel diff.** `.run/verify-dark-identical.mjs` compares the 31 dark
   captures before and after: **31 / 31 are byte-identical** — the max-channel
   delta histogram is `delta 0: 31`, and **0** captures show a real colour shift
   (delta > 12). Both sets were produced by `.run/capture-exec07-phase-e.mjs`
   against a build of the same revision, so the comparison isolates the theme
   change.
3. **Independent re-render.** The comparison is reproducible: rebuilding each
   side from the same revision and re-capturing produced an exact match on every
   dark surface. An earlier draft run had one surface off by 19 channel values of
   delta 1 on the `backdrop-filter` corner of the "Sign out" button; regenerating
   both baselines removed it, confirming it was run-to-run antialiasing rather
   than a style change.

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
| Live computed-style audit | `docs/audit/exec07/phase-e/light-theme-audit.json` |
| Capture script | `.run/capture-exec07-phase-e.mjs` |
| Dark-integrity verifier | `.run/verify-dark-identical.mjs` |
| Comparison-sheet builder | `.run/make-light-dark-pairs.mjs` |

The manifest records, per capture, the HTTP status, horizontal overflow, the
resolved body background and text colour, the accent token and the WCAG contrast
ratio of the body text on that background. All 60 captures returned a status
below 400 with zero horizontal overflow at every viewport.

## 6. Contrast results

| Check | Command | Result |
|---|---|---|
| Palette pairs (static) | `.run/check-light-palette.mjs` | **31 / 31 pass** |
| Live computed styles | `.run/audit-light-theme.mjs` | **0 pairs below 4.5:1** |
| Theme-token contract | `packages/shared/test/tokens.test.ts` | **26 tests pass** |

The live audit composites the background layer stack up to the first opaque
layer, and parses `color(srgb …)` as well as `rgb()`, so translucent headers and
gradient buttons are measured rather than skipped. The lowest measured pair is
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

## 7. Test results

| Suite | Command | Result |
|---|---|---|
| Shared unit | `pnpm --filter @oryx/shared test` | **129 passed** (7 files) |
| API integration | `pnpm --filter @oryx/api test:e2e` | **302 passed** (14 suites) |
| Customer typecheck | `tsc --noEmit` | **clean** |
| Customer lint | `eslint . --max-warnings=0` | **clean** |
| Dark integrity | `.run/verify-dark-identical.mjs` | **31 / 31 byte-identical** |
| Light palette | `.run/check-light-palette.mjs` | **31 / 31 pass** |
| Live contrast | `.run/audit-light-theme.mjs` | **0 below 4.5:1** |
| i18n parity | `.run/check-customer-i18n.mjs` | **both locales in step, no undefined key** |

## 8. Honest limitations

- The theme change is CSS and design-token only. The one exception is the
  `common.delete` dictionary key (defect E4), which is text, not styling. No API,
  database or authorization behaviour was touched, so the API integration suite
  is a regression check rather than a test of this work.
- The dark comparison is exact because both capture sets were regenerated from
  the same revision. An earlier draft run had one surface off by 19 channel
  values of delta 1 on a `backdrop-filter` corner; regenerating both baselines
  removed it. That residual is reported rather than hidden, but the final
  artifact carries none of it.
- This is a staging preview on the sandbox ingress, not a production deployment.
  Nothing was merged and nothing was deployed.
- The comparison sheets are JPEG (derived, for review). The before/after capture
  sets stay lossless PNG because the pixel comparison depends on them.
- The customer app has no unit-test runner, so the i18n parity guard is a `.run/`
  script, not a CI test. Wiring it into CI is left to the owner.
