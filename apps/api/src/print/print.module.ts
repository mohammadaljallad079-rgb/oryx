import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { SettingsModule } from '../settings/settings.module';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';

@Module({
  imports: [ErpCommonModule, SettingsModule],
  controllers: [PrintController],
  providers: [PrintService],
  exports: [PrintService],
})
export class PrintModule {}
