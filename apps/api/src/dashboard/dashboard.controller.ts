import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { DashboardService } from './dashboard.service';
import { ModuleSummaryService } from './module-summary.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly modules: ModuleSummaryService,
  ) {}

  @Get()
  @RequireAnyPermission('erp.dashboard.read', 'platform.company.read')
  @ApiOperation({ summary: 'DB-backed dashboard metrics for the authorized company/branch scope' })
  get(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.dashboard.build(principal, { companyId, branchId });
  }

  @Get('modules/:moduleKey')
  @RequireAnyPermission('erp.dashboard.read', 'platform.company.read')
  @ApiOperation({ summary: 'DB-backed summary for a single module dashboard' })
  moduleSummary(
    @Param('moduleKey') moduleKey: string,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.modules.build(moduleKey, principal, { companyId, branchId });
  }
}
