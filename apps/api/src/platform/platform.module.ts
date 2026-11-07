import { Module } from '@nestjs/common';

import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';
import { EcosystemService } from './ecosystem.service';

@Module({
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService, EcosystemService],
  exports: [PlatformSettingsService, EcosystemService],
})
export class PlatformModule {}
