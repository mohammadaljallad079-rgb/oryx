import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequireModule,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { actorFrom } from '../common/erp-context.service';
import { InspectionService } from './inspection.service';
import {
  CreateAttachmentDto,
  CreateDiagnosticEntryDto,
  CreateInspectionSessionDto,
  InspectionListQueryDto,
  ReviewInspectionDto,
  SaveBodyMarkersDto,
  SaveChassisRegionsDto,
  SaveInspectionSectionDto,
  UpdateInspectionSessionDto,
} from './inspection.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The inspection-engine routes.
 *
 * Every route is behind `automotive_inspections`, so a tenant that does not
 * license the module cannot reach any of them. Reads accept either inspection
 * permission; every write requires `erp.inspection.write`, except review, which
 * requires the separate approval permission — an inspector must not be able to
 * approve their own work by virtue of being able to edit it.
 */
@ApiTags('inspection-engine')
@ApiBearerAuth()
@Controller('automotive/inspections')
export class InspectionController {
  constructor(private readonly inspections: InspectionService) {}

  @Get()
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.inspection.read', 'erp.inspection.write')
  @ApiOperation({ summary: 'List inspection jobs' })
  list(@Query() query: InspectionListQueryDto, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inspections.list(query, p);
  }

  @Post()
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Create an inspection for the selected types' })
  create(@Body() dto: CreateInspectionSessionDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inspections.create(dto, p, actorFrom(p, req));
  }

  @Get(':id')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.inspection.read', 'erp.inspection.write')
  @ApiOperation({ summary: 'Inspection detail with every selected section' })
  get(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inspections.get(id, p);
  }

  @Patch(':id')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Correct the identification header or the selected types' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInspectionSessionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.update(id, dto, p, actorFrom(p, req));
  }

  @Get(':id/progress')
  @RequireModule('automotive_inspections')
  @RequireAnyPermission('erp.inspection.read', 'erp.inspection.write')
  @ApiOperation({ summary: 'Completion state of the selected sections' })
  progress(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal) {
    return this.inspections.progress(id, p);
  }

  @Put(':id/sections/:area')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Save one section: item results and remarks' })
  saveSection(
    @Param('id') id: string,
    @Param('area') area: string,
    @Body() dto: SaveInspectionSectionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.saveSection(id, area, dto, p, actorFrom(p, req));
  }

  @Put(':id/paint-markers')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Replace the body-diagram markers (normalised coordinates)' })
  saveMarkers(
    @Param('id') id: string,
    @Body() dto: SaveBodyMarkersDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.saveBodyMarkers(id, dto.markers, p, actorFrom(p, req));
  }

  @Put(':id/chassis-regions')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Replace the eight chassis region assessments' })
  saveRegions(
    @Param('id') id: string,
    @Body() dto: SaveChassisRegionsDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.saveChassisRegions(id, dto.regions, p, actorFrom(p, req));
  }

  @Post(':id/diagnostics')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Record a computer-unit diagnostic entry' })
  addDiagnostic(
    @Param('id') id: string,
    @Body() dto: CreateDiagnosticEntryDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.addDiagnostic(id, dto, p, actorFrom(p, req));
  }

  @Delete(':id/diagnostics/:entryId')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Remove a diagnostic entry' })
  removeDiagnostic(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.removeDiagnostic(id, entryId, p, actorFrom(p, req));
  }

  @Post(':id/attachments')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a photograph or document to the inspection' })
  addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreateAttachmentDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'media.file_required', message: 'No file was uploaded.' });
    }
    return this.inspections.addAttachment(id, file, dto, p, actorFrom(p, req));
  }

  @Delete(':id/attachments/:attachmentId')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Remove an attachment' })
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.removeAttachment(id, attachmentId, p, actorFrom(p, req));
  }

  @Post(':id/submit')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Submit the inspection for approval' })
  submit(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inspections.submit(id, p, actorFrom(p, req));
  }

  @Post(':id/review')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.report.approve')
  @ApiOperation({ summary: 'Approve or return a submitted inspection' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewInspectionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.inspections.review(id, dto, p, actorFrom(p, req));
  }

  @Post(':id/cancel')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Cancel an inspection that has not been approved' })
  cancel(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inspections.cancel(id, p, actorFrom(p, req));
  }

  @Delete(':id')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.inspection.write')
  @ApiOperation({ summary: 'Permanently delete an inspection that has not been approved' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.inspections.delete(id, p, actorFrom(p, req));
  }
}
