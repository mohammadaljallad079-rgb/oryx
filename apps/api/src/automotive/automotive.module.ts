import { Module } from '@nestjs/common';
import { ErpCommonModule } from '../common/erp-common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesModule } from '../sales/sales.module';
import { VehicleController } from './vehicle.controller';
import { WorkshopController } from './workshop.controller';
import { VehicleService } from './vehicle.service';
import { WorkshopService } from './workshop.service';

/**
 * Automotive services. The workshop and inspection modules reuse the shared
 * inventory ledger and the sales invoicing path, so there is one stock ledger
 * and one accounting system across the platform.
 */
@Module({
  imports: [ErpCommonModule, InventoryModule, SalesModule],
  controllers: [VehicleController, WorkshopController],
  providers: [VehicleService, WorkshopService],
  exports: [VehicleService, WorkshopService],
})
export class AutomotiveModule {}
