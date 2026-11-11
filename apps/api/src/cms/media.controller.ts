import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentPrincipal, Public, RequirePermissions, type RequestPrincipal } from '../auth/auth.decorators';
import { MediaService } from './media.service';
import { MediaStorageService, sniffMime } from './media-storage.service';
import type { ActorContext } from '../organizations/organizations.service';
import {
  PublishContentDto,
  UpdateMediaAssetDto,
  UploadMediaDto,
  UpsertMediaFolderDto,
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
 * Media library and content API.
 *
 * The read path (`/file`) is public because the marketing website is public and
 * must be able to load its own imagery without a session. Every write path
 * requires `platform.cms.manage`, so a tenant administrator cannot alter the
 * public site.
 */
@ApiTags('cms')
@Controller('cms')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly storage: MediaStorageService,
  ) {}

  // ------------------------------------------------------------------ folders
  @ApiBearerAuth()
  @Get('media/folders')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List media folders' })
  folders() {
    return this.media.listFolders();
  }

  @ApiBearerAuth()
  @Put('media/folders')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Create or rename a media folder' })
  upsertFolder(
    @Body() dto: UpsertMediaFolderDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.media.upsertFolder(dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Delete('media/folders/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Delete an empty media folder' })
  deleteFolder(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.media.deleteFolder(id, actorFrom(p, req));
  }

  // ------------------------------------------------------------------- assets
  @ApiBearerAuth()
  @Get('media')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'List library images' })
  list(
    @Query('folderId') folderId?: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.media.listAssets({
      folderId,
      search,
      tag,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @ApiBearerAuth()
  @Get('media/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Get one image with its usage and version history' })
  get(@Param('id') id: string) {
    return this.media.getAsset(id);
  }

  /**
   * Upload. The buffer is held in memory only long enough to be validated and
   * re-encoded; multer's own size limit is a first gate and the storage service
   * enforces the configured maximum again.
   */
  @ApiBearerAuth()
  @Post('media')
  @RequirePermissions('platform.cms.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image to the media library' })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMediaDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'media.file_required', message: 'No file was uploaded.' });
    }
    return this.media.upload(
      file,
      {
        folderId: dto.folderId,
        altAr: dto.altAr,
        altEn: dto.altEn,
        caption: dto.caption,
        credit: dto.credit,
        licenseNote: dto.licenseNote,
        tags: dto.tags ? dto.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        focalX: dto.focalX ? Number(dto.focalX) : undefined,
        focalY: dto.focalY ? Number(dto.focalY) : undefined,
      },
      actorFrom(p, req),
    );
  }

  @ApiBearerAuth()
  @Patch('media/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Update image metadata, alt text or focal point' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaAssetDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.media.updateAsset(id, dto, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Post('media/:id/replace')
  @RequirePermissions('platform.cms.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Replace the file behind an existing image, keeping its references' })
  async replace(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'media.file_required', message: 'No file was uploaded.' });
    }
    return this.media.replaceAsset(id, file, actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Post('media/:id/restore')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Restore image metadata from a previous version' })
  restore(
    @Param('id') id: string,
    @Body() dto: { revision: number },
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.media.restoreAssetVersion(id, Number(dto.revision), actorFrom(p, req));
  }

  @ApiBearerAuth()
  @Delete('media/:id')
  @RequirePermissions('platform.cms.manage')
  @ApiOperation({ summary: 'Delete an unused image; refused while it is still referenced' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.media.deleteAsset(id, actorFrom(p, req));
  }

  /**
   * Serves the bytes. Public, because the marketing site is public.
   *
   * `variant` selects a pre-generated size, so a phone never downloads the
   * 2400px hero. Responses are immutable: a storage key is content-addressed
   * and never rewritten, so a long cache lifetime cannot serve a stale image.
   */
  @Public()
  @Get('media/:id/file')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Serve an image variant' })
  async file(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('variant') variant?: string,
  ) {
    const asset = await this.media.getAsset(id);
    const variants = asset.variants as Record<string, { key: string; width: number; height: number }>;
    const chosen = variant && variants[variant] ? variants[variant] : variants.hero ?? variants.wide;
    if (!chosen) {
      throw new BadRequestException({ code: 'media.variant_missing', message: 'No variant available.' });
    }

    const buffer = await this.storage.read(chosen.key);
    const sniffed = sniffMime(buffer) ?? 'image/webp';
    res.setHeader('Content-Type', sniffed);
    res.setHeader('Content-Length', String(buffer.length));
    res.status(200).send(buffer);
  }
}
