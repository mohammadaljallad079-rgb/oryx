import { Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  COMPANY_SETTING_SECTIONS,
  COMPANY_SETTING_DEFAULTS,
  type CompanySettingSection,
} from '@oryx/shared';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { AuditService } from '../common/audit.service';
import { badRequest, ERROR_CODES } from '../common/errors';
import { CompanySettingsService } from './company-settings.service';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Per-company settings centre.
 *
 * Reads need `company.settings.read` (or the update permission); writes need
 * `company.settings.update`. The company is resolved from the caller's scope,
 * so a body that names another company is ignored — isolation lives in the
 * service query, not in the UI.
 */
@ApiTags('company-settings')
@ApiBearerAuth()
@Controller('company-settings')
export class CompanySettingsController {
  constructor(
    private readonly settings: CompanySettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequireAnyPermission('company.settings.read', 'company.settings.update')
  @ApiOperation({ summary: 'Every settings section for the active company' })
  getAll(
    @CurrentPrincipal() p: RequestPrincipal,
    @Query('companyId') companyId?: string,
  ) {
    return this.settings.getSettings(p, companyId);
  }

  @Get('catalogue')
  @RequireAnyPermission('company.settings.read', 'company.settings.update')
  @ApiOperation({ summary: 'Section list with the platform defaults' })
  catalogue() {
    return {
      sections: COMPANY_SETTING_SECTIONS,
      defaults: COMPANY_SETTING_DEFAULTS,
    };
  }

  @Get(':section')
  @RequireAnyPermission('company.settings.read', 'company.settings.update')
  @ApiOperation({ summary: 'One settings section for the active company' })
  getSection(
    @Param('section') section: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Query('companyId') companyId?: string,
  ) {
    return this.settings.getSection(p, this.assertSection(section), companyId);
  }

  @Put(':section')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Merge a partial update into one settings section' })
  async updateSection(
    @Param('section') section: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
    @Query('companyId') companyId?: string,
  ) {
    const key = this.assertSection(section);
    const { companyId: resolved } = { companyId };
    const updated = await this.settings.updateSection(p, key, body, p.userId, resolved);
    await this.audit.record({
      actorUserId: p.userId,
      companyId: p.company?.companyId ?? null,
      action: 'company.settings_updated',
      targetType: 'COMPANY_SETTING',
      targetId: key,
      summary: `Updated ${key} settings`,
      ipAddress: req.ip ?? null,
    });
    return updated;
  }

  private assertSection(section: string): CompanySettingSection {
    if (!(COMPANY_SETTING_SECTIONS as readonly string[]).includes(section)) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, `Unknown settings section "${section}".`);
    }
    return section as CompanySettingSection;
  }
}
