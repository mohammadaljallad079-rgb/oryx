import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesModule } from '../sales/sales.module';
import { CmsModule } from '../cms/cms.module';
import { VehicleController } from './vehicle.controller';
import { WorkshopController } from './workshop.controller';
import { InspectionController } from './inspection.controller';
import { VehicleService } from './vehicle.service';
import { WorkshopService } from './workshop.service';
import { InspectionService } from './inspection.service';

/**
 * Automotive services. The workshop and inspection modules reuse the shared
 * inventory ledger and the sales invoicing path, so there is one stock ledger
 * and one accounting system across the platform.
 *
 * `CmsModule` is imported for `MediaStorageService`, which the inspection
 * attachments use: there is one media store, and it re-encodes every upload.
 */
@Module({
  imports: [ErpCommonModule, InventoryModule, SalesModule, CmsModule],
  controllers: [VehicleController, WorkshopController, InspectionController],
  providers: [VehicleService, WorkshopService, InspectionService],
  exports: [VehicleService, WorkshopService, InspectionService],
})
export class AutomotiveModule {}
