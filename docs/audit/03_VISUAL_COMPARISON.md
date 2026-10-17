# ORYX — Visual Comparison Report

Audit date: 2026-10-16

## Reference

`docs/assets/ORYX Auto Services Dashboard.png` — owner-approved dashboard
reference, **1536 × 1024**, RGB. This file is tracked in the repository.

## Live capture

`docs/audit/screenshots/dashboard-reference-viewport-ar-dark.png` — the actual
implemented dashboard, captured in a real headless Chromium at the **same
1536 × 1024** viewport, Arabic RTL, dark theme. Captured by `audit.spec.ts`.

Like-for-like comparison is therefore valid: identical pixel dimensions and
identical viewport.

## Measured difference

Produced by `scripts/audit-compare.py`.

| Metric | Value |
|---|---|
| Mean absolute difference per channel (R, G, B) | 34.74, 32.54, 32.90 (of 255) |
| RMS difference per channel | 70.58, 58.95, 54.45 |
| Reference dominant colours | `#00182f` 32%, `#172a40` 21%, `#3f4855` 15%, `#001124` 12%, `#818281` 10% |
| Live dominant colours | `#021f3a` 39%, `#000f1f` 27%, `#03162a` 15%, `#031e38` 8%, `#203648` 7% |

### Region divergence (4×4 grid, mean absolute difference 0–255)

| | col 1 | col 2 | col 3 | col 4 |
|---|---|---|---|---|
| **row 1** | 58.3 | 59.8 | 23.4 | 41.6 |
| **row 2** | 49.6 | 37.7 | 36.7 | 29.6 |
| **row 3** | 44.2 | 47.5 | 47.4 | 29.1 |
| **row 4** | 11.7 | 13.6 | 12.3 | 13.2 |

## Interpretation

The two images are **palette-compatible but not pixel-identical**. Read together
with the region grid:

1. **Palette agreement.** Both images are dominated by deep navy. The reference
   clusters on `#00182f` / `#001124`; the implementation clusters on `#021f3a` /
   `#000f1f`. These are the same navy family a few steps apart. The difference is
   a tonal choice, not a different brand colour.
2. **Structural divergence is concentrated at the top-left and middle rows.** The
   highest divergence (rows 1–3, columns 1–2: 37–60) is where the reference
   carries the hero headline, statistics and its photographic tiles. The
   implementation reproduces the layout and the tiles, but its tiles are
   **original vector artwork** (`scripts/generate-tile-art.py`) rather than the
   reference's photography — so those regions differ in content even where they
   agree in placement. The reference is never used as artwork (defect 5 in
   `04_FIXED_DEFECTS.md`).
3. **The bottom band agrees closely** (row 4: 11.7–13.6). This is the dense
   tabular area, where both use the same navy panels and light text.
4. **The lightest region of the reference (`#818281`, 10%) has no counterpart in
   the live capture.** That grey is photographic and neutral-toned content. The
   implementation has no such neutral mass, which is consistent with the missing
   original photography.

## What cannot be claimed

The official ORYX logo is present (`docs/assets/logo.png.jpeg`, owner upload
`699560c`) and drives the admin sidebar, the admin login page and the customer
header through `.run/gen-brand.cjs`. The original approved photography was never
supplied, however, and the reference screenshot itself is the only approved
design asset present. Consequently:

- The logo is the owner's real mark, colourway-swapped per theme. It is not a
  placeholder.
- Module tiles use original vector artwork generated in-repo
  (`scripts/generate-tile-art.py`), served as SVG. They are real, purpose-drawn
  automotive motifs, but they are not the owner's original photography at native
  resolution. The approved reference is never used as artwork.
- **Full visual parity is therefore not claimed.** The navy/gold identity,
  layout, tile-led structure, RTL support and theming follow the approved
  reference; the source photography is still required from the owner.

## Artifacts

| File | Contents |
|---|---|
| `docs/audit/comparison/live-side-by-side.png` | reference and implementation at equal scale |
| `docs/audit/comparison/live-diff-amplified.png` | 4× amplified difference heatmap |
| `docs/audit/screenshots/dashboard-{ar,en}-{dark,light}.png` | bilingual and themed captures |
| `docs/audit/screenshots/dashboard-{tablet,mobile}-ar-dark.png` | responsive captures |
| `docs/audit/screenshots/dashboard-reference-viewport-ar-dark.png` | the like-for-like capture |

## Required to close the gap

1. The official ORYX logo as a transparent vector or high-resolution PNG.
2. The original approved dashboard photography at native resolution.
3. Confirmation of the exact navy and gold brand values if they differ from the
   current tokens.

With those three items the tiles and the brand mark can be replaced and this
report can be re-run to measure true parity.
