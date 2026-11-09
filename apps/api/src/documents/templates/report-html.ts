import { planInspectionReport, sectionsOnReportPage } from '@oryx/shared';
import { CHROME_CSS, type DocumentChrome } from './chrome';
import { INSPECTION_REPORT_CSS } from './inspection-report.template';
import { esc } from './html.util';
import type { DocumentIssuer, DocumentVerification, InspectionReportPayload } from '../document-payload';
import {
  identificationPage,
  sectionPage,
  summaryPage,
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

  const pages: string[] = [];
  pages.push(identificationPage(input, chrome));

  for (const page of plan) {
    if (page.kind === 'IDENTIFICATION') continue;
    const specs = sectionsOnReportPage(page, input.payload.selectedAreas);
    pages.push(sectionPage(input, chrome, specs, page.number));
  }

  // The summary is only added when there is something to summarise: the
  // assessment, a remark, or the verification block. A summary page with three
  // empty boxes reads as a defect.
  const hasSummaryContent =
    Boolean(input.payload.finalAssessment) ||
    Boolean(input.payload.generalRemarks) ||
    Boolean(input.payload.interiorRemarks) ||
    Boolean(input.payload.exteriorRemarks) ||
    Boolean(input.payload.engineRemarks) ||
    Boolean(input.payload.roadTestRemarks) ||
    Boolean(input.verification);
  if (hasSummaryContent) {
    pages.push(summaryPage(input, chrome, pages.length + 1));
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
