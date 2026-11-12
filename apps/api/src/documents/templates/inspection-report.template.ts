import {
  BODY_PANELS,
  CHASSIS_REGIONS,
  PAINT_CONDITIONS,
} from '@oryx/shared';
import {
  BODY_SCHEME_DATA_URI,
  CHASSIS_DIAGRAM_DATA_URI,
  INTERIOR_DIAGRAM_DATA_URI,
} from './inspection-artwork.assets';
import {
  signatureBlock,
  verificationBlock,
  type DocumentChrome,
} from './chrome';
import { esc, escMultiline, grouped, orDash } from './html.util';
import type {
  InspectionReportPayload,
  InspectionReportSection,
  DocumentIssuer,
  DocumentVerification,
} from '../document-payload';

/**
 * The ORYX Vehicle Inspection Report.
 *
 * The document is the approved five-page form: an identification cover, a paint
 * and body page, a chassis page, an interior/exterior/engine/road-test page and
 * a computer-unit page. The page plan is not computed here — it comes from
 * `planInspectionReport`, so the printed pagination is the same rule the tests
 * assert; this module only draws the pages it is handed.
 */

export interface InspectionReportInput {
  issuer: DocumentIssuer;
  payload: InspectionReportPayload;
  documentNumber: string;
  issuedAt: Date;
  version: number;
  verification: DocumentVerification | null;
}

/**
 * A pass/fail mark, drawn as a vector rather than a text glyph.
 *
 * The bundled faces carry no U+2713 / U+2715 / U+2717, so Chromium synthesises a
 * Type3 bitmap font from whatever host face has the glyph. That breaks the PDF
 * text layer and makes the output depend on the host. A vector mark has no font
 * dependency.
 */
type MarkKind = 'check' | 'cross' | 'x';
function markGlyph(kind: MarkKind, sizePt: number): string {
  const stroke =
    `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ` +
    `stroke-linejoin="round" fill="none"`;
  const body: Record<MarkKind, string> = {
    check: `<path d="M3 8.2 6.3 11.4 12.2 3.2" ${stroke}/>`,
    cross: `<path d="M3.2 3.2 11.8 11.8 M11.8 3.2 3.2 11.8" ${stroke}/>`,
    x: `<path d="M4 4 11 11 M11 4 4 11" ${stroke}/>`,
  };
  return (
    `<svg class="mark mark-${kind}" width="${sizePt}" height="${sizePt}" ` +
    `viewBox="0 0 15 15" aria-hidden="true">${body[kind]}</svg>`
  );
}

/** A pass/fail/NA cell mark, matching the approved form's tick / cross / N-A. */
function resultMark(result: string): string {
  switch (result) {
    case 'PASS':
      return `<span class="rm rm-pass">${markGlyph('check', 11)}</span>`;
    case 'FAIL':
      return `<span class="rm rm-fail">${markGlyph('cross', 11)}</span>`;
    case 'NA':
      return '<span class="rm rm-na">N/A</span>';
    default:
      return '<span class="rm rm-unset">·</span>';
  }
}

/** The bilingual title band that heads the reference page. */
function pageTitleBar(titleAr: string, titleEn: string): string {
  return `
  <div class="p-title">
    <span class="p-title-ar">${esc(titleAr)}</span>
    <span class="p-title-en">${esc(titleEn)}</span>
  </div>`;
}

/**
 * The compact brand band the reference prints at the head of every page: the
 * mark on one side, the company name and the inspection tagline on the other.
 *
 * Drawn from the configured issuer so the same band appears on the report and
 * the financial documents; with no configured logo it falls back to the same
 * neutral monogram the shared chrome uses.
 */
function reportHeader(issuer: DocumentIssuer): string {
  const initials = (issuer.nameEn || 'ORYX')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const mark = issuer.logoDataUri
    ? `<img class="rh-logo" src="${esc(issuer.logoDataUri)}" alt="${esc(issuer.nameEn)}">`
    : `<div class="rh-monogram">${esc(initials || 'OR')}</div>`;
  return `
  <header class="report-head">
    <div class="rh-left">
      ${mark}
      <div class="rh-name">
        <span class="rh-name-ar">${esc(issuer.nameAr || issuer.nameEn)}</span>
        <span class="rh-name-en">${esc(issuer.nameEn)}</span>
      </div>
    </div>
    <div class="rh-right">
      <span class="rh-tag-ar">خبراء فحص المركبات</span>
      <span class="rh-tag-en">VEHICLE INSPECTION EXPERTS</span>
    </div>
  </header>`;
}

/** A legend chip with a vector mark and its bilingual label. */
function legendChip(kind: MarkKind, ar: string, en: string): string {
  return `<span class="lg-chip">${markGlyph(kind, 10)}${esc(ar)} / ${esc(en)}</span>`;
}

/**
 * The job and vehicle strip repeated under the title on every section page.
 *
 * Reproduces the reference: the job number and timestamp on one line, then a
 * band carrying the VIN, plate, car and odometer. The values are the session
 * snapshot, so a later edit to the vehicle record cannot rewrite a printed page.
 */
function jobStrip(p: InspectionReportPayload): string {
  const v = p.vehicle;
  const when = new Date(p.inspectedAt);
  const stamp = Number.isNaN(when.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bahrain',
      }).format(when);
  const car = `${v.make} ${v.model} (${v.modelYear})`;
  return `
  <div class="job-head">
    <span class="job-date num">${esc(stamp)}</span>
    <span class="job-no num">JOB #${esc(p.jobNumber)}</span>
  </div>
  <div class="vstrip">
    <div class="vcell"><span class="vcell-lab"><span class="ltr">Car</span> السيارة</span><span class="vcell-val">${esc(car)}</span></div>
    <div class="vcell"><span class="vcell-lab"><span class="ltr">Plate No.</span> رقم اللوحة</span><span class="vcell-val num">${esc(orDash(v.plateNumber))}</span></div>
    <div class="vcell"><span class="vcell-lab"><span class="ltr">VIN Number</span> رقم القاعدة (الشاصي)</span><span class="vcell-val num">${esc(v.vin)}</span></div>
    <div class="vcell"><span class="vcell-lab"><span class="ltr">ODO Meter</span> عداد المسافات</span><span class="vcell-val num">${esc(grouped(v.odometer))} km</span></div>
  </div>`;
}

