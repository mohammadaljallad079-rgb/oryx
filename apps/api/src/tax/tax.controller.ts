import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { TaxService } from './tax.service';
import { CreateTaxRateDto, ListTaxRateQueryDto, UpdateTaxRateDto } from './tax.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

/**
 * Tax management.
 *
 * A tenant's saved taxes, used by the sales, purchasing and POS forms so an
 * operator selects a rate instead of typing one. Reads accept the same two
 * permissions the sales/purchasing screens already hold, so a cashier can list
 * taxes without being able to author them.
 */
@ApiTags('tax')
@ApiBearerAuth()
@Controller('tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get()
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.sales.write',
    'erp.purchasing.read',
    'erp.purchasing.write',
    'company.settings.update',
  )
  @ApiOperation({ summary: 'List taxes' })
  list(@Query() query: ListTaxRateQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.tax.list(query, p);
  }

  @Post()
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Create a tax' })
  create(@Body() dto: CreateTaxRateDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.tax.create(dto, p, actorFrom(p, req));
  }

  @Patch(':id')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Update a tax' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaxRateDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.tax.update(id, dto, p, actorFrom(p, req));
  }

  @Patch(':id/active')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Activate or deactivate a tax' })
  setActive(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.tax.setActive(id, dto.isActive, p, actorFrom(p, req));
  }

  @Delete(':id')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Delete a tax' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.tax.remove(id, p, actorFrom(p, req));
  }
}
