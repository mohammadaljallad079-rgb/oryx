import type { Locale, PrintDocumentDto } from '@oryx/shared';
import {
  PRINT_EMBLEM,
  PRINT_FOOTER_LEFT,
  PRINT_FOOTER_RIGHT,
  PRINT_LOGO_MARK,
  PRINT_MASTHEAD_LOCKUP,
  PRINT_TAGLINE,
  PRINT_WATERMARK,
} from './print-assets';

/**
 * Renders a `PrintDocumentDto` into the approved ORYX form.
 *
 * The layout reproduces the approved reference form (`oryx 22 (1).pdf`): every
 * box, rule, label and value sits at the coordinate it occupies on that form,
 * measured in points on an A4 page, instead of being laid out by a flow that
 * drifts with the content. The brand marks are the reference's own vectors,
 * placed at their reference positions.
 *
 * Coordinates are the reference's own PDF coordinates (origin top-left,
 * A4 = 595.28 x 841.89 pt). The reference stores a text run as a glyph box; the
 * helpers here convert a box top to the baseline a browser positions against,
 * using each family's own ascent, so a run lands on the reference's baseline.
 *
 * Every run is a direct child of the page, so `left`/`right` are always measured
 * from the page edge; no nested positioned box can shift a column.
 */

const NAVY = '#0E2A48';
const BORDER = '#94A2B8';
const ROW = '#DBE3EB';
const MUTED = '#64748B';
const INK = '#0F2B48';
const CONTACT = '#475569';

/**
 * Contact icons for the footer.
 *
 * Inline SVG sized to the footer's 7.2pt text. The approved form prints a phone
 * and a globe before the matching detail; a vector icon renders on every host
 * without depending on an emoji-bearing face.
 */
const CONTACT_ICON_PHONE =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 ' +
  '2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.2a2 ' +
  '2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/></svg>';

const CONTACT_ICON_GLOBE =
  '<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>' +
  '<path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"/></svg>';

const PAGE_W = 595.28;
const PAGE_H = 841.89;

/**
 * Distance, in points, from the reference's glyph-box top to the line-box top a
 * browser uses with `line-height:1`. Measured from the reference form; it is
 * the same at every size the form uses.
 */
const GLYPH_OFFSET = 1.43;

/**
 * Reference coordinate to the CSS box top for a `line-height:1` run.
 *
 * The reference stores a text run as its glyph box. A browser positions a run
 * from the line box, and for this face the line box sits 0.155em above the
 * glyphs, so a run placed at the reference's glyph top lands a little high.
 * The helper adds that back, which is what makes a run land on the reference's
 * own position. The factor is the same at every size the form uses.
 */
function topFor(top: number): string {
  return (top + GLYPH_OFFSET).toFixed(2);
}

