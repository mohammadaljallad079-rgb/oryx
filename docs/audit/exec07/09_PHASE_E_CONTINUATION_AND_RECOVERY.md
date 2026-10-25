# Execution 07 — Phase E continuation, and the second session recovery

The previous conversation ended with:

> Sandbox error — This conversation's sandbox encountered an error. The history
> above is read-only.

This records the recovery, then the Phase E light-theme continuation the owner
asked for. It states plainly what is on the remote and what, if anything, was
lost.

## Recovery

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| Branch | `feature/execution-07-premium-web` |
| `origin/feature/execution-07-premium-web` | `35a94f56d30d9552b4531ffead849a244bfca23e` |
| Local `HEAD` before this session | `35a94f56d30d9552b4531ffead849a244bfca23e` |
| Last confirmed push (owner-supplied) | `b3c9a71eaeaea0eb4ae5aa1ab141a1511a10de37` |
| PR #7 | open, **draft**, head `35a94f5`, base `audit/execution-05-verification`, not merged |
| PR #6 | open, not draft, not merged |

**Local and remote were identical.** `git rev-list --left-right --count
HEAD...origin/feature/execution-07-premium-web` returned `0 0`, so the crashed
session had pushed everything it committed. The owner-supplied `b3c9a71` is an
ancestor of `HEAD` — `git merge-base --is-ancestor b3c9a71 HEAD` succeeds, and
65 commits sit between them. Nothing was reset, force-pushed or discarded.

### Unpushed work lost with the crash

**None found, and none is claimed.** The sandbox's working tree was inspected
before anything else was changed. It held only the mobile demo edits described
below, which are now committed. Every other file in the tree matched
`35a94f5` exactly. The reflog holds only this branch's own history, and the
dangling objects `git fsck` reports are the amend supersessions of commits that
are themselves on the remote — no dangling object contains product work the
remote lacks. If the crashed session made an edit and never wrote it to disk,
that edit left no trace and cannot be reconstructed; it is not reported as
recovered.

The 45 untracked files under `.run/` are working aids the earlier sessions left
behind — ad-hoc probes and diagnostics, not product code and not referenced by
any committed report. This session committed only the two capture scripts its own
evidence depends on (`capture-phase-e-light.mjs`, `build-phase-e-light-pairs.mjs`),
following the branch's practice of keeping the scripts a report cites.

## What this session changed

Two things, both requested: the mobile demo's dead controls, and the light
theme. The dark theme was not touched.

### 1. Mobile demo — every visible action now responds

Nine controls across `apps/mobile` called `onPress={() => undefined}`, so a tap
did nothing and read as a broken button. Each now does the work its label
promises, on the screen's own copy, and reports the outcome through a new shared
`Notice` primitive so no action is silent:

| File | Control | Now does |
| --- | --- | --- |
| `app/(tabs)/account.tsx` | (missing) | the customer→merchant switch the other role tab had |
| `app/addresses.tsx` | add address | appends a visible demo address |
| `app/wallet.tsx` | top-up | appends a ledger entry and moves the balance |
| `app/bookings/index.tsx` | book now | opens the provider directory |
| `app/merchant/orders.tsx` | advance status | advances the order and re-counts the queue |
| `app/merchant/products.tsx` | delete | two-step confirm, then removal |
| `app/merchant/promotions.tsx` | publish | controlled form; publishing lists the offer |
| `app/merchant/services.tsx` | accept / decline | resolves the request; add service lists it |
| `app/merchant/profile.tsx` | edit | opens a real inline description editor |

`grep -rn "onPress={() => undefined}" apps/mobile/src` now returns nothing.
Nothing is persisted, and the existing demo notice still says so.

Verification:

- `pnpm --filter @oryx/mobile typecheck` — clean.
- `pnpm --filter @oryx/mobile lint` — clean.
- `pnpm --filter @oryx/mobile test` — **46/46** pass.

### 2. Light theme — the correction is already on the branch

