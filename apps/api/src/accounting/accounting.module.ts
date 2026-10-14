import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
