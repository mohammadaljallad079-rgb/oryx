import { Module } from '@nestjs/common';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

/**
 * Website & Application Management. Execution 01 delivered the page, banner and
 * platform-configuration CMS; Execution 07 adds the media library and the
 * dynamic website content the public site reads from.
 */
@Module({
  controllers: [CmsController, MediaController, ContentController],
  providers: [CmsService, MediaService, MediaStorageService, ContentService],
  exports: [CmsService, MediaService, ContentService],
})
export class CmsModule {}
