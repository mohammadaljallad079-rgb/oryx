import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Public, RequirePermissions, type RequestPrincipal } from '../auth/auth.decorators';
import { CmsService } from './cms.service';
import type { ActorContext } from '../organizations/organizations.service';
import {
  CreateApiClientDto,
  UpsertAppVersionDto,
  UpsertBannerDto,
  UpsertCmsPageDto,
  UpsertFeatureFlagDto,
} from './cms.dto';

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

@ApiTags('cms')
@Controller('cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  // ------------------------------------------------------------ public reads
  @Public()
  @Get('public/content')
  @ApiOperation({ summary: 'Public published content for the website and app shells' })
  publicContent(@Query('locale') locale = 'ar') {
    return this.cms.publicContent(locale === 'en' ? 'en' : 'ar');
  }

  // ---------------------------------------------------------------- admin CMS
  @ApiBearerAuth()
  @Get('pages')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List CMS pages' })
  pages(@Query('locale') locale?: string) {
    return this.cms.listPages(locale);
  }

  @ApiBearerAuth()
  @Put('pages')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Create or update a CMS page' })
  upsertPage(@Body() dto: UpsertCmsPageDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.cms.upsertPage(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Delete('pages/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Delete a CMS page' })
  deletePage(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.cms.deletePage(id, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Get('banners')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List home-screen and web banners' })
  banners(@Query('placement') placement?: string) {
    return this.cms.listBanners(placement);
  }

  @ApiBearerAuth()
  @Put('banners')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Create or update a banner' })
  upsertBanner(@Body() dto: UpsertBannerDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.cms.upsertBanner(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Get('feature-flags')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'List application feature flags' })
  featureFlags() {
    return this.cms.listFeatureFlags();
  }

  @ApiBearerAuth()
  @Put('feature-flags')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'Create or update a feature flag' })
  upsertFeatureFlag(
    @Body() dto: UpsertFeatureFlagDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.cms.upsertFeatureFlag(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Get('app-versions')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'List mobile application version records' })
  appVersions() {
    return this.cms.listAppVersions();
  }

  @ApiBearerAuth()
  @Put('app-versions')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'Record a mobile application version' })
  upsertAppVersion(
    @Body() dto: UpsertAppVersionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.cms.upsertAppVersion(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Get('service-categories')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List automotive and marketplace service categories' })
  serviceCategories() {
    return this.cms.listServiceCategories();
  }

  @ApiBearerAuth()
  @Get('notification-templates')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List notification templates (email/SMS/push)' })
  notificationTemplates() {
    return this.cms.listNotificationTemplates();
  }

  @ApiBearerAuth()
  @Get('api-clients')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'List registered API clients (secrets never returned)' })
  apiClients() {
    return this.cms.listApiClients();
  }

  @ApiBearerAuth()
  @Post('api-clients')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'Register an API client; the secret is returned once' })
  createApiClient(
    @Body() dto: CreateApiClientDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.cms.createApiClient(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Post('api-clients/:id/revoke')
  @RequirePermissions('platform.api.manage')
  @ApiOperation({ summary: 'Revoke an API client' })
  revokeApiClient(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.cms.revokeApiClient(id, actorFrom(p, req));
  }
}
