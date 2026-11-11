# Execution 07 — Phase E, third session: recovery and the light-theme inconsistency

The previous conversation ended with:

> Sandbox error — This conversation's sandbox encountered an error. The history
> above is read-only.

This records the recovery first, states plainly what is on the remote and what
was lost, and then continues Phase E: the owner's outstanding complaint that
"the light theme colours still look inconsistent".

## 1. Recovery

| Item | Value |
| --- | --- |
| Repository | `mohammadaljallad079-rgb/oryx` |
| Branch | `feature/execution-07-premium-web` |
| `origin/feature/execution-07-premium-web` | `d7a39bea288d3f84fe2a208d453d29455c3c2065` |
| Local `HEAD` at the start of this session | `d7a39be` (identical to the remote) |
| Owner-supplied "last confirmed push" | `b3c9a71eaeaea0eb4ae5aa1ab141a1511a10de37` |
| PR #7 | open, **draft**, head `d7a39be`, base `audit/execution-05-verification`, not merged |
| PR #6 | open, not draft, head `audit/execution-05-verification`, base `main`, not merged |

### 1.1 The owner-supplied SHA is an ancestor, not the tip

`b3c9a71` exists, but it is **73 commits behind** the branch tip. Its message is
`docs(exec07): record green CI run 39161406862 in the Phase D report`, which
places it inside Phase D. The crashed session pushed well past it:

```
$ git merge-base --is-ancestor b3c9a71 HEAD   # exits 0 — it is an ancestor
$ git rev-list --count b3c9a71..HEAD          # 73
```

The branch tip is `d7a39be docs(mobile): preserve the approved mockups and
locate the official logo`. **Nothing between `b3c9a71` and `d7a39be` is
missing.**

### 1.2 Was anything lost?

**No product work, and none is claimed as recovered.** The check was:

- **Local `HEAD` equalled the remote tip** at the start of the session, so the
  crashed sandbox had already pushed every commit it made.
- **The stash `safety-snapshot-exec07-mobile-marketplace` was inspected.** It is
  a pre-Phase-E snapshot of the *old* baseline: it still carries
  `app/(tabs)/parts.tsx`, `sensage.tsx`, `services.tsx` and `search.tsx` as
  tabs, has no `components/launch.tsx`, and its `bookings` is still a tab. Every
  file it holds already exists on the remote in a *later* form. It contains no
  work the remote lacks.
- **The 43 untracked `.run/*.mjs` diagnostics** left by earlier sessions are
  working aids — ad-hoc probes and one-off image diagnostics. None is referenced
  by a committed report, and none is product code.

If the crashed session made an edit and never wrote it to disk, that edit left
no trace and cannot be reconstructed. It is not reported as recovered.

### 1.3 What this session committed to the branch

| Commit | Contents |
| --- | --- |
| `5c8526b` | `feat(mobile): build the approved splash, homepage and five-tab shell` — the Phase E mobile work that was on disk but unpushed |

That commit was corrected before it was finalised: an initial `git add -A` had
swept in the 43 untracked diagnostic scripts. They were removed from the commit
and left on disk as the working aids they are.

## 2. Phase E — the light-theme inconsistency, found and fixed

### 2.1 The palette itself was already correct

The light theme was centralised before this session: one
`:root[data-theme='light']` block in each app's `globals.css`, with no
per-component overrides. Its measured contrast passes:

| Check | Result |
| --- | --- |
| `.run/check-light-palette.mjs` | **33/33** pairs meet their threshold |
| `.run/check-admin-light-palette.mjs` | all pairs pass |

So rewriting the palette was not the fix — the tokens already met the brief
(ivory `#f7f4ed`, white `#ffffff` and warm-neutral `#fbf9f4` surfaces, charcoal
`#22201d` type, metallic gold `#e0c168 → #c9a227`). Rewriting a measured,
working palette would have risked the approved dark theme for no gain.

### 2.2 The real defect: the 404 painted white

