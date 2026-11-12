# Execution 18 — vehicle-inspection report geometry and financial-document parity

This execution is a **verification pass with one focused fix**, not a rebuild.

Every image below is **embedded**, so it renders directly on GitHub. Click an
image to open it full size.

## What was inspected

| Reference | What it is | Pages |
| --- | --- | --- |
| `oryx 22.pdf` | the approved tax invoice **and** quotation (one shared layout) | 2 |
| `oryx out put.pdf` | the approved vehicle-inspection report | 5 |

## Result of the inspection

- **Financial documents already match `oryx 22.pdf` coordinate-for-coordinate.**
  The server-issued invoice, quotation, purchase order, purchase invoice,
  payment receipt, payment voucher and statements all render the official logo
  lockup, the `AUTO SERVICES` watermark, the TRN strip and the contact footer at
  the same positions as the reference (measured deltas ≤ 2 pt). The admin print
  view carries the same chrome.
- **The inspection report already renders the full five-page structure** when the
  operator selects the four approved inspection types: cover / liability, paint
  & body, chassis & undercarriage, interior-exterior-engine-road, computer unit.
- **Two real gaps were found and fixed this execution:**
  1. The brand band sat ~20 pt lower than the reference, and the full-bleed cover
     photograph widened the printable area and shifted the whole sheet sideways
     (fixed earlier on this branch).
  2. The **vehicle-information band was only half width** — it shared a row with
     the QR card, so the cover did not read like the reference, which prints a
     **full-width** information band and places the verification QR **inside the
     photograph band, bottom-right**. This execution restructures the cover to
     match. See below.

## The fix

`apps/api/src/documents/templates/inspection-report.template.ts`

1. The cover's `Vehicle Information` block is now a **single full-width band**
   (`width:100%`) instead of a flex row beside the QR card. The `cover-grid` /
   `cover-verify` split is gone.
2. The verification QR is now painted **inside the photograph band**, anchored to
   the physical bottom-right over a white card so the modules stay scannable —
   matching the reference. Physical `right`/`bottom` is used because the page is
   RTL and the reference anchors the code to the visual right regardless of
   direction.
3. New tests: `prints the vehicle photograph as a full-width band on the cover`
   and `overlays the verification QR on the cover photograph band`.

Measured effect: the information band now spans x≈33.5–561.5 pt (full content
width, matching the reference's x≈25–570 band) and the QR sits at x≈479–549 pt,
bottom-right over the photograph — instead of a 250 pt right-hand column.

## Reference vs our output

Each sheet is the approved reference (left, navy band) beside our rendered
output (right, green band).

### Page 1 — cover / vehicle information

![Report page 1: reference vs ours](parity-p1.png)

### Page 2 — paint and body

![Report page 2: reference vs ours](parity-p2.png)

### Page 3 — chassis and undercarriage

![Report page 3: reference vs ours](parity-p3.png)

### Page 4 — interior, exterior, engine, road test

![Report page 4: reference vs ours](parity-p4.png)

### Page 5 — computer unit

![Report page 5: reference vs ours](parity-p5.png)

## Tax invoice — reference `oryx 22.pdf` vs the issued invoice

![Tax invoice: reference vs ours](invoice-ref-vs-ours.png)

## The five rendered report pages on their own

| Page 1 | Page 2 | Page 3 | Page 4 | Page 5 |
| --- | --- | --- | --- | --- |
| ![p1](report-p1.png) | ![p2](report-p2.png) | ![p3](report-p3.png) | ![p4](report-p4.png) | ![p5](report-p5.png) |

## Modals and themes (area 2)

| Light (EN) | Dark (EN) | Light (AR, RTL) |
| --- | --- | --- |
| ![modal light en](modal-branch-light-en.png) | ![modal dark en](modal-branch-dark-en.png) | ![modal light ar](modal-branch-light-ar.png) |

## Live screens (areas 3–7)

| HR employees | Branches | Leave | Chart of accounts |
| --- | --- | --- | --- |
| ![hr](live-hr-employees.png) | ![branches](live-branches.png) | ![leave](live-leave.png) | ![coa](live-chart-of-accounts.png) |

| Inspections list | Inspection form (base/VAT/total) | Sales invoice list | Documents register |
| --- | --- | --- | --- |
| ![insp list](live-inspections-list.png) | ![insp form](inspection-create-modal-light-en.png) | ![invoices](live-sales-invoice-list.png) | ![docs](live-documents-register.png) |

## Seven requirement areas — current verified state

Each area was inspected against the running system. Areas 2–7 were already
implemented and DB-backed; this execution re-verified them with fresh evidence
and left the working code unchanged.

| # | Area | State | Evidence |
| --- | --- | --- | --- |
| 1 | Sales invoice layout, logo, company block, subtotal/discount/VAT/total, per-line pricing, QR | matches `oryx 22.pdf`; QR decodes out of the rendered PDF | `invoice-ref-vs-ours.png`, `our-sales-invoice.pdf` |
| 2 | Modals: z-index, backdrop, light-theme colours, RTL/LTR, dark unchanged | scrim `z-index:60` over all chrome; opaque surface | `modal-branch-light-en.png`, `modal-branch-dark-en.png`, `modal-branch-light-ar.png` |
| 3 | HR documents, extra phone, employment end date, preview/download under permission | multipart upload, persisted, permission-gated | `live-hr-employees.png` |
| 4 | Branch create/edit field parity and persistence | create carries every edit field; API persists all | `live-branches.png` |
| 5 | Leave ISO 8601 start/end date validation | bare dates normalised before `@IsISO8601()`; create/edit/approve work | `live-leave.png` |
| 6 | Chart of accounts type and parent dropdowns, edit/save | reclassifies, refuses cycles, excludes self+descendants | `live-chart-of-accounts.png` |
| 7 | Inspection base price, VAT rate, VAT amount, total incl. VAT, service images, booking form, date picker | full breakdown returned and shown | `inspection-create-modal-light-en.png`, `live-inspections-list.png` |

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @oryx/shared test` | 235 passed |
| `pnpm --filter @oryx/api test` | 82 passed |
| `pnpm --filter @oryx/api test:e2e` | 746 passed, 41 suites, 0 failed |
| `execution08-remediation` suite (areas 3–7) | 18 passed |
| `pnpm --filter @oryx/admin build` | success |
| `pnpm --filter @oryx/admin lint` | clean (0 warnings) |
| QR decoded from rendered invoice PDF | `https://oryxbhr.com/verify/<token>` |

## Not done (honest status)

- The reference uses the owner's licensed typefaces (CodecPro / TSSafaa). Those
  files are not in the repository, so the Arabic/Latin faces differ at the glyph
  level even though the layout, positions and colours match.
- The reference's cover artwork is embedded as a raster image in the PDF, so an
  exact pixel match of the cover graphic is not achievable from the assets in
  the repository.
