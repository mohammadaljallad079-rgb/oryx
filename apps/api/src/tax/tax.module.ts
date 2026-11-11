import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [TaxController],
  providers: [TaxService],
  exports: [TaxService],
})
export class TaxModule {}
