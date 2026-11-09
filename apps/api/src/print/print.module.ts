import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [PrintController],
  providers: [PrintService],
  exports: [PrintService],
})
export class PrintModule {}
