import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { AttachmentStorage } from './attachment-storage.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

/**
 * The platform-wide attachment surface. Exported so any module can attach files
 * to its own records through the same service instead of growing a second
 * upload path.
 */
@Module({
  imports: [ErpCommonModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentStorage],
  exports: [AttachmentsService, AttachmentStorage],
})
export class AttachmentsModule {}
