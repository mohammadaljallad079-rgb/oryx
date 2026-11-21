import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Public, RequirePermissions, type RequestPrincipal } from '../auth/auth.decorators';
import { ContentService } from './content.service';
import type { ActorContext } from '../organizations/organizations.service';
import {
  PublishContentDto,
  RestoreRevisionDto,
  UpdateServiceCategoryDto,
  UpsertBannerFullDto,
  UpsertContentBlockDto,
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

/**
 * Website content API.
 *
 * The public read returns only published blocks. The admin reads return
 * drafts too, so an editor can see what is staged before it goes live.
 */
@ApiTags('cms')
@Controller('cms')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('public/website')
  @ApiOperation({ summary: 'Published website content: hero, sections, categories and banners' })
  publicWebsite(@Query('locale') locale = 'ar') {
    return this.content.publicContent(locale === 'en' ? 'en' : 'ar');
  }

  @ApiBearerAuth()
  @Get('content')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List website content blocks, drafts included' })
  list(
    @Query('locale') locale?: string,
    @Query('keyPrefix') keyPrefix?: string,
    @Query('includeUnpublished') includeUnpublished?: string,
  ) {
    return this.content.listBlocks({
      locale,
      keyPrefix,
      includeUnpublished: includeUnpublished !== 'false',
    });
  }

  @ApiBearerAuth()
  @Put('content')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Create or update a website content block' })
  upsert(
    @Body() dto: UpsertContentBlockDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.upsertBlock(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Post('content/:key/:locale/publish')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Publish or unpublish a content block' })
  publish(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @Body() dto: PublishContentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.publishBlock(key, locale, dto.isPublished, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Get('content/:key/:locale/revisions')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List previous versions of a content block' })
  revisions(@Param('key') key: string, @Param('locale') locale: string) {
    return this.content.listRevisions(key, locale);
  }

  @ApiBearerAuth()
  @Post('content/:key/:locale/restore')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Revert a content block to a previous version' })
  restore(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @Body() dto: RestoreRevisionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.restoreRevision(key, locale, dto.revision, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Delete('content/:key/:locale')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Delete a content block' })
  remove(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.deleteBlock(key, locale, actorFrom(p, req));
  }

  // ------------------------------------------------- service categories

  @ApiBearerAuth()
  @Get('categories')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List service categories with their imagery and copy' })
  categories() {
    return this.content.listCategories();
  }

  @ApiBearerAuth()
  @Patch('categories/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Set a service category image and marketing copy' })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateServiceCategoryDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.updateCategory(id, dto, actorFrom(p, req));
  }

  // ------------------------------------------------------------- banners

  @ApiBearerAuth()
  @Get('banners')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List banners' })
  banners(@Query('placement') placement?: string) {
    return this.content.listBanners(placement);
  }

  @ApiBearerAuth()
  @Post('banners')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Create a banner' })
  createBanner(
    @Body() dto: UpsertBannerFullDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.createBanner(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Put('banners/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Update a banner' })
  updateBanner(
    @Param('id') id: string,
    @Body() dto: UpsertBannerFullDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.updateBanner(id, dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Delete('banners/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Delete a banner' })
  deleteBanner(
    @Param('id') id: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.content.deleteBanner(id, actorFrom(p, req));
  }
}