/** The fixed legal texts, taken verbatim from the approved reference. */
const LIABILITY_AR =
  'اوريكس لخدمات السيارات ليست مصنّعة للمركبات ولا بائعة لها، ولن تتحمل اي مسؤولية عن عيوب تصنيعية أو أضرار غير مُفصح عنها أو غير مُبلغ عنها. يقتصر دور اوريكس لخدمات السيارات على إجراء فحص بصري وفحص بأجهزة تقنية لتحديد الإصلاحات والأضرار السابقة والظاهرة التي لحقت بالمكونات الميكانيكية والهيكلية، ودون تقديم أي ضمان للسلامة الهيكلية أو الصلاحية العامة للسير على الطرق. أنت توافق على انحصار مسؤولية اوريكس لخدمات السيارات في فحص المركبة داخله وبالأدوات المعتمدة في المركز ووفق حدود الباقة المختارة فقط، دون أدنى مسؤولية عن أي خدمات غير مشمولة بالباقة أو عن حالة المركبة قبل دخولها وبعد خروجها منه. وبناءً عليه يُصدر التقرير الفني ليعكس نتيجة الفحص ضمن نطاق الباقة المحددة حصرا.';

const LIABILITY_EN =
  'Oryx Auto Services is neither a vehicle manufacturer nor a seller and assumes no liability for manufacturing defects or undisclosed or unreported damage. The role of Oryx Auto Services is limited to conducting visual and technical inspections to identify existing or prior damage and necessary repairs regarding mechanical and structural components; it provides no guarantee regarding structural integrity or general roadworthiness. You acknowledge that the liability of Oryx Auto Services is strictly limited to the inspection performed on site using the centre\u2019s approved tools and within the scope of the selected service package; the company bears no responsibility for services not included in the package or for the vehicle\u2019s condition prior to its arrival at or after its departure from the centre. Accordingly, the technical report is issued to reflect inspection results exclusively within the scope of the specified package.';

const IMPORTANT_REMARKS_AR = [
  'يتم إصدار التقرير بواسطة أجهزة الفحص الإلكتروني المعتمدة.',
  'أي كشط أو حذف أو تغيير في محتويات التقرير يجعله لاغياً وغير معتمد.',
  'يصف التقرير حالة السيارة أثناء وجودها داخل المركز فقط.',
  'المركز غير مسؤول عن المتعلقات الشخصية المتروكة داخل السيارة.',
  'تتطلب بعض الحالات اختبار قيادة إضافي للتحقق من أداء ناقل الحركة والأجزاء الميكانيكية.',
];

const IMPORTANT_REMARKS_EN = [
  'The report is issued by approved electronic inspection devices.',
  'Any erasure, deletion or change in the contents of the report renders it invalid and unsupported.',
  'The report describes the condition of the vehicle while it is inside the centre only.',
  'The centre is not responsible for personal belongings left inside the car.',
  'Some cases require an additional test drive to check the performance of the transmission and mechanical parts.',
];

/** The numbered Important Remarks block. */
function importantRemarks(): string {
  return `
  <div class="remarks-block avoid-break">
    <div class="remarks-title">ملاحظات هامة<span class="ltr">Important Remarks</span></div>
    <div class="remarks-cols">
      <ol class="remarks-list">
        ${IMPORTANT_REMARKS_AR.map((t) => `<li>${esc(t)}</li>`).join('')}
      </ol>
      <ol class="remarks-list ltr">
        ${IMPORTANT_REMARKS_EN.map((t) => `<li>${esc(t)}</li>`).join('')}
      </ol>
    </div>
  </div>`;
}

/** The Limitation of Liability block. */
function liabilityBlock(): string {
  return `
  <div class="terms avoid-break">
    <div class="terms-title">الشروط والأحكام ومسؤولية الفحص<span class="ltr">Terms, Conditions &amp; Liability Disclaimer</span></div>
    <div class="terms-sub">تحديد المسؤولية القانونية<span class="ltr">Limitation of Liability</span></div>
    <div class="terms-cols">
      <p class="terms-ar">${esc(LIABILITY_AR)}</p>
      <p class="terms-en ltr">${esc(LIABILITY_EN)}</p>
    </div>
  </div>`;
}

/**
 * The vehicle photo band on the identification cover.
 *
 * The approved report prints the vehicle photograph as a wide band across the
 * middle of the cover, bleeding past the side margins. The frame keeps that
 * proportion (a wide band, not a thumbnail) so the printed sheet reads the same
 * as the reference. A session with no attached photograph prints the neutral
 * placeholder rather than an empty frame, so the cover never shows a broken
 * image.
 */
function vehiclePhoto(
  p: InspectionReportPayload,
  verification: DocumentVerification | null | undefined,
): string {
  // The approved cover prints the verification QR inside the photograph band,
  // anchored to its lower right. A white quiet zone is kept around the modules
  // so a scanner can still resolve it against the picture.
  const qr = verification?.qrDataUri
    ? `<div class="cover-qr">
        <span class="cover-qr-cap">للتأكد من صحة التقرير<span class="ltr">Scan to verify</span></span>
        <img src="${esc(verification.qrDataUri)}" alt="Document verification QR code">
      </div>`
    : '';
  if (p.vehiclePhotoDataUri) {
    return `
    <figure class="vphoto vphoto--bleed">
      <img class="vphoto-img" src="${esc(p.vehiclePhotoDataUri)}" alt="${esc(`${p.vehicle.make} ${p.vehicle.model}`)}">
      ${qr}
    </figure>`;
  }
  return `
    <figure class="vphoto vphoto--bleed vphoto-empty">
      <div class="vphoto-ph">لا توجد صورة مرفقة للمركبة<span class="ltr">No vehicle photograph attached</span></div>
      ${qr}
    </figure>`;
}

