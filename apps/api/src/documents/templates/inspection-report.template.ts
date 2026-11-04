import {
  CHASSIS_REGIONS,
  PAINT_CONDITIONS,
  inspectionResultsFor,
  inspectionSectionSpec,
  planInspectionReport,
  sectionsOnReportPage,
  type InspectionSectionSpec,
} from '@oryx/shared';
import {
  documentHeader,
  documentWatermark,
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
 * The page plan is not computed here — it comes from `planInspectionReport`, so
 * the printed pagination is the same rule the tests assert. This module only
 * draws the plan it is handed, which keeps "which pages exist" testable without
 * a browser.
 */

export interface InspectionReportInput {
  issuer: DocumentIssuer;
  payload: InspectionReportPayload;
  documentNumber: string;
  issuedAt: Date;
  version: number;
  verification: DocumentVerification | null;
}

/** A pass/fail/NA pill. The symbol is text, so it survives a mono photocopy. */
function resultPill(result: string): string {
  const map: Record<string, { cls: string; label: string }> = {
    PASS: { cls: 'r-pass', label: '✓' },
    FAIL: { cls: 'r-fail', label: '✗' },
    NA: { cls: 'r-na', label: '—' },
    UNSET: { cls: 'r-unset', label: '·' },
  };
  const entry = map[result] ?? map.UNSET;
  return `<span class="pill ${entry.cls}">${entry.label}</span>`;
}

/** The identification block on page 1. */
export function identificationPage(input: InspectionReportInput, chrome: DocumentChrome): string {
  const p = input.payload;
  const v = p.vehicle;
  return `
  <section class="doc-page">
    ${documentWatermark(chrome.issuer)}
    ${documentHeader(chrome)}
    <div class="id-grid">
      <div class="id-box">
        <div class="id-box-title">بيانات المركبة · Vehicle</div>
        <table class="kv">
          <tr><th>الصنع / Make</th><td>${esc(v.make)}</td></tr>
          <tr><th>الموديل / Model</th><td>${esc(v.model)}</td></tr>
          <tr><th>سنة الصنع / Year</th><td class="num">${esc(v.modelYear)}</td></tr>
          <tr><th>رقم اللوحة / Plate</th><td class="num">${esc(orDash(v.plateNumber))}</td></tr>
          <tr><th>اللون / Colour</th><td>${esc(orDash(v.color))}</td></tr>
          <tr><th>رقم الهيكل / VIN</th><td class="num">${esc(v.vin)}</td></tr>
          <tr><th>قراءة العدّاد / Odometer</th><td class="num">${esc(grouped(v.odometer))} km</td></tr>
        </table>
      </div>
      <div class="id-box">
        <div class="id-box-title">بيانات العميل والزيارة · Customer &amp; Visit</div>
        <table class="kv">
          <tr><th>اسم العميل / Customer</th><td>${esc(p.customerName)}</td></tr>
          <tr><th>رقم الاتصال / Contact</th><td class="num">${esc(orDash(p.contactNumber))}</td></tr>
          <tr><th>رقم المهمة / Job No.</th><td class="num">${esc(p.jobNumber)}</td></tr>
          <tr><th>تاريخ الفحص / Inspected</th><td class="num">${esc(new Date(p.inspectedAt).toISOString().slice(0, 10))}</td></tr>
          <tr><th>الفرع / Branch</th><td>${esc(orDash(p.branchName))}</td></tr>
          <tr><th>الفاحص / Inspector</th><td>${esc(orDash(p.inspectorName))}</td></tr>
          <tr><th>الحالة / Status</th><td>${esc(p.status)}</td></tr>
        </table>
      </div>
    </div>

    <div class="areas-block avoid-break">
      <div class="areas-title">مناطق الفحص المختارة · Selected Inspection Areas</div>
      <div class="areas-list">
        ${p.selectedAreas
          .map((area) => {
            const spec = inspectionSectionSpec(area);
            return `<span class="area-chip"><span class="area-ar">${esc(spec.labelAr)}</span><span class="area-en">${esc(spec.labelEn)}</span></span>`;
          })
          .join('')}
      </div>
    </div>

    <div class="terms avoid-break">
      <div class="terms-title">إقرار · Declaration</div>
      <p>
        يقر العميل بأن الفحص تم بحضوره أو بموافقته، وأن النتائج الموضحة في هذا التقرير تعكس
        الحالة الفنية للمركبة في تاريخ الفحص المذكور أعلاه. لا يشمل هذا الفحص أي أعطال ظهرت
        لاحقًا أو كانت مخفية ولا يمكن الكشف عنها بالفحص الظاهري.
      </p>
      <p class="ltr">
        The customer confirms the inspection was carried out with their presence or consent and
        that the findings reflect the technical condition of the vehicle on the inspection date
        above. The inspection does not cover faults that appeared later or that were concealed
        and undetectable by a visual and functional check.
      </p>
    </div>

    ${signatureBlock([
      { ar: 'توقيع الفاحص', en: 'Inspector', name: p.inspectorName },
      { ar: 'توقيع العميل', en: 'Customer', name: p.customerName },
      { ar: 'اعتماد الإدارة', en: 'Authorised Signatory', name: p.reviewedByName },
    ])}
  </section>`;
}

/** One checklist section: the item table, the remarks block, the attachments. */
function itemsSection(section: InspectionReportSection): string {
  if (section.items.length === 0) return '';
  return `
  <div class="sec avoid-break">
    <div class="sec-head">
      <span class="sec-head-ar">${esc(section.labelAr)}</span>
      <span class="sec-head-en">${esc(section.labelEn)}</span>
    </div>
    <table class="items">
      <thead>
        <tr>
          <th class="c-idx">#</th>
          <th class="c-item">البند · Item</th>
          <th class="c-res">النتيجة · Result</th>
          <th class="c-note">ملاحظات · Notes</th>
        </tr>
      </thead>
      <tbody>
        ${section.items
          .map(
            (item, index) => `
        <tr>
          <td class="c-idx num">${index + 1}</td>
          <td class="c-item">
            <span class="item-ar">${esc(item.labelAr)}</span>
            <span class="item-en">${esc(item.labelEn)}</span>
          </td>
          <td class="c-res">${resultPill(item.result)}</td>
          <td class="c-note">${esc(item.note ?? '')}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    ${section.remarks ? `<div class="sec-remarks"><b>${esc(section.remarksLabelAr)}:</b> ${escMultiline(section.remarks)}</div>` : ''}
  </div>`;
}

/**
 * The body-panel diagnostic diagram.
 *
 * Markers carry normalised coordinates, so the diagram is drawn from the same
 * numbers the inspector placed on screen and a marker lands on the same panel at
 * any page size. The diagram is a top view and is not mirrored in RTL — the
 * coordinates are physical, not textual.
 */
function paintDiagram(section: InspectionReportSection): string {
  const legend = PAINT_CONDITIONS.map(
    (c) =>
      `<span class="legend-item"><span class="legend-dot ld-${c.color}">${c.cross ? '✕' : ''}</span>${esc(c.labelAr)} / ${esc(c.labelEn)}</span>`,
  ).join('');

  const markers = section.markers
    .map((m) => {
      const spec = PAINT_CONDITIONS.find((c) => c.key === m.condition);
      const color = spec?.color ?? 'green';
      return `<span class="marker m-${color}" style="left:${(m.x * 100).toFixed(2)}%;top:${(m.y * 100).toFixed(2)}%" title="${esc(m.note ?? '')}">${spec?.cross ? '✕' : ''}</span>`;
    })
    .join('');

  return `
  <div class="diagram-block avoid-break">
    <div class="diagram-title">مخطط تشخيص الهيكل · Body Panels Diagnostic Scheme</div>
    <div class="diagram-wrap">
      <div class="diagram">
        ${bodyPlanSvg()}
        ${markers}
      </div>
      <div class="legend">${legend}</div>
    </div>
    ${
      section.markers.length > 0
        ? `<table class="marker-table">
            <thead><tr><th>#</th><th>الموضع / Location</th><th>الحالة / Condition</th><th>ملاحظة / Note</th></tr></thead>
            <tbody>${section.markers
              .map((m, i) => {
                const spec = PAINT_CONDITIONS.find((c) => c.key === m.condition);
                return `<tr><td class="num">${i + 1}</td><td>${esc(m.panelKey ?? '—')}</td><td>${esc(spec?.labelAr ?? '')} / ${esc(spec?.labelEn ?? '')}</td><td>${esc(m.note ?? '')}</td></tr>`;
              })
              .join('')}</tbody>
          </table>`
        : `<div class="no-findings">لا توجد ملاحظات على الصبغ والهيكل · No paint or body findings recorded</div>`
    }
  </div>`;
}

/**
 * A schematic top view of a vehicle.
 *
 * Drawn as inline SVG rather than an image so it stays crisp at print
 * resolution, carries no external reference, and cannot fail to load. It is a
 * neutral technical drawing, not a brand mark.
 */
function bodyPlanSvg(): string {
  return `
  <svg class="bodyplan" viewBox="0 0 200 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="6" width="188" height="348" rx="26" fill="#eef2f8" stroke="#9aa4b2" stroke-width="1.5"/>
    <path d="M40 74 Q100 40 160 74 L166 150 L34 150 Z" fill="#dfe7f2" stroke="#9aa4b2" stroke-width="1.2"/>
    <rect x="34" y="150" width="132" height="120" rx="8" fill="#dfe7f2" stroke="#9aa4b2" stroke-width="1.2"/>
    <path d="M40 270 Q100 306 160 270 L166 300 Q100 336 34 300 Z" fill="#dfe7f2" stroke="#9aa4b2" stroke-width="1.2"/>
    <line x1="100" y1="44" x2="100" y2="330" stroke="#9aa4b2" stroke-width="0.8" stroke-dasharray="5 4"/>
    <line x1="20" y1="152" x2="180" y2="152" stroke="#9aa4b2" stroke-width="0.8" stroke-dasharray="5 4"/>
    <line x1="20" y1="270" x2="180" y2="270" stroke="#9aa4b2" stroke-width="0.8" stroke-dasharray="5 4"/>
    <text x="100" y="26" text-anchor="middle" font-size="11" fill="#5b6472">FRONT</text>
    <text x="100" y="352" text-anchor="middle" font-size="11" fill="#5b6472">REAR</text>
  </svg>`;
}

/** The eight-region chassis safety diagram. */
function chassisDiagram(section: InspectionReportSection): string {
  const byKey = new Map(section.chassisRegions.map((r) => [r.regionKey, r]));
  const chips = CHASSIS_REGIONS.map((region) => {
    const row = byKey.get(region.key);
    const state = row?.condition ?? 'UNSET';
    const cls = state === 'OK' ? 'ch-ok' : state === 'DAMAGE' ? 'ch-bad' : 'ch-unset';
    const symbol = state === 'OK' ? '✓' : state === 'DAMAGE' ? '✗' : '·';
    return `
    <div class="ch-region ${cls}">
      <div class="ch-region-head">
        <span class="ch-region-ar">${esc(region.labelAr)}</span>
        <span class="ch-region-mark">${symbol}</span>
      </div>
      <div class="ch-region-en">${esc(region.labelEn)}</div>
      ${row?.note ? `<div class="ch-region-note">${esc(row.note)}</div>` : ''}
    </div>`;
  }).join('');

  const damaged = section.chassisRegions.filter((r) => r.condition === 'DAMAGE');
  return `
  <div class="chassis-block avoid-break">
    <div class="diagram-title">مخطط فحص الهيكل السفلي · Chassis Safety Diagram</div>
    <div class="chassis-grid">${chips}</div>
    <div class="chassis-summary ${damaged.length ? 'chassis-summary-bad' : 'chassis-summary-ok'}">
      ${
        damaged.length
          ? `مناطق متضررة / Damaged regions: ${damaged.map((d) => esc(d.labelAr)).join('، ')}`
          : 'لم يتم تسجيل أي أضرار في الهيكل السفلي · No chassis damage recorded'
      }
    </div>
  </div>`;
}

/** The free-form computer-unit fault table. */
function diagnosticSection(section: InspectionReportSection): string {
  if (section.diagnostics.length === 0) {
    return `
    <div class="diag-block avoid-break">
      <div class="diagram-title">أعطال وحدة الكمبيوتر · Computer Module Faults</div>
      <div class="no-findings">لم يتم تسجيل أي أعطال · No computer module faults recorded</div>
    </div>`;
  }
  return `
  <div class="diag-block">
    <div class="diagram-title">أعطال وحدة الكمبيوتر · Computer Module Faults</div>
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
  </div>`;
}

/** The photograph grid for a section. */
function attachmentGrid(section: InspectionReportSection): string {
  if (section.attachments.length === 0) return '';
  return `
  <div class="photo-block avoid-break">
    <div class="diagram-title">صور الفحص · Inspection Photographs</div>
    <div class="photo-grid">
      ${section.attachments
        .map(
          (a) => `
      <figure class="photo">
        <img src="${esc(a.dataUri)}" alt="${esc(a.caption ?? 'Inspection photograph')}">
        ${a.caption ? `<figcaption>${esc(a.caption)}</figcaption>` : ''}
      </figure>`,
        )
        .join('')}
    </div>
  </div>`;
}

/** The remarks recorded for a section that has no checklist of its own. */
function sectionBody(section: InspectionReportSection): string {
  const parts: string[] = [];
  if (section.kind === 'DIAGRAM_PAINT') parts.push(paintDiagram(section));
  if (section.kind === 'DIAGRAM_CHASSIS') parts.push(chassisDiagram(section));
  if (section.kind === 'DIAGNOSTIC') parts.push(diagnosticSection(section));
  if (section.kind === 'ITEMS') parts.push(itemsSection(section));
  if (section.remarks) {
    parts.push(
      `<div class="sec-remarks"><b>${esc(section.remarksLabelAr)}:</b> ${escMultiline(section.remarks)}</div>`,
    );
  }
  if (section.noFindings && section.items.length === 0 && section.diagnostics.length === 0) {
    parts.push(
      `<div class="no-findings">تم الفحص ولا توجد ملاحظات · Inspected with no findings to report</div>`,
    );
  }
  parts.push(attachmentGrid(section));
  return parts.join('');
}

export function sectionPage(
  input: InspectionReportInput,
  chrome: DocumentChrome,
  sectionKeys: InspectionSectionSpec[],
  pageNumber: number,
): string {
  const payloadSections = new Map(input.payload.sections.map((s) => [s.area, s]));
  const body = sectionKeys
    .map((spec) => payloadSections.get(spec.key))
    .filter((s): s is InspectionReportSection => Boolean(s))
    .map((s) => `<div class="sec-block">${sectionBody(s)}</div>`)
    .join('');

  return `
  <section class="doc-page">
    ${documentWatermark(chrome.issuer)}
    ${documentHeader(chrome)}
    ${body}
  </section>`;
}

/** The final page: general remarks, the assessment and the verification block. */
export function summaryPage(
  input: InspectionReportInput,
  chrome: DocumentChrome,
  pageNumber: number,
): string {
  const p = input.payload;
  const rows: Array<[string, string, string | null]> = [
    ['ملاحظات عامة', 'General Remarks', p.generalRemarks],
    ['ملاحظات المقصورة', 'Interior Remarks', p.interiorRemarks],
    ['ملاحظات الخارج', 'Exterior Remarks', p.exteriorRemarks],
    ['ملاحظات المحرك', 'Engine Compartment Remarks', p.engineRemarks],
    ['ملاحظات اختبار الطريق', 'Road Test Remarks', p.roadTestRemarks],
  ].filter(([, , value]) => Boolean(value)) as Array<[string, string, string | null]>;

  return `
  <section class="doc-page">
    ${documentWatermark(chrome.issuer)}
    ${documentHeader(chrome)}
    ${
      rows.length
        ? `<div class="sec avoid-break">
             <div class="sec-head"><span class="sec-head-ar">الملخص والملاحظات</span><span class="sec-head-en">Summary &amp; Remarks</span></div>
             <table class="items">
               <tbody>
                 ${rows
                   .map(
                     ([ar, en, value]) =>
                       `<tr><th class="c-item"><span class="item-ar">${esc(ar)}</span><span class="item-en">${esc(en)}</span></th><td>${escMultiline(value)}</td></tr>`,
                   )
                   .join('')}
               </tbody>
             </table>
           </div>`
        : ''
    }
    <div class="assessment avoid-break">
      <div class="assessment-title">التقييم النهائي · Final Assessment</div>
      <div class="assessment-body">${p.finalAssessment ? escMultiline(p.finalAssessment) : 'لم يتم تسجيل تقييم نهائي · No final assessment recorded'}</div>
    </div>
    ${verificationBlock(input.verification)}
    ${signatureBlock([
      { ar: 'توقيع الفاحص', en: 'Inspector', name: p.inspectorName },
      { ar: 'اعتماد المراجع', en: 'Reviewed By', name: p.reviewedByName },
    ])}
  </section>`;
}

export const INSPECTION_REPORT_CSS = `
  .id-grid{ display:flex; gap:10px; margin-top:12px; }
  .id-box{ flex:1 1 0; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
  .id-box-title{ background:var(--navy); color:#fff; font-size:9.5pt; font-weight:700; padding:5px 9px; }
  .kv{ font-size:9pt; }
  .kv th{ text-align:start; width:44%; padding:4px 9px; color:var(--muted); font-weight:400;
    border-bottom:1px solid var(--line); background:#f7f9fc; }
  .kv td{ padding:4px 9px; border-bottom:1px solid var(--line); font-weight:700; color:var(--ink); }
  .areas-block{ margin-top:12px; border:1px solid var(--line); border-radius:6px; padding:9px; }
  .areas-title{ font-size:9.5pt; font-weight:700; color:var(--navy); margin-bottom:6px; }
  .areas-list{ display:flex; flex-wrap:wrap; gap:6px; }
  .area-chip{ border:1px solid var(--gold); border-radius:20px; padding:3px 10px; background:#fffdf5; }
  .area-ar{ font-size:9pt; font-weight:700; color:var(--navy); }
  .area-en{ font-size:7.5pt; color:var(--muted); margin-inline-start:6px; }
  .terms{ margin-top:12px; border:1px solid var(--line); border-radius:6px; padding:9px; background:#f7f9fc; }
  .terms-title{ font-size:9.5pt; font-weight:700; color:var(--navy); margin-bottom:4px; }
  .terms p{ font-size:8pt; color:var(--muted); margin:0 0 5px; }
  .sec-block{ margin-bottom:6px; }
  .sec-head{ display:flex; justify-content:space-between; align-items:baseline;
    background:var(--navy); color:#fff; padding:3px 10px; border-radius:5px 5px 0 0; }
  .sec-head-ar{ font-size:11.5pt; font-weight:700; }
  .sec-head-en{ font-size:8pt; color:var(--gold-soft); text-transform:uppercase; letter-spacing:.5px; }
  .items{ border:1px solid var(--line); border-top:none; }
  .items th,.items td{ border-bottom:1px solid var(--line); padding:0 6px; font-size:7.6pt; line-height:1.06; vertical-align:top; }
  .items thead th{ background:#eef2f8; color:var(--navy); font-size:8pt; text-align:start; }
  .c-idx{ width:6%; text-align:center; }
  .c-item{ width:40%; }
  .c-res{ width:12%; text-align:center; }
  .c-note{ width:42%; color:var(--muted); font-size:6.4pt; line-height:1.06; }
  .item-ar{ display:block; font-size:7.6pt; line-height:1.06; color:var(--ink); }
  .item-en{ display:block; font-size:6.2pt; line-height:1.06; color:var(--muted); }
  .pill{ display:inline-block; min-width:16px; padding:1px 5px; border-radius:3px; font-weight:700; font-size:9pt; }
  .r-pass{ background:#dcfce7; color:var(--ok); }
  .r-fail{ background:#fee2e2; color:var(--bad); }
  .r-na{ background:#eef2f8; color:var(--muted); }
  .r-unset{ background:#f5f5f5; color:#9aa4b2; }
  .sec-remarks{ border:1px solid var(--line); border-top:none; padding:6px 9px; font-size:7.4pt; line-height:1.05; color:var(--ink); background:#fbfcfe; }
  .no-findings{ border:1px solid var(--line); border-radius:5px; padding:8px; font-size:8.5pt;
    color:var(--muted); background:#f7f9fc; text-align:center; }
  .diagram-block,.chassis-block,.diag-block,.photo-block{ margin:10px 0; }
  .diagram-title{ font-size:10pt; font-weight:700; color:var(--navy); margin-bottom:6px;
    border-inline-start:4px solid var(--gold); padding-inline-start:7px; }
  .diagram-wrap{ display:flex; gap:12px; align-items:flex-start; }
  .diagram{ position:relative; width:190px; flex:0 0 190px; }
  .bodyplan{ width:100%; height:auto; display:block; }
  .marker{ position:absolute; width:13px; height:13px; border-radius:50%; transform:translate(-50%,-50%);
    display:flex; align-items:center; justify-content:center; font-size:8pt; font-weight:700; color:#fff;
    border:1.5px solid #fff; box-shadow:0 0 0 .5px rgba(0,0,0,.4); }
  .m-green{ background:#15803d; }
  .m-orange{ background:#b45309; }
  .m-red{ background:#b91c1c; }
  .legend{ flex:1 1 auto; display:flex; flex-direction:column; gap:4px; }
  .legend-item{ font-size:8.5pt; color:var(--ink); display:flex; align-items:center; gap:6px; }
  .legend-dot{ width:13px; height:13px; border-radius:50%; display:inline-flex; align-items:center;
    justify-content:center; font-size:8pt; color:#fff; font-weight:700; }
  .ld-green{ background:#15803d; } .ld-orange{ background:#b45309; } .ld-red{ background:#b91c1c; }
  .marker-table{ margin-top:8px; border:1px solid var(--line); }
  .marker-table th,.marker-table td{ border-bottom:1px solid var(--line); padding:3px 7px; font-size:8pt; text-align:start; }
  .marker-table thead th{ background:#eef2f8; color:var(--navy); }
  .chassis-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
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
  .photo-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
  .photo{ margin:0; border:1px solid var(--line); border-radius:5px; overflow:hidden; background:#fff; }
  .photo img{ width:100%; height:118px; object-fit:cover; display:block; }
  .photo figcaption{ font-size:7.5pt; color:var(--muted); padding:3px 5px; }
  .assessment{ margin-top:12px; border:2px solid var(--navy); border-radius:6px; overflow:hidden; }
  .assessment-title{ background:var(--navy); color:var(--gold-soft); font-size:10pt; font-weight:700; padding:6px 10px; }
  .assessment-body{ padding:9px 10px; font-size:9.5pt; color:var(--ink); min-height:38px; }
`;
