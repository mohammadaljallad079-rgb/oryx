import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { DocumentsModule } from '../documents/documents.module';
import { HrController } from './hr.controller';
import { HrExportService } from './hr-export.service';
import { HrService } from './hr.service';
import { EmployeeFileService } from './employee-file.service';

@Module({
  imports: [ErpCommonModule, DocumentsModule, AttachmentsModule],
  controllers: [HrController],
  providers: [HrService, HrExportService, EmployeeFileService],
  exports: [HrService, EmployeeFileService],
})
export class HrModule {}
