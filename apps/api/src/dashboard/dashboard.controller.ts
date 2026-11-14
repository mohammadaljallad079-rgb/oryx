import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { DashboardService } from './dashboard.service';
import { ModuleDashboardService } from './module-dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly modules: ModuleDashboardService,
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
  @ApiOperation({ summary: 'Per-module dashboard: live statistics, KPIs, shortcuts and recent activity' })
  module(
    @Param('moduleKey') moduleKey: string,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.modules.build(moduleKey, principal, { companyId, branchId });
  }
}
