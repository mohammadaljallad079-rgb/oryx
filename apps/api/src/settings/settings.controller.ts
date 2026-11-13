import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { CompanySettingsService } from './company-settings.service';
import { UpdateSettingsDto } from './settings.dto';
import { SETTING_NAMESPACES, type SettingNamespace } from '@oryx/shared';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class CompanySettingsController {
  constructor(private readonly settings: CompanySettingsService) {}

  @Get()
  @RequireAnyPermission('erp.settings.read', 'erp.settings.update', 'company.settings.update')
  @ApiOperation({ summary: 'Read every settings namespace for the current company' })
  async all(@Query('companyId') companyId: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    const scope = await this.settings.resolveCompanyId(p, companyId);
    return { companyId: scope, settings: await this.settings.all(scope) };
  }

  @Get('namespaces')
  @RequireAnyPermission('erp.settings.read', 'erp.settings.update', 'company.settings.update')
  @ApiOperation({ summary: 'List the settings namespaces the control center renders' })
  namespaces() {
    return { namespaces: SETTING_NAMESPACES };
  }

  @Get('history')
  @RequireAnyPermission('erp.settings.read', 'company.settings.update')
  @ApiOperation({ summary: 'Recent settings changes for the current company' })
  async history(
    @Query('companyId') companyId: string | undefined,
    @Query('namespace') namespace: SettingNamespace | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    const scope = await this.settings.resolveCompanyId(p, companyId);
    return { items: await this.settings.history(scope, namespace) };
  }

  @Get(':namespace')
  @RequireAnyPermission('erp.settings.read', 'erp.settings.update', 'company.settings.update')
  @ApiOperation({ summary: 'Read one settings namespace' })
  async one(
    @Param('namespace') namespace: SettingNamespace,
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    const scope = await this.settings.resolveCompanyId(p, companyId);
    return { companyId: scope, namespace, value: await this.settings.get(scope, namespace) };
  }

  @Patch(':namespace')
  @RequirePermissions('erp.settings.update')
  @ApiOperation({ summary: 'Update one settings namespace for the current company' })
  async update(
    @Param('namespace') namespace: SettingNamespace,
    @Body() dto: UpdateSettingsDto,
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const scope = await this.settings.resolveCompanyId(p, companyId);
    const value = await this.settings.update(scope, namespace, dto.value, actorFrom(p, req));
    return { companyId: scope, namespace, value };
  }

  @Post(':namespace/reset')
  @RequirePermissions('erp.settings.update')
  @ApiOperation({ summary: 'Reset one settings namespace to the platform defaults' })
  async reset(
    @Param('namespace') namespace: SettingNamespace,
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    const scope = await this.settings.resolveCompanyId(p, companyId);
    const value = await this.settings.reset(scope, namespace, actorFrom(p, req));
    return { companyId: scope, namespace, value };
  }
}
