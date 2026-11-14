import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { DocumentsService } from './documents.service';
import { RegisterDocumentDto, ReplaceDocumentDto } from './documents.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('entity-types')
  @RequireAnyPermission('erp.document.read', 'erp.document.upload')
  @ApiOperation({ summary: 'List the record types that accept documents' })
  entityTypes() {
    return { entityTypes: DocumentsService.entityTypes };
  }

  @Get()
  @RequireAnyPermission('erp.document.read', 'erp.document.upload')
  @ApiOperation({ summary: 'List documents attached to a record' })
  list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    return this.documents.list(p, entityType, entityId, companyId);
  }

  /**
   * Register a document by reference.
   *
   * Used when the binary is stored elsewhere (an object store, a scanned batch)
   * and only its metadata needs recording. Both paths write the same row, so a
   * referenced document behaves identically to an uploaded one.
   */
  @Post()
  @RequirePermissions('erp.document.upload')
  @ApiOperation({ summary: 'Register a document by storage reference' })
  register(@Body() dto: RegisterDocumentDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.documents.upload(p, dto, actorFrom(p, req));
  }

  /** Upload a document as multipart/form-data. */
  @Post('upload')
  @RequirePermissions('erp.document.upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document (PDF, DOC/DOCX, XLS/XLSX, JPG, PNG)' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body() dto: RegisterDocumentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.documents.upload(
      p,
      {
        ...dto,
        fileName: dto.fileName ?? file?.originalname ?? 'document',
        mimeType: file?.mimetype ?? dto.mimeType ?? null,
        sizeBytes: file?.size ?? dto.sizeBytes ?? 0,
        // The binary is written to the storage root; the row keeps only the
        // opaque reference and the metadata.
        buffer: file?.buffer ?? null,
      },
      actorFrom(p, req),
    );
  }

  @Post(':id/replace')
  @RequirePermissions('erp.document.upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Replace a document (metadata and/or stored file)' })
  @UseInterceptors(FileInterceptor('file'))
  replace(
    @Param('id') id: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body() dto: ReplaceDocumentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.documents.replace(
      p,
      id,
      {
        ...dto,
        fileName: dto.fileName ?? file?.originalname,
        mimeType: file?.mimetype ?? dto.mimeType ?? null,
        sizeBytes: file?.size ?? dto.sizeBytes,
        buffer: file?.buffer ?? null,
      },
      actorFrom(p, req),
    );
  }

  @Get(':id/download')
  @RequireAnyPermission('erp.document.read', 'erp.document.upload')
  @ApiOperation({ summary: 'Download a stored document; the company scope is enforced first' })
  async download(
    @Param('id') id: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.documents.download(p, id);
    res.setHeader('Content-Type', doc.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    res.setHeader('Content-Length', String(doc.sizeBytes));
    return new StreamableFile(doc.stream as Readable);
  }

  @Delete(':id')
  @RequirePermissions('erp.document.delete')
  @ApiOperation({ summary: 'Delete a document' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.documents.remove(p, id, actorFrom(p, req));
  }
}
