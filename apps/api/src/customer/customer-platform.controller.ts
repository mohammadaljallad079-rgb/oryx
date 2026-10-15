import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequireModule, RequirePermissions, type RequestPrincipal } from '../auth/auth.decorators';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CustomerPlatformService } from './customer-platform.service';
import {
  CustomerAccountQueryDto,
  LinkCustomerAccountDto,
  SetCustomerAccountStatusDto,
} from './customer-platform.dto';

/**
 * The staff view of the customer platform.
 *
 * This is the tenant-side half of the `customer_portal` module. It reads the
 * consumer accounts linked to the caller's company and lets an operator link an
 * account to an ERP customer or suspend it.
 *
 * Two rules hold here:
 *  - the company always comes from the principal, never the request, so an
 *    operator cannot widen the scope by naming another tenant;
 *  - the account id is treated as a claim and is re-checked against that
 *    company inside the service, so guessing an id from another tenant fails.
 */
@ApiTags('customer-platform')
@ApiBearerAuth()
@Controller('customer-platform')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class CustomerPlatformController {
  constructor(private readonly platform: CustomerPlatformService) {}

  @Get('summary')
  @RequireModule('customer_portal')
  @RequirePermissions('erp.customer_portal.read')
  @ApiOperation({ summary: 'Customer platform counters' })
  async summary(@CurrentPrincipal() principal: RequestPrincipal) {
    return this.platform.summary(principal.company?.companyId ?? '');
  }

  @Get('accounts')
  @RequireModule('customer_portal')
  @RequirePermissions('erp.customer_portal.read')
  @ApiOperation({ summary: 'List consumer accounts linked to the company' })
  async accounts(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query() query: CustomerAccountQueryDto,
  ) {
    return this.platform.listAccounts({
      companyId: principal.company?.companyId ?? '',
      search: query.search,
      status: query.status,
      page: Math.max(1, Number(query.page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 25)),
    });
  }

  @Get('accounts/:id')
  @RequireModule('customer_portal')
  @RequirePermissions('erp.customer_portal.read')
  @ApiOperation({ summary: 'One consumer with garage and recent activity' })
  async account(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.platform.getAccount(principal.company?.companyId ?? '', id);
  }

  @Post('accounts/:id/link')
  @HttpCode(HttpStatus.OK)
  @RequireModule('customer_portal')
  @RequirePermissions('erp.customer_portal.manage')
  @ApiOperation({ summary: 'Link a consumer account to an ERP customer' })
  async link(
    @Param('id') id: string,
    @Body() dto: LinkCustomerAccountDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.platform.linkToCustomer(principal.company?.companyId ?? '', id, {
      customerId: dto.customerId,
      actorUserId: principal.userId,
    });
  }

  @Post('accounts/:id/status')
  @HttpCode(HttpStatus.OK)
  @RequireModule('customer_portal')
  @RequirePermissions('erp.customer_portal.manage')
  @ApiOperation({ summary: 'Suspend or reinstate a consumer account' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: SetCustomerAccountStatusDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.platform.setAccountStatus(principal.company?.companyId ?? '', id, {
      status: dto.status,
      reason: dto.reason,
      actorUserId: principal.userId,
    });
  }
}
