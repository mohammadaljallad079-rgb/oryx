import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ModuleSummaryService } from './module-summary.service';
import { ErpCommonModule } from '../common/erp-common.module';

@Module({
  imports: [ErpCommonModule],
  controllers: [DashboardController],
  providers: [DashboardService, ModuleSummaryService],
})
export class DashboardModule {}
