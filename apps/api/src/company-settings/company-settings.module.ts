import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit.module';
import { ErpCommonModule } from '../common/erp-common.module';
import { CompanySettingsController } from './company-settings.controller';
import { CompanySettingsService } from './company-settings.service';

@Module({
  imports: [AuditModule, ErpCommonModule],
  controllers: [CompanySettingsController],
  providers: [CompanySettingsService],
  exports: [CompanySettingsService],
})
export class CompanySettingsModule {}
