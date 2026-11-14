# Execution 19 — Inspection report parity: measured difference list

Reference: `oryx out put.pdf` (5 pages, A4 595.5 × 842.2 pt).
Comparison produced by rendering the product template and measuring both PDFs
with PyMuPDF (`text` spans + `get_image_rects`), plus pixel scans of the
extracted reference images.

Page map (both documents):

| PDF page | Document page | Content |
| --- | --- | --- |
| 1 | 1 | Cover — vehicle info, photograph, terms, signatures |
| 2 | 2 | Vehicle Paint & Body Check |
| 3 | 3 | Chassis & Undercarriage Condition |
| 4 | 4 | Interior & Exterior / Engine Compartment / Road Test |
| 5 | 5 | Computer Unit Inspection |

## Reference element geometry (measured)

Header (every page): text lockup, navy `#0a1f44`.
- `اوريـكس` / `لخـدمات` / `السيارات` three-line stack at x158–213, y16/31/46, 14.5pt.
- `AUTO SERVICES` at x21–151, y49, 14.2pt.
- `خبراء فحص المركبات` at x442–550, y28, 11.8pt; `VEHICLE INSPECTION EXPERTS` at x438–553, y43, 7.9pt.
- Cover title `تقرير فحص المركبة` y78 / `VEHICLE INSPECTION REPORT` y90.

Footer (every page): navy `AUTO SERVICES` wordmark x42–118 y780 (8.3pt); bilingual
thank-you y793/802 (5.6pt); page counter `Page N of 5 • N من 5 صفحة` x42–121 y817
(6.5pt); contacts row `+973 37702020` / `oryxbhr1@gmail.com` / `www.oryxbhr.com`
y817 (7.2pt); address + CR y827 (6.5pt). Verification QR logo band x14–254 and
x340–580, y755–807 (334×72 pt images).

## Differences found

1. **Header** — ours renders the logo *image* at x33.5–217.3 y15.8–57.8; the
   reference prints a text lockup with the tagline on the right. Close but the
   left lockup is an image, not the three-line wordmark; tagline sizes differ
   (ours 11pt/7.6pt vs reference 11.8pt/7.9pt).
2. **Footer** — ours emits `N / 5` (footerTemplate) or the official contacts row;
   the reference prints the bilingual counter plus the four-item contacts row on
   **every** report page. Page-number wording differs (`Page 1 of 5 • 5`).
3. **Page 2 (paint)** — ours draws the drawing plus a **marker table** the
   reference does not have; reference is drawing + one legend row
   (`sectioned/Change/Filler/Paint`, y654) + a remarks box (y686–732).
4. **Page 3 (chassis)** — ours puts the eight region boxes in a **2-column list
   to the right** of the drawing. The reference **centres the drawing** and
   distributes the eight boxes around it (Front top-centre x249 y179, Front Left
   x57 y245, Front Right x450 y244, Middle Left x57 y353, Middle Right x440
   y353, Rear Left x59 y481, Rear Right x441 y481, Rear bottom-centre x247 y582)
   with connector lines to the drawing.
5. **Page 4** — reference prints `(Pass)`/`(Fail)`/`N/A` legend chips and puts
   General Inspection Remarks at the bottom; ours uses stacked `اجتياز/Pass`
   chips. Item counts match the catalogue (12 interior, 6 exterior, 13 engine,
   13 road test).
6. **Page 5** — reference is the computer-unit page with a faults table; there is
   **no external computer-PDF upload/merge** in the product, which the brief
   requires.
7. **Page numbering** — reference `Page 1 of 5 • 1 من 5 صفحة`; ours differs.
8. **Fonts** — reference uses CodecPro / TSSafaa / Verdana / Arial; only
   Verdana/Arial/Noto are bundled (CodecPro & TSSafaa are not in the repo).

## Fixes applied in this execution

- Chassis page rebuilt: drawing centred, eight region boxes distributed around it
  at the reference positions with connector lines (item 4).
- Paint page rebuilt: drawing centred, single legend row in reference order, no
  invented marker table, remarks box at the reference position (item 3).
- Footer: bilingual page counter `Page N of 5 • N من 5 صفحة` (item 7).
- Computer-unit page: external diagnostic PDF upload, storage, validation and
  merge into the issued report as one PDF (item 6).

## Remaining differences (honest)

- Header left lockup is still the bundled logo image, not a text lockup: the
  CodecPro/TSSafaa faces are not in the repository.
- Font shapes differ for the same reason; layout positions are matched.
- Marker table removed from page 2 to match the reference; the marker data still
  prints as the dots on the drawing.
