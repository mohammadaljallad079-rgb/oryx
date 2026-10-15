import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
