import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerInspectionService } from './customer-inspection.service';
import {
  CurrentCustomer,
  CustomerAuthGuard,
  type CustomerPrincipal,
} from './customer-auth.guard';
import { CustomerPlane } from '../auth/auth.decorators';

/**
 * SENSAGE inspection photographs.
 *
 * The account is always resolved from the bearer token via `CurrentCustomer`;
 * no route accepts an account id. A vehicle id supplied with an upload is checked
 * against the account's own garage inside the service, so ownership isolation
 * does not depend on the client being honest.
 */
@ApiTags('customer-inspections')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/inspection-photos')
@UseGuards(CustomerAuthGuard)
export class CustomerInspectionController {
  constructor(private readonly inspections: CustomerInspectionService) {}

  @Get()
  @ApiOperation({ summary: 'List your inspection photos' })
  async list(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.inspections.list(customer.accountId, vehicleId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an inspection photo' })
  async upload(
    @CurrentCustomer() customer: CustomerPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { vehicleId?: string; caption?: string },
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'media.file_required', message: 'No file was uploaded.' });
    }
    return this.inspections.upload(customer.accountId, file, {
      vehicleId: body.vehicleId || undefined,
      caption: body.caption || undefined,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove one of your inspection photos' })
  async remove(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.inspections.remove(customer.accountId, id);
  }
}
