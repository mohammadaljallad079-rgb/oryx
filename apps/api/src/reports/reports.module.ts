import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { DocumentsModule } from '../documents/documents.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportBuilderService } from './report-builder.service';

/**
 * Reporting and analytics.
 *
 * `DocumentsModule` is imported for its Chromium renderer and issuer resolver:
 * a report PDF is produced by the same pipeline as an issued invoice, so the two
 * print as one family. The builder holds no state of its own — every report is
 * resolved from live data on each request.
 */
@Module({
  imports: [ErpCommonModule, DocumentsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportBuilderService],
  exports: [ReportsService, ReportBuilderService],
})
export class ReportsModule {}
