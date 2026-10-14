import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
