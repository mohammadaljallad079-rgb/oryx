import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentStorageService } from './document-storage.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentStorageService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
