import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentStorageService } from './document-storage.service';
import { DocumentFontService } from './pdf/document-fonts.service';
import { PdfRendererService } from './pdf/pdf-renderer.service';
import { QrService } from './pdf/qr.service';

/**
 * Official documents, PDF printing and QR verification.
 *
 * The renderer holds a Chromium instance for its lifetime, so this module is
 * imported once by the application and never instantiated per request. The font
 * service is likewise a singleton: the embedded faces are read once and reused.
 */
@Module({
  imports: [ErpCommonModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentStorageService,
    DocumentFontService,
    PdfRendererService,
    QrService,
  ],
  exports: [DocumentsService, PdfRendererService, DocumentFontService],
})
export class DocumentsModule {}