function esc(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dash(value: string | null | undefined): string {
  return value && String(value).trim().length > 0 ? esc(value) : '—';
}

/**
 * The printed address shows the country name ("Bahrain"), not its code ("BH").
 *
 * The customer record stores an ISO code; the approved form prints the resolved
 * name, so it is looked up rather than echoed. An unknown or absent code yields
 * an empty string, which the caller drops.
 */
function countryName(code: string | null | undefined, locale: Locale): string {
  if (!code) return '';
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== 2) return code.trim();
  try {
    return new Intl.DisplayNames([locale === 'ar' ? 'ar' : 'en'], { type: 'region' }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

/** A run placed by its left edge and baseline. */
function at(x: number, top: number, size: number, extra = ''): string {
  return `left:${x}pt;top:${topFor(top)}pt;font-size:${size}pt;${extra}`;
}

/** A run placed by its right edge and baseline. */
function rightAt(xRight: number, top: number, size: number, extra = ''): string {
  return `left:0;right:${(PAGE_W - xRight).toFixed(2)}pt;top:${topFor(top)}pt;font-size:${size}pt;text-align:right;${extra}`;
}

/** A run centred on `xc` at a baseline. */
function centreAt(xc: number, top: number, size: number, extra = ''): string {
  return `left:${xc.toFixed(2)}pt;top:${topFor(top)}pt;font-size:${size}pt;transform:translateX(-50%);${extra}`;
}

interface Field {
  label: string;
  value: string;
}

/**
 * Column anchors for the items table, in page coordinates.
 *
 * The table frame spans x 27.86 .. 572.73; these are the reference's own anchors
 * for each column, so a value is right-aligned or centred exactly where the
 * approved form puts it regardless of how long the value is.
 */
const COL = {
  desc: 39.5,
  qty: 373.8,
  priceRight: 443.0,
  tax: 483.1,
  amountRight: 565.0,
} as const;

/** Header anchors differ slightly from the body anchors on the reference. */
const HEAD = {
  desc: 37.48,
  qty: 372.04,
  priceRight: 450.63,
  tax: 479.9,
  amountRight: 564.28,
} as const;

/** Rows are a fixed height on the reference, at a fixed pitch. */
const ROW_TOP = 265.06;
const ROW_PITCH = 33.5;

/**
 * How far the approved quotation drops its table and totals below the invoice's.
 *
 * The two forms share a masthead, a title, a TRN strip and an info panel, but
 * the quotation leaves a wider gap before the items table (the reference puts
 * the table header at y 256.7 on the quotation against y 242.4 on the invoice)
 * and the totals move down with it. Without this the quotation's priced rows and
 * totals print ~14pt above where the approved sheet puts them.
 */
const QUOTE_TABLE_SHIFT = 14.3;

export function renderPrintDocument(doc: PrintDocumentDto, locale: Locale): string {
  const rtl = locale === 'ar';
  const company = doc.company;
  const partyName = rtl && doc.party.nameAr ? doc.party.nameAr : doc.party.name;
  // The approved form prints the Arabic title above the Latin one on every
  // document, in both interface languages, so the pair is fixed by the form.
  const title = doc.titleAr;
  const titleAlt = doc.titleEn;
  const trn = company.taxNumber ?? doc.party.taxNumber ?? null;
  // The footer's legal line joins the registered street address to the issuer's
  // city with " - ", then the CR number after " | ", exactly as the approved
  // form prints it (e.g. "Bldg 886, Road 533, Block 405 Tashan - Kingdom of
  // Bahrain | CR 146375-2").
  const legalAddress = [company.addressLine, company.city].filter((x): x is string => Boolean(x && x.trim())).join(' - ');
  // Only the quotation carries a second date, so its presence selects the
  // quotation's taller layout without a separate "is quotation" flag.
  const tableShift = doc.secondaryDateLabel ? QUOTE_TABLE_SHIFT : 0;

  const addressBlock = [doc.party.addressLine, doc.party.city, countryName(doc.party.countryCode, locale)].filter(
    (x): x is string => Boolean(x && x.trim()),
  );

  // The details card: the document's own identity on the left, the customer on
  // the right. A field the document does not carry is omitted, which is how the
  // reference behaves for a document with no expiry date or payment term.
  const leftFields: Array<Field | null> = [
    { label: doc.issueDateLabel, value: doc.issueDateValue ?? '' },
    { label: 'Staf Name', value: doc.staffName ?? '' },
    doc.paymentLabel ? { label: doc.paymentLabel, value: doc.paymentValue ?? '' } : null,
  ];
  const leftRows = leftFields.filter((f): f is Field => f !== null);

  // The details column stacks each label above its value at the positions the
  // approved form uses. The reference spaces its rows unevenly, so the tops are
  // taken from the form rather than derived from one pitch. A second date (the
  // quotation's expiration) shares the first row, printed to the right of the
  // primary date, which is why the quotation's column starts a little lower
  // than the invoice's.
  const LABEL_TOP = [152.05, 176.88, 199.04, 221.6];
  const VALUE_TOP = [161.34, 186.02, 209.68, 232.2];
  const secondary = Boolean(doc.secondaryDateLabel);
  const rowShift = secondary ? 3.23 : 0;
  const leftFieldHtml = leftRows
    .map((f, i) => {
      const label = `<div class="fld" style="${at(37.2, LABEL_TOP[i] + rowShift, 7.28)}">${esc(f.label)}</div>`;
      const value = `<div class="val" style="${at(37.2, VALUE_TOP[i] + rowShift, 8.79)}">${dash(f.value)}</div>`;
      return `\n    ${label}${value}`;
    })
    .join('');

  // A secondary date (the quotation's expiration) prints beside the primary date
  // on the first row, exactly as the approved form lays it out.
  const secondaryHtml =
    secondary && doc.secondaryDateValue
      ? `
    <div class="fld" style="${at(161.69, 154.12 + rowShift, 7.28)}">${esc(doc.secondaryDateLabel ?? '')}</div>
    <div class="val" style="${at(161.69, 163.41 + rowShift, 7.71)}">${esc(doc.secondaryDateValue)}</div>`
      : '';

  const rightFieldHtml = `
    <div class="fld" style="${at(326.9, 130.67, 7.28)}">Customer Name</div>
    <div class="val" style="${at(399.8, 129.66, 8.79)}">${dash(partyName)}</div>
    <div class="fld" style="${at(344.7, 148.40, 7.28)}">Contact No.</div>
    <div class="val" style="${at(400.8, 147.34, 8.79)}">${dash(doc.party.phone)}</div>
    <div class="fld" style="${at(355.4, 163.92, 7.30)}">Address:</div>
    ${addressBlock
      .map((line, i) => `<div class="val" style="${at(402.2, 163.67 + i * 13.96, 8.79)}">${dash(line)}</div>`)
      .join('')}`;

  // Items. A line may carry a product name and, under it, a description; the
  // description is printed on its own smaller line and never replaces the name,
  // exactly as the reference prints the battery and its warranty note. Each
  // line's height follows the number of text lines it holds.
  const rowParts: string[] = [];
  doc.lines.forEach((line, i) => {
    const top = ROW_TOP + tableShift + i * ROW_PITCH;
    const name = dash(line.description);
    const sub = line.subDescription && line.subDescription.trim() ? esc(line.subDescription) : null;
    const band = `<div class="row-band${i % 2 === 0 ? ' row-band--alt' : ''}" style="top:${top.toFixed(2)}pt"></div>`;
    const valueTop = 275.16 + tableShift + i * ROW_PITCH;
    const nameTop = valueTop - (sub ? 5.62 : 0.75);
    const cells = `
    <div class="cell c-qty" style="${centreAt(COL.qty, valueTop, 8.79)}">${esc(line.quantity)}</div>
    <div class="cell c-price" style="${rightAt(COL.priceRight, valueTop, 8.79)}">${esc(line.unitPrice)}</div>
    <div class="cell c-tax" style="${centreAt(COL.tax, valueTop, 8.79)}">${dash(line.taxLabel)}</div>
    <div class="cell c-amt" style="${rightAt(COL.amountRight, valueTop, 8.79)}">${esc(line.amount)}</div>`;
    const subHtml = sub ? `<div class="cell-sub c-desc" style="${at(40.64, valueTop + 7.79, 7.28)}">${sub}</div>` : '';
    rowParts.push(band + `<div class="cell c-desc" style="${at(COL.desc, nameTop, 8.79)}">${name}</div>` + cells + subHtml);
  });

  // The reference spaces the four total rows unevenly, so their baselines are
  // taken from the form rather than derived from a single pitch.
  const TOTAL_TOP = [376.43, 396.73, 415.52, 435.07];
  const totalsRows = [
    { label: 'Untaxed Amount', value: doc.totals.untaxedAmount },
    { label: doc.totals.taxLabel, value: doc.totals.taxAmount },
    { label: 'Discount', value: doc.totals.discount },
  ]
    .map(
      (t, i) => `
    <div class="tlabel" style="${at(255.0, TOTAL_TOP[i] + tableShift, 8.79)}">${esc(t.label)}</div>
    <div class="tvalue" style="${rightAt(569.83, TOTAL_TOP[i] + tableShift, 8.79)}">${esc(t.value)}</div>`,
    )
    .join('');

  const totalTop = TOTAL_TOP[3] + tableShift;
  const CONTACT_TOP = 820.15;
  // The reference prints small vector icons before the phone and the website.
  // An emoji (U+1F4DE / U+1F310) is absent from every installed face and prints
  // as a missing-glyph box, so the icons are inline SVG — a vector needs no font
  // and renders identically on every host, exactly as the approved form does.
  const contactBits: Array<{ x: number; text: string }> = [];
  const contactIcons: Array<{ x: number; svg: string }> = [];
  if (company.phone) {
    contactIcons.push({ x: 284.6, svg: CONTACT_ICON_PHONE });
    contactBits.push({ x: 294.4, text: company.phone });
  }
  if (company.email) contactBits.push({ x: 379.93, text: company.email });
  if (company.website) {
    contactIcons.push({ x: 471.6, svg: CONTACT_ICON_GLOBE });
    contactBits.push({ x: 483.03, text: company.website });
  }


  return `<!doctype html>
<html lang="${rtl ? 'ar' : 'en'}">
<head>
<meta charset="utf-8" />
<title>${esc(doc.documentNumber)}</title>
<style>
  :root {
    --navy:${NAVY};
    --border:${BORDER};
    --row:${ROW};
    --muted:${MUTED};
    --ink:${INK};
    --contact:${CONTACT};
  }
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: "DejaVu Sans", Verdana, Tahoma, sans-serif;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { position:relative; width:${PAGE_W}pt; height:${PAGE_H}pt; background:#fff; overflow:hidden; }

  /* Every text run and every rule is a direct child of the page, so left/right
     always measure from the page edge and no nested box can shift a column. */
  .fld, .val, .docno, .tlabel, .tvalue, .sign-label, .contact, .legal, .page-no,
  .cell, .cell-sub, .th, .title, .trn-text, .thanks {
    position:absolute; line-height:1; white-space:nowrap; font-weight:700;
  }
  .fld { color:var(--muted); }
  .val { color:var(--ink); }

  /* masthead - the reference's own vectors, at the reference's positions */
  .logo-mark { position:absolute; left:16.4pt; top:16.1pt; width:137.6pt; height:44.3pt; }
  /* The Arabic lockup the approved masthead sets immediately right of the rule. */
  .masthead-lockup { position:absolute; left:157.3pt; top:15.8pt; width:54.3pt; height:45.1pt; }
  .tagline { position:absolute; left:433.0pt; top:25.5pt; width:149.0pt; height:28.0pt; }
  .masthead-rule { position:absolute; left:156.47pt; top:16.2pt; height:44.09pt; border-left:1.5pt solid var(--navy); }

  /* document title - centred, Arabic above Latin */
  .title { left:0; width:${PAGE_W}pt; text-align:center; color:var(--navy); font-size:12.28pt; }

  /* details card with the navy registration band across the top */
  .info { position:absolute; left:26.46pt; top:113.55pt; width:545.04pt; height:112.74pt;
          border:1.5pt solid var(--border); }
  /* The navy registration band straddles the card's top border: the approved
     form starts it at y 108.43, above the 113.55 card edge, not inside it. */
  .trn-band { position:absolute; left:26.46pt; top:108.43pt; width:545.34pt; height:16.88pt; background:var(--navy); }
  .trn-text { right:33.0pt; font-size:8.79pt; color:#fff; letter-spacing:0.2pt; }
  .info-rule { position:absolute; left:26.46pt; top:125.19pt; width:543.31pt; border-top:0.75pt solid var(--navy); }
  .docno { color:var(--navy); }

  /* items table - a ruled header strip over unframed alternating light-blue rows.
     The approved form draws the border around the header only (y 233.06-263.56);
     the priced rows below carry no vertical rules and no outer frame. */
  .items-frame { position:absolute; left:27.86pt; top:${(233.06 + tableShift).toFixed(2)}pt; width:544.87pt; height:30.50pt;
                 border:1.5pt solid var(--border); }
  .row-band { position:absolute; left:27.86pt; width:544.87pt; height:30.5pt; }
  .row-band--alt { background:var(--row); }
  .cell, .th { font-size:8.79pt; color:var(--navy); }
  .cell-sub { font-size:7.28pt; color:var(--navy); }
  .th { color:var(--navy); }
  .c-desc { text-align:${rtl ? 'right' : 'left'}; }
  .c-qty, .c-tax { text-align:center; }
  .c-price, .c-amt { text-align:right; }

  /* watermark - the reference's oversized lockup, behind the items and totals */
  .watermark { position:absolute; left:41.9pt; top:252.0pt; opacity:0.10; line-height:0; }
  .watermark svg { display:block; }

  /* totals - right aligned, a rule above the grand total */
  .tlabel { color:var(--ink); }
  .tvalue { color:var(--ink); text-align:right; }
  .totals-rule { position:absolute; left:251.0pt; top:${(433.24 + tableShift).toFixed(2)}pt; width:320.13pt; border-top:0.75pt solid var(--navy); }

  /* notes / warranty box below the totals */
  .notes { position:absolute; left:29.02pt; top:481.17pt; width:544.99pt; height:27.9pt;
           border:1.5pt solid var(--border); }
  /* Relative to .notes, not to the page: the box is itself positioned, so an
     absolute child would otherwise be placed from the page top and fall off it. */
  .notes-text { position:absolute; left:8.95pt; top:5.83pt; right:10.0pt; font-size:8.79pt;
                font-weight:700; color:var(--ink); line-height:1.25; white-space:normal; }

  /* signature plates and footer identity */
  .footer-plate-l { position:absolute; left:14.13pt; top:755.06pt; width:239.79pt; height:51.8pt; }
  .footer-plate-r { position:absolute; left:340.78pt; top:755.06pt; width:239.79pt; height:51.8pt; }
  .emblem { position:absolute; left:256.9pt; top:756.8pt; width:80.5pt; height:19.7pt; }
  .sign-rule { position:absolute; top:798.45pt; border-top:0.7pt dotted var(--border); }
  .sign-rule--l { left:24.22pt; width:219.35pt; }
  .sign-rule--r { left:350.74pt; width:219.46pt; }
  .sign-label { font-size:7.45pt; color:var(--ink); }
  .thanks { left:${PAGE_W / 2}pt; font-size:5.56pt; color:#05162B; transform:translateX(-50%); }

  /* footer - page number, contact row, registration line */
  .foot-rule { position:absolute; left:13.67pt; top:815.28pt; width:566.01pt; border-top:0.75pt solid var(--border); }
  .page-no { font-size:6.5pt; color:var(--muted); font-weight:400; }
  .contact { font-size:7.2pt; color:var(--contact); }
  .contact-icon { position:absolute; width:7pt; height:7pt; }
  .contact-icon svg { display:block; width:7pt; height:7pt; }
  .legal { font-size:6.5pt; color:var(--muted); font-weight:400; }
</style>
</head>
<body>
  <div class="sheet">
    <img class="logo-mark" alt="" src="${PRINT_LOGO_MARK}" />
    <img class="masthead-lockup" alt="اوريكس لخدمات السيارات" src="${PRINT_MASTHEAD_LOCKUP}" />
    <img class="tagline" alt="" src="${PRINT_TAGLINE}" />
    <div class="masthead-rule"></div>

    <div class="title" style="top:${topFor(79.66)}pt">${dash(title)}</div>
    <div class="title" style="top:${topFor(93.91)}pt">${dash(titleAlt)}</div>

    <div class="info"></div>
    <div class="trn-band"></div>
    <div class="trn-text" style="top:${topFor(110.63)}pt">TRN: ${dash(trn)}</div>
    <div class="info-rule"></div>
    <div class="docno" style="${at(37.17, 131.31, 13.28)}">${esc(doc.titleEn)} # ${esc(doc.documentNumber)}</div>
    ${leftFieldHtml}${secondaryHtml}
    ${rightFieldHtml}

    <div class="items-frame"></div>
    <div class="th" style="${at(HEAD.desc, 242.40 + tableShift, 8.79)}">Description</div>
    <div class="th" style="${centreAt(HEAD.qty, 242.40 + tableShift, 8.79)}">Quantity</div>
    <div class="th" style="${rightAt(HEAD.priceRight, 242.40 + tableShift, 8.79)}">Unit Price</div>
    <div class="th" style="${centreAt(HEAD.tax, 242.40 + tableShift, 8.79)}">Taxes</div>
    <div class="th" style="${rightAt(HEAD.amountRight, 242.40 + tableShift, 8.79)}">Amount</div>
    ${rowParts.join('')}

    <div class="watermark">${PRINT_WATERMARK}</div>

    ${totalsRows}
    <div class="totals-rule"></div>
    <div class="tlabel" style="${at(256.91, totalTop, 8.79)}">Total</div>
    <div class="tvalue" style="${rightAt(569.83, totalTop, 8.79)}">${esc(doc.totals.total)}</div>

    <div class="notes">
      <div class="notes-text">${dash(doc.notes ?? doc.amountInWords)}</div>
    </div>

    <img class="footer-plate-l" alt="" src="${PRINT_FOOTER_LEFT}" />
    <img class="footer-plate-r" alt="" src="${PRINT_FOOTER_RIGHT}" />
    <div class="sign-rule sign-rule--l"></div>
    <div class="sign-rule sign-rule--r"></div>
    <div class="sign-label" style="${at(24.3, 759.63, 7.45)}">Authorized Stamp &amp; Signature</div>
    <div class="sign-label" style="${at(351.07, 759.63, 7.45)}">Customer Signature</div>

    <img class="emblem" alt="" src="${PRINT_EMBLEM}" />
    <div class="thanks" style="top:${topFor(787.99)}pt;direction:rtl">شكراً لثقتكم بنا.</div>
    <div class="thanks" style="top:${topFor(796.51)}pt">Thank you for your trust.</div>

    <div class="foot-rule"></div>
    <div class="page-no" style="${at(42.54, 815.88, 6.5)}">Page 1 of 1 • 1</div>
    <div class="page-no" style="${at(94.0, 815.88, 6.5)}">صفحة 1 من 1</div>
    ${contactIcons.map((c) => `<div class="contact-icon" style="left:${c.x}pt;top:${topFor(CONTACT_TOP)}pt">${c.svg}</div>`).join('\n    ')}
    ${contactBits.map((c) => `<div class="contact" style="${at(c.x, CONTACT_TOP, 7.2)}">${esc(c.text)}</div>`).join('\n    ')}
    <div class="legal" style="${rightAt(557.94, 830.51, 6.68)}">${esc([legalAddress, company.crNumber ? `CR ${company.crNumber}` : null].filter(Boolean).join(' | '))}</div>
  </div>
</body>
</html>`;
}