/** The identification cover (page 1). */
export function identificationPage(input: InspectionReportInput, chrome: DocumentChrome): string {
  const p = input.payload;
  const v = p.vehicle;
  const when = new Date(p.inspectedAt);
  const stamp = Number.isNaN(when.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bahrain',
      }).format(when);
  return `
  <section class="doc-page">
    ${reportHeader(chrome.issuer)}
    ${pageTitleBar('تقرير فحص المركبة', 'VEHICLE INSPECTION REPORT')}
    <div class="cover-info">
      <div class="cover-sec-title">معلومات المركبة<span class="ltr">Vehicle Information</span></div>
      <table class="vinfo">
        <tr>
          <td><span class="vlab"><span class="ltr">Customer Name</span><span class="var">اسم العميل</span></span><span class="vval">${esc(p.customerName)}</span></td>
          <td><span class="vlab"><span class="ltr">Contact No.</span><span class="var">رقم التواصل</span></span><span class="vval num">${esc(orDash(p.contactNumber))}</span></td>
          <td><span class="vlab"><span class="ltr">Date &amp; Time</span><span class="var">التاريخ والوقت</span></span><span class="vval num">${esc(stamp)}</span></td>
          <td><span class="vlab"><span class="ltr">Job No.</span><span class="var">رقم العمل</span></span><span class="vval num">${esc(p.jobNumber)}</span></td>
        </tr>
        <tr>
          <td><span class="vlab"><span class="ltr">Plate No.</span><span class="var">رقم اللوحة</span></span><span class="vval num">${esc(orDash(v.plateNumber))}</span></td>
          <td><span class="vlab"><span class="ltr">Car Make</span><span class="var">نوع السيارة</span></span><span class="vval">${esc(v.make)}</span></td>
          <td><span class="vlab"><span class="ltr">Car Model</span><span class="var">طراز السيارة</span></span><span class="vval">${esc(v.model)}</span></td>
          <td><span class="vlab"><span class="ltr">Car Year</span><span class="var">سنة الصنع</span></span><span class="vval num">${esc(v.modelYear)}</span></td>
        </tr>
        <tr>
          <td><span class="vlab"><span class="ltr">ODO Meter</span><span class="var">عداد المسافات</span></span><span class="vval num">${esc(grouped(v.odometer))} km</span></td>
          <td><span class="vlab"><span class="ltr">Car Color</span><span class="var">لون السيارة</span></span><span class="vval">${esc(orDash(v.color))}</span></td>
          <td colspan="2"><span class="vlab"><span class="ltr">VIN Number</span><span class="var">رقم القاعدة (الشاصي)</span></span><span class="vval num">${esc(v.vin)}</span></td>
        </tr>
      </table>
    </div>
    ${vehiclePhoto(p, input.verification)}
    ${liabilityBlock()}
    ${importantRemarks()}
    ${signatureBlock([
      { ar: 'اعتماد المركز', en: 'Authorized Stamp & Signature' },
      { ar: 'توقيع العميل', en: 'Customer Signature', name: p.customerName },
    ])}
  </section>`;
}

/** The paint and body page (page 2). */
export function paintSectionPage(
  input: InspectionReportInput,
  section: InspectionReportSection | undefined,
): string {
  if (!section) return '';
  return `
  <section class="doc-page">
    ${reportHeader(input.issuer)}
    ${pageTitleBar('فحص الصبغ وبدن المركبة', 'VEHICLE PAINT & BODY CHECK')}
    ${jobStrip(input.payload)}
    ${paintDiagram(section)}
  </section>`;
}

/** The chassis page (page 3). */
export function chassisSectionPage(
  input: InspectionReportInput,
  section: InspectionReportSection | undefined,
): string {
  if (!section) return '';
  return `
  <section class="doc-page">
    ${reportHeader(input.issuer)}
    ${pageTitleBar('فحص الشاصي وأسفل المركبة', 'CHASSIS & UNDERCARRIAGE CONDITION')}
    ${jobStrip(input.payload)}
    ${chassisDiagram(section)}
  </section>`;
}