To find the inconsistency the palette check cannot see — *surface* consistency —
this session sampled the painted page field on every customer route
(`.run/probe-light-surfaces.mjs`). Two routes stood out:

```
route            theme  --bg       body field                warmth
/                light  #f7f4ed    rgb(247, 244, 237)       8.5
/services        light  #f7f4ed    rgb(247, 244, 237)       8.5
...
/marketplace     light  #f7f4ed    rgb(255, 255, 255)       0.0   <-- white
/about           light  #f7f4ed    rgb(255, 255, 255)       0.0   <-- white
```

`/marketplace` and `/about` are not routes; they are 404s. Next.js's built-in
not-found injects its own stylesheet after the app's:

```css
body{color:#000;background:#fff;margin:0}
```

That `body{background:#fff}` overrode `body { background: var(--bg) }`, so **an
unknown URL painted a flat white field on the ivory light theme** — a visible
inconsistency against every other page — and a white field on the navy dark
theme as well. It was invisible to the contrast sweep because the 404 text is
black-on-white, which is legible; only the *surface* was wrong.

### 2.3 The fix

Declare a not-found for each app, which replaces Next's document and keeps the
page on the theme's own `--bg`:

| File | Change |
| --- | --- |
| `apps/customer/src/app/not-found.tsx` | new — themed 404 using the existing `StatePanel`, linking home and services |
| `apps/admin/src/app/not-found.tsx` | new — themed 404 using the existing `Card` and `EmptyState` |
| `apps/customer/src/i18n/dictionaries.ts` | 5 `notFound.*` keys, Arabic and English |
| `apps/admin/src/i18n/dictionaries.ts` | 3 `notFound.*` keys, Arabic and English |
| `apps/customer/src/app/globals.css` | `.oryx-not-found` layout, appended only |

No token was changed and no dark-theme rule was touched. The customer diff to
`globals.css` is 22 appended lines at the end of the file.

### 2.4 The result is measured

`.run/probe-light-surfaces.mjs` after the fix:

```
warmth spread across routes: 0.0
```

Every route — including the 404 — now paints the same ivory field. The admin
404 respects both themes (`rgb(247,244,237)` in light, `rgb(0,22,43)` in dark).

`.run/sweep-light-all-routes.mjs` now walks the 404 as a sixteenth route and
still reports **0 text pairs below their WCAG threshold**.

## 3. The dark theme is unchanged

Two independent witnesses:

1. `.run/verify-dark-theme-invariance.mjs` — 31 committed dark captures compared
   against the current render, restricted to the header chrome band the token
   layer paints: **0 captures whose theme chrome moved.**
2. This session's diff touches no dark-theme token and no file under
   `public/brand/`.

## 4. Evidence

Committed under `docs/audit/exec07/phase-e-light/`, regenerated from the running
stack after the fix:

- **24 captures** — homepage, customer dashboard, provider directory and
  sign-in, each in Arabic RTL and English LTR at desktop, tablet and handset,
  plus the homepage as a light/dark pair at desktop and mobile.
- `comparisons/` — the homepage in both themes side by side, and a contact sheet
  of the review surfaces.
- `manifest.json` — every capture with its theme, direction and resolved tokens
  recorded at capture time (`bg=#f7f4ed surface=#fff text=#22201d gold=#7d5f10`
  in light; `bg=#00162b surface=#021f3a text=#eef3f9 gold=#d4af37` in dark).

The official ORYX lockup ships as `oryx-logo-on-light.png` /
`oryx-logo-on-dark.png` and is swapped per theme in both apps.

## 5. Still open

- The PR remains a **draft**. It is not merged and nothing is deployed.
- The APK remains the outstanding deliverable for the mobile demo. It is built
  and described in `docs/audit/exec07/08_MARKETPLACE_DEMO_AND_SESSION_RECOVERY.md`;
  a launch on a real handset is the one check this environment cannot perform
  (no `/dev/kvm`, no emulator, no attached device).