The palette correction itself landed before the crash, in
`6de6031 refactor(customer): drive the light theme from tokens, not scattered
overrides` and the Phase E commits around it. This session verified it rather
than rewriting it, because rewriting a working, measured palette would risk the
dark theme for no gain.

The light theme is centralised, not scattered:

- `apps/admin/src/app/globals.css` defines one `:root[data-theme='light']`
  block; the only other light-scoped rules are the two logo swap rules.
- `apps/customer/src/app/globals.css` defines one light block, one
  light+RTL scrim-angle block, and the logo swaps. There is no per-component
  light override left.

It matches the owner's brief:

| Requirement | Value in the token block |
| --- | --- |
| Elegant ivory background | `--bg: #f7f4ed`, `--bg-deep: #efeae0` |
| White and warm-neutral surfaces | `--surface: #ffffff`, `--surface-raised: #fbf9f4` |
| Deep charcoal typography | `--text: #22201d`, `--text-muted: #5a544b` |
| Metallic gold accents | `--gold-fill-from: #e0c168` → `--gold-fill-to: #c9a227` |
| Official logo | `oryx-logo-on-light.png`, swapped per theme in both apps |
| Real photography | unchanged; photo surfaces keep the navy scrim and white ink |

### Contrast is measured, not asserted

| Check | Result |
| --- | --- |
| `.run/check-admin-light-palette.mjs` | all pairs pass |
| `.run/check-light-palette.mjs` | **33/33** pairs meet their threshold |

Representative pairs: gold accent on deeper ivory 4.98:1, ink on the gold fill
top stop 9.36:1, success on ivory 4.56:1, white tile title on the photo scrim
17.57:1.

### The dark theme is provably unchanged

`.run/verify-dark-theme-invariance.mjs` compares the committed dark captures
against the current render, restricted to the header chrome band — the band the
token layer paints, which carries no photograph:

```
31 dark captures compared
captures whose theme chrome moved: 0
```

Zero. The whole-frame deltas it also reports are page content (a replaced hero
photograph, a longer seeded company list), which the script classifies
separately. As a second, independent witness, this session's diff touches no
`.css` file and no file under `public/brand/`.

## Evidence

Committed under `docs/audit/exec07/phase-e-light/`:

- **20 captures** — homepage, customer dashboard, provider directory and
  sign-in, each in Arabic RTL and English LTR at desktop, tablet and handset,
  plus a light/dark pair of the homepage.
- `comparisons/` — the homepage in both themes side by side, and a contact sheet
  of the four review surfaces.
- `manifest.json` — every capture with the theme, direction and resolved tokens
  recorded at capture time, so the evidence carries its own proof.

Each capture was taken from the running stack, not composed. The dashboard and
directory shots are signed in as the demo consumer, and the resolved tokens in
the manifest confirm the render: `bg=#f7f4ed surface=#fff text=#22201d
gold=#7d5f10` in light, `bg=#00162b surface=#021f3a text=#eef3f9 gold=#d4af37`
in dark.

### A trap worth recording

The first comparison-sheet script wrote sheets that were entirely background.
`page.setContent` runs on an `about:blank` origin, which is not allowed to read
`file://` subresources, so each `file://` image rendered as an empty box. The
sheets now inline the captures as data URIs. The broken sheets were deleted
rather than committed.

## Test results

| Suite | Result |
| --- | --- |
| `@oryx/shared` unit | **180/180** |
| `@oryx/api` integration | **334/334** |
| `@oryx/mobile` unit | **46/46** |
| Preview build + verify | 61 page/theme combinations, **0 issues** |
| Preview link crawl | **318** pages, **0** bad responses |

The admin Playwright suite is not re-run here: this session changed no admin
source, so the suite would re-test the same code. It is unchanged from the
`35a94f5` result recorded in the Phase E report.

## Still open

- The PR is still a **draft**. It is not merged and nothing is deployed.
- The full-stack preview cannot be hosted on GitHub Pages: Pages serves static
  files only, so the NestJS API and PostgreSQL are not available there. The
  Pages preview shows the committed evidence; the live app needs a host that
  runs the stack. This is the same limitation `docs/PREVIEW.md` already records.
