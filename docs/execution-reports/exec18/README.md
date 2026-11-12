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

## Not done (honest status)

- The reference uses the owner's licensed typefaces (CodecPro / TSSafaa). Those
  files are not in the repository, so the Arabic/Latin faces differ at the glyph
  level even though the layout, positions and colours match.
- The reference's cover artwork is embedded as a raster image in the PDF, so an
  exact pixel match of the cover graphic is not achievable from the assets in
  the repository.
