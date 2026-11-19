import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { EmployeeFileService } from './employee-file.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [HrController],
  providers: [HrService, EmployeeFileService],
  exports: [HrService],
})
export class HrModule {}