/** The interior/exterior/engine/road-test page (page 4). */
export function inspectionGroupPage(
  input: InspectionReportInput,
  sections: InspectionReportSection[],
): string {
  const byArea = new Map(sections.map((s) => [s.area, s]));
  const interior = byArea.get('INTERIOR');
  const exterior = byArea.get('EXTERIOR');
  const engine = byArea.get('ENGINE_COMPARTMENT');
  const road = byArea.get('ROAD_TEST');

  // The approved form packs the four checklists into a 2x2 grid on one sheet:
  // road test and engine compartment on the upper row, exterior and interior on
  // the lower row, with the interior reference drawing and the general remarks
  // beneath. A layout *table* (not flexbox) is used because Chromium cannot
  // fragment a flex row across pages, so a flex grid that does not fit jumps
  // wholesale to the next sheet; a table keeps the four tables on one page.
  const cell = (
    section: InspectionReportSection | undefined,
    titleAr: string,
    titleEn: string,
    withNa: boolean,
  ): string =>
    section
      ? `<div class="grp"><div class="grp-title">${esc(titleAr)}<span class="ltr">${esc(titleEn)}</span>
          <span class="grp-legend">${legendChip('check', 'اجتياز', 'Pass')}${legendChip('cross', 'فشل', 'Fail')}${withNa ? '<span class="lg-chip">N/A · غير متوفر</span>' : ''}</span>
        </div>${itemsTable(section, titleAr, titleEn, withNa)}</div>`
      : '';

  const pair = (right: string, left: string): string =>
    `<table class="grid"><tr><td>${right || '&nbsp;'}</td><td>${left || '&nbsp;'}</td></tr></table>`;

  const cabin = `
  <div class="grp cabin">
    <div class="grp-title">فحص التجهيزات الداخلية والملحقات الخارجية<span class="ltr">Cabin Electronics &amp; Exterior Accessories Checks</span>
      <span class="grp-legend">${legendChip('check', 'اجتياز', 'Pass')}${legendChip('cross', 'فشل', 'Fail')}<span class="lg-chip">N/A · غير متوفر</span></span>
    </div>
    ${pair(cell(engine, 'مقصورة المحرك', 'Engine Compartment', false), cell(road, 'تجربة القيادة', 'Road Test', false))}
    ${pair(cell(interior, 'داخلية السيارة', 'Interior Car', true), cell(exterior, 'خارجية السيارة', 'Exterior Car', true))}
    ${interior ? `<figure class="interior-art"><img src="${INTERIOR_DIAGRAM_DATA_URI}" alt=""><figcaption>مخطط التجهيزات الداخلية<span class="ltr">Interior fittings reference</span></figcaption></figure>` : ''}
  </div>`;

  const remarkRows: string[] = [];
  if (input.payload.generalRemarks) remarkRows.push(input.payload.generalRemarks);
  if (input.payload.finalAssessment) remarkRows.push(input.payload.finalAssessment);
  const remarks = remarkRows.length
    ? `<div class="grp">
        <div class="grp-title">الملاحظات والتعليقات العامة<span class="ltr">General Inspection Remarks</span></div>
        <div class="general-remarks">${remarkRows.map((r) => escMultiline(r)).join('<br>')}</div>
      </div>`
    : '';

  return `
  <section class="doc-page">
    ${reportHeader(input.issuer)}
    ${pageTitleBar('الفحص الداخلي والخارجي / مقصورة المحرك / تجربة القيادة', 'INTERIOR & EXTERIOR INSPECTION / ENGINE COMPARTMENT / ROAD TEST')}
    ${jobStrip(input.payload)}
    ${cabin}
    ${remarks}
  </section>`;
}

/** The computer-unit page (page 5). */
export function computerSectionPage(
  input: InspectionReportInput,
  section: InspectionReportSection | undefined,
): string {
  return `
  <section class="doc-page">
    ${reportHeader(input.issuer)}
    ${pageTitleBar('فحص وحدة الكمبيوتر', 'COMPUTER UNIT INSPECTION')}
    ${jobStrip(input.payload)}
    ${diagnosticSection(section)}
    ${input.verification ? `<div class="p5-verify">${verificationBlock(input.verification)}</div>` : ''}
  </section>`;
}

/**
 * One pass/fail checklist as the approved two-column table.
 *
 * The reference prints the Arabic label with its English translation beneath and
 * three result columns (Pass / Fail / N/A); the cell matching the recorded
 * result carries the tick or cross. `withNa` is false for the engine and road
 * tables, which are strictly pass/fail on the approved form.
 */
