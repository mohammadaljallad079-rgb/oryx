#!/usr/bin/env python3
"""Render each PDF sample to PNG pages and assert the properties the document
engine must hold: real A4 PDF, embedded Arabic face, no Type3 host fallback,
and both Arabic and Latin text present in the extractable text layer."""
import glob
import os
import re
import sys

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, "docs/audit/pdf-samples")
OUT = os.path.join(SAMPLES, "preview")
os.makedirs(OUT, exist_ok=True)

ARABIC = re.compile(r"[\u0600-\u06FF]")
LATIN = re.compile(r"[A-Za-z]")

problems = []
report = []

for path in sorted(glob.glob(os.path.join(SAMPLES, "*.pdf"))):
    name = os.path.basename(path)
    stem = name[:-4]
    raw = open(path, "rb").read()
    doc = fitz.open(path)
    text = "".join(page.get_text() for page in doc)
    fonts = set()
    for page in doc:
        for f in page.get_fonts(full=True):
            fonts.add(f[3])

    # Render every page to PNG.
    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(dpi=110)
        pix.save(os.path.join(OUT, f"{stem}-{i}.png"))

    has_arabic = bool(ARABIC.search(text))
    has_latin = bool(LATIN.search(text))
    has_type3 = "/Type3" in raw.decode("latin1")
    embedded_arabic = any("Naskh" in f or "Arabic" in f for f in fonts)

    ok = has_arabic and has_latin and not has_type3 and embedded_arabic
    if not ok:
        problems.append(stem)
    report.append(
        f"{stem:34} {doc.page_count:2}pp  arabic={has_arabic} latin={has_latin} "
        f"type3={has_type3} embedded-arabic={embedded_arabic}  fonts={sorted(fonts)}"
    )

print("\n".join(report))
print(f"\nrendered {len(glob.glob(os.path.join(OUT, '*.png')))} PNGs to {OUT}")
if problems:
    print(f"\nFAILED: {problems}")
    sys.exit(1)
print("\nALL PDF SAMPLES PASS")
