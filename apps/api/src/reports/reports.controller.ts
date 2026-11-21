import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { REPORT_DEFINITIONS } from '@oryx/shared';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { ReportsService } from './reports.service';
import { ReportBuilderService } from './report-builder.service';
import { ReportQueryDto } from './reports.dto';
import { ReportPdfService } from '../documents/report-pdf.service';
import { toCsv } from './report-csv';

@ApiTags('reports')
@ApiBearerAuth()
@RequireModule('reports_analytics')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly builder: ReportBuilderService,
    private readonly pdf: ReportPdfService,
  ) {}

  @Get('catalogue')
  @RequireAnyPermission('erp.reports.read')
  @ApiOperation({ summary: 'The report catalogue: every report this platform can produce' })
  catalogue() {
    return { reports: REPORT_DEFINITIONS };
  }

  @Get('accounting')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read')
  @ApiOperation({ summary: 'Accounting summary: journals by source and balance check' })
  accounting(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.accountingSummary(query, p);
  }

  @Get('sales')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.sales.read', 'erp.sales.read')
  @ApiOperation({ summary: 'Sales summary by customer and branch' })
  sales(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.salesSummary(query, p);
  }

  @Get('purchasing')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.purchasing.read', 'erp.purchasing.read')
  @ApiOperation({ summary: 'Purchasing summary by supplier' })
  purchasing(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.purchasingSummary(query, p);
  }

  @Get('inventory')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.inventory.read', 'erp.inventory.read')
  @ApiOperation({ summary: 'Inventory valuation, movement and reorder summary' })
  inventory(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.inventorySummary(query, p);
  }

  /**
   * A report resolved from live data.
   *
   * The route checks the catalogue's own permission list rather than one fixed
   * permission: a report is readable by exactly the principal that could already
   * read its module, and the list lives beside the definition so it cannot drift.
   */
  @Get(':kind/data')
  @RequireAnyPermission(
    'erp.reports.read',
    'erp.reports.sales.read',
    'erp.reports.purchasing.read',
    'erp.reports.inventory.read',
    'erp.reports.accounting.read',
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.inventory.read',
    'erp.accounting.read',
  )
  @ApiOperation({ summary: 'Resolve a catalogue report from live data' })
  async data(@Param('kind') kind: string, @Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    const { result } = await this.builder.build(kind, query, p);
    return result;
  }

  /**
   * The printable PDF of a report.
   *
   * Rendered on demand and streamed inline, so a browser opens it for preview
   * and its print dialog can save it. Nothing is stored: a report is a view of
   * live data, not an issued document.
   */
  @Get(':kind/pdf')
  @RequireAnyPermission(
    'erp.reports.read',
    'erp.reports.sales.read',
    'erp.reports.purchasing.read',
    'erp.reports.inventory.read',
    'erp.reports.accounting.read',
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.inventory.read',
    'erp.accounting.read',
  )
  @ApiOperation({ summary: 'Render a catalogue report as a print-ready PDF' })
  async pdfFile(
    @Param('kind') kind: string,
    @Query() query: ReportQueryDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Res() res: Response,
  ) {
    const { companyId, result } = await this.builder.build(kind, query, p);
    const bytes = await this.pdf.render(companyId, result);
    const filename = `oryx-report-${result.kind}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(bytes);
  }

  /**
   * The CSV of a report.
   *
   * A BOM precedes the body so Excel opens the Arabic headers and names in the
   * right encoding, matching the HR export.
   */
  @Get(':kind/export')
  @RequireAnyPermission(
    'erp.reports.read',
    'erp.reports.sales.read',
    'erp.reports.purchasing.read',
    'erp.reports.inventory.read',
    'erp.reports.accounting.read',
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.inventory.read',
    'erp.accounting.read',
  )
  @ApiOperation({ summary: 'Export a catalogue report as CSV' })
  async export(
    @Param('kind') kind: string,
    @Query() query: ReportQueryDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Res() res: Response,
  ) {
    const { result } = await this.builder.build(kind, query, p);
    const csv = toCsv(result);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="oryx-report-${result.kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(`\uFEFF${csv}`);
  }
}
