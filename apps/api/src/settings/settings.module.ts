import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { CompanySettingsService } from './company-settings.service';
import { CompanySettingsController } from './settings.controller';

/**
 * The per-company settings control center.
 *
 * `CompanySettingsService` is exported because document-producing modules read
 * the current company's settings (VAT rate, numbering prefix, letterhead) when
 * they issue a document.
 */
@Module({
  imports: [ErpCommonModule],
  controllers: [CompanySettingsController],
  providers: [CompanySettingsService],
  exports: [CompanySettingsService],
})
export class SettingsModule {}
