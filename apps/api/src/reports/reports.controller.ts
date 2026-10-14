import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './reports.dto';

@ApiTags('reports')
@ApiBearerAuth()
@RequireModule('reports_analytics')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('accounting')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.accounting.read', 'erp.accounting.read')
  @ApiOperation({ summary: 'Accounting summary: journals by source and balance check' })
  accounting(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.accountingSummary(query, p);
  }

  @Get('sales')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.sales.read', 'erp.sales.read')
  @ApiOperation({ summary: 'Sales summary by customer and branch' })
  sales(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.salesSummary(query, p);
  }

  @Get('purchasing')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.purchasing.read', 'erp.purchasing.read')
  @ApiOperation({ summary: 'Purchasing summary by supplier' })
  purchasing(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.purchasingSummary(query, p);
  }

  @Get('inventory')
  @RequireAnyPermission('erp.reports.read', 'erp.reports.inventory.read', 'erp.inventory.read')
  @ApiOperation({ summary: 'Inventory valuation, movement and reorder summary' })
  inventory(@Query() query: ReportQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.reports.inventorySummary(query, p);
  }
}
