# Execution 07 Phase E — light-theme correction, final pass

This is the closing record for the owner's request:

> The Light Theme colors still look inconsistent and need professional
> correction.

The recovery analysis is in `../06_SESSION_RECOVERY_AND_LIGHT_THEME.md`. This
document covers what was still wrong after the earlier passes, what changed, and
the measured evidence.

## What was still wrong

The earlier passes had already moved the admin light theme onto the ivory
identity and unified most of the gold. Two defects survived, and they are the
ones that read as "inconsistent":

1. **Gold was doing two jobs with one token.** A gold *text* colour on an ivory
   field must be dark enough to clear contrast; a gold *tint fill* must be light
   enough for dark ink to read on it. The admin badge used the text gold
   (`--gold`) as the foreground on a gold tint, so the badge label was the same
   colour family as its own background and washed out. The customer theme had
   already solved this with a separate `--gold-on-tint`; the admin theme had not.
2. **Five rules wrote their own gold.** `.oryx-badge--gold`, the collapsed nav
   marker, the nav active gradient (LTR and RTL) and the focus ring each wrote
   `color-mix(in srgb, var(--gold) N%, transparent)` inline. Four different
   percentages meant four slightly different golds on the same screen — exactly
   the "scattered overrides" the brief names.

There was also a missing token: the admin light block never declared
`--gold-hover`, so a hovered gold control had no defined colour.

## The correction

All in `apps/admin/src/app/globals.css`:

- Added the named gold-tint ramp to **both** theme blocks:
  `--tint-wash`, `--tint-fill`, `--tint-focus`, `--tint-glow`,
  `--tint-active`, `--tint-line`, `--tint-badge-line`, `--tint-ring`,
  `--tint-panel`.
- Added `--gold-hover` and `--gold-on-tint` to both blocks.
- `.oryx-badge--gold` now reads `background: var(--tint-fill)`,
  `border-color: var(--tint-badge-line)`, `color: var(--gold-on-tint)`.
- The collapsed nav marker reads `var(--tint-active)`.
- The nav active gradient (LTR and RTL) reads
  `linear-gradient(..., var(--tint-wash), transparent)`.

Every rule now takes a named step. No rule body writes its own gold.

## Keeping the approved dark theme intact

The dark ramp keeps the percentages the admin rules already used — badge
15%/40%, collapsed nav 18%, nav gradient 20% — rather than adopting the customer
site's. Centralising under shared names removes the overrides; keeping the values
keeps the approved dark render unchanged. `scripts/check-token-parity.mjs` lists
those four as an explicit, reasoned exemption so the divergence is visible rather
than hidden.

Measured: 12 of 14 dark captures are **byte-identical** (0.000% changed pixels)
to the pre-change baseline. The two that differ are the audit-log pages, and the
same delta appears between two captures taken with no code change at all — it is
live data, not a colour shift. The light block is not exempt and matches
`LIGHT_THEME` exactly.

## Evidence

Captured with the repository's own scripts against the built apps.

| Claim | Measurement | Result |
| --- | --- | --- |
| Token contract holds | `node scripts/check-token-parity.mjs` | 0 violations (admin dark 0 missing/0 divergent; admin light 0/0; customer 0/0) |
| Contrast is professional | `node scripts/audit-light-contrast.mjs` | 0 failing pairs across 1380 rendered text nodes (WCAG 4.5:1 body, 3:1 large/UI) |
| Both apps agree on light | `node scripts/probe-light-chrome.mjs` | 5/5 surfaces resolve `#f7f4ed` page / `#22201d` text |
| Dark theme unchanged | `node scripts/characterise-dark-delta.mjs` | 12/14 captures 0.000% changed; 2 are live-data variance |
| Ramp is centralised | `packages/shared/test/tokens.test.ts` | new admin contract suite; 180 shared tests pass |

The previews the brief asks for are in this directory:

| # | Preview | File |
| --- | --- | --- |
| 1 | Homepage — light | `homepage-light-ltr-desktop.png`, `homepage-light-rtl-desktop.png` |
| 2 | Customer dashboard — light | `dashboard-light-rtl-desktop.png` |
| 3 | Provider directory — light | `providers-light-ltr-desktop.png`, `providers-light-rtl-desktop.png` |
| 4 | Login — light | `login-light-ltr-desktop.png`, `login-light-rtl-desktop.png` |
| 5 | Light vs dark | `comparisons/*.png` (8 side-by-side sheets) |

Responsive and direction coverage: `homepage`, `providers` and `login` at
mobile (390×844), tablet (834×1112) and desktop (1440×900) in Arabic RTL and
English LTR; the admin surfaces at mobile, tablet and desktop too. No capture
reports horizontal overflow.

Contact sheets: `00-light-theme-contact-sheet.png` (46 shots),
`01-dark-theme-contact-sheet.png` (28 shots).

The official ORYX lockup is already wired for both themes
(`apps/{admin,customer}/public/brand/oryx-logo-on-{dark,light}.png`, swapped by
`:root[data-theme='light']`), and the approved photography is the 30 committed
images under `apps/customer/public/media/`. Neither needed a change in this pass.

## The regression guard

`packages/shared/test/tokens.test.ts` gained a suite that binds the admin
stylesheet to the same contract the customer suite already enforced: every
shared token the admin reads must be declared in both blocks, the ramp steps must
be the shared set, and no rule body may write its own gold. Reverting the
stylesheet to the pre-fix revision makes it fail, so the guard is real.

## What this pass did not do

- No redesign. Only the two defects above and the missing token.
- No new execution, no unrelated component.
- No change to the customer theme, the dark theme's values, the logo or the
  photography.
