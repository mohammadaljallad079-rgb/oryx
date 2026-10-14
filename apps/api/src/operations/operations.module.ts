import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
