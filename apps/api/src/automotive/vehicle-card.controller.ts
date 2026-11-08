import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { RequireModule, RequirePermissions } from '../auth/auth.decorators';
import { VehicleCardOcrService } from './vehicle-card-ocr.service';

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Vehicle registration card reader.
 *
 * The endpoint takes a photo of a card and returns the fields it could read,
 * plus a list of the fields it could not. It never writes anything: the intake
 * screen shows the result for a human to confirm or correct before saving.
 */
@ApiTags('automotive')
@ApiBearerAuth()
@Controller('automotive')
export class VehicleCardController {
  constructor(private readonly ocr: VehicleCardOcrService) {}

  @Post('vehicle-card/read')
  @RequireModule('automotive_inspections')
  @RequirePermissions('erp.vehicle.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Read a Bahraini vehicle registration card photo (Arabic + English)' })
  read(@UploadedFile() file: UploadedFileLike) {
    return this.ocr.readCard(file);
  }
}
