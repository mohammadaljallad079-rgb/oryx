# Execution 11 — Light-theme correction (Phase E continuation)

This report is the continuation of the Execution 07 Phase E work after the
sandbox failure. The recovery analysis is in `00_SESSION_RECOVERY.md`; this
document covers the correction itself and the evidence for it.

## The request

> The Light Theme colors still look inconsistent and need professional
> correction.

with the following acceptance points:

- Elegant ivory backgrounds.
- White and warm neutral surfaces.
- Deep charcoal typography.
- Sophisticated metallic gold accents.
- Consistent buttons, cards, navigation, forms and tables.
- Professional light-theme contrast.
- Official ORYX logo.
- Existing real automotive photography.
- Keep the approved Dark Theme intact.
- Use centralized theme tokens rather than scattered CSS overrides.

## What was wrong

The two applications disagreed about what "light" means. The customer site and
the dark theme use the approved warm identity — ivory field, deep charcoal type,
metallic gold accent. The admin control plane's light theme used a cold
blue-grey field (`#f5f6f8`) with navy type (`#0d2338`), so the admin app and the
customer app looked like two different products, and the admin light theme read
as an unfinished default rather than a designed theme.

## The correction

`1897db0 fix(exec07): correct the admin light theme to the approved ivory
identity` moves the admin light tokens onto the same identity the customer site
already used:

| Token | Before | After | Role |
| --- | --- | --- | --- |
| `--bg` | `#f5f6f8` | `#f7f4ed` | elegant ivory field |
| `--bg-deep` | `#eceef2` | `#efeae0` | recessed ivory |
| `--surface` | `#ffffff` | `#ffffff` | white surface |
| `--raised` | `#f0f2f6` | `#fbf9f4` | warm neutral raised surface |
| `--text` | `#0d2338` | `#22201d` | deep charcoal type |
| `--text-muted` | `#5b6b7d` | `#5a544b` | warm muted type |
| `--gold` | `#b8912a` | `#7d5f10` | metallic gold, text weight |
| gold fill | — | `#e0c168` … `#c9a227` | metallic gold, fill weight |

Two golds are deliberate: a fill needs a lighter, brighter gold so dark ink reads
on it, while text needs a darker gold to clear contrast on ivory. One value
cannot do both jobs well, so the token set carries both.

The dark-theme block is not touched by this commit. Only the light tokens move.

## Centralization

The light and dark palettes live in exactly two files:

- `apps/admin/src/app/globals.css`
- `apps/customer/src/app/globals.css`

Each declares its tokens under `data-theme="dark"` / `data-theme="light"` on the
`<html>` element. Buttons, cards, navigation, forms and tables are styled from
those tokens; there are no per-page colour overrides. Changing the theme is
changing the tokens, which is what keeps the surfaces consistent with each other.

The preference survives a reload because each app's layout bootstraps
`data-theme` from `localStorage` before first paint — `oryx.theme` / `oryx.locale`
in admin and `oryx.customer.theme` / `oryx.customer.locale` in the customer app.

## Brand assets

- **Official logo:** `docs/assets/logo.png.jpeg` is the source. The build
  (`scripts/preview/gen-brand.cjs`) derives the two theme-aware variants served
  from `public/brand/`: `oryx-logo-on-dark.png` and `oryx-logo-on-light.png`.
  `apps/admin/src/components/brand-logo.tsx` selects the variant for the active
  theme. No invented brand mark is used.
- **Real automotive photography:** 30 committed images with responsive variants
  live in `apps/customer/public/media/` (workshop, car wash, parts store,
  inspection bay, recovery, EV charging, garages). They are real photographs,
  not generated art.

## Verification

Measured against the running stack, not inspected by eye:

| Check | Script | Result |
| --- | --- | --- |
| WCAG contrast, every text/surface pair | `.run/audit-light-theme.mjs` | 0 pairs below threshold |
| Primitive consistency across surfaces | `.run/consistency-audit.mjs` | no inconsistent component properties |
| Dark theme unchanged | `.run/verify-dark-identical.mjs` | 0 captures with a real colour shift |
| Captures match their declared theme | `.run/verify-exec11-theme.mjs` | all 28 captures match |
| RTL/LTR direction | `.run/build-exec11-comparisons.mjs` | every surface renders in the required direction |

Automated suites:

| Suite | Result |
| --- | --- |
| `@oryx/shared` unit | 177 passed (9 files) |
| `@oryx/api` integration | 320 passed (17 suites) |
| `@oryx/admin` browser | 184 passed, 1 skipped, 0 failed (7.3m) |
| `@oryx/mobile` unit | 20 passed (3 files) |
| workspace typecheck | clean across 6 workspaces |
| workspace lint | clean |

## Evidence

`docs/audit/exec11/light-theme/` holds:

- `01-homepage-*`, `02-dashboard-*`, `03-providers-*`, `04-login-*` — the four
  required surfaces in the light theme, Arabic RTL and English LTR, at desktop,
  tablet and mobile.
- `05-admin-dashboard-*` — the corrected admin surface, light and dark.
- `cmp-*-light-vs-dark.png` — a side-by-side sheet per surface and locale, with
  the dark render as the control.

## A defect found and fixed while verifying

Regenerating the audit screenshots exposed a labelling bug in
`apps/admin/e2e/audit.spec.ts`. The bilingual/themed/responsive test runs a
locale × theme loop and then, still inside the same test, captures the tablet and
mobile dashboards. It set the viewport but not the locale or the theme, so the
page kept whatever the loop left behind — the last iteration is English light —
while the files were written as `dashboard-tablet-ar-dark.png` and
`dashboard-mobile-ar-dark.png`. The dark evidence for the two smallest viewports
was therefore an English light render, and had been since the test was written.

The fix sets `ar` and `dark` explicitly and asserts `data-dir="rtl"` and
`data-theme="dark"` before the capture, so the file name and the pixels cannot
disagree again. Re-running the test now produces the approved navy
(`rgb(0,22,43)`) render for both.

This is a test-evidence defect, not a product defect: the admin dark theme itself
was correct throughout.

## Not done

Production deployment and production acceptance remain blocked on server access
and credentials, which this sandbox does not hold. Nothing in this report claims
a deployment happened.
