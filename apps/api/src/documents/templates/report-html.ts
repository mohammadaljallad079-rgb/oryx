import { planInspectionReport, sectionsOnReportPage } from '@oryx/shared';
import { CHROME_CSS, type DocumentChrome } from './chrome';
import { INSPECTION_REPORT_CSS } from './inspection-report.template';
import { esc } from './html.util';
import type { DocumentIssuer, DocumentVerification, InspectionReportPayload } from '../document-payload';
import {
  chassisSectionPage,
  computerSectionPage,
  identificationPage,
  inspectionGroupPage,
  paintSectionPage,
} from './inspection-report.template';

/**
 * Assembles the full inspection report document.
 *
 * The page list comes from the shared planner, so the pagination a test asserts
 * and the pagination the customer receives are produced by the same function.
 * The running footer is a Chromium page template built by the caller, so it is
 * not emitted here.
 */

export interface ReportRenderInput {
  issuer: DocumentIssuer;
  payload: InspectionReportPayload;
  documentNumber: string;
  issuedAt: Date;
  version: number;
  verification: DocumentVerification | null;
  /** Base CSS from the renderer, including the embedded font faces. */
  baseCss: string;
}

export function renderInspectionReportHtml(input: ReportRenderInput): string {
  const plan = planInspectionReport(input.payload.selectedAreas);

  const chrome: DocumentChrome = {
    issuer: input.issuer,
    titleEn: 'Vehicle Inspection Report',
    titleAr: 'تقرير فحص المركبات',
    documentNumber: input.documentNumber,
    issuedAt: input.issuedAt,
    subtitle: `${input.payload.vehicle.make} ${input.payload.vehicle.model} · ${input.payload.vehicle.vin}`,
  };

  const byArea = new Map(input.payload.sections.map((s) => [s.area, s]));
  const pages: string[] = [];
  pages.push(identificationPage(input, chrome));

  for (const page of plan) {
    if (page.kind === 'IDENTIFICATION') continue;
    const specs = sectionsOnReportPage(page, input.payload.selectedAreas);
    const first = specs[0]?.key;
    if (!first) continue;

    // The section that owns the page decides its shape: paint and chassis each
    // have a dedicated drawing page, the computer unit has the fault table, and
    // the four remaining sections share the interior/exterior/engine/road page.
    if (first === 'PAINT_BODY') {
      pages.push(paintSectionPage(input, byArea.get('PAINT_BODY')));
    } else if (first === 'CHASSIS_UNDERCARRIAGE') {
      pages.push(chassisSectionPage(input, byArea.get('CHASSIS_UNDERCARRIAGE')));
    } else if (first === 'COMPUTER_UNIT') {
      pages.push(computerSectionPage(input, byArea.get('COMPUTER_UNIT')));
    } else {
      const group = specs
        .map((s) => byArea.get(s.key))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      pages.push(inspectionGroupPage(input, group));
    }
  }

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(input.documentNumber)} · تقرير فحص المركبات</title>
<style>${input.baseCss}
${CHROME_CSS}
${INSPECTION_REPORT_CSS}
</style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}
