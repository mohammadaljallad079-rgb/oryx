import { Injectable } from '@nestjs/common';
import type { ReportResultDto } from '@oryx/shared';
import { DocumentsService } from './documents.service';
import { PdfRendererService, REPORT_PDF_MARGINS } from './pdf/pdf-renderer.service';
import { officialFooterTemplate } from './templates/chrome';
import { renderReportHtml } from './templates/report-document.template';

/**
 * Renders a report to a print-ready PDF.
 *
 * A report is not a stored document: it is generated on demand from live data,
 * so it is never written to the document store and never carries a QR token.
 * It reuses the same Chromium renderer, the same embedded faces and the same
 * official contact footer as an issued invoice, so a printed report and a
 * printed invoice read as one family.
 *
 * The bytes are returned to the controller, which streams them; nothing is
 * persisted, so a report is always the figures as of the request.
 */
@Injectable()
export class ReportPdfService {
  constructor(
    private readonly documents: DocumentsService,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(companyId: string, result: ReportResultDto): Promise<Buffer> {
    const issuer = await this.documents.issuerFor(companyId);
    const baseCss = await this.renderer.baseStyles();
    const html = renderReportHtml({ issuer, result, baseCss });
    const footerHtml = `<style>${baseCss}</style>${officialFooterTemplate(issuer)}`;
    const { pdf } = await this.renderer.render(html, { footerHtml, margins: REPORT_PDF_MARGINS });
    return pdf;
  }
}
