import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { CmsModule } from '../cms/cms.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentStorageService } from './document-storage.service';
import { DocumentFontService } from './pdf/document-fonts.service';
import { PdfRendererService } from './pdf/pdf-renderer.service';

/**
 * Official documents, PDF printing and QR verification.
 *
 * The renderer holds a Chromium instance for its lifetime, so this module is
 * imported once by the application and never instantiated per request. The font
 * service is likewise a singleton: the embedded faces are read once and reused.
 * `QrService` is provided by `ErpCommonModule` and shared with the print module,
 * so the issued document and the on-demand print form encode one URL per record.
 * `CmsModule` supplies `MediaStorageService`, used to read a diagnostic PDF that
 * is merged into an issued inspection report.
 */
@Module({
  imports: [ErpCommonModule, CmsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentStorageService, DocumentFontService, PdfRendererService],
  exports: [DocumentsService, PdfRendererService, DocumentFontService],
})
export class DocumentsModule {}
