import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { OFFICIAL_DOCUMENTS } from '@oryx/shared';
import {
  CurrentPrincipal,
  Public,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom, ErpContextService } from '../common/erp-context.service';
import { DocumentsService } from './documents.service';
import { IssueFinancialDocumentDto, RevokeDocumentDto } from './documents.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The official-document routes.
 *
 * Three surfaces:
 *
 *  - `/documents/verify/:token` is public. It answers a QR scan, which arrives
 *    with no session, and exposes only non-sensitive identity fields.
 *  - `/documents/...` issues, reads, downloads and revokes inside a tenant.
 *  - `/automotive/inspections/:id/documents` issues a report for an inspection.
 *
 * Every tenant route is behind `erp.inspection.read` or the matching financial
 * read permission, and every write additionally requires the module to be
 * licensed, so a tenant that does not license automotive cannot issue a report.
 */
@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly context: ErpContextService,
  ) {}

  // ------------------------------------------------------------- public

  /**
   * Verify a document by its QR token.
   *
   * Unauthenticated by design. Returns 404 for an unknown token and a status
   * object for a known one, including withdrawn documents — a scan of a
   * cancelled invoice must say "cancelled", not "not found".
   */
  @Public()
  @Get('verify/:token')
  @ApiOperation({ summary: 'Verify a document by QR token (public)' })
  async verify(@Param('token') token: string) {
    const view = await this.documents.verifyPublic(token);
    return { found: view !== null, document: view };
  }

  // ------------------------------------------------------------- catalogue

  @Get('catalogue')
  @RequirePermissions('erp.dashboard.read')
  @ApiOperation({ summary: 'The document types this platform can issue' })
  catalogue() {
    return { documents: OFFICIAL_DOCUMENTS };
  }

  // ------------------------------------------------------------- issuing

  @Post('issue')
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.accounting.read',
    'erp.inspection.read',
  )
  @ApiOperation({ summary: 'Issue a financial document from a source record' })
  issue(
    @Body() dto: IssueFinancialDocumentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.documents.issueFinancialDocument(dto.type, dto.sourceId, p, actorFrom(p, req), req);
  }

  @Post('inspections/:sessionId/issue')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.read')
  @ApiOperation({ summary: 'Issue the official report for an approved inspection' })
  issueInspection(
    @Param('sessionId') sessionId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.documents.issueInspectionReport(sessionId, p, actorFrom(p, req), req);
  }

  // ------------------------------------------------------------- reading

  @Get()
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.accounting.read',
    'erp.inspection.read',
  )
  @ApiOperation({ summary: 'Issued documents for a source record' })
  list(
    @Query('sourceType') sourceType: string,
    @Query('sourceId') sourceId: string,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    return this.documents.listForSource(sourceType, sourceId, p);
  }

  /**
   * The company's document register.
   *
   * Every document the tenant has issued, searchable by number, filterable by
   * type and status. Scoped to the caller's company by `resolveCompanyScope`, so
   * the register can never show another tenant's documents.
   *
   * Declared before `:id` so `register` is not captured as a document id.
   */
  @Get('register')
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.accounting.read',
    'erp.inspection.read',
  )
  @ApiOperation({ summary: 'The tenant document register, searchable and filterable' })
  async register(
    @CurrentPrincipal() p: RequestPrincipal,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const { companyId } = await this.context.resolveCompanyScope(p);
    return this.documents.listForCompany(companyId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
      search,
      type,
      status,
      sourceType,
    });
  }

  @Get(':id')
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.accounting.read',
    'erp.inspection.read',
  )
  @ApiOperation({ summary: 'One issued document with its audit trail' })
  get(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.documents.get(id, p);
  }

  /**
   * The stored PDF.
   *
   * Served inline so a browser opens the report rather than downloading it, with
   * a `no-store` cache: a document may be revoked, and a cached copy would keep
   * showing as valid.
   */
  @Get(':id/file')
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.accounting.read',
    'erp.inspection.read',
  )
  @ApiOperation({ summary: 'Download the stored PDF' })
  async file(
    @Param('id') id: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
    @Res() res: Response,
  ) {
    const { bytes, filename, contentType } = await this.documents.download(
      id,
      p,
      actorFrom(p, req),
      req,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(bytes);
  }

  // ------------------------------------------------------------- withdrawing

  @Post(':id/revoke')
  @RequireAnyPermission(
    'erp.sales.read',
    'erp.purchasing.read',
    'erp.accounting.read',
    'erp.inspection.read',
  )
  @ApiOperation({ summary: 'Revoke a document so a scan reports it as withdrawn' })
  revoke(
    @Param('id') id: string,
    @Body() dto: RevokeDocumentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.documents.revoke(id, dto.reason, p, actorFrom(p, req), req);
  }
}
