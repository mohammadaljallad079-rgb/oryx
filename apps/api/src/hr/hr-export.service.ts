import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ErpContextService } from '../common/erp-context.service';
import { DocumentsService } from '../documents/documents.service';
import { PdfRendererService, OFFICIAL_PDF_MARGINS } from '../documents/pdf/pdf-renderer.service';
import { officialFooterTemplate } from '../documents/templates/chrome';
import { renderPayslipHtml } from './templates/payslip.template';
import { notFound, ERROR_CODES } from '../common/errors';
import type { RequestPrincipal } from '../auth/auth.decorators';

/**
 * HR document exports.
 *
 * Two output formats, for two different consumers:
 *
 *  - a payslip is a **document**, so it is rendered as a PDF on the same chrome
 *    as an invoice and carries the issuer identity, the TRN strip and the running
 *    footer. It is rendered on demand and streamed, not stored: a payslip is a
 *    derived view of a posted payroll run, so storing a copy would create a
 *    second source of truth.
 *  - a report is **tabular data**, so it is exported as CSV that opens in any
 *    spreadsheet. The CSV is built from the report's own JSON so the on-screen
 *    numbers and the exported numbers can never disagree.
 */
@Injectable()
export class HrExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ErpContextService,
    private readonly documents: DocumentsService,
    private readonly renderer: PdfRendererService,
  ) {}

  /** A single payslip as a print-ready PDF. */
  async payslipPdf(payslipId: string, principal: RequestPrincipal): Promise<{ bytes: Buffer; filename: string }> {
    const { companyId } = await this.context.resolveCompanyScope(principal);
    const payslip = await this.prisma.payslip.findFirst({
      where: { id: payslipId, companyId },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, payrollRun: { include: { period: true } } },
    });
    if (!payslip) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Payslip not found.');

    const issuer = await this.documents.issuerFor(companyId);
    const baseCss = await this.renderer.baseStyles();
    const html = renderPayslipHtml({
      issuer,
      baseCss,
      payslip: {
        employeeCode: payslip.employeeCode,
        employeeNameEn: payslip.employeeNameEn,
        employeeNameAr: payslip.employeeNameAr,
        periodNameEn: payslip.payrollRun.period?.nameEn ?? null,
        periodNameAr: payslip.payrollRun.period?.nameAr ?? null,
        runNumber: payslip.payrollRun.runNumber,
        workedMinutes: payslip.workedMinutes,
        overtimeMinutes: payslip.overtimeMinutes,
        lateMinutes: payslip.lateMinutes,
        absenceDays: payslip.absenceDays,
        basicMinor: payslip.basicMinor,
        allowancesMinor: payslip.allowancesMinor,
        deductionsMinor: payslip.deductionsMinor,
        grossMinor: payslip.grossMinor,
        netMinor: payslip.netMinor,
        currency: payslip.currency,
        lines: payslip.lines.map((l) => ({ type: l.type, code: l.code, nameEn: l.nameEn, nameAr: l.nameAr, amountMinor: l.amountMinor })),
      },
      periodStart: payslip.payrollRun.period?.startDate ?? null,
      periodEnd: payslip.payrollRun.period?.endDate ?? null,
      issuedAt: new Date(),
    });

    const { pdf } = await this.renderer.render(html, { footerHtml: officialFooterTemplate(issuer), margins: OFFICIAL_PDF_MARGINS });
    const filename = `payslip-${payslip.employeeCode}-${payslip.payrollRun.runNumber}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
    return { bytes: pdf, filename };
  }

  /**
   * Turn a report result into CSV.
   *
   * A report that returns an `items` array is exported row-per-item; a report
   * that returns grouped objects (the payroll-cost report) is exported with one
   * section per group. The header row is derived from the union of the item keys
   * so a column is never silently dropped.
   */
  toCsv(result: Record<string, unknown>): string {
    const items = Array.isArray(result.items)
      ? (result.items as Array<Record<string, unknown>>)
      : Array.isArray(result.byDepartment)
        ? ([...((result.byDepartment as Array<Record<string, unknown>>) ?? [])] as Array<Record<string, unknown>>)
        : [result];
    if (items.length === 0) return 'no data\n';
    const headers = [...new Set(items.flatMap((row) => Object.keys(row)))];
    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [headers.join(',')];
    for (const row of items) lines.push(headers.map((h) => escape(row[h])).join(','));
    return `${lines.join('\n')}\n`;
  }
}
