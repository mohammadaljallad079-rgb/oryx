import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { CmsModule } from '../cms/cms.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ProductImageService } from './product-image.service';

@Module({
  imports: [ErpCommonModule, CmsModule],
  controllers: [InventoryController],
  providers: [InventoryService, ProductImageService],
  exports: [InventoryService, ProductImageService],
})
export class InventoryModule {}
