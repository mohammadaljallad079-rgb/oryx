# Execution 18 — vehicle-inspection report geometry and financial-document parity

This execution is a **verification pass with one focused fix**, not a rebuild.

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
- **One real gap was found and fixed:** the report's brand band sat ~20 pt lower
  than the reference, and its full-bleed cover photograph widened the printable
  area and shifted the whole sheet sideways. See below.

## The fix

`apps/api/src/documents/documents.service.ts`,
`apps/api/src/documents/pdf/pdf-renderer.service.ts`,
`apps/api/src/documents/templates/inspection-report.template.ts`

1. A new `REPORT_PDF_MARGINS` lifts only the report's **top** edge to the
   reference position. The side margins stay at the default because the cover
   photograph's bleed cancels exactly that inset.
2. The photograph is now painted with an absolutely positioned image that
   overflows its in-flow figure. Absolute overflow is clipped by the paper edge;
   it no longer enlarges the printable area, so the header stays on the paper
   margin instead of drifting left.

Measured effect: the report's brand lockup moved from y≈36 pt to **y≈16 pt**,
matching the reference's y≈16 pt. The cover photograph still bleeds to both paper
edges.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `cmp-p1.png`, `cmp-p2.png`, `cmp-p4.png` | reference (left) vs our report (right), pages 1, 2, 4 |
| `report-p1..p5.png` | the five rendered report pages |
| `inspection-report-5page.pdf` | the issued report, five pages |

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
