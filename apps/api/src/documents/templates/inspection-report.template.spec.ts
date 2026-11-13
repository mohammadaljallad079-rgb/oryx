import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderInspectionReportHtml } from './report-html';
import type {
  DocumentIssuer,
  InspectionReportPayload,
  InspectionReportSection,
} from '../document-payload';

/**
 * The report must never ask a host font for a glyph the bundled faces lack.
 *
 * `✓` (U+2713), `✕` (U+2715) and `✗` (U+2717) are absent from every face in
 * `assets/fonts`. Chromium synthesises a Type3 bitmap font from a host face for
 * them, which breaks the PDF text layer and makes the output depend on the
 * machine: a developer box with DejaVu renders one PDF, a bare CI runner
 * another. The marks are drawn as SVG instead, and these tests keep it that way.
 */

const MARK_CODEPOINTS = ['\u2713', '\u2715', '\u2717'];

const issuer: DocumentIssuer = {
  companyId: 'c1',
  nameEn: 'ORYX Auto Services',
  nameAr: 'أوريكس لخدمات السيارات',
  code: 'ORYX-AUTO',
  taxNumber: '998877',
  crNumber: 'CR-998877',
  addressLine: 'Building 42, Road 15',
  city: 'Manama',
  phone: '+97317000000',
  email: 'inspection@oryx.local',
  websiteUrl: 'https://oryx.local',
  currency: 'BHD',
};

const interiorSection: InspectionReportSection = {
  area: 'INTERIOR',
  labelEn: 'Interior',
  labelAr: 'الداخلية',
  kind: 'ITEMS',
  remarks: 'Seat trim scuffed.',
  remarksLabelEn: 'Remarks',
  remarksLabelAr: 'ملاحظات',
  noFindings: false,
  items: [
    { itemKey: 'seat', labelEn: 'Seat', labelAr: 'مقعد', result: 'PASS', note: null },
    { itemKey: 'ac', labelEn: 'Air conditioning', labelAr: 'تكييف', result: 'FAIL', note: 'Weak' },
    { itemKey: 'radio', labelEn: 'Radio', labelAr: 'مذياع', result: 'NA', note: null },
  ],
  markers: [],
  chassisRegions: [],
  diagnostics: [],
  attachments: [],
};

const paintSection: InspectionReportSection = {
  area: 'PAINT_BODY',
  labelEn: 'Paint / Body',
  labelAr: 'الهيكل والطلاء',
  kind: 'DIAGRAM_PAINT',
  remarks: null,
  remarksLabelEn: 'Remarks',
  remarksLabelAr: 'ملاحظات',
  noFindings: false,
  items: [],
  markers: [{ condition: 'FILLER', x: 0.4, y: 0.5, panelKey: null, note: 'filler' }],
  chassisRegions: [],
  diagnostics: [],
  attachments: [],
};

const chassisSection: InspectionReportSection = {
  area: 'CHASSIS_UNDERCARRIAGE',
  labelEn: 'Chassis',
  labelAr: 'الشاسيه',
  kind: 'DIAGRAM_CHASSIS',
  remarks: null,
  remarksLabelEn: 'Remarks',
  remarksLabelAr: 'ملاحظات',
  noFindings: false,
  items: [],
  markers: [],
  chassisRegions: [
    { regionKey: 'front', labelEn: 'Front', labelAr: 'أمامي', condition: 'OK', note: null, x: 0, y: 0 },
    { regionKey: 'rear', labelEn: 'Rear', labelAr: 'خلفي', condition: 'DAMAGE', note: null, x: 0, y: 0 },
  ],
  diagnostics: [],
  attachments: [],
};

const payload: InspectionReportPayload = {
  kind: 'INSPECTION_REPORT',
  jobNumber: 'JC-1',
  inspectedAt: '2026-01-01',
  status: 'APPROVED',
  customerName: 'Acme',
  contactNumber: null,
  vehicle: {
    make: 'Toyota',
    model: 'Camry',
    modelYear: 2020,
    plateNumber: '1234',
    vin: 'VIN1234567890',
    color: 'White',
    odometer: 90000,
  },
  branchName: 'Manama',
  inspectorName: 'Ali',
  selectedAreas: ['INTERIOR', 'PAINT_BODY', 'CHASSIS_UNDERCARRIAGE'],
  generalRemarks: null,
  interiorRemarks: null,
  exteriorRemarks: null,
  engineRemarks: null,
  roadTestRemarks: null,
  finalAssessment: 'Roadworthy.',
  reviewedByName: 'Sara',
  reviewedAt: '2026-01-02',
  vehiclePhotoDataUri: null,
  sections: [interiorSection, paintSection, chassisSection],
};