function itemsTable(
  section: InspectionReportSection,
  titleAr: string,
  titleEn: string,
  withNa: boolean,
): string {
  const results = withNa ? (['PASS', 'FAIL', 'NA'] as const) : (['PASS', 'FAIL'] as const);
  return `
  <div class="itable avoid-break">
    <div class="itable-head">${esc(titleAr)}<span class="ltr">${esc(titleEn)}</span></div>
    <table class="items">
      <thead>
        <tr>
          <th class="c-item">البند<span class="ltr">Item</span></th>
          ${results
            .map(
              (r) =>
                `<th class="c-res">${r === 'PASS' ? 'اجتياز<span class="ltr">Pass</span>' : r === 'FAIL' ? 'فشل<span class="ltr">Fail</span>' : 'غير متوفر<span class="ltr">N/A</span>'}</th>`,
            )
            .join('')}
        </tr>
      </thead>
      <tbody>
        ${section.items
          .map(
            (item) => `
        <tr>
          <td class="c-item"><span class="item-ar">${esc(item.labelAr)}</span><span class="item-en ltr">${esc(item.labelEn)}</span></td>
          ${results.map((r) => `<td class="c-res">${item.result === r ? resultMark(r) : ''}</td>`).join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

/**
 * The body-panel diagnostic diagram (top view).
 *
 * Markers carry normalised coordinates, so the diagram is drawn from the same
 * numbers the inspector placed on screen and a marker lands on the same panel at
 * any page size. The drawing comes from `@oryx/shared/inspection-diagram` — the
 * exact geometry the admin editor renders — so the printed report and the form
 * can never show two different vehicles.
 */
function paintDiagram(section: InspectionReportSection): string {
  const legend = PAINT_CONDITIONS.map(
    (c) =>
      `<span class="legend-item"><span class="legend-dot ld-${c.color}">${c.cross ? markGlyph('x', 7) : ''}</span>${esc(c.labelAr)} / ${esc(c.labelEn)}</span>`,
  ).join('');

  const markers = section.markers
    .map((m) => {
      const spec = PAINT_CONDITIONS.find((c) => c.key === m.condition);
      const color = spec?.color ?? 'green';
      return `<span class="marker m-${color}" style="left:${(m.x * 100).toFixed(2)}%;top:${(m.y * 100).toFixed(2)}%" title="${esc(m.note ?? '')}">${spec?.cross ? markGlyph('x', 7) : ''}</span>`;
    })
    .join('');

  const rows =
    section.markers.length > 0
      ? `<table class="marker-table">
          <thead><tr><th>#</th><th>الموضع / Location</th><th>الحالة / Condition</th><th>ملاحظة / Note</th></tr></thead>
          <tbody>${section.markers
            .map((m, i) => {
              const spec = PAINT_CONDITIONS.find((c) => c.key === m.condition);
              const panel = BODY_PANELS.find((p) => p.key === m.panelKey);
              return `<tr><td class="num">${i + 1}</td><td>${esc(panel ? `${panel.labelAr} / ${panel.labelEn}` : (m.panelKey ?? '—'))}</td><td>${esc(spec?.labelAr ?? '')} / ${esc(spec?.labelEn ?? '')}</td><td>${esc(m.note ?? '')}</td></tr>`;
            })
            .join('')}</tbody>
        </table>`
      : `<div class="no-findings">لا توجد ملاحظات على الصبغ والهيكل · No paint or body findings recorded</div>`;

  return `
  <div class="diagram-block avoid-break">
    <div class="diagram-title">مخطط الفحص السطحي لهيكل السيارة<span class="ltr">Body Panels Diagnostic Scheme</span></div>
    <div class="diagram-wrap">
      <div class="diagram diagram--art">
        <img class="artplan" src="${BODY_SCHEME_DATA_URI}" alt="">
        ${markers}
      </div>
      <div class="legend">${legend}</div>
    </div>
    ${rows}
    ${section.remarks ? `<div class="sec-remarks"><b>${esc(section.remarksLabelAr)}:</b> ${escMultiline(section.remarks)}</div>` : ''}
  </div>`;
}

/** The eight-region chassis safety diagram, drawn over the approved artwork. */
function chassisDiagram(section: InspectionReportSection): string {
  const byKey = new Map(section.chassisRegions.map((r) => [r.regionKey, r]));

  const chips = CHASSIS_REGIONS.map((region) => {
    const row = byKey.get(region.key);
    const state = row?.condition ?? 'UNSET';
    const cls = state === 'OK' ? 'ch-ok' : state === 'DAMAGE' ? 'ch-bad' : 'ch-unset';
    const symbol =
      state === 'OK' ? markGlyph('check', 11) : state === 'DAMAGE' ? markGlyph('cross', 11) : '·';
    return `
    <div class="ch-region ${cls}">
      <div class="ch-region-head">
        <span class="ch-region-ar">${esc(region.labelAr)}</span>
        <span class="ch-region-mark">${symbol}</span>
      </div>
      <div class="ch-region-en ltr">${esc(region.labelEn)}</div>
      ${row?.note ? `<div class="ch-region-note">${esc(row.note)}</div>` : ''}
    </div>`;
  }).join('');

  const damaged = section.chassisRegions.filter((r) => r.condition === 'DAMAGE');
  return `
  <div class="chassis-block avoid-break">
    <div class="diagram-title">مخطط سلامة الشاصي<span class="ltr">Chassis safety diagram</span></div>
    <div class="chassis-wrap">
      <div class="chassis-art">
        <img class="artchassis" src="${CHASSIS_DIAGRAM_DATA_URI}" alt="">
        ${chassisMarkers(section)}
      </div>
      <div class="chassis-grid">${chips}</div>
    </div>
    <div class="legend-row">
      <span class="lg-chip">${markGlyph('check', 10)}سليم / OK</span>
      <span class="lg-chip">${markGlyph('cross', 10)}متضرر / Damage</span>
    </div>
    <div class="chassis-summary ${damaged.length ? 'chassis-summary-bad' : 'chassis-summary-ok'}">
      ${
        damaged.length
          ? `مناطق متضررة / Damaged regions: ${damaged.map((d) => esc(chassisRegionLabel(d.regionKey))).join('، ')}`
          : 'لم يتم تسجيل أي أضرار في الهيكل السفلي · No chassis damage recorded'
      }
    </div>
    ${section.remarks ? `<div class="sec-remarks"><b>${esc(section.remarksLabelAr)}:</b> ${escMultiline(section.remarks)}</div>` : ''}
  </div>`;
}

/** The Arabic label of a chassis region, or its key if the catalogue changed. */
function chassisRegionLabel(key: string): string {
  return CHASSIS_REGIONS.find((r) => r.key === key)?.labelAr ?? key;
}

/**
 * The region condition dots drawn on the approved chassis artwork.
 *
 * Each region has a fixed normalised position (`CHASSIS_REGIONS`), so a region
 * marked sound prints a green dot and a damaged one a red dot at the same spot
 * on the drawing every time. An unassessed region prints no dot rather than a
 * misleading green one.
 */
function chassisMarkers(section: InspectionReportSection): string {
  const byKey = new Map(section.chassisRegions.map((r) => [r.regionKey, r]));
  return CHASSIS_REGIONS.map((region) => {
    const state = byKey.get(region.key)?.condition ?? 'UNSET';
    if (state === 'UNSET') return '';
    const color = state === 'OK' ? 'green' : 'red';
    const glyph = state === 'OK' ? markGlyph('check', 7) : markGlyph('cross', 7);
    return `<span class="chmark m-${color}" style="left:${(region.x * 100).toFixed(2)}%;top:${(region.y * 100).toFixed(2)}%" title="${esc(region.labelEn)}">${glyph}</span>`;
  }).join('');
}

/** The free-form computer-unit fault table. */
function diagnosticSection(section: InspectionReportSection | undefined): string {
  if (!section || section.diagnostics.length === 0) {
    return `
    <div class="diag-block avoid-break">
      <div class="diagram-title">أعطال وحدة الكمبيوتر<span class="ltr">Computer Module Faults</span></div>
      <div class="no-findings">لم يتم تسجيل أي أعطال · No computer module faults recorded</div>
    </div>`;
  }
  return `
  <div class="diag-block">
    <div class="diagram-title">أعطال وحدة الكمبيوتر<span class="ltr">Computer Module Faults</span></div>
    <table class="diag-table">
      <thead>
        <tr>
          <th>#</th><th>الوحدة / Module</th><th>الرمز / Code</th>
          <th>الوصف / Description</th><th>الملاحظة / Observation</th><th>الأهمية / Severity</th>
        </tr>
      </thead>
      <tbody>
        ${section.diagnostics
          .map(
            (d, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td>${esc(d.module)}</td>
          <td class="num">${esc(orDash(d.faultCode))}</td>
          <td>${esc(d.description)}</td>
          <td>${esc(orDash(d.observation))}</td>
          <td><span class="sev sev-${d.severity.toLowerCase()}">${esc(d.severity)}</span></td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    ${section.remarks ? `<div class="sec-remarks"><b>${esc(section.remarksLabelAr)}:</b> ${escMultiline(section.remarks)}</div>` : ''}
  </div>`;
}


export const INSPECTION_REPORT_CSS = `
  /* ---- brand band ---- */
  /* The approved form prints the brand lockup on the visual left and the
   * "inspection experts" tagline on the visual right. The document is RTL, so
   * the band itself is forced LTR to keep that arrangement. */
  .report-head{ display:flex; direction:ltr; justify-content:space-between; align-items:center;
    padding-bottom:4px; margin-bottom:2px; }
  .rh-left{ display:flex; align-items:center; gap:9px; }
  .rh-logo{ height:38px; width:auto; }
  .rh-monogram{ width:38px; height:38px; border-radius:8px; background:var(--navy); color:var(--gold);
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14pt; letter-spacing:.5px; }
  .rh-name{ display:flex; flex-direction:column; line-height:1.12; }
  .rh-name-ar{ font-size:14pt; font-weight:700; color:var(--navy); }
  .rh-name-en{ font-size:8.5pt; font-weight:700; color:var(--muted); letter-spacing:.6px; text-transform:uppercase; }
  .rh-right{ display:flex; flex-direction:column; align-items:flex-end; line-height:1.2; text-align:right; }
  .rh-tag-ar{ font-size:11pt; font-weight:700; color:var(--navy); }
  .rh-tag-en{ font-size:7.6pt; font-weight:700; color:var(--gold); letter-spacing:.6px; }
  /* ---- shared page furniture ---- */
  .p-title{ display:flex; flex-direction:column; align-items:center; margin:0 0 6px; }
  .p-title-ar{ font-size:15pt; font-weight:700; color:var(--navy); }
  .p-title-en{ font-size:9.5pt; font-weight:700; color:var(--muted); letter-spacing:.6px; text-transform:uppercase; }
  .job-head{ display:flex; direction:ltr; justify-content:space-between; align-items:baseline;
    font-size:8.4pt; font-weight:700; color:var(--navy); padding:1px 2px 3px; }
  .vstrip{ display:flex; direction:ltr; border:1px solid var(--line); border-radius:5px; overflow:hidden; }
  .vcell{ flex:1 1 0; padding:4px 8px; border-inline-end:1px solid var(--line); }
  .vcell:last-child{ border-inline-end:none; }
  .vcell-lab{ display:block; font-size:7pt; color:var(--muted); line-height:1.2; }
  .vcell-lab .ltr{ font-weight:700; color:var(--navy-soft); }
  .vcell-val{ display:block; font-size:9.5pt; font-weight:700; color:var(--ink); }
  .ltr{ direction:ltr; unicode-bidi:isolate; }
  .lg-chip{ display:inline-flex; align-items:center; gap:4px; font-size:8pt; color:var(--ink); margin-inline-start:10px; }
  .legend-row{ display:flex; gap:6px; margin-top:6px; }
  /* ---- cover ---- */
  .cover-info{ width:100%; }
  .cover-sec-title{ background:var(--navy); color:#fff; font-size:9.5pt; font-weight:700; padding:3px 10px; border-radius:5px 5px 0 0; }
  .cover-sec-title .ltr{ margin-inline-start:8px; color:var(--gold-soft); font-size:8pt; font-weight:400; }
  .vinfo{ width:100%; border:1px solid var(--line); border-top:none; border-collapse:collapse; direction:ltr; }
  .vinfo td{ border:1px solid var(--line); padding:3px 8px; width:25%; vertical-align:top; }
  .vlab{ display:flex; align-items:baseline; gap:6px; font-size:7.3pt; color:var(--muted); line-height:1.2; }
  .vlab .ltr{ font-weight:700; color:var(--navy-soft); }
  .vlab .var{ direction:rtl; color:var(--muted); }
  .vval{ display:block; margin-top:1px; font-size:8.8pt; font-weight:700; color:var(--ink); }
  /* The approved cover prints the verification QR inside the photograph band,
   * bottom-right, over a white card so the modules stay scannable. Physical
   * right/bottom is used because the page is RTL and the reference anchors the
   * code to the visual right regardless of direction. */
  .cover-qr{ position:absolute; bottom:8px; right:10px; z-index:2;
    display:flex; flex-direction:column; align-items:center; gap:3px;
    background:#fff; border:1px solid var(--line); border-radius:5px; padding:5px 6px; }
  .cover-qr img{ width:92px; height:92px; display:block; }
  .cover-qr-cap{ font-size:6.4pt; font-weight:700; color:var(--navy); line-height:1.15; text-align:center; }
  .cover-qr-cap .ltr{ display:block; font-size:5.6pt; color:var(--muted); font-weight:400; letter-spacing:.2px; }
  /* The approved cover prints the vehicle photograph as a wide band across the
   * middle of the page, bleeding past the side margins. */
  .vphoto{ position:relative; margin:10px 0 0; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#f7f9fc; }
  /* The approved cover bleeds the photograph to the paper edges. A negative
   * margin, or a wider in-flow box, enlarges the printable area and shifts every
   * other element on the sheet sideways. The band is therefore painted with an
   * absolutely positioned image that overflows its (in-flow, margin-width)
   * figure: absolute overflow is clipped by the paper edge, it does not resize
   * the page. */
  .vphoto--bleed{ margin-inline:0; border-radius:0; border-inline:none; height:176px; }
  .vphoto--bleed .vphoto-img{ position:absolute; top:0; inset-inline:-12mm;
    width:calc(100% + 24mm); height:176px; object-fit:cover; }
  .vphoto-img{ width:100%; height:176px; object-fit:cover; display:block; }
  .vphoto-empty .vphoto-ph{ position:absolute; top:0; inset-inline:-12mm;
    width:calc(100% + 24mm); height:176px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    color:var(--muted); font-size:8pt; }
  .vphoto-ph .ltr{ font-size:7.5pt; color:var(--line-strong); }
  .terms{ margin-top:10px; border:1px solid var(--line); border-radius:6px; padding:8px 10px; background:#f7f9fc; }
  .terms-title{ font-size:9.5pt; font-weight:700; color:var(--navy); }
  .terms-title .ltr{ margin-inline-start:8px; font-size:8pt; color:var(--muted); font-weight:400; }
  .terms-sub{ font-size:8pt; color:var(--navy-soft); margin:2px 0 5px; }
  .terms-sub .ltr{ margin-inline-start:8px; color:var(--muted); }
  .terms-cols{ display:flex; gap:14px; }
  .terms-ar{ flex:1 1 0; margin:0; font-size:7pt; line-height:1.2; color:var(--ink); }
  .terms-en{ flex:1 1 0; margin:0; font-size:6.8pt; line-height:1.2; color:var(--muted); text-align:left; }
  .remarks-block{ margin-top:10px; border:1px solid var(--line); border-radius:6px; padding:8px 10px; }
  .remarks-title{ font-size:9.5pt; font-weight:700; color:var(--navy); margin-bottom:4px; }
  .remarks-title .ltr{ margin-inline-start:8px; font-size:8pt; color:var(--muted); font-weight:400; }
  .remarks-cols{ display:flex; gap:14px; }
  .remarks-list{ flex:1 1 0; margin:0; padding-inline-start:15px; font-size:7pt; line-height:1.22; color:var(--ink); }
  .remarks-list.ltr{ text-align:left; }
  /* ---- section groups ---- */
  .grp{ margin-top:7px; }
  .grp-title{ display:flex; align-items:baseline; flex-wrap:wrap; background:var(--navy); color:#fff;
    font-size:10pt; font-weight:700; padding:4px 10px; border-radius:5px 5px 0 0; }
  .grp-title .ltr{ margin-inline-start:8px; font-size:8pt; color:var(--gold-soft); font-weight:400; }
  .grp-legend{ margin-inline-start:auto; display:flex; gap:2px; }
  .grp-legend .lg-chip{ color:#fff; }
  .two-col{ display:flex; gap:10px; align-items:flex-start; }
  .two-col > *{ flex:1 1 0; min-width:0; }
  .cabin .two-col{ margin-top:5px; }
  .cabin .itable-head{ padding:1px 6px; font-size:7.6pt; }
  .cabin .items th,.cabin .items td{ padding:0 4px; font-size:6.8pt; line-height:1.0; }
  .cabin .item-ar{ font-size:6.7pt; line-height:1.0; }
  .cabin .item-en{ font-size:5.6pt; line-height:1.0; }
  .grid{ table-layout:fixed; border-collapse:separate; border-spacing:4px 2px; }
  .grid > tbody > tr > td{ width:50%; vertical-align:top; padding:0; }
  .interior-art{ margin:6px 0 0; }
  .interior-art img{ width:100%; max-height:46px; object-fit:contain; object-position:top; display:block; }
  .interior-art figcaption{ font-size:7pt; color:var(--muted); padding-top:2px; }
  .itable{ border:1px solid var(--line); border-top:none; }
  .itable-head{ background:#eef2f8; color:var(--navy); font-size:8.2pt; font-weight:700; padding:2px 7px; border-bottom:1px solid var(--line); }
  .itable-head .ltr{ margin-inline-start:6px; font-size:7.5pt; color:var(--muted); font-weight:400; }
  .items th,.items td{ border-bottom:1px solid var(--line); border-inline-end:1px solid var(--line); padding:1px 5px; font-size:7.2pt; line-height:1.04; vertical-align:middle; }
  .items thead th{ background:#f7f9fc; color:var(--navy); font-size:7.6pt; text-align:center; }
  .items thead th.c-item{ text-align:start; }
  .items th:last-child,.items td:last-child{ border-inline-end:none; }
  .items tr:last-child td{ border-bottom:none; }
  .c-item{ width:62%; }
  .c-res{ width:12.66%; text-align:center; }
  .item-ar{ display:block; font-size:7.1pt; line-height:1.04; color:var(--ink); }
  .item-en{ display:block; font-size:5.9pt; line-height:1.04; color:var(--muted); }
  .rm{ display:inline-flex; align-items:center; justify-content:center; font-size:7pt; font-weight:700; }
  .rm-pass{ color:var(--ok); } .rm-fail{ color:var(--bad); } .rm-na{ color:var(--muted); } .rm-unset{ color:#c3c9d2; }
  .mark{ display:inline-block; vertical-align:-2px; }
  .general-remarks{ border:1px solid var(--line); border-top:none; border-radius:0 0 5px 5px; padding:5px 9px;
    font-size:7.8pt; line-height:1.3; color:var(--ink); min-height:22px; }
  .sec-remarks{ margin-top:6px; border:1px solid var(--line); border-radius:5px; padding:6px 9px; font-size:7.6pt; line-height:1.3; color:var(--ink); background:#fbfcfe; }
  .no-findings{ border:1px solid var(--line); border-top:none; padding:8px; font-size:8.5pt; color:var(--muted); background:#f7f9fc; text-align:center; }
  /* ---- diagrams ---- */
  .diagram-block,.chassis-block,.diag-block{ margin-top:10px; }
  .diagram-title{ display:flex; align-items:baseline; font-size:10pt; font-weight:700; color:var(--navy);
    margin-bottom:6px; border-inline-start:4px solid var(--gold); padding-inline-start:7px; }
  .diagram-title .ltr{ margin-inline-start:8px; font-size:8pt; color:var(--muted); font-weight:400; }
  .diagram-wrap{ display:flex; gap:14px; align-items:flex-start; }
  .diagram{ position:relative; width:230px; flex:0 0 230px; }
  .diagram--art{ width:200px; flex:0 0 200px; }
  .artplan{ width:100%; height:auto; display:block; }
  .bodyplan{ width:100%; height:auto; display:block; }
  .bp-body{ fill:#eef2f8; stroke:#5b6472; stroke-width:3; }
  .bp-glass{ fill:#d6e2f0; stroke:#5b6472; stroke-width:2; }
  .bp-panel{ fill:none; stroke:#9aa4b2; stroke-width:1.6; }
  .bp-seam{ fill:none; stroke:#9aa4b2; stroke-width:2; }
  .bp-wheel{ fill:#3c4653; stroke:#5b6472; stroke-width:2; }
  .marker{ position:absolute; width:14px; height:14px; border-radius:50%; transform:translate(-50%,-50%);
    display:flex; align-items:center; justify-content:center; font-size:8pt; font-weight:700; color:#fff;
    border:1.5px solid #fff; box-shadow:0 0 0 .5px rgba(0,0,0,.4); }
  .m-green{ background:#1f9d55; } .m-orange{ background:#e08a1e; } .m-red{ background:#d92d20; }
  .legend{ flex:1 1 auto; display:flex; flex-wrap:wrap; gap:8px 16px; align-content:flex-start; }
  .legend-item{ font-size:8.5pt; color:var(--ink); display:flex; align-items:center; gap:6px; }
  .legend-dot{ width:14px; height:14px; border-radius:50%; display:inline-flex; align-items:center;
    justify-content:center; font-size:8pt; color:#fff; font-weight:700; }
  .ld-green{ background:#1f9d55; } .ld-orange{ background:#e08a1e; } .ld-red{ background:#d92d20; }
  .marker-table{ margin-top:8px; border:1px solid var(--line); }
  .marker-table th,.marker-table td{ border-bottom:1px solid var(--line); padding:3px 7px; font-size:8pt; text-align:start; }
  .marker-table thead th{ background:#eef2f8; color:var(--navy); }
  .chassis-wrap{ display:flex; gap:14px; align-items:flex-start; }
  .chassis-art{ position:relative; width:210px; flex:0 0 210px; }
  .artchassis{ width:100%; height:auto; display:block; }
  .chmark{ position:absolute; width:15px; height:15px; border-radius:50%; transform:translate(-50%,-50%);
    display:flex; align-items:center; justify-content:center; font-size:8pt; font-weight:700; color:#fff;
    border:1.5px solid #fff; box-shadow:0 0 0 .5px rgba(0,0,0,.4); }
  .chassisplan{ width:190px; flex:0 0 190px; height:auto; }
  .cp-outline{ fill:#f2f5f9; stroke:#5b6472; stroke-width:3; }
  .cp-seam{ fill:none; stroke:#9aa4b2; stroke-width:1.4; }
  .cz path{ stroke:#9aa4b2; stroke-width:1.2; }
  .cz-num{ font-size:24px; font-weight:800; fill:#7a8494; text-anchor:middle; dominant-baseline:middle; }
  .cz-ok .cz-num,.cz-damage .cz-num{ fill:#fff; }
  .chassis-grid{ flex:1 1 auto; display:grid; grid-template-columns:repeat(2,1fr); gap:6px; }
  .ch-region{ border:1px solid var(--line); border-radius:5px; padding:6px 7px; background:#f7f9fc; }
  .ch-region-head{ display:flex; justify-content:space-between; align-items:center; }
  .ch-region-ar{ font-size:9pt; font-weight:700; color:var(--navy); }
  .ch-region-mark{ font-size:11pt; font-weight:700; }
  .ch-region-en{ font-size:7.5pt; color:var(--muted); }
  .ch-region-note{ font-size:7.5pt; color:var(--ink); margin-top:3px; }
  .ch-ok{ background:#f0fdf4; border-color:#86efac; } .ch-ok .ch-region-mark{ color:var(--ok); }
  .ch-bad{ background:#fef2f2; border-color:#fca5a5; } .ch-bad .ch-region-mark{ color:var(--bad); }
  .ch-unset .ch-region-mark{ color:#9aa4b2; }
  .chassis-summary{ margin-top:7px; padding:6px 9px; border-radius:5px; font-size:8.5pt; }
  .chassis-summary-ok{ background:#f0fdf4; color:var(--ok); border:1px solid #86efac; }
  .chassis-summary-bad{ background:#fef2f2; color:var(--bad); border:1px solid #fca5a5; }
  .diag-table{ border:1px solid var(--line); }
  .diag-table th,.diag-table td{ border-bottom:1px solid var(--line); padding:4px 7px; font-size:8pt; text-align:start; }
  .diag-table thead th{ background:#eef2f8; color:var(--navy); }
  .sev{ padding:1px 6px; border-radius:3px; font-size:7.5pt; font-weight:700; }
  .sev-info{ background:#eef2f8; color:var(--muted); }
  .sev-low{ background:#ecfdf5; color:var(--ok); }
  .sev-medium{ background:#fffbeb; color:var(--warn); }
  .sev-high,.sev-critical{ background:#fef2f2; color:var(--bad); }
  .p5-verify{ margin-top:14px; }
  .p5-verify .verify{ flex-direction:column; align-items:stretch; }
  .p5-verify .verify-qr{ display:flex; justify-content:center; }
  .p5-verify .verify-qr img{ width:120px; height:120px; }
`;
