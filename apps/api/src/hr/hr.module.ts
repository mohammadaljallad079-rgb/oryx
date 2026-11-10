import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { DocumentsModule } from '../documents/documents.module';
import { HrController } from './hr.controller';
import { HrExportService } from './hr-export.service';
import { HrService } from './hr.service';

@Module({
  imports: [ErpCommonModule, DocumentsModule],
  controllers: [HrController],
  providers: [HrService, HrExportService],
  exports: [HrService],
})
export class HrModule {}