describe('inspection report template — font independence', () => {
  it('renders the pass, fail and damage marks as inline SVG, not text glyphs', () => {
    const html = renderInspectionReportHtml({ issuer, payload, documentNumber: 'VR-1', issuedAt: new Date(), version: 1, verification: null, baseCss: '' });
    // The marks are present...
    expect(html).toContain('mark-check');
    expect(html).toContain('mark-cross');
    expect(html).toContain('mark-x');
    // ...and none of the font-dependent code points survives anywhere.
    for (const cp of MARK_CODEPOINTS) {
      expect(html).not.toContain(cp);
    }
  });

  it('never uses a font-dependent mark code point in any template source', () => {
    const dir = __dirname;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      for (const cp of MARK_CODEPOINTS) {
        if (source.includes(cp)) {
          throw new Error(
            `${file} must not contain U+${cp.codePointAt(0)!.toString(16)}; ` +
              'draw the mark as SVG instead of a host-font glyph.',
          );
        }
      }
    }
  });

  it('prints the vehicle photograph as a full-width band on the cover', () => {
    const html = renderInspectionReportHtml({
      issuer,
      payload: { ...payload, vehiclePhotoDataUri: 'data:image/png;base64,AAAA' },
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    // The approved cover prints the photograph as a bleeding band, not a thumbnail.
    expect(html).toContain('vphoto--bleed');
    expect(html).toContain('class="vphoto-img"');
    expect(html).toContain('data:image/png;base64,AAAA');
    // The vehicle information band spans the full content width, as in the
    // reference, rather than sharing a row with the QR card.
    expect(html).toContain('class="cover-info"');
    expect(html).not.toContain('class="cover-grid"');
  });

  it('overlays the verification QR on the cover photograph band', () => {
    const html = renderInspectionReportHtml({
      issuer,
      payload: { ...payload, vehiclePhotoDataUri: 'data:image/png;base64,AAAA' },
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: {
        token: 'tok-1',
        url: 'https://oryxbhr.com/verify/tok-1',
        qrDataUri: 'data:image/png;base64,QRQR',
      },
      baseCss: '',
    });
    expect(html).toContain('class="cover-qr"');
    expect(html).toContain('data:image/png;base64,QRQR');
    expect(html).toContain('للتأكد من صحة التقرير');
  });

  it('prints a neutral placeholder when no photograph was attached', () => {
    const html = renderInspectionReportHtml({
      issuer,
      payload,
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    expect(html).toContain('vphoto-empty');
    expect(html).not.toContain('class="vphoto-img"');
  });

  it('anchors the interior fittings drawing to the physical left inside the cabin block', () => {
    const html = renderInspectionReportHtml({
      issuer,
      payload,
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    // The drawing is the approved artwork, painted out of flow behind the
    // lower-left checklist. `left` (not `inset-inline-start`) is deliberate:
    // this page is RTL, so the logical property would resolve to the right and
    // the drawing would sit under the wrong column.
    expect(html).toContain('class="interior-art"');
    expect(html).toMatch(/class="interior-art"><img src="data:image\/png;base64,/);
    expect(html).toMatch(/\.cabin\{\s*position:relative;/);
    expect(html).toMatch(/\.interior-art\{\s*position:absolute;\s*left:0;/);
    expect(html).not.toMatch(/\.interior-art\{[^}]*inset-inline-start/);
  });

  it('drops the interior drawing entirely when the cabin checklist is absent', () => {
    const html = renderInspectionReportHtml({
      issuer,
      payload: {
        ...payload,
        sections: payload.sections.filter((s) => s.area !== 'INTERIOR'),
      },
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    expect(html).not.toContain('class="interior-art"');
  });

  it('prints the approved wordmark alone when a logo is configured', () => {
    const html = renderInspectionReportHtml({
      issuer: { ...issuer, logoDataUri: 'data:image/png;base64,AAAA' },
      payload,
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    // The wordmark already carries the company name, so the name stack beside it
    // must not be printed — the approved header shows the mark only.
    expect(html).toContain('class="rh-logo"');
    expect(html).not.toContain('class="rh-name"');
  });

  it('draws the official ORYX logotype as vector art when no logo is configured', () => {
    const html = renderInspectionReportHtml({
      issuer: { ...issuer, logoDataUri: null },
      payload,
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    // The official logotype, traced from the approved sheet, replaces the old
    // monogram placeholder rather than inventing a brand mark.
    expect(html).toContain('class="rh-logo-mark"');
    expect(html).toContain('<path fill="#0a1f44"');
    expect(html).not.toContain('class="rh-monogram"');
  });
});

describe('inspection report template — reference page parity (Execution 19)', () => {
  const render = (payloadOverride: Partial<InspectionReportPayload> = {}) =>
    renderInspectionReportHtml({
      issuer,
      payload: { ...payload, ...payloadOverride },
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });

  it('centres the chassis drawing and distributes the eight region boxes around it', () => {
    const html = render();
    // The approved sheet places the eight boxes around a centred drawing, not in
    // a two-column list beside it.
    expect(html).toContain('class="ch-board"');
    expect(html).toContain('class="ch-row ch-row-edge"');
    expect(html).toContain('class="ch-row ch-row-mid"');
    expect(html).toContain('class="ch-side"');
    expect(html).toContain('class="ch-art"');
    // The old side-list grid must be gone.
    expect(html).not.toContain('class="chassis-wrap"');
    expect(html).not.toContain('class="chassis-grid"');
    expect(html).not.toContain('class="ch-region"');
  });

  it('lays the chassis boxes out physically (LTR) so left cards stay on the left in RTL', () => {
    const html = render();
    expect(html).toMatch(/\.ch-board\{[^}]*direction:ltr/);
  });

  it('prints the paint legend on one row in the reference order, with no marker table', () => {
    const html = render();
    expect(html).toContain('class="legend legend--row"');
    // The reference order is sectioned, Change, Filler, Paint left to right.
    const row = html.slice(html.indexOf('legend legend--row'));
    const order = ['مقطوع', 'تبديل', 'معجون', 'صبغ'].map((w) => row.indexOf(w));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The invented marker table must not be printed.
    expect(html).not.toContain('marker-table');
  });

  it('prints the paint remarks box after the legend, as in the reference', () => {
    const withRemarks: InspectionReportPayload = {
      ...payload,
      sections: payload.sections.map((s) =>
        s.area === 'PAINT_BODY' ? { ...s, remarks: '• خط ملاحظة' } : s,
      ),
    };
    const html = renderInspectionReportHtml({
      issuer,
      payload: withRemarks,
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    const legendAt = html.indexOf('class="legend legend--row"');
    const remarksAt = html.indexOf('class="sec-remarks"');
    expect(legendAt).toBeGreaterThan(-1);
    expect(remarksAt).toBeGreaterThan(legendAt);
  });

  it('overlays the ORYX watermark on the cover photograph band', () => {
    const html = renderInspectionReportHtml({
      issuer: { ...issuer, logoDataUri: 'data:image/png;base64,LOGO' },
      payload: { ...payload, vehiclePhotoDataUri: 'data:image/png;base64,PHOTO' },
      documentNumber: 'VR-1',
      issuedAt: new Date(),
      version: 1,
      verification: null,
      baseCss: '',
    });
    expect(html).toContain('class="vphoto-mark"');
    expect(html).toContain('data:image/png;base64,LOGO');
    // The watermark is painted over the photograph inside the band.
    const band = html.slice(html.indexOf('vphoto--bleed'), html.indexOf('</figure>'));
    expect(band).toContain('vphoto-mark');
    expect(band).toContain('vphoto-img');
  });

  it('prints the AUTO SERVICES watermark on the cover page only', () => {
    const html = render();
    const marks = html.match(/class="rp-watermark"/g) ?? [];
    expect(marks).toHaveLength(1);
    // The single mark must sit inside the first page section, not the body.
    const cover = html.slice(0, html.indexOf('</section>'));
    expect(cover).toContain('rp-watermark');
  });

  it('sets the watermark in the brand display face at the measured reference size', () => {
    const css = render();
    expect(css).toContain("font-family:'ORYX Display'");
    expect(css).toContain('font-size:51.747pt');
    expect(css).toContain('letter-spacing:6.72pt');
    // A low-opacity mark so the printed data stays legible on top of it.
    expect(css).toMatch(/opacity:0\.10/);
  });

  it('sizes each page title to the measurement the approved sheet uses', () => {
    const html = render();
    // The cover and the paint/chassis pages carry the wide setting; the long
    // interior/exterior heading drops a step, exactly as the reference prints
    // it. The computer-unit page adds a second 8.7pt heading when that section
    // is present, which this fixture does not include.
    expect(html).toContain('--p-title-size:10.3pt');
    expect(html).toContain('--p-title-size:10pt');
    expect((html.match(/--p-title-size:8\.7pt/g) ?? []).length).toBe(1);
    // The size is applied through the variable, so no rule pins a fixed size.
    expect(html).toContain('font-size:var(--p-title-size,10.3pt)');
  });

  it('sets the disclaimer and remarks body at the measured reference sizes', () => {
    const html = render();
    // The Arabic disclaimer column prints at 8pt and its English translation at
    // 6pt (measured y566-660 of page 1); the remarks list at 6.6pt.
    expect(html).toContain('.terms-ar{ flex:1 1 0; margin:0; font-size:8pt;');
    expect(html).toContain('.terms-en{ flex:1 1 0; margin:0; font-size:6pt;');
    expect(html).toContain('.remarks-list{ flex:1 1 0; margin:0; padding-inline-start:15px; font-size:6.6pt;');
  });
});
