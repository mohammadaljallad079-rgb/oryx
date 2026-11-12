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
});
