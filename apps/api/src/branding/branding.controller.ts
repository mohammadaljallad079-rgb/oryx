import { Body, Controller, Delete, Get, Param, Patch, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import type { ActorContext } from '../organizations/organizations.service';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './branding.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

function actorFrom(principal: RequestPrincipal, req: RequestLike): ActorContext {
  const ua = req.headers['user-agent'];
  return {
    userId: principal.userId,
    kind: principal.kind,
    companyId: principal.company?.companyId,
    isSuperAdmin: principal.kind === 'PLATFORM',
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

/**
 * Per-company visual identity API.
 *
 * Reads require `company.read` (or platform company read), writes require
 * `company.settings.update`. The service additionally refuses any company
 * principal acting on a company that is not its own, so the permission alone
 * never grants cross-tenant reach.
 */
@ApiTags('branding')
@ApiBearerAuth()
@Controller('companies')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get(':companyId/branding')
  @RequireAnyPermission('company.read', 'platform.company.read')
  @ApiOperation({ summary: 'Resolved visual identity for a company, with platform defaults applied' })
  get(@Param('companyId') companyId: string) {
    return this.branding.getBranding(companyId);
  }

  @Put(':companyId/branding')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Set the visual identity for a company' })
  update(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateBrandingDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.branding.updateBranding(companyId, dto, actorFrom(principal, req));
  }

  @Patch(':companyId/branding')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Partially update the visual identity for a company' })
  patch(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateBrandingDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.branding.updateBranding(companyId, dto, actorFrom(principal, req));
  }

  @Delete(':companyId/branding')
  @RequirePermissions('company.settings.update')
  @ApiOperation({ summary: 'Reset a company to the platform default identity' })
  reset(
    @Param('companyId') companyId: string,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.branding.resetBranding(companyId, actorFrom(principal, req));
  }
}
