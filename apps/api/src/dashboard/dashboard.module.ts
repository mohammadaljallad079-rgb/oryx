import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ModuleDashboardService } from './module-dashboard.service';

@Module({
  imports: [ErpCommonModule],
  controllers: [DashboardController],
  providers: [DashboardService, ModuleDashboardService],
})
export class DashboardModule {}
