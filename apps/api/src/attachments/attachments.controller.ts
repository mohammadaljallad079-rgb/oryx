import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import type { AttachmentDto } from '@oryx/shared';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { AttachmentsService, type UploadedFileLike } from './attachments.service';

/**
 * Attachments for sales invoices and receipts.
 *
 * Every route is scoped by permission and by the owning document's company, so
 * a user can only attach to — or read — a document inside their own tenant. The
 * stored value never leaves the API: reads return metadata only and the bytes
 * stream back through this controller, which re-checks ownership each time.
 */
@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':entityType/:entityId')
  @RequireAnyPermission('erp.sales.read', 'erp.accounting.read', 'erp.accounting.payment.manage')
  @ApiOperation({ summary: 'List attachments for a document' })
  list(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @CurrentPrincipal() p: RequestPrincipal,
  ): Promise<AttachmentDto[]> {
    return this.attachments.list(entityType, entityId, p);
  }

  @Post(':entityType/:entityId')
  @RequireAnyPermission('erp.sales.invoice.manage', 'erp.accounting.payment.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Attach a PDF/JPG/PNG to a document' })
  upload(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @UploadedFile() file: UploadedFileLike,
    @CurrentPrincipal() p: RequestPrincipal,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(entityType, entityId, file, p);
  }

  @Get(':entityType/:entityId/:attachmentId/download')
  @RequireAnyPermission('erp.sales.read', 'erp.accounting.read', 'erp.accounting.payment.manage')
  @ApiOperation({ summary: 'Download an attachment (or open it for preview)' })
  async download(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.resolveForDownload(entityType, entityId, attachmentId, p);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    // `inline` lets the browser preview PDFs/images; the filename is quoted so a
    // name with spaces or non-ASCII characters survives the header.
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    this.attachments.stream(file.path).pipe(res);
  }

  @Delete(':entityType/:entityId/:attachmentId')
  @RequireAnyPermission('erp.sales.invoice.manage', 'erp.accounting.payment.manage')
  @ApiOperation({ summary: 'Remove an attachment' })
  remove(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentPrincipal() p: RequestPrincipal,
  ): Promise<{ deleted: true }> {
    return this.attachments.remove(entityType, entityId, attachmentId, p);
  }
}
