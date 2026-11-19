import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES_PER_REQUEST } from '@oryx/shared';
import { CurrentPrincipal, type RequestPrincipal } from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { AttachmentsService, type UploadedFileLike } from './attachments.service';
import { UpdateAttachmentDto } from './attachments.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

/**
 * One attachment surface for the whole platform.
 *
 * The entity type decides the permissions: `AttachmentsService` looks the type
 * up in the shared catalogue and refuses a caller that does not hold the
 * catalogue's read or write permission. That is why these routes carry no
 * static `@RequirePermissions` — a single route serves every module, so the
 * check has to be per entity and lives in the service, next to the catalogue.
 * Authentication is still enforced globally by `PrincipalGuard`.
 */
@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List the attachments of one record' })
  list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    return this.attachments.list(entityType, entityId, p);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one or more files to a record' })
  @UseInterceptors(
    // No `dest`: multer's default in-memory storage is what this path needs —
    // the service validates and then writes the bytes itself.
    FilesInterceptor('files', ATTACHMENT_MAX_FILES_PER_REQUEST, {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: ATTACHMENT_MAX_FILES_PER_REQUEST },
    }),
  )
  upload(
    @UploadedFiles() files: UploadedFileLike[] | undefined,
    @Body() body: { entityType?: string; entityId?: string; isConfidential?: string; isPrimary?: string },
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.attachments.upload(
      body.entityType ?? '',
      body.entityId ?? '',
      files ?? [],
      { isConfidential: body.isConfidential === 'true', isPrimary: body.isPrimary === 'true' },
      p,
      actorFrom(p, req),
    );
  }

  @Post(':id/replace')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Replace the file behind an existing attachment' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES } }),
  )
  replace(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.attachments.replace(
      id,
      file ?? { originalname: '', mimetype: '', size: 0, buffer: Buffer.alloc(0) },
      p,
      actorFrom(p, req),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename an attachment or change its flags' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttachmentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.attachments.update(id, dto, p, actorFrom(p, req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attachment and its stored file' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.attachments.remove(id, p, actorFrom(p, req));
  }

  /**
   * Stream the stored file. `inline` is what the preview uses; `download`
   * forces a save dialog. Both require the same permission as listing.
   */
  @Get(':id/content')
  @ApiOperation({ summary: 'Open or download an attachment file' })
  async content(
    @Param('id') id: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<StreamableFile> {
    const mode = disposition === 'download' ? 'attachment' : 'inline';
    const file = await this.attachments.open(id, p, mode);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `${file.disposition}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    // Attachments are user-supplied bytes: never let the browser sniff a
    // different type, and never let an inline SVG run script in the app origin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; object-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return new StreamableFile(file.stream);
  }
}
